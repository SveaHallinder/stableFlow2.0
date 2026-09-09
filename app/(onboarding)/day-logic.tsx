import { DataSyncStatus } from '@/components/DataSyncStatus';
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, type StableDayLogic } from '@/context/AppDataContext';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

const dayLogicOptions: { id: StableDayLogic; title: string; description: string }[] = [
  { id: 'box', title: 'Box', description: 'Hästarna står i boxar.' },
  { id: 'loose', title: 'Lösdrift', description: 'Lösdrift med möjlighet att ha box per häst.' },
];

type HorseDraft = {
  boxNumber: string;
  canSleepInside: boolean;
};

export default function OnboardingDayLogic() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions, hydrating } = useAppData();
  const { stables, currentStableId, horses } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );
  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );

  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const [dayLogic, setDayLogic] = React.useState<StableDayLogic>('box');
  const [horseDrafts, setHorseDrafts] = React.useState<Record<string, HorseDraft>>({});
  const draftStableRef = React.useRef('');
  const dirtyHorsesRef = React.useRef(new Map<string, Set<keyof HorseDraft>>());
  const dirtyDayLogicRef = React.useRef(false);

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

  React.useEffect(() => {
    if (draftStableRef.current !== activeStableId) {
      draftStableRef.current = activeStableId;
      dirtyHorsesRef.current.clear();
      dirtyDayLogicRef.current = false;
    }
    const settings = resolveStableSettings(activeStable);
    if (!dirtyDayLogicRef.current) setDayLogic(settings.dayLogic);
    setHorseDrafts((previous) => {
      const drafts: Record<string, HorseDraft> = {};
      stableHorses.forEach((horse) => {
        const dirty = dirtyHorsesRef.current.get(horse.id);
        drafts[horse.id] = {
          boxNumber: dirty?.has('boxNumber') && previous[horse.id] ? previous[horse.id].boxNumber : horse.boxNumber ?? '',
          canSleepInside: dirty?.has('canSleepInside') && previous[horse.id] ? previous[horse.id].canSleepInside : horse.canSleepInside ?? false,
        };
      });
      return drafts;
    });
  }, [activeStable, activeStableId, stableHorses]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleHorseUpdate = React.useCallback((horseId: string, updates: Partial<HorseDraft>) => {
    const dirty = dirtyHorsesRef.current.get(horseId) ?? new Set<keyof HorseDraft>();
    (Object.keys(updates) as (keyof HorseDraft)[]).forEach(key => dirty.add(key));
    dirtyHorsesRef.current.set(horseId, dirty);
    setHorseDrafts((prev) => ({
      ...prev,
      [horseId]: { ...prev[horseId], ...updates },
    }));
  }, []);

  const handleSave = React.useCallback(async () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (!activeStableId) {
        toast.showToast('Välj ett stall först.', 'error');
        return false;
      }
      const stableResult = dirtyDayLogicRef.current ? await actions.updateStable({
        id: activeStableId,
        updates: { settings: { dayLogic } },
      }) : { success: true as const };
      if (!stableResult.success) {
        setSaveError(stableResult.reason);
        toast.showToast(stableResult.reason, 'error');
        return false;
      }

      let errors = 0;
      for (const horse of stableHorses) {
        const draft = horseDrafts[horse.id];
        if (!draft) {
          continue;
        }
        const dirty = dirtyHorsesRef.current.get(horse.id);
        const updates: Partial<HorseDraft> = {};
        if (dirty?.has('boxNumber') && draft.boxNumber.trim() !== (horse.boxNumber ?? '')) updates.boxNumber = draft.boxNumber.trim();
        if (dayLogic === 'loose' && dirty?.has('canSleepInside') && draft.canSleepInside !== Boolean(horse.canSleepInside)) updates.canSleepInside = draft.canSleepInside;
        if (!Object.keys(updates).length) continue;
        const updateResult = await actions.upsertHorse({ id: horse.id, stableId: horse.stableId, ...updates });
        if (!updateResult.success) {
          errors += 1;
          setSaveError(updateResult.reason);
        } else {
          dirtyHorsesRef.current.delete(horse.id);
        }
      }

      if (errors > 0) {
        toast.showToast('Kunde inte spara alla hästar.', 'error');
        return false;
      }

      dirtyDayLogicRef.current = false;
      toast.showToast('Inställningar sparade.', 'success');
      return true;
    } finally { savingRef.current = false; setSaving(false); }
  }, [actions, activeStableId, dayLogic, horseDrafts, stableHorses, toast]);

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
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Lösdrift eller box"
      subtitle="Valfritt: Välj box eller lösdrift. Du kan ändra senare."
      step={7}
      total={10}
      onBack={handleBack}
      onNext={handleNext}
      nextLabel={saving ? 'Sparar…' : 'Spara & tillbaka'}
      disableNext={saving}
      showProgress={false}
    >
      <DataSyncStatus />
      {saveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{saveError}</Text>}
      {stables.length > 1 ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Välj stall</Text>
          <View style={styles.chipRow}>
            {stables.map((stable) => {
              const active = stable.id === activeStableId;
              return (
                <TouchableOpacity disabled={saving}
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
        <Text style={styles.sectionTitle}>Driftsform</Text>
        <View style={styles.optionGrid}>
          {dayLogicOptions.map((option) => {
            const active = dayLogic === option.id;
            return (
              <TouchableOpacity disabled={saving}
                key={option.id}
                style={[styles.optionCard, active && styles.optionCardActive]}
                onPress={() => { dirtyDayLogicRef.current = true; setDayLogic(option.id); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{option.title}</Text>
                <Text style={styles.optionText}>{option.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Hästar</Text>
        <View style={styles.list}>
          {stableHorses.map((horse) => {
            const draft = horseDrafts[horse.id] ?? { boxNumber: '', canSleepInside: false };
            return (
              <View key={horse.id} style={styles.listRow}>
                <Text style={styles.listTitle}>{horse.name}</Text>
                {dayLogic === 'loose' ? (
                  <View style={styles.choiceRow}>
                    {[
                      { label: 'Har box', value: true },
                      { label: 'Ingen box', value: false },
                    ].map((option) => {
                      const active = draft.canSleepInside === option.value;
                      return (
                        <TouchableOpacity disabled={saving}
                          key={option.label}
                          style={[styles.choiceChip, active && styles.choiceChipActive]}
                          onPress={() =>
                            handleHorseUpdate(horse.id, {
                              canSleepInside: option.value,
                              boxNumber: option.value ? draft.boxNumber : '',
                            })
                          }
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                {(dayLogic === 'box' || draft.canSleepInside) ? (
                  <TextInput editable={!saving}
                    placeholder="Boxnummer (valfritt)"
                    placeholderTextColor={palette.mutedText}
                    value={draft.boxNumber}
                    onChangeText={(text) => handleHorseUpdate(horse.id, { boxNumber: text })}
                    style={styles.input}
                  />
                ) : null}
              </View>
            );
          })}
          {stableHorses.length === 0 ? (
            <Text style={styles.emptyText}>Lägg till hästar först för att sätta boxinfo.</Text>
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
  optionGrid: { gap: 10 },
  optionCard: {
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 6,
  },
  optionCardActive: { borderColor: palette.primary, backgroundColor: palette.surfaceTint },
  optionTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  optionTitleActive: { color: palette.primary },
  optionText: { fontSize: 12, color: palette.secondaryText },
  list: { gap: 12 },
  listRow: {
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 10,
  },
  listTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  emptyText: { fontSize: 12, color: palette.secondaryText },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choiceChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  choiceChipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceText: { fontSize: 12, color: palette.primaryText, fontWeight: '600' },
  choiceTextActive: { color: palette.inverseText },
});
