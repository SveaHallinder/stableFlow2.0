import { Platform } from 'react-native';

/**
 * Redirect URL for Supabase email flows (confirmation, password reset, email
 * change).
 *
 * Native uses the custom deep-link scheme so the email link reopens the app.
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
  return `stableflow://${path}`;
}
