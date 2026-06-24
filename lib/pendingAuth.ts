import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PENDING_JOIN_CODE_KEY = 'pending_join_code';
const PENDING_OWNER_STABLE_KEY = 'pending_owner_stable';

// Platform-aware storage. expo-secure-store's web shim has no working storage,
// so on web SecureStore.setItemAsync throws and every pending-auth write fails —
// which previously aborted owner signup on web before supabase.auth.signUp ran.
// These values (join code, pending stable name/email/id) are not secrets, so
// localStorage is an acceptable web backing store.
const isWeb = Platform.OS === 'web';

async function storageSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function storageGet(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function storageDelete(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function savePendingJoinCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  try {
    await storageSet(PENDING_JOIN_CODE_KEY, trimmed);
  } catch {
    return;
  }
}

export async function loadPendingJoinCode(): Promise<string | null> {
  try {
    const stored = await storageGet(PENDING_JOIN_CODE_KEY);
    const trimmed = stored?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function clearPendingJoinCode() {
  try {
    await storageDelete(PENDING_JOIN_CODE_KEY);
  } catch {
    return;
  }
}

export type PendingOwnerStable = {
  id: string;
  name: string;
  // Email the stable was requested under. Binds the pending stable to one account
  // so an abandoned signup can't be claimed by a different user on the same device.
  email: string;
};

// Returns true only if the pending stable was durably stored. Callers must abort
// signup on false, otherwise an account can be created with no stable to claim.
export async function savePendingOwnerStable(input: PendingOwnerStable): Promise<boolean> {
  const id = input.id.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!id || !name || !email) {
    return false;
  }
  try {
    await storageSet(PENDING_OWNER_STABLE_KEY, JSON.stringify({ id, name, email }));
    return true;
  } catch {
    return false;
  }
}

export async function loadPendingOwnerStable(): Promise<PendingOwnerStable | null> {
  try {
    const stored = await storageGet(PENDING_OWNER_STABLE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as Partial<PendingOwnerStable> | null;
    const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    const email = typeof parsed?.email === 'string' ? parsed.email.trim().toLowerCase() : '';
    if (!id || !name || !email) {
      return null;
    }
    return { id, name, email };
  } catch {
    return null;
  }
}

export async function clearPendingOwnerStable() {
  try {
    await storageDelete(PENDING_OWNER_STABLE_KEY);
  } catch {
    return;
  }
}
