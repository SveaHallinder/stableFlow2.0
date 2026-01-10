import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';

const palette = theme.colors;

export default function OnboardingLayoutChoice() {
  const router = useRouter();
  const returnTo = '/(onboarding)/setup';

  const handleFarm = React.useCallback(() => {
    router.push({ pathname: '/(onboarding)/farm', params: { returnTo } });
  }, [router]);

  const handleSingle = React.useCallback(() => {
    router.push({ pathname: '/(onboarding)/stables', params: { returnTo } });
  }, [router]);

  return (
    <OnboardingShell
      title="Välj upplägg"
      subtitle="Välj om du har en gård med flera stall eller bara ett stall."
      step={1}
      total={6}
      allowExit={false}
      showProgress
    >
      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Upplägg</Text>
        <View style={styles.stack}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleFarm} activeOpacity={0.9}>
            <Text style={styles.primaryLabel}>Gård med flera stall</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSingle} activeOpacity={0.9}>
            <Text style={styles.secondaryLabel}>Bara ett stall</Text>
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
  primaryButton: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: palette.surfaceTint,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
});
