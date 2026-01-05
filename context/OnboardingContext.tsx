import React from 'react';

type OnboardingContextValue = {
  hasFarm: boolean | null;
  setHasFarm: (value: boolean) => void;
};

const OnboardingContext = React.createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasFarm, setHasFarmState] = React.useState<boolean | null>(null);

  const setHasFarm = React.useCallback((value: boolean) => {
    setHasFarmState(value);
  }, []);

  const value = React.useMemo(
    () => ({
      hasFarm,
      setHasFarm,
    }),
    [hasFarm, setHasFarm],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = React.useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
