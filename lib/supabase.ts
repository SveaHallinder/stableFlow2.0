import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

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
  console.warn('Supabase env saknas. Kontrollera EXPO_PUBLIC_SUPABASE_URL och EXPO_PUBLIC_SUPABASE_ANON_KEY.');
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
