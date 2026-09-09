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
import { supabase } from '@/lib/supabase';
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

function decodeParam(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(true);

  const applyUrl = React.useCallback(
    async (url: string | null) => {
      if (!url) {
        return;
      }
      const params = parseParamsFromUrl(url);
      const errDesc = params.get('error_description') ?? params.get('error');
      if (errDesc) {
        setError(decodeParam(errDesc));
        setVerifying(false);
        return;
      }
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (access && refresh) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        if (sessionError) {
          setError('Länken är ogiltig eller har gått ut.');
          setVerifying(false);
          return;
        }
        router.replace('/');
        return;
      }
      // No tokens in the URL: on web detectSessionInUrl may already have set the
      // session, otherwise the address is confirmed and the user can just log in.
      setVerifying(false);
    },
    [router],
  );

  React.useEffect(() => {
    let active = true;
    const readInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (active) {
        await applyUrl(initialUrl);
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
