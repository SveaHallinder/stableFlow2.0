import React from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearDeletedAccountSession, markDeletedAccountSession, supabase } from '@/lib/supabase';
import { deregisterPushToken } from '@/lib/notifications';
import { createQaDemoSession, isQaDemoMode } from '@/lib/qaDemo';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initializationError: string | null;
  retryInitialization: () => void;
  signOut: () => Promise<void>;
  finishAccountDeletion: (userId: string) => Promise<boolean>;
  pendingAccountDeletionId: string | null;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [initializationError, setInitializationError] = React.useState<string | null>(null);
  const [initializationAttempt, setInitializationAttempt] = React.useState(0);
  const [pendingAccountDeletionId, setPendingAccountDeletionId] = React.useState<string | null>(null);
  const deletedAccountIdsRef = React.useRef(new Set<string>());
  const pendingDeletedAccountRef = React.useRef<string | null>(null);
  const activeUserIdRef = React.useRef<string | null>(null);

  const retryInitialization = React.useCallback(() => {
    setInitializationAttempt((attempt) => attempt + 1);
  }, []);

  React.useEffect(() => {
    if (isQaDemoMode) {
      const demoSession = createQaDemoSession();
      activeUserIdRef.current = demoSession.user.id;
      setSession(demoSession);
      setLoading(false);
      return;
    }

    let mounted = true;
    let settled = false;
    setLoading(true);
    setInitializationError(null);
    const failInitialization = (error: unknown) => {
      if (!mounted || settled) return;
      settled = true;
      clearTimeout(timeout);
      console.warn(
        '[auth initialize] Kunde inte läsa session:',
        error instanceof Error ? error.message : 'Okänt fel',
      );
      setInitializationError(
        'Vi kunde inte kontrollera din inloggning. Kontrollera internetanslutningen och försök igen.',
      );
      setLoading(false);
    };
    const timeout = setTimeout(() => {
      failInitialization(new Error('Sessionskontrollen tog för lång tid.'));
    }, 10_000);

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted || settled) return;
        settled = true;
        clearTimeout(timeout);
        const nextSession = data?.session ?? null;
        const retired = nextSession?.user?.id && deletedAccountIdsRef.current.has(nextSession.user.id);
        if (!retired && !pendingDeletedAccountRef.current) {
          activeUserIdRef.current = nextSession?.user?.id ?? null;
          setSession(nextSession);
        }
        setInitializationError(null);
        setLoading(false);
      } catch (error) {
        failInitialization(error);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession?.user?.id && deletedAccountIdsRef.current.has(nextSession.user.id)) return;
      // A failed local cleanup remains visible until its persistent removal is
      // verified; an SDK refresh must not route away from that recovery state.
      if (pendingDeletedAccountRef.current && !nextSession) return;
      // INITIAL_SESSION can contain null when the SDK failed to read storage.
      // getSession must confirm unauthenticated startup; valid sessions and real
      // auth events can recover immediately.
      if (!mounted || (event === 'INITIAL_SESSION' && !nextSession)) return;
      if (nextSession?.user?.id && pendingDeletedAccountRef.current !== nextSession.user.id) {
        pendingDeletedAccountRef.current = null;
        setPendingAccountDeletionId(null);
      }
      settled = true;
      clearTimeout(timeout);
      activeUserIdRef.current = nextSession?.user?.id ?? null;
      setSession(nextSession);
      setInitializationError(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, [initializationAttempt]);

  const signOut = React.useCallback(async () => {
    if (isQaDemoMode) {
      setSession(null);
      return;
    }

    const userId = session?.user?.id;
    if (userId) {
      try {
        await deregisterPushToken(userId);
      } catch {
        // Push token cleanup is best-effort
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Force clear local session even if server signout fails
      setSession(null);
      throw error;
    }
  }, [session?.user?.id]);

  const finishAccountDeletion = React.useCallback(async (userId: string) => {
    deletedAccountIdsRef.current.add(userId);
    markDeletedAccountSession(userId);
    if (activeUserIdRef.current && activeUserIdRef.current !== userId) return false;
    pendingDeletedAccountRef.current = userId;
    setPendingAccountDeletionId(userId);
    const cleared = isQaDemoMode || await clearDeletedAccountSession(userId);
    if (pendingDeletedAccountRef.current === userId) {
      pendingDeletedAccountRef.current = null;
      setPendingAccountDeletionId(null);
    }
    if (!cleared || (activeUserIdRef.current && activeUserIdRef.current !== userId)) return false;
    activeUserIdRef.current = null;
    setSession(previous => previous?.user?.id === userId ? null : previous);
    return true;
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      initializationError,
      retryInitialization,
      signOut,
      finishAccountDeletion,
      pendingAccountDeletionId,
    }),
    [session, loading, initializationError, retryInitialization, signOut, finishAccountDeletion, pendingAccountDeletionId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
