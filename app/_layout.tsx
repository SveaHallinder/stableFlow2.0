import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppDataProvider, useAppData } from '@/context/AppDataContext';
import { ToastProvider } from '@/components/ToastProvider';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ErrorBoundary>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFD" />
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <NotificationBootstrap />
            <AppDataProvider>
              <OnboardingGate>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </OnboardingGate>
            </AppDataProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Något gick fel</Text>
          <Text style={errorStyles.body}>
            Appen stötte på ett oväntat problem. Försök starta om.
          </Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={errorStyles.buttonText}>Försök igen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFD',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C2439',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#5A6785',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#2D6CF6',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

function NotificationBootstrap() {
  const { user } = useAuth();
  usePushNotifications(user?.id);
  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) {
      return;
    }
    const rootSegment = segments[0];
    const inAuthGroup = rootSegment === '(auth)';
    const isNotFound = rootSegment === '+not-found';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)');
      return;
    }
    if (session && (inAuthGroup || isNotFound)) {
      router.replace('/(tabs)');
    }
  }, [loading, router, segments, session]);

  if (loading) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#2D6CF6" />
        <Text style={loadingStyles.text}>Laddar...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
    gap: 12,
  },
  text: {
    fontSize: 14,
    color: '#5A6785',
    fontWeight: '500',
  },
});

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { hydrating, derived } = useAppData();
  const segments = useSegments();
  const searchParams = useGlobalSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || hydrating || !session) {
      return;
    }
    const rootSegment = segments[0];
    const childSegment = segments[1];
    const inOnboarding = rootSegment === '(onboarding)';
    const needsOnboarding =
      derived.canManageOnboardingAny && !derived.onboardingComplete;
    const isJoinRoute = inOnboarding && childSegment === 'join';
    const nextRoute = '/(onboarding)/setup';
    const fromOnboardingRaw = searchParams.fromOnboarding;
    const fromOnboarding = Array.isArray(fromOnboardingRaw)
      ? fromOnboardingRaw[0]
      : fromOnboardingRaw;
    const allowCalendar =
      rootSegment === '(tabs)' && childSegment === 'calendar' && fromOnboarding === '1';

    if (needsOnboarding && !inOnboarding) {
      if (allowCalendar) {
        return;
      }
      router.replace(nextRoute);
      return;
    }

    if (inOnboarding && !derived.canManageOnboardingAny && !isJoinRoute) {
      router.replace('/(tabs)');
    }
  }, [
    loading,
    hydrating,
    session,
    segments,
    router,
    derived.canManageOnboardingAny,
    derived.onboardingComplete,
    searchParams.fromOnboarding,
  ]);

  return <>{children}</>;
}
