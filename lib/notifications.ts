import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Standard',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3E9B5F',
  });
}

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) {
    console.warn('Push-notiser fungerar inte i simulator');
    return false;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPermissionStatus(): Promise<string> {
  if (Platform.OS === 'web') return 'unavailable';
  if (!Device.isDevice) return 'simulator';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenData.data;
  } catch (error) {
    console.warn('[push notification] Kunde inte hämta push-token', error instanceof Error ? 'Error' : 'Unknown');
    return null;
  }
}

type PushRegistrationSnapshot = {
  token: string;
  userId: string;
  tokenId: string;
  registrationGeneration: string;
  bindingGeneration: string;
};

const pushRegistrations = new Map<string, PushRegistrationSnapshot>();
const pushUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function pushObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function pushAcknowledgement(response: { data: unknown; error: unknown; status: number }): Record<string, unknown> {
  const data = pushObject(response.data);
  if (response.error !== null || !Number.isInteger(response.status) || response.status < 200
    || response.status >= 300 || !data) throw new Error('Push ownership acknowledgement is unverified');
  return data;
}

async function withPushDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Push ownership operation timed out'));
      }, milliseconds);
    })]);
  } finally {
    clearTimeout(timer!);
  }
}

async function pushAccountMatches(userId: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false;
  const { data, error } = await supabase.auth.getSession();
  return isCurrent() && error === null && data.session?.user?.id === userId;
}

export async function registerPushToken(userId: string, isCurrent: () => boolean = () => true): Promise<boolean> {
  try {
    return await withPushDeadline(async signal => {
      const current = () => !signal.aborted && isCurrent();
      if (!pushUuid(userId) || !current()) return false;
      const token = await getExpoPushToken();
      if (!token || !current() || !await pushAccountMatches(userId, current)) return false;
      const state = pushAcknowledgement(await supabase.rpc('push_device_state', {
        p_token: token, p_expected_user_id: userId,
      }).abortSignal(signal));
      if (!current() || !await pushAccountMatches(userId, current)) return false;
      if (!pushUuid(state.binding_generation)) throw new Error('Push binding state is unverified');
      const claimed = pushAcknowledgement(await supabase.rpc('push_device_claim', {
        p_token: token, p_platform: Platform.OS,
        p_expected_binding_generation: state.binding_generation, p_expected_user_id: userId,
      }).abortSignal(signal));
      if (!current() || !await pushAccountMatches(userId, current)) return false;
      if (claimed.user_id !== userId || !pushUuid(claimed.token_id)
        || !pushUuid(claimed.registration_generation) || !pushUuid(claimed.binding_generation)
        || claimed.binding_generation === state.binding_generation) {
        throw new Error('Push binding claim is unverified');
      }
      pushRegistrations.set(userId, {
        token, userId, tokenId: claimed.token_id,
        registrationGeneration: claimed.registration_generation, bindingGeneration: claimed.binding_generation,
      });
      return true;
    });
  } catch {
    console.warn('[push registration] Kunde inte registrera enheten', 'registration_failed');
    return false;
  }
}

export async function deregisterPushToken(userId: string, isCurrent: () => boolean = () => true): Promise<void> {
  // Capture this device's registration before session verification can yield.
  const cachedRegistration = pushRegistrations.get(userId);
  const capturedRegistration = cachedRegistration ? { ...cachedRegistration } : undefined;
  try {
    // Cleanup is bounded and best-effort; it never prevents local logout.
    await withPushDeadline(async signal => {
      const current = () => !signal.aborted && isCurrent();
      if (!pushUuid(userId) || !await pushAccountMatches(userId, current)) return;
      let snapshot = capturedRegistration;
      if (!snapshot) {
        const token = await getExpoPushToken();
        if (!token || !current() || !await pushAccountMatches(userId, current)) {
          throw new Error('Push cleanup token is unverified');
        }
        const row = await supabase.from('push_tokens').select('id,user_id,registration_generation')
          .eq('user_id', userId).eq('token', token).abortSignal(signal).maybeSingle();
        if (!current() || !await pushAccountMatches(userId, current)) return;
        if (row.error !== null || (row.data !== null && (!pushUuid(row.data.id)
          || row.data.user_id !== userId || !pushUuid(row.data.registration_generation)))) {
          throw new Error('Push cleanup registration is unverified');
        }
        if (row.data === null) return;
        const state = pushAcknowledgement(await supabase.rpc('push_device_state', {
          p_token: token, p_expected_user_id: userId,
        }).abortSignal(signal));
        if (!current() || !await pushAccountMatches(userId, current)) return;
        if (!pushUuid(state.binding_generation)) throw new Error('Push cleanup binding is unverified');
        snapshot = { token, userId, tokenId: row.data.id, registrationGeneration: row.data.registration_generation,
          bindingGeneration: state.binding_generation };
      }
      if (!current() || !await pushAccountMatches(userId, current)) return;
      const released = pushAcknowledgement(await supabase.rpc('push_device_release', {
        p_token: snapshot.token, p_token_id: snapshot.tokenId,
        p_registration_generation: snapshot.registrationGeneration,
        p_binding_generation: snapshot.bindingGeneration, p_expected_user_id: userId,
      }).abortSignal(signal));
      if (!current() || !await pushAccountMatches(userId, current)) return;
      if (released.user_id !== userId || typeof released.released !== 'boolean' || !released.released) {
        throw new Error('Push cleanup acknowledgement is unverified');
      }
      if (cachedRegistration && pushRegistrations.get(userId) === cachedRegistration) pushRegistrations.delete(userId);
    }, 5000);
  } catch {
    console.warn('[push registration] Kunde inte bekräfta enhetens avregistrering', 'release_unconfirmed');
  }
}
