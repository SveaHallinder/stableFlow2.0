import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppData } from '@/context/AppDataContext';
import type { ActionResult, LeaveMemberGroupInput, LeaveMemberGroupReceipt, MessagePreview, UserProfile } from '@/context/AppDataContext';
import { theme } from '@/components/theme';
import { Avatar } from '@/components/Avatar';
import { confirmAction } from '@/lib/confirm';
import type { ConfirmOptions } from '@/lib/confirm';
import { generateId } from '@/lib/ids';

const palette = theme.colors;

function GroupButton({ label, accessibilityLabel = label, onPress, disabled = false, destructive = false }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, destructive && styles.destructive]}>{label}</Text>
  </TouchableOpacity>;
}

function MemberPicker({ members, selected, onToggle, disabled, maxSelected }: { members: UserProfile[]; selected: string[]; onToggle: (id: string) => void; disabled: boolean; maxSelected: number }) {
  return <ScrollView style={styles.memberList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
    {members.length ? members.map(member => {
      const checked = selected.includes(member.id);
      const unavailable = disabled || (!checked && selected.length >= maxSelected);
      return <TouchableOpacity key={member.id} accessibilityRole="checkbox" accessibilityLabel={`Välj ${member.name}`} accessibilityState={{ checked, disabled: unavailable }} disabled={unavailable} onPress={() => onToggle(member.id)} style={[styles.memberRow, unavailable && styles.disabled]}>
        <Avatar source={member.avatar} style={styles.avatar} />
        <Text style={styles.memberName}>{member.name}</Text>
        <Ionicons name={checked ? 'checkbox-outline' : 'square-outline'} size={23} color={palette.primaryText} />
      </TouchableOpacity>;
    }) : <Text style={styles.hint}>Ingen medlem matchar. Bara accepterade medlemmar i det här stallet kan väljas.</Text>}
  </ScrollView>;
}

export function MemberGroupCreateForm({ onCreated, onBusyChange }: { onCreated: (group: MessagePreview) => void; onBusyChange?: (busy: boolean) => void }) {
  const { state, actions } = useAppData();
  const [title, setTitle] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pendingRef = React.useRef(false);
  const requestRef = React.useRef<{ key: string; id: string } | null>(null);
  const currentRef = React.useRef(state);
  currentRef.current = state;
  const identity = `${state.currentUserId}:${state.sessionUserId}:${state.currentStableId}`;
  const scopeRef = React.useRef({ identity, epoch: 0 });
  if (scopeRef.current.identity !== identity) scopeRef.current = { identity, epoch: scopeRef.current.epoch + 1 };
  const renderEpoch = scopeRef.current.epoch;
  React.useEffect(() => () => { scopeRef.current.epoch += 1; }, []);
  const eligible = Object.values(state.users).filter(member => member.id !== state.currentUserId && !state.blockedUserIds.includes(member.id)
    && member.membership.some(entry => entry.stableId === state.currentStableId)).sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'));
  const members = eligible.filter(member => member.name.toLocaleLowerCase('sv-SE').includes(search.trim().toLocaleLowerCase('sv-SE')));
  const validTitle = title.trim().length >= 2 && title.trim().length <= 80;
  const creatorIsMember = state.users[state.currentUserId]?.membership.some(entry => entry.stableId === state.currentStableId);
  const validSelection = selected.length >= 2 && selected.length <= 49 && selected.every(id => eligible.some(member => member.id === id));
  const stableName = state.stables.find(stable => stable.id === state.currentStableId)?.name;
  const toggleMember = (id: string) => { if (!pendingRef.current) setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < 49 ? [...previous, id] : previous); };
  const handleCreate = async () => {
    if (pendingRef.current || scopeRef.current.epoch !== renderEpoch) return;
    const current = currentRef.current;
    if (!creatorIsMember || !validTitle || !validSelection || selected.some(id => !current.users[id]?.membership.some(entry => entry.stableId === current.currentStableId) || current.blockedUserIds.includes(id))) {
      setError('Ange ett gruppnamn på 2–80 tecken och välj minst två andra medlemmar i stallet. Högst 50 deltagare inklusive dig.');
      return;
    }
    const epoch = scopeRef.current.epoch;
    const sameScope = () => scopeRef.current.epoch === epoch;
    const participantIds = [...selected].sort();
    const key = JSON.stringify([current.currentStableId, title.trim(), participantIds]);
    if (requestRef.current?.key !== key) requestRef.current = { key, id: generateId() };
    pendingRef.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await actions.createMemberGroup({ requestId: requestRef.current.id, stableId: current.currentStableId, title: title.trim(), participantIds });
      if (!sameScope()) return;
      if (!result.success || !result.data?.id) {
        setError(result.success ? 'Gruppen kunde inte bekräftas. Ditt utkast finns kvar. Försök igen.' : result.reason);
        return;
      }
      onCreated(result.data);
    } catch (cause) {
      console.warn('[member group create] Kunde inte skapa grupp', cause instanceof Error ? cause.name : 'Unknown');
      if (sameScope()) setError('Gruppen kunde inte sparas. Ditt namn och deltagarval finns kvar. Försök igen.');
    } finally {
      pendingRef.current = false;
      if (sameScope()) { setSaving(false); onBusyChange?.(false); }
    }
  };
  return <View style={styles.form}>
    <Text style={styles.hint}>Egen grupp i {stableName ?? 'det aktuella stallet'}. Bara valda deltagare kan läsa chatten.</Text>
    <Text style={styles.label}>Gruppnamn</Text>
    <TextInput accessibilityLabel="Gruppnamn" placeholder="Till exempel Fodergänget" placeholderTextColor={palette.secondaryText} style={styles.input} value={title} onChangeText={setTitle} editable={!saving} maxLength={80} />
    {title.length > 0 && !validTitle ? <Text accessibilityRole="alert" style={styles.error}>Gruppnamnet ska vara 2–80 tecken.</Text> : <Text style={styles.hint}>2–80 tecken</Text>}
    <View style={styles.memberRow}><Ionicons name="person-circle-outline" size={32} color={palette.primaryText} /><Text style={styles.memberName}>Du · gruppansvarig</Text><Text style={styles.hint}>Ingår alltid</Text></View>
    <Text style={styles.label}>{selected.length + 1}/50 deltagare</Text>
    <Text style={styles.hint}>Välj minst två andra medlemmar.</Text>
    <TextInput accessibilityLabel="Sök deltagare till gruppen" placeholder="Sök medlem" placeholderTextColor={palette.secondaryText} style={styles.input} value={search} onChangeText={setSearch} editable={!saving} autoCorrect={false} />
    <MemberPicker members={members} selected={selected} onToggle={toggleMember} disabled={saving} maxSelected={49} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {saving ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Skapar grupp…</Text> : null}
    <GroupButton label="Skapa grupp" disabled={saving || !creatorIsMember || !validTitle || !validSelection} onPress={handleCreate} />
  </View>;
}

type GroupMode = 'overview' | 'rename' | 'add' | 'transfer' | 'leave';
export function MemberGroupModal({ conversationId, onClose, onLeft, onLeaveGroup }: { conversationId: string; onClose: () => void; onLeft: () => void; onLeaveGroup?: (input: LeaveMemberGroupInput) => Promise<ActionResult<LeaveMemberGroupReceipt>> }) {
  const { state, actions } = useAppData();
  const group = state.messages.find(item => item.id === conversationId && item.chatKind === 'custom');
  const [mode, setMode] = React.useState<GroupMode>('overview');
  const [title, setTitle] = React.useState(group?.title ?? '');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [successor, setSuccessor] = React.useState<string | null>(null);
  const [requiresDeletionConfirmation, setRequiresDeletionConfirmation] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pendingRef = React.useRef(false);
  const currentRef = React.useRef(state);
  currentRef.current = state;
  const identity = `${state.currentUserId}:${state.sessionUserId}:${state.currentStableId}:${conversationId}`;
  const scopeRef = React.useRef({ identity, epoch: 0 });
  if (scopeRef.current.identity !== identity) scopeRef.current = { identity, epoch: scopeRef.current.epoch + 1 };
  const renderEpoch = scopeRef.current.epoch;
  React.useEffect(() => () => { scopeRef.current.epoch += 1; }, []);
  const participantIds = group?.participantIds ?? [];
  const isParticipant = participantIds.includes(state.currentUserId);
  const isOwner = group?.participantRoles?.[state.currentUserId] === 'owner';
  const remaining = participantIds.filter(id => id !== state.currentUserId);
  const successors = remaining.filter(id => state.users[id]?.membership.some(entry => entry.stableId === group?.stableId));
  const ownerId = participantIds.find(id => group?.participantRoles?.[id] === 'owner');
  const stableName = state.stables.find(stable => stable.id === group?.stableId)?.name;
  const eligible = Object.values(state.users).filter(member => !participantIds.includes(member.id) && !state.blockedUserIds.includes(member.id)
    && member.membership.some(entry => entry.stableId === group?.stableId)).sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'));
  const candidates = eligible.filter(member => member.name.toLocaleLowerCase('sv-SE').includes(search.trim().toLocaleLowerCase('sv-SE')));
  const canAddSelected = selected.length > 0 && selected.length + participantIds.length <= 50 && selected.every(id => eligible.some(member => member.id === id));
  const close = () => { if (!pendingRef.current) onClose(); };
  const changeMode = (next: GroupMode) => { if (!pendingRef.current) { setMode(next); setError(null); setRequiresDeletionConfirmation(false); } };
  const toggleMember = (id: string) => { if (!pendingRef.current) setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length + participantIds.length < 50 ? [...previous, id] : previous); };

  const runOperation = async <T,>(operation: () => Promise<ActionResult<T>>, onSuccess: (data: T) => void, confirmation?: ConfirmOptions, requireOwner = true, onFailure?: (result: Extract<ActionResult<T>, { success: false }>) => void) => {
    if (pendingRef.current || scopeRef.current.epoch !== renderEpoch) return;
    const allowed = () => {
      const current = currentRef.current;
      const latest = current.messages.find(item => item.id === conversationId && item.chatKind === 'custom');
      return latest?.stableId === current.currentStableId && latest.participantIds?.includes(current.currentUserId)
        && (!requireOwner || latest.participantRoles?.[current.currentUserId] === 'owner');
    };
    if (!allowed()) { setError('Din åtkomst till gruppen har ändrats. Uppdatera chattlistan.'); return; }
    const epoch = scopeRef.current.epoch;
    const sameScope = () => scopeRef.current.epoch === epoch;
    pendingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (confirmation && !(await confirmAction(confirmation))) return;
      if (!sameScope() || !allowed()) return;
      const result = await operation();
      if (!sameScope()) return;
      if (!result.success || !result.data) { setError(result.success ? 'Ändringen kunde inte bekräftas. Försök igen.' : result.reason); if (!result.success) onFailure?.(result); return; }
      onSuccess(result.data);
    } catch (cause) {
      console.warn('[member group manage] Kunde inte spara gruppändring', cause instanceof Error ? cause.name : 'Unknown');
      if (sameScope()) setError('Gruppändringen kunde inte sparas. Dina val finns kvar. Försök igen.');
    } finally {
      pendingRef.current = false;
      if (sameScope()) setSaving(false);
    }
  };
  const handleRename = () => {
    if (title.trim().length < 2 || title.trim().length > 80) { setError('Gruppnamnet ska vara 2–80 tecken.'); return; }
    return runOperation(() => actions.manageMemberGroup({ conversationId, title: title.trim() }), result => { setTitle(result.title); setMode('overview'); });
  };
  const handleAdd = () => {
    if (!canAddSelected) { setError('Välj minst en accepterad medlem. Gruppen får ha högst 50 deltagare.'); return; }
    return runOperation(() => actions.manageMemberGroup({ conversationId, addUserIds: selected }), () => { setSelected([]); setSearch(''); setMode('overview'); }, {
      title: `Lägg till i ${group?.title}?`, message: `${selected.map(id => state.users[id]?.name ?? 'Medlem').join(', ')} läggs till. Nya deltagare kan läsa gruppens tidigare meddelanden.`, confirmLabel: 'Lägg till',
    });
  };
  const handleRemove = (id: string) => runOperation(() => actions.manageMemberGroup({ conversationId, removeUserIds: [id] }), () => {}, {
    title: `Ta bort ${state.users[id]?.name ?? 'deltagaren'}?`, message: `${state.users[id]?.name ?? 'Deltagaren'} förlorar fortsatt åtkomst till ${group?.title} och får inga nya gruppnotiser. Redan läst eller kopierat innehåll kan inte återkallas.`, confirmLabel: 'Ta bort', destructive: true,
  });
  const handleTransfer = () => {
    if (!successor || !successors.includes(successor)) { setError('Välj en kvarvarande deltagare som gruppansvarig.'); return; }
    return runOperation(() => actions.manageMemberGroup({ conversationId, transferOwnerTo: successor }), () => { setSuccessor(null); setMode('overview'); }, {
      title: 'Överlåt gruppansvaret?', message: `${state.users[successor]?.name ?? 'Deltagaren'} blir gruppansvarig för ${group?.title}. Du blir vanlig deltagare och kan inte längre hantera gruppen.`, confirmLabel: 'Överlåt ansvar',
    });
  };
  const leave = (confirmDeletion = false) => {
    if (confirmDeletion && !requiresDeletionConfirmation) return;
    const deleting = participantIds.length === 1 || confirmDeletion;
    if (!deleting && isOwner && successors.length && (!successor || !successors.includes(successor))) { setError('Välj en efterträdare innan du lämnar gruppen.'); return; }
    return runOperation(() => (onLeaveGroup ?? actions.leaveMemberGroup)({ conversationId, confirmDelete: deleting, ...(!deleting && isOwner && successor ? { transferOwnerTo: successor } : {}) }), result => { if (result.left && result.conversationId === conversationId) onLeft(); }, {
      title: deleting ? 'Lämna och radera gruppen?' : `Lämna ${group?.title}?`,
      message: deleting ? `Du är sista aktiva deltagaren. Gruppen ${group?.title} och dess meddelanden raderas när du lämnar.`
        : `Du förlorar fortsatt åtkomst till ${group?.title} och får inga nya gruppnotiser.${isOwner && successor ? ` ${state.users[successor]?.name ?? 'Efterträdaren'} blir gruppansvarig.` : ''} Redan läst eller kopierat innehåll kan inte återkallas.`,
      confirmLabel: deleting ? 'Lämna och radera' : 'Lämna grupp', destructive: true,
    }, false, failure => { if (failure.requiresDeletionConfirmation === true) setRequiresDeletionConfirmation(true); });
  };
  const handleLeave = () => { if (isOwner && remaining.length) { changeMode('leave'); return; } return leave(); };
  if (!group || !isParticipant) return null;

  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.headingRow}><View style={styles.headingBody}><Text accessibilityRole="header" style={styles.heading}>Gruppinformation</Text><Text style={styles.hint}>{stableName ?? 'Stallet'} · Egen grupp</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Stäng gruppinformation" disabled={saving} onPress={close} style={styles.closeButton}><Ionicons name="close" size={24} color={palette.primaryText} /></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <Text style={styles.groupName}>{group.title}</Text>
          <Text style={styles.hint}>Gruppansvarig: {ownerId ? state.users[ownerId]?.name ?? 'Medlem' : 'Kunde inte bekräftas'}</Text>
          {mode !== 'overview' ? <GroupButton label="Tillbaka till gruppinformation" onPress={() => changeMode('overview')} disabled={saving} /> : null}
          {mode === 'overview' ? <>
            <Text style={styles.hint}>Bara gruppens deltagare får gruppens meddelanden och notiser.</Text>
            <Text style={styles.label}>{participantIds.length} deltagare</Text>
            {participantIds.map(id => <View key={id} style={styles.memberRow}>
              <Avatar source={state.users[id]?.avatar} style={styles.avatar} /><View style={styles.headingBody}><Text style={styles.memberName}>{state.users[id]?.name ?? 'Medlem'}{id === state.currentUserId ? ' (du)' : ''}</Text>{group.participantRoles?.[id] === 'owner' ? <Text style={styles.hint}>Gruppansvarig</Text> : null}</View>
              {isOwner && id !== state.currentUserId ? <GroupButton label="Ta bort" accessibilityLabel={`Ta bort ${state.users[id]?.name ?? 'deltagare'}`} onPress={() => handleRemove(id)} disabled={saving} destructive /> : null}
            </View>)}
            {isOwner ? <View style={styles.form}><GroupButton label="Ändra gruppnamn" onPress={() => changeMode('rename')} disabled={saving} /><GroupButton label="Lägg till deltagare" onPress={() => changeMode('add')} disabled={saving || participantIds.length >= 50} /><GroupButton label="Överlåt ansvar" onPress={() => changeMode('transfer')} disabled={saving || !successors.length} /></View> : null}
            {!requiresDeletionConfirmation ? <GroupButton label="Lämna grupp" onPress={handleLeave} disabled={saving} destructive /> : null}
          </> : null}
          {mode === 'rename' && isOwner ? <><Text style={styles.label}>Gruppnamn</Text><TextInput accessibilityLabel="Ändra gruppnamn" style={styles.input} value={title} onChangeText={setTitle} maxLength={80} editable={!saving} /><Text style={styles.hint}>2–80 tecken</Text><GroupButton label="Spara gruppnamn" onPress={handleRename} disabled={saving || title.trim().length < 2 || title.trim().length > 80} /></> : null}
          {mode === 'add' && isOwner ? <><Text style={styles.hint}>Nya deltagare kan läsa gruppens tidigare meddelanden.</Text><Text style={styles.label}>{participantIds.length + selected.length}/50 deltagare</Text><TextInput accessibilityLabel="Sök nya gruppdeltagare" placeholder="Sök medlem" placeholderTextColor={palette.secondaryText} style={styles.input} value={search} onChangeText={setSearch} editable={!saving} /><MemberPicker members={candidates} selected={selected} onToggle={toggleMember} disabled={saving} maxSelected={50 - participantIds.length} /><GroupButton label="Lägg till valda deltagare" onPress={handleAdd} disabled={saving || !canAddSelected} /></> : null}
          {(mode === 'transfer' || (mode === 'leave' && !requiresDeletionConfirmation)) && isOwner ? <>
            <Text style={styles.label}>{mode === 'leave' ? 'Välj vem som tar över när du lämnar' : 'Välj ny gruppansvarig'}</Text>
            {successors.map(id => <TouchableOpacity key={id} accessibilityRole="radio" accessibilityLabel={`Välj ${state.users[id]?.name ?? 'deltagare'} som gruppansvarig`} accessibilityState={{ checked: successor === id, disabled: saving }} disabled={saving} onPress={() => setSuccessor(id)} style={styles.memberRow}><Avatar source={state.users[id]?.avatar} style={styles.avatar} /><Text style={styles.memberName}>{state.users[id]?.name ?? 'Medlem'}</Text><Ionicons name={successor === id ? 'radio-button-on-outline' : 'radio-button-off-outline'} size={23} color={palette.primaryText} /></TouchableOpacity>)}
            {!successors.length ? <Text style={styles.hint}>Ingen behörig efterträdare kunde laddas. Servern kontrollerar deltagarna igen innan du lämnar.</Text> : null}
            <GroupButton label={mode === 'leave' ? 'Bekräfta och lämna grupp' : 'Bekräfta överlåtelse'} onPress={mode === 'leave' ? () => leave() : handleTransfer} disabled={saving || ((mode === 'transfer' || successors.length > 0) && (!successor || !successors.includes(successor)))} destructive={mode === 'leave'} />
          </> : null}
          {requiresDeletionConfirmation ? <><Text style={styles.hint}>Servern har bekräftat att du är den sista aktiva deltagaren. Om du lämnar raderas gruppen och dess meddelanden.</Text><GroupButton label="Bekräfta radering av grupp" onPress={() => leave(true)} disabled={saving} destructive /></> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {saving ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Sparar gruppändring…</Text> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  label: { fontFamily: theme.fonts.medium, fontSize: 14, color: palette.primaryText },
  hint: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 20, color: palette.secondaryText },
  error: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 20, color: palette.error },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 12, color: palette.primaryText, backgroundColor: palette.surface, fontFamily: theme.fonts.regular, fontSize: 16 },
  memberList: { maxHeight: 300 },
  memberRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  memberName: { flex: 1, minWidth: 0, color: palette.primaryText, fontFamily: theme.fonts.medium, fontSize: 14 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  buttonText: { color: palette.primaryText, fontSize: 13, fontFamily: theme.fonts.medium },
  disabled: { opacity: 0.5 },
  destructive: { color: palette.error },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.24)' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '92%', backgroundColor: palette.surface, borderRadius: 24, padding: 20, gap: 16, borderWidth: 1, borderColor: palette.border },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingBody: { flex: 1, minWidth: 0, gap: 4 },
  heading: { fontFamily: theme.fonts.semibold, fontSize: 19, color: palette.primaryText },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  groupName: { fontFamily: theme.fonts.semibold, fontSize: 22, color: palette.primaryText },
});
