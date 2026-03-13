import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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

function parseParamsFromUrl(url: string) {
  const params = new URLSearchParams();
  const [base, hash] = url.split('#');
  const queryIndex = base.indexOf('?');
  if (queryIndex >= 0) {
    const query = base.slice(queryIndex + 1);
    const queryParams = new URLSearchParams(query);
    queryParams.forEach((value, key) => params.set(key, value));
  }
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
}

function decodeParam(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();

  const [accessToken, setAccessToken] = React.useState('');
  const [refreshToken, setRefreshToken] = React.useState('');
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [settingSession, setSettingSession] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState(false);

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const applyUrl = React.useCallback((url: string | null) => {
    if (!url) {
      return;
    }
    const params = parseParamsFromUrl(url);
    const error = params.get('error_description') ?? params.get('error');
    if (error) {
      setLinkError(decodeParam(error));
    }
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) {
      setAccessToken(access);
      setRefreshToken(refresh);
      setLinkError(null);
      return;
    }
    if (!access || !refresh) {
      setLinkError('Länken är ogiltig eller har gått ut.');
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    const readInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (active) {
        applyUrl(initialUrl);
      }
    };
    void readInitialUrl();
    const subscription = Linking.addEventListener('url', ({ url }) => applyUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [applyUrl]);

  React.useEffect(() => {
    if (!accessToken || !refreshToken || sessionReady || settingSession) {
      return;
    }
    const setSession = async () => {
      setSettingSession(true);
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setLinkError('Länken är ogiltig eller har gått ut.');
        setSettingSession(false);
        return;
      }
      setSessionReady(true);
      setSettingSession(false);
    };
    void setSession();
  }, [accessToken, refreshToken, sessionReady, settingSession]);

  const handleUpdatePassword = React.useCallback(async () => {
    if (submitting || settingSession) {
      return;
    }
    setFormError(null);
    if (!password || !confirmPassword) {
      setFormError('Fyll i båda lösenorden.');
      return;
    }
    if (password.length < 8) {
      setFormError('Lösenordet måste vara minst 8 tecken.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Lösenorden matchar inte.');
      return;
    }
    if (!sessionReady) {
      setFormError('Länken är ogiltig eller har gått ut.');
      return;
    }
    if (!supabaseConfig.isConfigured) {
      toast.showToast('Supabase är inte konfigurerad. Starta om Expo och kontrollera .env.', 'error');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFormError('Kunde inte uppdatera lösenordet. Försök igen.');
      setSubmitting(false);
      return;
    }
    toast.showToast('Lösenordet är uppdaterat.', 'success');
    setSubmitting(false);
    router.replace('/(tabs)');
  }, [confirmPassword, password, router, sessionReady, settingSession, submitting, toast]);

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
                <Text style={styles.title}>Sätt nytt lösenord</Text>
                <Text style={styles.subtitle}>
                  Välj ett nytt lösenord och bekräfta det för att slutföra återställningen.
                </Text>
              </View>

              {linkError ? <Text style={styles.errorText}>{linkError}</Text> : null}
              {settingSession ? (
                <View style={styles.inlineRow}>
                  <ActivityIndicator color={palette.primary} />
                  <Text style={styles.helperText}>Verifierar länken...</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Nytt lösenord</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minst 8 tecken"
                  placeholderTextColor={palette.secondaryText}
                  style={styles.input}
                  secureTextEntry
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Bekräfta lösenord</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Upprepa lösenord"
                  placeholderTextColor={palette.secondaryText}
                  style={styles.input}
                  secureTextEntry
                />
              </View>

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (submitting || settingSession || !sessionReady) && styles.primaryButtonDisabled,
                ]}
                onPress={handleUpdatePassword}
                activeOpacity={0.9}
                disabled={submitting || settingSession || !sessionReady}
              >
                {submitting ? (
                  <ActivityIndicator color={palette.inverseText} />
                ) : (
                  <Text style={styles.primaryButtonText}>Uppdatera lösenord</Text>
                )}
              </TouchableOpacity>

              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.replace('/(auth)/forgot-password')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Skicka ny länk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.replace('/(auth)')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Till inloggning</Text>
                </TouchableOpacity>
              </View>
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
  errorText: {
    fontSize: 13,
    color: palette.error,
  },
  helperText: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },
});
