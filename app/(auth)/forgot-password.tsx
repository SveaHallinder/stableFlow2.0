import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { clearRecoveryCodeSession, getRecoveryCodeState, requestRecoveryCode, supabaseConfig } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';
import { authRedirectUrl } from '@/lib/authRedirect';

const palette = theme.colors;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);
  const aliveRef = React.useRef(true);
  const attemptRef = React.useRef(0);
  const codeVersionRef = React.useRef<number | null>(null);
  const forwardingRef = React.useRef(false);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      attemptRef.current += 1;
      const version = codeVersionRef.current;
      void Promise.resolve().then(() => {
        if (!aliveRef.current && !forwardingRef.current && version !== null) clearRecoveryCodeSession(version);
      });
    };
  }, []);

  const handleBack = React.useCallback(() => {
    if (busyRef.current) return;
    attemptRef.current += 1;
    if (codeVersionRef.current !== null) clearRecoveryCodeSession(codeVersionRef.current);
    router.replace('/(auth)');
  }, [router]);

  const handleSend = React.useCallback(async () => {
    if (!aliveRef.current || busyRef.current || submitting) {
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.showToast('Fyll i din e-post.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.showToast('Ange en giltig e-postadress.', 'error');
      return;
    }
    if (!supabaseConfig.isConfigured) {
      toast.showToast('Återställning är inte tillgänglig just nu. Försök igen senare.', 'error');
      return;
    }
    busyRef.current = true;
    const attempt = ++attemptRef.current;
    const isCurrent = () => aliveRef.current && attemptRef.current === attempt;
    setSubmitting(true);
    setMessage(null);
    setFormError(null);
    try {
      const pending = requestRecoveryCode(trimmedEmail, authRedirectUrl('reset'), isCurrent);
      codeVersionRef.current = getRecoveryCodeState().version;
      await pending;
      if (!isCurrent() || codeVersionRef.current !== getRecoveryCodeState().version) return;
      const confirmation = 'Om adressen har ett konto får du en återställningskod. Kontrollera även skräpposten.';
      toast.showToast(confirmation, 'success');
      setMessage(confirmation);
      forwardingRef.current = true;
      router.replace('/(auth)/reset');
    } catch (error) {
      if (!isCurrent() || codeVersionRef.current !== getRecoveryCodeState().version) return;
      console.warn('[auth forgot-password] Kunde inte skicka återställningskoden', { name: error instanceof Error ? error.name : 'Unknown' });
      const errorMessage = typeof error === 'object' && error !== null && 'status' in error && error.status === 429
        ? 'För många försök. Vänta en stund innan du skickar en ny återställningskod.'
        : 'Kunde inte skicka återställningskoden. Din e-post finns kvar. Försök igen.';
      setFormError(errorMessage);
      toast.showToast(errorMessage, 'error');
    } finally {
      if (isCurrent()) { busyRef.current = false; setSubmitting(false); }
    }
  }, [email, router, submitting, toast]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Card elevated style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>Återställ lösenord</Text>
                <Text style={styles.subtitle}>Ange din e-post så skickar vi en återställningskod.</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>E-post</Text>
                <TextInput
                  value={email}
                  editable={!submitting}
                  accessibilityLabel="E-post för återställning"
                  onChangeText={setEmail}
                  placeholder="namn@exempel.se"
                  placeholderTextColor={palette.secondaryText}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              {formError ? <Text accessibilityRole="alert" style={styles.errorText}>{formError}</Text> : null}
              {message ? <Text style={styles.successText}>{message}</Text> : null}

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Skicka återställningskod"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                onPress={handleSend}
                activeOpacity={0.9}
                disabled={submitting}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Skickar...' : 'Skicka återställningskod'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleBack}
                disabled={submitting}
                accessibilityRole="button"
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Tillbaka till inloggning</Text>
              </TouchableOpacity>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primaryText,
  },
  subtitle: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 20,
    color: palette.primaryText,
  },
  successText: {
    fontSize: 13,
    color: palette.success,
  },
  errorText: {
    fontSize: 13,
    color: palette.error,
  },
  primaryButton: {
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.inverseText,
  },
  secondaryButton: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },
});
