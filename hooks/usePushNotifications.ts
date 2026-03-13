import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerPushToken } from '@/lib/notifications';

/**
 * Registers the device push token when a user is authenticated,
 * and handles notification tap deep-linking.
 */
export function usePushNotifications(userId: string | undefined) {
  const responseListener = useRef<EventSubscription | null>(null);

  // Register token whenever userId changes (login)
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    registerPushToken(userId);
  }, [userId]);

  // Handle notification taps for deep-linking
  useEffect(() => {
    if (Platform.OS === 'web') return;

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        if (!data?.screen) return;

        switch (data.screen) {
          case 'chat':
            if (data.chatId && /^[a-zA-Z0-9_-]+$/.test(data.chatId)) {
              router.push(`/chat/${data.chatId}`);
            }
            break;
          case 'calendar':
            router.push('/calendar');
            break;
          case 'feed':
            router.push('/feed');
            break;
          default:
            break;
        }
      });

    return () => {
      responseListener.current?.remove();
    };
  }, []);
}
