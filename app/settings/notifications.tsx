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
import { requestPermission, getPermissionStatus } from '@/lib/notifications';
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

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state, derived } = useAppData();
  const { currentStableId } = state;
  const isDesktopWeb = useIsDesktopWeb();

  const [permissionStatus, setPermissionStatus] = React.useState<string>('undetermined');
  const [prefs, setPrefs] = React.useState<NotificationPrefs>(defaultPrefs);
  const [loadingPrefs, setLoadingPrefs] = React.useState(true);

  // Check permission status
  React.useEffect(() => {
    getPermissionStatus().then(setPermissionStatus).catch(() => {});
  }, []);

  // Load saved preferences
  React.useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('notification_preferences')
      .select('messages,assignments,feed,reminders')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            messages: data.messages ?? true,
            assignments: data.assignments ?? true,
            feed: data.feed ?? true,
            reminders: data.reminders ?? true,
          });
        }
        setLoadingPrefs(false);
      })
      .then(undefined, () => setLoadingPrefs(false));
  }, [user?.id]);

  const handleRequestPermission = React.useCallback(async () => {
    const granted = await requestPermission();
    setPermissionStatus(granted ? 'granted' : 'denied');
  }, []);

  const handleToggle = React.useCallback(
    async (key: keyof NotificationPrefs) => {
      if (!user?.id) return;
      const prev = prefs;
      const next = { ...prefs, [key]: !prefs[key] };
      setPrefs(next);
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: user.id,
          ...next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) setPrefs(prev);
    },
    [user?.id, prefs],
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
                  : 'Aktivera push-notiser för att få påminnelser om pass, meddelanden och uppdateringar.'}
              </Text>
              {permissionStatus !== 'denied' && (
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
              <ToggleRow
                label="Flödet"
                description="Nya inlägg i stallet"
                value={prefs.feed}
                onToggle={() => handleToggle('feed')}
                disabled={loadingPrefs || needsPermission}
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Påminnelser"
                description="Påminnelse innan ditt pass börjar"
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
                Push-notiser är tillgängliga i appen. Ladda ner StableFlow på din telefon för att
                aktivera dem.
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
        thumbColor="#FFFFFF"
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
    backgroundColor: '#FFF3E0',
    gap: 10,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
  },
  permissionBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#BF360C',
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
    color: '#FFFFFF',
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
