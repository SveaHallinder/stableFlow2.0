import { supabase } from '@/lib/supabase';

export const MAX_STABLE_INVITES = 50;

export type StableInvite = {
  id: string;
  stable_id: string;
  email: string;
  role: string;
  custom_role: string | null;
  created_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
};

export type StableInviteListResult = { invites: StableInvite[]; truncated: boolean };

export function stableInviteStatus(invite: StableInvite, now = Date.now()) {
  if (invite.accepted_at) return 'Accepterad';
  if (invite.expires_at && Date.parse(invite.expires_at) <= now) return 'Utgången';
  return 'Väntande';
}

export async function fetchStableInvites(stableId: string, signal: AbortSignal): Promise<StableInviteListResult> {
  if (!stableId) throw new Error('Stall saknas.');
  const { data, error } = await supabase
    .from('stable_invites')
    .select('id,stable_id,email,role,custom_role,created_at,expires_at,accepted_at')
    .eq('stable_id', stableId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(MAX_STABLE_INVITES + 1)
    .abortSignal(signal);
  if (error || !Array.isArray(data) || data.some((invite) => invite.stable_id !== stableId)) {
    throw new Error('Inbjudningarna kunde inte läsas.');
  }
  return { invites: data.slice(0, MAX_STABLE_INVITES), truncated: data.length > MAX_STABLE_INVITES };
}

export function demoStableInvites(stableId: string): StableInviteListResult {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const base = { stable_id: stableId, custom_role: null, created_at: new Date(now - day).toISOString() };
  return {
    invites: [
      { ...base, id: 'demo-pending', email: 'vantande@example.test', role: 'rider', accepted_at: null, expires_at: new Date(now + day).toISOString() },
      { ...base, id: 'demo-accepted', email: 'accepterad@example.test', role: 'staff', accepted_at: new Date(now - day).toISOString(), expires_at: new Date(now - day).toISOString() },
      { ...base, id: 'demo-expired', email: 'utgangen@example.test', role: 'trainer', accepted_at: null, expires_at: new Date(now - day).toISOString() },
    ],
    truncated: false,
  };
}
