import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppData, type Assignment } from '@/context/AppDataContext';
import { isQaDemoMode } from '@/lib/qaDemo';
import { supabase } from '@/lib/supabase';
import { editSeasonOccurrence, generateSeasonPeriod, loadSeasonSchedule, saveSeasonPeriod, setSeasonWeekly,
  type OccurrenceChanges, type SavePeriodInput, type ScheduleBundle, type SchedulePeriod, type ScheduleProgress,
  type ScheduleRule, type SeasonResult, type WeeklyInput } from '@/lib/seasonSchedule';
import { editDemoOccurrence, generateDemoBatch, readDemoSchedule, saveDemoPeriod, setDemoWeekly } from '@/lib/seasonScheduleDemo';

const empty: ScheduleBundle = { periods: [], templates: [], rules: [] };
export function useSeasonSchedule() {
  const { state, actions } = useAppData();
  const { user } = useAuth();
  const { currentUserId: userId, currentStableId: stableId } = state;
  const sync = actions.syncSeasonAssignments;
  const membership = state.users[userId]?.membership.find(row => row.stableId === stableId);
  const owner = membership?.role === 'admin' && membership.access === 'owner';
  const eligibleIds = Object.values(state.users).filter(person => person.membership.some(row => row.stableId === stableId
    && ['admin', 'staff', 'rider'].includes(row.role))).map(person => person.id);
  const scope = { userId, stableId };
  const identity = `${user?.id ?? ''}:${userId}:${stableId}`;
  const identityScope = useMemo(() => ({ identity }), [identity]);
  const identityRef = useRef(identityScope);
  identityRef.current = identityScope;
  const mounted = useRef(true);
  const pending = useRef<typeof identityScope | null>(null);
  const requestVersion = useRef(0);
  const [bundle, setBundle] = useState<ScheduleBundle>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIdentity, setBusyIdentity] = useState<typeof identityScope | null>(null);
  const bundleIdentity = useRef(identityScope);
  const [progress, setProgress] = useState<ScheduleProgress | null>(null);
  const current = useCallback(() => mounted.current && identityRef.current === identityScope, [identityScope]);

  const reload = useCallback(async (): Promise<SeasonResult<void>> => {
    const version = ++requestVersion.current;
    if (!userId || !stableId || (!isQaDemoMode && user?.id !== userId)) {
      if (current()) { setBundle(empty); setLoading(false); setError('Logga in och välj ett stall först.'); }
      return { success: false, reason: 'Logga in och välj ett stall först.' };
    }
    setLoading(true);
    const result = isQaDemoMode
      ? { success: true as const, data: readDemoSchedule({ userId, stableId }) }
      : await loadSeasonSchedule(supabase, { userId, stableId });
    if (!current() || version !== requestVersion.current) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
    if (result.success) {
      bundleIdentity.current = identityScope;
      setBundle({ periods: result.data.periods, templates: result.data.templates, rules: result.data.rules });
      setError(null);
      if (isQaDemoMode) {
        const demo = readDemoSchedule({ userId, stableId });
        const synced = await sync(demo.assignments.filter(row => demo.periods.some(period => period.status === 'ready'
          && demo.templates.some(template => template.id === row.templateId && template.periodId === period.id))));
        if (!synced.success) { if (current()) { setError(synced.reason); setLoading(false); } return synced; }
      }
    } else { setBundle(empty); setError(result.reason); }
    if (current()) setLoading(false);
    return result.success ? { success: true, data: undefined } : result;
  }, [userId, stableId, user?.id, current, sync, identityScope]);

  useEffect(() => {
    mounted.current = true;
    setBundle(empty); setError(null); setProgress(null);
    void reload();
    return () => { mounted.current = false; requestVersion.current += 1; };
  }, [reload]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active' && pending.current !== identityScope) void reload();
    });
    return () => subscription.remove();
  }, [reload, identityScope]);

  async function run<T>(work: () => Promise<SeasonResult<T>>, refreshAssignments = false, hideTemplateIds: string[] = []): Promise<SeasonResult<T>> {
    if (pending.current === identityScope) return { success: false, reason: 'Schemat sparas redan. Vänta ett ögonblick.' };
    if (!current() || (!isQaDemoMode && user?.id !== userId)) return { success: false, reason: 'Logga in och öppna schemat igen.' };
    pending.current = identityScope; setBusyIdentity(identityScope); setError(null);
    try {
      const result = await work();
      if (!current()) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
      if (!result.success) { setError(result.reason); return result; }
      let syncFailure: string | undefined;
      if (refreshAssignments) {
        const demo = isQaDemoMode ? readDemoSchedule(scope) : null;
        const active = demo?.assignments.filter(row => demo.templates.some(template => template.id === row.templateId
          && demo.periods.some(period => period.id === template.periodId && period.status === 'ready')));
        const synced = await sync(active, hideTemplateIds);
        if (!current()) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
        if (!synced.success) syncFailure = synced.reason;
      }
      const loaded = await reload();
      if (!loaded.success) return loaded;
      if (!current()) return { success: false, reason: 'Stallet eller kontot ändrades. Öppna schemat igen.' };
      if (syncFailure) { setError(syncFailure); return { success: false, reason: syncFailure }; }
      return result;
    } catch {
      console.warn('[season schedule] Schemat kunde inte bekräftas', { code: 'RequestFailed' });
      const reason = 'Ändringen kunde inte bekräftas. Uppdatera schemat och försök igen. Ditt utkast finns kvar.';
      if (current()) setError(reason);
      return { success: false, reason };
    } finally {
      if (pending.current === identityScope) pending.current = null;
      if (current()) { setBusyIdentity(null); setProgress(null); }
    }
  }
  const savePeriod = (input: SavePeriodInput) => run<SchedulePeriod>(() => isQaDemoMode
    ? Promise.resolve(saveDemoPeriod(scope, input, owner)) : saveSeasonPeriod(supabase, scope, input), true,
    [...input.templates.map(row => row.id), ...bundle.templates.filter(row => row.periodId === input.id).map(row => row.id)]);
  const generatePeriod = (period: SchedulePeriod) => run<SchedulePeriod>(async () => {
    if (!isQaDemoMode) return generateSeasonPeriod(supabase, scope, period, value => { if (current()) setProgress(value); }, current);
    for (;;) {
      if (!current()) return { success: false, reason: 'Stallet eller kontot ändrades.' };
      const result = generateDemoBatch(scope, period);
      if (!result.success) return result;
      setProgress(result.progress);
      if (result.data.status === 'ready') return result;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }, true);
  const setWeekly = (input: WeeklyInput) => run<ScheduleRule>(() => isQaDemoMode
    ? Promise.resolve(setDemoWeekly(scope, input, owner, eligibleIds)) : setSeasonWeekly(supabase, scope, input), true);
  const editOccurrence = (assignment: Assignment, changes: OccurrenceChanges) => run<Assignment>(() => isQaDemoMode
    ? Promise.resolve(editDemoOccurrence(scope, assignment, changes, owner, eligibleIds)) : editSeasonOccurrence(supabase, scope, assignment, changes), true);
  return { ...(bundleIdentity.current === identityScope ? bundle : empty), loading, error, busy: busyIdentity === identityScope,
    progress: busyIdentity === identityScope ? progress : null, reload, savePeriod, generatePeriod, setWeekly, editOccurrence };
}
