import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { getOnboardingLayoutRoute } from '@/lib/onboarding-flow';

const palette = theme.colors;

export default function OnboardingLayoutChoice() {
  const router = useRouter();
  const returnTo = '/(onboarding)/setup';
  const { state } = useAppData();
  const { setHasFarm, setMode } = useOnboarding();
  const activeStable = state.stables.find(stable => stable.id === state.currentStableId) ?? state.stables[0];

  const handleFarm = React.useCallback(() => {
    setHasFarm(true);
    setMode('guided');
    router.push({ pathname: activeStable?.farmId ? '/(onboarding)/arena' : getOnboardingLayoutRoute('farm', Boolean(activeStable)), params: { returnTo } });
  }, [activeStable, router, setHasFarm, setMode]);

  const handleSingle = React.useCallback(() => {
    setHasFarm(false);
    setMode('guided');
    router.push({ pathname: getOnboardingLayoutRoute('single', Boolean(activeStable)), params: { returnTo } });
  }, [activeStable, router, setHasFarm, setMode]);

  return (
    <OnboardingShell
      title="Välj upplägg"
      subtitle="Välj om du har en gård med flera stall eller bara ett stall."
      step={1}
      total={4}
      onBack={() => router.replace(returnTo)}
      allowExit={false}
      showProgress
    >
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Hur ser din verksamhet ut?</Text>
        {activeStable ? <Text style={styles.description}>{activeStable.name} finns redan och används i ditt upplägg. Du behöver inte skapa det igen.</Text> : null}
        <View style={styles.stack}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Gård med flera stall" style={styles.primaryButton} onPress={handleFarm} activeOpacity={0.9}>
            <Text style={styles.primaryLabel}>Gård med flera stall</Text>
            <Text style={styles.description}>Samla flera stall under en gemensam gård.</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ett stall" style={styles.secondaryButton} onPress={handleSingle} activeOpacity={0.9}>
            <Text style={styles.secondaryLabel}>Ett stall</Text>
            <Text style={styles.description}>Hästar, medlemmar och schema för ett stall.</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  stack: { gap: 12 },
  description: { fontSize: 14, color: palette.secondaryText, lineHeight: 21 },
  primaryButton: {
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1, borderColor: palette.border, gap: 6, paddingHorizontal: 16, minHeight: 100,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryLabel: { color: palette.primaryText, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: palette.surface,
    borderWidth: 1, borderColor: palette.border, gap: 6, paddingHorizontal: 16, minHeight: 100,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
});
