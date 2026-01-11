import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
import { formatShortDate } from '@/lib/time';

const palette = theme.colors;

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { state, derived } = useAppData();
  const { currentStableId } = state;
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const missedAssignments = React.useMemo(
    () => derived.getMissedAssignmentsForStable(currentStableId),
    [derived, currentStableId],
  );
  const missedPreview = React.useMemo(() => missedAssignments.slice(0, 5), [missedAssignments]);
  const handleOpenCalendar = React.useCallback(() => {
    router.push('/calendar?view=all');
  }, [router]);

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
          <Card tone="muted" style={styles.card}>
            <Text style={styles.title}>Notiser kommer snart</Text>
            <Text style={styles.body}>
              Här kan du styra push, påminnelser och schema-uppdateringar när vi är klara med
              resten av flödena.
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
  },
  scrollContentDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
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
});
