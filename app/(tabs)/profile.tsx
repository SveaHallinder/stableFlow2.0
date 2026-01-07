import React from 'react';
import {
  Image,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { surfacePresets, systemPalette } from '@/design/system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton, Pill } from '@/components/Primitives';
import { StableSwitcher } from '@/components/StableSwitcher';
import { useAppData } from '@/context/AppDataContext';
import type {
  Assignment,
  AssignmentSlot,
  AssignmentStatus,
  DefaultPass,
  UserRole,
  WeekdayIndex,
} from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';

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

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Personal',
  rider: 'Medryttare',
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Massör',
  guest: 'Gäst',
};

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
  const { state, derived, actions } = useAppData();
  const { currentUserId, users, currentStableId } = state;
  const currentUser = users[currentUserId];
  const toast = useToast();
  const scrollRef = React.useRef<ScrollView>(null);
  const [defaultPassAnchor, setDefaultPassAnchor] = React.useState<number | null>(null);
  const [highlightDefaultPass, setHighlightDefaultPass] = React.useState(false);
  const [didScrollToSection, setDidScrollToSection] = React.useState(false);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
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
      upcomingAssignments.map((assignment) => ({
        assignment,
        assigneeName: assignment.assigneeId
          ? users[assignment.assigneeId]?.name ?? undefined
          : undefined,
        isCurrentUser: assignment.assigneeId === currentUserId,
      })),
    [upcomingAssignments, users, currentUserId],
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
        <Image
          source={currentUser.avatar ?? require('@/assets/images/dummy-avatar.png')}
          style={styles.avatar}
        />
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroName}>{currentUser.name}</Text>
          <Text style={styles.heroRole}>Stall: {stableLabel}</Text>
          <DetailRow icon="user" text={`Roll: ${roleLabel}`} />
          {accessLabel ? (
            <DetailRow icon="shield" text={`Behörighet: ${accessLabel}`} />
          ) : null}
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
        <TouchableOpacity style={styles.primaryActionButton} onPress={scrollToDefaultPass}>
          <Feather name="calendar" size={16} color={palette.inverseText} />
          <Text style={styles.primaryActionLabel}>Standardpass</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryActionButton} onPress={handleOpenSettings}>
          <Feather name="settings" size={16} color={palette.primary} />
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
        <TouchableOpacity onPress={handleOpenMembers}>
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
      <TouchableOpacity style={styles.infoAction} onPress={handleOpenOverview} activeOpacity={0.85}>
        <Text style={styles.infoActionText}>Till överblick</Text>
      </TouchableOpacity>
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
        >
          <Text style={styles.adminActionText}>Öppna admin</Text>
        </TouchableOpacity>
      </Card>
    ) : null;

  const defaultPassSubtitle = hasStable
    ? 'Välj dagar du oftast kan ta pass. De markeras automatiskt som dina i schemat.'
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
        <TouchableOpacity onPress={() => router.push('/calendar?view=mine')}>
          <Text style={styles.sectionAction}>Visa schema</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.assignmentList}>
        {upcomingAssignmentsView.length > 0 ? (
          upcomingAssignmentsView.map(({ assignment, assigneeName, isCurrentUser }) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              assigneeName={assigneeName}
              isCurrentUser={isCurrentUser}
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

function DetailRow({ icon, text }: { icon: keyof typeof Feather.glyphMap; text?: string }) {
  if (!text || text.trim().length === 0) {
    return null;
  }
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
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  loadingSubtitle: {
    fontSize: 13,
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
    color: palette.secondaryText,
    letterSpacing: 0.2,
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
  infoCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  infoText: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  infoAction: {
    alignSelf: 'flex-start',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.inverseText,
  },
  adminCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  adminTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  adminText: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  adminAction: {
    alignSelf: 'flex-start',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  adminActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.inverseText,
  },
  defaultPassAnchor: {
    width: '100%',
  },
  defaultPassCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
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
  settingsCard: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  settingsHint: {
    fontSize: 12,
    color: palette.secondaryText,
    lineHeight: 18,
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
  emptyHint: {
    fontSize: 13,
    color: palette.secondaryText,
  },
});
