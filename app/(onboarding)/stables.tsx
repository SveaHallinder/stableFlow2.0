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

export default function OnboardingStables() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo: Href =
    returnToParam && returnToParam.startsWith('/') ? (returnToParam as Href) : '/(onboarding)/setup';
  const { actions, state } = useAppData();

  const [draft, setDraft] = React.useState({ name: '', location: '' });
  const [saving, setSaving] = React.useState(false);

  const handleBack = React.useCallback(() => {
    router.replace(returnTo);
  }, [router, returnTo]);

  const handleCreateStable = React.useCallback(async () => {
    if (saving) {
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Stallnamn krävs.', 'error');
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

      const stableId = generateId();
      const location = draft.location.trim();
      const stablePayload = {
        id: stableId,
        name,
        description: null,
        location: location || null,
        farm_id: null,
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
        title: name,
        is_group: true,
        created_by_user_id: userId,
      };
      const conversationInsert = await supabase.from('conversations').insert(conversationPayload);
      if (conversationInsert.error && conversationInsert.error.code !== '23505') {
        toast.showToast('Kunde inte skapa stallchatten.', 'error');
      }

      const result = actions.upsertStable(
        {
          id: stableId,
          name,
          location: location || undefined,
        },
        { skipPersist: true, skipPermission: true },
      );
      if (!result.success || !result.data) {
        toast.showToast(result.success ? 'Kunde inte skapa stall.' : result.reason, 'error');
        return;
      }
      actions.setCurrentStable(stableId);
      toast.showToast('Stall skapat.', 'success');
      setDraft({ name: '', location: '' });
      router.replace(returnTo);
    } finally {
      setSaving(false);
    }
  }, [actions, draft.location, draft.name, router, saving, state.currentUserId, toast, returnTo]);

  return (
    <OnboardingShell
      title="Skapa stall"
      subtitle="Lägg in ett stall för att gå vidare."
      step={2}
      total={6}
      allowExit={false}
      onBack={handleBack}
      showProgress
    >
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Stall</Text>
        <View style={styles.form}>
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
          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleCreateStable}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Text style={styles.primaryLabel}>{saving ? 'Skapar...' : 'Skapa stall'}</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  form: { gap: 12 },
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
    opacity: 0.6,
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
});
