import { Platform } from 'react-native';
import { createURL } from 'expo-linking';

/**
 * Redirect URL for Supabase email flows (confirmation, password reset, email
 * change).
 *
 * Native uses Expo's URL builder so Expo Go returns to the running project and
 * installed builds use their registered custom scheme.
 * On web a custom scheme (stableflow://) cannot be opened by a desktop browser,
 * which strands the user — so web must use the deployed https origin, landing on
 * the matching /confirm or /reset route where detectSessionInUrl completes the
 * flow.
 */
export function authRedirectUrl(path: 'confirm' | 'reset'): string {
  if (
    Platform.OS === 'web' &&
    typeof globalThis !== 'undefined' &&
    globalThis.location?.origin
  ) {
    return `${globalThis.location.origin}/${path}`;
  }
  return createURL(path);
}
