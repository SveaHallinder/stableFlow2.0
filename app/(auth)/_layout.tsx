import React from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AuthLayout() {
  const { loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
