import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
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
