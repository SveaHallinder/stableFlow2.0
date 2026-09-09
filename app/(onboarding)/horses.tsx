import { InviteReceipt } from '@/components/InviteReceipt';
import type { InviteConfirmation } from '@/context/AppDataContext';
import React from 'react';
import { generateId } from '@/lib/ids';
import { confirmAction } from '@/lib/confirm';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData, type Horse } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

const genderOptions: { id: NonNullable<Horse['gender']>; label: string }[] = [
  { id: 'mare', label: 'Sto' },
  { id: 'gelding', label: 'Valack' },
  { id: 'stallion', label: 'Hingst' },
  { id: 'unknown', label: 'Okänt' },
];

export default function OnboardingHorses() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions, hydrating } = useAppData();
  const { stables, currentStableId, horses, currentUserId } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);

  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );

  const [inviteReceipt, setInviteReceipt] = React.useState<InviteConfirmation | null>(null);
  const [savingHorse, setSavingHorse] = React.useState(false);
  const savingHorseRef = React.useRef(false);
  const [deletingHorseId, setDeletingHorseId] = React.useState<string | null>(null);
  const [horseDeleteError, setHorseDeleteError] = React.useState<{ id: string; reason: string } | null>(null);
  const newHorseIdRef = React.useRef<string | null>(null);
  const [horseSaveError, setHorseSaveError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({
    name: '',
    gender: 'unknown' as NonNullable<Horse['gender']>,
    age: '',
    note: '',
  });
  const [ownerMode, setOwnerMode] = React.useState<'self' | 'invite'>('self');
  const [ownerDraft, setOwnerDraft] = React.useState({ name: '', email: '' });

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
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleAddHorse = React.useCallback(async () => {
    if (savingHorseRef.current) return;
    if (!activeStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Hästens namn krävs.', 'error');
      return;
    }
    if (ownerMode === 'invite') {
      const ownerName = ownerDraft.name.trim();
      const ownerEmail = ownerDraft.email.trim();
      if (!ownerName || !ownerEmail) {
        toast.showToast('Namn och epost krävs för ägare.', 'error');
        return;
      }
    }
    const trimmedAge = draft.age.trim();
    const ageValue = trimmedAge ? Number(trimmedAge) : undefined;
    if (trimmedAge && Number.isNaN(ageValue)) {
      toast.showToast('Ålder måste vara en siffra.', 'error');
      return;
    }
    savingHorseRef.current = true;
    setSavingHorse(true);
    setHorseSaveError(null);
    newHorseIdRef.current ??= generateId();
    const result = await actions.upsertHorse({
      id: newHorseIdRef.current,
      name,
      stableId: activeStableId,
      ownerUserId: ownerMode === 'self' ? currentUserId || undefined : undefined,
      gender: draft.gender,
      age: ageValue,
      note: draft.note.trim() || undefined,
    });
    if (result.success) {
      if (ownerMode === 'invite' && result.data?.id) {
        const inviteResult = await actions.addMember({
          name: ownerDraft.name.trim(),
          email: ownerDraft.email.trim(),
          stableId: activeStableId,
          role: 'rider',
          customRole: 'Hästägare',
          riderRole: 'owner',
          access: 'view',
          horseIds: [result.data.id],
        });
        if (!inviteResult.success) {
          setHorseSaveError(`Hästen är sparad. ${inviteResult.reason}`);
          savingHorseRef.current = false;
          setSavingHorse(false);
          return;
        }
        setInviteReceipt(inviteResult.data ?? null);
        if (inviteResult.data?.inviteCode) {
          toast.showToast(`Inbjudningskod ${inviteResult.data.inviteCode}`, 'success');
        }
      }
      newHorseIdRef.current = null;
      toast.showToast('Häst sparad.', 'success');
      setDraft({ name: '', gender: 'unknown', age: '', note: '' });
      setOwnerDraft({ name: '', email: '' });
      setOwnerMode('self');
    } else {
      setHorseSaveError(result.reason);
      toast.showToast(result.reason, 'error');
    }
    savingHorseRef.current = false;
    setSavingHorse(false);
  }, [
    actions,
    activeStableId,
    currentUserId,
    draft.age,
    draft.gender,
    draft.name,
    draft.note,
    ownerDraft.email,
    ownerDraft.name,
    ownerMode,
    toast,
  ]);

  const handleDeleteHorse = React.useCallback(
    async (horseId: string) => {
      if (savingHorseRef.current) return;
      const horse = horses.find((entry) => entry.id === horseId);
      if (!horse) return;
      savingHorseRef.current = true;
      try {
        const confirmed = await confirmAction({
          title: `Ta bort ${horse.name}?`,
          message: 'Hästen och tillhörande historik tas bort permanent. Det går inte att ångra.',
          confirmLabel: 'Ta bort häst',
          destructive: true,
        });
        if (!confirmed) return;
        setSavingHorse(true);
        setDeletingHorseId(horseId);
        setHorseDeleteError(null);
        const result = await actions.deleteHorse(horseId);
        if (result.success) {
          toast.showToast('Häst borttagen.', 'success');
        } else {
          setHorseDeleteError({ id: horseId, reason: result.reason });
        }
      } catch (error) {
        console.warn('[horse delete form] Kunde inte ta bort häst', error);
        setHorseDeleteError({ id: horseId, reason: 'Hästen kunde inte tas bort. Försök igen.' });
      } finally {
        savingHorseRef.current = false;
        setSavingHorse(false);
        setDeletingHorseId(null);
      }
    },
    [actions, horses, toast],
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
      title="Hästar"
      subtitle="Lägg till minst en häst för att gå vidare."
      step={4}
      total={6}
      allowExit={false}
      onNext={handleBack}
      disableNext={savingHorse}
      nextLabel="Tillbaka"
      showProgress
    >
      {stables.length > 1 ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Välj stall</Text>
          <View style={styles.chipRow}>
            {stables.map((stable) => {
              const active = stable.id === activeStableId;
              return (
                <TouchableOpacity disabled={savingHorse}
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
        <Text style={styles.sectionTitle}>Ny häst</Text>
        <TextInput editable={!savingHorse}
          placeholder="Hästens namn"
          placeholderTextColor={palette.mutedText}
          value={draft.name}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {genderOptions.map((option) => {
            const active = draft.gender === option.id;
            return (
              <TouchableOpacity disabled={savingHorse}
                key={option.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, gender: option.id }))}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput editable={!savingHorse}
          placeholder="Ålder (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.age}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, age: text }))}
          style={styles.input}
          keyboardType="number-pad"
        />
        <TextInput editable={!savingHorse}
          placeholder="Anteckning (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.note}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, note: text }))}
          style={[styles.input, styles.multilineInput]}
          multiline
        />
        <View style={styles.ownerSection}>
          <Text style={styles.sectionLabel}>Ägare</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity disabled={savingHorse}
              style={[styles.toggleChip, ownerMode === 'self' && styles.toggleChipActive]}
              onPress={() => setOwnerMode('self')}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, ownerMode === 'self' && styles.toggleTextActive]}>
                Jag är ägare
              </Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={savingHorse}
              style={[styles.toggleChip, ownerMode === 'invite' && styles.toggleChipActive]}
              onPress={() => setOwnerMode('invite')}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, ownerMode === 'invite' && styles.toggleTextActive]}>
                Bjud in ägare
              </Text>
            </TouchableOpacity>
          </View>
          {ownerMode === 'invite' ? (
            <>
              <TextInput editable={!savingHorse}
                placeholder="Namn på ägare"
                placeholderTextColor={palette.mutedText}
                value={ownerDraft.name}
                onChangeText={(text) => setOwnerDraft((prev) => ({ ...prev, name: text }))}
                style={styles.input}
              />
              <TextInput editable={!savingHorse}
                placeholder="Epost till ägare"
                placeholderTextColor={palette.mutedText}
                value={ownerDraft.email}
                onChangeText={(text) => setOwnerDraft((prev) => ({ ...prev, email: text }))}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </>
          ) : null}
        </View>
        <InviteReceipt confirmation={inviteReceipt} />
        {inviteReceipt && <Text style={{ color: palette.secondaryText }}>När personen gått med kan du välja medlemmen som ägare under Hantera hästar.</Text>}
        {horseSaveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{horseSaveError}</Text>}
        <TouchableOpacity disabled={savingHorse} style={styles.primaryButton} onPress={handleAddHorse} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>{savingHorse ? 'Sparar…' : 'Lägg till häst'}</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Dina hästar</Text>
        <View style={styles.list}>
          {stableHorses.map((horse) => (
            <View key={horse.id} style={styles.listRow}>
              <View>
                <Text style={styles.listTitle}>{horse.name}</Text>
                <Text style={styles.listMeta}>
                  {horse.gender && horse.gender !== 'unknown'
                    ? genderOptions.find((option) => option.id === horse.gender)?.label
                    : 'Ingen kön angiven'}
                </Text>
                {deletingHorseId === horse.id ? <Text>Tar bort hästen…</Text> : null}
                {horseDeleteError?.id === horse.id ? (
                  <Text accessibilityRole="alert" style={{ color: palette.error }}>{horseDeleteError.reason}</Text>
                ) : null}
              </View>
              <TouchableOpacity disabled={savingHorse}
                style={[styles.iconButton, { minWidth: 44, minHeight: 44 }]}
                accessibilityRole="button" accessibilityLabel={`Ta bort ${horse.name}`}
                onPress={() => handleDeleteHorse(horse.id)}
                activeOpacity={0.85}
              >
                <Feather name="x" size={14} color={palette.secondaryText} />
              </TouchableOpacity>
            </View>
          ))}
          {stableHorses.length === 0 ? (
            <Text style={styles.emptyText}>Inga hästar inlagda ännu.</Text>
          ) : null}
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  ownerSection: { gap: 10 },
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
    justifyContent: 'space-between',
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
