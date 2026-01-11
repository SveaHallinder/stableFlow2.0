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
import { supabase, supabaseConfig } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';

const palette = theme.colors;
const RESET_REDIRECT_URL = 'myapp://reset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const handleSend = React.useCallback(async () => {
    if (submitting) {
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.showToast('Fyll i din e-post.', 'error');
      return;
    }
    if (!supabaseConfig.isConfigured) {
      toast.showToast('Supabase är inte konfigurerad. Starta om Expo och kontrollera .env.', 'error');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: RESET_REDIRECT_URL,
    });
    if (error) {
      toast.showToast(error.message || 'Kunde inte skicka återställningslänken.', 'error');
      setSubmitting(false);
      return;
    }
    toast.showToast('Kolla din mail', 'success');
    setMessage('Kolla din mail.');
    setSubmitting(false);
  }, [email, submitting, toast]);

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
                <Text style={styles.subtitle}>Ange din e-post så skickar vi en återställningslänk.</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>E-post</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="namn@exempel.se"
                  placeholderTextColor={palette.secondaryText}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              {message ? <Text style={styles.successText}>{message}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                onPress={handleSend}
                activeOpacity={0.9}
                disabled={submitting}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Skickar...' : 'Skicka återställningslänk'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.replace('/(auth)')}
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
