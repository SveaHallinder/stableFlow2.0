import React from 'react';

type OnboardingContextValue = {
  hasFarm: boolean | null;
  setHasFarm: (value: boolean | null) => void;
  mode: 'guided' | 'quick';
  setMode: (value: 'guided' | 'quick') => void;
};

const OnboardingContext = React.createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasFarm, setHasFarmState] = React.useState<boolean | null>(null);
  const [mode, setModeState] = React.useState<'guided' | 'quick'>('guided');

  const setHasFarm = React.useCallback((value: boolean | null) => {
    setHasFarmState(value);
  }, []);
  const setMode = React.useCallback((value: 'guided' | 'quick') => {
    setModeState(value);
  }, []);

  const value = React.useMemo(
    () => ({
      hasFarm,
      setHasFarm,
      mode,
      setMode,
    }),
    [hasFarm, mode, setHasFarm, setMode],
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
