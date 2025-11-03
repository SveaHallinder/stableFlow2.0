import { Stack } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import React from 'react';
import { AppDataProvider } from '@/context/AppDataContext';
import { ToastProvider } from '@/components/ToastProvider';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ToastProvider>
      <AppDataProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="+not-found" />
        </Stack>
      </AppDataProvider>
    </ToastProvider>
  );
}
