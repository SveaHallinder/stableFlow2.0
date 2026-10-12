import type { Assignment } from '@/context/AppDataContext';
import { generateId } from '@/lib/ids';
import { isFutureSeasonAssignment, latestWeeklyRevision, resolveWeeklyRule, validateSchedulePeriod,
  type OccurrenceChanges, type SavePeriodInput, type ScheduleBundle, type SchedulePeriod,
  type ScheduleScope, type SeasonResult, type WeeklyInput } from '@/lib/seasonSchedule';

// Only called behind the existing __DEV__ QA demo gate. Synthetic state remains
// separate from production Supabase and survives a local demo page reload.
type DemoSchedule = ScheduleBundle & { assignments: Assignment[] };
const stores = new Map<string, DemoSchedule>();
const keyFor = (scope: ScheduleScope) => `stableflow-qa-season-v1:${scope.stableId}`;
export function readDemoSchedule(scope: ScheduleScope): DemoSchedule {
  const key = keyFor(scope);
  let value = stores.get(key);
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && ['periods', 'templates', 'rules', 'assignments'].every(field => Array.isArray(saved[field]))) value = saved;
  } catch { /* Offline QA also works with in-memory storage. */ }
  value ??= { periods: [], templates: [], rules: [], assignments: [] };
  stores.set(key, value);
  return value;
}
function persist(scope: ScheduleScope, value: DemoSchedule) {
  stores.set(keyFor(scope), value);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(keyFor(scope), JSON.stringify(value)); }
  catch { /* The production path never uses this synthetic store. */ }
}
function nextStamp(previous?: string) {
  const old = Date.parse(previous ?? '');
  return new Date(Math.max(Date.now(), Number.isFinite(old) ? old + 1 : 0)).toISOString();
}
export function recordDemoSeasonUpdate(scope: ScheduleScope, assignmentId: string, updates: Partial<Assignment>) {
  const store = readDemoSchedule(scope);
  const old = store.assignments.find(row => row.id === assignmentId);
  if (!old) return undefined;
  const updated = { ...old, ...updates, isScheduleOverride: true, updatedAt: nextStamp(old.updatedAt) };
  persist(scope, { ...store, assignments: store.assignments.map(row => row.id === assignmentId ? updated : row) });
  return updated;
}
const future = isFutureSeasonAssignment;
const noteFor = (instructions: string, end?: string) => [instructions, end ? `Slut: ${end}` : ''].filter(Boolean).join('\n') || undefined;

export function saveDemoPeriod(scope: ScheduleScope, input: SavePeriodInput, owner: boolean): SeasonResult<SchedulePeriod> {
  if (!owner) return { success: false, reason: 'Bara stallägaren kan ändra perioder och dagliga pass.' };
  const invalid = validateSchedulePeriod(input);
  if (invalid) return { success: false, reason: invalid };
  const store = readDemoSchedule(scope);
  const old = store.periods.find(period => period.id === input.id);
  if ((old?.revision ?? 0) !== input.expectedRevision) return { success: false, reason: 'Perioden ändrades av någon annan. Uppdatera och försök igen.' };
  if (store.periods.some(period => period.id !== input.id && period.dateFrom <= input.dateTo && period.dateTo >= input.dateFrom)) {
    return { success: false, reason: 'Perioden överlappar en annan period i stallet.' };
  }
  const period: SchedulePeriod = { id: input.id, stableId: scope.stableId, name: input.name.trim(), dateFrom: input.dateFrom,
    dateTo: input.dateTo, revision: input.expectedRevision + 1, generationRevision: old?.generationRevision ?? 0, status: 'generating' };
  const templates = [...input.templates.map(template => ({ ...template, periodId: input.id, archived: template.archived ?? false })),
    ...store.templates.filter(template => template.periodId === input.id && !input.templates.some(row => row.id === template.id))
      .map(template => ({ ...template, archived: true }))];
  persist(scope, { ...store, periods: [...store.periods.filter(row => row.id !== input.id), period],
    templates: [...store.templates.filter(row => row.periodId !== input.id), ...templates] });
  return { success: true, data: period };
}

export function generateDemoBatch(scope: ScheduleScope, period: SchedulePeriod) {
  const store = readDemoSchedule(scope);
  const saved = store.periods.find(row => row.id === period.id);
  if (!saved || saved.revision !== period.revision) return { success: false as const, reason: 'Perioden ändrades. Uppdatera schemat.' };
  const templates = store.templates.filter(row => row.periodId === period.id && !row.archived);
  const allTemplates = new Set(store.templates.filter(row => row.periodId === period.id).map(row => row.id));
  const expected: Assignment[] = [];
  for (let day = Date.parse(`${saved.dateFrom}T00:00:00Z`); day <= Date.parse(`${saved.dateTo}T00:00:00Z`); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    for (const template of templates) {
      const old = store.assignments.find(row => row.templateId === template.id && row.originalDate === date);
      const rule = resolveWeeklyRule(store.rules, template.id, weekday, date);
      const slot = template.startTime < '10:00' ? 'Morning' : template.startTime < '15:00' ? 'Lunch' : 'Evening';
      expected.push(old && (old.isScheduleOverride || !future(old)) ? old : {
        id: old?.id ?? generateId(), stableId: scope.stableId, templateId: template.id, originalDate: date, date,
        label: template.name, time: template.startTime, slot, icon: slot === 'Morning' ? 'sun' : slot === 'Lunch' ? 'clock' : 'moon',
        note: noteFor(template.instructions, template.endTime), status: rule?.assigneeId ? 'assigned' : 'open',
        assigneeId: rule?.assigneeId, assignedVia: rule?.assigneeId ? 'default' : undefined,
        isScheduleOverride: false, updatedAt: old?.updatedAt ?? new Date().toISOString(), declinedByUserIds: [],
      });
    }
  }
  const desired = new Map(expected.map(row => [row.id, row]));
  let changed = 0;
  const assignments = store.assignments.filter(row => {
    if (!row.templateId || !allTemplates.has(row.templateId) || desired.has(row.id) || row.isScheduleOverride || !future(row)) return true;
    if (changed >= 365) return true;
    changed += 1; return false;
  });
  for (const row of expected) {
    const index = assignments.findIndex(old => old.id === row.id);
    if (index !== -1 && JSON.stringify(assignments[index]) === JSON.stringify(row)) continue;
    if (changed >= 365) break;
    if (index === -1) assignments.push(row); else assignments[index] = { ...row, updatedAt: nextStamp(assignments[index].updatedAt) };
    changed += 1;
  }
  const done = expected.filter(row => assignments.some(old => old.templateId === row.templateId && old.originalDate === row.originalDate)).length;
  const ready = done === expected.length && expected.every(row => assignments.some(old => old.id === row.id && old.label === row.label
    && old.note === row.note && old.time === row.time && old.assigneeId === row.assigneeId && old.slot === row.slot && old.icon === row.icon
    && old.status === row.status && old.assignedVia === row.assignedVia))
    && !assignments.some(row => row.templateId && allTemplates.has(row.templateId) && !desired.has(row.id) && !row.isScheduleOverride && future(row));
  const next = { ...saved, status: ready ? 'ready' as const : 'generating' as const,
    generationRevision: ready ? saved.revision : saved.generationRevision };
  persist(scope, { ...store, assignments, periods: store.periods.map(row => row.id === period.id ? next : row) });
  return { success: true as const, data: next, progress: { done, total: expected.length } };
}

export function setDemoWeekly(scope: ScheduleScope, input: WeeklyInput, owner: boolean, eligibleIds: string[]) {
  const store = readDemoSchedule(scope);
  const template = store.templates.find(row => row.id === input.templateId);
  const period = store.periods.find(row => row.id === template?.periodId);
  if (!period || period.status !== 'ready' || template?.archived) return { success: false as const, reason: 'Skapa färdigt periodens pass först.' };
  if (input.effectiveFrom < period.dateFrom || input.effectiveFrom > period.dateTo) return { success: false as const, reason: 'Välj ett datum inom perioden.' };
  if (input.expectedRevision !== latestWeeklyRevision(store.rules, input.templateId, input.weekday)) return { success: false as const, reason: 'Veckofördelningen ändrades. Uppdatera innan du väljer igen.' };
  if (input.assigneeId && !eligibleIds.includes(input.assigneeId)) return { success: false as const, reason: 'Personen kan inte ta pass i det här stallet.' };
  const old = resolveWeeklyRule(store.rules, input.templateId, input.weekday, input.effectiveFrom);
  const futureRules = store.rules.filter(row => row.templateId === input.templateId && row.weekday === input.weekday && row.effectiveFrom >= input.effectiveFrom);
  if (!owner && ((input.assigneeId && input.assigneeId !== scope.userId) || old?.ownerControlled || futureRules.some(row => row.ownerControlled)
    || (old?.assigneeId && old.assigneeId !== scope.userId) || futureRules.some(row => row.assigneeId && row.assigneeId !== scope.userId))) {
    return { success: false as const, reason: 'Veckofördelningen styrs av stallägaren eller är redan vald av en annan medlem.' };
  }
  const rule = { id: generateId(), templateId: input.templateId, weekday: input.weekday, effectiveFrom: input.effectiveFrom,
    assigneeId: input.assigneeId ?? undefined, changedByUserId: scope.userId, ownerControlled: owner && input.ownerControlled, revision: input.expectedRevision + 1 };
  const assignments = store.assignments.map(row => row.templateId === input.templateId && (new Date(`${row.originalDate}T00:00:00Z`).getUTCDay() + 6) % 7 === input.weekday
    && row.originalDate! >= input.effectiveFrom && !row.isScheduleOverride && future(row)
    ? { ...row, assigneeId: rule.assigneeId, status: rule.assigneeId ? 'assigned' as const : 'open' as const,
      assignedVia: rule.assigneeId ? 'default' as const : undefined, updatedAt: nextStamp(row.updatedAt) } : row);
  persist(scope, { ...store, rules: [...store.rules.filter(row => row.templateId !== input.templateId || row.weekday !== input.weekday || row.effectiveFrom < input.effectiveFrom), rule], assignments });
  return { success: true as const, data: rule };
}

export function editDemoOccurrence(scope: ScheduleScope, assignment: Assignment, changes: OccurrenceChanges, owner: boolean, eligibleIds: string[]): SeasonResult<Assignment> {
  const store = readDemoSchedule(scope);
  const old = store.assignments.find(row => row.id === assignment.id);
  if (!old || old.updatedAt !== assignment.updatedAt || !future(old)) return { success: false, reason: 'Passet ändrades eller har redan startat. Uppdatera schemat.' };
  if (!owner && (Object.keys(changes).some(key => key !== 'assigneeId')
    || !(old.status === 'open' && changes.assigneeId === scope.userId) && !(old.assigneeId === scope.userId && changes.assigneeId === null))) return { success: false, reason: 'Du kan bara ta ett ledigt pass eller släppa ditt eget pass.' };
  if (changes.assigneeId && !eligibleIds.includes(changes.assigneeId)) return { success: false, reason: 'Personen kan inte ta pass i det här stallet.' };
  let row: Assignment = { ...old, date: changes.date ?? old.date, label: changes.label ?? old.label, time: changes.time ?? old.time,
    note: changes.instructions !== undefined || changes.endTime !== undefined
      ? noteFor(changes.instructions?.trim() ?? old.note?.replace(/(?:^|\n)Slut:\s*\d\d:\d\d$/, '').trim() ?? '',
        changes.endTime ?? old.note?.match(/(?:^|\n)Slut:\s*(\d\d:\d\d)$/)?.[1]) : old.note,
    isScheduleOverride: true, updatedAt: nextStamp(old.updatedAt) };
  if ('assigneeId' in changes) row = { ...row, assigneeId: changes.assigneeId ?? undefined,
    status: changes.assigneeId ? 'assigned' : 'open', assignedVia: changes.assigneeId ? 'manual' : undefined };
  if (changes.resetOverride && owner) {
    const template = store.templates.find(value => value.id === old.templateId);
    const rule = resolveWeeklyRule(store.rules, old.templateId!, (new Date(`${old.originalDate}T00:00:00Z`).getUTCDay() + 6) % 7, old.originalDate!);
    if (!template || template.archived) return { success: false, reason: 'Passmallen är arkiverad. Ändra bara detta pass i stället.' };
    row = { ...row, date: old.originalDate!, time: template.startTime, label: template.name, note: noteFor(template.instructions, template.endTime),
      assigneeId: rule?.assigneeId, status: rule?.assigneeId ? 'assigned' : 'open', assignedVia: rule?.assigneeId ? 'default' : undefined, isScheduleOverride: false };
  }
  const slot = row.time < '10:00' ? 'Morning' : row.time < '15:00' ? 'Lunch' : 'Evening';
  row = { ...row, slot, icon: slot === 'Morning' ? 'sun' : slot === 'Lunch' ? 'clock' : 'moon' };
  persist(scope, { ...store, assignments: store.assignments.map(value => value.id === row.id ? row : value) });
  return { success: true, data: row };
}
