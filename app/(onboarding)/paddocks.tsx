import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

export default function OnboardingPaddocks() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const { stables, currentStableId, horses, paddocks } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );
  const stablePaddocks = React.useMemo(
    () => paddocks.filter((paddock) => paddock.stableId === activeStableId),
    [activeStableId, paddocks],
  );

  const [draft, setDraft] = React.useState({ name: '', horseIds: [] as string[] });

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
      setDraft({ name: '', horseIds: [] });
    },
    [actions],
  );

  const handleToggleHorse = React.useCallback((horseId: string) => {
    setDraft((prev) => {
      const exists = prev.horseIds.includes(horseId);
      return {
        ...prev,
        horseIds: exists ? prev.horseIds.filter((id) => id !== horseId) : [...prev.horseIds, horseId],
      };
    });
  }, []);

  const handleAddPaddock = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Hagens namn krävs.', 'error');
      return;
    }
    const horseNames = stableHorses
      .filter((horse) => draft.horseIds.includes(horse.id))
      .map((horse) => horse.name);
    const result = actions.upsertPaddock({
      stableId: activeStableId,
      name,
      horseNames,
      season: 'yearRound',
    });
    if (result.success) {
      toast.showToast('Hage sparad.', 'success');
      setDraft({ name: '', horseIds: [] });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, activeStableId, draft.horseIds, draft.name, stableHorses, toast]);

  const handleDeletePaddock = React.useCallback(
    (paddockId: string) => {
      const result = actions.deletePaddock(paddockId);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      } else {
        toast.showToast('Hage borttagen.', 'success');
      }
    },
    [actions, toast],
  );

  return (
    <OnboardingShell
      title="Hagar"
      subtitle="Valfritt: Koppla hästar till hagar. Du kan göra det senare."
      step={8}
      total={10}
      onBack={() => router.back()}
      onNext={() => router.push('/(onboarding)/ride-types')}
      onSkip={() => router.push('/(onboarding)/ride-types')}
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
        <Text style={styles.sectionTitle}>Ny hage</Text>
        <TextInput
          placeholder="Namn på hage"
          placeholderTextColor={palette.mutedText}
          value={draft.name}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <Text style={styles.sectionHint}>Välj hästar som går tillsammans.</Text>
        <View style={styles.chipRow}>
          {stableHorses.map((horse) => {
            const active = draft.horseIds.includes(horse.id);
            return (
              <TouchableOpacity
                key={horse.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleToggleHorse(horse.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{horse.name}</Text>
              </TouchableOpacity>
            );
          })}
          {stableHorses.length === 0 ? (
            <Text style={styles.emptyText}>Lägg till hästar först.</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={handleAddPaddock} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Spara hage</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Dina hagar</Text>
        <View style={styles.list}>
          {stablePaddocks.map((paddock) => (
            <View key={paddock.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{paddock.name}</Text>
                <Text style={styles.listMeta}>
                  {paddock.horseNames.length ? paddock.horseNames.join(', ') : 'Inga hästar valda'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => handleDeletePaddock(paddock.id)}
                activeOpacity={0.85}
              >
                <Feather name="x" size={14} color={palette.secondaryText} />
              </TouchableOpacity>
            </View>
          ))}
          {stablePaddocks.length === 0 ? (
            <Text style={styles.emptyText}>Inga hagar inlagda ännu.</Text>
          ) : null}
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 12, color: palette.secondaryText },
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
    gap: 12,
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
