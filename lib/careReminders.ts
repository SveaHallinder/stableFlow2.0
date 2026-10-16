import type { CareEvent } from '@/context/AppDataContext';
import { isValidISODate } from '@/lib/dateValidation';
import { supabase } from '@/lib/supabase';

export type CareReminderAnchor = Pick<CareEvent, 'id' | 'stableId' | 'horseIds' | 'title' | 'date' | 'status'> & { revision: string };

export type CareReminderScope = {
  accountId: string;
  sessionEpoch: number;
  stableId: string;
  horseId: string;
};

export type CareReminderRecipient = { id: string; name: string; stableId: string };

export type CareReminderDraft = {
  nextDate: string;
  recipientUserIds: string[];
};

export type CareReminderPlan = CareReminderScope & {
  requestId: string;
  careEventId: string;
  sourceEventDate: string;
  nextDate: string;
  sourceEventRevision: string;
  expectedRevision: string | null;
  reminderDate: string;
  recipientUserIds: string[];
};

export type CareReminderSaveResult =
  | { success: true; data: CareReminderPlan }
  | { success: false; outcome: 'rejected' | 'uncertain' };

export function emptyCareReminderDraft(): CareReminderDraft {
  return { nextDate: '', recipientUserIds: [] };
}

export function careReminderScopeKey(scope: CareReminderScope, event: CareReminderAnchor | null, canEdit: boolean): string {
  return JSON.stringify([scope.accountId, scope.sessionEpoch, scope.stableId, scope.horseId,
    event?.id, event?.revision, event?.date, event?.status, event?.horseIds, canEdit]);
}

export function careReminderPreview(
  scope: CareReminderScope,
  event: CareReminderAnchor | null,
  draft: CareReminderDraft,
  recipients: CareReminderRecipient[],
  today: string,
): { success: true; data: Omit<CareReminderPlan, 'requestId'> } | { success: false; reason: string } {
  if (!scope.accountId || !scope.stableId || !scope.horseId || !event ||
      event.stableId !== scope.stableId || !event.horseIds.includes(scope.horseId)) {
    return { success: false, reason: 'Välj en befintlig vårdhändelse för hästen i det här stallet.' };
  }
  if (event.status === 'cancelled') return { success: false, reason: 'Vårdhändelsen är avbokad. Välj en annan händelse.' };
  const nextDate = draft.nextDate.trim();
  if (!isValidISODate(today) || !isValidISODate(nextDate)) {
    return { success: false, reason: 'Ange ett giltigt nästa datum i formatet ÅÅÅÅ-MM-DD.' };
  }
  if (nextDate < today) return { success: false, reason: 'Nästa datum har passerat. Välj ett datum från idag och framåt.' };
  const reminderDate = nextDate;
  const recipientUserIds = [...new Set(draft.recipientUserIds)].sort();
  if (!recipientUserIds.length) return { success: false, reason: 'Välj själv minst en mottagare.' };
  if (recipientUserIds.some(id => !recipients.some(person => person.id === id && person.stableId === scope.stableId))) {
    return { success: false, reason: 'En vald mottagare finns inte i den aktuella listan för stallet. Uppdatera valet.' };
  }
  return { success: true, data: { ...scope, careEventId: event.id, sourceEventDate: event.date,
    nextDate, sourceEventRevision: event.revision, expectedRevision: null, reminderDate, recipientUserIds } };
}

export function matchesCareReminderReceipt(expected: CareReminderPlan, receipt: unknown): boolean {
  if (!receipt || typeof receipt !== 'object') return false;
  const value = receipt as Record<string, unknown>;
  const fields = ['accountId', 'sessionEpoch', 'stableId', 'horseId', 'requestId', 'careEventId',
    'sourceEventDate', 'sourceEventRevision', 'expectedRevision', 'nextDate', 'reminderDate'] as const;
  return fields.every(key => value[key] === expected[key]) && Array.isArray(value.recipientUserIds) &&
    value.recipientUserIds.every(id => typeof id === 'string') &&
    JSON.stringify(value.recipientUserIds) === JSON.stringify(expected.recipientUserIds);
}


export type CareReminderStoredPlan = Pick<CareReminderPlan, 'requestId' | 'nextDate' | 'recipientUserIds'> & {
  state: 'scheduled' | 'held' | 'dispatch_unknown' | 'submitted';
};
export type CareReminderSnapshot = {
  accountId: string;
  stableId: string;
  horseId: string;
  anchor: CareReminderAnchor;
  recipients: CareReminderRecipient[];
  plan: CareReminderStoredPlan | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fixedRejectedCodes = new Set(['42501', '23514', '23505', '40001', '22023']);

export function stockholmToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

function validSnapshot(value: unknown, scope: CareReminderScope, eventId: string): value is CareReminderSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as CareReminderSnapshot;
  return row.accountId === scope.accountId && row.stableId === scope.stableId && row.horseId === scope.horseId
    && row.anchor?.id === eventId && row.anchor.stableId === scope.stableId
    && Array.isArray(row.anchor.horseIds) && row.anchor.horseIds.every(id => typeof id === 'string') && row.anchor.horseIds.includes(scope.horseId)
    && typeof row.anchor.title === 'string' && isValidISODate(row.anchor.date)
    && ['planned', 'done', 'cancelled'].includes(row.anchor.status)
    && typeof row.anchor.revision === 'string' && Number.isFinite(Date.parse(row.anchor.revision))
    && Array.isArray(row.recipients) && row.recipients.every(person => person && typeof person.id === 'string' && uuid.test(person.id)
      && person.stableId === scope.stableId && typeof person.name === 'string' && person.name.trim())
    && new Set(row.recipients.map(person => person.id)).size === row.recipients.length
    && (row.plan === null || (uuid.test(row.plan?.requestId) && isValidISODate(row.plan.nextDate)
      && Array.isArray(row.plan.recipientUserIds) && row.plan.recipientUserIds.length > 0
      && row.plan.recipientUserIds.every(id => typeof id === 'string' && uuid.test(id))
      && ['scheduled', 'held', 'dispatch_unknown', 'submitted'].includes(row.plan.state)));
}

async function currentSession(userId: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false;
  const { data, error } = await supabase.auth.getSession();
  return isCurrent() && !error && data.session?.user?.id === userId;
}

export async function readCareReminder(scope: CareReminderScope, eventId: string, isCurrent: () => boolean, signal: AbortSignal): Promise<CareReminderSnapshot> {
  if (!await currentSession(scope.accountId, isCurrent) || signal.aborted) throw new Error('Care reminder scope is unavailable');
  const { data, error } = await supabase.rpc('care_reminder_read', {
    p_expected_user_id: scope.accountId, p_stable_id: scope.stableId, p_horse_id: scope.horseId, p_care_event_id: eventId,
  }).abortSignal(signal);
  if (!isCurrent() || signal.aborted || error || !validSnapshot(data, scope, eventId)) throw new Error('Care reminder state could not be verified');
  return data;
}

export async function saveCareReminder(plan: CareReminderPlan, isCurrent: () => boolean): Promise<CareReminderSaveResult> {
  const snapshot = { ...plan, recipientUserIds: [...plan.recipientUserIds] };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dispatched = false;
  try {
    const expired = new Promise<CareReminderSaveResult>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ success: false, outcome: dispatched ? 'uncertain' : 'rejected' }); }, 15_000);
    });
    return await Promise.race([expired, (async (): Promise<CareReminderSaveResult> => {
      if (!await currentSession(snapshot.accountId, isCurrent) || controller.signal.aborted) return { success: false, outcome: 'rejected' };
      dispatched = true;
      const { data, error, status } = await supabase.rpc('care_reminder_save', { p_plan: snapshot }).abortSignal(controller.signal);
      if (!isCurrent() || controller.signal.aborted) return { success: false, outcome: 'uncertain' };
      if (error) return { success: false, outcome: Number.isInteger(status) && status >= 400 && status < 500
        && status !== 408 && fixedRejectedCodes.has(error.code) ? 'rejected' : 'uncertain' };
      if (data?.success !== true || !matchesCareReminderReceipt(snapshot, data.data)) return { success: false, outcome: 'uncertain' };
      return { success: true, data: { ...snapshot, recipientUserIds: [...snapshot.recipientUserIds] } };
    })()]);
  } catch {
    console.warn('[care reminder] Save could not be confirmed');
    return { success: false, outcome: dispatched ? 'uncertain' : 'rejected' };
  } finally { if (timer) clearTimeout(timer); }
}
