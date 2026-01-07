import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  const { hasFarm, mode, setMode, setHasFarm } = useOnboarding();
  const { state, actions } = useAppData();
  const { farms, stables, currentStableId } = state;
  const isQuick = mode === 'quick';
  const activeStable = stables.find((stable) => stable.id === currentStableId);
  const hasFarms = farms.length > 0;

  const [farmDraft, setFarmDraft] = React.useState({ name: '', location: '' });
  const [stableDraft, setStableDraft] = React.useState({ name: '', location: '', farmId: '' });
  const [delegateDraft, setDelegateDraft] = React.useState({ name: '', email: '', phone: '' });
  const [delegateStableId, setDelegateStableId] = React.useState(currentStableId);

  React.useEffect(() => {
    if (hasFarm === null && !isQuick) {
      router.replace('/(onboarding)');
    }
  }, [hasFarm, isQuick, router]);

  React.useEffect(() => {
    if (hasFarm && farms.length === 1 && !stableDraft.farmId) {
      setStableDraft((prev) => ({ ...prev, farmId: farms[0].id }));
    }
  }, [farms, hasFarm, stableDraft.farmId]);

  React.useEffect(() => {
    if (!delegateStableId && stables.length > 0) {
      setDelegateStableId(stables[0].id);
    }
  }, [delegateStableId, stables]);

  React.useEffect(() => {
    if (!currentStableId && stables.length > 0) {
      actions.setCurrentStable(stables[0].id);
    }
  }, [actions, currentStableId, stables]);

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
    if (hasFarm && farms.length === 0) {
      toast.showToast('Skapa en gård först.', 'error');
      return;
    }
    if (hasFarm && !stableDraft.farmId) {
      toast.showToast('Välj vilken gård stallet tillhör.', 'error');
      return;
    }
    const result = actions.upsertStable({
      name: stableDraft.name.trim(),
      location: stableDraft.location.trim() || undefined,
      farmId: hasFarm ? stableDraft.farmId || undefined : undefined,
    });
    if (result.success) {
      toast.showToast('Stall skapat.', 'success');
      setStableDraft({ name: '', location: '', farmId: stableDraft.farmId });
      actions.setCurrentStable(result.data.id);
      if (!delegateStableId) {
        setDelegateStableId(result.data.id);
      }
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [
    actions,
    delegateStableId,
    farms.length,
    hasFarm,
    stableDraft.farmId,
    stableDraft.location,
    stableDraft.name,
    toast,
  ]);

  const handleQuickFinish = React.useCallback(() => {
    if (!stableDraft.name.trim()) {
      toast.showToast('Stallnamn krävs.', 'error');
      return;
    }
    const result = actions.upsertStable({
      name: stableDraft.name.trim(),
      location: stableDraft.location.trim() || undefined,
    });
    if (!result.success || !result.data) {
      toast.showToast(result.success ? 'Kunde inte skapa stall.' : result.reason, 'error');
      return;
    }
    actions.setCurrentStable(result.data.id);
    actions.setOnboardingDismissed(true);
    toast.showToast('Stall skapat. Du kan lägga till mer senare.', 'success');
    router.replace('/(tabs)');
  }, [actions, router, stableDraft.location, stableDraft.name, toast]);

  const handleSwitchToGuided = React.useCallback(() => {
    setMode('guided');
    setHasFarm(null);
    router.replace('/(onboarding)');
  }, [router, setHasFarm, setMode]);

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
  const disableStableCreate = Boolean(
    hasFarm && (farms.length === 0 || !stableDraft.farmId),
  );

  return (
    <OnboardingShell
      title={isQuick ? 'Snabbstart' : 'Stall & ansvariga'}
      subtitle={
        isQuick
          ? 'Skapa ditt första stall. Resten kan du fylla i senare i Admin.'
          : 'Skapa minst ett stall för att gå vidare. Bjud in ansvariga om ni vill.'
      }
      step={isQuick ? 1 : 2}
      total={isQuick ? 1 : 2}
      onBack={() => router.back()}
      onNext={isQuick ? undefined : () => router.push('/(onboarding)/setup')}
      disableNext={isQuick ? false : !canContinue}
      showProgress={!isQuick}
      nextLabel="Fortsätt"
    >
      {isQuick ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Skapa stall</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={handleQuickFinish} activeOpacity={0.9}>
            <Text style={styles.primaryLabel}>Skapa stall & gå till appen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={handleSwitchToGuided} activeOpacity={0.85}>
            <Text style={styles.ghostLabel}>Behöver ni gård eller fler stall? Byt till guidad onboarding</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <>
          <Card tone="muted" style={styles.card}>
            <Text style={styles.sectionTitle}>Det här behöver ni först</Text>
            <View style={styles.checklist}>
              {hasFarm ? (
                <View style={styles.checkItem}>
                  <View style={[styles.checkIcon, hasFarms && styles.checkIconDone]}>
                    <Feather
                      name={hasFarms ? 'check' : 'circle'}
                      size={14}
                      color={hasFarms ? palette.inverseText : palette.primaryText}
                    />
                  </View>
                  <Text style={[styles.checkLabel, hasFarms && styles.checkLabelDone]}>
                    Skapa gård
                  </Text>
                </View>
              ) : null}
              <View style={styles.checkItem}>
                <View style={[styles.checkIcon, stables.length > 0 && styles.checkIconDone]}>
                  <Feather
                    name={stables.length > 0 ? 'check' : 'circle'}
                    size={14}
                    color={stables.length > 0 ? palette.inverseText : palette.primaryText}
                  />
                </View>
                <Text style={[styles.checkLabel, stables.length > 0 && styles.checkLabelDone]}>
                  Skapa minst ett stall
                </Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>Övriga steg kan du hoppa över och göra senare.</Text>
          </Card>

          {hasFarm ? (
            <Card tone="muted" style={styles.card}>
              <Text style={styles.sectionTitle}>Gård (om flera stall)</Text>
              <Text style={styles.sectionHint}>
                Skapa gården först så kan du koppla stallen rätt.
              </Text>
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
            {hasFarm && !hasFarms ? (
              <Text style={styles.sectionHint}>Skapa gård först för att kunna lägga in stall.</Text>
            ) : null}
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
            <TouchableOpacity
              style={[styles.primaryButton, disableStableCreate && styles.primaryButtonDisabled]}
              onPress={handleCreateStable}
              activeOpacity={0.9}
              disabled={disableStableCreate}
            >
              <Text style={styles.primaryLabel}>Skapa stall</Text>
            </TouchableOpacity>
          </Card>

          <Card tone="muted" style={styles.card}>
            <Text style={styles.sectionTitle}>Dina stall</Text>
            {activeStable ? (
              <Text style={styles.sectionHint}>Aktivt stall: {activeStable.name}</Text>
            ) : null}
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
        </>
      )}
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
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
  ghostButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  ghostLabel: {
    fontSize: 12,
    color: palette.secondaryText,
    textAlign: 'center',
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
  checklist: { gap: 10 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  checkIconDone: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkLabel: { fontSize: 13, color: palette.primaryText },
  checkLabelDone: { color: palette.primaryText, fontWeight: '600' },
});
