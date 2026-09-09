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
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const stableIdRef = React.useRef<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleBack = React.useCallback(() => {
    if (savingRef.current) return;
    router.replace(returnTo);
  }, [router, returnTo]);

  const handleCreateStable = React.useCallback(async () => {
    if (savingRef.current) return;
    const name = draft.name.trim();
    if (!name) { setSaveError('Stallnamn krävs.'); return; }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    stableIdRef.current ??= generateId();
    try {
      const result = await actions.upsertStable({
        requestId: stableIdRef.current, name, location: draft.location.trim() || undefined,
      }, { skipPermission: true });
      if (!result.success || !result.data) {
        setSaveError(result.success ? 'Servern bekräftade inte stallet. Försök igen.' : result.reason);
        return;
      }
      actions.setCurrentStable(result.data.id);
      toast.showToast('Stall skapat.', 'success');
      setDraft({ name: '', location: '' });
      stableIdRef.current = null;
      router.replace(returnTo);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
        {saveError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{saveError}</Text> : null}
        <View style={styles.form}>
          <TextInput
            placeholder="Stallnamn"
            placeholderTextColor={palette.mutedText}
            editable={!saving}
            value={draft.name}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
            style={styles.input}
          />
          <TextInput
            placeholder="Plats (valfritt)"
            placeholderTextColor={palette.mutedText}
            editable={!saving}
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
