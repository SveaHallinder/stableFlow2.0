import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, navigatorLock, processLock, type Session, type SupportedStorage } from '@supabase/supabase-js';
import { createTimeoutFetch } from './requestTimeout';

const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ??
    extra.supabaseUrl ??
    extra.EXPO_PUBLIC_SUPABASE_URL ??
    '')?.trim() ?? '';
const supabaseAnonKey =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    extra.supabaseAnonKey ??
    extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    '')?.trim() ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  if (__DEV__) {
    console.error(
      'KRITISK: Supabase-konfiguration saknas. Kontrollera EXPO_PUBLIC_SUPABASE_URL och EXPO_PUBLIC_SUPABASE_ANON_KEY i .env.',
    );
  }
}

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
};

const secureStore = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Keep the SDK's existing per-project key and browser memory fallback.
export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
function browserStorage(): SupportedStorage {
  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && globalThis.localStorage) {
      const probe = `lswt-${Math.random()}${Math.random()}`;
      globalThis.localStorage.setItem(probe, probe);
      globalThis.localStorage.removeItem(probe);
      return globalThis.localStorage;
    }
  } catch { /* Same in-memory fallback as the Auth SDK. */ }
  const memory = new Map<string, string>();
  return {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: key => { memory.delete(key); },
  };
}
const backingAuthStorage = Platform.OS === 'web' ? browserStorage() : secureStore;
const deletedAccountIds = new Set<string>();
const pendingStorageOperations = new Set<Promise<unknown>>();
let storageCleanupTimedOut = false;
const selectedSessionLock = Platform.OS === 'web' && globalThis.navigator?.locks ? navigatorLock : processLock;
const storageLockName = `account-storage:${authStorageKey}`;
async function withSessionLock<T>(name: string, operation: () => Promise<T>, acquireTimeout = -1): Promise<T> {
  const result = await selectedSessionLock(name, acquireTimeout, async () => {
    try { return { ok: true as const, value: await operation() }; }
    catch (error) { return { ok: false as const, error }; }
  });
  if (!result.ok) throw result.error;
  return result.value;
}
function storageOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  const pending = Promise.resolve().then(operation);
  pendingStorageOperations.add(pending);
  void pending.then(() => pendingStorageOperations.delete(pending), () => pendingStorageOperations.delete(pending));
  return pending;
}
function assertStorageAvailable(): void {
  if (storageCleanupTimedOut && pendingStorageOperations.size) {
    throw new Error('Account session storage is still busy. Retry after it responds or restart the app.');
  }
  storageCleanupTimedOut = false;
}
function storedUserId(key: string, value: string | null): string | null {
  if (!value || (key !== authStorageKey && key !== `${authStorageKey}-user`)) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.user?.id === 'string' ? parsed.user.id : null;
  } catch { return null; }
}
export const authStorage: SupportedStorage = {
  getItem: async key => {
    assertStorageAvailable();
    const value = await storageOperation(() => backingAuthStorage.getItem(key));
    const id = storedUserId(key, value);
    return id && deletedAccountIds.has(id) ? null : value;
  },
  setItem: async (key, value) => {
    const id = storedUserId(key, value);
    if (id && deletedAccountIds.has(id)) return;
    assertStorageAvailable();
    await withSessionLock(storageLockName, async () => {
      assertStorageAvailable();
      if (id && deletedAccountIds.has(id)) return;
      await storageOperation(() => backingAuthStorage.setItem(key, value));
    });
  },
  removeItem: async key => {
    assertStorageAvailable();
    await withSessionLock(storageLockName, async () => {
      assertStorageAvailable();
      await storageOperation(() => backingAuthStorage.removeItem(key));
    });
  },
};

// Only call after the server has explicitly confirmed this account's deletion.
// The adapter rejects late refresh writes for this UID, while another account
// may still sign in normally once this cleanup has settled.
export function markDeletedAccountSession(userId: string): void {
  if (!userId) throw new Error('The deleted account could not be identified.');
  deletedAccountIds.add(userId);
}
export async function clearDeletedAccountSession(userId: string): Promise<boolean> {
  markDeletedAccountSession(userId);
  let expired = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const checkAttempt = () => {
    if (expired) throw new Error('Account session cleanup timed out.');
    assertStorageAvailable();
  };
  checkAttempt();
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      expired = true;
      storageCleanupTimedOut = true;
      reject(new Error('Account session cleanup timed out.'));
    }, 10_000);
  });
  // SDK operations acquire auth before storage. Password login writes also use
  // the storage lock because the SDK does not take its auth lock for that path.
  const work = withSessionLock(`lock:${authStorageKey}`, async () => {
    checkAttempt();
    const storageWork = withSessionLock(storageLockName, async () => {
      checkAttempt();
      const value = await storageOperation(() => backingAuthStorage.getItem(authStorageKey));
      checkAttempt();
      const id = storedUserId(authStorageKey, value);
      if (id && id !== userId) return false;
      if (value && !id) throw new Error('The stored account could not be verified.');
      const cachedUser = await storageOperation(() => backingAuthStorage.getItem(`${authStorageKey}-user`));
      checkAttempt();
      const cachedId = storedUserId(`${authStorageKey}-user`, cachedUser);
      if (cachedId && cachedId !== userId) return false;
      if (cachedUser && !cachedId) throw new Error('The cached account could not be verified.');
      const keys = [authStorageKey, `${authStorageKey}-user`, `${authStorageKey}-code-verifier`];
      for (const key of keys) {
        checkAttempt();
        await storageOperation(() => backingAuthStorage.removeItem(key));
      }
      for (const key of keys) {
        checkAttempt();
        const remaining = await storageOperation(() => backingAuthStorage.getItem(key));
        checkAttempt();
        if (remaining !== null) {
          throw new Error('The local session cleanup could not be verified.');
        }
      }
      return true;
    });
    // Release auth on timeout; keep a physical storage operation serialized
    // until it responds, and stop its remaining removals via checkAttempt.
    return Promise.race([storageWork, deadline]);
  });
  try { return await Promise.race([work, deadline]); }
  finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createTimeoutFetch((input, init) => fetch(input, init)) },
  auth: {
    storage: authStorage,
    storageKey: authStorageKey,
    lock: (name, acquireTimeout, operation) => withSessionLock(name, operation, acquireTimeout),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// The web SDK consumes recovery tokens before the reset screen can mount.
// Keep only an in-memory proof from its verified event, bound to this session.
let passwordRecoverySession: { userId: string; accessToken: string } | null = null;
const passwordRecoverySubscribers = new Set<() => void>();
let passwordRecoveryAttempt = 0;
export function hasPasswordRecoverySession(session: Session | null): boolean {
  return Boolean(session && !deletedAccountIds.has(session.user.id)
    && passwordRecoverySession?.userId === session.user.id
    && passwordRecoverySession.accessToken === session.access_token);
}
export function subscribePasswordRecovery(listener: () => void): () => void {
  passwordRecoverySubscribers.add(listener);
  return () => { passwordRecoverySubscribers.delete(listener); };
}
function consumePasswordRecoverySession(session: Session): void {
  if (passwordRecoverySession?.userId !== session.user.id || passwordRecoverySession.accessToken !== session.access_token) return;
  passwordRecoverySession = null;
  passwordRecoverySubscribers.forEach(listener => listener());
}
function createRecoveryClient() {
  const values = new Map<string, string>();
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: createTimeoutFetch((input, init) => fetch(input, init)) },
    auth: {
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
      },
      storageKey: `${authStorageKey}-recovery-${++passwordRecoveryAttempt}`,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
export async function verifyRecoverySession(tokens: { access_token: string; refresh_token: string }): Promise<Session> {
  const client = createRecoveryClient();
  try {
    const { data, error } = await client.auth.setSession(tokens);
    if (error) throw error;
    if (!data.session || deletedAccountIds.has(data.session.user.id)) throw new Error('The recovery session could not be verified.');
    return data.session;
  } finally {
    await client.auth.stopAutoRefresh();
  }
}
export async function updateRecoveryPassword(session: Session, password: string): Promise<void> {
  if (deletedAccountIds.has(session.user.id)) throw new Error('The recovery account is no longer available.');
  const client = createRecoveryClient();
  try {
    const { data, error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    if (data.session?.user.id !== session.user.id || deletedAccountIds.has(session.user.id)) {
      throw new Error('The recovery session could not be verified for this account.');
    }
    const { data: updated, error: updateError } = await client.auth.updateUser({ password });
    if (updateError) throw updateError;
    if (updated.user?.id !== session.user.id) throw new Error('The password update could not be confirmed for this account.');
    consumePasswordRecoverySession(session);
  } finally {
    await client.auth.stopAutoRefresh();
  }
}
supabase.auth.onAuthStateChange((event, session) => {
  if (session && deletedAccountIds.has(session.user.id)) return;
  const previous = passwordRecoverySession;
  if (event === 'PASSWORD_RECOVERY' && session) {
    passwordRecoverySession = { userId: session.user.id, accessToken: session.access_token };
  } else if (event === 'TOKEN_REFRESHED' && session && passwordRecoverySession?.userId === session.user.id) {
    passwordRecoverySession = { userId: session.user.id, accessToken: session.access_token };
  } else if ((event === 'SIGNED_IN' && (session?.user.id !== passwordRecoverySession?.userId || session?.access_token !== passwordRecoverySession?.accessToken))
    || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    passwordRecoverySession = null;
  }
  if (previous?.userId !== passwordRecoverySession?.userId || previous?.accessToken !== passwordRecoverySession?.accessToken) {
    passwordRecoverySubscribers.forEach(listener => listener());
  }
});
