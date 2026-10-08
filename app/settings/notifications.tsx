import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import { formatShortDate } from '@/lib/time';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { requestPermission, getPermissionStatus, registerPushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

const palette = theme.colors;

type NotificationPrefs = {
  messages: boolean;
  assignments: boolean;
  feed: boolean;
  reminders: boolean;
};

const defaultPrefs: NotificationPrefs = {
  messages: true,
  assignments: true,
  feed: true,
  reminders: true,
};

type PreferenceScope = { userId: string | undefined };
type PreferenceView = {
  scope: PreferenceScope;
  prefs: NotificationPrefs;
  status: 'loading' | 'ready' | 'saving' | 'load-error' | 'uncertain';
  error: string | null;
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state, derived } = useAppData();
  const { currentStableId } = state;
  const isDesktopWeb = useIsDesktopWeb();

  const [permissionStatus, setPermissionStatus] = React.useState<string>('undetermined');
  const userId = user?.id;
  const preferenceScope = React.useMemo(() => ({ userId }), [userId]);
  const currentScopeRef = React.useRef<PreferenceScope | null>(preferenceScope);
  currentScopeRef.current = preferenceScope;
  const preferenceViewRef = React.useRef<PreferenceView | null>(null);
  const loadAttemptRef = React.useRef<object | null>(null);
  const saveAttemptRef = React.useRef<object | null>(null);
  const permissionCheckRef = React.useRef<object | null>(null);
  const permissionAttemptRef = React.useRef<object | null>(null);
  const [preferenceView, setPreferenceView] = React.useState<PreferenceView | null>(null);
  const [loadRevision, setLoadRevision] = React.useState(0);
  const [permissionError, setPermissionError] = React.useState<{
    scope: PreferenceScope;
    message: string;
  } | null>(null);
  const currentPreferenceView = preferenceView?.scope === preferenceScope ? preferenceView : null;
  const prefs = currentPreferenceView?.prefs ?? defaultPrefs;
  const loadingPrefs = !currentPreferenceView || currentPreferenceView.status !== 'ready';
  const publishPreferences = React.useCallback((view: PreferenceView) => {
    preferenceViewRef.current = view;
    setPreferenceView(view);
  }, []);

  // Check permission status
  React.useEffect(() => {
    let active = true;
    const check = {};
    permissionCheckRef.current = check;
    setPermissionStatus('undetermined');
    getPermissionStatus().then(status => {
      if (active && currentScopeRef.current === preferenceScope && permissionCheckRef.current === check) {
        setPermissionStatus(status);
      }
    }).catch(() => {});
    return () => {
      active = false;
      if (permissionCheckRef.current === check) permissionCheckRef.current = null;
    };
  }, [preferenceScope]);

  React.useEffect(() => {
    currentScopeRef.current = preferenceScope;
    saveAttemptRef.current = null;
    permissionAttemptRef.current = null;
    return () => {
      if (currentScopeRef.current === preferenceScope) {
        currentScopeRef.current = null;
        saveAttemptRef.current = null;
        permissionAttemptRef.current = null;
      }
    };
  }, [preferenceScope]);

  // Load saved preferences
  React.useEffect(() => {
    let active = true;
    const attempt = {};
    loadAttemptRef.current = attempt;
    publishPreferences({ scope: preferenceScope, prefs: defaultPrefs, status: 'loading', error: null });
    const isCurrent = () => active && currentScopeRef.current === preferenceScope
      && loadAttemptRef.current === attempt;
    const fail = () => {
      if (!isCurrent()) return;
      console.warn('[notification preferences] Kunde inte läsa notisinställningar', 'load_failed');
      publishPreferences({ scope: preferenceScope, prefs: defaultPrefs, status: 'load-error',
        error: 'Kunde inte läsa notisinställningarna. Läs in dem igen innan du gör ändringar.' });
    };
    if (preferenceScope.userId) {
      void (async () => {
        try {
          const { data, error } = await supabase.from('notification_preferences')
            .select('messages,assignments,feed,reminders')
            .eq('user_id', preferenceScope.userId).maybeSingle();
          if (!isCurrent()) return;
          if (error || (data !== null && !(['messages', 'assignments', 'feed', 'reminders'] as const)
            .every(key => typeof data?.[key] === 'boolean'))) { fail(); return; }
          publishPreferences({ scope: preferenceScope, status: 'ready', error: null,
            prefs: data ? {
              messages: data.messages,
              assignments: data.assignments,
              feed: data.feed,
              reminders: data.reminders,
            } : defaultPrefs });
        } catch {
          fail();
        }
      })();
    }
    return () => {
      active = false;
      if (loadAttemptRef.current === attempt) loadAttemptRef.current = null;
    };
  }, [preferenceScope, loadRevision, publishPreferences]);

  const handleReloadPreferences = React.useCallback(() => {
    if (currentScopeRef.current !== preferenceScope || !preferenceScope.userId
      || preferenceViewRef.current?.status === 'saving') return;
    loadAttemptRef.current = null;
    publishPreferences({ scope: preferenceScope, prefs: defaultPrefs, status: 'loading', error: null });
    setLoadRevision(value => value + 1);
  }, [preferenceScope, publishPreferences]);

  const handleRequestPermission = React.useCallback(async () => {
    if (currentScopeRef.current !== preferenceScope || !preferenceScope.userId
      || permissionStatus === 'simulator' || Platform.OS === 'web' || permissionAttemptRef.current) return;
    const attempt = {};
    permissionCheckRef.current = null;
    permissionAttemptRef.current = attempt;
    const isCurrent = () => currentScopeRef.current === preferenceScope
      && permissionAttemptRef.current === attempt;
    try {
      const granted = await requestPermission();
      if (!isCurrent()) return;
      setPermissionStatus(granted ? 'granted' : 'denied');
      setPermissionError(null);
      if (granted) {
        const registered = await registerPushToken(preferenceScope.userId);
        if (!isCurrent()) return;
        if (!registered) setPermissionError({ scope: preferenceScope,
          message: 'Notisbehörigheten är aktiverad, men enheten kunde inte registreras. Försök igen.' });
      }
    } catch {
      if (!isCurrent()) return;
      console.warn('[push permission] Kunde inte aktivera push-notiser', 'activation_failed');
      setPermissionError({ scope: preferenceScope, message: 'Kunde inte aktivera push-notiser. Försök igen.' });
    } finally {
      if (permissionAttemptRef.current === attempt) permissionAttemptRef.current = null;
    }
  }, [preferenceScope, permissionStatus]);

  const handleToggle = React.useCallback(
    async (key: keyof NotificationPrefs) => {
      const confirmed = preferenceViewRef.current;
      if (currentScopeRef.current !== preferenceScope || !preferenceScope.userId
        || confirmed?.scope !== preferenceScope || confirmed.status !== 'ready' || saveAttemptRef.current) return;
      const prev = confirmed.prefs;
      const next = { ...prev, [key]: !prev[key] };
      const attempt = {};
      saveAttemptRef.current = attempt;
      publishPreferences({ scope: preferenceScope, prefs: next, status: 'saving', error: null });
      const isCurrent = () => currentScopeRef.current === preferenceScope && saveAttemptRef.current === attempt;
      const fail = (uncertain: boolean) => {
        if (!isCurrent()) return;
        console.warn('[notification preferences] Kunde inte spara notisinställningar',
          uncertain ? 'save_uncertain' : 'save_failed');
        publishPreferences({ scope: preferenceScope, prefs: prev, status: uncertain ? 'uncertain' : 'ready',
          error: uncertain
            ? 'Det gick inte att bekräfta sparningen. Läs in inställningarna igen innan du ändrar fler.'
            : 'Kunde inte spara notisinställningarna. Dina tidigare inställningar gäller. Försök igen.' });
      };
      try {
        const { data, error, status } = await supabase.from('notification_preferences').upsert(
          { user_id: preferenceScope.userId, ...next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        if (!isCurrent()) return;
        const acknowledged = error === null && data === null && Number.isInteger(status)
          && status >= 200 && status < 300;
        if (!acknowledged) {
          const rejected = error && Number.isInteger(status) && status >= 400 && status < 500
            && status !== 408 && typeof error.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code);
          fail(!rejected);
          return;
        }
        publishPreferences({ scope: preferenceScope, prefs: next, status: 'ready', error: null });
      } catch {
        fail(true);
      } finally {
        if (saveAttemptRef.current === attempt) saveAttemptRef.current = null;
      }
    },
    [preferenceScope, publishPreferences],
  );

  const missedAssignments = React.useMemo(
    () => derived.getMissedAssignmentsForStable(currentStableId),
    [derived, currentStableId],
  );
  const missedPreview = React.useMemo(() => missedAssignments.slice(0, 5), [missedAssignments]);
  const handleOpenCalendar = React.useCallback(() => {
    router.push('/calendar?view=all');
  }, [router]);

  const isWeb = Platform.OS === 'web';
  const needsPermission = !isWeb && permissionStatus !== 'granted';

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Notiser"
          showSearch={false}
          left={
            <HeaderIconButton accessibilityLabel="Tillbaka" onPress={() => router.back()}>
              <Feather name="chevron-left" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]}
          showsVerticalScrollIndicator={false}
        >
          {/* Permission banner */}
          {needsPermission && (
            <Card tone="muted" style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>Push-notiser är avstängda</Text>
              <Text style={styles.permissionBody}>
                {permissionStatus === 'denied'
                  ? 'Du har nekat push-notiser. Aktivera dem i enhetens inställningar.'
                  : permissionStatus === 'simulator'
                  ? 'Push-notiser fungerar inte i simulator.'
                  : 'Aktivera push-notiser för meddelanden, tilldelade pass och viktiga stallnotiser.'}
              </Text>
              {permissionStatus !== 'denied' && permissionStatus !== 'simulator' && userId && (
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={handleRequestPermission}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Aktivera push-notiser"
                >
                  <Text style={styles.permissionButtonText}>Aktivera notiser</Text>
                </TouchableOpacity>
              )}
            </Card>
          )}

          {/* Notification toggles */}
          {!isWeb && (
            <Card tone="muted" style={styles.toggleCard}>
              <Text style={styles.sectionTitle}>Notistyper</Text>
              {userId && (!currentPreferenceView || currentPreferenceView.status === 'loading') && (
                <Text style={styles.toggleDescription}>Läser notisinställningar…</Text>
              )}
              {permissionError?.scope === preferenceScope && (
                <View style={styles.permissionCard}>
                  <Text style={styles.permissionBody} accessibilityRole="alert">{permissionError.message}</Text>
                  <TouchableOpacity style={styles.permissionButton} onPress={handleRequestPermission}
                    accessibilityRole="button" accessibilityLabel="Försök registrera igen">
                    <Text style={styles.permissionButtonText}>Försök registrera igen</Text>
                  </TouchableOpacity>
                </View>
              )}
              {currentPreferenceView?.error && (
                <View style={styles.permissionCard}>
                  <Text style={styles.permissionBody} accessibilityRole="alert">{currentPreferenceView.error}</Text>
                  {(currentPreferenceView.status === 'load-error' || currentPreferenceView.status === 'uncertain') && (
                    <TouchableOpacity style={styles.permissionButton} onPress={handleReloadPreferences}
                      accessibilityRole="button" accessibilityLabel="Läs in igen">
                      <Text style={styles.permissionButtonText}>Läs in igen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <ToggleRow
                label="Meddelanden"
                description="Nya chattmeddelanden"
                value={prefs.messages}
                onToggle={() => handleToggle('messages')}
                disabled={loadingPrefs || needsPermission}
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Schemaändringar"
                description="Ändringar i dina tilldelade pass"
                value={prefs.assignments}
                onToggle={() => handleToggle('assignments')}
                disabled={loadingPrefs || needsPermission}
              />
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>Flödet</Text>
                  <Text style={styles.toggleDescription}>
                    Vanliga inlägg visas i flödet. De skickar inga push-notiser.
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <ToggleRow
                label="Viktiga stallnotiser"
                description="Viktiga och akuta händelser i stallet"
                value={prefs.reminders}
                onToggle={() => handleToggle('reminders')}
                disabled={loadingPrefs || needsPermission}
              />
            </Card>
          )}

          {isWeb && (
            <Card tone="muted" style={styles.card}>
              <Text style={styles.title}>Push-notiser</Text>
              <Text style={styles.body}>
                Push-notiser för meddelanden, tilldelade pass och viktiga stallnotiser används i
                telefonappen. Vanliga flödesinlägg skickar inga push-notiser.
              </Text>
            </Card>
          )}

          {/* Missed assignments */}
          <Card tone="muted" style={styles.missedCard}>
            <View style={styles.missedHeader}>
              <Text style={styles.missedTitle}>Missade pass</Text>
              <Text style={styles.missedMeta}>{`${missedAssignments.length} totalt`}</Text>
            </View>
            {missedPreview.length ? (
              <View style={styles.missedList}>
                {missedPreview.map((assignment) => {
                  const endTime = derived.getAssignmentEndTime(assignment);
                  const timeLabel = endTime ? `${assignment.time}–${endTime}` : assignment.time;
                  return (
                    <View key={assignment.id} style={styles.missedRow}>
                      <View style={styles.missedDot} />
                      <View style={styles.missedBody}>
                        <Text style={styles.missedLabel} numberOfLines={1}>
                          {assignment.label}
                        </Text>
                        <Text style={styles.missedTime}>
                          {formatShortDate(assignment.date)} · {timeLabel}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.missedEmpty}>Inga missade pass just nu.</Text>
            )}
            <TouchableOpacity style={styles.missedAction} onPress={handleOpenCalendar}>
              <Text style={styles.missedActionText}>Öppna kalendern</Text>
            </TouchableOpacity>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: palette.border, true: palette.primary }}
        thumbColor={palette.inverseText}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  scrollContentDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
  },
  permissionCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: 'rgba(226, 152, 51, 0.12)',
    gap: 10,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.warning,
  },
  permissionBody: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.warning,
  },
  permissionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  permissionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.inverseText,
  },
  toggleCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toggleText: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  toggleLabelDisabled: {
    opacity: 0.5,
  },
  toggleDescription: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  missedCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
    gap: 12,
  },
  missedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  missedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  missedMeta: {
    fontSize: 12,
    color: palette.secondaryText,
    fontWeight: '600',
  },
  missedList: {
    gap: 10,
  },
  missedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  missedDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: palette.warning,
  },
  missedBody: {
    flex: 1,
    gap: 2,
  },
  missedLabel: {
    fontSize: 13,
    color: palette.primaryText,
    fontWeight: '500',
  },
  missedTime: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  missedEmpty: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  missedAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  missedActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
});
