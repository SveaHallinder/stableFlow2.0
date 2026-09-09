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
  const { state, actions, hydrating } = useAppData();
  const { stables, currentStableId, farms } = state;
  const currentUser = state.users[state.currentUserId];
  const manageableStableIds = React.useMemo(() => {
    const entries = currentUser?.membership ?? [];
    return new Set(
      entries
        .filter((entry) => entry.role === 'admin' && (entry.access ?? 'view') === 'owner')
        .map((entry) => entry.stableId),
    );
  }, [currentUser]);

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
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const dirtyResourceRef = React.useRef(new Set<keyof ResourceDraft>());
  const draftScopeRef = React.useRef('');
  const scopeKey = useFarmResources ? `farm:${activeFarmId}` : `stable:${activeStableId}`;
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (hydrating) return;
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
  }, [activeStableId, fallbackStableId, router, stables, hydrating]);

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
  }, [activeFarmId, activeStable?.farmId, farms, hasFarms]);

  React.useEffect(() => {
    if (draftScopeRef.current !== scopeKey) {
      draftScopeRef.current = scopeKey;
      dirtyResourceRef.current.clear();
      setSaveError(null);
    }
    const settings = resolveStableSettings(activeStable);
    const hasArena = useFarmResources ? activeFarm?.hasIndoorArena ?? false : settings.arena.hasArena;
    const hasRoundPen = useFarmResources
      ? farmStables.some((stable) => resolveStableSettings(stable).arena.hasRoundPen)
      : settings.arena.hasRoundPen;
    setDraft(previous => ({
      hasArena: dirtyResourceRef.current.has('hasArena') ? previous.hasArena : hasArena,
      hasRoundPen: dirtyResourceRef.current.has('hasRoundPen') ? previous.hasRoundPen : hasRoundPen,
    }));
  }, [activeFarm?.hasIndoorArena, activeStable, farmStables, scopeKey, useFarmResources]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      if (savingRef.current) return;
      setActiveStableId(stableId);
      setActiveFarmId(stables.find(stable => stable.id === stableId)?.farmId ?? farms[0]?.id ?? '');
      actions.setCurrentStable(stableId);
    },
    [actions, farms, stables],
  );

  const handleSelectFarm = React.useCallback((farmId: string) => {
    if (savingRef.current) return;
    setActiveFarmId(farmId);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (savingRef.current) return false;
    if ((useFarmResources && !activeFarmId) || (!useFarmResources && !activeStableId)) {
      setSaveError(useFarmResources ? 'Välj en gård först.' : 'Välj ett stall först.');
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const dirty = new Set(dirtyResourceRef.current);
      const arena = {
        ...(dirty.has('hasArena') ? { hasArena: draft.hasArena } : {}),
        ...(dirty.has('hasRoundPen') ? { hasRoundPen: draft.hasRoundPen } : {}),
      };
      let targets = stables.filter((stable) => stable.id === activeStableId);
      if (useFarmResources) {
        targets = farmStables.filter((stable) => manageableStableIds.has(stable.id));
        const accessStableId = targets[0]?.id;
        if (!accessStableId) {
          setSaveError('Du måste vara stallägare för minst ett stall i gården.');
          return false;
        }
        if (dirty.has('hasArena')) {
          const result = await actions.upsertFarm({ id: activeFarmId, hasIndoorArena: draft.hasArena, accessStableId });
          if (!result.success) { setSaveError(result.reason); return false; }
        }
      }
      if (!targets.length) { setSaveError('Stallet kunde inte hittas.'); return false; }
      for (const stable of targets) {
        const result = await actions.updateStable({ id: stable.id, updates: {
          settings: { arena, onboarding: { resourcesComplete: true } },
        } });
        if (!result.success) { setSaveError(result.reason); return false; }
      }
      if (draftScopeRef.current !== scopeKey) {
        setSaveError('Vald gård eller valt stall har ändrats. Kontrollera uppgifterna igen.');
        return false;
      }
      dirtyResourceRef.current.clear();
      toast.showToast('Resurser sparade.', 'success');
      return true;
    } catch (error) {
      console.warn('[resource save] Kunde inte spara resurser', error);
      setSaveError('Resurserna kunde inte sparas. Dina val finns kvar. Försök igen.');
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }, [actions, activeFarmId, activeStableId, draft.hasArena, draft.hasRoundPen, farmStables, manageableStableIds, scopeKey, stables, toast, useFarmResources]);

  const handleNext = React.useCallback(async () => {
    if (await handleSave()) {
      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.back();
      }
    }
  }, [handleSave, returnTo, router]);

  const handleBack = React.useCallback(() => {
    if (savingRef.current) return;
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
      nextLabel={saving ? 'Sparar...' : 'Spara och fortsätt'}
      disableNext={saving}
      showProgress
    >
      {saveError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{saveError}</Text> : null}
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
                    disabled={saving}
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
                  disabled={saving}
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
              disabled={saving}
              onPress={() => { dirtyResourceRef.current.add('hasArena'); setDraft((prev) => ({ ...prev, hasArena: option.value })); }}
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
              disabled={saving}
              onPress={() => { dirtyResourceRef.current.add('hasRoundPen'); setDraft((prev) => ({ ...prev, hasRoundPen: option.value })); }}
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
