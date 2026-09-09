import type { Session, User } from '@supabase/supabase-js';

export const QA_DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const QA_DEMO_MEMBER_ID = '00000000-0000-4000-8000-000000000002';

function hasQaDemoQueryParam() {
  if (typeof globalThis.location === 'undefined') {
    return false;
  }

  return new URLSearchParams(globalThis.location.search).get('qaDemo') === '1';
}

export const isQaDemoMode =
  __DEV__ && (process.env.EXPO_PUBLIC_QA_DEMO_MODE === '1' || hasQaDemoQueryParam());

export function createQaDemoUser(): User {
  const now = new Date().toISOString();

  return {
    id: QA_DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'qa-admin@example.com',
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      username: 'QA Admin',
      full_name: 'QA Admin',
    },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
}

export function createQaDemoSession(): Session {
  const user = createQaDemoUser();

  return {
    access_token: 'qa-demo-access-token',
    refresh_token: 'qa-demo-refresh-token',
    expires_in: 60 * 60,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    token_type: 'bearer',
    user,
  } as Session;
}
