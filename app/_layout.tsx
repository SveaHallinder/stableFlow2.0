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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#3E9B5F',
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
  const { session, loading, initializationError, retryInitialization } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || initializationError) {
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
  }, [loading, initializationError, router, segments, session]);

  if (loading) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#3E9B5F" />
        <Text style={loadingStyles.text}>Laddar...</Text>
      </View>
    );
  }

  if (initializationError) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.title}>Kunde inte ansluta</Text>
        <Text style={errorStyles.body}>{initializationError}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={errorStyles.button}
          onPress={retryInitialization}
        >
          <Text style={errorStyles.buttonText}>Försök igen</Text>
        </TouchableOpacity>
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
    backgroundColor: '#FFFFFF',
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
  const { hydrating, refreshing, derived, refreshError, state, actions } = useAppData();
  const segments = useSegments();
  const searchParams = useGlobalSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || hydrating || refreshing || refreshError || !session) {
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
    refreshing,
    refreshError,
    session,
    segments,
    router,
    derived.canManageOnboardingAny,
    derived.onboardingComplete,
    searchParams.fromOnboarding,
  ]);

  if (session && refreshError && !state.currentStableId) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.title}>Kunde inte hämta stallet</Text>
        <Text style={errorStyles.body}>{refreshError}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: hydrating || refreshing }}
          disabled={hydrating || refreshing}
          style={errorStyles.button}
          onPress={() => { void actions.refreshData(); }}
        >
          <Text style={errorStyles.buttonText}>{hydrating || refreshing ? 'Försöker igen…' : 'Försök igen'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const waitingForStable = Boolean(session && hydrating && !state.currentUserId);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents={waitingForStable ? 'none' : 'auto'}>{children}</View>
      {waitingForStable && (
        <View style={[StyleSheet.absoluteFillObject, loadingStyles.container]}>
          <ActivityIndicator size="large" color="#3E9B5F" />
          <Text style={loadingStyles.text}>Hämtar ditt stall…</Text>
        </View>
      )}
    </View>
  );
}
