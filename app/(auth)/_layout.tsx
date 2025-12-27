import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAppData } from '@/context/AppDataContext';

export default function AuthLayout() {
  const { state } = useAppData();

  if (state.sessionUserId) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
