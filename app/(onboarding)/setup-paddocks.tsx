import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { generateId } from '@/lib/ids';
import { confirmAction } from '@/lib/confirm';

const palette = theme.colors;

export default function OnboardingPaddocks() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions, hydrating } = useAppData();
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
  const savingPaddockRef = React.useRef(false);
  const newPaddockIdRef = React.useRef<string | null>(null);
  const [paddockPending, setPaddockPending] = React.useState<'save' | 'delete' | null>(null);
  const [paddockError, setPaddockError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (hydrating) return;
    if (!stables.length) {
      router.replace('/(onboarding)/create-stable');
      return;
    }
    if (!activeStableId && fallbackStableId) {
      setActiveStableId(fallbackStableId);
    }
    if (activeStableId && !stables.some((stable) => stable.id === activeStableId)) {
      setActiveStableId(fallbackStableId);
    }
  }, [activeStableId, fallbackStableId, router, stables, hydrating]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      if (savingPaddockRef.current) return;
      newPaddockIdRef.current = null;
      setPaddockError(null);
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

  const handleAddPaddock = React.useCallback(async () => {
    if (savingPaddockRef.current) return;
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
    savingPaddockRef.current = true;
    setPaddockPending('save');
    setPaddockError(null);
    newPaddockIdRef.current ??= generateId();
    const result = await actions.upsertPaddock({
      id: newPaddockIdRef.current,
      stableId: activeStableId,
      name,
      horseNames,
      season: 'yearRound',
    });
    savingPaddockRef.current = false;
    setPaddockPending(null);
    if (result.success) {
      newPaddockIdRef.current = null;
      toast.showToast('Hage sparad.', 'success');
      setDraft({ name: '', horseIds: [] });
    } else {
      setPaddockError(result.reason);
    }
  }, [actions, activeStableId, draft.horseIds, draft.name, stableHorses, toast]);

  const handleDeletePaddock = React.useCallback(async (paddockId: string) => {
    if (savingPaddockRef.current) return;
    savingPaddockRef.current = true;
    try {
      const confirmed = await confirmAction({ title: 'Ta bort hage?', message: 'Detta går inte att ångra.', confirmLabel: 'Ta bort', destructive: true });
      if (!confirmed) return;
      setPaddockPending('delete');
      setPaddockError(null);
      const result = await actions.deletePaddock(paddockId);
      if (result.success) toast.showToast('Hage borttagen.', 'success');
      else setPaddockError(result.reason);
    } finally {
      savingPaddockRef.current = false;
      setPaddockPending(null);
    }
  }, [actions, toast]);

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Hagar"
      subtitle="Valfritt: Koppla hästar till hagar. Du kan göra det senare."
      step={8}
      total={10}
      disableNext={Boolean(paddockPending)}
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
                  disabled={Boolean(paddockPending)}
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
        {paddockError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{paddockError}</Text> : null}
        {paddockPending ? <Text accessibilityLiveRegion="polite">{paddockPending === 'delete' ? 'Tar bort hagen…' : 'Sparar hagen…'}</Text> : null}
        <TextInput
          placeholder="Namn på hage"
          placeholderTextColor={palette.mutedText}
          editable={!paddockPending}
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
                disabled={Boolean(paddockPending)}
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
        <TouchableOpacity style={styles.primaryButton} disabled={Boolean(paddockPending)} onPress={handleAddPaddock} activeOpacity={0.9}>
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
                style={[styles.iconButton, { minWidth: 44, minHeight: 44 }]}
                accessibilityRole="button"
                accessibilityLabel={`Ta bort ${paddock.name}`}
                disabled={Boolean(paddockPending)}
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
