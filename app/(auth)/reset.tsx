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
import { hasPasswordRecoverySession, subscribePasswordRecovery, supabase, supabaseConfig, updateRecoveryPassword, verifyRecoverySession } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const activeSessionRef = React.useRef(session);
  activeSessionRef.current = session;
  const verifiedSessionRef = React.useRef<typeof session>(null);
  const verifiedOriginRef = React.useRef<'web' | 'link' | null>(null);
  const linkVersionRef = React.useRef(0);
  const [recoveryVersion, setRecoveryVersion] = React.useState(0);

  const [accessToken, setAccessToken] = React.useState('');
  const [refreshToken, setRefreshToken] = React.useState('');
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [settingSession, setSettingSession] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState(false);

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => subscribePasswordRecovery(() => setRecoveryVersion(value => value + 1)), []);
  React.useEffect(() => {
    if (Platform.OS === 'web' && !accessToken && !refreshToken && hasPasswordRecoverySession(session)) {
      verifiedSessionRef.current = session;
      verifiedOriginRef.current = 'web';
      setSessionReady(true);
      setLinkError(null);
    } else if (verifiedOriginRef.current === 'web' && verifiedSessionRef.current && !hasPasswordRecoverySession(session)) {
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setAccessToken('');
      setRefreshToken('');
      setLinkError('Länken är ogiltig eller har gått ut.');
    }
  }, [session, recoveryVersion, accessToken, refreshToken]);

  const applyUrl = React.useCallback((url: string | null) => {
    linkVersionRef.current += 1;
    if (!url) {
      setLinkError('Öppna återställningslänken i mejlet eller välj Skicka ny länk.');
      return;
    }
    const params = parseParamsFromUrl(url);
    const error = params.get('error_description') ?? params.get('error');
    if (error) {
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setAccessToken('');
      setRefreshToken('');
      setLinkError('Länken är ogiltig eller har gått ut.');
      return;
    }
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) {
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setAccessToken(access);
      setRefreshToken(refresh);
      setLinkError(null);
      return;
    }
    if (Platform.OS === 'web' && hasPasswordRecoverySession(activeSessionRef.current)) {
      verifiedSessionRef.current = activeSessionRef.current;
      verifiedOriginRef.current = 'web';
      setSessionReady(true);
      setLinkError(null);
      return;
    }
    verifiedSessionRef.current = null;
    verifiedOriginRef.current = null;
    setSessionReady(false);
    setAccessToken('');
    setRefreshToken('');
    setLinkError('Länken är ogiltig eller har gått ut.');
  }, []);

  React.useEffect(() => {
    let active = true;
    const readInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (active) applyUrl(initialUrl);
      } catch (error) {
        console.warn('[auth reset] Kunde inte läsa återställningslänken', { name: error instanceof Error ? error.name : 'Unknown' });
        if (active) setLinkError('Kunde inte läsa återställningslänken. Öppna länken igen eller välj Skicka ny länk.');
      }
    };
    void readInitialUrl();
    const subscription = Linking.addEventListener('url', ({ url }) => applyUrl(url));
    return () => {
      active = false;
      linkVersionRef.current += 1;
      subscription.remove();
    };
  }, [applyUrl]);

  React.useEffect(() => {
    if (!accessToken || !refreshToken || sessionReady || settingSession || linkError) {
      return;
    }
    const setSession = async () => {
      const linkVersion = linkVersionRef.current;
      setSettingSession(true);
      try {
        const verifiedSession = await verifyRecoverySession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (linkVersionRef.current !== linkVersion) return;
        verifiedSessionRef.current = verifiedSession;
        verifiedOriginRef.current = 'link';
        setSessionReady(true);
      } catch (error) {
        console.warn('[auth reset] Kunde inte verifiera återställningslänken', { name: error instanceof Error ? error.name : 'Unknown' });
        if (linkVersionRef.current === linkVersion) setLinkError('Kunde inte verifiera länken. Öppna återställningslänken igen eller välj Skicka ny länk.');
      } finally {
        setSettingSession(false);
      }
    };
    void setSession();
  }, [accessToken, refreshToken, sessionReady, settingSession, linkError]);

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
    try {
      const verifiedSession = verifiedSessionRef.current;
      const verifiedOrigin = verifiedOriginRef.current;
      if (!verifiedSession) {
        setSessionReady(false);
        setLinkError('Länken är ogiltig eller har gått ut.');
        return;
      }
      if (verifiedOrigin === 'web') {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session?.user.id !== verifiedSession.user.id || !hasPasswordRecoverySession(data.session)) {
          setSessionReady(false);
          setLinkError('Länken är ogiltig eller har gått ut.');
          return;
        }
      }
      await updateRecoveryPassword(verifiedSession, password);
      let primarySession = activeSessionRef.current;
      try {
        const { data, error } = await supabase.auth.getSession();
        primarySession = error ? null : data.session;
      } catch (error) {
        primarySession = null;
        console.warn('[auth reset] Kunde inte kontrollera den aktiva sessionen efter lösenordsändringen', { name: error instanceof Error ? error.name : 'Unknown' });
      }
      toast.showToast('Lösenordet är uppdaterat.', 'success');
      router.replace(primarySession?.user.id === verifiedSession.user.id ? '/(tabs)' : '/(auth)');
    } catch (error) {
      console.warn('[auth reset] Lösenordsändringen kunde inte bekräftas', { name: error instanceof Error ? error.name : 'Unknown' });
      setFormError('Lösenordsändringen kunde inte bekräftas. Dina lösenord finns kvar. Försök igen.');
    } finally {
      setSubmitting(false);
    }
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

              {linkError ? <Text accessibilityRole="alert" style={styles.errorText}>{linkError}</Text> : null}
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

              {formError ? <Text accessibilityRole="alert" style={styles.errorText}>{formError}</Text> : null}

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Uppdatera lösenord"
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
