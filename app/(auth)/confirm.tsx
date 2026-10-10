import React from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { PRIMARY_SESSION_MUTATION_UNSUPPORTED_MESSAGE, PrimarySessionMutationUnsupportedError, supabase, withPrimarySessionMutation } from '@/lib/supabase';
import { radius } from '@/design/tokens';

const palette = theme.colors;

// Landing screen for the email-confirmation deep link (stableflow://confirm).
// Parses the tokens Supabase appends, sets the session, and drops the user into
// the app — where pending invites / a pending owner stable are claimed on hydration.
function parseParamsFromUrl(url: string) {
  const params = new URLSearchParams();
  const [base, hash] = url.split('#');
  const queryIndex = base.indexOf('?');
  if (queryIndex >= 0) {
    new URLSearchParams(base.slice(queryIndex + 1)).forEach((value, key) =>
      params.set(key, value),
    );
  }
  if (hash) {
    new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  }
  return params;
}

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(true);

  const applyUrl = React.useCallback(
    async (url: string | null) => {
      if (!url) {
        setError('Öppna bekräftelselänken i mejlet. Om du redan har bekräftat din e-post kan du logga in.');
        setVerifying(false);
        return;
      }
      const params = parseParamsFromUrl(url);
      const errDesc = params.get('error_description') ?? params.get('error');
      if (errDesc) {
        setError('Länken är ogiltig eller har gått ut. Gå till inloggning och begär ett nytt bekräftelsemejl.');
        setVerifying(false);
        return;
      }
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (access && refresh) {
        try {
          const { error: sessionError } = await withPrimarySessionMutation(() => supabase.auth.setSession({
            access_token: access,
            refresh_token: refresh,
          }));
          if (sessionError) {
            console.warn('[auth confirm] Kunde inte verifiera sessionen', { code: sessionError.code, status: sessionError.status });
            setError(sessionError.status === 0 || (sessionError.status ?? 0) >= 500
              ? 'Kunde inte bekräfta din e-post. Kontrollera anslutningen och öppna länken igen.'
              : 'Länken är ogiltig eller har gått ut.');
            return;
          }
          router.replace('/');
        } catch (error) {
          console.warn('[auth confirm] Sessionskontrollen misslyckades.');
          setError(error instanceof PrimarySessionMutationUnsupportedError
            ? PRIMARY_SESSION_MUTATION_UNSUPPORTED_MESSAGE
            : 'Kunde inte bekräfta din e-post. Kontrollera anslutningen och öppna länken igen.');
        } finally {
          setVerifying(false);
        }
        return;
      }
      // A bare route is not proof that an address has been confirmed. On web an
      // already detected session is handled by AuthGate.
      setError('Öppna bekräftelselänken i mejlet. Om du redan har bekräftat din e-post kan du logga in.');
      setVerifying(false);
    },
    [router],
  );

  React.useEffect(() => {
    let active = true;
    const readInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (active) {
          await applyUrl(initialUrl);
        }
      } catch {
        if (active) {
          console.warn('[auth confirm] Kunde inte läsa bekräftelselänken.');
          setError('Kunde inte läsa bekräftelselänken. Öppna länken i mejlet igen.');
          setVerifying(false);
        }
      }
    };
    void readInitialUrl();
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void applyUrl(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [applyUrl]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Card elevated style={styles.card}>
            {verifying ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator color={palette.primary} />
                <Text style={styles.helperText}>Bekräftar din e-post...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.title}>
                  {error ? 'Länken kunde inte verifieras' : 'Din e-post är bekräftad'}
                </Text>
                <Text style={styles.subtitle}>
                  {error ?? 'Logga in för att fortsätta.'}
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.replace('/(auth)')}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Till inloggning"
                >
                  <Text style={styles.primaryButtonText}>Till inloggning</Text>
                </TouchableOpacity>
              </>
            )}
          </Card>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: { padding: 20, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: palette.primaryText },
  subtitle: { fontSize: 13, color: palette.secondaryText, lineHeight: 18 },
  helperText: { fontSize: 13, color: palette.secondaryText },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryButton: {
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 14, fontWeight: '700', color: palette.inverseText },
});
