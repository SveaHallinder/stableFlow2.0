import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { generateId } from '@/lib/ids';
import { isQaDemoMode } from '@/lib/qaDemo';
import { supabase } from '@/lib/supabase';

const palette = theme.colors;

type StableDraft = {
  id: string;
  name: string;
  adminType: 'self' | 'invite';
  adminEmail: string;
};

export default function OnboardingFarm() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : '/(onboarding)/setup';
  const { actions, state } = useAppData();

  const [farmName, setFarmName] = React.useState('');
  const [stablesDraft, setStablesDraft] = React.useState<StableDraft[]>([
    { id: generateId(), name: '', adminType: 'self', adminEmail: '' },
  ]);
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const farmIdRef = React.useRef<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleAddStable = React.useCallback(() => {
    setStablesDraft((prev) => [
      ...prev,
      { id: generateId(), name: '', adminType: 'self', adminEmail: '' },
    ]);
  }, []);

  const handleRemoveStable = React.useCallback((id: string) => {
    setStablesDraft((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  const handleUpdateStable = React.useCallback((id: string, updates: Partial<StableDraft>) => {
    setStablesDraft((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const handleSave = React.useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    const name = farmName.trim();
    if (!name) {
      toast.showToast('Gårdnamn krävs.', 'error');
      return;
    }
    const trimmedStables = stablesDraft.map((item) => ({
      ...item,
      name: item.name.trim(),
      adminEmail: item.adminEmail.trim(),
    }));
    if (trimmedStables.some((item) => !item.name)) {
      toast.showToast('Alla stall behöver namn.', 'error');
      return;
    }
    if (trimmedStables.some((item) => item.adminType === 'invite' && !item.adminEmail)) {
      toast.showToast('Fyll i epost för ansvarig admin.', 'error');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      let userId = state.currentUserId;
      if (!userId) {
        const userResult = await supabase.auth.getUser();
        userId = userResult.data.user?.id ?? '';
      }
      if (!userId) {
        toast.showToast('Du måste logga in igen.', 'error');
        return;
      }

      farmIdRef.current ??= generateId();
      const farmId = farmIdRef.current;
      const farmPayload = {
        id: farmId,
        name,
        location: null,
        has_indoor_arena: false,
        arena_note: null,
        created_by: userId,
      };
      let farmInsert = isQaDemoMode
        ? { error: null, data: farmPayload }
        : await supabase.from('farms').insert(farmPayload).select('*').single();
      const recoveringFarm = farmInsert.error?.code === '23505';
      if (recoveringFarm) {
        farmInsert = await supabase.from('farms').select('*').eq('id', farmId).single();
        if (!farmInsert.error && farmInsert.data?.id === farmId && farmInsert.data.created_by === userId
          && farmInsert.data.name !== name) {
          farmInsert = await supabase.from('farms').update({ name }).eq('id', farmId).eq('created_by', userId)
            .select('*').single();
        }
      }
      const expectedFarm = recoveringFarm ? { id: farmId, name, created_by: userId } : farmPayload;
      if (farmInsert.error || !farmInsert.data
        || Object.entries(expectedFarm).some(([key, value]) => farmInsert.data[key] !== value)) {
        console.warn('[farm create] Gården kunde inte bekräftas', farmInsert.error);
        setSaveError('Gården kunde inte sparas. Dina uppgifter finns kvar. Försök igen.');
        return;
      }

      const farmResult = await actions.upsertFarm(
        {
          id: farmId,
          name: farmInsert.data.name,
          location: farmInsert.data.location ?? undefined,
          hasIndoorArena: farmInsert.data.has_indoor_arena ?? false,
          arenaNote: farmInsert.data.arena_note ?? '',
        },
        { skipPersist: true, skipPermission: true },
      );
      if (!farmResult.success || !farmResult.data) {
        toast.showToast(farmResult.success ? 'Kunde inte skapa gård.' : farmResult.reason, 'error');
        return;
      }

      const createdStableIds: { id: string; adminType: 'self' | 'invite'; adminEmail: string }[] = [];
      for (const item of trimmedStables) {
        const stableId = item.id;
        const stableResult = await actions.upsertStable(
          { requestId: stableId, name: item.name, farmId },
          { skipPermission: true },
        );
        if (!stableResult.success || !stableResult.data) {
          setSaveError(stableResult.success ? 'Servern bekräftade inte stallet. Försök igen.' : stableResult.reason);
          return;
        }
        createdStableIds.push({
          id: stableId,
          adminType: item.adminType,
          adminEmail: item.adminEmail,
        });
      }

      for (const item of createdStableIds) {
        if (item.adminType === 'invite' && item.adminEmail) {
          const inviteResult = await actions.addMember({
            name: 'Admin',
            email: item.adminEmail,
            stableId: item.id,
            role: 'admin',
            customRole: 'Stallansvarig',
            access: 'owner',
          });
          if (!inviteResult.success) {
            toast.showToast(`Stallet är skapat. ${inviteResult.reason} Du kan bjuda in ansvarig från Stall.`, 'error');
          } else if (inviteResult.data?.inviteCode) {
            toast.showToast(`Inbjudningskod ${inviteResult.data.inviteCode}`, 'success');
          }
        }
      }

      const selfStable = createdStableIds.find((item) => item.adminType === 'self');
      if (selfStable) {
        actions.setCurrentStable(selfStable.id);
      } else if (createdStableIds[0]) {
        actions.setCurrentStable(createdStableIds[0].id);
      }

      toast.showToast('Gård och stall sparade.', 'success');
      router.replace(returnTo);
    } catch (error) {
      console.warn('[farm create] Kunde inte slutföra gård och stall', error);
      setSaveError('Gård och stall kunde inte färdigställas. Försök igen med samma uppgifter.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [actions, farmName, router, returnTo, stablesDraft, state.currentUserId, toast]);

  const handleBack = React.useCallback(() => {
    if (savingRef.current) return;
    router.replace(returnTo);
  }, [router, returnTo]);

  return (
    <OnboardingShell
      title="Gård"
      subtitle="Skapa gård och lägg till stall."
      step={2}
      total={6}
      allowExit={false}
      onBack={handleBack}
      onNext={handleSave}
      nextLabel={saving ? 'Sparar...' : 'Spara och fortsätt'}
      disableNext={saving}
      showProgress
    >
      {saveError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{saveError}</Text> : null}
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Gårdnamn</Text>
        <TextInput
          placeholder="Namn på gården"
          placeholderTextColor={palette.mutedText}
          editable={!saving}
          value={farmName}
          onChangeText={setFarmName}
          style={styles.input}
        />
      </Card>

      <Card tone="muted" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Stall</Text>
          <TouchableOpacity disabled={saving} onPress={handleAddStable} activeOpacity={0.85}>
            <Text style={styles.linkText}>Lägg till stall</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.stack}>
          {stablesDraft.map((item, index) => (
            <View key={item.id} style={styles.stableCard}>
              <View style={styles.stableHeader}>
                <Text style={styles.stableTitle}>Stall {index + 1}</Text>
                {stablesDraft.length > 1 ? (
                  <TouchableOpacity disabled={saving} onPress={() => handleRemoveStable(item.id)} activeOpacity={0.85}>
                    <Text style={styles.removeText}>Ta bort</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                placeholder="Stallnamn"
                placeholderTextColor={palette.mutedText}
                editable={!saving}
                value={item.name}
                onChangeText={(text) => handleUpdateStable(item.id, { name: text })}
                style={styles.input}
              />
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  disabled={saving}
                  onPress={() => handleUpdateStable(item.id, { adminType: 'self' })}
                  style={[styles.toggleChip, item.adminType === 'self' && styles.toggleChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleText, item.adminType === 'self' && styles.toggleTextActive]}>
                    Jag är admin
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={saving}
                  onPress={() => handleUpdateStable(item.id, { adminType: 'invite' })}
                  style={[styles.toggleChip, item.adminType === 'invite' && styles.toggleChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleText, item.adminType === 'invite' && styles.toggleTextActive]}>
                    Bjud in admin
                  </Text>
                </TouchableOpacity>
              </View>
              {item.adminType === 'invite' ? (
                <TextInput
                  placeholder="Epost till admin"
                  placeholderTextColor={palette.mutedText}
                  editable={!saving}
                  value={item.adminEmail}
                  onChangeText={(text) => handleUpdateStable(item.id, { adminEmail: text })}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  linkText: { fontSize: 12, fontWeight: '600', color: palette.primary },
  stack: { gap: 12 },
  stableCard: {
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  stableHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stableTitle: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  removeText: { fontSize: 12, fontWeight: '600', color: palette.primary },
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
});
