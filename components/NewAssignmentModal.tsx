import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { color, radius, space } from '@/design/tokens';
import { systemPalette } from '@/design/system';
import type { ActionResult, AssignmentSlot } from '@/context/AppDataContext';
import { generateId } from '@/lib/ids';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';

type DateOption = {
  label: string;
  value: string;
};

export type AssignmentModalSubmit = {
  requestId?: string;
  date?: string;
  slot?: AssignmentSlot;
  note?: string;
  assignToCurrentUser?: boolean;
  noteProvided: boolean;
  labelOverride?: string;
  time?: string;
};

type NewAssignmentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: AssignmentModalSubmit) => Promise<ActionResult<unknown>>;
  dateOptions: DateOption[];
  initialDate?: string;
  initialSlot?: AssignmentSlot;
  initialNote?: string;
  initialLabel?: string;
  initialTime?: string;
  initialAssignToMe?: boolean;
  mode?: 'create' | 'edit';
  onDelete?: () => Promise<ActionResult>;
};

const slots: { label: string; value: AssignmentSlot }[] = [
  { label: 'Morgon', value: 'Morning' },
  { label: 'Lunch', value: 'Lunch' },
  { label: 'Kväll', value: 'Evening' },
];

export function NewAssignmentModal({
  visible,
  onClose,
  onSubmit,
  dateOptions,
  initialDate,
  initialSlot,
  initialNote,
  initialLabel,
  initialTime,
  initialAssignToMe,
  mode = 'create',
  onDelete,
}: NewAssignmentModalProps) {
  const defaultDate = initialDate ?? dateOptions[0]?.value ?? '';
  const defaultSlot = initialSlot ?? 'Morning';
  const defaultNote = initialNote ?? '';
  const defaultLabel = initialLabel ?? '';
  const defaultTime = initialTime ?? '';

  const [selectedDate, setSelectedDate] = React.useState<string>(() => defaultDate);
  const [selectedSlot, setSelectedSlot] = React.useState<AssignmentSlot>(() => defaultSlot);
  const [note, setNote] = React.useState(defaultNote);
  const [label, setLabel] = React.useState(defaultLabel);
  const [time, setTime] = React.useState(defaultTime);
  const [assignToMe, setAssignToMe] = React.useState(initialAssignToMe ?? false);
  const [labelTouched, setLabelTouched] = React.useState(false);
  const [timeTouched, setTimeTouched] = React.useState(false);
  const wasVisible = React.useRef(false);
  const savingRef = React.useRef(false);
  const requestId = React.useRef<string | undefined>(undefined);
  const [pending, setPending] = React.useState<'save' | 'delete' | null>(null);
  const [error, setError] = React.useState('');

  const title = mode === 'edit' ? 'Redigera pass' : 'Nytt pass';
  const primaryLabel = mode === 'edit' ? 'Spara ändringar' : 'Skapa pass';
  const showDelete = mode === 'edit' && !!onDelete;

  React.useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (!wasVisible.current) {
      wasVisible.current = true;
      requestId.current = generateId();
      const nextDate = initialDate ?? dateOptions[0]?.value ?? '';
      const nextSlot = initialSlot ?? 'Morning';
      const nextNote = initialNote ?? '';
      const nextLabel = initialLabel ?? '';
      const nextTime = initialTime ?? '';

      setSelectedDate(nextDate);
      setSelectedSlot(nextSlot);
      setNote(nextNote);
      setLabel(nextLabel);
      setTime(nextTime);
      setAssignToMe(initialAssignToMe ?? false);
      setLabelTouched(false);
      setTimeTouched(false);
      setError('');
    }
  }, [
    visible,
    dateOptions,
    initialDate,
    initialSlot,
    initialNote,
    initialAssignToMe,
    initialLabel,
    initialTime,
  ]);

  const handleClose = () => {
    if (!savingRef.current) onClose();
  };

  const runAction = async (action: 'save' | 'delete', operation: () => Promise<ActionResult<unknown>>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setPending(action);
    setError('');
    try {
      const result = await operation();
      if (result.success) onClose();
      else setError(result.reason);
    } catch (cause) {
      console.warn('[assignment modal] Passåtgärden misslyckades', cause);
      setError(action === 'delete'
        ? 'Passet kunde inte tas bort. Försök igen.'
        : 'Passet kunde inte sparas. Försök igen.');
    } finally {
      savingRef.current = false;
      setPending(null);
    }
  };

  const handleSubmit = () => {
    if (!selectedDate) {
      setError('Välj ett datum.');
      return;
    }
    if (!isValidISODate(selectedDate)) {
      setError('Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.');
      return;
    }
    if (time.trim() && !isValidTime(time.trim())) {
      setError('Ange en giltig tid i formatet HH:MM (00:00–23:59).');
      return;
    }

    const cleanedNote = note.trim();
    const baselineNote = (initialNote ?? '').trim();
    const noteChanged = mode === 'edit' ? cleanedNote !== baselineNote : cleanedNote.length > 0;

    void runAction('save', () => onSubmit({
      requestId: mode === 'create' ? requestId.current : undefined,
      date: selectedDate,
      slot: selectedSlot,
      note: cleanedNote,
      assignToCurrentUser: assignToMe,
      noteProvided: noteChanged,
      labelOverride: labelTouched ? label.trim() : undefined,
      time: timeTouched ? time.trim() : undefined,
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} disabled={pending !== null} />
        <ScrollView style={styles.sheetContainer} contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datum</Text>
            <View style={styles.optionRow}>
              {dateOptions.map((option) => {
                const active = option.value === selectedDate;
                return (
                  <TouchableOpacity
                    key={option.value}
                    disabled={pending !== null}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() => setSelectedDate(option.value)}
                  >
                    <Text style={[styles.optionChipLabel, active && styles.optionChipLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pass</Text>
            <View style={styles.optionRow}>
              {slots.map((slot) => {
                const active = slot.value === selectedSlot;
                return (
                  <TouchableOpacity
                    key={slot.value}
                    disabled={pending !== null}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() => setSelectedSlot(slot.value)}
                  >
                    <Text style={[styles.optionChipLabel, active && styles.optionChipLabelActive]}>
                      {slot.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Benämning</Text>
            <TextInput
              editable={pending === null}
              value={label}
              onChangeText={(value) => {
                setLabel(value);
                setLabelTouched(true);
              }}
              placeholder="Ex. Mockning, Harva ridhus"
              placeholderTextColor={color.textMuted}
              style={styles.compactInput}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tid</Text>
            <TextInput
              editable={pending === null}
              value={time}
              onChangeText={(value) => {
                setTime(value);
                setTimeTouched(true);
              }}
              placeholder="07:00"
              placeholderTextColor={color.textMuted}
              style={styles.compactInput}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Anteckning</Text>
            <TextInput
              editable={pending === null}
              value={note}
              onChangeText={setNote}
              placeholder="Beskrivning (valfritt)"
              placeholderTextColor={color.textMuted}
              style={styles.noteInput}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            disabled={pending !== null}
            style={[styles.assignToggle, assignToMe && styles.assignToggleActive]}
            onPress={() => setAssignToMe((prev) => !prev)}
          >
            <Text style={[styles.assignToggleLabel, assignToMe && styles.assignToggleLabelActive]}>
              {assignToMe ? 'Tilldelas mig direkt' : 'Låt passet vara öppet'}
            </Text>
          </TouchableOpacity>

          {showDelete ? (
            <TouchableOpacity
              style={styles.deleteButton}
              accessibilityRole="button"
              disabled={pending !== null}
              onPress={() => onDelete && void runAction('delete', onDelete)}
            >
              <Text style={styles.deleteButtonLabel}>{pending === 'delete' ? 'Tar bort pass…' : 'Ta bort pass'}</Text>
            </TouchableOpacity>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} accessibilityRole="button" disabled={pending !== null} onPress={handleClose}>
              <Text style={styles.secondaryButtonLabel}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} accessibilityRole="button" disabled={pending !== null} onPress={handleSubmit}>
              <Text style={styles.primaryButtonLabel}>{pending === 'save' ? 'Sparar pass…' : primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: 16,
  },
  sheetContainer: {
    maxHeight: '90%',
    flexGrow: 0,
    backgroundColor: color.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  errorText: {
    color: systemPalette.error,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: color.text,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
    letterSpacing: 0.3,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15,22,34,0.08)',
  },
  optionChipActive: {
    backgroundColor: systemPalette.primary,
  },
  optionChipLabel: {
    fontSize: 13,
    color: color.text,
  },
  optionChipLabelActive: {
    color: systemPalette.textInverse,
    fontWeight: '600',
  },
  noteInput: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: color.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  compactInput: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: color.text,
  },
  assignToggle: {
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,22,34,0.08)',
    alignSelf: 'flex-start',
  },
  assignToggleActive: {
    backgroundColor: systemPalette.primary,
  },
  assignToggleLabel: {
    fontSize: 13,
    color: color.text,
  },
  assignToggleLabelActive: {
    color: systemPalette.textInverse,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.12)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 14,
    color: color.text,
    fontWeight: '500',
  },
  primaryButton: {
    flex: 1,
    borderRadius: radius.full,
    backgroundColor: systemPalette.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontSize: 14,
    color: systemPalette.textInverse,
    fontWeight: '600',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  deleteButtonLabel: {
    fontSize: 14,
    color: systemPalette.error,
    fontWeight: '600',
  },
});
