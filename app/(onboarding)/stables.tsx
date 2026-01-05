import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useOnboarding } from '@/context/OnboardingContext';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

export default function OnboardingStables() {
  const router = useRouter();
  const toast = useToast();
  const { hasFarm } = useOnboarding();
  const { state, actions } = useAppData();
  const { farms, stables, currentStableId } = state;

  const [farmDraft, setFarmDraft] = React.useState({ name: '', location: '' });
  const [stableDraft, setStableDraft] = React.useState({ name: '', location: '', farmId: '' });
  const [delegateDraft, setDelegateDraft] = React.useState({ name: '', email: '', phone: '' });
  const [delegateStableId, setDelegateStableId] = React.useState(currentStableId);

  React.useEffect(() => {
    if (hasFarm === null) {
      router.replace('/(onboarding)');
    }
  }, [hasFarm, router]);

  React.useEffect(() => {
    if (!delegateStableId && stables.length > 0) {
      setDelegateStableId(stables[0].id);
    }
  }, [delegateStableId, stables]);

  const handleCreateFarm = React.useCallback(() => {
    if (!farmDraft.name.trim()) {
      toast.showToast('Gårdsnamn krävs.', 'error');
      return;
    }
    const result = actions.upsertFarm({
      name: farmDraft.name.trim(),
      location: farmDraft.location.trim() || undefined,
      hasIndoorArena: false,
      arenaNote: '',
    });
    if (result.success) {
      toast.showToast('Gård sparad.', 'success');
      setFarmDraft({ name: '', location: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, farmDraft.location, farmDraft.name, toast]);

  const handleCreateStable = React.useCallback(() => {
    if (!stableDraft.name.trim()) {
      toast.showToast('Stallnamn krävs.', 'error');
      return;
    }
    const result = actions.upsertStable({
      name: stableDraft.name.trim(),
      location: stableDraft.location.trim() || undefined,
      farmId: hasFarm ? stableDraft.farmId || undefined : undefined,
    });
    if (result.success) {
      toast.showToast('Stall sparat.', 'success');
      setStableDraft({ name: '', location: '', farmId: stableDraft.farmId });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, hasFarm, stableDraft.farmId, stableDraft.location, stableDraft.name, toast]);

  const handleDelegateAdmin = React.useCallback(() => {
    if (!delegateDraft.name.trim() || !delegateDraft.email.trim()) {
      toast.showToast('Namn och e-post krävs.', 'error');
      return;
    }
    if (!delegateStableId) {
      toast.showToast('Välj vilket stall som ska få en ansvarig.', 'error');
      return;
    }
    const result = actions.addMember({
      name: delegateDraft.name.trim(),
      email: delegateDraft.email.trim(),
      phone: delegateDraft.phone.trim() || undefined,
      stableId: delegateStableId,
      role: 'admin',
      customRole: 'Stallansvarig',
      access: 'owner',
    });
    if (result.success) {
      toast.showToast('Stallansvarig inbjuden.', 'success');
      setDelegateDraft({ name: '', email: '', phone: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, delegateDraft, delegateStableId, toast]);

  const canContinue = stables.length > 0;

  return (
    <OnboardingShell
      title="Stall & ansvariga"
      subtitle="Skapa stallet/stallen och bjud in ansvariga om ni är flera."
      step={2}
      total={10}
      onBack={() => router.back()}
      onNext={() => router.push('/(onboarding)/stable-details')}
      disableNext={!canContinue}
    >
      {hasFarm ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Gård (om flera stall)</Text>
          <TextInput
            placeholder="Gårdsnamn"
            placeholderTextColor={palette.mutedText}
            value={farmDraft.name}
            onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, name: text }))}
            style={styles.input}
          />
          <TextInput
            placeholder="Plats (valfritt)"
            placeholderTextColor={palette.mutedText}
            value={farmDraft.location}
            onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, location: text }))}
            style={styles.input}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateFarm} activeOpacity={0.9}>
            <Text style={styles.primaryLabel}>Spara gård</Text>
          </TouchableOpacity>
        </Card>
      ) : null}

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Nytt stall</Text>
        <TextInput
          placeholder="Stallnamn"
          placeholderTextColor={palette.mutedText}
          value={stableDraft.name}
          onChangeText={(text) => setStableDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <TextInput
          placeholder="Plats (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={stableDraft.location}
          onChangeText={(text) => setStableDraft((prev) => ({ ...prev, location: text }))}
          style={styles.input}
        />
        {hasFarm ? (
          <View style={styles.chipRow}>
            {farms.map((farm) => {
              const active = stableDraft.farmId === farm.id;
              return (
                <TouchableOpacity
                  key={farm.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStableDraft((prev) => ({ ...prev, farmId: farm.id }))}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{farm.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateStable} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Spara stall</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Dina stall</Text>
        <View style={styles.list}>
          {stables.map((stable) => (
            <View key={stable.id} style={styles.listRow}>
              <Text style={styles.listTitle}>{stable.name}</Text>
              <Text style={styles.listMeta}>{stable.location || 'Ingen plats angiven'}</Text>
            </View>
          ))}
          {stables.length === 0 ? <Text style={styles.emptyText}>Inga stall ännu.</Text> : null}
        </View>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Stallansvarig / admin</Text>
        <Text style={styles.sectionHint}>
          Bjud in ansvariga/admin om ni är flera som sköter stallen.
        </Text>
        <View style={styles.chipRow}>
          {stables.map((stable) => {
            const active = delegateStableId === stable.id;
            return (
              <TouchableOpacity
                key={stable.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDelegateStableId(stable.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{stable.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          placeholder="Namn"
          placeholderTextColor={palette.mutedText}
          value={delegateDraft.name}
          onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <TextInput
          placeholder="E-post"
          placeholderTextColor={palette.mutedText}
          value={delegateDraft.email}
          onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, email: text }))}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Telefon (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={delegateDraft.phone}
          onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, phone: text }))}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleDelegateAdmin} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Bjud in ansvarig</Text>
        </TouchableOpacity>
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
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  listTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  listMeta: { fontSize: 12, color: palette.secondaryText, marginTop: 4 },
  emptyText: { fontSize: 12, color: palette.secondaryText },
});
