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
  const { setHasFarm, setMode } = useOnboarding();

  const handleQuickStart = React.useCallback(() => {
    setMode('quick');
    setHasFarm(false);
    router.push('/(onboarding)/stables');
  }, [router, setHasFarm, setMode]);

  const handleSelect = React.useCallback(
    (value: boolean) => {
      setMode('guided');
      setHasFarm(value);
      router.push('/(onboarding)/stables');
    },
    [router, setHasFarm, setMode],
  );

  return (
    <OnboardingShell
      title="Sätt upp stallet"
      subtitle="Välj snabbstart för att skapa stallet och komma igång direkt. Guiden hjälper dig lägga in hästar, medlemmar och schema."
      step={1}
      total={2}
      onNext={undefined}
    >
      <View style={styles.optionGrid}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Snabbstart</Text>
          <TouchableOpacity
            style={[styles.optionCard, styles.optionCardPrimary]}
            onPress={handleQuickStart}
            activeOpacity={0.9}
          >
            <Text style={styles.optionTitlePrimary}>Skapa stall snabbt</Text>
            <Text style={styles.optionTextPrimary}>Skapa ett stall och gå vidare direkt.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guidad onboarding</Text>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => handleSelect(true)}
            activeOpacity={0.9}
          >
            <Text style={styles.optionTitle}>Flera stall på samma gård</Text>
            <Text style={styles.optionText}>Vi behöver skapa gård och flera stall.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => handleSelect(false)}
            activeOpacity={0.9}
          >
            <Text style={styles.optionTitle}>Bara ett stall</Text>
            <Text style={styles.optionText}>Vi börjar direkt med stallet.</Text>
          </TouchableOpacity>
        </View>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  optionGrid: {
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: palette.secondaryText,
  },
  optionCard: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  optionCardPrimary: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
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
  optionTitlePrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.inverseText,
  },
  optionTextPrimary: {
    fontSize: 13,
    color: palette.inverseText,
    opacity: 0.9,
    marginTop: 6,
  },
});
