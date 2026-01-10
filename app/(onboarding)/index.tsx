import React from 'react';
import { useRouter } from 'expo-router';

export default function OnboardingStart() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/(onboarding)/setup');
  }, [router]);

  return null;
}
