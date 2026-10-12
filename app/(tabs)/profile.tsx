import React from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { surfacePresets } from '@/design/system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton, Pill } from '@/components/Primitives';
import { Avatar } from '@/components/Avatar';
import { StableSwitcher } from '@/components/StableSwitcher';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import type {
  Assignment,
  AssignmentSlot,
  AssignmentStatus,
  DefaultPass,
  WeekdayIndex,
} from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { roleLabels } from '@/lib/roleLabels';
import HorseIcon from '@/assets/images/figma/profile-horse.svg';
import LocationIcon from '@/assets/images/figma/profile-location.svg';
import PhoneIcon from '@/assets/images/figma/profile-phone.svg';

const palette = theme.colors;
const radii = theme.radii;

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
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const { state, derived, actions, refreshing } = useAppData();
  const { currentUserId, users, currentStableId } = state;
  const currentUser = users[currentUserId];
  const toast = useToast();
  const [defaultPassSaving, setDefaultPassSaving] = React.useState(false);
  const defaultPassSavingRef = React.useRef(false);
  const [defaultPassError, setDefaultPassError] = React.useState<string | null>(null);
  const handleToggleDefaultPass = React.useCallback(async (weekday: WeekdayIndex, slot: AssignmentSlot) => {
    if (defaultPassSavingRef.current) return;
    defaultPassSavingRef.current = true;
    setDefaultPassSaving(true);
    setDefaultPassError(null);
    try {
      const result = await actions.toggleDefaultPass(weekday, slot);
      if (!result.success) setDefaultPassError(result.reason);
    } finally { defaultPassSavingRef.current = false; setDefaultPassSaving(false); }
  }, [actions]);
  const scrollRef = React.useRef<ScrollView>(null);
  const [defaultPassAnchor, setDefaultPassAnchor] = React.useState<number | null>(null);
  const [highlightDefaultPass, setHighlightDefaultPass] = React.useState(false);
  const [didScrollToSection, setDidScrollToSection] = React.useState(false);
  const [claimingAssignmentIds, setClaimingAssignmentIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const isDesktopWeb = useIsDesktopWeb();
  const isWeb = Platform.OS === 'web';
  const currentStable = state.stables.find((stable) => stable.id === currentStableId);
  const resolvedSection = Array.isArray(section) ? section[0] : section;
  const hasStable = Boolean(currentStableId && currentStable);
  const stableLabel = currentStable?.name ?? 'Inget stall valt';

  const upcomingAssignments = derived.upcomingAssignmentsForUser.slice(0, 3);
  const canManageAdmin = derived.canManageOnboardingAny;
  const memberCount = React.useMemo(
    () =>
      Object.values(users).filter((user) =>
        user.membership.some((entry) => entry.stableId === currentStableId),
      ).length,
    [currentStableId, users],
  );

  const upcomingAssignmentsView = React.useMemo(
    () =>
      upcomingAssignments.map((assignment) => {
        const endTime = derived.getAssignmentEndTime(assignment);
        const timeLabel = endTime ? `${assignment.time}–${endTime}` : assignment.time;
        return {
          assignment,
          assigneeName: assignment.assigneeId
            ? users[assignment.assigneeId]?.name ?? undefined
            : undefined,
          isCurrentUser: assignment.assigneeId === currentUserId,
          timeLabel,
          note: derived.cleanAssignmentNote(assignment.note),
        };
      }),
    [upcomingAssignments, users, currentUserId, derived],
  );

  const scrollToDefaultPass = React.useCallback(() => {
    if (defaultPassAnchor === null) {
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(defaultPassAnchor - 12, 0), animated: true });
    setHighlightDefaultPass(true);
  }, [defaultPassAnchor]);

  React.useEffect(() => {
    setDidScrollToSection(false);
  }, [resolvedSection]);

  React.useEffect(() => {
    if (resolvedSection !== 'availability' || didScrollToSection) {
      return;
    }
    if (defaultPassAnchor === null) {
      return;
    }
    scrollToDefaultPass();
    setDidScrollToSection(true);
  }, [defaultPassAnchor, didScrollToSection, resolvedSection, scrollToDefaultPass]);

  React.useEffect(() => {
    if (!highlightDefaultPass) {
      return;
    }
    const timer = setTimeout(() => setHighlightDefaultPass(false), 1800);
    return () => clearTimeout(timer);
  }, [highlightDefaultPass]);

  const handleOpenMembers = React.useCallback(() => {
    router.push('/members');
  }, [router]);
  const handleOpenSettings = React.useCallback(() => {
    router.push('/settings/account');
  }, [router]);
  const handleOpenNotifications = React.useCallback(() => {
    router.push('/settings/notifications');
  }, [router]);
  const handleOpenOverview = React.useCallback(() => {
    router.push('/');
  }, [router]);
  const handleOpenJoinStable = React.useCallback(() => {
    router.push('/(onboarding)/join');
  }, [router]);

  const handleTakeAssignment = React.useCallback(
    async (assignmentId: string) => {
      if (claimingAssignmentIds.has(assignmentId)) {
        return;
      }
      setClaimingAssignmentIds((current) => new Set(current).add(assignmentId));
      try {
        const result = await actions.claimAssignment(assignmentId);
        if (result.success && result.data) {
          toast.showToast(`${result.data.label} ${result.data.time} är nu ditt.`, 'success');
        } else if (!result.success) {
          toast.showToast(result.reason, 'error');
        }
      } finally {
        setClaimingAssignmentIds((current) => {
          const next = new Set(current);
          next.delete(assignmentId);
          return next;
        });
      }
    },
    [actions, claimingAssignmentIds, toast],
  );

  if (!currentUser) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader
            style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
            title="Profil"
            showSearch={false}
            showLogo={false}
          />
          <View style={styles.loadingState}>
            <Text style={styles.loadingTitle}>Laddar profil...</Text>
            <Text style={styles.loadingSubtitle}>Kontrollerar dina uppgifter.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const primaryMembership = currentUser.membership.find(
    (entry) => entry.stableId === currentStableId,
  ) ?? currentUser.membership[0];
  const isOwner = primaryMembership?.access === 'owner';
  const membershipRoleLabel = primaryMembership
    ? primaryMembership.customRole?.trim() || roleLabels[primaryMembership.role]
    : undefined;
  const roleLabel = isOwner ? 'Ägare' : membershipRoleLabel ?? 'Ingen roll';
  const accessLabel =
    primaryMembership?.access === 'edit'
      ? 'Redigera'
      : primaryMembership?.access === 'view'
        ? 'Läsa'
        : '';
  const hasAwayNotices = currentUser.awayNotices.length > 0;

  const heroSection = (
    <View style={[styles.profileHero, isDesktopWeb && styles.profileHeroDesktop]}>
      <View style={styles.profileHeroContent}>
        <Avatar
          source={currentUser.avatar}
          style={styles.avatar}
          accessibilityLabel={`${currentUser.name} profilbild`}
        />
        <View style={styles.heroTextBlock}>
          <DetailRow icon="heart" text={currentUser.horses.join(', ') || 'Ingen häst kopplad ännu'} />
          <DetailRow icon="map-pin" text={currentUser.location} />
          <DetailRow icon="phone" text={currentUser.phone} />
        </View>
      </View>
      <Text style={styles.heroRole}>
        {stableLabel} · {roleLabel}{accessLabel ? ` · ${accessLabel}` : ''}
      </Text>
      <View style={styles.profileActionRow}>
        <TouchableOpacity style={styles.primaryActionButton} onPress={scrollToDefaultPass} accessibilityRole="button" activeOpacity={0.85}>
          <Feather name="calendar" size={14} color={palette.primaryText} />
          <Text style={styles.primaryActionLabel}>Standardpass</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryActionButton} onPress={handleOpenSettings} accessibilityRole="button" activeOpacity={0.85}>
          <Feather name="settings" size={14} color={palette.primaryText} />
          <Text style={styles.secondaryActionLabel}>Kontoinställningar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const settingsSection = (
    <Card tone="muted" style={styles.settingsCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Inställningar</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.settingsRow}
        onPress={handleOpenSettings}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Kontoinställningar"
      >
        <View style={styles.settingsRowLeft}>
          <Feather name="settings" size={16} color={palette.primaryText} />
          <Text style={styles.settingsRowText}>Kontoinställningar</Text>
        </View>
        <Feather name="chevron-right" size={16} color={palette.secondaryText} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.settingsRow}
        onPress={handleOpenNotifications}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Notiser"
      >
        <View style={styles.settingsRowLeft}>
          <Feather name="bell" size={16} color={palette.primaryText} />
          <Text style={styles.settingsRowText}>Notiser</Text>
        </View>
        <Feather name="chevron-right" size={16} color={palette.secondaryText} />
      </TouchableOpacity>
      <Text style={styles.settingsHint}>Byt uppgifter, hantera konto och logga ut.</Text>
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
        <TouchableOpacity style={styles.sectionActionButton} onPress={handleOpenMembers} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Öppna medlemmar">
          <Text style={styles.sectionAction}>Öppna</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.membersHint}>Roller, kontaktuppgifter och hästar för valt stall.</Text>
    </Card>
  );

  const noStableSection = !hasStable ? (
    <Card tone="muted" style={styles.infoCard}>
      <Text style={styles.infoTitle}>Inget stall valt</Text>
      <Text style={styles.infoText}>
        {canManageAdmin
          ? 'Starta uppstarten från Överblick eller öppna Admin i webben för att skapa ett stall.'
          : 'Gå till Överblick för att skapa stall eller invänta en inbjudan.'}
      </Text>
      <View style={styles.infoActionRow}>
        <TouchableOpacity style={styles.infoAction} onPress={handleOpenOverview} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Till överblick">
          <Text style={styles.infoActionText}>Till överblick</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.infoSecondaryAction}
          onPress={handleOpenJoinStable}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Gå med i stall"
        >
          <Text style={styles.infoSecondaryActionText}>Gå med i stall</Text>
        </TouchableOpacity>
      </View>
    </Card>
  ) : null;

  const adminSection =
    isWeb && canManageAdmin ? (
      <Card tone="muted" style={styles.adminCard}>
        <Text style={styles.adminTitle}>Admincenter</Text>
        <Text style={styles.adminText}>
          Hantera stall, medlemmar, hästar och scheman i adminvyn.
        </Text>
        <TouchableOpacity
          style={styles.adminAction}
          onPress={() => router.push('/admin')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Öppna admin"
        >
          <Text style={styles.adminActionText}>Öppna admin</Text>
        </TouchableOpacity>
      </Card>
    ) : null;

  const defaultPassSubtitle = hasStable
    ? 'De tre valen nedan gäller äldre pass. Säsongens egna pass och fasta veckodagar väljer du i Fasta pass.'
    : 'Välj dagar du brukar kunna ta pass. Sparas lokalt tills du går med i ett stall.';

  const defaultPassSection = (
    <View
      onLayout={(event) => setDefaultPassAnchor(event.nativeEvent.layout.y)}
      style={styles.defaultPassAnchor}
    >
      <Card
        tone="muted"
        style={[styles.defaultPassCard, highlightDefaultPass && styles.defaultPassCardHighlight]}
      >
        <View style={styles.defaultPassHeader}>
          <Text style={styles.defaultPassTitle}>Standardpass</Text>
          <Text style={styles.defaultPassSubtitle}>{defaultPassSubtitle}</Text>
          {hasStable ? (
            <TouchableOpacity style={styles.adminAction} onPress={() => router.push('/season-schedule')} accessibilityRole="button" accessibilityLabel="Mina fasta veckopass">
              <Text style={styles.adminActionText}>Mina fasta veckopass</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {defaultPassError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{defaultPassError}</Text>}
        {defaultPassSaving && <Text style={styles.defaultPassSubtitle}>Sparar standardpass…</Text>}
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
                      style={{ width: isDesktopWeb ? '12%' : '13%', minWidth: 44 }}
                      onPress={() => handleToggleDefaultPass(day.value, slot.value)}
                      disabled={defaultPassSaving || refreshing}
                      accessibilityRole="button"
                      accessibilityLabel={`${slot.label}, ${day.label}`}
                      aria-pressed={active}
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
    </View>
  );

  const upcomingSection = (
    <View style={[styles.sectionBlock, isDesktopWeb && styles.sectionBlockDesktop]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>Kommande uppgifter</Text>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionCount}>{upcomingAssignments.length}</Text>
        </View>
        <TouchableOpacity style={styles.sectionActionButton} onPress={() => router.push('/calendar?view=mine')} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.sectionAction}>Visa schema</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.assignmentList}>
        {upcomingAssignmentsView.length > 0 ? (
          upcomingAssignmentsView.map(({ assignment, assigneeName, isCurrentUser, timeLabel, note }) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              assigneeName={assigneeName}
              isCurrentUser={isCurrentUser}
              timeLabel={timeLabel}
              note={note}
              isPending={claimingAssignmentIds.has(assignment.id)}
              onTakeAssignment={handleTakeAssignment}
            />
          ))
        ) : (
          <Text style={styles.emptyHint}>Inga pass inplanerade ännu.</Text>
        )}
      </View>
    </View>
  );

  const awaySection = hasAwayNotices ? (
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
  ) : null;

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title={currentUser.name}
          showSearch={false}
          right={
            <HeaderIconButton
              accessibilityLabel="Inställningar"
              onPress={handleOpenSettings}
            >
              <Feather name="settings" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
        />
        {!isDesktopWeb ? <StableSwitcher /> : null}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => actions.refreshData()}
              tintColor={palette.primary}
            />
          }
        >
          {isDesktopWeb ? (
            <View style={styles.desktopLayout}>
              <View style={styles.desktopSidebar}>
                {heroSection}
                {settingsSection}
                {awaySection}
              </View>
            <View style={styles.desktopMain}>
              {noStableSection}
              {adminSection}
              {defaultPassSection}
              {hasStable ? upcomingSection : null}
              {hasStable ? membersSection : null}
            </View>
          </View>
        ) : (
          <>
            {heroSection}
            {noStableSection}
            {adminSection}
            {defaultPassSection}
            {hasStable ? upcomingSection : null}
            {hasStable ? membersSection : null}
            {settingsSection}
            {awaySection}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const DetailRow = React.memo(function DetailRow({ icon, text }: { icon: keyof typeof Feather.glyphMap; text?: string }) {
  if (!text || text.trim().length === 0) {
    return null;
  }
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        {icon === 'heart' ? <HorseIcon /> : icon === 'map-pin' ? <LocationIcon /> : icon === 'phone' ? (
          <View style={styles.phoneIcon}><PhoneIcon /></View>
        ) : <Feather name={icon} size={15} color={palette.primaryText} />}
      </View>
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
});

const AssignmentCard = React.memo(function AssignmentCard({
  assignment,
  assigneeName,
  isCurrentUser,
  timeLabel,
  note,
  isPending,
  onTakeAssignment,
}: {
  assignment: Assignment;
  assigneeName?: string;
  isCurrentUser: boolean;
  timeLabel: string;
  note?: string;
  isPending: boolean;
  onTakeAssignment: (assignmentId: string) => void | Promise<void>;
}) {
  const status = assignmentStatusStyles[assignment.status];

  return (
    <Card tone="muted" style={styles.assignmentCard}>
      <View style={styles.assignmentHeader}>
        <View style={styles.assignmentInfo}>
          <Text style={styles.assignmentTitle}>{formatAssignmentTitle(assignment)}</Text>
          <Text style={styles.assignmentMeta}>
            {formatDateLabel(assignment.date)} · {timeLabel}
          </Text>
        </View>
        <View style={[styles.assignmentStatus, { backgroundColor: status.background }]}>
          <Text style={[styles.assignmentStatusText, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>
      {assigneeName ? (
        <Text style={styles.assignmentAssignee}>Ansvar: {isCurrentUser ? 'Du' : assigneeName}</Text>
      ) : null}
      {note ? <Text style={styles.assignmentNote}>{note}</Text> : null}
      {assignment.status === 'open' ? (
        <TouchableOpacity
          style={[styles.assignmentAction, isPending && styles.assignmentActionDisabled]}
          activeOpacity={0.85}
          onPress={() => void onTakeAssignment(assignment.id)}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel={isPending ? 'Tar passet' : `Ta ${formatAssignmentTitle(assignment)}`}
          accessibilityState={{ disabled: isPending, busy: isPending }}
        >
          {isPending ? <ActivityIndicator size="small" color={palette.inverseText} /> : null}
          <Text style={styles.assignmentActionLabel}>
            {isPending ? 'Tar pass...' : 'Ta passet'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
});

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
    paddingHorizontal: 21,
    paddingBottom: 120,
    gap: 36,
    paddingTop: 28,
  },
  scrollContentDesktop: {
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 48,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    fontSize: 18,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  loadingSubtitle: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    textAlign: 'center',
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
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 48,
    marginBottom: 12,
  },
  profileHero: {
    gap: 16,
    paddingVertical: 6,
  },
  profileHeroDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  profileHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 75,
    height: 75,
    borderRadius: radius.full,
  },
  heroTextBlock: {
    flex: 1,
    gap: 5,
  },
  heroRole: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.secondaryText,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detailIcon: {
    width: 17,
    alignItems: 'center',
  },
  phoneIcon: {
    transform: [{ rotate: '180deg' }, { scaleY: -1 }],
  },
  detailText: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
  },
  profileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryActionLabel: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryActionLabel: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  infoCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  infoTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
  },
  infoText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  infoActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  infoAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoActionText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.inverseText,
  },
  infoSecondaryAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: surfacePresets.section,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoSecondaryActionText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primary,
  },
  adminCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  adminTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
  },
  adminText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  adminAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  adminActionText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.inverseText,
  },
  defaultPassAnchor: {
    width: '100%',
  },
  defaultPassCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  defaultPassCardHighlight: {
    borderWidth: 1,
    borderColor: palette.primary,
    shadowColor: palette.primary,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  defaultPassHeader: {
    gap: 6,
  },
  defaultPassTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
  },
  defaultPassSubtitle: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
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
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  defaultPassRowChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  defaultPassChip: {
    width: '100%',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  defaultPassChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  defaultPassChipTextActive: {
    color: palette.inverseText,
  },
  sectionBlock: {
    gap: 14,
  },
  sectionBlockDesktop: {
    padding: 22,
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
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
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
    fontSize: 15,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  assignmentMeta: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
  },
  assignmentStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  assignmentStatusText: {
    fontSize: 11,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  assignmentAssignee: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  assignmentNote: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.mutedText,
  },
  assignmentAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  assignmentActionDisabled: {
    opacity: 0.65,
  },
  assignmentActionLabel: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.inverseText,
  },
  awayCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  awayTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.semibold,
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
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  awayNote: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
  },
  settingsCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    minHeight: 44,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsRowText: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
  },
  settingsHint: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  membersCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  membersHint: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    lineHeight: 18,
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
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
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
    fontFamily: theme.fonts.regular,
    color: palette.mutedText,
  },
  sectionAction: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
  },
  sectionActionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
  },
});
