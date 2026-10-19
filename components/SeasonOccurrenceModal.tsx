import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/components/theme';
import { DateTimeField } from '@/components/DateTimeField';
import type { Assignment, UserProfile } from '@/context/AppDataContext';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';
import { seriesEndTime } from '@/lib/recurringSeries';
import { isFutureSeasonAssignment, type OccurrenceChanges, type SchedulePeriod, type SeasonResult } from '@/lib/seasonSchedule';

type SeasonOccurrenceModalProps = {
  assignment: Assignment;
  period: SchedulePeriod;
  scopeKey: string;
  currentUserId: string;
  owner: boolean;
  canChoose: boolean;
  members: UserProfile[];
  busy: boolean;
  onClose: () => void;
  onWeekly: (assignment: Assignment) => void;
  onSubmit: (assignment: Assignment, changes: OccurrenceChanges) => Promise<SeasonResult<Assignment>>;
  onSaved: () => void;
};

export function SeasonOccurrenceModal({
  assignment: currentAssignment, period, scopeKey, currentUserId, owner, canChoose, members, busy,
  onClose, onWeekly, onSubmit, onSaved,
}: SeasonOccurrenceModalProps) {
  const [assignment] = React.useState(currentAssignment);
  const [single, setSingle] = React.useState(false);
  const [date, setDate] = React.useState(assignment.date);
  const [label, setLabel] = React.useState(assignment.label);
  const [time, setTime] = React.useState(assignment.time);
  const [endTime, setEndTime] = React.useState(seriesEndTime(assignment.note));
  const [instructions, setInstructions] = React.useState((assignment.note ?? '').replace(/(?:^|\n)Slut:\s*\d\d:\d\d\s*$/, '').trim());
  const [assigneeId, setAssigneeId] = React.useState<string | null>(assignment.assigneeId ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const saving = React.useRef(false);
  const scope = React.useRef(scopeKey);
  scope.current = scopeKey;
  const blocked = busy || pending;
  const outdated = currentAssignment.id !== assignment.id || currentAssignment.updatedAt !== assignment.updatedAt;
  const saveBlocked = blocked || outdated;
  const started = !isFutureSeasonAssignment(assignment);
  const mine = assignment.assigneeId === currentUserId;
  const assigneeName = members.find(member => member.id === assignment.assigneeId)?.name ?? 'Annan medlem';

  const runSave = async (changes: OccurrenceChanges) => {
    if (saving.current || busy || started) return;
    if (outdated) { setError('Passet har ändrats sedan du öppnade det. Dina fält finns kvar. Granska den senaste versionen först.'); return; }
    saving.current = true;
    setPending(true);
    setError(null);
    const requestScope = scopeKey;
    try {
      const result = await onSubmit(assignment, changes);
      if (scope.current !== requestScope) return;
      if (result.success) onSaved();
      else setError(result.reason);
    } catch {
      if (scope.current === requestScope) setError('Passet kunde inte sparas. Försök igen. Dina ändringar finns kvar.');
    } finally {
      saving.current = false;
      if (scope.current === requestScope) setPending(false);
    }
  };

  const saveOwner = () => {
    if (!label.trim()) { setError('Ange ett namn för passet.'); return; }
    if (!isValidISODate(date) || date < period.dateFrom || date > period.dateTo) {
      setError('Välj ett giltigt datum inom perioden.'); return;
    }
    if (!isValidTime(time) || (endTime && (!isValidTime(endTime) || endTime <= time))) {
      setError('Ange giltiga tider i formatet HH:MM. Sluttiden ska vara efter starttiden.'); return;
    }
    if (!isFutureSeasonAssignment({ date, time, status: 'open' })) {
      setError('Välj ett datum och en tid som inte har börjat.'); return;
    }
    void runSave({ date, label: label.trim(), time, endTime, instructions: instructions.trim(), assigneeId });
  };

  const close = () => { if (!blocked) onClose(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} disabled={blocked} accessibilityLabel="Stäng ändring av pass" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text style={styles.title}>Ändra pass</Text>
              <Text style={styles.hint}>{assignment.date} · {assignment.time} · {period.name}</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={close} disabled={blocked} accessibilityRole="button" accessibilityLabel="Stäng ändring av pass">
              <Feather name="x" size={22} color={palette.primaryText} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.assignmentTitle}>{assignment.label}</Text>
            {outdated ? <View style={styles.conflict}>
              <Text accessibilityRole="alert" style={styles.error}>Passet har ändrats sedan du öppnade det. Dina fält finns kvar. Granska den senaste versionen först.</Text>
              <Text style={styles.fieldLabel}>Senaste pass: {currentAssignment.label}</Text>
              <Text style={styles.hint}>{currentAssignment.date} · {currentAssignment.time}{seriesEndTime(currentAssignment.note) ? `–${seriesEndTime(currentAssignment.note)}` : ''} · {currentAssignment.assigneeId ? members.find(member => member.id === currentAssignment.assigneeId)?.name ?? 'Annan medlem' : 'Ledigt'}</Text>
              <Text style={styles.hint}>{(currentAssignment.note ?? '').replace(/(?:^|\n)Slut:\s*\d\d:\d\d\s*$/, '').trim() || 'Inga särskilda instruktioner.'}</Text>
              <TouchableOpacity style={styles.reset} onPress={close} disabled={blocked} accessibilityRole="button" accessibilityLabel="Stäng och granska senaste passet">
                <Text style={styles.resetText}>Stäng och granska senaste passet</Text>
              </TouchableOpacity>
            </View> : null}
            {started ? <Text style={styles.hint}>Passet är redan påbörjat eller klart. Historiken behålls.</Text> : (
              <View style={styles.choices}>
                <TouchableOpacity style={[styles.choice, single && styles.selected]} disabled={blocked} onPress={() => setSingle(true)} accessibilityRole="button" accessibilityLabel="Bara detta pass" aria-pressed={single}>
                  <Feather name="calendar" size={18} color={palette.primary} />
                  <Text style={styles.choiceLabel}>Bara detta pass</Text>
                  <Text style={styles.hint}>Ändra just detta datum.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.choice} disabled={saveBlocked || period.status !== 'ready'} onPress={() => onWeekly(assignment)} accessibilityRole="button" accessibilityLabel="Kommande pass denna veckodag">
                  <Feather name="repeat" size={18} color={palette.primary} />
                  <Text style={styles.choiceLabel}>Kommande pass denna veckodag</Text>
                  <Text style={styles.hint}>Från {assignment.date} till periodens slut.</Text>
                </TouchableOpacity>
              </View>
            )}
            {single && !started && owner ? (
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>Namn</Text>
                <TextInput accessibilityLabel="Passets namn" value={label} onChangeText={setLabel} editable={!blocked} maxLength={120} style={styles.input} />
                <Text style={styles.fieldLabel}>Datum</Text>
                <DateTimeField scopeKey={scopeKey} mode="date" label="Passets datum" value={date} onChangeText={setDate} editable={!blocked} placeholder="ÅÅÅÅ-MM-DD" style={styles.input} />
                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>Starttid</Text>
                    <DateTimeField scopeKey={scopeKey} mode="time" label="Passets starttid" value={time} onChangeText={setTime} editable={!blocked} placeholder="07:00" style={styles.input} />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>Sluttid, valfri</Text>
                    <DateTimeField scopeKey={scopeKey} mode="time" label="Passets sluttid" value={endTime} onChangeText={setEndTime} editable={!blocked} allowClear placeholder="08:00" style={styles.input} />
                  </View>
                </View>
                <Text style={styles.fieldLabel}>Instruktioner</Text>
                <TextInput accessibilityLabel="Passets instruktioner" value={instructions} onChangeText={setInstructions} editable={!blocked} multiline maxLength={2000} style={[styles.input, styles.instructions]} />
                <Text style={styles.fieldLabel}>Ansvarig för detta datum</Text>
                <View style={styles.members}>
                  <TouchableOpacity style={[styles.member, assigneeId === null && styles.selected]} onPress={() => setAssigneeId(null)} disabled={blocked} accessibilityRole="button" accessibilityLabel="Lämna detta pass ledigt" aria-pressed={assigneeId === null}>
                    <Text style={styles.memberText}>Ledigt</Text>
                  </TouchableOpacity>
                  {members.map(member => (
                    <TouchableOpacity key={member.id} style={[styles.member, member.id === assigneeId && styles.selected]} onPress={() => setAssigneeId(member.id)} disabled={blocked} accessibilityRole="button" accessibilityLabel={`Ansvarig för detta pass ${member.name}`} aria-pressed={member.id === assigneeId}>
                      <Text style={styles.memberText}>{member.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>Detta blir ett undantag. Övriga veckor och fasta val behålls.</Text>
                <TouchableOpacity style={[styles.primary, saveBlocked && styles.disabled]} onPress={saveOwner} disabled={saveBlocked} accessibilityRole="button" accessibilityLabel="Spara bara detta pass">
                  <Text style={styles.primaryText}>{pending ? 'Sparar pass…' : 'Spara bara detta pass'}</Text>
                </TouchableOpacity>
                {assignment.isScheduleOverride ? (
                  <TouchableOpacity style={[styles.reset, saveBlocked && styles.disabled]} onPress={() => void runSave({ resetOverride: true })} disabled={saveBlocked} accessibilityRole="button" accessibilityLabel="Återställ detta pass till standard">
                    <Text style={styles.resetText}>Återställ detta pass till standard</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : single && !started ? (
              <View style={styles.form}>
                <Text style={styles.hint}>{instructions || 'Inga särskilda instruktioner.'}</Text>
                <Text style={styles.hint}>Övriga datum och din fasta veckofördelning behålls.</Text>
                {canChoose && (mine || !assignment.assigneeId) ? (
                  <TouchableOpacity style={[styles.primary, saveBlocked && styles.disabled]} onPress={() => void runSave({ assigneeId: mine ? null : currentUserId })} disabled={saveBlocked} accessibilityRole="button" accessibilityLabel={mine ? 'Släpp bara detta pass' : 'Ta bara detta pass'}>
                    <Text style={styles.primaryText}>{pending ? 'Sparar pass…' : mine ? 'Släpp bara detta pass' : 'Ta bara detta pass'}</Text>
                  </TouchableOpacity>
                ) : <Text style={styles.hint}>{assignment.assigneeId ? `Passet är tilldelat ${assigneeName}.` : 'Din roll kan läsa schemat. Stallägaren fördelar passen.'}</Text>}
              </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {pending ? <ActivityIndicator color={palette.primary} accessibilityLabel="Sparar pass" /> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const palette = theme.colors;
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.overlay },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '92%', alignSelf: 'center', backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.borderMuted },
  titleGroup: { flex: 1, gap: 5 },
  title: { fontFamily: theme.fonts.semibold, fontSize: 20, color: palette.primaryText },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  assignmentTitle: { fontFamily: theme.fonts.medium, fontSize: 18, color: palette.primaryText },
  conflict: { borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, gap: 8 },
  hint: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 19, color: palette.secondaryText },
  choices: { gap: 10 },
  choice: { minHeight: 88, padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  selected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
  choiceLabel: { fontFamily: theme.fonts.medium, color: palette.primaryText, fontSize: 15 },
  form: { gap: 10 },
  fieldLabel: { fontFamily: theme.fonts.medium, fontSize: 13, color: palette.primaryText },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: theme.fonts.regular, fontSize: 15, color: palette.primaryText, backgroundColor: palette.surface },
  instructions: { minHeight: 84, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 8 },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  member: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 14, justifyContent: 'center' },
  memberText: { fontFamily: theme.fonts.regular, fontSize: 13, color: palette.primaryText },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: palette.primary, justifyContent: 'center', alignItems: 'center', padding: 14, marginTop: 6 },
  primaryText: { fontFamily: theme.fonts.medium, fontSize: 14, color: palette.inverseText },
  reset: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  resetText: { fontFamily: theme.fonts.medium, fontSize: 13, color: palette.primary },
  error: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 19, color: palette.error },
  disabled: { opacity: 0.5 },
});
