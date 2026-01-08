import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, type StableEventVisibility } from '@/context/AppDataContext';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

const eventVisibilityOptions: { id: keyof StableEventVisibility; label: string }[] = [
  { id: 'feeding', label: 'Fodring saknas' },
  { id: 'cleaning', label: 'Städning/Mockning' },
  { id: 'riderAway', label: 'Ryttare bortrest' },
  { id: 'farrierAway', label: 'Hovslagare bortrest' },
  { id: 'vetAway', label: 'Veterinär bortrest' },
  { id: 'evening', label: 'Kvällspass' },
];

export default function OnboardingEvents() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { stables, currentStableId } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );

  const [visibility, setVisibility] = React.useState<StableEventVisibility>({
    feeding: true,
    cleaning: true,
    riderAway: true,
    farrierAway: true,
    vetAway: true,
    evening: true,
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

  React.useEffect(() => {
    const settings = resolveStableSettings(activeStable);
    setVisibility({ ...settings.eventVisibility });
  }, [activeStable]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleToggle = React.useCallback((key: keyof StableEventVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleFinish = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const result = actions.updateStable({
      id: activeStableId,
      updates: { settings: { eventVisibility: visibility } },
    });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast('Inställningar sparade.', 'success');
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [actions, activeStableId, returnTo, router, toast, visibility]);

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Händelser i schema"
      subtitle="Valfritt: Välj vilka händelser som ska synas i schemat."
      step={10}
      total={10}
      onBack={handleBack}
      onNext={handleFinish}
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
        <Text style={styles.sectionTitle}>Synliga händelser</Text>
        <View style={styles.chipRow}>
          {eventVisibilityOptions.map((option) => {
            const active = visibility[option.id];
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleToggle(option.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
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
