import { Stack, useRouter, useSegments } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import React from 'react';
import { AppDataProvider, useAppData } from '@/context/AppDataContext';
import { ToastProvider } from '@/components/ToastProvider';
import { AuthProvider, useAuth } from '@/context/AuthContext';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
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
  );
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
    return null;
  }

  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { state, hydrating, derived } = useAppData();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || hydrating || !session) {
      return;
    }
    const rootSegment = segments[0];
    const inOnboarding = rootSegment === '(onboarding)';
    const currentUser = state.users[state.currentUserId];
    const needsOnboarding =
      derived.canManageOnboardingAny && !currentUser?.onboardingDismissed;

    if (needsOnboarding && !inOnboarding) {
      router.replace('/(onboarding)');
    }
  }, [
    loading,
    hydrating,
    session,
    segments,
    router,
    state.currentUserId,
    state.users,
    derived.canManageOnboardingAny,
  ]);

  return <>{children}</>;
}
