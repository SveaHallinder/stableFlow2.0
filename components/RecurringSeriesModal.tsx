import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Assignment } from '@/context/AppDataContext';
import { DateTimeField } from '@/components/DateTimeField';
import { theme } from '@/components/theme';
import { MAX_RECURRING_ASSIGNMENTS_PER_BATCH } from '@/lib/schedule';
import { isFutureOpenSeriesAssignment, seriesEndTime, validateRecurringSeriesEdit,
  type RecurringSeriesEdit, type RecurringSeriesResult } from '@/lib/recurringSeries';

type Props = {
  scopeKey: string;
  assignments: Assignment[];
  initialSeriesId?: string;
  onClose: () => void;
  onSave: (input: RecurringSeriesEdit) => Promise<RecurringSeriesResult>;
};

export function RecurringSeriesModal({ scopeKey, assignments, initialSeriesId, onClose, onSave }: Props) {
  const bySeries = new Map<string, Assignment>();
  for (const assignment of assignments) {
    if (!assignment.seriesId) continue;
    const previous = bySeries.get(assignment.seriesId);
    const future = isFutureOpenSeriesAssignment(assignment);
    if (!previous || (future && (!isFutureOpenSeriesAssignment(previous)
      || `${assignment.date}T${assignment.time}` < `${previous.date}T${previous.time}`))) {
      bySeries.set(assignment.seriesId, assignment);
    }
  }
  const series = [...bySeries.values()];
  const initial = series.find(assignment => assignment.seriesId === initialSeriesId) ?? series[0];
  const [selected, setSelected] = React.useState(initial?.seriesId ?? '');
  const [label, setLabel] = React.useState(initial?.label ?? '');
  const [startTime, setStartTime] = React.useState(initial?.time ?? '');
  const [endTime, setEndTime] = React.useState(seriesEndTime(initial?.note));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [receipt, setReceipt] = React.useState('');
  const saving = React.useRef(false);
  const active = React.useRef(true);
  const renderScope = React.useMemo(() => ({ scopeKey, selected }), [scopeKey, selected]);
  const renderScopeRef = React.useRef(renderScope);
  renderScopeRef.current = renderScope;
  const isCurrent = () => active.current && renderScopeRef.current === renderScope;
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const eligible = assignments.filter(assignment => assignment.seriesId === selected && isFutureOpenSeriesAssignment(assignment));
  const select = (assignment: Assignment) => {
    if (!isCurrent() || saving.current) return;
    setSelected(assignment.seriesId ?? ''); setLabel(assignment.label); setStartTime(assignment.time);
    setEndTime(seriesEndTime(assignment.note)); setError(''); setReceipt('');
  };
  const save = async () => {
    if (!isCurrent() || saving.current || !selected) return;
    const input = { seriesId: selected, label, startTime, endTime };
    const invalid = validateRecurringSeriesEdit(input);
    if (invalid) { setError(invalid); return; }
    saving.current = true; setPending(true); setError(''); setReceipt('');
    try {
      const result = await onSave(input);
      if (!isCurrent()) return;
      if (result.success) setReceipt(result.data.length
        ? `Uppdaterade ${result.data.length} framtida öppna pass. Övriga pass är bevarade.`
        : 'Inga framtida öppna pass kunde ändras. Uppdatera schemat för att se aktuell status.');
      else setError(result.reason);
    } catch {
      if (isCurrent()) { console.warn('[assignment series] Serien kunde inte bekräftas', 'RequestFailed');
        setError('Serien kunde inte bekräftas. Utkastet finns kvar. Uppdatera schemat och försök igen.'); }
    } finally { if (isCurrent()) { saving.current = false; setPending(false); } }
  };
  const close = () => { if (isCurrent() && !saving.current) onClose(); };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Redigera återkommande pass</Text>
          <Text style={styles.hint}>Namn, starttid och sluttid ändras bara på framtida öppna pass i serien. Datumen behålls. Tilldelade, klara och redan startade pass bevaras.</Text>
          <Text style={styles.hint}>Svensk stalltid (Europe/Stockholm). Serverns klocka avgör framtid. Högst {MAX_RECURRING_ASSIGNMENTS_PER_BATCH} pass per ändring.</Text>
          {!series.length ? <Text style={styles.hint}>Inga serier har laddats. Äldre pass utan serie-ID grupperas inte automatiskt. Skapa en ny serie eller uppdatera schemat.</Text> : <>
            <Text style={styles.heading}>Välj serie</Text>
            {series.map(assignment => <TouchableOpacity key={assignment.seriesId} disabled={pending} onPress={() => select(assignment)}
              accessibilityRole="radio" accessibilityState={{ checked: assignment.seriesId === selected, disabled: pending }}
              style={[styles.option, assignment.seriesId === selected && styles.selected]}>
              <Text style={styles.hint}>{assignment.label} · {assignment.time}</Text>
            </TouchableOpacity>)}
            <Text style={styles.hint}>{eligible.length} framtida öppna pass visas bland laddade pass. Servern kontrollerar hela serien.</Text>
            {!eligible.length ? <Text style={styles.hint}>Inga ändringsbara pass visas här. Uppdatera schemat om serien har fler pass.</Text> : null}
            <Text style={styles.heading}>Namn</Text>
            <TextInput value={label} onChangeText={value => { if (isCurrent() && !saving.current) setLabel(value); }} editable={!pending} style={styles.input} accessibilityLabel="Seriens passnamn" />
            <DateTimeField scopeKey={JSON.stringify([scopeKey, selected])} mode="time" label="Seriens starttid" value={startTime} onChangeText={value => { if (isCurrent() && !saving.current) setStartTime(value); }} editable={!pending} style={styles.input} />
            <DateTimeField scopeKey={JSON.stringify([scopeKey, selected])} mode="time" label="Seriens sluttid" value={endTime} onChangeText={value => { if (isCurrent() && !saving.current) setEndTime(value); }} editable={!pending} style={styles.input} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {receipt ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{receipt}</Text> : null}
            <TouchableOpacity disabled={pending} onPress={() => { void save(); }} accessibilityRole="button" accessibilityState={{ disabled: pending, busy: pending }} style={styles.button}>
              <Text style={styles.buttonText}>{pending ? 'Sparar…' : error ? 'Försök igen' : 'Spara framtida öppna pass'}</Text>
            </TouchableOpacity>
          </>}
          <TouchableOpacity disabled={pending} onPress={close} accessibilityRole="button" style={styles.option}><Text style={styles.hint}>Stäng</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: theme.colors.background, borderRadius: 18, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.primaryText },
  heading: { fontSize: 15, fontWeight: '600', color: theme.colors.primaryText },
  hint: { fontSize: 14, lineHeight: 21, color: theme.colors.secondaryText },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, color: theme.colors.primaryText },
  option: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12 },
  selected: { borderColor: theme.colors.primary },
  error: { color: theme.colors.error, fontSize: 14, lineHeight: 21 },
  button: { backgroundColor: theme.colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: theme.colors.inverseText, fontWeight: '600' },
});
