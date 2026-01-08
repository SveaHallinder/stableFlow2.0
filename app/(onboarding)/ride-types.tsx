import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData, type RideType } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { generateId } from '@/lib/ids';

const palette = theme.colors;

export default function OnboardingRideTypes() {
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
  const rideTypes = React.useMemo(() => activeStable?.rideTypes ?? [], [activeStable]);

  const [draft, setDraft] = React.useState({ code: '', label: '', description: '' });

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

  const handleAddRideType = React.useCallback(() => {
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const code = draft.code.trim();
    const label = draft.label.trim();
    if (!code || !label) {
      toast.showToast('Kod och namn krävs.', 'error');
      return;
    }
    const newType: RideType = {
      id: generateId(),
      code,
      label,
      description: draft.description.trim() || undefined,
    };
    const result = actions.updateStable({
      id: activeStableId,
      updates: { rideTypes: [...rideTypes, newType] },
    });
    if (result.success) {
      toast.showToast('Ridpass-typ sparad.', 'success');
      setDraft({ code: '', label: '', description: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, activeStableId, draft.code, draft.description, draft.label, rideTypes, toast]);

  const handleDeleteRideType = React.useCallback(
    (typeId: string) => {
      if (!activeStableId) {
        return;
      }
      const nextTypes = rideTypes.filter((type) => type.id !== typeId);
      const result = actions.updateStable({
        id: activeStableId,
        updates: { rideTypes: nextTypes },
      });
      if (result.success) {
        toast.showToast('Ridpass-typ borttagen.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, activeStableId, rideTypes, toast],
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
      title="Ridpass-typer"
      subtitle="Valfritt: Skapa ridpass-typer för schemat."
      step={9}
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
        <Text style={styles.sectionTitle}>Ny ridpass-typ</Text>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Kod (K, M...)"
            placeholderTextColor={palette.mutedText}
            value={draft.code}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, code: text }))}
            style={[styles.input, styles.inputShort]}
          />
          <TextInput
            placeholder="Namn"
            placeholderTextColor={palette.mutedText}
            value={draft.label}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, label: text }))}
            style={[styles.input, styles.inputLong]}
          />
        </View>
        <TextInput
          placeholder="Beskrivning (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.description}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, description: text }))}
          style={styles.input}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleAddRideType} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Lägg till</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Befintliga typer</Text>
        <View style={styles.list}>
          {rideTypes.map((type) => (
            <View key={type.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>
                  {type.code} · {type.label}
                </Text>
                {type.description ? (
                  <Text style={styles.listMeta}>{type.description}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => handleDeleteRideType(type.id)}
                activeOpacity={0.85}
              >
                <Feather name="x" size={14} color={palette.secondaryText} />
              </TouchableOpacity>
            </View>
          ))}
          {rideTypes.length === 0 ? (
            <Text style={styles.emptyText}>Inga typer inlagda ännu.</Text>
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
  inputRow: { flexDirection: 'row', gap: 10 },
  inputShort: { flex: 0.5 },
  inputLong: { flex: 1 },
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
