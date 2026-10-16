import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { generateId } from '@/lib/ids';
import { type AccountMediaStatus, type AccountMediaRequest, type AccountMediaResult } from '@/lib/accountMedia';

const palette = theme.colors;
export type AccountMediaProps = {
  userId: string;
  sessionEpoch: object;
  receipt: AccountMediaStatus | null;
  ownerId: string | null;
  journalGeneration?: string;
  onAction: (request: AccountMediaRequest, isCurrent: () => boolean) => Promise<AccountMediaResult>;
  requestTimeoutMs?: number;
  onReload: () => void;
};
export function AccountMedia(props: AccountMediaProps) {
  const [phase, setPhase] = React.useState<'idle' | 'confirm' | 'pending' | 'uncertain' | 'done'>('idle');
  const [reason, setReason] = React.useState<string | null>(null);
  const [attemptCount, setAttemptCount] = React.useState(0);
  const [nextOwner, setNextOwner] = React.useState<string | null>(null);
  const ownerGeneration = React.useRef<{ owner: string; generation: string } | null>(null);
  const alive = React.useRef(true);
  const pending = React.useRef(false);
  const attempt = React.useRef<AccountMediaRequest | null>(null);
  const tries = React.useRef(0);
  const observed = React.useRef<AccountMediaStatus['own'] | null>(null);
  const scope = React.useMemo(() => ({ userId: props.userId, sessionEpoch: props.sessionEpoch }), [props.userId, props.sessionEpoch]);
  const initialGeneration = React.useMemo(() => ({ scope, id: generateId() }), [scope]);
  const current = React.useRef({ scope, props });
  current.current = { scope, props };
  React.useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useLayoutEffect(() => { attempt.current = null; observed.current = null; tries.current = 0; pending.current = false; setAttemptCount(0); setPhase('idle'); setReason(null); setNextOwner(null); ownerGeneration.current = null; }, [scope]);
  const receipt = props.receipt?.user_id === props.userId ? props.receipt : null;
  const own = receipt?.own;
  const total = own ? own.delete_count + own.transfer_count : 0;
  React.useEffect(() => {
    const request = attempt.current;
    if (!request || pending.current || !receipt || receipt.blocked_count > 0 || receipt.user_id !== request.expected_user_id) return;
    const target = request.action === 'transfer_shared_media' ? receipt.incoming.find(plan => plan.plan_id === request.media_plan_id) : receipt.own;
    const before = observed.current;
    const same = target && target.replacement_user_id === request.replacement_user_id && target.plan_generation === (request.next_plan_generation ?? request.media_plan_generation);
    const prepared = same && (request.action === 'prepare_media' ? target.plan_id !== null
      : request.action === 'reselect_media_owner' && target.plan_id === request.media_plan_id);
    const advanced = same && target.plan_id === request.media_plan_id && before && target.delete_count === before.delete_count && target.transfer_count === before.transfer_count
      && (request.action === 'transfer_shared_media' ? target.copied_count > before.copied_count && target.next_copy_item_id !== request.media_item_id
        : request.action === 'remove_own_media' && target.removed_count > before.removed_count && target.next_remove_item_id !== request.media_item_id);
    if (prepared || advanced) { attempt.current = null; observed.current = null; tries.current = 0; setAttemptCount(0); setPhase('idle'); setReason('Samma filåtgärd har nu verifierats. Nästa steg kräver ett nytt uttryckligt val.'); }
  }, [receipt, phase]);

  const run = async (request: AccountMediaRequest) => {
    if (!alive.current || current.current.scope !== scope || pending.current || tries.current >= 3) return;
    const fresh = current.current.props.receipt;
    if (!fresh || fresh.user_id !== request.expected_user_id || fresh.complete !== true) return;
    if (request.action === 'prepare_media' && (current.current.props.ownerId !== request.replacement_user_id || fresh.blocked_count > 0 || fresh.own.plan_id !== null ||
      (fresh.requires_owner && !request.replacement_user_id) || (request.replacement_user_id !== null &&
        !fresh.replacement_owners.some(person => person.user_id === request.replacement_user_id)))) {
      setReason('Filplanen eller den valda ägaren är inte längre verifierad. Kontrollera status. Inga filer har ändrats.'); return;
    }
    const target = request.action === 'transfer_shared_media' ? fresh.incoming.find(plan => plan.plan_id === request.media_plan_id) : fresh.own;
    if (request.action === 'reselect_media_owner' && (!target?.reselect_allowed || target.plan_generation !== request.media_plan_generation
      || target.replacement_user_id !== request.expected_replacement_user_id || !fresh.replacement_owners.some(person => person.user_id === request.replacement_user_id))) {
      setReason('Omval är bara möjligt innan någon filåtgärd har reserverats och med en aktuell verifierad ägare.'); return;
    }
    if (request.action !== 'prepare_media' && (!target || target.plan_id !== request.media_plan_id || target.plan_generation !== request.media_plan_generation ||
      (request.action !== 'reselect_media_owner' && (request.action === 'transfer_shared_media' ? target.next_copy_item_id : target.next_remove_item_id) !== request.media_item_id))) {
      setReason('Den här bildåtgärden är inte längre aktuell. Kontrollera status.'); return;
    }
    const sameAttempt = attempt.current && JSON.stringify(attempt.current) === JSON.stringify(request);
    if (attempt.current && !sameAttempt && tries.current > 0) {
      setReason('Ett tidigare utfall är okänt. Kontrollera samma filplan innan en annan åtgärd startas.'); return;
    }
    if ((phase !== 'confirm' && phase !== 'uncertain') || !sameAttempt) { attempt.current = { ...request }; observed.current = target ? { ...target } : null; setPhase('confirm'); setReason(null); return; }
    const canonical = attempt.current ?? { ...request };
    attempt.current = canonical;
    pending.current = true; tries.current += 1; setAttemptCount(tries.current); setPhase('pending'); setReason(null);
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => alive.current && current.current.scope === scope && !expired;
    try {
      const deadline = new Promise<AccountMediaResult>(resolve => { timer = setTimeout(() => { expired = true; resolve({ success: false, outcome: 'uncertain' }); }, props.requestTimeoutMs ?? 15_000); });
      const result = await Promise.race([Promise.resolve().then(() => isCurrent()
        ? current.current.props.onAction({ ...canonical }, isCurrent) : { success: false as const, outcome: 'uncertain' as const }), deadline]);
      if (!alive.current || current.current.scope !== scope) return;
      if (result.success) { attempt.current = null; tries.current = 0; setAttemptCount(0); setPhase('done'); current.current.props.onReload(); }
      else { setPhase('uncertain'); setReason('Åtgärden är inte bekräftad. Samma ägare och bild är låsta vid återförsök. Kontrollera status; kontot har inte raderats.'); }
    } catch (error) {
      console.warn('[account media] UI acknowledgement unconfirmed', error instanceof Error ? 'Error' : 'Unknown');
      if (alive.current && current.current.scope === scope) { setPhase('uncertain'); setReason('Svaret saknas. Samma filplan ska kontrolleras igen. Kontot har inte raderats.'); }
    } finally { if (timer !== undefined) clearTimeout(timer); expired = true; if (current.current.scope === scope) pending.current = false; }
  };
  const request = (action: AccountMediaRequest['action'], planId: string | null, itemId: string | null, ownerId: string | null = props.ownerId): AccountMediaRequest => {
    const target = action === 'transfer_shared_media' ? receipt?.incoming.find(plan => plan.plan_id === planId) : own;
    if (action === 'reselect_media_owner' && ownerId && ownerGeneration.current?.owner !== ownerId) ownerGeneration.current = { owner: ownerId, generation: generateId() };
    return { action, expected_user_id: props.userId, replacement_user_id: ownerId, media_plan_id: planId, media_item_id: itemId,
      media_plan_generation: target?.plan_generation ?? props.journalGeneration ?? initialGeneration.id,
      expected_replacement_user_id: target?.replacement_user_id ?? null, next_plan_generation: action === 'reselect_media_owner' ? ownerGeneration.current?.generation ?? null : null };
  };
  const button = (label: string, value: AccountMediaRequest, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled || phase === 'pending' || tries.current >= 3} onPress={() => run(value)} style={[styles.button, (disabled || phase === 'pending' || tries.current >= 3) && styles.disabled]}>
    <Text style={styles.buttonText}>{phase === 'pending' ? 'Kontrollerar bildåtgärd…' : phase === 'confirm' ? 'Tryck igen för att bekräfta' : phase === 'uncertain' ? 'Försök igen med samma bild' : label}</Text>
  </TouchableOpacity>;
  return <View style={styles.panel}>
    <Text style={styles.title}>Bilder före kontoradering</Text>
    <Text style={styles.body}>Dina egna inläggsbilder, din profilbild och oanvända egna uppladdningar tas bort. Andras innehåll samt häst- och hagebilder bevaras. Delade bilder kopieras till den valda nya ägarens konto innan dina gamla kopior tas bort.</Text>
    {!receipt ? <Text accessibilityRole="alert" style={styles.body}>Filstatus är okänd. Kontrollera status; inga filer eller konton ändras.</Text> : <>
      <View style={styles.preview}><Text style={styles.body}>Egna bilder att ta bort: {own?.delete_count ?? 0} · Delade bilder att överlåta: {own?.transfer_count ?? 0}</Text>
        {receipt.blocked_count > 0 ? <Text accessibilityRole="alert" style={styles.error}>Stopp: {receipt.blocked_count} fil- eller bildreferenser kan inte tillskrivas säkert. Okända eller ofullständiga filer ändras inte.</Text> : null}
        {own?.plan_id ? <Text style={styles.body}>Överförda till ny ägare: {own.copied_count} av {own.transfer_count} · Gamla kopior borttagna: {own.removed_count} av {total}. Vald ägare är fast för filplanen.</Text> : <Text style={styles.body}>Ingen filplan har förberetts. Ägaren väljs uttryckligen ovan; den valda personen måste vara aktiv ägare i alla berörda stall.</Text>}
      </View>
      {receipt.blocked_count === 0 && total === 0 ? <Text style={styles.body}>Inga egna bilder behöver hanteras enligt den verifierade inventeringen. Andras bilder berörs inte.</Text> : null}
      {receipt.blocked_count === 0 && total > 0 && own?.state === 'not_started' ? <>
        <Text style={styles.body}>Förberedelsen låser samma ägarval och stoppar nya uppladdningar för ditt konto. Ingen automatisk annullering eller ändring av planen görs.</Text>
        {button('Förbered filplan med vald ägare', request('prepare_media', null, null), receipt.requires_owner && (!props.ownerId || !receipt.replacement_owners.some(person => person.user_id === props.ownerId)))}
      </> : null}
      {own?.plan_id && own.reselect_allowed ? <View style={styles.preview}>
        <Text style={styles.body}>Ingen filåtgärd har reserverats. Du kan välja en annan verifierad ägare uttryckligen. Den tidigare planen behåller sitt ID; äldre anrop kan inte ändra det nya valet.</Text>
        {receipt.replacement_owners.filter(person => person.user_id !== own.replacement_user_id).map(person => <TouchableOpacity key={person.user_id}
          accessibilityRole="radio" accessibilityState={{ checked: nextOwner === person.user_id }} aria-checked={nextOwner === person.user_id}
          disabled={phase === 'pending' || tries.current > 0} onPress={() => { if (!alive.current || current.current.scope !== scope || pending.current || tries.current > 0) return;
            const fresh = current.current.props.receipt; if (!fresh?.own.reselect_allowed || !fresh.replacement_owners.some(candidate => candidate.user_id === person.user_id)) return;
            setNextOwner(person.user_id); }}><Text style={styles.link}>{nextOwner === person.user_id ? 'Vald: ' : 'Välj: '}{person.display_name}</Text></TouchableOpacity>)}
        {!receipt.replacement_owners.some(person => person.user_id !== own.replacement_user_id) ? <Text style={styles.body}>Ingen annan aktiv ägare är verifierad i alla berörda stall. Inget omval görs automatiskt.</Text> : null}
        {button('Bekräfta nytt ägarval före första filåtgärden', request('reselect_media_owner', own.plan_id, null, nextOwner), !nextOwner || nextOwner === own.replacement_user_id)}
      </View> : own?.plan_id ? <Text accessibilityRole="alert" style={styles.body}>Omval är stoppat: en filåtgärd har redan reserverats eller genomförts. Kontrollera och återförsök samma bild. Om den valda ägaren är borta krävs en särskilt granskad återhämtningsplan; inget annat konto eller ägarval används automatiskt.</Text> : null}
      {own?.next_copy_item_id ? <Text accessibilityRole="alert" style={styles.body}>Väntar på den valda nya ägaren. Personen behöver vara inloggad på sitt eget konto och välja ”Överta nästa delade bild”. Ingen notifiering skickas och ingen väljs automatiskt.</Text> : null}
      {own?.next_remove_item_id ? button('Ta bort nästa verifierade egna kopia', request('remove_own_media', own.plan_id, own.next_remove_item_id, own.replacement_user_id)) : null}
      {own?.state === 'ready' ? <Text style={styles.success}>Filplanens radering och överföring är bekräftade. Kontot finns kvar tills du uttryckligen bekräftar kontoradering.</Text> : null}
      {receipt.incoming.length ? <View style={styles.incoming}><Text style={styles.title}>Bilder att överta som vald ny ägare</Text>
        <Text style={styles.body}>Du tar över delade bilder genom din egen inloggning. Ingen annans konto raderas av den här knappen.</Text>
        {receipt.incoming.map(plan => <View key={plan.plan_id} style={styles.preview}><Text style={styles.body}>Delad filplan · {plan.copied_count} av {plan.transfer_count} bilder överförda</Text>
          {plan.next_copy_item_id ? button('Överta nästa delade bild', request('transfer_shared_media', plan.plan_id, plan.next_copy_item_id, props.userId)) : <Text style={styles.success}>De delade bilderna är överförda till dig. Den tidigare ägaren ska nu kontrollera sina gamla kopior.</Text>}
        </View>)}
      </View> : null}
    </>}
    {reason ? <Text accessibilityRole="alert" style={styles.error}>{reason}</Text> : null}
    {phase === 'uncertain' ? <Text style={styles.body}>Manuella försök med samma åtgärd: {attemptCount} av 3 på denna vy. Ett tidigare anrop kan fortfarande slutföras.</Text> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Kontrollera filstatus" onPress={() => { if (alive.current && current.current.scope === scope && !pending.current) current.current.props.onReload(); }} disabled={phase === 'pending'}><Text style={styles.link}>Kontrollera filstatus</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 12, paddingVertical: 16, borderTopWidth: 1, borderColor: palette.border },
  title: { fontSize: 16, fontWeight: '600', color: palette.primaryText },
  body: { fontSize: 13, lineHeight: 20, color: palette.secondaryText },
  preview: { padding: 14, gap: 7, backgroundColor: palette.surfaceTint, borderWidth: 1, borderColor: palette.border, borderRadius: radius.sm },
  incoming: { gap: 12, marginTop: 10 },
  error: { fontSize: 13, lineHeight: 20, color: palette.error },
  success: { fontSize: 13, lineHeight: 20, color: palette.success },
  link: { fontSize: 13, fontWeight: '600', color: palette.primary },
  button: { alignItems: 'center', padding: 14, borderRadius: radius.full, backgroundColor: palette.primary },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 13, fontWeight: '600', color: palette.inverseText },
});
