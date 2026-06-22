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
import Logo from '@/assets/images/logo-blue.svg';
import { theme } from '@/components/theme';
import { Card } from '@/components/Primitives';
import { supabase, supabaseConfig } from '@/lib/supabase';
import {
  savePendingJoinCode,
  savePendingOwnerStable,
  clearPendingOwnerStable,
} from '@/lib/pendingAuth';
import { generateId } from '@/lib/ids';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;
const EMAIL_CONFIRM_REDIRECT = 'stableflow://confirm';

type AuthMode = 'login' | 'signup';
type SignupIntent = 'create' | 'join';

export default function AuthScreen() {
  const router = useRouter();
  const toast = useToast();
  const isDesktop = useIsDesktopWeb();
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [signupIntent, setSignupIntent] = React.useState<SignupIntent>('create');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');
  const [stableName, setStableName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  // When signup needs email confirmation, we show a dedicated panel instead of
  // stranding the user on the login form.
  const [pendingConfirmEmail, setPendingConfirmEmail] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);

  const roleHintLines =
    signupIntent === 'create'
      ? [
          'Du skapar ditt eget stall och blir ägare.',
          'Du bjuder in personal och hästägare efteråt.',
        ]
      : [
          'Du behöver en inbjudningskod från en medlem.',
          'Koden kopplar dig till rätt stall efter signup.',
        ];

  React.useEffect(() => {
    if (mode === 'login') {
      setInviteCode('');
      setStableName('');
    }
  }, [mode]);

  const canSubmit =
    mode === 'login'
      ? email.trim().length > 0 && password.trim().length > 0
      : name.trim().length > 0 &&
        email.trim().length > 0 &&
        password.trim().length > 0 &&
        (signupIntent === 'create'
          ? stableName.trim().length > 0
          : inviteCode.trim().length > 0);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) {
      toast.showToast('Fyll i alla fält.', 'error');
      return;
    }
    if (submitting) {
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.showToast('Ange en giltig e-postadress.', 'error');
      return;
    }
    if (password.length < 8) {
      toast.showToast('Lösenordet måste vara minst 8 tecken.', 'error');
      return;
    }
    if (!supabaseConfig.isConfigured) {
      toast.showToast('Supabase är inte konfigurerad. Starta om Expo och kontrollera .env.', 'error');
      return;
    }
    setSubmitting(true);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const trimmedInviteCode = inviteCode.trim();
    const trimmedStableName = stableName.trim();
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        const message =
          error.message === 'Network request failed'
            ? 'Kan inte nå servern. Kontrollera din internetanslutning.'
            : 'Fel e-post eller lösenord.';
        toast.showToast(message, 'error');
      } else {
        toast.showToast('Välkommen!', 'success');
      }
      setSubmitting(false);
      return;
    }

    // Self-serve owner signup: no invite code. We stash the new stable so it is
    // created (with an owner membership) on the first authenticated hydration,
    // then the onboarding wizard takes over to finish resources/horses.
    if (signupIntent === 'create') {
      const stableId = generateId();
      // Persist BEFORE signUp (so the immediate-session hydration finds it without a
      // race) and bind it to this email. Abort if it can't be stored — otherwise we'd
      // create an account with no stable to claim.
      const stableSaved = await savePendingOwnerStable({
        id: stableId,
        name: trimmedStableName,
        email: trimmedEmail,
      });
      if (!stableSaved) {
        toast.showToast('Kunde inte förbereda stallet. Försök igen.', 'error');
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: EMAIL_CONFIRM_REDIRECT,
          data: {
            username: trimmedName,
            full_name: trimmedName,
          },
        },
      });

      if (error) {
        await clearPendingOwnerStable();
        const message =
          error.message === 'Network request failed'
            ? 'Kan inte nå servern. Kontrollera din internetanslutning.'
            : 'Kunde inte skapa konto. Kontrollera uppgifterna och försök igen.';
        toast.showToast(message, 'error');
        setSubmitting(false);
        return;
      }

      if (!data.user || !data.session) {
        // Email confirmation required. The pending stable is kept and created
        // on the first login after the user confirms their address.
        setPendingConfirmEmail(trimmedEmail);
        setSubmitting(false);
        return;
      }

      const profileUpdate = await supabase
        .from('profiles')
        .update({ full_name: trimmedName, username: trimmedName })
        .eq('id', data.user.id);
      if (profileUpdate.error) {
        console.warn('Kunde inte uppdatera profil', profileUpdate.error);
      }

      toast.showToast('Kontot är skapat. Nu sätter vi upp ditt stall.', 'success');
      setSubmitting(false);
      router.replace('/');
      return;
    }

    const inviteCheck = await supabase.rpc('validate_invite', {
      p_email: trimmedEmail,
      p_code: trimmedInviteCode.length > 0 ? trimmedInviteCode : null,
    });
    if (inviteCheck.error) {
      toast.showToast('Kunde inte verifiera inbjudan. Försök igen.', 'error');
      setSubmitting(false);
      return;
    }
    if (!inviteCheck.data) {
      toast.showToast('Inbjudningskoden är ogiltig.', 'error');
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: EMAIL_CONFIRM_REDIRECT,
        data: {
          username: trimmedName,
          full_name: trimmedName,
        },
      },
    });

    if (error) {
      const message =
        error.message === 'Network request failed'
          ? 'Kan inte nå servern. Kontrollera din internetanslutning.'
          : 'Kunde inte skapa konto. Kontrollera uppgifterna och försök igen.';
      toast.showToast(message, 'error');
      setSubmitting(false);
      return;
    }

    if (!data.user || !data.session) {
      await savePendingJoinCode(trimmedInviteCode);
      setPendingConfirmEmail(trimmedEmail);
      setSubmitting(false);
      return;
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update({ full_name: trimmedName, username: trimmedName })
      .eq('id', data.user.id);

    if (profileUpdate.error) {
      console.warn('Kunde inte uppdatera profil', profileUpdate.error);
    }

    const inviteResult = await supabase.rpc('accept_pending_invites');
    if (inviteResult.error) {
      toast.showToast('Kunde inte hämta inbjudan.', 'error');
      await supabase.auth.signOut();
      setSubmitting(false);
      return;
    }
    const acceptedCount = inviteResult.data ?? 0;

    if (!acceptedCount) {
      const joinResult = await supabase.rpc('accept_join_code', {
        p_code: trimmedInviteCode,
      });
      if (joinResult.error) {
        toast.showToast('Inbjudningskoden är ogiltig.', 'error');
        await supabase.auth.signOut();
        setSubmitting(false);
        return;
      }
    }

    toast.showToast('Kontot är skapat.', 'success');
    setSubmitting(false);
    router.replace('/?tour=intro');
  }, [
    canSubmit,
    email,
    inviteCode,
    stableName,
    signupIntent,
    mode,
    name,
    password,
    submitting,
    toast,
    router,
  ]);

  const handleForgotPassword = React.useCallback(() => {
    router.push('/(auth)/forgot-password');
  }, [router]);

  const handleResendConfirmation = React.useCallback(async () => {
    if (!pendingConfirmEmail || resending) {
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingConfirmEmail,
      options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
    });
    if (error) {
      toast.showToast('Kunde inte skicka igen. Försök om en stund.', 'error');
    } else {
      toast.showToast('Bekräftelsemejl skickat igen.', 'success');
    }
    setResending(false);
  }, [pendingConfirmEmail, resending, toast]);

  const handleBackToLogin = React.useCallback(() => {
    setPendingConfirmEmail(null);
    setMode('login');
    setPassword('');
  }, []);

  const modeLabel = mode === 'login' ? 'Logga in' : 'Skapa konto';

  const heroFeatures = [
    'Schema och pass i realtid',
    'Ridhus, ridpass och hagar',
    'Roller och behörigheter per stall',
  ];

  const heroPanel = (
    <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
      <View style={styles.heroHeader}>
        <View style={[styles.heroLogoWrap, isDesktop && styles.heroLogoWrapDesktop]}>
          <Logo width={32} height={32} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>StableFlow</Text>
          <Text style={[styles.heroSubtitle, isDesktop && styles.heroSubtitleDesktop]}>
            Allt kring stallet, samlat på ett ställe.
          </Text>
        </View>
      </View>
      {isDesktop ? (
        <View style={[styles.heroList, isDesktop && styles.heroListDesktop]}>
          {heroFeatures.map((item) => (
            <View key={item} style={styles.heroListItem}>
              <View style={[styles.heroListDot, isDesktop && styles.heroListDotDesktop]} />
              <Text style={[styles.heroListText, isDesktop && styles.heroListTextDesktop]}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {isDesktop ? (
        <Text style={[styles.heroFooter, isDesktop && styles.heroFooterDesktop]}>
          Logga in eller skapa konto för att fortsätta.
        </Text>
      ) : null}
    </View>
  );

  const formCard = (
    <Card elevated style={[styles.card, isDesktop && styles.cardDesktop]}>
      <View style={[styles.modeRow, isDesktop && styles.modeRowDesktop]}>
        {(['login', 'signup'] as const).map((id) => {
          const active = mode === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setMode(id)}
              style={[
                styles.modeChip,
                isDesktop && styles.modeChipDesktop,
                active && styles.modeChipActive,
              ]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={id === 'login' ? 'Logga in' : 'Skapa konto'}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.modeChipText,
                  isDesktop && styles.modeChipTextDesktop,
                  active && styles.modeChipTextActive,
                ]}
              >
                {id === 'login' ? 'Inlogg' : 'Skapa konto'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.formHeader}>
        <Text style={[styles.title, isDesktop && styles.titleDesktop]}>{modeLabel}</Text>
        {mode === 'signup' ? (
          <Text style={[styles.helperText, isDesktop && styles.helperTextDesktop]}>
            {signupIntent === 'create'
              ? 'Starta ett nytt stall och bli ägare.'
              : 'Gå med i ett befintligt stall med en inbjudningskod.'}
          </Text>
        ) : null}
      </View>

      {mode === 'signup' ? (
        <View style={[styles.modeRow, isDesktop && styles.modeRowDesktop]}>
          {(['create', 'join'] as const).map((id) => {
            const active = signupIntent === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setSignupIntent(id)}
                style={[
                  styles.modeChip,
                  isDesktop && styles.modeChipDesktop,
                  active && styles.modeChipActive,
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={id === 'create' ? 'Skapa eget stall' : 'Har inbjudningskod'}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    isDesktop && styles.modeChipTextDesktop,
                    active && styles.modeChipTextActive,
                  ]}
                >
                  {id === 'create' ? 'Skapa stall' : 'Har kod'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {mode === 'signup' ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Namn</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="För- och efternamn"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, isDesktop && styles.inputDesktop]}
          />
        </View>
      ) : null}

      {mode === 'signup' ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <View style={styles.roleHint}>
            <Text style={styles.roleHintTitle}>Så funkar det</Text>
            {roleHintLines.map((line) => (
              <View key={line} style={styles.roleHintRow}>
                <View style={styles.roleHintDot} />
                <Text style={styles.roleHintText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
        <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Epost</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="namn@exempel.se"
          placeholderTextColor={palette.secondaryText}
          style={[styles.input, isDesktop && styles.inputDesktop]}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
        <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Lösenord</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Minst 8 tecken"
          placeholderTextColor={palette.secondaryText}
          style={[styles.input, isDesktop && styles.inputDesktop]}
          secureTextEntry
        />
        {mode === 'login' ? (
          <TouchableOpacity
            style={styles.forgotPasswordLink}
            onPress={handleForgotPassword}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="Glömt lösenord"
          >
            <Text style={styles.forgotPasswordText}>Glömt lösenord?</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {mode === 'signup' && signupIntent === 'create' ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Stallets namn</Text>
          <TextInput
            value={stableName}
            onChangeText={setStableName}
            placeholder="T.ex. Soltorps Ridklubb"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, isDesktop && styles.inputDesktop]}
          />
        </View>
      ) : null}

      {mode === 'signup' && signupIntent === 'join' ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Inbjudningskod</Text>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Kod från admin"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, isDesktop && styles.inputDesktop]}
            autoCapitalize="characters"
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          isDesktop && styles.primaryButtonDesktop,
          (!canSubmit || submitting) && styles.primaryButtonDisabled,
        ]}
        onPress={handleSubmit}
        activeOpacity={0.9}
        disabled={!canSubmit || submitting}
        accessibilityRole="button"
        accessibilityLabel={mode === 'login' ? 'Logga in' : 'Skapa konto'}
        accessibilityState={{ disabled: !canSubmit || submitting }}
      >
        <Text style={[styles.primaryButtonText, isDesktop && styles.primaryButtonTextDesktop]}>
          {submitting ? 'Jobbar...' : modeLabel}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.footerText, isDesktop && styles.footerTextDesktop]}>
        {mode === 'login'
          ? 'Har du inget konto? Skapa ett ovan.'
          : 'Har du redan konto? Byt till Inlogg.'}
      </Text>
    </Card>
  );

  const confirmCard = (
    <Card elevated style={[styles.card, isDesktop && styles.cardDesktop]}>
      <View style={styles.formHeader}>
        <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Bekräfta din e-post</Text>
        <Text style={[styles.helperText, isDesktop && styles.helperTextDesktop]}>
          {`Vi har skickat en bekräftelselänk till ${pendingConfirmEmail ?? 'din e-post'}. Öppna den för att aktivera kontot och logga sedan in.`}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.primaryButton,
          isDesktop && styles.primaryButtonDesktop,
          resending && styles.primaryButtonDisabled,
        ]}
        onPress={handleResendConfirmation}
        activeOpacity={0.9}
        disabled={resending}
        accessibilityRole="button"
        accessibilityLabel="Skicka bekräftelsemejl igen"
        accessibilityState={{ disabled: resending }}
      >
        <Text style={[styles.primaryButtonText, isDesktop && styles.primaryButtonTextDesktop]}>
          {resending ? 'Skickar...' : 'Skicka igen'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleBackToLogin}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Till inloggning"
      >
        <Text style={[styles.footerText, isDesktop && styles.footerTextDesktop]}>
          Till inloggning
        </Text>
      </TouchableOpacity>
    </Card>
  );

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isDesktop ? (
              <View style={styles.desktopLayout}>
                {heroPanel}
                {pendingConfirmEmail ? confirmCard : formCard}
              </View>
            ) : (
              <>
                {heroPanel}
                {pendingConfirmEmail ? confirmCard : formCard}
              </>
            )}
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
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 22,
  },
  contentDesktop: {
    maxWidth: 1040,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 52,
    justifyContent: 'center',
    gap: 32,
  },
  desktopLayout: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 32,
    width: '100%',
  },
  heroCard: {
    padding: 22,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
    backgroundColor: palette.surface,
    gap: 16,
  },
  heroCardDesktop: {
    flex: 1.1,
    padding: 30,
    minHeight: 380,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
  },
  heroLogoWrapDesktop: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  heroTitleDesktop: {
    fontSize: 22,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 12,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  heroSubtitleDesktop: {
    fontSize: 13,
    lineHeight: 20,
  },
  heroList: {
    gap: 10,
  },
  heroListDesktop: {
    gap: 12,
  },
  heroListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroListDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(62, 155, 95, 0.4)',
  },
  heroListDotDesktop: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  heroListText: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.secondaryText,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  heroListTextDesktop: {
    fontSize: 13,
    lineHeight: 20,
  },
  heroFooter: {
    fontSize: 12,
    color: palette.mutedText,
    marginTop: 6,
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  heroFooterDesktop: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 20,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
    backgroundColor: palette.surface,
  },
  cardDesktop: {
    flex: 0.9,
    minWidth: 420,
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 28,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
    alignSelf: 'flex-start',
  },
  modeRowDesktop: {
    padding: 4,
    gap: 6,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  modeChipDesktop: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
    letterSpacing: 0.3,
  },
  modeChipTextDesktop: {
    fontSize: 13,
  },
  modeChipTextActive: {
    color: palette.primaryText,
    fontWeight: '700',
  },
  modeChipActive: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
  },
  formHeader: {
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  titleDesktop: {
    fontSize: 23,
    lineHeight: 30,
  },
  helperText: {
    fontSize: 12,
    color: palette.mutedText,
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  helperTextDesktop: {
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    gap: 10,
  },
  fieldDesktop: {
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.secondaryText,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  labelDesktop: {
    fontSize: 12,
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
  inputDesktop: {
    paddingVertical: 15,
    fontSize: 16,
    lineHeight: 22,
  },
  roleHint: {
    marginTop: 12,
    padding: 12,
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
    backgroundColor: palette.surfaceMuted,
  },
  roleHintTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.secondaryText,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  roleHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  roleHintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: palette.primary,
  },
  roleHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: palette.secondaryText,
  },
  primaryButton: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    alignItems: 'center',
  },
  primaryButtonDesktop: {
    paddingVertical: 15,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.inverseText,
    letterSpacing: 0.4,
  },
  primaryButtonTextDesktop: {
    fontSize: 17,
  },
  footerText: {
    fontSize: 12,
    color: palette.mutedText,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  footerTextDesktop: {
    fontSize: 13,
    lineHeight: 18,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-start',
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
});
