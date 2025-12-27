import React from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { color, radius } from '@/design/tokens';
import { surfacePresets, systemPalette } from '@/design/system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Pill } from '@/components/Primitives';
import { StableSwitcher } from '@/components/StableSwitcher';
import { UserSwitchModal } from '@/components/UserSwitchModal';
import { useAppData } from '@/context/AppDataContext';
import type {
  Assignment,
  AssignmentSlot,
  AssignmentStatus,
  DefaultPass,
  UserProfile,
  WeekdayIndex,
} from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;
const radii = theme.radii;

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DEFAULT_WEEKDAYS: { label: string; value: WeekdayIndex }[] = [
  { label: 'Mån', value: 0 },
  { label: 'Tis', value: 1 },
  { label: 'Ons', value: 2 },
  { label: 'Tor', value: 3 },
  { label: 'Fre', value: 4 },
  { label: 'Lör', value: 5 },
  { label: 'Sön', value: 6 },
];

const DEFAULT_SLOTS: { label: string; value: AssignmentSlot }[] = [
  { label: 'Morgon', value: 'Morning' },
  { label: 'Lunch', value: 'Lunch' },
  { label: 'Kväll', value: 'Evening' },
];

function hasDefaultPass(passes: DefaultPass[], weekday: WeekdayIndex, slot: AssignmentSlot) {
  return passes.some((entry) => entry.weekday === weekday && entry.slot === slot);
}

const assignmentStatusStyles: Record<AssignmentStatus, { label: string; background: string; text: string }> = {
  open: { label: 'Ledigt', background: theme.tints.warning, text: theme.colors.warning },
  assigned: { label: 'Tilldelad', background: theme.tints.accent, text: theme.colors.accent },
  completed: { label: 'Bekräftad', background: theme.tints.primary, text: theme.colors.primary },
};

export default function ProfileScreen() {
  const router = useRouter();
  const { state, derived, actions } = useAppData();
  const { currentUserId, users, assignments, currentStableId } = state;
  const currentUser = users[currentUserId];
  const toast = useToast();
  const [userSwitchVisible, setUserSwitchVisible] = React.useState(false);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  const upcomingAssignments = derived.upcomingAssignmentsForUser.slice(0, 3);
  const memberCount = React.useMemo(
    () =>
      Object.values(users).filter((user) =>
        user.membership.some((entry) => entry.stableId === currentStableId),
      ).length,
    [currentStableId, users],
  );

  const profileStats = React.useMemo(() => {
    const nextAssignment = derived.nextAssignmentForUser;
    const formattedResponsibilities = currentUser.responsibilities.join(' · ') || 'Ingen roll angiven';
    const nextPassValue = nextAssignment
      ? `${formatAssignmentTitle(nextAssignment)} · ${formatDateLabel(
          nextAssignment.date,
        )} · ${nextAssignment.time}`
      : 'Inga pass planerade';
    const nextAway = currentUser.awayNotices[0];
    const nextAwayLabel = nextAway
      ? formatRange(nextAway.start, nextAway.end)
      : 'Ej planerat';

    return [
      { id: 'next', label: 'Nästa pass', value: nextPassValue },
      { id: 'responsibility', label: 'Ansvar', value: formattedResponsibilities },
      { id: 'time-off', label: 'Planerad frånvaro', value: nextAwayLabel },
    ];
  }, [currentUser, derived.nextAssignmentForUser]);

  const calendarMetadata = React.useMemo(() => buildCalendarMetadata(assignments, currentUser), [
    assignments,
    currentUser,
  ]);

  const upcomingAssignmentsView = React.useMemo(
    () =>
      upcomingAssignments.map((assignment) => ({
        assignment,
        assigneeName: assignment.assigneeId
          ? users[assignment.assigneeId]?.name ?? undefined
          : undefined,
        isCurrentUser: assignment.assigneeId === currentUserId,
      })),
    [upcomingAssignments, users, currentUserId],
  );

  const handleMessage = React.useCallback(() => {
    router.push('/(tabs)/messages');
  }, [router]);

  const handleCall = React.useCallback(async () => {
    if (!currentUser.phone) {
      toast.showToast('Telefonnummer saknas för användaren.', 'info');
      return;
    }
    const url = `tel:${currentUser.phone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        toast.showToast('Kan inte starta samtal på den här enheten.', 'error');
        return;
      }
      await Linking.openURL(url);
    } catch {
      toast.showToast('Kunde inte starta samtalet.', 'error');
    }
  }, [currentUser.phone, toast]);

  const handleLogout = React.useCallback(() => {
    const result = actions.signOut();
    if (result.success) {
      toast.showToast('Du är utloggad.', 'success');
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, toast]);

  const handleOpenMembers = React.useCallback(() => {
    router.push('/members');
  }, [router]);

  const handleTakeAssignment = React.useCallback(
    (assignmentId: string) => {
      const result = actions.claimAssignment(assignmentId);
      if (result.success && result.data) {
        toast.showToast(`${result.data.label} ${result.data.time} är nu ditt.`, 'success');
      } else if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const heroSection = (
    <View style={[styles.profileHero, isDesktopWeb && styles.profileHeroDesktop]}>
      <View style={styles.profileHeroContent}>
        <Image
          source={currentUser.avatar ?? require('@/assets/images/dummy-avatar.png')}
          style={styles.avatar}
        />
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroName}>{currentUser.name}</Text>
          <Text style={styles.heroRole}>
            {currentUser.responsibilities.join(' · ') || 'Stallmedlem'}
          </Text>
          <DetailRow icon="map-pin" text={currentUser.location} />
          <DetailRow icon="phone" text={currentUser.phone} />
        </View>
      </View>
      <View style={styles.heroChips}>
        {currentUser.horses.map((horse) => (
          <View key={horse} style={styles.heroChip}>
            <Feather name="heart" size={12} color="#2D6CF6" />
            <Text style={styles.heroChipText}>{horse}</Text>
          </View>
        ))}
      </View>
      <View style={styles.profileActionRow}>
        <TouchableOpacity style={styles.primaryActionButton} onPress={handleCall}>
          <Feather name="phone-call" size={16} color={palette.inverseText} />
          <Text style={styles.primaryActionLabel}>Ring</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryActionButton} onPress={handleMessage}>
          <Feather name="message-circle" size={16} color="#2D6CF6" />
          <Text style={styles.secondaryActionLabel}>Chatta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.moreActionButton}>
          <Feather name="more-horizontal" size={18} color={palette.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const statsSection = (
    <View style={[styles.statsSection, isDesktopWeb && styles.statsSectionDesktop]}>
      <View style={styles.statsRow}>
        {profileStats.map((item) => (
          <View key={item.id} style={styles.statItem}>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text style={styles.statValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const accountSection = (
    <Card tone="muted" style={styles.accountCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Konto</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.accountRow}
        onPress={() => setUserSwitchVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.accountRowText}>Byt användare</Text>
        <Feather name="chevron-right" size={16} color={palette.secondaryText} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.accountRow, styles.accountRowDanger]}
        onPress={handleLogout}
        activeOpacity={0.85}
      >
        <Text style={[styles.accountRowText, styles.accountRowTextDanger]}>Logga ut</Text>
      </TouchableOpacity>
    </Card>
  );

  const membersSection = (
    <Card tone="muted" style={styles.membersCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Medlemmar</Text>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionCount}>{memberCount}</Text>
        </View>
        <TouchableOpacity onPress={handleOpenMembers}>
          <Text style={styles.sectionAction}>Öppna</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.membersHint}>Roller, kontaktuppgifter och hästar för valt stall.</Text>
    </Card>
  );

  const defaultPassSection = (
    <Card tone="muted" style={styles.defaultPassCard}>
      <View style={styles.defaultPassHeader}>
        <Text style={styles.defaultPassTitle}>Standardpass</Text>
        <Text style={styles.defaultPassSubtitle}>
          Dessa markeras automatiskt som dina i schemat – tryck “Kan inte” på en dag du inte kan.
        </Text>
      </View>

      <View style={styles.defaultPassGrid}>
        {DEFAULT_SLOTS.map((slot) => (
          <View key={slot.value} style={styles.defaultPassRow}>
            <Text style={styles.defaultPassRowLabel}>{slot.label}</Text>
            <View style={styles.defaultPassRowChips}>
              {DEFAULT_WEEKDAYS.map((day) => {
                const active = hasDefaultPass(currentUser.defaultPasses, day.value, slot.value);
                return (
                  <TouchableOpacity
                    key={`${slot.value}-${day.value}`}
                    onPress={() => actions.toggleDefaultPass(day.value, slot.value)}
                    activeOpacity={0.85}
                  >
                    <Pill active={active} style={styles.defaultPassChip}>
                      <Text
                        style={[
                          styles.defaultPassChipText,
                          active && styles.defaultPassChipTextActive,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </Pill>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );

  const upcomingSection = (
    <View style={[styles.sectionBlock, isDesktopWeb && styles.sectionBlockDesktop]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Kommande uppgifter</Text>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionCount}>{upcomingAssignments.length}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/calendar?view=mine')}>
          <Text style={styles.sectionAction}>Visa schema</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.assignmentList}>
        {upcomingAssignmentsView.map(({ assignment, assigneeName, isCurrentUser }) => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            assigneeName={assigneeName}
            isCurrentUser={isCurrentUser}
            onTakeAssignment={handleTakeAssignment}
          />
        ))}
      </View>
    </View>
  );

  const calendarSection = (
    <Card tone="muted" style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity style={styles.calendarArrow}>
          <Text style={styles.calendarArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.calendarMonth}>{calendarMetadata.title}</Text>
        <TouchableOpacity style={styles.calendarArrow}>
          <Text style={styles.calendarArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarLegend}>
        <LegendItem label="Idag" type="today" />
        <LegendItem label="Mina pass" type="riding" />
        <LegendItem label="Frånvaro" type="away" />
      </View>

      <View style={styles.weekRow}>
        {WEEK_DAYS.map((day) => (
          <View key={day} style={styles.weekDayContainer}>
            <Text style={styles.weekDay}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {calendarMetadata.days.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          const isToday = day === calendarMetadata.today;
          const isRidingDay = calendarMetadata.ridingDays.has(day);
          const isAwayDay = calendarMetadata.awayDays.has(day);

          return (
            <View key={index} style={styles.dayCell}>
              <View
                style={[
                  styles.dayCircle,
                  isToday && styles.todayDay,
                  isRidingDay && styles.ridingDay,
                  isAwayDay && styles.awayDay,
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    isToday && styles.todayDayText,
                    isRidingDay && styles.ridingDayText,
                    isAwayDay && styles.awayDayText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );

  const awaySection = (
    <Card tone="muted" style={styles.awayCard}>
      <Text style={styles.awayTitle}>Planerad frånvaro</Text>
      <View style={styles.awayList}>
        {currentUser.awayNotices.map((notice) => (
          <View key={notice.id} style={styles.awayItem}>
            <Text style={styles.awayRange}>{formatRange(notice.start, notice.end)}</Text>
            <Text style={styles.awayNote}>{notice.note}</Text>
          </View>
        ))}
      </View>
    </Card>
  );

  const recentSection = (
    <Card tone="muted" style={styles.recentCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Senaste inlägg</Text>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionCount}>{state.posts.length}</Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.sectionAction}>Visa alla</Text>
        </TouchableOpacity>
      </View>
      <Image
        resizeMode="cover"
        source={{
          uri: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
        }}
        style={styles.recentImage}
      />
    </Card>
  );

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
        title={currentUser.name}
        primaryActionLabel="Skicka meddelande"
        onPressPrimaryAction={handleMessage}
      />
      {!isDesktopWeb ? <StableSwitcher /> : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        {isDesktopWeb ? (
          <View style={styles.desktopLayout}>
            <View style={styles.desktopSidebar}>
              {heroSection}
              {statsSection}
              {accountSection}
              {awaySection}
            </View>
            <View style={styles.desktopMain}>
              {membersSection}
              {defaultPassSection}
              {upcomingSection}
              {calendarSection}
              {recentSection}
            </View>
          </View>
        ) : (
          <>
            {heroSection}
            {statsSection}
            {accountSection}
            {membersSection}
            {defaultPassSection}
            {upcomingSection}
            {calendarSection}
            {awaySection}
            {recentSection}
          </>
        )}
        </ScrollView>
        <UserSwitchModal
          visible={userSwitchVisible}
          onClose={() => setUserSwitchVisible(false)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={14} color={palette.icon} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

function AssignmentCard({
  assignment,
  assigneeName,
  isCurrentUser,
  onTakeAssignment,
}: {
  assignment: Assignment;
  assigneeName?: string;
  isCurrentUser: boolean;
  onTakeAssignment: (assignmentId: string) => void;
}) {
  const status = assignmentStatusStyles[assignment.status];

  return (
    <Card tone="muted" style={styles.assignmentCard}>
      <View style={styles.assignmentHeader}>
        <View style={styles.assignmentInfo}>
          <Text style={styles.assignmentTitle}>{formatAssignmentTitle(assignment)}</Text>
          <Text style={styles.assignmentMeta}>
            {formatDateLabel(assignment.date)} · {assignment.time}
          </Text>
        </View>
        <View style={[styles.assignmentStatus, { backgroundColor: status.background }]}>
          <Text style={[styles.assignmentStatusText, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>
      {assigneeName ? (
        <Text style={styles.assignmentAssignee}>Ansvar: {isCurrentUser ? 'Du' : assigneeName}</Text>
      ) : null}
      {assignment.note ? <Text style={styles.assignmentNote}>{assignment.note}</Text> : null}
      {assignment.status === 'open' ? (
        <TouchableOpacity
          style={styles.assignmentAction}
          activeOpacity={0.85}
          onPress={() => onTakeAssignment(assignment.id)}
        >
          <Text style={styles.assignmentActionLabel}>Ta passet</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function LegendItem({ label, type }: { label: string; type: 'today' | 'riding' | 'away' }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDotBase,
          type === 'today' && styles.legendDotToday,
          type === 'riding' && styles.legendDotRiding,
          type === 'away' && styles.legendDotAway,
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

type CalendarMetadata = {
  year: number;
  month: number;
  title: string;
  days: (number | null)[];
  today: number | null;
  ridingDays: Set<number>;
  awayDays: Set<number>;
};

function buildCalendarMetadata(assignments: Assignment[], user: UserProfile): CalendarMetadata {
  const referenceDate = assignments[0]
    ? new Date(`${assignments[0].date}T00:00:00`)
    : new Date();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const title = referenceDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  const startIndex = startDay === 0 ? 6 : startDay - 1; // Monday first

  const days: (number | null)[] = [];
  for (let i = 0; i < startIndex; i++) {
    days.push(null);
  }
  for (let day = 1; day <= totalDays; day++) {
    days.push(day);
  }

  const todayDate = new Date();
  const today =
    todayDate.getFullYear() === year && todayDate.getMonth() === month ? todayDate.getDate() : null;

  const ridingDays = new Set<number>(
    assignments
      .filter((assignment) => assignment.assigneeId === user.id)
      .map((assignment) => new Date(`${assignment.date}T00:00:00`).getDate()),
  );

  const awayDays = new Set<number>();
  user.awayNotices.forEach((notice: { start: string; end: string }) => {
    const start = new Date(`${notice.start}T00:00:00`);
    const end = new Date(`${notice.end}T00:00:00`);
    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      if (date.getMonth() === month && date.getFullYear() === year) {
        awayDays.add(date.getDate());
      }
    }
  });

  return {
    year,
    month,
    title: capitalize(title),
    days,
    today,
    ridingDays,
    awayDays,
  };
}

function formatDateLabel(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

function formatAssignmentTitle(assignment: Assignment) {
  const label = assignment.label.toLowerCase();
  if (label.includes('morgon')) {
    return 'Morgonpass';
  }
  if (label.includes('kväll')) {
    return 'Kvällspass';
  }
  if (label.includes('lunch')) {
    return 'Lunchpass';
  }
  return assignment.label;
}

function formatRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (startDate.getTime() === endDate.getTime()) {
    return startDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'numeric' });
  }
  return `${startDate.getDate()}–${endDate.getDate()}/${startDate.getMonth() + 1}`;
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    gap: 28,
    paddingTop: 12,
  },
  scrollContentDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
  },
  desktopLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
    width: '100%',
  },
  desktopSidebar: {
    width: 340,
    flexShrink: 0,
    gap: 18,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
    gap: 24,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  profileHero: {
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 22,
    borderRadius: radius.xl,
    backgroundColor: surfacePresets.hero,
  },
  profileHeroDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  profileHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
  },
  heroTextBlock: {
    flex: 1,
    gap: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.primaryText,
  },
  heroRole: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4E5A76',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: surfacePresets.section,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: systemPalette.primary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  profileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.inverseText,
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: surfacePresets.section,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  secondaryActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primary,
  },
  moreActionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  statsSection: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    backgroundColor: surfacePresets.section,
    borderRadius: radius.xl,
  },
  statsSectionDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  defaultPassCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  defaultPassHeader: {
    gap: 6,
  },
  defaultPassTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  defaultPassSubtitle: {
    fontSize: 12,
    color: palette.secondaryText,
    lineHeight: 17,
  },
  defaultPassGrid: {
    gap: 12,
  },
  defaultPassRow: {
    gap: 10,
  },
  defaultPassRowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  defaultPassRowChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  defaultPassChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  defaultPassChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  defaultPassChipTextActive: {
    color: palette.inverseText,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  statItem: {
    flex: 1,
    gap: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: systemPalette.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: systemPalette.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionBlock: {
    gap: 14,
  },
  sectionBlockDesktop: {
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  assignmentList: {
    gap: 12,
  },
  assignmentCard: {
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  assignmentInfo: {
    flex: 1,
    gap: 4,
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  assignmentMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  assignmentStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  assignmentStatusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  assignmentAssignee: {
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  assignmentNote: {
    fontSize: 12,
    color: palette.mutedText,
  },
  assignmentAction: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  assignmentActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.inverseText,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDotBase: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  legendDotToday: {
    backgroundColor: palette.icon,
  },
  legendDotRiding: {
    backgroundColor: palette.accent,
  },
  legendDotAway: {
    borderWidth: 1,
    borderColor: palette.icon,
  },
  legendText: {
    fontWeight: '500',
    fontSize: 12,
    color: palette.primaryText,
    letterSpacing: 0.2,
  },
  calendarCard: {
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  calendarLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  calendarArrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarArrowText: {
    fontSize: 22,
    color: color.textMuted,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  calendarMonth: {
    fontWeight: '400',
    fontSize: 20,
    lineHeight: 22,
    color: color.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  weekDayContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  weekDay: {
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 12,
    textTransform: 'uppercase',
    color: palette.mutedText,
    textAlign: 'center',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'flex-start',
    width: '100%',
  },
  dayCell: {
    width: '14.28%',
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontWeight: '500',
    fontSize: 14,
    lineHeight: 20,
    color: palette.primaryText,
  },
  ridingDay: {
    backgroundColor: palette.accent,
  },
  ridingDayText: {
    color: palette.inverseText,
  },
  todayDay: {
    backgroundColor: palette.icon,
  },
  todayDayText: {
    color: palette.inverseText,
  },
  awayDay: {
    borderWidth: 1,
    borderColor: palette.icon,
  },
  awayDayText: {
    color: palette.primaryText,
  },
  awayCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  awayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  awayList: {
    gap: 10,
  },
  awayItem: {
    gap: 2,
  },
  awayRange: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  awayNote: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  accountCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  accountRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  accountRowDanger: {
    borderBottomWidth: 0,
  },
  accountRowTextDanger: {
    color: palette.error,
  },
  membersCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  membersHint: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  recentCard: {
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: palette.primaryText,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: palette.accent,
  },
  sectionCount: {
    fontSize: 12,
    color: palette.mutedText,
  },
  sectionAction: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  recentImage: {
    width: '100%',
    height: 200,
    borderRadius: radii.lg,
  },
});
