import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerPushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

/**
 * Registers the device push token when a user is authenticated,
 * and handles notification tap deep-linking.
 */
export function usePushNotifications(userId: string | undefined) {
  const responseListener = useRef<EventSubscription | null>(null);
  const scope = useMemo(() => ({ userId }), [userId]);
  const currentScope = useRef<typeof scope | null>(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
    return () => {
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [scope]);

  // Register token whenever userId changes (login)
  useEffect(() => {
    let active = true;
    currentScope.current = scope;
    const isCurrent = () => active && currentScope.current === scope;
    if (scope.userId && Platform.OS !== 'web') {
      void registerPushToken(scope.userId, isCurrent).catch(() => {
        if (isCurrent()) console.warn('[push registration] Kunde inte registrera enheten', 'registration_failed');
      });
    }
    return () => {
      active = false;
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [scope]);

  // Handle notification taps for deep-linking
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    const isCurrent = () => active && currentScope.current === scope;
    const listener = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as
        | Record<string, string>
        | undefined;
      if (!isCurrent() || !scope.userId || data?.recipientUserId !== scope.userId || !data?.screen) return;
      try {
        const { data: session, error } = await supabase.auth.getSession();
        if (!isCurrent() || error || session.session?.user?.id !== scope.userId) return;
        switch (data.screen) {
          case 'messages':
            router.push('/messages');
            break;
          case 'home':
            router.push('/');
            break;
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
      } catch {
        if (isCurrent()) console.warn('[push notification] Kunde inte öppna notisen', 'routing_failed');
      }
    });
    responseListener.current = listener;

    return () => {
      active = false;
      listener.remove();
      if (responseListener.current === listener) responseListener.current = null;
    };
  }, [scope]);
}
