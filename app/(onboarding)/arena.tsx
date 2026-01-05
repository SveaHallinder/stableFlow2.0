import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, type ArenaBookingMode, type StableArenaSettings } from '@/context/AppDataContext';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

const bookingModeOptions: Array<{ id: ArenaBookingMode; label: string; description: string }> = [
  { id: 'open', label: 'Öppen bokning', description: 'Alla kan boka direkt.' },
  { id: 'approval', label: 'Kräver godkännande', description: 'Bokningar behöver godkännas.' },
  { id: 'staff', label: 'Endast personal', description: 'Endast admin/personal kan boka.' },
];

export default function OnboardingArena() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const { stables, currentStableId } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );

  const [arenaDraft, setArenaDraft] = React.useState<StableArenaSettings>({
    hasArena: false,
    hasSchedule: false,
    bookingMode: 'open',
    rules: '',
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
    setArenaDraft({
      hasArena: settings.arena.hasArena,
      hasSchedule: settings.arena.hasSchedule,
      bookingMode: settings.arena.bookingMode,
      rules: settings.arena.rules ?? '',
    });
  }, [activeStable]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleToggleArena = React.useCallback((value: boolean) => {
    setArenaDraft((prev) => ({
      ...prev,
      hasArena: value,
      hasSchedule: value ? prev.hasSchedule : false,
    }));
  }, []);

  const handleToggleSchedule = React.useCallback((value: boolean) => {
    setArenaDraft((prev) => ({
      ...prev,
      hasSchedule: value,
      bookingMode: value ? prev.bookingMode : 'open',
    }));
  }, []);

  const handleSave = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return false;
    }
    const payload: StableArenaSettings = {
      hasArena: arenaDraft.hasArena,
      hasSchedule: arenaDraft.hasSchedule,
      bookingMode: arenaDraft.hasSchedule ? arenaDraft.bookingMode : 'open',
      rules: arenaDraft.rules?.trim() || undefined,
    };
    const result = actions.updateStable({
      id: activeStableId,
      updates: { settings: { arena: payload } },
    });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return false;
    }
    toast.showToast('Ridhusinställningar sparade.', 'success');
    return true;
  }, [actions, activeStableId, arenaDraft, toast]);

  const handleNext = React.useCallback(() => {
    if (handleSave()) {
      router.push('/(onboarding)/horses');
    }
  }, [handleSave, router]);

  return (
    <OnboardingShell
      title="Ridhus"
      subtitle="Har ni ridhus? Vill ni boka det i appen?"
      step={4}
      total={10}
      onBack={() => router.back()}
      onNext={handleNext}
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
        <Text style={styles.sectionTitle}>Har ni ett ridhus?</Text>
        <View style={styles.choiceRow}>
          {[
            { label: 'Ja', value: true },
            { label: 'Nej', value: false },
          ].map((option) => {
            const active = arenaDraft.hasArena === option.value;
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                onPress={() => handleToggleArena(option.value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {arenaDraft.hasArena ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Ridhusschema</Text>
          <Text style={styles.sectionHint}>Vill ni kunna boka ridhuset i appen?</Text>
          <View style={styles.choiceRow}>
            {[
              { label: 'Ja', value: true },
              { label: 'Nej', value: false },
            ].map((option) => {
              const active = arenaDraft.hasSchedule === option.value;
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                  onPress={() => handleToggleSchedule(option.value)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {arenaDraft.hasSchedule ? (
            <View style={styles.subSection}>
              <Text style={styles.formLabel}>Bokningsregler</Text>
              <View style={styles.choiceGrid}>
                {bookingModeOptions.map((option) => {
                  const active = arenaDraft.bookingMode === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.optionCard, active && styles.optionCardActive]}
                      onPress={() => setArenaDraft((prev) => ({ ...prev, bookingMode: option.id }))}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{option.label}</Text>
                      <Text style={styles.optionText}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.subSection}>
            <Text style={styles.formLabel}>Ridhusregler (valfritt)</Text>
            <TextInput
              placeholder="Skriv ner era viktigaste regler..."
              placeholderTextColor={palette.mutedText}
              value={arenaDraft.rules ?? ''}
              onChangeText={(text) => setArenaDraft((prev) => ({ ...prev, rules: text }))}
              style={[styles.input, styles.multilineInput]}
              multiline
            />
          </View>
        </Card>
      ) : (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Inget ridhus</Text>
          <Text style={styles.sectionHint}>Du kan lägga till ridhus och bokning senare.</Text>
        </Card>
      )}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 12, color: palette.secondaryText },
  formLabel: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
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
    minHeight: 92,
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
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  choiceChipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceText: { fontSize: 13, color: palette.primaryText, fontWeight: '600' },
  choiceTextActive: { color: palette.inverseText },
  choiceGrid: { gap: 10 },
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
  subSection: { gap: 10 },
});
