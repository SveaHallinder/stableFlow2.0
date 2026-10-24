import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';

export default function OnboardingLayout() {
  const router = useRouter();
  const segments = useSegments();
  const isJoinRoute = segments[1] === 'join';
  const { session, loading } = useAuth();
  const { hydrating, derived } = useAppData();
  const canManageOnboarding = derived.canManageOnboardingAny;

  React.useEffect(() => {
    if (loading || hydrating || !session) {
      return;
    }
    if (!canManageOnboarding && !isJoinRoute) {
      router.replace('/');
    }
  }, [canManageOnboarding, hydrating, isJoinRoute, loading, router, session]);

  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingProvider>
  );
}
