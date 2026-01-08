import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData, type UserRole, type StableMembership } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

type RoleOption = {
  id: string;
  label: string;
  description: string;
  role: UserRole;
  customRole?: string;
  access?: StableMembership['access'];
  riderRole?: StableMembership['riderRole'];
};

const roleOptions: RoleOption[] = [
  {
    id: 'owner',
    label: 'Gårdsägare / Stallägare',
    description: 'Fulla rättigheter för ägare.',
    role: 'admin',
    customRole: 'Stallägare',
    access: 'owner',
  },
  {
    id: 'manager',
    label: 'Stallansvarig / Admin',
    description: 'Kan hantera allt i stallet.',
    role: 'admin',
    customRole: 'Stallansvarig',
    access: 'owner',
  },
  {
    id: 'staff',
    label: 'Anställd',
    description: 'Daglig personal med redigeringsrätt.',
    role: 'staff',
    customRole: 'Anställd',
    access: 'edit',
  },
  {
    id: 'horse-owner',
    label: 'Hästägare',
    description: 'Ägare till en eller flera hästar.',
    role: 'rider',
    customRole: 'Hästägare',
    riderRole: 'owner',
    access: 'view',
  },
  {
    id: 'medryttare',
    label: 'Medryttare',
    description: 'Rider/ansvarar för specifika hästar.',
    role: 'rider',
    customRole: 'Medryttare',
    riderRole: 'medryttare',
    access: 'view',
  },
  {
    id: 'trainer',
    label: 'Tränare / Ridlärare',
    description: 'Har insyn i träningar.',
    role: 'trainer',
    customRole: 'Tränare/Ridlärare',
    access: 'view',
  },
  {
    id: 'farrier',
    label: 'Hovslagare',
    description: 'Specialist med läsåtkomst.',
    role: 'farrier',
    customRole: 'Hovslagare',
    access: 'view',
  },
  {
    id: 'vet',
    label: 'Veterinär',
    description: 'Veterinär med läsåtkomst.',
    role: 'vet',
    customRole: 'Veterinär',
    access: 'view',
  },
  {
    id: 'therapist',
    label: 'Massör / Equiterapeut',
    description: 'Terapeut med läsåtkomst.',
    role: 'therapist',
    customRole: 'Massör/Equiterapeut',
    access: 'view',
  },
  {
    id: 'guest',
    label: 'Gäst',
    description: 'Tillfällig gäst med läsåtkomst.',
    role: 'guest',
    customRole: 'Gäst',
    access: 'view',
  },
];

export default function OnboardingMembers() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const returnTo = typeof params.returnTo === 'string' ? (params.returnTo as Href) : undefined;
  const { state, actions } = useAppData();
  const { stables, currentStableId, users } = state;

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [selectedStableIds, setSelectedStableIds] = React.useState<string[]>(
    fallbackStableId ? [fallbackStableId] : [],
  );
  const [roleId, setRoleId] = React.useState(roleOptions[3]?.id ?? roleOptions[0].id);
  const [draft, setDraft] = React.useState({ name: '', email: '', phone: '' });

  React.useEffect(() => {
    if (!stables.length) {
      router.replace('/(onboarding)/stables');
      return;
    }
    if (!selectedStableIds.length && fallbackStableId) {
      setSelectedStableIds([fallbackStableId]);
    }
  }, [fallbackStableId, router, selectedStableIds.length, stables.length]);

  const selectedRole = React.useMemo(
    () => roleOptions.find((option) => option.id === roleId) ?? roleOptions[0],
    [roleId],
  );

  const allSelected = stables.length > 0 && selectedStableIds.length === stables.length;

  const handleToggleStable = React.useCallback(
    (stableId: string) => {
      setSelectedStableIds((prev) => {
        const exists = prev.includes(stableId);
        const next = exists ? prev.filter((id) => id !== stableId) : [...prev, stableId];
        if (!next.length) {
          return prev;
        }
        return next;
      });
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleToggleAll = React.useCallback(() => {
    if (allSelected) {
      setSelectedStableIds(fallbackStableId ? [fallbackStableId] : []);
      if (fallbackStableId) {
        actions.setCurrentStable(fallbackStableId);
      }
      return;
    }
    setSelectedStableIds(stables.map((stable) => stable.id));
  }, [actions, allSelected, fallbackStableId, stables]);

  const memberCount = React.useMemo(() => {
    const stableSet = new Set(selectedStableIds);
    const memberIds = new Set<string>();
    Object.values(users).forEach((user) => {
      if (user.membership.some((entry) => stableSet.has(entry.stableId))) {
        memberIds.add(user.id);
      }
    });
    return memberIds.size;
  }, [selectedStableIds, users]);

  const handleInvite = React.useCallback(() => {
    if (!selectedStableIds.length) {
      toast.showToast('Välj minst ett stall.', 'error');
      return;
    }
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name || !email) {
      toast.showToast('Namn och e-post krävs.', 'error');
      return;
    }
    const result = actions.addMember({
      name,
      email,
      phone: draft.phone.trim() || undefined,
      stableId: selectedStableIds[0],
      stableIds: selectedStableIds,
      role: selectedRole.role,
      customRole: selectedRole.customRole,
      access: selectedRole.access,
      riderRole: selectedRole.riderRole,
    });
    if (result.success) {
      toast.showToast('Inbjudan skickad.', 'success');
      setDraft({ name: '', email: '', phone: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, draft.email, draft.name, draft.phone, selectedRole, selectedStableIds, toast]);

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  return (
    <OnboardingShell
      title="Medlemmar"
      subtitle="Valfritt: Bjud in personer och välj deras roll. Du kan göra det senare."
      step={6}
      total={10}
      onNext={handleBack}
      nextLabel="Klar"
      showProgress={false}
    >
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Välj stall</Text>
        <View style={styles.chipRow}>
          {stables.length > 1 ? (
            <TouchableOpacity
              style={[styles.chip, allSelected && styles.chipActive]}
              onPress={handleToggleAll}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, allSelected && styles.chipTextActive]}>Alla stall</Text>
            </TouchableOpacity>
          ) : null}
          {stables.map((stable) => {
            const active = selectedStableIds.includes(stable.id);
            return (
              <TouchableOpacity
                key={stable.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleToggleStable(stable.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{stable.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.sectionHint}>{memberCount} medlem(ar) kopplade till valda stall.</Text>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Roll</Text>
        <View style={styles.roleList}>
          {roleOptions.map((option) => {
            const active = roleId === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.roleCard, active && styles.roleCardActive]}
                onPress={() => setRoleId(option.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.roleTitle, active && styles.roleTitleActive]}>{option.label}</Text>
                <Text style={styles.roleText}>{option.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Bjud in</Text>
        <TextInput
          placeholder="Namn"
          placeholderTextColor={palette.mutedText}
          value={draft.name}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
          style={styles.input}
        />
        <TextInput
          placeholder="E-post"
          placeholderTextColor={palette.mutedText}
          value={draft.email}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, email: text }))}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Telefon (valfritt)"
          placeholderTextColor={palette.mutedText}
          value={draft.phone}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, phone: text }))}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleInvite} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Skicka inbjudan</Text>
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
  roleList: { gap: 10 },
  roleCard: {
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 6,
  },
  roleCardActive: { borderColor: palette.primary, backgroundColor: palette.surfaceTint },
  roleTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  roleTitleActive: { color: palette.primary },
  roleText: { fontSize: 12, color: palette.secondaryText },
});
