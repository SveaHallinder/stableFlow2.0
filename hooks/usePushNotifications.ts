import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerPushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

let failedRegistrationUserId: string | undefined;
let registrationAttempt: { userId: string } | null = null;
const registrationListeners = new Set<() => void>();

function publishRegistrationFailure(userId: string | undefined) {
  if (failedRegistrationUserId === userId) return;
  failedRegistrationUserId = userId;
  registrationListeners.forEach(listener => listener());
}

export function hasPushRegistrationFailure(userId: string | undefined): boolean {
  return Boolean(userId && failedRegistrationUserId === userId);
}

export function subscribePushRegistrationFailure(listener: () => void): () => void {
  registrationListeners.add(listener);
  return () => { registrationListeners.delete(listener); };
}

export function clearPushRegistrationFailure(userId: string | undefined) {
  if (!userId) return;
  if (registrationAttempt?.userId === userId) registrationAttempt = null;
  if (failedRegistrationUserId === userId) publishRegistrationFailure(undefined);
}

function notificationResponseKey(response: Notifications.NotificationResponse): string | undefined {
  const id = response.notification.request.identifier;
  return typeof id === 'string' && id ? `${id}:${response.actionIdentifier}` : undefined;
}

/**
 * Registers the device push token when a user is authenticated,
 * and handles notification tap deep-linking.
 */
export function usePushNotifications(userId: string | undefined, ready = true) {
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const handledResponses = useRef(new Set<string>());
  const pendingResponses = useRef(new Map<string, object>());
  const responseScopes = useRef(new Map<string, { userId: string | undefined }>());
  const responseSequence = useRef(0);
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
      const attempt = { userId: scope.userId };
      registrationAttempt = attempt;
      publishRegistrationFailure(undefined);
      void (async () => {
        try {
          const registered = await registerPushToken(attempt.userId, isCurrent);
          if (isCurrent() && registrationAttempt === attempt) {
            if (registered) clearPushRegistrationFailure(attempt.userId);
            else publishRegistrationFailure(attempt.userId);
          }
        } catch {
          if (isCurrent() && registrationAttempt === attempt) {
            publishRegistrationFailure(attempt.userId);
            console.warn('[push registration] Kunde inte registrera enheten', 'registration_failed');
          }
        }
      })();
    }
    return () => {
      active = false;
      if (registrationAttempt?.userId === scope.userId) clearPushRegistrationFailure(scope.userId);
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [scope]);

  // Handle notification taps for deep-linking
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;

    let active = true;
    const isCurrent = () => active && currentScope.current === scope;
    const responseAttempt = {};
    const clearConsumedResponse = (key: string | undefined) => {
      if (!key || !isCurrent()) return;
      try {
        const last = Notifications.getLastNotificationResponse();
        if (last && notificationResponseKey(last) === key) Notifications.clearLastNotificationResponse();
      } catch {
        console.warn('[push notification] Kunde inte kvittera notistrycket', 'response_cleanup_failed');
      }
    };
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as
        | Record<string, string>
        | undefined;
      if (!isCurrent() || !scope.userId) return;
      const key = notificationResponseKey(response);
      const recipientUserId = data?.recipientUserId;
      const screen = data?.screen;
      const chatId = data?.chatId;
      if (key && handledResponses.current.has(key)) { clearConsumedResponse(key); return; }
      if (!screen || (key && pendingResponses.current.get(key) === responseAttempt)) return;
      if (key && recipientUserId === scope.userId) {
        const firstScope = responseScopes.current.get(key);
        // A response first received for an earlier account epoch must not be
        // resurrected by an A/B/A transition. StrictMode retains the same scope.
        if (firstScope && firstScope !== scope) {
          handledResponses.current.add(key);
          responseScopes.current.delete(key);
          clearConsumedResponse(key);
          return;
        }
        responseScopes.current.set(key, scope);
      }
      const sequence = ++responseSequence.current;
      if (key) pendingResponses.current.set(key, responseAttempt);
      try {
        const { data: session, error } = await supabase.auth.getSession();
        if (!isCurrent() || error || session.session?.user?.id !== scope.userId) return;
        if (key && handledResponses.current.has(key)) return;
        if (sequence !== responseSequence.current || recipientUserId !== scope.userId) {
          if (key) { handledResponses.current.add(key); responseScopes.current.delete(key); }
          clearConsumedResponse(key);
          return;
        }
        switch (screen) {
          case 'messages':
            router.push('/messages');
            break;
          case 'home':
            router.push('/');
            break;
          case 'chat':
            if (chatId && /^[a-zA-Z0-9_-]+$/.test(chatId)) {
              router.push(`/chat/${chatId}`);
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
        if (key) { handledResponses.current.add(key); responseScopes.current.delete(key); }
        clearConsumedResponse(key);
      } catch {
        if (isCurrent()) console.warn('[push notification] Kunde inte öppna notisen', 'routing_failed');
      } finally {
        if (key && pendingResponses.current.get(key) === responseAttempt) pendingResponses.current.delete(key);
      }
    };
    const listener = Notifications.addNotificationResponseReceivedListener(handleResponse);
    responseListener.current = listener;
    if (scope.userId) {
      try {
        const initialResponse = Notifications.getLastNotificationResponse();
        if (initialResponse) void handleResponse(initialResponse);
      } catch {
        console.warn('[push notification] Kunde inte läsa notistrycket vid start', 'initial_response_failed');
      }
    }

    return () => {
      active = false;
      listener.remove();
      if (responseListener.current === listener) responseListener.current = null;
    };
  }, [scope, ready]);
}
