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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from '@/assets/images/logo-blue.svg';
import { theme } from '@/components/theme';
import { Card, Pill } from '@/components/Primitives';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';

const palette = theme.colors;

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const { state, actions } = useAppData();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [stableId, setStableId] = React.useState(
    state.currentStableId ?? state.stables[0]?.id ?? '',
  );

  React.useEffect(() => {
    if (!stableId && state.stables[0]) {
      setStableId(state.currentStableId ?? state.stables[0].id);
      return;
    }
    const exists = state.stables.some((stable) => stable.id === stableId);
    if (!exists && state.stables[0]) {
      setStableId(state.stables[0].id);
    }
  }, [stableId, state.currentStableId, state.stables]);

  const canSubmit =
    mode === 'login'
      ? email.trim().length > 0 && password.trim().length > 0
      : name.trim().length > 0 && email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit) {
      toast.showToast('Fyll i alla fält.', 'error');
      return;
    }
    if (mode === 'login') {
      const result = actions.signIn({ email, password });
      if (result.success) {
        toast.showToast(`Välkommen ${result.data?.name ?? ''}`.trim(), 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
      return;
    }
    const result = actions.signUp({ name, email, password, stableId });
    if (result.success) {
      toast.showToast('Kontot är skapat.', 'success');
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, canSubmit, email, mode, name, password, stableId, toast]);

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
        <View style={styles.demoNote}>
          <Text style={[styles.demoNoteText, isDesktop && styles.demoNoteTextDesktop]}>
            Demo-läge: lösenordet används inte än, men fyll i för att fortsätta.
          </Text>
        </View>
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

      {mode === 'signup' ? (
        <View style={[styles.field, isDesktop && styles.fieldDesktop]}>
          <Text style={[styles.label, isDesktop && styles.labelDesktop]}>Välj stall</Text>
          <View style={styles.stableRow}>
            {state.stables.map((stable) => {
              const active = stable.id === stableId;
              return (
                <TouchableOpacity
                  key={stable.id}
                  onPress={() => setStableId(stable.id)}
                  activeOpacity={0.85}
                >
                  <Pill
                    active={active}
                    style={[styles.stableChip, active && styles.stableChipActive]}
                  >
                    <Text style={[styles.stableText, active && styles.stableTextActive]}>
                      {stable.name}
                    </Text>
                  </Pill>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          isDesktop && styles.primaryButtonDesktop,
          !canSubmit && styles.primaryButtonDisabled,
        ]}
        onPress={handleSubmit}
        activeOpacity={0.9}
        disabled={!canSubmit}
      >
        <Text style={[styles.primaryButtonText, isDesktop && styles.primaryButtonTextDesktop]}>
          {modeLabel}
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
  demoNote: {
    paddingVertical: 2,
  },
  demoNoteText: {
    fontSize: 12,
    color: palette.mutedText,
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  demoNoteTextDesktop: {
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
  stableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stableChip: {
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  stableText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  stableTextActive: {
    color: palette.primary,
  },
  stableChipActive: {
    backgroundColor: theme.tints.primary,
    borderColor: 'rgba(45, 108, 246, 0.3)',
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
});
