import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';

export default function OnboardingLayout() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { hydrating, derived } = useAppData();
  const canManageOnboarding = derived.canManageOnboardingAny;

  React.useEffect(() => {
    if (loading || hydrating || !session) {
      return;
    }
    if (!canManageOnboarding) {
      router.replace('/');
    }
  }, [canManageOnboarding, hydrating, loading, router, session]);

  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingProvider>
  );
}
