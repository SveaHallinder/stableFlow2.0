import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatReadReceipt = {
  userId: string;
  conversationId: string;
  readMessageIds: string[];
  unreadMessageIds: string[];
};

type ChatReadResult = { success: true; data: ChatReadReceipt } | { success: false; reason: string };

type ReadPreview = { readMessageIds?: string[]; unreadMessageIds?: string[] };
type PeerMessage = { id: string; authorId: string };
const sortedIds = (ids: readonly string[]) => [...new Set(ids)].sort();
const sameIds = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(sortedIds(left)) === JSON.stringify(sortedIds(right));

export function peerMessageIds(messages: readonly PeerMessage[], userId: string, blockedUserIds: readonly string[]) {
  return sortedIds(messages.filter(message => message.authorId !== userId
    && !blockedUserIds.includes(message.authorId)).map(message => message.id));
}

export function chatUnreadIds(preview: ReadPreview, messages: readonly PeerMessage[], userId: string, blockedUserIds: readonly string[]) {
  const readIds = new Set(preview.readMessageIds ?? []);
  const hiddenIds = new Set(messages.filter(message => message.authorId === userId
    || blockedUserIds.includes(message.authorId)).map(message => message.id));
  return sortedIds([...(preview.unreadMessageIds ?? []), ...peerMessageIds(messages, userId, blockedUserIds)])
    .filter(id => !readIds.has(id) && !hiddenIds.has(id));
}

export function scrollReadViewport(y: number, top: number, height: number, windowHeight: number, clips: readonly { top: number; bottom: number }[] = []) {
  const visibleTop = Math.max(0, top, ...clips.map(clip => clip.top));
  const visibleBottom = Math.min(windowHeight, top + height, ...clips.map(clip => clip.bottom));
  return { y: y + Math.max(0, visibleTop - top), height: Math.max(0, visibleBottom - visibleTop), fullHeight: height };
}

// Layout alone does not acknowledge a row. It must be inside the current scroll
// viewport; a row taller than the viewport must cover the visible area.
export function visibleMessageIds(
  layouts: ReadonlyMap<string, { y: number; height: number }>,
  viewport: { y: number; height: number; fullHeight?: number },
  eligibleIds: readonly string[],
) {
  if (viewport.height <= 0) return [];
  const top = viewport.y, bottom = top + viewport.height;
  return eligibleIds.filter(id => {
    const row = layouts.get(id);
    if (!row || row.height <= 0) return false;
    const rowBottom = row.y + row.height;
    const fullHeight = viewport.fullHeight ?? viewport.height;
    return row.height <= fullHeight
      ? row.y >= top - 1 && rowBottom <= bottom + 1
      : viewport.height >= fullHeight && row.y <= top && rowBottom >= bottom;
  }).sort();
}

export async function requestChatReadReceipt(
  client: SupabaseClient,
  mode: 'load' | 'mark',
  userId: string,
  conversationId: string,
  messageIds: readonly string[],
): Promise<ChatReadResult> {
  const ids = sortedIds(messageIds);
  const failure = mode === 'mark'
    ? 'Läskvittensen kunde inte bekräftas. Olästmarkeringen finns kvar här. Försök igen.'
    : 'Kunde inte kontrollera oläststatus. Uppdatera och försök igen.';
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async (): Promise<ChatReadResult> => {
      try {
        const { data, error } = await client.rpc(mode === 'mark' ? 'mark_chat_messages_read' : 'own_chat_read_state', {
          expected_user_id: userId,
          target_conversation_id: conversationId,
          message_ids: ids,
        }).abortSignal(controller.signal);
        const strings = (value: unknown): value is string[] => Array.isArray(value)
          && value.every(id => typeof id === 'string') && new Set(value).size === value.length;
        if (error || !data || data.user_id !== userId || data.conversation_id !== conversationId
          || data.complete !== true || !strings(data.requested_message_ids)
          || !sameIds(data.requested_message_ids, ids) || !strings(data.read_message_ids)
          || !strings(data.known_read_message_ids) || !strings(data.unread_message_ids)
          || data.read_message_ids.some((id: string) => !ids.includes(id) || !data.known_read_message_ids.includes(id))
          || data.known_read_message_ids.some((id: string) => data.unread_message_ids.includes(id))
          || (mode === 'mark' && !sameIds(data.read_message_ids, ids))) {
          console.warn('[chat read] Kvittensen kunde inte verifieras',
            typeof error?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code) ? error.code : 'InvalidReceipt');
          return { success: false, reason: failure };
        }
        return { success: true, data: {
          userId, conversationId,
          readMessageIds: sortedIds(data.known_read_message_ids),
          unreadMessageIds: sortedIds(data.unread_message_ids),
        } };
      } catch (error) {
        console.warn('[chat read] Kvittensen kunde inte hämtas', error instanceof Error ? error.name : 'Unknown');
        return { success: false, reason: failure };
      }
    })();
    return await Promise.race([work, new Promise<ChatReadResult>((resolve) => {
      timeout = setTimeout(() => {
        console.warn('[chat read] Kvittensen hann inte bekräftas', 'Timeout');
        resolve({ success: false, reason: failure });
        controller.abort();
      }, 15_000);
    })]);
  } finally {
    clearTimeout(timeout);
  }
}
