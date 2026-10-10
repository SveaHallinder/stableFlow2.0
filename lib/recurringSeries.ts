import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment } from '@/context/AppDataContext';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';
import { MAX_RECURRING_ASSIGNMENTS_PER_BATCH } from '@/lib/schedule';

export type RecurringSeriesEdit = { seriesId: string; label: string; startTime: string; endTime: string };
export type RecurringSeriesResult = { success: true; data: Assignment[] } | { success: false; reason: string };
const failure = 'Serien kunde inte bekräftas. Uppdatera schemat och försök igen. Utkastet finns kvar.';
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function validateRecurringSeriesEdit(input: RecurringSeriesEdit): string | null {
  if (!input.label.trim()) return 'Ange ett namn för passen.';
  if (!isValidTime(input.startTime.trim()) || !isValidTime(input.endTime.trim())) return 'Ange giltiga tider i formatet HH:MM.';
  if (input.endTime.trim() <= input.startTime.trim()) return 'Sluttiden måste vara efter starttiden.';
  return null;
}

// This is a conservative UI preview. The server uses its own clock and timezone
// when locking and updating the complete series, including unloaded rows.
export function isFutureOpenSeriesAssignment(assignment: Assignment, now = new Date()) {
  if (!assignment.seriesId || assignment.status !== 'open' || assignment.assigneeId || assignment.completedAt
    || !isValidISODate(assignment.date) || !isValidTime(assignment.time)) return false;
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${assignment.date}T${assignment.time}` > `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function seriesEndTime(note?: string) {
  const value = note?.match(/\b(?:Till|Slut)\s*:?\s*(\d{1,2}:\d{2})/i)?.[1];
  return value && isValidTime(value) ? value : '';
}

export async function updateRecurringSeries(client: SupabaseClient, userId: string, stableId: string,
  input: RecurringSeriesEdit): Promise<RecurringSeriesResult> {
  const invalid = validateRecurringSeriesEdit(input);
  if (invalid) return { success: false, reason: invalid };
  if (!uuid(userId) || !uuid(stableId) || !uuid(input.seriesId)) return { success: false, reason: failure };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const work = (async (): Promise<RecurringSeriesResult> => {
    try {
      const { data, error } = await client.rpc('update_future_open_assignment_series', {
        p_expected_user_id: userId, p_stable_id: stableId, p_series_id: input.seriesId,
        p_label: input.label.trim(), p_start_time: input.startTime.trim(), p_end_time: input.endTime.trim(),
      }).abortSignal(controller.signal);
      const rows = data?.assignments;
      if (error || !data || data.user_id !== userId || data.stable_id !== stableId || data.series_id !== input.seriesId
        || !Number.isInteger(data.updated_count) || data.updated_count < 0 || data.updated_count > MAX_RECURRING_ASSIGNMENTS_PER_BATCH
        || !Array.isArray(rows) || rows.length !== data.updated_count || new Set(rows.map(row => row?.id)).size !== rows.length
        || rows.some(row => !row || !uuid(row.id) || row.stable_id !== stableId || row.series_id !== input.seriesId
          || !isValidISODate(row.date) || row.label !== input.label.trim() || row.time !== input.startTime.trim()
          || row.status !== 'open' || row.assignee_id !== null || row.completed_at !== null
          || seriesEndTime(row.note) !== input.endTime.trim()
          || !['Morning', 'Lunch', 'Evening'].includes(row.slot) || !['sun', 'clock', 'moon'].includes(row.icon))) {
        console.warn('[assignment series] Kvittensen kunde inte verifieras', 'InvalidReceipt');
        return { success: false, reason: failure };
      }
      return { success: true, data: rows.map(row => ({
        id: row.id, stableId: row.stable_id, seriesId: row.series_id, date: row.date, label: row.label,
        slot: row.slot, icon: row.icon, time: row.time, note: row.note ?? undefined, status: row.status,
        declinedByUserIds: row.declined_by_user_ids ?? [],
      })) };
    } catch {
      console.warn('[assignment series] Serien kunde inte sparas', 'RequestFailed');
      return { success: false, reason: failure };
    }
  })();
  try {
    return await Promise.race([work, new Promise<RecurringSeriesResult>(resolve => {
      timeout = setTimeout(() => { controller.abort(); resolve({ success: false, reason: failure }); }, 15_000);
    })]);
  } finally { clearTimeout(timeout); }
}
