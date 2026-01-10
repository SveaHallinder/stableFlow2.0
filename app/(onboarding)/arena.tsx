import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

type ResourceDraft = {
  hasArena: boolean;
  hasRoundPen: boolean;
};

export default function OnboardingResources() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions } = useAppData();
  const { stables, currentStableId, farms } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );

  const hasFarms = farms.length > 0;
  const fallbackFarmId = activeStable?.farmId || farms[0]?.id || '';
  const [activeFarmId, setActiveFarmId] = React.useState(fallbackFarmId);
  const activeFarm = React.useMemo(
    () => farms.find((farm) => farm.id === activeFarmId),
    [activeFarmId, farms],
  );
  const farmStables = React.useMemo(
    () => (activeFarmId ? stables.filter((stable) => stable.farmId === activeFarmId) : []),
    [activeFarmId, stables],
  );
  const useFarmResources = Boolean(activeFarmId);
  const scopeLabel = useFarmResources ? 'gården' : 'stallet';

  const [draft, setDraft] = React.useState<ResourceDraft>({
    hasArena: false,
    hasRoundPen: false,
  });

  React.useEffect(() => {
    if (!stables.length) {
      router.replace('/(onboarding)/setup');
      return;
    }
    if (!activeStableId && fallbackStableId) {
      setActiveStableId(fallbackStableId);
    }
    if (activeStableId && !stables.some((stable) => stable.id === activeStableId)) {
      setActiveStableId(fallbackStableId);
    }
  }, [activeStableId, fallbackStableId, router, stables]);

  React.useEffect(() => {
    if (!hasFarms) {
      if (activeFarmId) {
        setActiveFarmId('');
      }
      return;
    }
    const nextFarmId = activeStable?.farmId || farms[0]?.id || '';
    if (!activeFarmId && nextFarmId) {
      setActiveFarmId(nextFarmId);
      return;
    }
    if (activeFarmId && !farms.some((farm) => farm.id === activeFarmId)) {
      setActiveFarmId(nextFarmId);
      return;
    }
    if (activeStable?.farmId && activeStable.farmId !== activeFarmId) {
      setActiveFarmId(activeStable.farmId);
    }
  }, [activeFarmId, activeStable?.farmId, farms, hasFarms]);

  React.useEffect(() => {
    if (useFarmResources) {
      const farmHasArena = activeFarm?.hasIndoorArena ?? false;
      const farmRoundPen = farmStables.some((stable) => resolveStableSettings(stable).arena.hasRoundPen);
      setDraft({
        hasArena: farmHasArena,
        hasRoundPen: farmRoundPen,
      });
      return;
    }
    const settings = resolveStableSettings(activeStable);
    setDraft({
      hasArena: settings.arena.hasArena,
      hasRoundPen: settings.arena.hasRoundPen,
    });
  }, [activeFarm, activeStable, farmStables, useFarmResources]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleSelectFarm = React.useCallback((farmId: string) => {
    setActiveFarmId(farmId);
  }, []);

  const handleSave = React.useCallback(() => {
    if (useFarmResources && !activeFarmId) {
      toast.showToast('Välj en gård först.', 'error');
      return false;
    }
    if (!useFarmResources && !activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return false;
    }

    if (useFarmResources && activeFarmId) {
      const accessStableId = farmStables[0]?.id || activeStableId || stables[0]?.id;
      if (!accessStableId) {
        toast.showToast('Välj ett stall först.', 'error');
        return false;
      }
      const farmName = activeFarm?.name || 'Gård';
      const farmResult = actions.upsertFarm({
        id: activeFarmId,
        name: farmName,
        location: activeFarm?.location,
        hasIndoorArena: draft.hasArena,
        arenaNote: activeFarm?.arenaNote,
        accessStableId,
      });
      if (!farmResult.success) {
        toast.showToast(farmResult.reason, 'error');
        return false;
      }
      const targets = farmStables.length ? farmStables : stables.filter((stable) => stable.farmId === activeFarmId);
      for (const stable of targets) {
        const settings = resolveStableSettings(stable);
        const result = actions.updateStable({
          id: stable.id,
          updates: {
            settings: {
              arena: {
                ...settings.arena,
                hasArena: draft.hasArena,
                hasRoundPen: draft.hasRoundPen,
              },
              onboarding: {
                ...settings.onboarding,
                resourcesComplete: true,
              },
            },
          },
        });
        if (!result.success) {
          toast.showToast(result.reason, 'error');
          return false;
        }
      }
    } else {
      const settings = resolveStableSettings(activeStable);
      const result = actions.updateStable({
        id: activeStableId,
        updates: {
          settings: {
            arena: {
              ...settings.arena,
              hasArena: draft.hasArena,
              hasRoundPen: draft.hasRoundPen,
            },
            onboarding: {
              ...settings.onboarding,
              resourcesComplete: true,
            },
          },
        },
      });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
        return false;
      }
    }

    toast.showToast('Resurser sparade.', 'success');
    return true;
  }, [
    actions,
    activeFarm?.arenaNote,
    activeFarm?.location,
    activeFarm?.name,
    activeFarmId,
    activeStable,
    activeStableId,
    draft.hasArena,
    draft.hasRoundPen,
    farmStables,
    stables,
    toast,
    useFarmResources,
  ]);

  const handleNext = React.useCallback(() => {
    if (handleSave()) {
      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.back();
      }
    }
  }, [handleSave, returnTo, router]);

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Resurser"
      subtitle={`Svara på två frågor om ridhus och volt för ${scopeLabel}.`}
      step={3}
      total={6}
      allowExit={false}
      onBack={handleBack}
      onNext={handleNext}
      nextLabel="Spara och fortsätt"
      showProgress
    >
      {useFarmResources ? (
        farms.length > 1 ? (
          <Card tone="muted" style={styles.card}>
            <Text style={styles.sectionTitle}>Välj gård</Text>
            <View style={styles.chipRow}>
              {farms.map((farm) => {
                const active = farm.id === activeFarmId;
                return (
                  <TouchableOpacity
                    key={farm.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => handleSelectFarm(farm.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{farm.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        ) : (
          <Card tone="muted" style={styles.card}>
            <Text style={styles.sectionTitle}>Gård</Text>
            <Text style={styles.sectionHint}>{activeFarm?.name ?? 'Gård'}</Text>
          </Card>
        )
      ) : stables.length > 1 ? (
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
        <Text style={styles.sectionTitle}>Har {scopeLabel} ridhus</Text>
        <View style={styles.toggleRow}>
          {[
            { label: 'Ja', value: true },
            { label: 'Nej', value: false },
          ].map((option) => (
            <TouchableOpacity
              key={option.label}
              style={[styles.toggleChip, draft.hasArena === option.value && styles.toggleChipActive]}
              onPress={() => setDraft((prev) => ({ ...prev, hasArena: option.value }))}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, draft.hasArena === option.value && styles.toggleTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Har {scopeLabel} volt</Text>
        <View style={styles.toggleRow}>
          {[
            { label: 'Ja', value: true },
            { label: 'Nej', value: false },
          ].map((option) => (
            <TouchableOpacity
              key={option.label}
              style={[styles.toggleChip, draft.hasRoundPen === option.value && styles.toggleChipActive]}
              onPress={() => setDraft((prev) => ({ ...prev, hasRoundPen: option.value }))}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, draft.hasRoundPen === option.value && styles.toggleTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Sammanfattning</Text>
        <Text style={styles.summaryText}>
          Ridhus {draft.hasArena ? 'Ja' : 'Nej'}
        </Text>
        <Text style={styles.summaryText}>
          Volt {draft.hasRoundPen ? 'Ja' : 'Nej'}
        </Text>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 12, color: palette.secondaryText },
  summaryText: { fontSize: 13, color: palette.secondaryText },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  toggleChipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  toggleText: { fontSize: 12, color: palette.primaryText },
  toggleTextActive: { color: palette.inverseText, fontWeight: '600' },
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
});
