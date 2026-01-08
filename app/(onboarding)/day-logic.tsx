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
  const { state, actions } = useAppData();
  const { stables, currentStableId, horses } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );
  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );

  const [dayLogic, setDayLogic] = React.useState<StableDayLogic>('box');
  const [horseDrafts, setHorseDrafts] = React.useState<Record<string, HorseDraft>>({});

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

  React.useEffect(() => {
    const settings = resolveStableSettings(activeStable);
    setDayLogic(settings.dayLogic);
    const drafts: Record<string, HorseDraft> = {};
    stableHorses.forEach((horse) => {
      drafts[horse.id] = {
        boxNumber: horse.boxNumber ?? '',
        canSleepInside: horse.canSleepInside ?? false,
      };
    });
    setHorseDrafts(drafts);
  }, [activeStable, stableHorses]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleHorseUpdate = React.useCallback((horseId: string, updates: Partial<HorseDraft>) => {
    setHorseDrafts((prev) => ({
      ...prev,
      [horseId]: { ...prev[horseId], ...updates },
    }));
  }, []);

  const handleSave = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return false;
    }
    const stableResult = actions.updateStable({
      id: activeStableId,
      updates: { settings: { dayLogic } },
    });
    if (!stableResult.success) {
      toast.showToast(stableResult.reason, 'error');
      return false;
    }

    let errors = 0;
    stableHorses.forEach((horse) => {
      const draft = horseDrafts[horse.id];
      if (!draft) {
        return;
      }
      const nextBox = draft.boxNumber.trim();
      const nextSleep = dayLogic === 'loose' ? draft.canSleepInside : horse.canSleepInside;
      const hasChange =
        nextBox !== (horse.boxNumber ?? '') ||
        (dayLogic === 'loose' && draft.canSleepInside !== Boolean(horse.canSleepInside));
      if (!hasChange) {
        return;
      }
      const updateResult = actions.upsertHorse({
        id: horse.id,
        name: horse.name,
        stableId: horse.stableId,
        ownerUserId: horse.ownerUserId,
        gender: horse.gender,
        age: horse.age,
        note: horse.note,
        image: horse.image,
        boxNumber: nextBox,
        canSleepInside: nextSleep,
      });
      if (!updateResult.success) {
        errors += 1;
      }
    });

    if (errors > 0) {
      toast.showToast('Kunde inte spara alla hästar.', 'error');
      return false;
    }

    toast.showToast('Inställningar sparade.', 'success');
    return true;
  }, [actions, activeStableId, dayLogic, horseDrafts, stableHorses, toast]);

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
      title="Lösdrift eller box"
      subtitle="Valfritt: Välj box eller lösdrift. Du kan ändra senare."
      step={7}
      total={10}
      onBack={handleBack}
      onNext={handleNext}
      nextLabel="Spara & tillbaka"
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
        <Text style={styles.sectionTitle}>Driftsform</Text>
        <View style={styles.optionGrid}>
          {dayLogicOptions.map((option) => {
            const active = dayLogic === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionCard, active && styles.optionCardActive]}
                onPress={() => setDayLogic(option.id)}
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
                        <TouchableOpacity
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
                  <TextInput
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
