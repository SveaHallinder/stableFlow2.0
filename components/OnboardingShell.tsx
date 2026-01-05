import React from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { HeaderIconButton } from '@/components/Primitives';

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
}: OnboardingShellProps) {
  const router = useRouter();
  const { actions, derived } = useAppData();
  const progress = total > 0 ? (step / total) * 100 : 0;
  const showExit = Boolean(onExit || allowExit);
  const exitAriaLabel = exitLabel === 'Gör senare' ? 'Stäng onboarding' : exitLabel;
  const canManageOnboarding = derived.canManageOnboardingAny;
  const exitRoute = canManageOnboarding && Platform.OS === 'web' ? '/admin' : '/(tabs)';

  const handleExit = React.useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    if (!allowExit) {
      return;
    }
    actions.setOnboardingDismissed(true);
    router.replace(exitRoute);
  }, [actions, allowExit, exitRoute, onExit, router]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.stack}>
            <View style={styles.main}>
              <View style={styles.header}>
                <Text style={styles.stepLabel}>Steg {step} av {total}</Text>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>

              <View style={styles.body}>{children}</View>

              {onNext ? (
                <View style={styles.footer}>
                  <View style={styles.footerRow}>
                    {onBack ? (
                      <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.85}>
                        <Text style={styles.secondaryLabel}>Tillbaka</Text>
                      </TouchableOpacity>
                    ) : null}
                    {onSkip ? (
                      <TouchableOpacity style={styles.ghostButton} onPress={onSkip} activeOpacity={0.85}>
                        <Text style={styles.ghostLabel}>Hoppa över</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.primaryButton, disableNext && styles.primaryButtonDisabled]}
                    onPress={onNext}
                    activeOpacity={0.9}
                    disabled={disableNext}
                  >
                    <Text style={styles.primaryLabel}>{nextLabel}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {showExit ? (
              <View style={styles.exitFooter}>
                <TouchableOpacity
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 },
  stack: { flexGrow: 1, justifyContent: 'space-between', gap: 20 },
  main: { gap: 20 },
  header: { gap: 8 },
  stepLabel: { fontSize: 12, color: palette.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 22, fontWeight: '700', color: palette.primaryText },
  subtitle: { fontSize: 14, color: palette.secondaryText, lineHeight: 20 },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
  },
  body: { gap: 16 },
  footer: { gap: 12, marginTop: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exitIconButton: {
    width: 36,
    height: 36,
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
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  exitButtonLabel: {
    color: palette.inverseText,
    fontWeight: '600',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
  ghostButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.full,
  },
  ghostLabel: { color: palette.secondaryText, fontWeight: '600' },
});
