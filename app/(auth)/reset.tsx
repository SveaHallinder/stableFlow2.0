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
import { clearRecoveryCodeSession, getRecoveryCodeState, hasPasswordRecoverySession, hasRecoveryCodeSession, requestRecoveryCode, subscribePasswordRecovery, supabase, supabaseConfig, updateRecoveryPassword, verifyRecoveryCode, verifyRecoverySession } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';
import { authRedirectUrl } from '@/lib/authRedirect';

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
  const verifiedOriginRef = React.useRef<'web' | 'link' | 'code' | null>(null);
  const linkVersionRef = React.useRef(0);
  const [recoveryVersion, setRecoveryVersion] = React.useState(0);
  const aliveRef = React.useRef(true);
  const busyRef = React.useRef(false);
  const codeAttemptRef = React.useRef(0);
  const codeFlowRef = React.useRef(Boolean(getRecoveryCodeState().email));
  const codeVersionRef = React.useRef<number | null>(getRecoveryCodeState().email ? getRecoveryCodeState().version : null);
  const verifiedCodeVersionRef = React.useRef<number | null>(null);
  const [codeEmail, setCodeEmail] = React.useState(() => getRecoveryCodeState().email);
  const [code, setCode] = React.useState('');
  const [codeSent, setCodeSent] = React.useState(() => Boolean(getRecoveryCodeState().email));

  const [accessToken, setAccessToken] = React.useState('');
  const [refreshToken, setRefreshToken] = React.useState('');
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [settingSession, setSettingSession] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState(false);

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const displayedCodeVersion = getRecoveryCodeState().version;
  const codeRenderAttempt = codeAttemptRef.current;

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      codeAttemptRef.current += 1;
      linkVersionRef.current += 1;
      const version = codeVersionRef.current;
      void Promise.resolve().then(() => {
        if (!aliveRef.current && version !== null) clearRecoveryCodeSession(version);
      });
    };
  }, []);
  React.useEffect(() => subscribePasswordRecovery(() => {
    if (verifiedOriginRef.current === 'code' && getRecoveryCodeState().version !== verifiedCodeVersionRef.current) {
      linkVersionRef.current += 1;
    }
    setRecoveryVersion(value => value + 1);
  }), []);
  React.useEffect(() => {
    const recovery = getRecoveryCodeState();
    if (!accessToken && !refreshToken && recovery.session && recovery.version === codeVersionRef.current) {
      verifiedSessionRef.current = recovery.session;
      verifiedOriginRef.current = 'code';
      verifiedCodeVersionRef.current = recovery.version;
      setSessionReady(true);
      setLinkError(null);
    } else if (verifiedOriginRef.current === 'code' && (!hasRecoveryCodeSession(verifiedSessionRef.current) || recovery.version !== verifiedCodeVersionRef.current)) {
      if (recovery.version !== verifiedCodeVersionRef.current) {
        codeAttemptRef.current += 1;
        busyRef.current = false;
        setSubmitting(false);
      }
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setPassword('');
      setConfirmPassword('');
      if (!busyRef.current) setLinkError('Koden är ogiltig eller har gått ut. Begär en ny kod.');
    } else if (!codeFlowRef.current && !recovery.email && verifiedOriginRef.current !== 'code' && Platform.OS === 'web' && !accessToken && !refreshToken && hasPasswordRecoverySession(session)) {
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
    const params = url ? parseParamsFromUrl(url) : new URLSearchParams();
    const error = params.get('error_description') ?? params.get('error');
    if (error) {
      codeFlowRef.current = false;
      codeAttemptRef.current += 1;
      busyRef.current = false;
      setSubmitting(false);
      if (codeVersionRef.current !== null) clearRecoveryCodeSession(codeVersionRef.current);
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
      codeFlowRef.current = false;
      codeAttemptRef.current += 1;
      busyRef.current = false;
      setSubmitting(false);
      if (codeVersionRef.current !== null) clearRecoveryCodeSession(codeVersionRef.current);
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setAccessToken(access);
      setRefreshToken(refresh);
      setLinkError(null);
      return;
    }
    const recovery = getRecoveryCodeState();
    if (recovery.session && recovery.version === codeVersionRef.current) {
      verifiedSessionRef.current = recovery.session;
      verifiedOriginRef.current = 'code';
      verifiedCodeVersionRef.current = recovery.version;
      setSessionReady(true);
      setLinkError(null);
      return;
    }
    if (recovery.email && recovery.version === codeVersionRef.current) {
      setCodeEmail(recovery.email);
      setCodeSent(true);
      setLinkError(null);
      return;
    }
    if (!codeFlowRef.current && !recovery.email && Platform.OS === 'web' && hasPasswordRecoverySession(activeSessionRef.current)) {
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
    setLinkError(url && (params.has('error') || params.has('access_token')) ? 'Länken är ogiltig eller har gått ut.' : null);
  }, []);

  React.useEffect(() => {
    let active = true;
    const readInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (active) {
          const recovery = getRecoveryCodeState();
          applyUrl(recovery.email && recovery.version === codeVersionRef.current ? null : initialUrl);
        }
      } catch (error) {
        console.warn('[auth reset] Kunde inte läsa återställningslänken', { name: error instanceof Error ? error.name : 'Unknown' });
        if (active) setLinkError('Kunde inte läsa återställningslänken. Öppna länken igen eller välj Skicka ny kod.');
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
        if (linkVersionRef.current === linkVersion) setLinkError('Kunde inte verifiera länken. Öppna återställningslänken igen eller välj Skicka ny kod.');
      } finally {
        setSettingSession(false);
      }
    };
    void setSession();
  }, [accessToken, refreshToken, sessionReady, settingSession, linkError]);

  const handleRequestCode = React.useCallback(async () => {
    if (!aliveRef.current || busyRef.current || codeRenderAttempt !== codeAttemptRef.current || displayedCodeVersion !== getRecoveryCodeState().version) return;
    const email = codeEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Ange en giltig e-postadress.');
      return;
    }
    if (!supabaseConfig.isConfigured) {
      setFormError('Återställning är inte tillgänglig just nu. Försök igen senare.');
      return;
    }
    codeFlowRef.current = true;
    busyRef.current = true;
    const attempt = ++codeAttemptRef.current;
    const isCurrent = () => aliveRef.current && codeAttemptRef.current === attempt;
    linkVersionRef.current += 1;
    verifiedSessionRef.current = null;
    verifiedOriginRef.current = null;
    setSessionReady(false);
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setSubmitting(true);
    setFormError(null);
    setLinkError(null);
    try {
      const pending = requestRecoveryCode(email, authRedirectUrl('reset'), isCurrent);
      codeVersionRef.current = getRecoveryCodeState().version;
      await pending;
      if (!isCurrent() || getRecoveryCodeState().version !== codeVersionRef.current) return;
      setCodeEmail(email);
      setCodeSent(true);
      toast.showToast('Om adressen har ett konto får du en återställningskod. Kontrollera även skräpposten.', 'success');
    } catch (error) {
      if (!isCurrent() || getRecoveryCodeState().version !== codeVersionRef.current) return;
      console.warn('[auth reset] Kunde inte skicka återställningskoden', { name: error instanceof Error ? error.name : 'Unknown' });
      setFormError(typeof error === 'object' && error !== null && 'status' in error && error.status === 429
        ? 'För många försök. Vänta en stund innan du skickar en ny kod.'
        : 'Kunde inte skicka koden. Din e-post finns kvar. Försök igen.');
    } finally {
      if (isCurrent()) { busyRef.current = false; setSubmitting(false); }
    }
  }, [codeEmail, codeRenderAttempt, displayedCodeVersion, toast]);

  const handleVerifyCode = React.useCallback(async () => {
    if (!aliveRef.current || busyRef.current || codeRenderAttempt !== codeAttemptRef.current || displayedCodeVersion !== getRecoveryCodeState().version) return;
    if (!/^\d{6}$/.test(code)) { setFormError('Ange den sexsiffriga koden från mejlet.'); return; }
    if (!supabaseConfig.isConfigured) { setFormError('Återställning är inte tillgänglig just nu. Försök igen senare.'); return; }
    codeFlowRef.current = true;
    busyRef.current = true;
    const attempt = ++codeAttemptRef.current;
    const isCurrent = () => aliveRef.current && codeAttemptRef.current === attempt;
    linkVersionRef.current += 1;
    setSubmitting(true);
    setFormError(null);
    setLinkError(null);
    try {
      const pending = verifyRecoveryCode(codeEmail, code, isCurrent);
      codeVersionRef.current = getRecoveryCodeState().version;
      const verifiedSession = await pending;
      if (!isCurrent() || getRecoveryCodeState().version !== codeVersionRef.current || !hasRecoveryCodeSession(verifiedSession)) return;
      verifiedSessionRef.current = verifiedSession;
      verifiedOriginRef.current = 'code';
      verifiedCodeVersionRef.current = codeVersionRef.current;
      setSessionReady(true);
      setCode('');
    } catch (error) {
      if (!isCurrent() || getRecoveryCodeState().version !== codeVersionRef.current) return;
      console.warn('[auth reset] Kunde inte verifiera återställningskoden', { name: error instanceof Error ? error.name : 'Unknown' });
      setFormError('Koden kunde inte verifieras. Kontrollera den senaste koden och e-postadressen, eller skicka en ny kod.');
    } finally {
      if (isCurrent()) { busyRef.current = false; setSubmitting(false); }
    }
  }, [code, codeEmail, codeRenderAttempt, displayedCodeVersion]);

  const handleChangeEmail = React.useCallback(() => {
    if (!aliveRef.current || busyRef.current || settingSession || codeRenderAttempt !== codeAttemptRef.current || displayedCodeVersion !== getRecoveryCodeState().version) return;
    codeFlowRef.current = true;
    codeAttemptRef.current += 1;
    linkVersionRef.current += 1;
    if (codeVersionRef.current !== null) clearRecoveryCodeSession(codeVersionRef.current);
    codeVersionRef.current = null;
    verifiedSessionRef.current = null;
    verifiedOriginRef.current = null;
    setSessionReady(false);
    setCodeSent(false);
    setCode('');
    setAccessToken('');
    setRefreshToken('');
    setPassword('');
    setConfirmPassword('');
    setLinkError(null);
    setFormError(null);
  }, [codeRenderAttempt, displayedCodeVersion, settingSession]);

  const handleBack = React.useCallback(() => {
    if (!aliveRef.current || busyRef.current || settingSession || codeRenderAttempt !== codeAttemptRef.current || displayedCodeVersion !== getRecoveryCodeState().version) return;
    codeAttemptRef.current += 1;
    linkVersionRef.current += 1;
    if (codeVersionRef.current !== null) clearRecoveryCodeSession(codeVersionRef.current);
    router.replace('/(auth)');
  }, [codeRenderAttempt, displayedCodeVersion, router, settingSession]);

  const handleUpdatePassword = React.useCallback(async () => {
    if (!aliveRef.current || busyRef.current || submitting || settingSession || codeRenderAttempt !== codeAttemptRef.current) {
      return;
    }
    if (verifiedOriginRef.current === 'code' && displayedCodeVersion !== getRecoveryCodeState().version) return;
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
      toast.showToast('Återställning är inte tillgänglig just nu. Försök igen senare.', 'error');
      return;
    }
    busyRef.current = true;
    const linkVersion = linkVersionRef.current;
    const isCurrent = () => aliveRef.current && linkVersionRef.current === linkVersion;
    setSubmitting(true);
    try {
      const verifiedSession = verifiedSessionRef.current;
      const verifiedOrigin = verifiedOriginRef.current;
      if (!verifiedSession || (verifiedOrigin === 'code' && (!hasRecoveryCodeSession(verifiedSession)
        || getRecoveryCodeState().version !== verifiedCodeVersionRef.current))) {
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
      if (!isCurrent()) return;
      await updateRecoveryPassword(verifiedSession, password, verifiedOrigin === 'code' ? 'code' : undefined);
      if (!isCurrent() || (verifiedOrigin === 'code' && getRecoveryCodeState().version !== verifiedCodeVersionRef.current)) return;
      let primarySession = activeSessionRef.current;
      try {
        const { data, error } = await supabase.auth.getSession();
        primarySession = error ? null : data.session;
      } catch (error) {
        primarySession = null;
        console.warn('[auth reset] Kunde inte kontrollera den aktiva sessionen efter lösenordsändringen', { name: error instanceof Error ? error.name : 'Unknown' });
      }
      if (!isCurrent() || (verifiedOrigin === 'code' && getRecoveryCodeState().version !== verifiedCodeVersionRef.current)) return;
      verifiedSessionRef.current = null;
      verifiedOriginRef.current = null;
      setSessionReady(false);
      setPassword('');
      setConfirmPassword('');
      toast.showToast('Lösenordet är uppdaterat.', 'success');
      router.replace(primarySession?.user.id === verifiedSession.user.id ? '/(tabs)' : '/(auth)');
    } catch (error) {
      if (!isCurrent() || (verifiedCodeVersionRef.current !== null && verifiedOriginRef.current === 'code'
        && getRecoveryCodeState().version !== verifiedCodeVersionRef.current)) return;
      console.warn('[auth reset] Lösenordsändringen kunde inte bekräftas', { name: error instanceof Error ? error.name : 'Unknown' });
      setFormError('Lösenordsändringen kunde inte bekräftas. Dina lösenord finns kvar. Försök igen.');
    } finally {
      if (isCurrent()) { busyRef.current = false; setSubmitting(false); }
    }
  }, [codeRenderAttempt, confirmPassword, displayedCodeVersion, password, router, sessionReady, settingSession, submitting, toast]);

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
                <Text style={styles.title}>{sessionReady ? 'Sätt nytt lösenord' : 'Återställ lösenord'}</Text>
                <Text style={styles.subtitle}>
                  {sessionReady ? 'Välj ett nytt lösenord och bekräfta det för att slutföra återställningen.' : 'Ange e-post och den sexsiffriga återställningskoden från mejlet.'}
                </Text>
              </View>

              {linkError ? <Text accessibilityRole="alert" style={styles.errorText}>{linkError}</Text> : null}
              {settingSession ? (
                <View style={styles.inlineRow}>
                  <ActivityIndicator color={palette.primary} />
                  <Text style={styles.helperText}>Verifierar länken...</Text>
                </View>
              ) : null}

              {sessionReady && verifiedSessionRef.current?.user.email ? (
                <Text style={styles.helperText}>Återställer {verifiedSessionRef.current.user.email}</Text>
              ) : null}
              {!sessionReady && !accessToken && !refreshToken ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>E-post</Text>
                    <TextInput value={codeEmail} onChangeText={setCodeEmail} editable={!submitting && !codeSent}
                      accessibilityLabel="E-post för återställning" placeholder="namn@exempel.se"
                      placeholderTextColor={palette.secondaryText} style={styles.input}
                      autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
                  </View>
                  {codeSent ? (
                    <>
                      <Text style={styles.helperText}>Om adressen har ett konto får du en återställningskod. Kontrollera även skräpposten.</Text>
                      <View style={styles.field}>
                        <Text style={styles.label}>Återställningskod</Text>
                        <TextInput value={code} onChangeText={setCode} editable={!submitting}
                          accessibilityLabel="Sexsiffrig återställningskod" placeholder="123456" maxLength={6}
                          placeholderTextColor={palette.secondaryText} style={styles.input}
                          keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
                      </View>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Verifiera återställningskod"
                        accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting}
                        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]} onPress={handleVerifyCode}>
                        <Text style={styles.primaryButtonText}>{submitting ? 'Väntar...' : 'Verifiera återställningskod'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" disabled={submitting} onPress={handleChangeEmail} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Ändra e-post</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={codeSent ? 'Skicka ny kod' : 'Skicka återställningskod'}
                    accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting}
                    style={styles.secondaryButton} onPress={handleRequestCode}>
                    <Text style={styles.secondaryButtonText}>{codeSent ? 'Skicka ny kod' : 'Skicka återställningskod'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {sessionReady || accessToken || refreshToken ? (
                <>
              <View style={styles.field}>
                <Text style={styles.label}>Nytt lösenord</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minst 8 tecken"
                  placeholderTextColor={palette.secondaryText}
                  style={styles.input}
                  secureTextEntry
                  editable={!submitting && !settingSession}
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
                  editable={!submitting && !settingSession}
                />
              </View>

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

                </>
              ) : null}
              {formError ? <Text accessibilityRole="alert" style={styles.errorText}>{formError}</Text> : null}

              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleChangeEmail}
                  disabled={submitting || settingSession}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Börja om med e-post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleBack}
                  disabled={submitting || settingSession}
                  accessibilityRole="button"
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
