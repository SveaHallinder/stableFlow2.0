import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useOnboarding } from '@/context/OnboardingContext';

const palette = theme.colors;

export default function OnboardingStart() {
  const router = useRouter();
  const { setHasFarm } = useOnboarding();

  const handleSelect = React.useCallback(
    (value: boolean) => {
      setHasFarm(value);
      router.push('/(onboarding)/stables');
    },
    [router, setHasFarm],
  );

  return (
    <OnboardingShell
      title="Har ni en gård?"
      subtitle="Välj gård bara om ni har flera stall på samma gård. Annars hoppar vi gård och går direkt till stallet."
      step={1}
      total={10}
      onNext={undefined}
    >
      <View style={styles.optionGrid}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => handleSelect(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.optionTitle}>Ja, vi har gård</Text>
          <Text style={styles.optionText}>Vi har flera stall på samma gård.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => handleSelect(false)}
          activeOpacity={0.9}
        >
          <Text style={styles.optionTitle}>Nej, bara ett stall</Text>
          <Text style={styles.optionText}>Vi börjar direkt med stallet.</Text>
        </TouchableOpacity>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  optionGrid: {
    gap: 12,
  },
  optionCard: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  optionText: {
    fontSize: 13,
    color: palette.secondaryText,
    marginTop: 6,
  },
});
