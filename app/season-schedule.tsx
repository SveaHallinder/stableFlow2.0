import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { DateTimeField } from '@/components/DateTimeField';
import { SeasonOccurrenceModal } from '@/components/SeasonOccurrenceModal';
import { theme } from '@/components/theme';
import { useAppData, type Assignment, type WeekdayIndex } from '@/context/AppDataContext';
import { useSeasonSchedule } from '@/hooks/useSeasonSchedule';
import { generateId } from '@/lib/ids';
import { isValidISODate } from '@/lib/dateValidation';
import { seriesEndTime } from '@/lib/recurringSeries';
import {
  isFutureSeasonAssignment, latestWeeklyRevision, previewSchedule, resolveWeeklyRule,
  stockholmScheduleNow, validateSchedulePeriod,
  type SavePeriodInput, type SchedulePeriod, type ScheduleTemplateInput,
} from '@/lib/seasonSchedule';

const weekdays: { label: string; value: WeekdayIndex }[] = [
  { label: 'måndag', value: 0 }, { label: 'tisdag', value: 1 },
  { label: 'onsdag', value: 2 }, { label: 'torsdag', value: 3 },
  { label: 'fredag', value: 4 }, { label: 'lördag', value: 5 }, { label: 'söndag', value: 6 },
];
const palette = theme.colors;

function newPeriod(): SavePeriodInput {
  return {
    id: generateId(), expectedRevision: 0, name: '', dateFrom: '', dateTo: '',
    templates: [
      { id: generateId(), name: 'Morgonfodring', startTime: '07:00', instructions: '', sortOrder: 0 },
      { id: generateId(), name: 'Lunchfodring', startTime: '12:00', instructions: '', sortOrder: 1 },
      { id: generateId(), name: 'Kvällsfodring', startTime: '18:00', instructions: '', sortOrder: 2 },
    ],
  };
}

export default function SeasonScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ assignmentId?: string | string[]; memberId?: string | string[] }>();
  const assignmentParam = Array.isArray(params.assignmentId) ? params.assignmentId[0] : params.assignmentId;
  const memberParam = Array.isArray(params.memberId) ? params.memberId[0] : params.memberId;
  const { state, hydrating } = useAppData();
  const { currentUserId, currentStableId, users, assignments } = state;
  const schedule = useSeasonSchedule();
  const { periods, templates, rules, loading, busy, progress } = schedule;
  const scopeKey = `${currentUserId}:${currentStableId}`;
  const identityScope = React.useMemo(() => ({ key: scopeKey, memberId: memberParam }), [scopeKey, memberParam]);
  const scope = React.useRef(identityScope);
  scope.current = identityScope;
  const membership = users[currentUserId]?.membership.find(entry => entry.stableId === currentStableId);
  const owner = membership?.role === 'admin' && membership.access === 'owner';
  const canChoose = Boolean(membership && ['admin', 'staff', 'rider'].includes(membership.role));
  const members = Object.values(users).filter(person => person.membership.some(entry => entry.stableId === currentStableId
    && ['admin', 'staff', 'rider'].includes(entry.role))).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const stable = state.stables.find(item => item.id === currentStableId);
  const today = stockholmScheduleNow().slice(0, 10);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SavePeriodInput | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = React.useState(today);
  const [selectedDays, setSelectedDays] = React.useState<WeekdayIndex[]>([]);
  const [assigneeId, setAssigneeId] = React.useState<string | null>(memberParam ?? currentUserId);
  const [revisionSnapshot, setRevisionSnapshot] = React.useState<Record<number, number> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [occurrenceId, setOccurrenceId] = React.useState<string | null>(null);
  const openedParam = React.useRef<string | undefined>(undefined);
  const saving = React.useRef<typeof identityScope | null>(null);
  const blocked = busy || pending;
  const orderedPeriods = [...periods].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const selected = periods.find(period => period.id === selectedId);
  const periodTemplates = templates.filter(template => template.periodId === selected?.id && !template.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const occurrence = assignments.find(item => item.id === occurrenceId && item.stableId === currentStableId && item.templateId);
  const occurrenceTemplate = templates.find(template => template.id === occurrence?.templateId);
  const occurrencePeriod = periods.find(period => period.id === occurrenceTemplate?.periodId);

  React.useEffect(() => {
    setSelectedId(null); setDraft(null); setExpandedId(null); setSelectedDays([]);
    setError(null); setMessage(null); setOccurrenceId(null); setRevisionSnapshot(null);
    setPending(false); saving.current = null;
    setAssigneeId(memberParam ?? currentUserId);
    openedParam.current = undefined;
  }, [identityScope, memberParam, currentUserId]);

  React.useEffect(() => {
    if (!selectedId || !periods.some(period => period.id === selectedId)) {
      const sorted = [...periods].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
      const initial = sorted.find(period => period.dateTo >= today) ?? sorted[sorted.length - 1];
      if (initial) { setSelectedId(initial.id); setEffectiveFrom(initial.dateFrom > today ? initial.dateFrom : today); }
    }
  }, [periods, selectedId, today]);

  React.useEffect(() => {
    if (!assignmentParam || openedParam.current === assignmentParam || loading) return;
    const item = assignments.find(row => row.id === assignmentParam && row.stableId === currentStableId && row.templateId);
    if (!item) { setError('Passet kunde inte hittas. Uppdatera schemat och försök igen.'); return; }
    const template = templates.find(row => row.id === item.templateId);
    if (!template) return;
    openedParam.current = assignmentParam;
    setSelectedId(template.periodId); setOccurrenceId(item.id);
  }, [assignmentParam, assignments, currentStableId, loading, templates]);

  React.useEffect(() => {
    if (expandedId && revisionSnapshot === null && !loading) {
      setRevisionSnapshot(Object.fromEntries(weekdays.map(day => [day.value, latestWeeklyRevision(rules, expandedId, day.value)])));
    }
  }, [expandedId, loading, revisionSnapshot, rules]);

  const choosePeriod = (period: SchedulePeriod) => {
    if (blocked) return;
    setSelectedId(period.id); setExpandedId(null); setSelectedDays([]); setError(null); setMessage(null);
    setEffectiveFrom(period.dateFrom > today ? period.dateFrom : today);
  };

  const editPeriod = () => {
    if (!selected || blocked) return;
    setDraft({ id: selected.id, expectedRevision: selected.revision, name: selected.name,
      dateFrom: selected.dateFrom, dateTo: selected.dateTo,
      templates: templates.filter(template => template.periodId === selected.id)
        .sort((a, b) => a.sortOrder - b.sortOrder).map(template => ({ ...template })),
    });
    setError(null); setMessage(null);
  };

  const updateTemplate = (id: string, changes: Partial<ScheduleTemplateInput>) => {
    if (blocked) return;
    setDraft(current => current ? { ...current, templates: changes.archived && !templates.some(template => template.id === id)
      ? current.templates.filter(template => template.id !== id)
      : current.templates.map(template => template.id === id ? { ...template, ...changes } : template) } : current);
  };

  const savePeriod = async () => {
    if (!draft || saving.current === identityScope || busy) return;
    const validation = validateSchedulePeriod(draft);
    if (validation) { setError(validation); return; }
    saving.current = identityScope; setPending(true); setError(null); setMessage(null);
    const requestScope = identityScope;
    try {
      const saved = await schedule.savePeriod(draft);
      if (scope.current !== requestScope) return;
      if (!saved.success) { setError(saved.reason); return; }
      setSelectedId(saved.data.id);
      setEffectiveFrom(saved.data.dateFrom > today ? saved.data.dateFrom : today);
      setDraft(current => current ? { ...current, expectedRevision: saved.data.revision } : current);
      const generated = await schedule.generatePeriod(saved.data);
      if (scope.current !== requestScope) return;
      if (!generated.success) { setError(generated.reason); return; }
      setDraft(null); setExpandedId(null); setSelectedDays([]); setMessage('Passen är skapade.');
    } catch {
      if (scope.current === requestScope) setError('Passen kunde inte sparas. Försök igen. Ditt utkast finns kvar.');
    } finally {
      if (saving.current === requestScope) saving.current = null;
      if (scope.current === requestScope) setPending(false);
    }
  };

  const resumePeriod = async () => {
    if (!selected || saving.current === identityScope || busy) return;
    saving.current = identityScope; setPending(true); setError(null); setMessage(null);
    const requestScope = identityScope;
    try {
      const result = await schedule.generatePeriod(selected);
      if (scope.current !== requestScope) return;
      if (result.success) { setDraft(null); setMessage('Passen är skapade.'); }
      else setError(result.reason);
    } catch {
      if (scope.current === requestScope) setError('Skapandet kunde inte återupptas. Försök igen. Perioden finns kvar.');
    } finally {
      if (saving.current === requestScope) saving.current = null;
      if (scope.current === requestScope) setPending(false);
    }
  };

  const expandTemplate = (id: string, date?: string, days: WeekdayIndex[] = []) => {
    if (blocked) return;
    setExpandedId(current => current === id && !date ? null : id);
    setSelectedDays(days); setError(null); setMessage(null);
    setRevisionSnapshot(Object.fromEntries(weekdays.map(day => [day.value, latestWeeklyRevision(rules, id, day.value)])));
    if (date) setEffectiveFrom(date);
  };

  const saveWeekly = async (action: 'assign' | 'release' | 'unlock') => {
    if (!selected || !expandedId || saving.current === identityScope || busy) return;
    if (!isValidISODate(effectiveFrom) || effectiveFrom < selected.dateFrom || effectiveFrom > selected.dateTo || effectiveFrom < today) {
      setError('Välj ett giltigt från-datum inom perioden, tidigast idag.'); return;
    }
    if (!selectedDays.length) { setError('Välj minst en veckodag.'); return; }
    if (revisionSnapshot === null) { setError('Läs in den senaste fördelningen först. Dina val finns kvar.'); return; }
    saving.current = identityScope; setPending(true); setError(null); setMessage(null);
    const requestScope = identityScope;
    try {
      for (const weekday of selectedDays) {
        const currentRule = resolveWeeklyRule(rules, expandedId, weekday, effectiveFrom);
        const result = await schedule.setWeekly({ templateId: expandedId, weekday, effectiveFrom,
          assigneeId: action === 'unlock' ? currentRule?.assigneeId ?? null : action === 'release' ? null : owner ? assigneeId : currentUserId,
          ownerControlled: owner && action !== 'unlock', expectedRevision: revisionSnapshot[weekday] ?? 0,
        });
        if (scope.current !== requestScope) return;
        if (!result.success) { setError(result.reason); return; }
        setRevisionSnapshot(current => current ? { ...current, [weekday]: result.data.revision } : current);
        setSelectedDays(current => current.filter(day => day !== weekday));
      }
      setMessage('Veckofördelningen är sparad.');
    } catch {
      if (scope.current === requestScope) setError('Veckovalet kunde inte sparas. Försök igen. Dina återstående val finns kvar.');
    } finally {
      if (saving.current === requestScope) saving.current = null;
      if (scope.current === requestScope) setPending(false);
    }
  };

  const weeklyFromOccurrence = (item: Assignment) => {
    setOccurrenceId(null);
    const weekday = ((new Date(`${item.date}T12:00:00`).getDay() + 6) % 7) as WeekdayIndex;
    expandTemplate(item.templateId!, item.date, [weekday]);
    if (owner) setAssigneeId(item.assigneeId ?? null);
  };

  const preview = draft ? previewSchedule(draft.dateFrom, draft.dateTo, draft.templates) : null;
  const latestDraftPeriod = periods.find(period => period.id === draft?.id);
  const draftOutdated = Boolean(draft && latestDraftPeriod && draft.expectedRevision !== latestDraftPeriod.revision);
  const draftTemplates = draft?.templates.filter(template => !template.archived) ?? [];
  const linkedAssignments = assignments.filter(item => item.stableId === currentStableId
    && templates.some(template => template.id === item.templateId && template.periodId === (draft?.id ?? selected?.id)));
  const futureBookings = linkedAssignments.filter(item => item.status === 'assigned' && item.assigneeId && isFutureSeasonAssignment(item));
  const affectedBookings = draft ? futureBookings.filter(item => {
    if (item.isScheduleOverride) return false;
    const before = templates.find(template => template.id === item.templateId);
    const after = draft.templates.find(template => template.id === item.templateId);
    return item.date < draft.dateFrom || item.date > draft.dateTo || !after || after.archived
      || before?.name !== after.name || before.startTime !== after.startTime
      || (before.endTime ?? '') !== (after.endTime ?? '') || before.instructions !== after.instructions;
  }).length : 0;
  const staffedPreview = draft ? linkedAssignments.filter(item => item.assigneeId
    && draftTemplates.some(template => template.id === item.templateId)
    && (item.originalDate ?? item.date) >= draft.dateFrom && (item.originalDate ?? item.date) <= draft.dateTo).length : 0;
  const upcoming = linkedAssignments.filter(item => isFutureSeasonAssignment(item))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 7);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Fasta pass" showSearch={false} showLogo={false} style={styles.header}
          left={<HeaderIconButton accessibilityLabel="Tillbaka till schema" disabled={blocked} onPress={() => router.canGoBack() ? router.back() : router.replace('/calendar')}>
            <Feather name="chevron-left" size={24} color={palette.primaryText} />
          </HeaderIconButton>} />
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>{stable?.name ?? 'Ditt stall'}</Text>
              <Text style={styles.heading}>Stallets fasta pass.</Text>
              <Text style={styles.body}>Välj en period, lägg in stallets dagliga pass och fördela veckodagarna mellan er.</Text>
            </View>
            {loading || hydrating ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={styles.body}>Hämtar fasta pass…</Text></View> : null}
            {error || schedule.error ? <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.error}>{error ?? schedule.error}</Text>
              <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={async () => { await schedule.reload(); setRevisionSnapshot(null); }} accessibilityRole="button" accessibilityLabel="Uppdatera schema">
                <Text style={styles.link}>Uppdatera schema · behåll mitt utkast</Text>
              </TouchableOpacity>
            </View> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
            {blocked ? <View style={styles.progress} accessibilityLiveRegion="polite">
              <ActivityIndicator color={palette.primary} /><Text style={styles.body}>{progress ? `Skapar pass · ${progress.done} av ${progress.total}` : 'Sparar schemat…'}</Text>
              <Text style={styles.caption}>Stanna kvar tills sparandet är klart. Avbrutet skapande kan återupptas.</Text>
            </View> : null}
            {!membership && !hydrating ? <Card style={styles.card}>
              <Text style={styles.cardTitle}>Välj ett stall först</Text>
              <Text style={styles.body}>Gå med i ett stall för att se perioder och fasta pass.</Text>
            </Card> : null}
            {membership && !draft ? <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Perioder</Text>
                {owner ? <TouchableOpacity style={styles.smallButton} disabled={blocked || loading} onPress={() => { setDraft(newPeriod()); setError(null); setMessage(null); }} accessibilityRole="button" accessibilityLabel="Skapa period">
                  <Feather name="plus" size={16} color={palette.primary} /><Text style={styles.link}>Skapa period</Text>
                </TouchableOpacity> : null}
              </View>
              {orderedPeriods.map(period => <TouchableOpacity key={period.id} style={[styles.period, selectedId === period.id && styles.selected]} onPress={() => choosePeriod(period)} disabled={blocked} accessibilityRole="button" accessibilityLabel={`Välj period ${period.name}`} aria-pressed={selectedId === period.id}>
                <View style={styles.flex}><Text style={styles.cardTitle}>{period.name}</Text><Text style={styles.caption}>{period.dateFrom} – {period.dateTo} · båda datumen ingår</Text></View>
                <Text style={[styles.periodStatus, period.status !== 'ready' && styles.warning]}>{period.status === 'ready' ? 'Klar' : 'Ofärdig'}</Text>
              </TouchableOpacity>)}
              {!selected && !loading ? <Card style={styles.empty}>
                <View style={styles.emptyIcon}><Feather name="calendar" size={24} color={palette.primary} /></View>
                <Text style={styles.cardTitle}>Inga fasta pass för perioden</Text>
                <Text style={styles.body}>{owner ? 'Skapa en namngiven period och välj stallets dagliga pass. Datum väljer du själv.' : 'Stallägaren skapar en period. Därefter kan du välja dina fasta veckopass här.'}</Text>
                <Text style={styles.caption}>Utanför en period skapas inga automatiska pass. Manuella pass finns i Schema även på sommaren.</Text>
              </Card> : null}
            </> : null}
            {draft && owner ? <Card style={styles.card}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{draft.expectedRevision ? 'Ändra period' : 'Skapa period'}</Text>
                <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={() => { setDraft(null); setError(null); }} accessibilityRole="button" accessibilityLabel="Avbryt periodutkast"><Text style={styles.link}>Avbryt</Text></TouchableOpacity>
              </View>
              {draftOutdated && latestDraftPeriod ? <View style={styles.versionChoice}>
                <Text style={styles.fieldLabel}>Senaste period: {latestDraftPeriod.name}</Text>
                <Text style={styles.caption}>{latestDraftPeriod.dateFrom} – {latestDraftPeriod.dateTo}</Text>
                <Text style={styles.body}>Perioden har ändrats. Dina fält finns kvar. Läs in senaste versionen, behåll ditt utkast och granska förhandsvisningen före nästa sparande.</Text>
                {templates.filter(template => template.periodId === draft.id && !template.archived).map(template => <Text key={template.id} style={styles.caption}>{template.name} · {template.startTime}{template.endTime ? `–${template.endTime}` : ''}</Text>)}
                <TouchableOpacity style={styles.secondary} disabled={blocked} accessibilityRole="button" accessibilityLabel="Använd senaste versionen och behåll mitt utkast" onPress={() => {
                  setDraft(current => {
                    if (!current) return current;
                    const added = templates.filter(template => template.periodId === current.id && !current.templates.some(row => row.id === template.id));
                    return { ...current, expectedRevision: latestDraftPeriod.revision,
                      templates: [...current.templates, ...added].map((template, sortOrder) => ({ ...template, sortOrder })),
                    };
                  });
                  setError(null);
                }}><Text style={styles.link}>Använd senaste versionen · behåll mitt utkast</Text></TouchableOpacity>
              </View> : null}
              <Text style={styles.fieldLabel}>Periodens namn</Text>
              <TextInput style={styles.input} accessibilityLabel="Periodens namn" placeholder="Till exempel Vinter 2026/27" placeholderTextColor={palette.mutedText} maxLength={120} value={draft.name} editable={!blocked} onChangeText={name => setDraft(current => current ? { ...current, name } : current)} />
              <Text style={styles.fieldLabel}>Startdatum</Text>
              <DateTimeField scopeKey={scopeKey} mode="date" label="Periodens startdatum" placeholder="ÅÅÅÅ-MM-DD" value={draft.dateFrom} editable={!blocked} style={styles.input} onChangeText={dateFrom => setDraft(current => current ? { ...current, dateFrom } : current)} />
              <Text style={styles.fieldLabel}>Slutdatum</Text>
              <DateTimeField scopeKey={scopeKey} mode="date" label="Periodens slutdatum" placeholder="ÅÅÅÅ-MM-DD" value={draft.dateTo} editable={!blocked} style={styles.input} onChangeText={dateTo => setDraft(current => current ? { ...current, dateTo } : current)} />
              <Text style={styles.caption}>Båda datumen ingår. Högst ett år per period.</Text>
              <Text style={styles.sectionTitle}>Dagliga pass</Text>
              <Text style={styles.body}>Förslagen nedan kan ändras. Lägg till så många olika pass som stallet behöver.</Text>
              {draft.templates.map(template => {
                const index = draftTemplates.findIndex(item => item.id === template.id) + 1;
                return template.archived ? <View key={template.id} style={styles.archived}>
                  <Text style={styles.caption}>{template.name} · arkiverat, historiken finns kvar</Text>
                  <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={() => updateTemplate(template.id, { archived: false })} accessibilityRole="button" accessibilityLabel={`Återställ passmall ${template.name}`}><Text style={styles.link}>Återställ</Text></TouchableOpacity>
                </View> : <View key={template.id} style={styles.templateEditor}>
                  <View style={styles.sectionHeader}><Text style={styles.fieldLabel}>Pass {index}</Text>
                    <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={() => updateTemplate(template.id, { archived: true })} accessibilityRole="button" accessibilityLabel={`Arkivera pass ${index}`}><Feather name="trash-2" size={16} color={palette.secondaryText} /><Text style={styles.caption}>Ta bort</Text></TouchableOpacity>
                  </View>
                  <TextInput style={styles.input} accessibilityLabel={`Pass ${index}, namn`} placeholder="Namn på passet" value={template.name} maxLength={120} editable={!blocked} onChangeText={name => updateTemplate(template.id, { name })} />
                  <View style={styles.timeRow}>
                    <View style={styles.timeField}><Text style={styles.fieldLabel}>Starttid</Text><DateTimeField scopeKey={scopeKey} mode="time" label={`Pass ${index}, starttid`} placeholder="07:00" value={template.startTime} editable={!blocked} style={styles.input} onChangeText={startTime => updateTemplate(template.id, { startTime })} /></View>
                    <View style={styles.timeField}><Text style={styles.fieldLabel}>Sluttid, valfri</Text><DateTimeField scopeKey={scopeKey} mode="time" label={`Pass ${index}, sluttid`} placeholder="08:00" value={template.endTime ?? ''} editable={!blocked} allowClear style={styles.input} onChangeText={endTime => updateTemplate(template.id, { endTime })} /></View>
                  </View>
                  <TextInput style={[styles.input, styles.instructions]} accessibilityLabel={`Pass ${index}, instruktioner`} placeholder="Instruktioner för detta pass" value={template.instructions} maxLength={2000} multiline editable={!blocked} onChangeText={instructions => updateTemplate(template.id, { instructions })} />
                </View>;
              })}
              <TouchableOpacity style={styles.secondary} disabled={blocked} onPress={() => setDraft(current => current ? { ...current, templates: [...current.templates, { id: generateId(), name: '', startTime: '', instructions: '', sortOrder: Math.max(-1, ...current.templates.map(template => template.sortOrder)) + 1 }] } : current)} accessibilityRole="button" accessibilityLabel="Lägg till pass">
                <Feather name="plus" size={18} color={palette.primary} /><Text style={styles.link}>Lägg till pass</Text>
              </TouchableOpacity>
              <View style={styles.preview}>
                <Text style={styles.fieldLabel}>Förhandsvisning</Text>
                <Text style={styles.previewCount}>{preview?.error ? 'Välj periodens datum' : `${preview?.days} dagar · ${preview?.total} pass`}</Text>
                {!preview?.error ? <Text style={styles.caption}>{staffedPreview} bemannade · {Math.max(0, (preview?.total ?? 0) - staffedPreview)} lediga</Text> : null}
                <Text style={styles.caption}>{futureBookings.length} framtida bokade pass · {affectedBookings} berörs av dina ändringar</Text>
                <Text style={styles.caption}>Nya pass lämnas lediga tills en ansvarig väljs. Klara, påbörjade pass och enskilda undantag bevaras.</Text>
              </View>
              <TouchableOpacity style={[styles.primary, (blocked || draftOutdated) && styles.disabled]} disabled={blocked || draftOutdated} onPress={() => void savePeriod()} accessibilityRole="button" accessibilityLabel={draft.expectedRevision ? 'Spara och uppdatera passen' : 'Skapa passen'}>
                <Text style={styles.primaryText}>{blocked ? 'Sparar schemat…' : draft.expectedRevision ? 'Spara och uppdatera passen' : 'Skapa passen'}</Text>
              </TouchableOpacity>
              {selected?.id === draft.id && selected.status !== 'ready' ? <TouchableOpacity style={styles.secondary} disabled={blocked} onPress={() => void resumePeriod()} accessibilityRole="button" accessibilityLabel="Återuppta skapandet"><Text style={styles.link}>Återuppta skapandet av sparad period</Text></TouchableOpacity> : null}
            </Card> : null}
            {selected && !draft ? <>
              {selected.status !== 'ready' ? <Card style={styles.card}>
                <Text style={styles.cardTitle}>Perioden är inte färdig</Text><Text style={styles.body}>Pass och veckoval blir aktiva när alla pass har skapats.</Text>
                {owner ? <TouchableOpacity style={styles.primary} disabled={blocked} onPress={() => void resumePeriod()} accessibilityRole="button" accessibilityLabel="Återuppta skapandet"><Text style={styles.primaryText}>Återuppta skapandet</Text></TouchableOpacity> : <Text style={styles.caption}>Stallägaren behöver slutföra skapandet.</Text>}
              </Card> : null}
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{owner ? 'Fast veckofördelning' : 'Mina fasta veckopass'}</Text>
                {owner ? <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={editPeriod} accessibilityRole="button" accessibilityLabel="Ändra period och pass"><Text style={styles.link}>Ändra period</Text></TouchableOpacity> : null}
              </View>
              <Text style={styles.body}>{owner ? 'Tilldela veckodagar till en medlem, lämna ledigt eller öppna för egna val. Ägarens beslut har företräde.' : 'Välj egna veckodagar för varje pass. Upptagna och ägarstyrda veckoval visas tydligt.'}</Text>
              <Text style={styles.caption}>Förändringar gäller från valt datum till {selected.dateTo}. Enskilda undantag behålls.</Text>
              {periodTemplates.map(template => {
                const expanded = expandedId === template.id;
                const unavailable = selected.status !== 'ready' || selected.dateTo < today;
                const selectedRules = selectedDays.map(day => resolveWeeklyRule(rules, template.id, day, effectiveFrom));
                const canRelease = selectedDays.length > 0 && selectedRules.every(rule => rule?.assigneeId === currentUserId && !rule.ownerControlled);
                return <Card key={template.id} style={styles.weekCard}>
                  <TouchableOpacity style={styles.templateHeader} disabled={blocked} onPress={() => expandTemplate(template.id)} accessibilityRole="button" accessibilityLabel={`Välj veckodagar för ${template.name}`} accessibilityState={{ expanded }} aria-expanded={expanded}>
                    <View style={styles.templateIcon}><Feather name="clock" size={19} color={palette.primary} /></View>
                    <View style={styles.flex}><Text style={styles.cardTitle}>{template.name}</Text><Text style={styles.caption}>{template.startTime}{template.endTime ? `–${template.endTime}` : ''} · varje dag</Text></View>
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={palette.secondaryText} />
                  </TouchableOpacity>
                  {expanded ? <View style={styles.weekForm}>
                    <Text style={styles.body}>{template.instructions || 'Inga särskilda instruktioner.'}</Text>
                    <Text style={styles.fieldLabel}>Veckoval från datum</Text>
                    <DateTimeField scopeKey={scopeKey} mode="date" label="Veckoval från datum" value={effectiveFrom} onChangeText={setEffectiveFrom} editable={!blocked && !unavailable} placeholder="ÅÅÅÅ-MM-DD" style={styles.input} />
                    {owner ? <><Text style={styles.fieldLabel}>Ansvarig för valda veckodagar</Text><View style={styles.memberChoices}>
                      <TouchableOpacity style={[styles.member, assigneeId === null && styles.selected]} disabled={blocked} onPress={() => setAssigneeId(null)} accessibilityRole="button" accessibilityLabel="Lämna ledigt" aria-pressed={assigneeId === null}><Text style={styles.memberText}>Ledigt</Text></TouchableOpacity>
                      {members.map(member => <TouchableOpacity key={member.id} style={[styles.member, assigneeId === member.id && styles.selected]} disabled={blocked} onPress={() => setAssigneeId(member.id)} accessibilityRole="button" accessibilityLabel={`Välj ansvarig ${member.name}`} aria-pressed={assigneeId === member.id}><Text style={styles.memberText}>{member.id === currentUserId ? `${member.name} (jag)` : member.name}</Text></TouchableOpacity>)}
                    </View></> : null}
                    <View style={styles.weekdays}>
                      {weekdays.map(day => {
                        const rule = resolveWeeklyRule(rules, template.id, day.value, effectiveFrom);
                        const futureOwnerRule = rules.find(row => row.templateId === template.id && row.weekday === day.value && row.effectiveFrom > effectiveFrom && row.ownerControlled);
                        const controlled = Boolean(rule?.ownerControlled || futureOwnerRule);
                        const mine = rule?.assigneeId === currentUserId;
                        const dayBlocked = blocked || unavailable || !canChoose || (!owner && (controlled || Boolean(rule?.assigneeId && !mine)));
                        const selectedDay = selectedDays.includes(day.value);
                        const name = rule?.assigneeId ? users[rule.assigneeId]?.name ?? 'Annan medlem' : controlled ? 'Ledigt · ägarens beslut' : 'Ledigt';
                        return <TouchableOpacity key={day.value} style={[styles.weekday, selectedDay && styles.selected, dayBlocked && styles.weekdayDisabled]} disabled={dayBlocked} onPress={() => setSelectedDays(current => selectedDay ? current.filter(value => value !== day.value) : [...current, day.value].sort((a, b) => a - b))} accessibilityRole="button" accessibilityLabel={`${template.name}, ${day.label}`} aria-pressed={selectedDay} accessibilityState={{ disabled: dayBlocked, selected: selectedDay }}>
                          <View style={styles.flex}><Text style={styles.dayLabel}>{day.label.charAt(0).toUpperCase() + day.label.slice(1)}</Text><Text style={styles.caption}>{mine ? `${name} · jag` : name}</Text>
                            {controlled ? <View style={styles.lockLabel}><Feather name="lock" size={11} color={palette.secondaryText} /><Text style={styles.lockText}>Tilldelat av stallägaren</Text></View> : null}
                            {futureOwnerRule ? <Text style={styles.caption}>Ägarens val från {futureOwnerRule.effectiveFrom}</Text> : null}
                          </View><Feather name={selectedDay ? 'check-circle' : mine ? 'user-check' : 'circle'} size={21} color={selectedDay || mine ? palette.primary : palette.border} />
                        </TouchableOpacity>;
                      })}
                    </View>
                    {unavailable ? <Text style={styles.caption}>{selected.status !== 'ready' ? 'Slutför skapandet före veckoval.' : 'Perioden har avslutats. Tidigare pass behålls.'}</Text> : null}
                    {canChoose && !unavailable ? <>
                      <TouchableOpacity style={[styles.primary, (blocked || !selectedDays.length) && styles.disabled]} disabled={blocked || !selectedDays.length} onPress={() => void saveWeekly('assign')} accessibilityRole="button" accessibilityLabel={owner ? 'Tilldela valda veckodagar' : 'Ta valda veckodagar'}><Text style={styles.primaryText}>{pending ? 'Sparar veckoval…' : owner ? 'Tilldela valda veckodagar' : 'Ta valda veckodagar'}</Text></TouchableOpacity>
                      {owner ? <TouchableOpacity style={styles.secondary} disabled={blocked || !selectedDays.length} onPress={() => void saveWeekly('unlock')} accessibilityRole="button" accessibilityLabel="Öppna valda veckodagar för egna val"><Text style={styles.link}>Öppna valda veckodagar för egna val</Text></TouchableOpacity> : <TouchableOpacity style={[styles.secondary, !canRelease && styles.disabled]} disabled={blocked || !canRelease} onPress={() => void saveWeekly('release')} accessibilityRole="button" accessibilityLabel="Släpp valda veckodagar"><Text style={styles.link}>Släpp valda veckodagar</Text></TouchableOpacity>}
                    </> : !canChoose ? <Text style={styles.caption}>Din roll kan läsa schemat. Stallägaren fördelar passen.</Text> : null}
                  </View> : null}
                </Card>;
              })}
              {selected.status === 'ready' ? <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Kommande pass i perioden</Text>
                <Text style={styles.caption}>Öppna ett datum för att ändra bara det passet eller kommande veckodag.</Text>
                {upcoming.map(item => <TouchableOpacity key={item.id} style={styles.occurrence} onPress={() => setOccurrenceId(item.id)} disabled={blocked} accessibilityRole="button" accessibilityLabel={`Ändra ${item.label} ${item.date}`}>
                  <View style={styles.flex}><Text style={styles.fieldLabel}>{item.label}</Text><Text style={styles.caption}>{item.date} · {item.time}{seriesEndTime(item.note) ? `–${seriesEndTime(item.note)}` : ''}</Text><Text style={styles.caption}>{item.assigneeId ? users[item.assigneeId]?.name ?? 'Annan medlem' : 'Ledigt'}{item.isScheduleOverride ? ' · enskilt ändrat' : ''}</Text></View><Feather name="chevron-right" size={18} color={palette.secondaryText} />
                </TouchableOpacity>)}
                {!upcoming.length ? <Text style={styles.body}>Inga kommande pass i perioden. Manuella pass visas i Schema.</Text> : null}
                <TouchableOpacity style={styles.textButton} disabled={blocked} onPress={() => router.push('/calendar')} accessibilityRole="button" accessibilityLabel="Visa hela schemat"><Text style={styles.link}>Visa hela schemat</Text></TouchableOpacity>
              </Card> : null}
            </> : null}
          </ScrollView>
        </KeyboardAvoidingView>
        {occurrence && occurrencePeriod ? <SeasonOccurrenceModal key={`${scopeKey}:${occurrence.id}`} scopeKey={scopeKey} assignment={occurrence} period={occurrencePeriod} currentUserId={currentUserId} owner={owner} canChoose={canChoose} members={members} busy={blocked} onClose={() => setOccurrenceId(null)} onWeekly={weeklyFromOccurrence} onSubmit={schedule.editOccurrence} onSaved={() => { setOccurrenceId(null); setMessage('Passet är sparat.'); }} /> : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: 16 },
  content: { padding: 20, paddingTop: 10, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 740, alignSelf: 'center' },
  intro: { gap: 9, paddingVertical: 8 },
  eyebrow: { fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primary },
  heading: { fontFamily: theme.fonts.semibold, fontSize: 26, lineHeight: 33, color: palette.primaryText, letterSpacing: -0.5 },
  body: { fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 21, color: palette.secondaryText },
  caption: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 18, color: palette.secondaryText },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontFamily: theme.fonts.medium, fontSize: 17, lineHeight: 23, color: palette.primaryText, flexShrink: 1 },
  smallButton: { flexDirection: 'row', gap: 5, minHeight: 44, alignItems: 'center', paddingHorizontal: 8 },
  link: { fontFamily: theme.fonts.medium, fontSize: 13, lineHeight: 19, color: palette.primary },
  textButton: { flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  card: { padding: 18, gap: 12, borderRadius: 20 },
  cardTitle: { fontFamily: theme.fonts.medium, fontSize: 15, lineHeight: 22, color: palette.primaryText },
  period: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 78, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border },
  selected: { borderColor: palette.primaryText, backgroundColor: palette.surfaceMuted },
  periodStatus: { fontFamily: theme.fonts.medium, fontSize: 11, color: palette.primary },
  warning: { color: palette.warning },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  empty: { padding: 22, gap: 12, borderRadius: 20 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: theme.fonts.regular, fontSize: 16, color: palette.primaryText, backgroundColor: palette.surface, minWidth: 0 },
  fieldLabel: { fontFamily: theme.fonts.medium, fontSize: 13, color: palette.primaryText },
  templateEditor: { paddingTop: 14, gap: 10, borderTopWidth: 1, borderTopColor: palette.borderMuted },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 7, minWidth: 0 },
  instructions: { minHeight: 74, textAlignVertical: 'top' },
  archived: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  preview: { backgroundColor: palette.surfaceMuted, borderRadius: 14, padding: 16, gap: 7 },
  versionChoice: { backgroundColor: theme.tints.warning, borderRadius: 14, padding: 16, gap: 9 },
  previewCount: { fontFamily: theme.fonts.semibold, fontSize: 23, color: palette.primaryText },
  primary: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: theme.fonts.medium, fontSize: 14, lineHeight: 20, color: palette.primaryText, textAlign: 'center' },
  secondary: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  disabled: { opacity: 0.5 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10 },
  progress: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: palette.surfaceMuted },
  errorBox: { backgroundColor: theme.tints.error, padding: 14, borderRadius: 14, gap: 4 },
  error: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 19, color: palette.error },
  success: { fontFamily: theme.fonts.medium, fontSize: 14, lineHeight: 21, color: palette.success },
  weekCard: { padding: 0, borderRadius: 18, overflow: 'hidden' },
  templateHeader: { minHeight: 78, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center' },
  templateIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  weekForm: { padding: 16, paddingTop: 0, gap: 12 },
  memberChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  member: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: palette.border, justifyContent: 'center' },
  memberText: { fontFamily: theme.fonts.regular, fontSize: 13, color: palette.primaryText },
  weekdays: { gap: 7 },
  weekday: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  weekdayDisabled: { backgroundColor: palette.surfaceMuted },
  dayLabel: { fontFamily: theme.fonts.medium, fontSize: 13, color: palette.primaryText },
  lockLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontFamily: theme.fonts.regular, fontSize: 11, lineHeight: 17, color: palette.secondaryText },
  occurrence: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.borderMuted },
});
