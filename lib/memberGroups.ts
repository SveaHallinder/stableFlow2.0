import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatKind = 'stable' | 'direct' | 'custom';
export type ChatMemberRole = 'owner' | 'member';
export type MemberGroupReceipt = {
  id: string;
  chatKind: 'custom';
  stableId: string;
  title: string;
  participantIds: string[];
  participantRoles: Record<string, ChatMemberRole>;
  createdByUserId: string | null;
};
export type CreateMemberGroupInput = { requestId: string; stableId: string; title: string; participantIds: string[] };
export type ManageMemberGroupInput = { conversationId: string; title?: string; addUserIds?: string[]; removeUserIds?: string[]; transferOwnerTo?: string };
export type LeaveMemberGroupInput = { conversationId: string; transferOwnerTo?: string; confirmDelete?: boolean };
export type LeaveMemberGroupReceipt = { conversationId: string; left: true; deleted: boolean };

// Old deployments do not return this column. An unknown value from a newer
// deployment must never acquire the wider stable-chat permissions.
export function resolveChatKind(row: { chat_kind?: unknown; is_group?: boolean | null }): ChatKind | undefined {
  if (!Object.prototype.hasOwnProperty.call(row, 'chat_kind')) return row.is_group ? 'stable' : 'direct';
  return row.chat_kind === 'stable' || row.chat_kind === 'direct' || row.chat_kind === 'custom' ? row.chat_kind : undefined;
}

export function isMissingChatKindColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && ['42703', 'PGRST204'].includes(error.code ?? '') && /\bchat_kind\b/.test(error.message ?? ''));
}

export function hasCustomChatAccess(
  preview: { stableId?: string; participantIds?: string[] },
  state: { currentUserId: string; currentStableId: string; users: Record<string, { membership: { stableId: string }[] }> },
) {
  return Boolean(preview.stableId && preview.stableId === state.currentStableId
    && preview.participantIds?.includes(state.currentUserId)
    && state.users[state.currentUserId]?.membership?.some(entry => entry.stableId === preview.stableId));
}

export function parseMemberGroupReceipt(value: unknown, userId: string, stableId: string, conversationId?: string): MemberGroupReceipt | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as MemberGroupReceipt;
  if (row.chatKind !== 'custom' || typeof row.id !== 'string' || !row.id || (conversationId && row.id !== conversationId)
    || row.stableId !== stableId || typeof row.title !== 'string' || row.title.trim().length < 2 || row.title.length > 80
    || !Object.prototype.hasOwnProperty.call(row, 'createdByUserId')
    || (row.createdByUserId !== null && (typeof row.createdByUserId !== 'string' || !row.createdByUserId))
    || !Array.isArray(row.participantIds) || !row.participantIds.length || row.participantIds.length > 50
    || row.participantIds.some(id => typeof id !== 'string' || !id) || new Set(row.participantIds).size !== row.participantIds.length
    || !row.participantIds.includes(userId) || !row.participantRoles || typeof row.participantRoles !== 'object'
    || Object.keys(row.participantRoles).length !== row.participantIds.length
    || row.participantIds.some(id => !['owner', 'member'].includes(row.participantRoles[id]))
    || Object.values(row.participantRoles).filter(role => role === 'owner').length !== 1) return;
  return row;
}

export async function requestMemberGroup(
  client: SupabaseClient,
  endpoint: 'create_member_group' | 'manage_member_group' | 'leave_member_group',
  params: Record<string, unknown>,
): Promise<{ success: true; data: unknown } | { success: false; reason: string; requiresDeletionConfirmation?: boolean }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const failure = 'Gruppändringen kunde inte bekräftas. Dina uppgifter finns kvar. Försök igen.';
  try {
    return await Promise.race([
      (async () => {
        try {
          const { data, error } = await client.rpc(endpoint, params).abortSignal(controller.signal);
          if (error || !data) {
            if (endpoint === 'leave_member_group' && error?.code === '40001' && typeof error.details === 'string') {
              let detail: unknown;
              try { detail = JSON.parse(error.details); } catch { /* A generic conflict is not a deletion prompt. */ }
              if (detail && typeof detail === 'object' && Object.keys(detail).length === 1
                && 'requiresDeletionConfirmation' in detail && detail.requiresDeletionConfirmation === true) {
                return { success: false as const, reason: 'Du är nu gruppens sista aktiva medlem. Bekräfta att gruppen och historiken ska raderas.', requiresDeletionConfirmation: true };
              }
            }
            console.warn('[member group] Servern bekräftade inte gruppändringen',
              typeof error?.code === 'string' && /^[A-Z0-9]{5}$|^PGRST\d{3}$/.test(error.code) ? error.code : 'InvalidReceipt');
            return { success: false as const, reason: failure };
          }
          return { success: true as const, data };
        } catch (error) {
          console.warn('[member group] Gruppändringen misslyckades', error instanceof Error ? error.name : 'Unknown');
          return { success: false as const, reason: failure };
        }
      })(),
      new Promise<{ success: false; reason: string }>(resolve => {
        timeout = setTimeout(() => { controller.abort(); resolve({ success: false, reason: failure }); }, 15_000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}

export async function loadMemberGroupAccess(client: SupabaseClient, userId: string, stableId: string, conversationId: string): Promise<
  { success: true; data: MemberGroupReceipt | null } | { success: false; reason: string }
> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const failure = { success: false as const, reason: 'Gruppens åtkomst kunde inte kontrolleras. Uppdatera och försök igen.' };
  try {
    return await Promise.race([
      (async () => {
        try {
          const { data: row, error } = await client.from('conversations').select('*')
            .eq('id', conversationId).abortSignal(controller.signal).maybeSingle();
          if (error) return failure;
          if (!row) return { success: true as const, data: null };
          if (row.id !== conversationId || row.stable_id !== stableId || resolveChatKind(row) !== 'custom') return failure;
          const members = await client.from('conversation_members').select('*').eq('conversation_id', conversationId).abortSignal(controller.signal);
          if (members.error) return failure;
          const participantIds = (members.data ?? []).map(member => member.user_id);
          if (!participantIds.includes(userId)) return { success: true as const, data: null };
          const receipt = parseMemberGroupReceipt({ id: row.id, chatKind: 'custom', stableId: row.stable_id, title: row.title,
            createdByUserId: row.created_by_user_id, participantIds,
            participantRoles: Object.fromEntries((members.data ?? []).map(member => [member.user_id, member.member_role])) }, userId, stableId, conversationId);
          return receipt ? { success: true as const, data: receipt } : failure;
        } catch (error) {
          console.warn('[member group] Åtkomstkontrollen misslyckades', error instanceof Error ? error.name : 'Unknown');
          return failure;
        }
      })(),
      new Promise<typeof failure>(resolve => { timeout = setTimeout(() => { controller.abort(); resolve(failure); }, 15_000); }),
    ]);
  } finally { clearTimeout(timeout); }
}
