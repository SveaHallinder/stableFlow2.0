import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment, WeekdayIndex } from '@/context/AppDataContext';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';
import { MAX_RECURRING_ASSIGNMENTS_PER_BATCH } from '@/lib/schedule';

export type SeasonResult<T> = { success: true; data: T } | { success: false; reason: string };
export type SchedulePeriod = { id: string; stableId: string; name: string; dateFrom: string; dateTo: string;
  revision: number; generationRevision: number; status: 'draft' | 'generating' | 'ready' };
export type ScheduleTemplateInput = { id: string; name: string; startTime: string; endTime?: string;
  instructions: string; sortOrder: number; archived?: boolean };
export type ScheduleTemplate = ScheduleTemplateInput & { periodId: string; archived: boolean };
export type ScheduleRule = { id: string; templateId: string; weekday: WeekdayIndex; effectiveFrom: string;
  assigneeId?: string; changedByUserId?: string; ownerControlled: boolean; revision: number };
export type SavePeriodInput = { id: string; expectedRevision: number; name: string; dateFrom: string;
  dateTo: string; templates: ScheduleTemplateInput[] };
export type WeeklyInput = { templateId: string; weekday: WeekdayIndex; effectiveFrom: string;
  assigneeId: string | null; ownerControlled: boolean; expectedRevision: number };
export type OccurrenceChanges = { date?: string; label?: string; time?: string; endTime?: string;
  instructions?: string; assigneeId?: string | null; resetOverride?: boolean };
export type ScheduleScope = { userId: string; stableId: string };
export type ScheduleBundle = { periods: SchedulePeriod[]; templates: ScheduleTemplate[]; rules: ScheduleRule[] };
export type ScheduleProgress = { done: number; total: number };

const failed = 'Ändringen kunde inte bekräftas. Uppdatera schemat och försök igen. Ditt utkast finns kvar.';
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1;
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function stockholmScheduleNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function isFutureSeasonAssignment(assignment: Pick<Assignment, 'date' | 'time' | 'status' | 'completedAt'>, now = new Date()) {
  return assignment.status !== 'completed' && !assignment.completedAt && isValidISODate(assignment.date) && isValidTime(assignment.time)
    && `${assignment.date}T${assignment.time}` > stockholmScheduleNow(now);
}

export function previewSchedule(dateFrom: string, dateTo: string, templates: ScheduleTemplateInput[]) {
  if (!isValidISODate(dateFrom) || !isValidISODate(dateTo) || dateTo < dateFrom) {
    return { days: 0, total: 0, error: 'Välj giltiga start- och slutdatum i rätt ordning.' };
  }
  // UTC calendar arithmetic counts dates rather than 23/25-hour local DST days.
  const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 366) return { days, total: 0, error: 'En period kan omfatta högst ett år (366 dagar inklusive skottår).' };
  return { days, total: days * templates.filter(template => !template.archived).length, error: null };
}

export function validateSchedulePeriod(input: SavePeriodInput): string | null {
  if (!uuid(input.id) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return 'Periodens identitet saknas. Öppna schemat igen.';
  if (!input.name.trim() || input.name.trim().length > 120) return 'Ange ett periodnamn med högst 120 tecken.';
  const preview = previewSchedule(input.dateFrom, input.dateTo, input.templates);
  if (preview.error) return preview.error;
  if (!input.templates.some(template => !template.archived)) return 'Lägg till minst ett dagligt pass.';
  if (new Set(input.templates.map(template => template.id)).size !== input.templates.length) return 'Varje pass behöver en egen identitet.';
  for (const template of input.templates) {
    if (!uuid(template.id) || !template.name.trim() || template.name.trim().length > 120) return 'Ge varje pass ett namn med högst 120 tecken.';
    if (!isValidTime(template.startTime) || (template.endTime && !isValidTime(template.endTime))) return 'Ange passens tider i formatet HH:MM.';
    if (template.endTime && template.endTime <= template.startTime) return 'Sluttiden måste vara efter starttiden.';
    if (!Number.isInteger(template.sortOrder) || template.sortOrder < 0 || template.instructions.length > 2000) return 'Kontrollera passordningen och använd högst 2 000 tecken i instruktionerna.';
  }
  return null;
}

export function resolveWeeklyRule(rules: ScheduleRule[], templateId: string, weekday: number, date: string) {
  return rules.filter(rule => rule.templateId === templateId && rule.weekday === weekday && rule.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
export function latestWeeklyRevision(rules: ScheduleRule[], templateId: string, weekday: number) {
  return Math.max(0, ...rules.filter(rule => rule.templateId === templateId && rule.weekday === weekday).map(rule => rule.revision));
}

export function mapSchedulePeriod(row: Record<string, any>): SchedulePeriod {
  return { id: row.id, stableId: row.stable_id, name: row.name, dateFrom: row.date_from, dateTo: row.date_to,
    revision: row.revision, generationRevision: row.generation_revision, status: row.status };
}
function validPeriod(row: unknown, stableId: string): row is Record<string, any> {
  return record(row) && uuid(row.id) && row.stable_id === stableId && typeof row.name === 'string'
    && isValidISODate(row.date_from) && isValidISODate(row.date_to) && row.date_from <= row.date_to
    && positiveInteger(row.revision) && Number.isInteger(row.generation_revision) && row.generation_revision >= 0
    && row.generation_revision <= row.revision && (row.status !== 'ready' || row.generation_revision === row.revision)
    && ['draft', 'generating', 'ready'].includes(row.status);
}
function mapTemplate(row: Record<string, any>): ScheduleTemplate {
  return { id: row.id, periodId: row.period_id, name: row.name, startTime: row.start_time.slice(0, 5),
    endTime: row.end_time?.slice(0, 5) || undefined, instructions: row.instructions ?? '', sortOrder: row.sort_order, archived: row.archived };
}
function validRule(row: unknown): row is Record<string, any> {
  return record(row) && uuid(row.id) && uuid(row.template_id) && Number.isInteger(row.weekday)
    && row.weekday >= 0 && row.weekday <= 6 && isValidISODate(row.effective_from)
    && (row.assignee_id == null || uuid(row.assignee_id)) && typeof row.owner_controlled === 'boolean' && positiveInteger(row.revision);
}
function mapRule(row: Record<string, any>): ScheduleRule {
  return { id: row.id, templateId: row.template_id, weekday: row.weekday, effectiveFrom: row.effective_from,
    assigneeId: row.assignee_id ?? undefined, changedByUserId: row.changed_by_user_id ?? undefined,
    ownerControlled: row.owner_controlled, revision: row.revision };
}
export function mapSeasonAssignment(row: Record<string, any>): Assignment {
  return { id: row.id, stableId: row.stable_id, seriesId: row.series_id ?? undefined,
    templateId: row.template_id ?? undefined, originalDate: row.original_date ?? undefined,
    isScheduleOverride: row.is_schedule_override ?? false, updatedAt: row.updated_at ?? undefined,
    date: row.date, label: row.label, slot: row.slot, icon: row.icon, time: row.time,
    note: row.note ?? undefined, status: row.status, assigneeId: row.assignee_id ?? undefined,
    completedAt: row.completed_at ?? undefined, assignedVia: row.assigned_via ?? undefined,
    declinedByUserIds: row.declined_by_user_ids ?? [] };
}

async function request(client: SupabaseClient, scope: ScheduleScope, name: string, params: Record<string, unknown>): Promise<SeasonResult<Record<string, any>>> {
  if (!uuid(scope.userId) || !uuid(scope.stableId)) return { success: false, reason: 'Logga in och välj ett stall först.' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async (): Promise<SeasonResult<Record<string, any>>> => {
    try {
      const { data, error } = await client.rpc(name, { p_expected_user_id: scope.userId, p_stable_id: scope.stableId, ...params }).abortSignal(controller.signal);
      if (error) {
        console.warn('[season schedule] Servern avvisade ändringen', { code: error.code });
        return { success: false, reason: typeof error.message === 'string' && error.message.startsWith('[season schedule]')
          ? error.message.replace(/^\[season schedule\]\s*/, '') : failed };
      }
      if (!record(data) || data.user_id !== scope.userId || data.stable_id !== scope.stableId) {
        console.warn('[season schedule] Kvittensen kunde inte verifieras', { code: 'InvalidReceipt' });
        return { success: false, reason: failed };
      }
      return { success: true, data };
    } catch {
      console.warn('[season schedule] Anropet kunde inte bekräftas', { code: 'RequestFailed' });
      return { success: false, reason: failed };
    }
  })();
  try {
    return await Promise.race([work, new Promise<SeasonResult<Record<string, any>>>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ success: false, reason: failed }); }, 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function loadSeasonSchedule(client: SupabaseClient, scope: ScheduleScope): Promise<SeasonResult<ScheduleBundle>> {
  const reply = await request(client, scope, 'get_season_schedule', {});
  if (!reply.success) return reply;
  const { periods, templates, weekly_assignments: rules } = reply.data;
  if (!Array.isArray(periods) || !Array.isArray(templates) || !Array.isArray(rules)
    || periods.some(row => !validPeriod(row, scope.stableId)) || new Set(periods.map(row => row.id)).size !== periods.length
    || templates.some(row => !record(row) || !uuid(row.id) || !periods.some(period => period.id === row.period_id)
      || typeof row.name !== 'string' || typeof row.start_time !== 'string' || !isValidTime(row.start_time.slice(0, 5))
      || (row.end_time != null && (typeof row.end_time !== 'string' || !isValidTime(row.end_time.slice(0, 5))))
      || typeof row.instructions !== 'string'
      || !Number.isInteger(row.sort_order) || typeof row.archived !== 'boolean')
    || new Set(templates.map(row => row.id)).size !== templates.length
    || rules.some(row => !validRule(row) || !templates.some(template => template.id === row.template_id))) return { success: false, reason: failed };
  return { success: true, data: { periods: periods.map(mapSchedulePeriod), templates: templates.map(mapTemplate), rules: rules.map(mapRule) } };
}

export async function saveSeasonPeriod(client: SupabaseClient, scope: ScheduleScope, input: SavePeriodInput): Promise<SeasonResult<SchedulePeriod>> {
  const invalid = validateSchedulePeriod(input);
  if (invalid) return { success: false, reason: invalid };
  const reply = await request(client, scope, 'save_schedule_period', { p_period_id: input.id, p_expected_revision: input.expectedRevision,
    p_name: input.name.trim(), p_date_from: input.dateFrom, p_date_to: input.dateTo,
    p_templates: input.templates.map(template => ({ id: template.id, name: template.name.trim(), start_time: template.startTime,
      end_time: template.endTime || null, instructions: template.instructions.trim(), sort_order: template.sortOrder, archived: template.archived ?? false })) });
  if (!reply.success) return reply;
  const row = reply.data.period;
  if (!validPeriod(row, scope.stableId) || row.id !== input.id || row.name !== input.name.trim()
    || row.date_from !== input.dateFrom || row.date_to !== input.dateTo || row.revision !== input.expectedRevision + 1) return { success: false, reason: failed };
  return { success: true, data: mapSchedulePeriod(row) };
}

export async function generateSeasonPeriod(client: SupabaseClient, scope: ScheduleScope, period: SchedulePeriod,
  onProgress?: (value: ScheduleProgress) => void, stillCurrent = () => true): Promise<SeasonResult<SchedulePeriod>> {
  // Server coverage decides completion. The limit also stops a faulty zero-progress receipt from hanging the UI.
  for (let batch = 0; batch < 10_000; batch += 1) {
    if (!stillCurrent()) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
    const reply = await request(client, scope, 'generate_schedule_batch', { p_period_id: period.id, p_expected_revision: period.revision });
    if (!reply.success) return reply;
    if (!stillCurrent()) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
    const { period: row, changed_count: changed, generated_count: done, total_count: total } = reply.data;
    if (!validPeriod(row, scope.stableId) || row.id !== period.id || row.revision !== period.revision
      || !Number.isInteger(changed) || changed < 0 || changed > MAX_RECURRING_ASSIGNMENTS_PER_BATCH
      || !Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 0 || done > total
      || (row.status === 'ready' && done !== total) || (row.status !== 'ready' && changed === 0)) return { success: false, reason: failed };
    onProgress?.({ done, total });
    if (row.status === 'ready') return { success: true, data: mapSchedulePeriod(row) };
  }
  return { success: false, reason: 'Skapandet avbröts. Uppdatera och fortsätt den sparade perioden.' };
}

export async function setSeasonWeekly(client: SupabaseClient, scope: ScheduleScope, input: WeeklyInput): Promise<SeasonResult<ScheduleRule>> {
  if (!uuid(input.templateId) || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6
    || !isValidISODate(input.effectiveFrom) || (input.assigneeId !== null && !uuid(input.assigneeId))
    || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return { success: false, reason: 'Kontrollera pass, veckodag och startdatum.' };
  const reply = await request(client, scope, 'set_schedule_weekly_assignment', { p_template_id: input.templateId,
    p_weekday: input.weekday, p_effective_from: input.effectiveFrom, p_assignee_id: input.assigneeId,
    p_owner_controlled: input.ownerControlled, p_expected_revision: input.expectedRevision });
  if (!reply.success) return reply;
  const row = reply.data.rule;
  if (!validRule(row) || row.template_id !== input.templateId || row.weekday !== input.weekday
    || row.effective_from !== input.effectiveFrom || (row.assignee_id ?? null) !== input.assigneeId
    || row.revision !== input.expectedRevision + 1 || row.owner_controlled !== input.ownerControlled
    || !Number.isInteger(reply.data.updated_count) || reply.data.updated_count < 0 || reply.data.updated_count > MAX_RECURRING_ASSIGNMENTS_PER_BATCH) return { success: false, reason: failed };
  return { success: true, data: mapRule(row) };
}

export async function editSeasonOccurrence(client: SupabaseClient, scope: ScheduleScope,
  assignment: Pick<Assignment, 'id' | 'templateId' | 'originalDate' | 'updatedAt'>, changes: OccurrenceChanges): Promise<SeasonResult<Assignment>> {
  if (!uuid(assignment.id) || !uuid(assignment.templateId) || !assignment.updatedAt || !assignment.originalDate || !isValidISODate(assignment.originalDate)) return { success: false, reason: 'Uppdatera schemat innan du ändrar det här passet.' };
  if ((changes.date !== undefined && !isValidISODate(changes.date)) || (changes.time !== undefined && !isValidTime(changes.time))
    || (changes.endTime && !isValidTime(changes.endTime)) || (changes.assigneeId != null && !uuid(changes.assigneeId))) return { success: false, reason: 'Kontrollera datum, tider och ansvarig.' };
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const names: Record<string, string> = { endTime: 'end_time', assigneeId: 'assignee_id', resetOverride: 'reset_override' };
    payload[names[key] ?? key] = key === 'endTime' && !value ? null
      : (key === 'label' || key === 'instructions') && typeof value === 'string' ? value.trim() : value;
  }
  const reply = await request(client, scope, 'update_schedule_occurrence', { p_assignment_id: assignment.id,
    p_expected_updated_at: assignment.updatedAt, p_changes: payload });
  if (!reply.success) return reply;
  const row = reply.data.assignment;
  if (!record(row) || row.id !== assignment.id || row.stable_id !== scope.stableId || row.template_id !== assignment.templateId
    || row.original_date !== assignment.originalDate || !isValidISODate(row.date) || !isValidTime(row.time)
    || !['Morning', 'Lunch', 'Evening'].includes(row.slot) || !['sun', 'clock', 'moon'].includes(row.icon)
    || !['open', 'assigned', 'completed'].includes(row.status) || typeof row.is_schedule_override !== 'boolean'
    || typeof row.updated_at !== 'string' || row.updated_at === assignment.updatedAt
    || row.is_schedule_override !== !changes.resetOverride
    || (changes.date !== undefined && row.date !== changes.date)
    || (changes.time !== undefined && row.time !== changes.time)
    || (changes.label !== undefined && row.label !== changes.label.trim())
    || ('assigneeId' in changes && (row.assignee_id ?? null) !== changes.assigneeId)
    || (changes.endTime !== undefined && (row.note?.match(/(?:^|\n)Slut:\s*(\d{2}:\d{2})$/)?.[1] ?? '') !== changes.endTime)
    || (changes.instructions !== undefined && changes.endTime !== undefined
      && (row.note ?? '') !== [changes.instructions.trim(), changes.endTime ? `Slut: ${changes.endTime}` : ''].filter(Boolean).join('\n'))
    || (changes.instructions !== undefined && changes.endTime === undefined && (row.note ?? '') !== changes.instructions.trim()
      && (row.note ?? '').replace(/(?:^|\n)Slut:\s*\d{2}:\d{2}$/, '').trim() !== changes.instructions.trim()))
    return { success: false, reason: failed };
  return { success: true, data: mapSeasonAssignment(row) };
}

export async function fetchAllAssignments(client: SupabaseClient, stableIds: string[]) {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  async function definitionFence() {
    const versions: unknown[][] = [];
    const known = new Set<string>();
    let after: string | undefined;
    for (;;) {
      let query = client.from('schedule_periods').select('id,stable_id,revision,generation_revision,status')
        .in('stable_id', stableIds).order('id', { ascending: true }).limit(500);
      if (after) query = query.gt('id', after);
      const { data, error } = await query;
      if (error || !Array.isArray(data) || data.some(row => !uuid(row.id) || !stableIds.includes(row.stable_id)
        || known.has(row.id) || (after && row.id <= after) || !Number.isInteger(row.revision) || row.revision < 1
        || !Number.isInteger(row.generation_revision) || row.generation_revision < 0 || row.generation_revision > row.revision
        || !['draft', 'generating', 'ready'].includes(row.status))) throw new Error('Schemaperioderna kunde inte verifieras.');
      data.forEach(row => { known.add(row.id); versions.push([row.id, row.stable_id, row.revision, row.generation_revision, row.status]); });
      if (data.length < 500) return JSON.stringify(versions);
      after = data[data.length - 1].id;
    }
  }
  try {
    // RLS hides a period during generation. Two matching revision snapshots
    // prevent a concurrent owner edit from truncating a multi-page year.
    const before = await definitionFence();
    for (;;) {
      let query = client.from('assignments').select('*').in('stable_id', stableIds).order('id', { ascending: true }).limit(500);
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) return { data: null, error };
      if (!Array.isArray(data) || data.some(row => !uuid(row.id) || !stableIds.includes(row.stable_id)
        || seen.has(row.id) || (cursor && row.id <= cursor))) throw new Error('Servern bekräftade inte hela passlistan.');
      data.forEach(row => { seen.add(row.id); rows.push(row); });
      if (data.length < 500) {
        if (before !== await definitionFence()) throw new Error('Schemaperioden ändrades medan passen laddades.');
        return { data: rows, error: null };
      }
      cursor = data[data.length - 1].id;
    }
  } catch {
    console.warn('[season schedule] Passlistan kunde inte läsas', { code: 'IncompleteRead' });
    return { data: null, error: new Error('Passlistan kunde inte hämtas komplett. Försök uppdatera igen.') };
  }
}
