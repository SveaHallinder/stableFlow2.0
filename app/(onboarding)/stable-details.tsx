import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

export default function OnboardingStableDetails() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions } = useAppData();
  const { stables, currentStableId } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );

  const [draft, setDraft] = React.useState({
    name: '',
    description: '',
    location: '',
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
    if (!activeStable) {
      return;
    }
    setDraft({
      name: activeStable.name ?? '',
      description: activeStable.description ?? '',
      location: activeStable.location ?? '',
    });
  }, [activeStable]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleSave = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return false;
    }
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Stallnamn krävs.', 'error');
      return false;
    }
    const result = actions.updateStable({
      id: activeStableId,
      updates: {
        name,
        description: draft.description.trim() || undefined,
        location: draft.location.trim() || undefined,
      },
    });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return false;
    }
    toast.showToast('Stalluppgifter sparade.', 'success');
    return true;
  }, [actions, activeStableId, draft.description, draft.location, draft.name, toast]);

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

  const canContinue = Boolean(activeStableId && draft.name.trim());

  return (
    <OnboardingShell
      title="Stalluppgifter"
      subtitle="Valfritt: Fyll i namn, plats och beskrivning. Du kan göra det senare."
      step={3}
      total={10}
      onBack={handleBack}
      onNext={handleNext}
      nextLabel="Spara & tillbaka"
      showProgress={false}
      disableNext={!canContinue}
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
        <Text style={styles.sectionTitle}>Grundinfo</Text>
        <TextInput
          placeholder="Stallnamn"
          placeholderTextColor={palette.mutedText}
          value={draft.name}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <TextInput
          placeholder="Plats (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.location}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, location: text }))}
          style={styles.input}
        />
        <TextInput
          placeholder="Beskrivning (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.description}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, description: text }))}
          style={[styles.input, styles.multilineInput]}
          multiline
        />
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
    minHeight: 96,
    textAlignVertical: 'top',
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
});
