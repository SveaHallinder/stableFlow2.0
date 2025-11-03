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
} from 'react-native';
import { color, radius, space } from '@/design/tokens';
import type { AssignmentSlot } from '@/context/AppDataContext';

type DateOption = {
  label: string;
  value: string;
};

export type AssignmentModalSubmit = {
  date?: string;
  slot?: AssignmentSlot;
  note?: string;
  assignToCurrentUser?: boolean;
  noteProvided: boolean;
};

type NewAssignmentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: AssignmentModalSubmit) => void;
  dateOptions: DateOption[];
  initialDate?: string;
  initialSlot?: AssignmentSlot;
  initialNote?: string;
  initialAssignToMe?: boolean;
  mode?: 'create' | 'edit';
  onDelete?: () => void;
};

const slots: Array<{ label: string; value: AssignmentSlot }> = [
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
  initialAssignToMe,
  mode = 'create',
  onDelete,
}: NewAssignmentModalProps) {
  const defaultDate = initialDate ?? dateOptions[0]?.value ?? '';
  const defaultSlot = initialSlot ?? 'Morning';
  const defaultNote = initialNote ?? '';

  const [selectedDate, setSelectedDate] = React.useState<string>(() => defaultDate);
  const [selectedSlot, setSelectedSlot] = React.useState<AssignmentSlot>(() => defaultSlot);
  const [note, setNote] = React.useState(defaultNote);
  const [assignToMe, setAssignToMe] = React.useState(initialAssignToMe ?? false);

  const title = mode === 'edit' ? 'Redigera pass' : 'Nytt pass';
  const primaryLabel = mode === 'edit' ? 'Spara ändringar' : 'Skapa pass';
  const showDelete = mode === 'edit' && !!onDelete;

  React.useEffect(() => {
    if (visible) {
      const nextDate = initialDate ?? dateOptions[0]?.value ?? '';
      const nextSlot = initialSlot ?? 'Morning';
      const nextNote = initialNote ?? '';

      setSelectedDate(nextDate);
      setSelectedSlot(nextSlot);
      setNote(nextNote);
      setAssignToMe(initialAssignToMe ?? false);
    }
  }, [visible, dateOptions, initialDate, initialSlot, initialNote, initialAssignToMe]);

  const handleSubmit = () => {
    if (!selectedDate) {
      return;
    }

    const cleanedNote = note.trim();
    const baselineNote = (initialNote ?? '').trim();
    const noteChanged = mode === 'edit' ? cleanedNote !== baselineNote : cleanedNote.length > 0;

    onSubmit({
      date: selectedDate,
      slot: selectedSlot,
      note: cleanedNote,
      assignToCurrentUser: assignToMe,
      noteProvided: noteChanged,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datum</Text>
            <View style={styles.optionRow}>
              {dateOptions.map((option) => {
                const active = option.value === selectedDate;
                return (
                  <TouchableOpacity
                    key={option.value}
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
            <Text style={styles.sectionTitle}>Anteckning</Text>
            <TextInput
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
            style={[styles.assignToggle, assignToMe && styles.assignToggleActive]}
            onPress={() => setAssignToMe((prev) => !prev)}
          >
            <Text style={[styles.assignToggleLabel, assignToMe && styles.assignToggleLabelActive]}>
              {assignToMe ? 'Tilldelas mig direkt' : 'Låt passet vara öppet'}
            </Text>
          </TouchableOpacity>

          {showDelete ? (
            <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
              <Text style={styles.deleteButtonLabel}>Ta bort pass</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonLabel}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit}>
              <Text style={styles.primaryButtonLabel}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: '#0A84FF',
  },
  optionChipLabel: {
    fontSize: 13,
    color: color.text,
  },
  optionChipLabelActive: {
    color: '#FFFFFF',
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
  assignToggle: {
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,22,34,0.08)',
    alignSelf: 'flex-start',
  },
  assignToggleActive: {
    backgroundColor: '#0A84FF',
  },
  assignToggleLabel: {
    fontSize: 13,
    color: color.text,
  },
  assignToggleLabelActive: {
    color: '#FFFFFF',
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
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  deleteButtonLabel: {
    fontSize: 14,
    color: '#FF453A',
    fontWeight: '600',
  },
});
