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
    if (saving) {
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

    setSaving(true);
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

      const farmId = generateId();
      const farmPayload = {
        id: farmId,
        name,
        location: null,
        has_indoor_arena: false,
        arena_note: null,
        created_by: userId,
      };
      const farmInsert = await supabase.from('farms').insert(farmPayload);
      if (farmInsert.error) {
        toast.showToast(`Kunde inte skapa gård. ${farmInsert.error.message}`, 'error');
        return;
      }

      const farmResult = actions.upsertFarm(
        {
          id: farmId,
          name,
          location: undefined,
          hasIndoorArena: false,
          arenaNote: '',
        },
        { skipPersist: true, skipPermission: true },
      );
      if (!farmResult.success || !farmResult.data) {
        toast.showToast(farmResult.success ? 'Kunde inte skapa gård.' : farmResult.reason, 'error');
        return;
      }

      const createdStableIds: { id: string; adminType: 'self' | 'invite'; adminEmail: string }[] = [];
      for (const item of trimmedStables) {
        const stableId = generateId();
        const stablePayload = {
          id: stableId,
          name: item.name,
          description: null,
          location: null,
          farm_id: farmId,
          created_by: userId,
          ride_types: [],
          settings: null,
        };
        const stableInsert = await supabase.from('stables').insert(stablePayload);
        if (stableInsert.error) {
          toast.showToast(`Kunde inte skapa stall. ${stableInsert.error.message}`, 'error');
          return;
        }

        const memberPayload = {
          stable_id: stableId,
          user_id: userId,
          role: 'admin',
          access: 'owner',
          rider_role: 'owner',
        };
        const memberInsert = await supabase.from('stable_members').insert(memberPayload);
        if (memberInsert.error) {
          toast.showToast(`Kunde inte koppla admin till stallet. ${memberInsert.error.message}`, 'error');
          return;
        }

        const conversationPayload = {
          stable_id: stableId,
          title: item.name,
          is_group: true,
          created_by_user_id: userId,
        };
        const conversationInsert = await supabase.from('conversations').insert(conversationPayload);
        if (conversationInsert.error && conversationInsert.error.code !== '23505') {
          toast.showToast('Kunde inte skapa stallchatten.', 'error');
        }

        const stableResult = actions.upsertStable(
          {
            id: stableId,
            name: item.name,
            farmId,
          },
          { skipPersist: true, skipPermission: true },
        );
        if (!stableResult.success || !stableResult.data) {
          toast.showToast('Kunde inte skapa stall.', 'error');
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
          const inviteResult = actions.addMember({
            name: 'Admin',
            email: item.adminEmail,
            stableId: item.id,
            role: 'admin',
            customRole: 'Stallansvarig',
            access: 'owner',
          });
          if (inviteResult.success && inviteResult.data?.inviteCode) {
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
    } finally {
      setSaving(false);
    }
  }, [actions, farmName, router, returnTo, saving, stablesDraft, state.currentUserId, toast]);

  const handleBack = React.useCallback(() => {
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
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Gårdnamn</Text>
        <TextInput
          placeholder="Namn på gården"
          placeholderTextColor={palette.mutedText}
          value={farmName}
          onChangeText={setFarmName}
          style={styles.input}
        />
      </Card>

      <Card tone="muted" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Stall</Text>
          <TouchableOpacity onPress={handleAddStable} activeOpacity={0.85}>
            <Text style={styles.linkText}>Lägg till stall</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.stack}>
          {stablesDraft.map((item, index) => (
            <View key={item.id} style={styles.stableCard}>
              <View style={styles.stableHeader}>
                <Text style={styles.stableTitle}>Stall {index + 1}</Text>
                {stablesDraft.length > 1 ? (
                  <TouchableOpacity onPress={() => handleRemoveStable(item.id)} activeOpacity={0.85}>
                    <Text style={styles.removeText}>Ta bort</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                placeholder="Stallnamn"
                placeholderTextColor={palette.mutedText}
                value={item.name}
                onChangeText={(text) => handleUpdateStable(item.id, { name: text })}
                style={styles.input}
              />
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  onPress={() => handleUpdateStable(item.id, { adminType: 'self' })}
                  style={[styles.toggleChip, item.adminType === 'self' && styles.toggleChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleText, item.adminType === 'self' && styles.toggleTextActive]}>
                    Jag är admin
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
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
