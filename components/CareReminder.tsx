import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData, type CareEvent } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { isQaDemoMode } from '@/lib/qaDemo';
import { DateTimeField } from '@/components/DateTimeField';
import { generateId } from '@/lib/ids';
import {
  careReminderPreview, careReminderScopeKey, emptyCareReminderDraft, matchesCareReminderReceipt,
  type CareReminderAnchor, type CareReminderDraft, type CareReminderPlan,
  type CareReminderRecipient, type CareReminderSaveResult, type CareReminderScope,
  type CareReminderStoredPlan, type CareReminderSnapshot, readCareReminder, saveCareReminder, stockholmToday,
} from '@/lib/careReminders';

const palette = theme.colors;

export type CareReminderProps = {
  scope: CareReminderScope;
  event: CareReminderAnchor | null;
  horseName: string;
  recipients: CareReminderRecipient[];
  canEdit: boolean;
  today: string;
  onSave: (plan: CareReminderPlan) => Promise<CareReminderSaveResult>;
  initialPlan?: CareReminderStoredPlan | null;
  saveTimeoutMs?: number;
};

export function CareReminderFields(props: CareReminderProps) {
  // A new account/login epoch, horse, stable or event gets its own blank form.
  return <CareReminderForm key={careReminderScopeKey(props.scope, props.event, props.canEdit)} {...props} />;
}

function CareReminderForm({ scope, event, horseName, recipients, canEdit, today, onSave, initialPlan = null, saveTimeoutMs = 15_000 }: CareReminderProps) {
  const [draft, setDraft] = React.useState<CareReminderDraft>(() => initialPlan ? { nextDate: initialPlan.nextDate, recipientUserIds: [...initialPlan.recipientUserIds] } : emptyCareReminderDraft());
  const [phase, setPhase] = React.useState<'idle' | 'saving' | 'rejected' | 'uncertain' | 'saved'>('idle');
  const [reason, setReason] = React.useState<string | null>(null);
  const draftRef = React.useRef(draft);
  const revision = React.useRef<string | null>(initialPlan?.requestId ?? null);
  const attempt = React.useRef<CareReminderPlan | null>(null);
  const pending = React.useRef(false);
  const uncertain = React.useRef(false);
  const alive = React.useRef(true);
  const current = React.useRef({ recipients, today, onSave });
  React.useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useLayoutEffect(() => { current.current = { recipients, today, onSave }; }, [recipients, today, onSave]);
  const locked = phase === 'saving' || phase === 'uncertain';
  const people = recipients.filter(person => person.stableId === scope.stableId);
  const eligibleEvent = event?.stableId === scope.stableId && event.horseIds.includes(scope.horseId) && event.status !== 'cancelled';
  const preview = careReminderPreview(scope, event, draft, recipients, today);

  const changeDraft = (updates: Partial<CareReminderDraft>) => {
    if (!alive.current || pending.current || uncertain.current) return;
    const next = { ...draftRef.current, ...updates };
    draftRef.current = next;
    attempt.current = null;
    setDraft(next);
    setPhase('idle');
    setReason(null);
  };

  const handleSave = async () => {
    if (!alive.current || pending.current || !canEdit) return;
    const checked = careReminderPreview(scope, event, draftRef.current, current.current.recipients, current.current.today);
    if (!checked.success) { setReason(checked.reason); return; }
    const plan = attempt.current ?? { ...checked.data, expectedRevision: revision.current,
      recipientUserIds: [...checked.data.recipientUserIds], requestId: generateId() };
    attempt.current = plan;
    pending.current = true;
    setPhase('saving');
    setReason(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<CareReminderSaveResult>(resolve => {
        timer = setTimeout(() => resolve({ success: false, outcome: 'uncertain' }), saveTimeoutMs);
      });
      const result = await Promise.race([Promise.resolve().then(() => {
        if (!alive.current) return { success: false as const, outcome: 'uncertain' as const };
        const latest = current.current;
        const eligible = careReminderPreview(scope, event, draftRef.current, latest.recipients, latest.today);
        return eligible.success ? latest.onSave({ ...plan, recipientUserIds: [...plan.recipientUserIds] }) : { success: false as const, outcome: 'rejected' as const };
      }), timeout]);
      if (!alive.current) return;
      const eligible = careReminderPreview(scope, event, draftRef.current, current.current.recipients, current.current.today);
      if (result.success && matchesCareReminderReceipt(plan, result.data) && eligible.success) {
        uncertain.current = false;
        revision.current = plan.requestId;
        setPhase('saved');
      } else if (!result.success && result.outcome === 'rejected') {
        uncertain.current = false;
        setPhase('rejected');
        setReason('Påminnelsen kunde inte sparas. Dina val är kvar. Kontrollera datumet och vårdhändelsen eller läs aktuell plan igen.');
      } else {
        uncertain.current = true;
        setPhase('uncertain');
        setReason('Sparandet är inte bekräftat. Dina val är låsta tills samma förslag kan kontrolleras igen.');
      }
    } catch (error) {
      if (!alive.current) return;
      console.warn('[care reminder] Save outcome unknown', error instanceof Error ? 'Error' : 'Unknown');
      uncertain.current = true;
      setPhase('uncertain');
      setReason('Sparandet är inte bekräftat. Dina val är kvar. Försök igen med samma val.');
    } finally {
      if (timer) clearTimeout(timer);
      pending.current = false;
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>Nästa vårddatum</Text>
        <Text style={styles.tag}>Kl. 09 Stockholm</Text>
      </View>
      <Text style={styles.body}>Du anger datum och mottagare själv. Inga intervall eller personer väljs åt dig.</Text>
      {!eligibleEvent ? (
        <Text style={styles.empty}>{event?.status === 'cancelled' ? 'Den här vårdhändelsen är avbokad. Välj en annan händelse.' : 'Ingen vårdhändelse vald för hästen i det här stallet. Välj en befintlig händelse för att skapa en påminnelse.'}</Text>
      ) : (
        <>
          <View style={styles.anchor}>
            <Text style={styles.anchorTitle}>{horseName} · {event.title}</Text>
            <Text style={styles.body}>Utgår från vårdhändelsen {event.date}. Vårdhistoriken ändras inte.</Text>
          </View>
          {!canEdit ? <Text style={styles.empty}>Du har läsåtkomst. Ett datumförslag kan bara sparas av någon med rätt att ändra vårdhändelsen.</Text> : null}
          <Text style={styles.label}>Nästa datum</Text>
          <DateTimeField mode="date" label="Nästa datum" scopeKey={careReminderScopeKey(scope, event, canEdit)} accessibilityLabel="Nästa datum" value={draft.nextDate} onChangeText={nextDate => changeDraft({ nextDate })}
            editable={canEdit && !locked} placeholder="ÅÅÅÅ-MM-DD" placeholderTextColor={palette.secondaryText} style={styles.input} />
          <Text style={styles.help}>Påminnelsen planeras kl. 09.00 Europe/Stockholm på valt datum.</Text>
          <Text style={styles.label}>Välj mottagare</Text>
          {people.length ? people.map(person => {
            const selected = draft.recipientUserIds.includes(person.id);
            return <TouchableOpacity key={person.id} accessibilityRole="checkbox" accessibilityLabel={`Mottagare ${person.name}`}
              accessibilityState={{ checked: selected, disabled: !canEdit || locked }} aria-checked={selected} disabled={!canEdit || locked}
              onPress={() => changeDraft({ recipientUserIds: selected ? draft.recipientUserIds.filter(id => id !== person.id) : [...draft.recipientUserIds, person.id] })}
              activeOpacity={0.85} style={[styles.person, selected && styles.personSelected]}>
              <Text style={[styles.check, selected && styles.checkSelected]}>{selected ? '✓' : '○'}</Text>
              <Text style={styles.personName}>{person.name}</Text>
            </TouchableOpacity>;
          }) : <Text style={styles.empty}>Inga behöriga aktiva medlemmar finns att välja i det här stallet. Ingen väljs automatiskt.</Text>}
          {draft.recipientUserIds.some(id => !people.some(person => person.id === id)) ? (
            <View style={styles.notice}>
              <Text style={styles.body}>En vald mottagare finns inte längre i listan. Valet behöver uppdateras.</Text>
              <TouchableOpacity disabled={!canEdit || locked} accessibilityRole="button" onPress={() => changeDraft({ recipientUserIds: draft.recipientUserIds.filter(id => people.some(person => person.id === id)) })}>
                <Text style={styles.link}>Ta bort mottagare som saknas i listan</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Förhandsgranskning</Text>
            {preview.success ? <>
              <Text style={styles.previewDate}>Nästa datum: {preview.data.nextDate}</Text>
              <Text style={styles.body}>Påminnelsedatum: {preview.data.reminderDate} kl. 09.00 Stockholm</Text>
              <Text style={styles.body}>Till: {preview.data.recipientUserIds.map(id => people.find(person => person.id === id)?.name).join(', ')}</Text>
            </> : <Text style={styles.body}>Fyll i nästa datum och välj mottagare för att se förslaget.</Text>}
            <Text style={styles.help}>Sparad plan bekräftar inte leverans. Mottagarens påminnelsepreferens och aktiva enhetsregistrering gäller vid utskick.</Text>
          </View>
          {reason ? <Text accessibilityRole="alert" style={styles.error}>{reason}</Text> : null}
          {phase === 'saved' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Påminnelseplanen är sparad. Leverans är inte bekräftad.</Text> : null}
          <TouchableOpacity accessibilityRole="button" disabled={!canEdit || !people.length || phase === 'saving'} onPress={handleSave}
            activeOpacity={0.85} style={[styles.button, (!canEdit || !people.length || phase === 'saving') && styles.buttonDisabled]}>
            <Text style={styles.buttonText}>{phase === 'saving' ? 'Sparar…' : phase === 'uncertain' || phase === 'rejected' ? 'Försök igen med samma val' : 'Spara påminnelse'}</Text>
          </TouchableOpacity>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 19, fontWeight: '600', color: palette.primaryText },
  tag: { fontSize: 11, fontWeight: '600', color: palette.primary, backgroundColor: palette.accentSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  body: { color: palette.secondaryText, fontSize: 14, lineHeight: 21 },
  help: { color: palette.secondaryText, fontSize: 12, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600', color: palette.primaryText, marginTop: 3 },
  input: { borderWidth: 1, borderColor: palette.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: palette.primaryText, backgroundColor: palette.surface },
  anchor: { borderRadius: radius.sm, backgroundColor: palette.surfaceMuted, padding: 14, gap: 4 },
  anchorTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.border, borderRadius: radius.sm, padding: 12 },
  personSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
  check: { color: palette.secondaryText, fontSize: 19 },
  checkSelected: { color: palette.primary },
  personName: { fontSize: 14, color: palette.primaryText },
  notice: { padding: 12, gap: 8, backgroundColor: palette.surfaceMuted, borderRadius: radius.sm },
  link: { color: palette.primary, fontSize: 13, fontWeight: '600' },
  preview: { padding: 16, gap: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceTint },
  previewTitle: { fontSize: 13, fontWeight: '600', color: palette.secondaryText },
  previewDate: { fontSize: 16, fontWeight: '600', color: palette.primaryText },
  empty: { fontSize: 14, lineHeight: 21, color: palette.secondaryText, paddingVertical: 10 },
  error: { color: palette.error, fontSize: 14, lineHeight: 21 },
  success: { color: palette.success, fontSize: 14, lineHeight: 21 },
  button: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: palette.inverseText, fontSize: 14, fontWeight: '600' },
});


// This connected caller reuses current account/permission state without changing AuthContext.
export function CareReminder({ event, horseId, horseName }: { event: CareEvent; horseId: string; horseName: string }) {
  const { state, derived } = useAppData();
  const { user, loading, pendingAccountDeletionId } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [epoch, setEpoch] = React.useState(0);
  const accountEpoch = React.useRef({ userId: user?.id ?? null, value: 0 });
  React.useEffect(() => {
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      if (accountEpoch.current.userId === userId) return;
      accountEpoch.current = { userId, value: accountEpoch.current.value + 1 };
      if (alive) setEpoch(accountEpoch.current.value);
    });
    return () => { alive = false; accountEpoch.current = { ...accountEpoch.current, value: accountEpoch.current.value + 1 }; data.subscription.unsubscribe(); };
  }, []);
  const canRead = Boolean(user?.id && !loading && !pendingAccountDeletionId && user.id === state.currentUserId
    && user.id === state.sessionUserId && event.stableId === state.currentStableId
    && state.users[state.currentUserId]?.membership.some(entry => entry.stableId === event.stableId));
  const canEdit = canRead && derived.permissions.canManageCareEvents;
  const scope = React.useMemo(() => ({ accountId: user?.id ?? '', sessionEpoch: epoch,
    stableId: event.stableId, horseId }), [user?.id, epoch, event.stableId, horseId]);
  const eventSignature = JSON.stringify([event.id, event.date, event.status, event.horseIds]);
  const context = React.useMemo(() => ({ scope, canRead, canEdit, open, eventSignature }), [scope, canRead, canEdit, open, eventSignature]);
  const current = React.useRef<typeof context | null>(context);
  React.useLayoutEffect(() => { current.current = context; return () => { if (current.current === context) current.current = null; }; }, [context]);
  const [loaded, setLoaded] = React.useState<{ scope: CareReminderScope; retry: number; status: 'loading' | 'ready' | 'error'; snapshot?: CareReminderSnapshot } | null>(null);
  React.useEffect(() => {
    if (!open || !canRead || isQaDemoMode) return;
    let alive = true;
    const capturedEpoch = accountEpoch.current;
    const controller = new AbortController();
    const isCurrent = () => alive && current.current === context && context.canRead && context.open && accountEpoch.current === capturedEpoch;
    setLoaded({ scope, retry, status: 'loading' });
    const timeout = setTimeout(() => { controller.abort(); if (isCurrent()) setLoaded({ scope, retry, status: 'error' }); }, 15_000);
    void readCareReminder(scope, event.id, isCurrent, controller.signal).then(snapshot => {
      if (isCurrent()) setLoaded({ scope, retry, status: 'ready', snapshot });
    }).catch(() => {
      if (isCurrent()) { console.warn('[care reminder] Read could not be confirmed'); setLoaded({ scope, retry, status: 'error' }); }
    }).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [open, canRead, scope, event.id, context, retry]);
  if (event.status === 'cancelled') return <Text style={styles.empty}>Vårdhändelsen är avbokad. Ingen ny påminnelse kan planeras här.</Text>;
  const visible = loaded?.scope === scope && loaded.retry === retry ? loaded : null;
  const capturedEpoch = accountEpoch.current;
  const isCurrent = () => current.current === context && context.canEdit && context.open && accountEpoch.current === capturedEpoch;
  return <View style={{ gap: 10 }}>
    <TouchableOpacity accessibilityRole="button" disabled={!canRead} onPress={() => setOpen(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={styles.link}>{open ? 'Stäng påminnelse' : 'Nästa datum och påminnelse'}</Text>
    </TouchableOpacity>
    {!canRead ? <Text style={styles.empty}>Du behöver aktuell stallmedlemskap för att läsa vårdpåminnelsen.</Text> : !open ? null : isQaDemoMode ? (
      <Text style={styles.empty}>Demo: påminnelser sparas inte och inga push-anrop görs. Det granskade formuläret provas separat med syntetisk transport.</Text>
    ) : visible?.status === 'error' ? <View>
      <Text accessibilityRole="alert" style={styles.error}>Påminnelseplanen eller mottagarna kunde inte läsas. Inga nya val har sparats.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44 }}><Text style={styles.link}>Försök läsa igen</Text></TouchableOpacity>
    </View> : visible?.status !== 'ready' || !visible.snapshot ? <Text accessibilityLiveRegion="polite" style={styles.body}>Läser påminnelseplan och behöriga mottagare…</Text> : <>
      {visible.snapshot.plan ? <Text style={styles.body}>Sparad plan: {visible.snapshot.plan.nextDate} kl. 09.00 Stockholm · {visible.snapshot.plan.state === 'scheduled' ? 'Planerad' : visible.snapshot.plan.state === 'held' ? 'Stoppad: behörighet, vårdankare eller aktiv enhet behöver kontrolleras' : visible.snapshot.plan.state === 'submitted' ? 'Providerkvittens finns, telefonleverans är inte bekräftad' : 'Utskickets utfall är inte bekräftat; inga automatiska nya försök'}</Text> : null}
      <CareReminderFields key={JSON.stringify([careReminderScopeKey(scope, visible.snapshot.anchor, canEdit), retry])}
        scope={scope} event={visible.snapshot.anchor} horseName={horseName} recipients={visible.snapshot.recipients}
        canEdit={canEdit && visible.snapshot.plan?.state !== 'dispatch_unknown'} today={stockholmToday()} initialPlan={visible.snapshot.plan}
        onSave={plan => saveCareReminder(plan, isCurrent)} />
      <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44 }}><Text style={styles.link}>Läs aktuell sparad plan (ersätter utkastet)</Text></TouchableOpacity>
    </>}
  </View>;
}
