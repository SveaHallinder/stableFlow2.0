import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from '@/assets/images/logo-blue.svg';
import { theme } from '@/components/theme';
import { Card, Pill } from '@/components/Primitives';
import { generateId } from '@/lib/ids';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { savePendingJoinCode, savePendingOwnerStable } from '@/lib/pendingAuth';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';

const palette = theme.colors;

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isOwner, setIsOwner] = React.useState(false);
  const [stableName, setStableName] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const roleHintLines = isOwner
    ? [
        'Skapa första stallet och bjud in medlemmar direkt efteråt.',
        'Du får tillgång till admin och den guidade uppstarten.',
      ]
    : [
        'Du behöver en inbjudan via e-post eller en kod från admin.',
        'När du skapat konto kopplas du automatiskt till stallet.',
      ];

  React.useEffect(() => {
    if (mode === 'login') {
      setIsOwner(false);
      setStableName('');
      setInviteCode('');
    }
  }, [mode]);

  const canSubmit =
    mode === 'login'
      ? email.trim().length > 0 && password.trim().length > 0
      : name.trim().length > 0 &&
        email.trim().length > 0 &&
        password.trim().length > 0 &&
        (isOwner ? stableName.trim().length > 0 : true);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) {
      toast.showToast('Fyll i alla fält.', 'error');
      return;
    }
    if (submitting) {
      return;
    }
    if (!supabaseConfig.isConfigured) {
      toast.showToast('Supabase är inte konfigurerad. Starta om Expo och kontrollera .env.', 'error');
      return;
    }
    setSubmitting(true);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const trimmedStableName = stableName.trim();
    const trimmedInviteCode = inviteCode.trim();
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        const message =
          error.message === 'Network request failed'
            ? 'Kan inte nå Supabase. Kolla internet och EXPO_PUBLIC_SUPABASE_URL.'
            : error.message;
        toast.showToast(message, 'error');
      } else {
        toast.showToast('Välkommen!', 'success');
      }
      setSubmitting(false);
      return;
    }

    if (!isOwner) {
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
        toast.showToast('Du måste vara inbjuden av en admin för att skapa konto.', 'error');
        setSubmitting(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          username: trimmedName,
          full_name: trimmedName,
        },
      },
    });

    if (error) {
      const message =
        error.message === 'Network request failed'
          ? 'Kan inte nå Supabase. Kolla internet och EXPO_PUBLIC_SUPABASE_URL.'
          : error.message;
      toast.showToast(message, 'error');
      setSubmitting(false);
      return;
    }

    if (!data.user || !data.session) {
      if (isOwner && trimmedStableName.length > 0) {
        await savePendingOwnerStable({ id: generateId(), name: trimmedStableName });
      } else if (trimmedInviteCode.length > 0) {
        await savePendingJoinCode(trimmedInviteCode);
      }
      toast.showToast('Kontot är skapat. Kontrollera din e-post för att aktivera.', 'success');
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

    if (isOwner) {
      const stableInsert = await supabase
        .from('stables')
        .insert({ name: trimmedStableName, created_by: data.user.id })
        .select()
        .single();
      if (stableInsert.error || !stableInsert.data) {
        toast.showToast('Kunde inte skapa stall. Försök igen.', 'error');
        setSubmitting(false);
        return;
      }
      const memberInsert = await supabase.from('stable_members').insert({
        stable_id: stableInsert.data.id,
        user_id: data.user.id,
        role: 'admin',
        access: 'owner',
        rider_role: 'owner',
      });
      if (memberInsert.error) {
        toast.showToast('Kunde inte koppla dig till stallet.', 'error');
        setSubmitting(false);
        return;
      }
      toast.showToast('Kontot är skapat.', 'success');
      setSubmitting(false);
      router.replace('/(onboarding)');
      return;
    }

    let joined = false;
    if (trimmedInviteCode.length > 0) {
      const joinResult = await supabase.rpc('accept_join_code', {
        p_code: trimmedInviteCode,
      });
      if (joinResult.error) {
        toast.showToast('Inbjudningskoden är ogiltig.', 'error');
        setSubmitting(false);
        return;
      }
      joined = true;
    }

    const inviteResult = await supabase.rpc('accept_pending_invites');
    if (inviteResult.error && !joined) {
      toast.showToast('Kunde inte hämta inbjudan.', 'error');
      await supabase.auth.signOut();
      setSubmitting(false);
      return;
    }
    const acceptedCount = inviteResult.data ?? 0;

    if (!joined && (!acceptedCount || acceptedCount === 0)) {
      toast.showToast('Ingen inbjudan hittades för den e-posten.', 'error');
      await supabase.auth.signOut();
      setSubmitting(false);
      return;
    }

    toast.showToast('Kontot är skapat.', 'success');
    setSubmitting(false);
    router.replace('/?tour=intro');
  }, [
    canSubmit,
    email,
    inviteCode,
    isOwner,
    mode,
    name,
    password,
    stableName,
    submitting,
    toast,
    router,
  ]);

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
            Skapa konto som stallägare/admin eller gå med via inbjudan (e-post eller kod).
          </Text>
        ) : null}
      </View>

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
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Jag är</Text>
          <View style={[styles.roleRow, isDesktop && styles.roleRowDesktop]}>
            <TouchableOpacity onPress={() => setIsOwner(true)} activeOpacity={0.85}>
              <Pill
                active={isOwner}
                style={[styles.roleChip, isOwner && styles.roleChipActive]}
              >
                <Text style={[styles.roleChipText, isOwner && styles.roleChipTextActive]}>
                  Admin / stallägare
                </Text>
              </Pill>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsOwner(false)} activeOpacity={0.85}>
              <Pill
                active={!isOwner}
                style={[styles.roleChip, !isOwner && styles.roleChipActive]}
              >
                <Text style={[styles.roleChipText, !isOwner && styles.roleChipTextActive]}>
                  Inbjuden medlem
                </Text>
              </Pill>
            </TouchableOpacity>
          </View>
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
        <Text style={[styles.label, isDesktop && styles.labelDesktop]}>E-post</Text>
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
          placeholder="Minst 6 tecken"
          placeholderTextColor={palette.secondaryText}
          style={[styles.input, isDesktop && styles.inputDesktop]}
          secureTextEntry
        />
      </View>

      {mode === 'signup' && isOwner ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Stallnamn</Text>
          <TextInput
            value={stableName}
            onChangeText={setStableName}
            placeholder="Ex. Stall Solgläntan"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, isDesktop && styles.inputDesktop]}
          />
        </View>
      ) : null}

      {mode === 'signup' && !isOwner ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Inbjudningskod</Text>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Kod (lämna tomt om du fått e-postinbjudan)"
            placeholderTextColor={palette.secondaryText}
            style={[styles.input, isDesktop && styles.inputDesktop]}
            autoCapitalize="characters"
          />
          <Text style={styles.helperNote}>Har du e-postinbjudan? Lämna fältet tomt.</Text>
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
                {formCard}
              </View>
            ) : (
              <>
                {heroPanel}
                {formCard}
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
    backgroundColor: 'rgba(45, 108, 246, 0.4)',
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
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleRowDesktop: {
    gap: 10,
  },
  roleChip: {
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  roleChipActive: {
    backgroundColor: theme.tints.primary,
    borderColor: 'rgba(45, 108, 246, 0.3)',
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  roleChipTextActive: {
    color: palette.primary,
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
  helperNote: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: palette.mutedText,
  },
});
