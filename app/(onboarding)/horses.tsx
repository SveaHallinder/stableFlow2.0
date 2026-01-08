import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData, type Horse } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

const genderOptions: { id: NonNullable<Horse['gender']>; label: string }[] = [
  { id: 'mare', label: 'Sto' },
  { id: 'gelding', label: 'Valack' },
  { id: 'stallion', label: 'Hingst' },
  { id: 'unknown', label: 'Okänt' },
];

export default function OnboardingHorses() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions } = useAppData();
  const { stables, currentStableId, horses } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);

  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );

  const [draft, setDraft] = React.useState({
    name: '',
    gender: 'unknown' as NonNullable<Horse['gender']>,
    age: '',
    note: '',
  });

  React.useEffect(() => {
    if (!stables.length) {
      router.replace('/(onboarding)/stables');
      return;
    }
    if (!activeStableId && fallbackStableId) {
      setActiveStableId(fallbackStableId);
    }
    if (activeStableId && !stables.some((stable) => stable.id === activeStableId)) {
      setActiveStableId(fallbackStableId);
    }
  }, [activeStableId, fallbackStableId, router, stables]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleAddHorse = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Hästens namn krävs.', 'error');
      return;
    }
    const trimmedAge = draft.age.trim();
    const ageValue = trimmedAge ? Number(trimmedAge) : undefined;
    if (trimmedAge && Number.isNaN(ageValue)) {
      toast.showToast('Ålder måste vara en siffra.', 'error');
      return;
    }
    const result = actions.upsertHorse({
      name,
      stableId: activeStableId,
      gender: draft.gender,
      age: ageValue,
      note: draft.note.trim() || undefined,
    });
    if (result.success) {
      toast.showToast('Häst sparad.', 'success');
      setDraft({ name: '', gender: 'unknown', age: '', note: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, activeStableId, draft.age, draft.gender, draft.name, draft.note, toast]);

  const handleDeleteHorse = React.useCallback(
    (horseId: string) => {
      const result = actions.deleteHorse(horseId);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      } else {
        toast.showToast('Häst borttagen.', 'success');
      }
    },
    [actions, toast],
  );

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Hästar"
      subtitle="Valfritt: Lägg in hästarna nu eller gör det senare."
      step={5}
      total={10}
      onNext={handleBack}
      nextLabel="Klar"
      showProgress={false}
    >
      {stables.length > 1 ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Välj stall</Text>
          <View style={styles.chipRow}>
            {stables.map((stable) => {
              const active = stable.id === activeStableId;
              return (
                <TouchableOpacity
                  key={stable.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handleSelectStable(stable.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{stable.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Ny häst</Text>
        <TextInput
          placeholder="Hästens namn"
          placeholderTextColor={palette.mutedText}
          value={draft.name}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {genderOptions.map((option) => {
            const active = draft.gender === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, gender: option.id }))}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          placeholder="Ålder (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.age}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, age: text }))}
          style={styles.input}
          keyboardType="number-pad"
        />
        <TextInput
          placeholder="Anteckning (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.note}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, note: text }))}
          style={[styles.input, styles.multilineInput]}
          multiline
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleAddHorse} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Lägg till häst</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Dina hästar</Text>
        <View style={styles.list}>
          {stableHorses.map((horse) => (
            <View key={horse.id} style={styles.listRow}>
              <View>
                <Text style={styles.listTitle}>{horse.name}</Text>
                <Text style={styles.listMeta}>
                  {horse.gender && horse.gender !== 'unknown'
                    ? genderOptions.find((option) => option.id === horse.gender)?.label
                    : 'Ingen kön angiven'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => handleDeleteHorse(horse.id)}
                activeOpacity={0.85}
              >
                <Feather name="x" size={14} color={palette.secondaryText} />
              </TouchableOpacity>
            </View>
          ))}
          {stableHorses.length === 0 ? (
            <Text style={styles.emptyText}>Inga hästar inlagda ännu.</Text>
          ) : null}
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 12, color: palette.primaryText },
  chipTextActive: { color: palette.inverseText, fontWeight: '600' },
  list: { gap: 10 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  listTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  listMeta: { fontSize: 12, color: palette.secondaryText, marginTop: 4 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  emptyText: { fontSize: 12, color: palette.secondaryText },
});
