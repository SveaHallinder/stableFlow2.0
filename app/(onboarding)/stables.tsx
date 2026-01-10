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

export default function OnboardingStables() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo: Href =
    returnToParam && returnToParam.startsWith('/') ? (returnToParam as Href) : '/(onboarding)/setup';
  const { actions } = useAppData();

  const [draft, setDraft] = React.useState({ name: '', location: '' });

  const handleBack = React.useCallback(() => {
    router.replace(returnTo);
  }, [router, returnTo]);

  const handleCreateStable = React.useCallback(() => {
    const name = draft.name.trim();
    if (!name) {
      toast.showToast('Stallnamn krävs.', 'error');
      return;
    }
    const result = actions.upsertStable({
      name,
      location: draft.location.trim() || undefined,
    });
    if (!result.success || !result.data) {
      toast.showToast(result.success ? 'Kunde inte skapa stall.' : result.reason, 'error');
      return;
    }
    actions.setCurrentStable(result.data.id);
    toast.showToast('Stall skapat.', 'success');
    setDraft({ name: '', location: '' });
    router.replace(returnTo);
  }, [actions, draft.location, draft.name, router, toast, returnTo]);

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
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateStable} activeOpacity={0.9}>
            <Text style={styles.primaryLabel}>Skapa stall</Text>
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
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
});
