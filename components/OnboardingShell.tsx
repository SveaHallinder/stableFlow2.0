import React from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { HeaderIconButton } from '@/components/Primitives';
import { ONBOARDING_FINISH_ROUTE, OWNER_ONBOARDING_STEPS } from '@/lib/onboarding-flow';

type OnboardingShellProps = {
  title: string;
  subtitle?: string;
  step: number;
  total: number;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  disableNext?: boolean;
  onExit?: () => void;
  exitLabel?: string;
  allowExit?: boolean;
  showProgress?: boolean;
};

const palette = theme.colors;

export function OnboardingShell({
  title,
  subtitle,
  step,
  total,
  children,
  onBack,
  onNext,
  onSkip,
  nextLabel = 'Nästa',
  disableNext,
  onExit,
  exitLabel = 'Gör senare',
  allowExit = true,
  showProgress = true,
}: OnboardingShellProps) {
  const router = useRouter();
  const { actions } = useAppData();
  const progress = total > 0 ? (step / total) * 100 : 0;
  const showExit = Boolean(onExit || allowExit);
  const showFooter = Boolean(onNext || onBack || onSkip);
  const exitAriaLabel = exitLabel === 'Gör senare' ? 'Stäng onboarding' : exitLabel;
  const exitRoute = ONBOARDING_FINISH_ROUTE;

  const handleExit = React.useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    if (!allowExit) {
      return;
    }
    const result = actions.setOnboardingDismissed(true);
    if (!result.success) {
      return;
    }
    router.replace(exitRoute);
  }, [actions, allowExit, exitRoute, onExit, router]);

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Onboarding"
          showLogo={false}
          showSearch={false}
          right={
            showExit ? (
              <HeaderIconButton
                accessibilityRole="button"
                accessibilityLabel={exitAriaLabel}
                onPress={handleExit}
                style={styles.exitIconButton}
              >
                <Feather name="x" size={18} color={palette.secondaryText} />
              </HeaderIconButton>
            ) : null
          }
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.stack}>
            <View style={styles.main}>
              <View style={styles.header}>
                {showProgress ? (
                  <Text style={styles.stepLabel}>Steg {step} av {total}{total === 4 ? ` · ${OWNER_ONBOARDING_STEPS[step - 1]}` : ''}</Text>
                ) : null}
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                {showProgress ? (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                ) : null}
              </View>

              <View style={styles.body}>{children}</View>

              {showFooter ? (
                <View style={styles.footer}>
                  <View style={styles.footerRow}>
                    {onBack ? (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tillbaka" style={styles.secondaryButton} onPress={onBack} activeOpacity={0.85}>
                        <Text style={styles.secondaryLabel}>Tillbaka</Text>
                      </TouchableOpacity>
                    ) : null}
                    {onSkip ? (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hoppa över" style={styles.ghostButton} onPress={onSkip} activeOpacity={0.85}>
                        <Text style={styles.ghostLabel}>Hoppa över</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {onNext ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={nextLabel}
                      accessibilityState={{ disabled: Boolean(disableNext) }}
                      style={[styles.primaryButton, disableNext && styles.primaryButtonDisabled]}
                      onPress={onNext}
                      activeOpacity={0.9}
                      disabled={disableNext}
                    >
                      <Text style={styles.primaryLabel}>{nextLabel}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
            {showExit ? (
              <View style={styles.exitFooter}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={exitLabel}
                  style={styles.exitButton}
                  onPress={handleExit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.exitButtonLabel}>{exitLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, flexGrow: 1, width: '100%', maxWidth: 680, alignSelf: 'center' },
  stack: { flexGrow: 1, justifyContent: 'space-between', gap: 20 },
  main: { gap: 20 },
  header: { gap: 8 },
  stepLabel: { fontSize: 12, color: palette.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 30, fontFamily: 'Inter-SemiBold', color: palette.primaryText, letterSpacing: -0.8, lineHeight: 36 },
  subtitle: { fontSize: 15, color: palette.secondaryText, lineHeight: 20 },
  progressTrack: {
    height: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primaryText,
    borderRadius: radius.full,
  },
  body: { gap: 16 },
  footer: { gap: 12, marginTop: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exitIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  exitFooter: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  exitButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  exitButtonLabel: {
    color: palette.primaryText,
    fontWeight: '600',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    minHeight: 50,
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryLabel: { color: palette.primaryText, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    minHeight: 44, justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
  ghostButton: {
    minHeight: 44, justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.full,
  },
  ghostLabel: { color: palette.secondaryText, fontWeight: '600' },
});
