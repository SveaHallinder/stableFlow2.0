import React from 'react';
import {
  ActivityIndicator, Image, ImageSourcePropType, ImageStyle, StyleProp, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAppData } from '@/context/AppDataContext';
import { supabase } from '@/lib/supabase';
import { getPrivateImageUrl, parsePrivateImageReference } from '@/lib/privateImages';
import { theme } from '@/components/theme';

type Props = {
  source?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  accessibilityLabel?: string;
  fallbackSource?: ImageSourcePropType;
  compact?: boolean;
};

export function PrivateImage({ source, style, resizeMode, accessibilityLabel,
  fallbackSource, compact = false }: Props) {
  const { user, loading, pendingAccountDeletionId } = useAuth();
  const { state } = useAppData();
  const [attempt, setAttempt] = React.useState(0);
  const [session, setSession] = React.useState<{ userId: string | null }>({ userId: null });
  const sessionRef = React.useRef(session);
  const [lifetime, setLifetime] = React.useState<object | null>(null);
  const lifetimeRef = React.useRef(lifetime);
  const mountedRef = React.useRef(false);
  const sourceKey = JSON.stringify(source ?? null);
  const inputSource = React.useMemo(() => JSON.parse(sourceKey) ?? undefined, [sourceKey]) as ImageSourcePropType | undefined;
  const userId = user?.id;
  const { currentStableId, currentUserId, sessionUserId } = state;
  const scope = React.useMemo(() => ({ sourceKey, userId, loading, session, lifetime, attempt,
    currentStableId, currentUserId, sessionUserId, pendingAccountDeletionId }),
  [sourceKey, userId, loading, session, lifetime, attempt, currentStableId, currentUserId, sessionUserId, pendingAccountDeletionId]);
  const [imageEpoch, setImageEpoch] = React.useState(0);
  React.useLayoutEffect(() => { setImageEpoch((value) => value + 1); }, [scope]);
  const scopeRef = React.useRef(scope);
  React.useLayoutEffect(() => { scopeRef.current = scope; }, [scope]);
  const [display, setDisplay] = React.useState<{
    scope: object; status: 'loading' | 'ready' | 'error'; source?: ImageSourcePropType;
  } | null>(null);
  const parsed = React.useMemo(() => {
    try {
      if (Array.isArray(inputSource) && inputSource.some((item) => item.uri && parsePrivateImageReference(item.uri))) {
        return { reference: null, invalid: true };
      }
      const uri = inputSource && typeof inputSource !== 'number' && !Array.isArray(inputSource) ? inputSource.uri : null;
      return { reference: uri ? parsePrivateImageReference(uri) : null, invalid: false };
    } catch {
      return { reference: null, invalid: true };
    }
  }, [inputSource]);

  React.useLayoutEffect(() => {
    let active = true;
    mountedRef.current = true;
    const nextLifetime = {};
    lifetimeRef.current = nextLifetime;
    setLifetime(nextLifetime);
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active || !mountedRef.current) return;
      const nextId = nextSession?.user.id ?? null;
      if (sessionRef.current.userId !== nextId) {
        const next = { userId: nextId };
        sessionRef.current = next;
        setSession(next);
      }
    });
    return () => { active = false; mountedRef.current = false; lifetimeRef.current = null; data.subscription.unsubscribe(); };
  }, []);

  React.useEffect(() => {
    let active = true;
    const currentSession = sessionRef.current;
    const isCurrent = () => active && mountedRef.current && scopeRef.current === scope
      && sessionRef.current === currentSession && lifetimeRef.current === lifetime;
    if (parsed.invalid) setDisplay({ scope, status: 'error' });
    else if (!parsed.reference) setDisplay({ scope, status: 'ready', source: inputSource });
    else if (lifetime && !loading && !pendingAccountDeletionId && userId && currentSession.userId === userId
      && currentUserId === userId && sessionUserId === userId) {
      setDisplay({ scope, status: 'loading' });
      void getPrivateImageUrl(parsed.reference, userId, isCurrent).then((url) => {
        if (isCurrent()) setDisplay({ scope, status: url ? 'ready' : 'error', source: url ? { uri: url } : undefined });
      });
    } else setDisplay({ scope, status: loading ? 'loading' : 'error' });
    return () => { active = false; };
  }, [scope, parsed, inputSource, userId, loading, lifetime, pendingAccountDeletionId, currentUserId, sessionUserId]);

  const current = display?.scope === scope ? display : null;
  const status = current?.status ?? (parsed.invalid ? 'error' : parsed.reference ? 'loading' : 'ready');
  const currentSource = current?.source ?? (parsed.reference || parsed.invalid ? undefined : source);
  const isCurrent = () => mountedRef.current && scopeRef.current === scope
    && sessionRef.current === session && lifetimeRef.current === lifetime;
  if (!source) return <Image source={fallbackSource} style={style} accessibilityLabel={accessibilityLabel} />;
  if (status === 'ready' && currentSource) return (
    <Image key={imageEpoch} source={currentSource} style={style} resizeMode={resizeMode} accessibilityLabel={accessibilityLabel}
      onError={() => {
        if (!isCurrent()) return;
        console.warn('[private image] display failed');
        setDisplay({ scope, status: 'error' });
      }} />
  );
  return (
    <View style={[style, styles.placeholder]} accessibilityLabel={status === 'loading' ? 'Hämtar bild' : 'Bilden kunde inte visas'}>
      {fallbackSource ? <Image source={fallbackSource} style={StyleSheet.absoluteFillObject} resizeMode={resizeMode} /> : null}
      {status === 'loading' ? <ActivityIndicator color={theme.colors.mutedText} /> : (
        <>
          {!compact ? <Text style={styles.message}>Bilden kunde inte visas</Text> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Bilden kunde inte visas. Försök igen"
            style={styles.retry} onPress={(event) => { event?.stopPropagation(); if (isCurrent()) setAttempt((value) => value + 1); }}>
            <Feather name="rotate-cw" size={compact ? 12 : 16} color={theme.colors.primaryText} />
            <Text style={[styles.message, compact && styles.compact]}>{compact ? 'Försök' : 'Försök igen'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 },
  message: { color: theme.colors.primaryText, fontSize: 12, textAlign: 'center' },
  retry: { alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: theme.colors.surface, padding: 4, borderRadius: 6 },
  compact: { fontSize: 9 },
});
