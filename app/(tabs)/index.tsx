import { generateId } from '@/lib/ids';
import React from 'react';
import {
  KeyboardAvoidingView,
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppIcon } from '@/components/AppIcon';
import { LinearGradient } from 'expo-linear-gradient';
import HeartIcon from '@/assets/images/figma/heart.svg';
import SpeechBubbleIcon from '@/assets/images/figma/comment.svg';
import UserGroupsIcon from '@/assets/images/figma/group.svg';
import SearchIcon from '@/assets/images/figma/search.svg';
import { theme } from '@/components/theme';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DataSyncStatus } from '@/components/DataSyncStatus';
import { StableSwitcher } from '@/components/StableSwitcher';
import { color, radius, space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { roleLabels } from '@/lib/roleLabels';
import {
  groupAssignmentsByDay,
  toISODate,
} from '@/lib/schedule';
import { deriveFeedFocus, deriveTodayOverview, getCurrentFeedSlot } from '@/lib/today';
import { getPaddockHorses, hasUnconfirmedPaddockLinks } from '@/lib/paddockLinks';
import { formatShortDate, formatTimeAgo } from '@/lib/time';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { useWeather } from '@/hooks/useWeather';

const palette = theme.colors;
const radii = theme.radii;

type QuickActionTint = 'primary' | 'accent' | 'warning';
type QuickActionIcon = 'clock' | 'users' | 'alert-triangle' | 'map';
type QuickActionId = 'my-passes' | 'open-passes' | 'events' | 'paddocks';

type QuickAction = {
  id: QuickActionId;
  label: string;
  caption: string;
  icon: QuickActionIcon;
  tint: QuickActionTint;
  disabled?: boolean;
  highlight?: boolean;
};

const tourSteps = [
  {
    title: 'Idag',
    text: 'Se viktiga aviseringar, dagens läge och snabbåtgärder för pass, lediga pass, händelser och hagar.',
  },
  {
    title: 'Schema & standardpass',
    text: 'Kolla dina rid-/stallpass och markera “kan inte” eller “klart”. Välj standarddagar för automatisk tilldelning av passen som admin skapar.',
  },
  {
    title: 'Hagar & kartor',
    text: 'Lägg till hagar med bild/karta och skriv ut listor så alla ser var hästarna går – sommar, vinter eller året runt.',
  },
];

export default function OverviewScreen() {
  const router = useRouter();
  const { state, derived, actions } = useAppData();
  const {
    assignmentHistory,
    assignments,
    alerts,
    stableAlerts,
    messages: messageItems,
    posts: postItems,
    currentUserId,
    paddocks,
    currentStableId,
    stables,
  } = state;
  const toast = useToast();
  const isDesktopWeb = useIsDesktopWeb();
  const { tour } = useLocalSearchParams<{ tour?: string }>();
  const activeAssignments = React.useMemo(
    () => assignments.filter((assignment) => assignment.stableId === currentStableId),
    [assignments, currentStableId],
  );
  const activePaddocks = React.useMemo(
    () => paddocks.filter((paddock) => paddock.stableId === currentStableId),
    [paddocks, currentStableId],
  );
  const [messagesExpanded, setMessagesExpanded] = React.useState(false);
  const [postsExpanded, setPostsExpanded] = React.useState(false);
  const [horseStatusExpanded, setHorseStatusExpanded] = React.useState(false);
  const [eventsModalVisible, setEventsModalVisible] = React.useState(false);
  const [eventSaving, setEventSaving] = React.useState(false);
  const eventSavingRef = React.useRef(false);
  const eventIdRef = React.useRef<string | null>(null);
  const [eventSaveError, setEventSaveError] = React.useState<string | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = React.useState<string | null>(null);
  const resolvingAlertRef = React.useRef(false);
  const [alertResolveError, setAlertResolveError] = React.useState<string | null>(null);
  const [eventText, setEventText] = React.useState('');
  const [eventKind, setEventKind] = React.useState<'event' | 'important' | 'urgent'>('event');
  const [tourVisible, setTourVisible] = React.useState(tour === 'intro');
  const [tourStep, setTourStep] = React.useState(0);

  React.useEffect(() => {
    if (eventsModalVisible) {
      eventIdRef.current = generateId();
      setEventSaveError(null);
      setEventText('');
      setEventKind('event');
    }
  }, [eventsModalVisible]);

  React.useEffect(() => {
    if (tour === 'intro') {
      setTourVisible(true);
    }
  }, [tour]);

  const { permissions } = derived;
  const canManageDayEvents = permissions.canManageDayEvents;
  const canResolveStableAlerts =
    permissions.canManageAssignments ||
    permissions.canManageDayEvents ||
    permissions.canManageOnboarding;
  const membership = derived.membership;
  const roleLabel =
    membership?.customRole?.trim() || roleLabels[membership?.role ?? 'guest'];
  const currentStable = stables.find((stable) => stable.id === currentStableId);
  const stableName = currentStable?.name ?? 'stallet';
  const stableLocation = currentStable?.location;
  const isOwner = permissions.canManageOnboarding;
  const onboardingComplete = derived.onboardingComplete;
  const showOnboardingEntry = isOwner && !onboardingComplete;

  const activeMessages = React.useMemo(
    () => messageItems.filter((item) => (!item.stableId || item.stableId === currentStableId) && (item.unreadCount ?? 0) > 0),
    [messageItems, currentStableId],
  );
  const activePosts = React.useMemo(
    () => postItems.filter((post) => !post.stableId || post.stableId === currentStableId),
    [postItems, currentStableId],
  );
  const recentActivities = React.useMemo(() => {
    type AssignmentHistoryEntry = (typeof assignmentHistory)[number];
    if (!assignmentHistory.length) {
      return [];
    }
    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const seen = new Map<string, { activity: AssignmentHistoryEntry; count: number }>();
    const ordered: { activity: AssignmentHistoryEntry; count: number }[] = [];

    for (const activity of assignmentHistory) {
      const assignment = assignmentById.get(activity.assignmentId);
      if (!assignment || assignment.stableId !== currentStableId) {
        continue;
      }
      const existing = seen.get(activity.label);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const entry = { activity, count: 1 };
      seen.set(activity.label, entry);
      ordered.push(entry);
    }

    return ordered.slice(0, 3);
  }, [assignmentHistory, assignments, currentStableId]);

  const latestEvent = alerts[0];
  const recentEvents = alerts.slice(0, 3);
  const activeStableAlerts = React.useMemo(() => {
    const severityRank = { urgent: 0, important: 1, info: 2 };
    return stableAlerts
      .filter(
        (alert) =>
          alert.stableId === currentStableId &&
          !alert.resolvedAt &&
          alert.severity !== 'info',
      )
      .sort((a, b) => {
        const severityDiff = severityRank[a.severity] - severityRank[b.severity];
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [currentStableId, stableAlerts]);

  const closeTour = React.useCallback(() => {
    setTourVisible(false);
    setTourStep(0);
    router.replace('/'); // rensa ev. query
  }, [router]);

  const nextTour = React.useCallback(() => {
    if (tourStep >= tourSteps.length - 1) {
      closeTour();
      return;
    }
    setTourStep((prev) => Math.min(tourSteps.length - 1, prev + 1));
  }, [closeTour, tourStep]);
  const todayIso = toISODate(new Date());
  const todayDateLabel = new Date().toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const groupedDays = React.useMemo(
    () => groupAssignmentsByDay(activeAssignments),
    [activeAssignments],
  );
  const upcomingDayGroups = React.useMemo(
    () => groupedDays.filter((day) => day.isoDate >= todayIso),
    [groupedDays, todayIso],
  );
  const calendarPreviewGroups = React.useMemo(
    () => upcomingDayGroups.slice(0, 7),
    [upcomingDayGroups],
  );
  const todayDayGroup = React.useMemo(
    () => groupedDays.find((day) => day.isoDate === todayIso),
    [groupedDays, todayIso],
  );
  const todayAgendaAssignments = React.useMemo(
    () => [...(todayDayGroup?.assignments ?? [])].sort((a, b) => a.time.localeCompare(b.time)),
    [todayDayGroup],
  );

  const myAssignedUpcoming = React.useMemo(() => {
    return activeAssignments
      .filter(
        (assignment) =>
          assignment.assigneeId === currentUserId &&
          assignment.status === 'assigned' &&
          assignment.date >= todayIso,
      )
      .sort(
        (a, b) =>
          new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime(),
      );
  }, [activeAssignments, currentUserId, todayIso]);

  const myNextAssignment = myAssignedUpcoming[0];
  const myNextAssignmentTimeLabel = React.useMemo(() => {
    if (!myNextAssignment) {
      return undefined;
    }
    const endTime = derived.getAssignmentEndTime(myNextAssignment);
    return endTime ? `${myNextAssignment.time}–${endTime}` : myNextAssignment.time;
  }, [derived, myNextAssignment]);
  const missedAssignments = React.useMemo(
    () => derived.getMissedAssignmentsForStable(currentStableId),
    [derived, currentStableId],
  );
  const missedPreview = React.useMemo(() => missedAssignments.slice(0, 5), [missedAssignments]);
  const openUpcomingCount = React.useMemo(
    () =>
      calendarPreviewGroups.reduce(
        (total, day) =>
          total +
          day.assignments.filter((assignment) => assignment.status === 'open').length,
        0,
      ),
    [calendarPreviewGroups],
  );

  const paddockSummary = React.useMemo(() => {
    const paddockCount = activePaddocks.length;
    const horseCount = new Set(activePaddocks.flatMap((paddock) =>
      getPaddockHorses(paddock, state.horses).map((horse) => horse.id),
    )).size;
    const linksUnconfirmed = state.paddockLinksReady !== true ||
      hasUnconfirmedPaddockLinks(activePaddocks, state.horses);
    return { paddockCount, horseCount, linksUnconfirmed };
  }, [activePaddocks, state.horses, state.paddockLinksReady]);
  const quickActions = React.useMemo<QuickAction[]>(() => {
    return [
      {
        id: 'my-passes',
        label: 'Mina pass',
        caption: myNextAssignment
          ? `Nästa: ${myNextAssignment.label} · ${myNextAssignmentTimeLabel ?? myNextAssignment.time}`
          : 'Inga tilldelade pass',
        icon: 'clock',
        tint: 'primary',
        highlight: myAssignedUpcoming.length > 0,
      },
      {
        id: 'open-passes',
        label: 'Lediga pass',
        caption: openUpcomingCount
          ? `${openUpcomingCount} ${openUpcomingCount === 1 ? 'ledigt' : 'lediga'} pass`
          : 'Alla pass är bemannade\nÖppna schema',
        icon: 'users',
        tint: 'accent',
        highlight: openUpcomingCount > 0,
      },
      {
        id: 'events',
        label: 'Händelser',
        caption: canManageDayEvents
          ? latestEvent
            ? 'Lägg till uppdatering'
            : 'Lägg till uppdatering\nSe senaste'
          : 'Se senaste händelser',
        icon: 'alert-triangle',
        tint: 'warning',
        disabled: !canManageDayEvents,
      },
      {
        id: 'paddocks',
        label: 'Hagar',
        caption: paddockSummary.linksUnconfirmed
          ? 'Hästkopplingar ej bekräftade\nÖppna hagar'
          : paddockSummary.paddockCount
            ? `${paddockSummary.paddockCount} ${paddockSummary.paddockCount === 1 ? 'hage' : 'hagar'} · ${paddockSummary.horseCount} ${paddockSummary.horseCount === 1 ? 'häst' : 'hästar'}`
            : 'Lägg in hagar\nSkriv ut haglista',
        icon: 'map',
        tint: 'primary',
        highlight: paddockSummary.paddockCount === 0,
      },
    ];
  }, [
    canManageDayEvents,
    myNextAssignment,
    myNextAssignmentTimeLabel,
    myAssignedUpcoming.length,
    openUpcomingCount,
    latestEvent,
    paddockSummary,
  ]);

  const startHereSubtitle = isOwner
    ? 'Skapa stall, fyll i resurser, lägg till häst och första pass för att komma igång.'
    : `Du är ${roleLabel} i ${stableName}. Här är snabbaste vägen in.`;
  const isEventValid = eventText.trim().length >= 3;

  const todaySummary = React.useMemo(() => {
    const assignmentsForDay = todayDayGroup?.assignments ?? [];
    const total = assignmentsForDay.length;
    const completed = assignmentsForDay.filter((assignment) => assignment.status === 'completed').length;
    const open = assignmentsForDay.filter((assignment) => assignment.status === 'open').length;
    const mine = assignmentsForDay.filter(
      (assignment) =>
        assignment.assigneeId === currentUserId &&
        (assignment.status === 'assigned' || assignment.status === 'completed'),
    ).length;

    return { total, completed, open, mine };
  }, [todayDayGroup, currentUserId]);

  const summaryStats = React.useMemo(
    () => [
      {
        id: 'completed',
        label: 'Klara idag',
        value: todaySummary.total ? `${todaySummary.completed} / ${todaySummary.total}` : '—',
        meta: todaySummary.total ? 'Markerade som klara' : 'Inga pass idag',
      },
      {
        id: 'open',
        label: 'Saknar ansvarig',
        value: `${todaySummary.open}`,
        meta: todaySummary.open ? 'Behöver täckas' : 'Alla pass täckta',
      },
      {
        id: 'mine',
        label: 'På dig idag',
        value: `${todaySummary.mine}`,
        meta: todaySummary.mine ? 'Dina pass idag' : 'Inget på dig idag',
      },
    ],
    [todaySummary],
  );
  const hasTodayAssignments = todaySummary.total > 0;
  const todayOverview = React.useMemo(
    () =>
      deriveTodayOverview({
        state,
        currentUserId,
        currentStableId,
        todayIso,
        membership,
        permissions,
      }),
    [state, currentUserId, currentStableId, todayIso, membership, permissions],
  );
  const currentFeedSlot = getCurrentFeedSlot(new Date());
  const feedFocusHorseIds = React.useMemo(() => {
    const ownerId = currentUserId;
    const horsesForUser = state.horses.filter(
      (horse) =>
        horse.stableId === currentStableId &&
        (permissions.canManageHorses ||
          horse.ownerUserId === ownerId ||
          (membership?.horseIds ?? []).includes(horse.id)),
    );
    return horsesForUser.map((horse) => horse.id);
  }, [state.horses, currentStableId, currentUserId, membership, permissions]);
  const feedFocus = React.useMemo(
    () =>
      deriveFeedFocus({
        state,
        currentStableId,
        todayIso,
        slot: currentFeedSlot,
        horseIds: feedFocusHorseIds,
      }),
    [state, currentStableId, todayIso, currentFeedSlot, feedFocusHorseIds],
  );
  const ownsHorseInFocus = React.useMemo(
    () => state.horses.some((horse) => horse.ownerUserId === currentUserId && feedFocusHorseIds.includes(horse.id)),
    [state.horses, currentUserId, feedFocusHorseIds],
  );
  const canCheckFeed = permissions.canUpdateHorseStatus || ownsHorseInFocus;
  const [feedDeviation, setFeedDeviation] = React.useState<{ horseId: string; text: string } | null>(null);
  const feedSavePending = React.useRef(false);
  const [feedSavingHorseId, setFeedSavingHorseId] = React.useState<string | null>(null);
  const [feedSaveError, setFeedSaveError] = React.useState<{ horseId: string; message: string } | null>(null);
  const handleFeedCheck = React.useCallback(
    async (horseId: string, deviationNote?: string) => {
      if (feedSavePending.current) return false;
      feedSavePending.current = true;
      setFeedSavingHorseId(horseId);
      setFeedSaveError(null);
      const result = await actions.upsertFeedCheck({
        stableId: currentStableId,
        horseId,
        date: todayIso,
        slot: currentFeedSlot,
        checked: true,
        deviationNote,
      });
      feedSavePending.current = false;
      setFeedSavingHorseId(null);
      if (!result.success) {
        setFeedSaveError({ horseId, message: result.reason });
        toast.showToast(result.reason, 'error');
        return false;
      }
      toast.showToast(
        deviationNote ? 'Avvikelse registrerad.' : 'Foderkoll registrerad.',
        'success',
      );
      return true;
    },
    [actions, currentStableId, todayIso, currentFeedSlot, toast],
  );
  const handleFeedDeviationOpen = React.useCallback(
    (horseId: string, currentNote: string) => {
      setFeedDeviation((prev) =>
        prev?.horseId === horseId ? null : { horseId, text: currentNote },
      );
    },
    [],
  );
  const handleFeedDeviationSave = React.useCallback(async () => {
    if (!feedDeviation) return;
    const ok = await handleFeedCheck(feedDeviation.horseId, feedDeviation.text.trim() || undefined);
    if (ok) {
      setFeedDeviation(null);
    }
  }, [feedDeviation, handleFeedCheck]);

  const visibleMessages = messagesExpanded ? activeMessages : activeMessages.slice(0, 1);
  const visiblePosts = postsExpanded ? activePosts : activePosts.slice(0, 1);

  const handleMessagePress = React.useCallback(() => {
    setMessagesExpanded((prev) => !prev);
  }, []);

  const handlePostPress = React.useCallback(() => {
    setPostsExpanded((prev) => !prev);
  }, []);

  const handleQuickActionPress = React.useCallback(
    (action: QuickAction) => {
      if (action.id === 'my-passes') {
        router.push('/calendar?view=mine');
        return;
      }
      if (action.id === 'open-passes') {
        router.push('/calendar?view=open');
        return;
      }
      if (action.id === 'paddocks') {
        router.push('/paddocks');
        return;
      }
      if (action.id === 'events') {
        if (!canManageDayEvents) {
          toast.showToast('Du kan läsa händelser men inte lägga till nya.', 'error');
          return;
        }
        setEventsModalVisible(true);
      }
    },
    [canManageDayEvents, router, toast],
  );

  const handleOpenSearch = React.useCallback(() => {
    router.push('/search');
  }, [router]);
  const handleOpenOnboarding = React.useCallback(() => {
    router.push('/(onboarding)/setup');
    requestAnimationFrame(() => {
      actions.setOnboardingDismissed(false);
    });
  }, [actions, router]);
  const handleOpenAdmin = React.useCallback(() => {
    router.push('/admin');
  }, [router]);
  const handleOpenCalendar = React.useCallback(() => {
    router.push('/calendar?view=all');
  }, [router]);
  const handleOpenAssignment = React.useCallback((assignmentId: string) => {
    const assignment = activeAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    router.push({ pathname: '/calendar', params: {
      assignmentId: assignment.id, date: assignment.date, section: 'pass',
      view: assignment.assigneeId === currentUserId ? 'mine' : 'all',
    } });
  }, [activeAssignments, currentUserId, router]);


  const handleSubmitEvent = React.useCallback(async () => {
    if (eventSavingRef.current) return;
    if (!canManageDayEvents) {
      toast.showToast('Behörighet saknas för att lägga till händelser.', 'error');
      return;
    }
    const details = eventText.trim();
    if (!details) {
      toast.showToast('Skriv en kort uppdatering.', 'error');
      return;
    }
    eventSavingRef.current = true;
    setEventSaving(true);
    setEventSaveError(null);
    const result =
      eventKind === 'event'
        ? await actions.addEvent(details, 'info', eventIdRef.current ?? undefined)
        : await actions.createStableAlert({
            requestId: eventIdRef.current ?? undefined,
            title: details,
            severity: eventKind,
          });
    eventSavingRef.current = false;
    setEventSaving(false);
    if (result.success) {
      toast.showToast(eventKind === 'event' ? 'Händelsen lades till.' : 'Viktig notis lades till.', 'success');
      setEventsModalVisible(false);
    } else {
      setEventSaveError(result.reason);
      toast.showToast(result.reason, 'error');
    }
  }, [actions, canManageDayEvents, eventKind, eventText, toast]);

  const handleResolveStableAlert = React.useCallback(
    async (alertId: string) => {
      if (resolvingAlertRef.current) return;
      resolvingAlertRef.current = true;
      setResolvingAlertId(alertId);
      setAlertResolveError(null);
      const result = await actions.resolveStableAlert(alertId);
      resolvingAlertRef.current = false;
      setResolvingAlertId(null);
      if (result.success) {
        toast.showToast('Notisen är löst.', 'success');
      } else {
        setAlertResolveError(result.reason);
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const startHereSection = showOnboardingEntry ? (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.startHereCard, !isDesktopWeb && styles.startHereCardMobile, isDesktopWeb && styles.desktopCardVisible]}
    >
      <View style={styles.startHereHeader}>
        <View style={styles.startHereTitleBlock}>
          <Text style={styles.startHereTitle}>Starta här</Text>
          <Text style={styles.startHereSubtitle}>{startHereSubtitle}</Text>
        </View>
        <View style={styles.startHereBadge}>
          <Text style={styles.startHereBadgeText}>{roleLabel}</Text>
        </View>
      </View>
      <View style={styles.startHereActions}>
        <TouchableOpacity
          style={styles.startHerePrimary}
          onPress={handleOpenOnboarding}
          activeOpacity={0.9}
        >
          <Text style={styles.startHerePrimaryText}>Starta onboarding</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.startHereSecondary} onPress={handleOpenAdmin} activeOpacity={0.9}>
          <Text style={styles.startHereSecondaryText}>Mitt stall</Text>
        </TouchableOpacity>
      </View>
    </Card>
  ) : null;

  const prioritySection = (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.priorityCard, !isDesktopWeb && styles.priorityCardMobile, isDesktopWeb && styles.desktopCardVisible]}
    >
      <View style={styles.priorityHeader}>
        <View style={styles.priorityTitleBlock}>
          <Text style={styles.priorityEyebrow}>Idag</Text>
          <Text style={[styles.priorityTitle, !isDesktopWeb && styles.priorityTitleMobile]}>
            {todayOverview.mode === 'admin' ? 'Läget i stallet' : todayOverview.headline}
          </Text>
          <Text style={styles.prioritySubtitle}>{todayOverview.subheadline}</Text>
        </View>
        <View style={styles.priorityRolePill}>
          <Text style={styles.priorityRoleText}>{roleLabel}</Text>
        </View>
      </View>

      {todayOverview.noStableData ? (
        <View style={styles.priorityNotice}>
          <Feather name="info" size={15} color={palette.primary} />
          <Text style={styles.priorityNoticeText}>Slutför setup för att se dagens stallstatus.</Text>
        </View>
      ) : null}

      {todayOverview.permissionNote ? (
        <View style={styles.priorityNotice}>
          <Feather name="lock" size={15} color={palette.secondaryText} />
          <Text style={styles.priorityNoticeText}>{todayOverview.permissionNote}</Text>
        </View>
      ) : null}

      <View style={[styles.priorityGrid, isDesktopWeb && styles.priorityGridDesktop]}>
        {todayOverview.insights.filter((item) =>
          todayOverview.mode !== 'admin' || !hasTodayAssignments ||
          (item.id !== 'stable-status' && item.id !== 'open'),
        ).map((item) => (
          <View
            key={item.id}
            style={[
              styles.priorityItem,
              !isDesktopWeb && styles.priorityItemMobile,
              item.tone === 'warning' && styles.priorityItemWarning,
              item.tone === 'success' && styles.priorityItemSuccess,
            ]}
          >
            <Text style={[styles.priorityValue, !isDesktopWeb && styles.priorityValueMobile]}>{item.value}</Text>
            <Text style={styles.priorityLabel}>{item.label}</Text>
            <Text style={styles.priorityMeta}>
              {item.meta}
            </Text>
          </View>
        ))}
      </View>
      {todayOverview.myHorseSummaries[0] ? (
        <TouchableOpacity
          style={styles.priorityHorseButton}
          onPress={() => router.push(`/horses/${todayOverview.myHorseSummaries[0].horse.id}`)}
          activeOpacity={0.85}
        >
          <Feather name="activity" size={15} color={palette.primary} />
          <Text style={styles.priorityHorseButtonText}>
            Öppna {todayOverview.myHorseSummaries[0].horse.name}
            {todayOverview.myHorseSummaries[0].paddocks.length
              ? ` · ${todayOverview.myHorseSummaries[0].paddocks.map((paddock) => paddock.name).join(', ')}`
              : todayOverview.myHorseSummaries[0].paddockLinksUnconfirmed ? ' · Hage ej bekräftad' : ' · Ingen hage satt'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );

  const feedSection = currentStableId && feedFocus.totalCount > 0 ? (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.priorityCard, styles.feedingCard, isDesktopWeb && styles.desktopCardVisible]}
    >
      <View style={styles.priorityHeader}>
        <View style={styles.priorityTitleBlock}>
          <Text style={styles.priorityEyebrow}>Foder nu</Text>
          <Text style={[styles.priorityTitle, !isDesktopWeb && styles.priorityTitleMobile]}>
            {feedFocus.label}
          </Text>
          <Text style={styles.prioritySubtitle}>
            {`${feedFocus.checkedCount}/${feedFocus.totalCount} klart`}
            {feedFocus.deviationCount ? ` · ${feedFocus.deviationCount} avvikelser` : ''}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {feedFocus.items.slice(0, 5).map((item) => {
          const planLabel = item.plan?.label ?? 'Ingen plan satt';
          const amountLabel = item.plan?.amount;
          const isChecked = Boolean(item.check?.checkedAt);
          const hasDeviation = Boolean(item.check?.deviationNote);
          const deviationActive = feedDeviation?.horseId === item.horse.id;
          return (
            <View key={item.horse.id} style={{ gap: 8 }}>
              <View style={[styles.priorityNotice, styles.feedingRow, !isDesktopWeb && { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
                <View style={isDesktopWeb ? { flex: 1, minWidth: 0 } : undefined}>
                  <Text style={styles.priorityNoticeText}>
                    {`${item.horse.name} · ${planLabel}`}
                  </Text>
                  {amountLabel ? (
                    <Text style={[styles.priorityNoticeText, { color: palette.secondaryText }]}>
                      {amountLabel}
                    </Text>
                  ) : null}
                  {hasDeviation && !deviationActive ? (
                    <Text style={[styles.priorityNoticeText, { color: palette.secondaryText }]}>
                      {`Avvikelse: ${item.check?.deviationNote}`}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: isDesktopWeb ? 'flex-end' : 'flex-start' }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/horses/${item.horse.id}`)}
                    accessibilityRole="button"
                    activeOpacity={0.85}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: palette.surfaceTint }}
                  >
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primaryText }}>Profil</Text>
                  </TouchableOpacity>
                  {canCheckFeed ? (
                    <TouchableOpacity
                      onPress={() => handleFeedCheck(item.horse.id)}
                      disabled={feedSavingHorseId !== null}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: feedSavingHorseId !== null, busy: feedSavingHorseId === item.horse.id }}
                      activeOpacity={0.85}
                      style={{
                        minHeight: 44,
                        justifyContent: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: palette.surface,
                        borderWidth: 1,
                        borderColor: palette.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: theme.fonts.medium,
                          color: isChecked ? palette.secondaryText : palette.primaryText,
                        }}
                      >
                        {feedSavingHorseId === item.horse.id ? 'Sparar…' : isChecked ? 'Klart' : 'Markera klart'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {canCheckFeed ? (
                    <TouchableOpacity
                      onPress={() => handleFeedDeviationOpen(item.horse.id, item.check?.deviationNote ?? '')}
                      accessibilityRole="button"
                      disabled={feedSavingHorseId !== null}
                      activeOpacity={0.85}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: palette.surfaceTint }}
                    >
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primaryText }}>Avvikelse</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {feedSaveError?.horseId === item.horse.id ? (
                <Text style={{ fontFamily: theme.fonts.regular, color: palette.error, fontSize: 14 }}>
                  {feedSaveError.message}
                </Text>
              ) : null}
              {deviationActive ? (
                <View style={{ padding: 10, gap: 8, borderRadius: radius.md, backgroundColor: palette.surfaceTint }}>
                  <TextInput
                    multiline
                    value={feedDeviation?.text ?? ''}
                    editable={feedSavingHorseId === null}
                    onChangeText={(text) =>
                      setFeedDeviation((prev) => (prev ? { ...prev, text } : prev))
                    }
                    placeholder="Skriv en kort avvikelse, t.ex. Hösilage tog slut – ersatt med torrhö."
                    placeholderTextColor={palette.secondaryText}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      backgroundColor: palette.surface,
                      color: palette.primaryText,
                      fontSize: 14,
                      fontFamily: theme.fonts.regular,
                    }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setFeedDeviation(null)}
                      disabled={feedSavingHorseId !== null}
                      activeOpacity={0.85}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: palette.surface }}
                    >
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primaryText }}>Avbryt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleFeedDeviationSave}
                      disabled={feedSavingHorseId !== null}
                      accessibilityRole="button"
                      activeOpacity={0.85}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
                    >
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primaryText }}>
                        {feedSavingHorseId === item.horse.id ? 'Sparar…' : 'Spara avvikelse'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {feedFocus.totalCount > 5 ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/stable-horses')} style={styles.feedAllHorses}>
          <Text style={styles.priorityNoticeText}>{`Visa alla ${feedFocus.totalCount} hästar`}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  ) : null;

  const stableAlertsSection = activeStableAlerts.length ? (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.eventsCard, !isDesktopWeb && styles.stableAlertStrip, isDesktopWeb && styles.desktopCardVisible]}
    >
      {isDesktopWeb ? <View style={styles.eventsHeader}>
        <Text style={[styles.eventsTitle, !isDesktopWeb && styles.eventsTitleMobile]}>
          Viktigt
        </Text>
        <Text style={[styles.eventsMeta, !isDesktopWeb && styles.eventsMetaMobile]}>
          {`${activeStableAlerts.length} ${activeStableAlerts.length === 1 ? 'aktivt' : 'aktiva'}`}
        </Text>
      </View> : null}
      <View style={styles.eventsList}>
        {activeStableAlerts.map((alert) => (
          <View key={alert.id} style={styles.eventRow}>
            {isDesktopWeb ? <View
              style={[
                styles.eventDot,
                { backgroundColor: alert.severity === 'urgent' ? palette.error : palette.warning },
              ]}
            /> : <Text style={styles.stableAlertLabel}>{alert.severity === 'urgent' ? 'AKUT!' : 'OBS!'}</Text>}
            <View style={styles.eventBody}>
              <Text
                style={[styles.eventMessage, !isDesktopWeb && styles.eventMessageMobile]}
              >
                {alert.title}
              </Text>
              {alert.body ? (
                <Text style={styles.eventTime}>
                  {alert.body}
                </Text>
              ) : (
                <Text style={styles.eventTime}>{formatEventTime(alert.createdAt)}</Text>
              )}
            </View>
            {canResolveStableAlerts ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Markera ${alert.title} som löst`}
                disabled={Boolean(resolvingAlertId)}
                style={styles.alertResolveButton}
                onPress={() => handleResolveStableAlert(alert.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.alertResolveText}>{resolvingAlertId === alert.id ? 'Sparar…' : 'Löst'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
      {alertResolveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{alertResolveError}</Text>}
    </Card>
  ) : null;

  const eventsSection = recentEvents.length ? (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.eventsCard, !isDesktopWeb && styles.eventsCardMobile, isDesktopWeb && styles.desktopCardVisible]}
    >
      <View style={styles.eventsHeader}>
        <Text style={[styles.eventsTitle, !isDesktopWeb && styles.eventsTitleMobile]}>
          Händelser
        </Text>
        <Text style={[styles.eventsMeta, !isDesktopWeb && styles.eventsMetaMobile]}>
          {`${alerts.length} totalt`}
        </Text>
      </View>
      <View style={styles.eventsList}>
        {recentEvents.map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <View
              style={[
                styles.eventDot,
                { backgroundColor: event.type === 'critical' ? palette.error : palette.primary },
              ]}
            />
            <View style={styles.eventBody}>
              <Text
                style={[styles.eventMessage, !isDesktopWeb && styles.eventMessageMobile]}
                numberOfLines={1}
              >
                {event.message}
              </Text>
              <Text style={styles.eventTime}>{formatEventTime(event.createdAt)}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  ) : null;

  const missedSection = (
    <Card
      tone={isDesktopWeb ? 'default' : 'muted'}
      style={[styles.missedCard, !isDesktopWeb && styles.missedCardMobile, isDesktopWeb && styles.desktopCardVisible]}
    >
      <View style={styles.missedHeader}>
        <Text style={[styles.missedTitle, !isDesktopWeb && styles.missedTitleMobile]}>
          Missade pass
        </Text>
        <Text style={[styles.missedMeta, !isDesktopWeb && styles.missedMetaMobile]}>
          {`${missedAssignments.length} totalt`}
        </Text>
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
      <TouchableOpacity style={styles.missedAction} onPress={handleOpenCalendar} activeOpacity={0.85}>
        <Text style={styles.missedActionText}>Öppna kalendern</Text>
      </TouchableOpacity>
    </Card>
  );

  const quickActionsSection = (
    <View style={styles.quickActionsSection}>
      <Text style={styles.sectionTitle}>Nära till hands</Text>
      <View style={styles.quickActionGrid}>
        {quickActions.map((action) => (
          <QuickActionCard
            key={action.id}
            action={action}
            isDesktop={isDesktopWeb}
            onPress={handleQuickActionPress}
          />
        ))}
      </View>
    </View>
  );

  const summaryContent = (
    <View style={styles.summarySection}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={[styles.summaryTitle, !isDesktopWeb && styles.summaryTitleMobile]}>
            Dagens pass
          </Text>
          <Text style={[styles.summarySubtitle, !isDesktopWeb && styles.summarySubtitleMobile]}>
            {hasTodayAssignments ? 'Status för dagens pass' : 'Inga pass idag'}
          </Text>
        </View>
        {hasTodayAssignments ? (
          <View style={[styles.summaryBadge, !isDesktopWeb && styles.summaryBadgeMobile]}>
            <Feather name="clock" size={14} color={palette.primary} />
            <Text style={styles.summaryBadgeText}>{derived.summary.nextUpdateLabel}</Text>
          </View>
        ) : null}
      </View>
      {hasTodayAssignments ? (
        <View style={[styles.summaryTiles, isDesktopWeb && styles.summaryTilesDesktop]}>
          {summaryStats.map((item) => (
            <View
              key={item.id}
              style={[styles.summaryTile, !isDesktopWeb && styles.summaryTileMobile]}
            >
              <Text style={styles.summaryValue}>{item.value}</Text>
              <Text style={[styles.summaryLabel, !isDesktopWeb && styles.summaryLabelMobile]}>
                {item.label}
              </Text>
              {item.meta ? (
                <Text style={[styles.summaryMeta, !isDesktopWeb && styles.summaryMetaMobile]}>
                  {item.meta}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.summaryEmpty}>Lägg till pass i kalendern för att se status här.</Text>
      )}
      {recentActivities.length > 0 ? (
        <View style={styles.activityColumn}>
          <Text style={styles.activityTitle}>Senaste aktivitet</Text>
          <View style={styles.activityRow}>
            {recentActivities.map(({ activity, count }) => (
              <View key={activity.id} style={styles.activityChip}>
                <Text style={styles.activityChipText}>
                  {activity.label}
                  {count > 1 ? ` ×${count}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const summarySection = isDesktopWeb ? (
    <Card tone="default" style={[styles.summaryCard, styles.desktopCardVisible]}>
      {summaryContent}
    </Card>
  ) : (
    summaryContent
  );

  const messagesSection = (
    <View style={[styles.sectionBlock, isDesktopWeb && styles.sectionBlockDesktop]}>
      <SectionHeader title="Nya meddelanden" count={activeMessages.length} expanded={messagesExpanded} onPress={handleMessagePress} />
      {activeMessages.length === 0 ? (
        <Text style={styles.actionEmptyText}>Inga meddelanden i det här stallet ännu.</Text>
      ) : null}
      {visibleMessages.map((message, index) => {
        const isPrimaryCard = index === 0;
        const stacked = isPrimaryCard && !messagesExpanded && activeMessages.length > 1;

        return (
          <StackedCard
            key={message.id}
            offset={stacked ? [6, 16] : undefined}
            stacked={stacked}
            onPress={() => router.push(`/chat/${message.id}`)}
            accessibilityLabel={`Öppna konversation med ${message.title}`}
            cardStyle={styles.messageCard}
          >
            <View style={styles.messageRow}>
              {message.group ? (
                <View style={styles.groupAvatar}>
                  <UserGroupsIcon />
                </View>
              ) : (
                <Avatar
                  source={message.avatar}
                  style={styles.messageAvatar}
                />
              )}
              <View style={styles.messageContent}>
                <View style={styles.messageHeader}>
                  <View style={styles.messageTitleBlock}>
                    <Text style={styles.messageTitle}>{message.title}</Text>
                    {message.unreadCount ? (
                      <View style={styles.messageBadge}>
                        <Text style={styles.messageBadgeText}>{message.unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.messageTime}>{message.timeAgo}</Text>
                </View>
                <Text style={styles.messageAuthor}>{message.subtitle}</Text>
                <Text numberOfLines={1} style={styles.messagePreview}>
                  {message.description}
                </Text>
              </View>
            </View>
          </StackedCard>
        );
      })}
      {messagesExpanded && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Visa färre nya meddelanden" style={styles.collapseButton} onPress={handleMessagePress}>
          <Text style={styles.collapseButtonText}>Visa mindre ↑</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const postsSection = (
    <View style={[styles.sectionBlock, isDesktopWeb && styles.sectionBlockDesktop]}>
      <SectionHeader title="Senaste inlägg" count={activePosts.length} expanded={postsExpanded} onPress={handlePostPress} />
      {activePosts.length === 0 ? (
        <Text style={styles.actionEmptyText}>Inga inlägg i det här stallet ännu.</Text>
      ) : null}
      {visiblePosts.map((post, index) => {
        const isPrimaryCard = index === 0;
        const stacked = isPrimaryCard && !postsExpanded && activePosts.length > 1;
        const postTimeAgo = post.createdAt ? formatTimeAgo(post.createdAt) : post.timeAgo;
        const postDateLabel = post.createdAt ? formatShortDate(post.createdAt) : 'Idag';

        return (
          <StackedCard
            key={post.id}
            offset={stacked ? [8, 20] : undefined}
            stacked={stacked}
            onPress={isPrimaryCard ? handlePostPress : undefined}
            cardStyle={styles.postCard}
          >
            <View style={styles.postHeader}>
              <View style={styles.postContent}>
                <Text style={styles.postAuthor}>{post.author}</Text>
                {post.content ? <Text style={styles.postBody}>{post.content}</Text> : null}
              </View>
              <View style={styles.postMeta}>
                <Text style={styles.postMetaDay}>{postDateLabel}</Text>
                <Text style={styles.postMetaTime}>{postTimeAgo}</Text>
              </View>
            </View>
            <View style={styles.postFooter}>
              <View style={styles.postStat}>
                <HeartIcon />
                <Text style={styles.postStatText}>{post.likes}</Text>
              </View>
              <View style={styles.postStat}>
                <SpeechBubbleIcon />
                <Text style={styles.postStatText}>{post.comments}</Text>
              </View>
            </View>
          </StackedCard>
        );
      })}
      {postsExpanded && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Visa färre senaste inlägg" style={styles.collapseButton} onPress={handlePostPress}>
          <Text style={styles.collapseButtonText}>Visa mindre ↑</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const firstName = state.users[currentUserId]?.name?.trim().split(/\s+/)[0];
  const openTodayAssignment = todayOverview.openTasksToday[0];
  const overviewSection = (
    <View style={styles.workspaceHero}>
      <View style={styles.workspaceGreeting}>
        <Text style={styles.workspaceDate}>{todayDateLabel}</Text>
        <Text accessibilityRole="header" style={styles.workspaceTitle}>{firstName ? `Hej, ${firstName}.` : 'Välkommen till stallet.'}</Text>
        <Text style={styles.workspaceSubtitle}>En liten överblick. En lugnare stallvardag.</Text>
      </View>
      <WeatherPanel stableLocation={stableLocation} isDesktop={isDesktopWeb} onEditLocation={isOwner ? () => router.push('/(onboarding)/stable-details') : undefined} />
    </View>
  );
  const nextPassSection = (
    <View style={styles.workspaceSection}>
      <View style={styles.workspaceSectionHeader}>
        <Text accessibilityRole="header" style={styles.workspaceSectionTitle}>Mitt närmaste pass</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/calendar?view=mine')} style={styles.workspaceTextAction}>
          <Text style={styles.workspaceLink}>Mitt schema</Text>
        </TouchableOpacity>
      </View>
      <Card style={styles.workspaceNextPass}>
        {myNextAssignment ? <>
          <View style={styles.workspaceSectionHeader}>
            <Text style={styles.workspaceDate}>{myNextAssignment.date === todayIso ? 'Idag' : formatShortDate(myNextAssignment.date)} · {myNextAssignmentTimeLabel}</Text>
            <Text style={styles.workspacePersonalLabel}>Ditt pass</Text>
          </View>
          <View style={styles.workspacePassHeading}>
            <View style={styles.workspaceTypeIcon}><AppIcon name="calendar" size={23} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.workspacePassTitle}>{myNextAssignment.label}</Text>
              <Text style={styles.workspaceSubtitle}>{stableName}</Text>
            </View>
          </View>
          {derived.cleanAssignmentNote(myNextAssignment.note) ? <Text style={styles.workspacePassNote}>{derived.cleanAssignmentNote(myNextAssignment.note)}</Text> : null}
          <View style={styles.workspacePassFooter}>
            <Text style={styles.workspaceSubtitle}>Detaljer, instruktioner och klarmarkering.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Öppna mitt pass" onPress={() => handleOpenAssignment(myNextAssignment.id)} style={styles.workspaceButton} activeOpacity={0.8}>
              <Feather name="arrow-right" size={17} color={palette.primaryText} /><Text style={styles.workspaceButtonText}>Öppna mitt pass</Text>
            </TouchableOpacity>
          </View>
        </> : <>
          <Text style={styles.workspacePassTitle}>Inget pass tilldelat just nu.</Text>
          <Text style={styles.workspacePassNote}>Dina kommande pass visas här. Du kan också se vad som är ledigt i schemat.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/calendar?view=open')} style={styles.workspaceButton}><Text style={styles.workspaceButtonText}>Se lediga pass</Text><Feather name="arrow-right" size={17} color={palette.primaryText} /></TouchableOpacity>
        </>}
      </Card>
    </View>
  );
  const agendaSection = (
    <View style={styles.workspaceSection}>
      <View style={styles.workspaceSectionHeader}>
        <Text accessibilityRole="header" style={styles.workspaceSectionTitle}>Dagen i stallet</Text>
        <TouchableOpacity accessibilityRole="button" onPress={handleOpenCalendar} style={styles.workspaceTextAction}><Text style={styles.workspaceLink}>Hela schemat</Text></TouchableOpacity>
      </View>
      <Card style={styles.workspaceAgenda}>
        {todayAgendaAssignments.map((assignment) => (
          <TouchableOpacity key={assignment.id} accessibilityRole="button" accessibilityLabel={`Öppna ${assignment.label} ${assignment.time}`} onPress={() => handleOpenAssignment(assignment.id)} style={styles.workspaceAgendaRow} activeOpacity={0.8}>
            <Text style={styles.workspaceTime}>{assignment.time}</Text>
            <View style={styles.workspaceAgendaIcon}><Feather name={assignment.status === 'completed' ? 'check' : 'clock'} size={17} color={palette.primaryText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.workspaceAgendaTitle}>{assignment.label}</Text>
              <Text style={styles.workspaceSubtitle}>{assignment.status === 'completed' ? 'Klart · ' : ''}{assignment.assigneeId ? state.users[assignment.assigneeId]?.name ?? 'Tilldelad medlem' : 'Ledigt · Ansvarig behövs'}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={palette.secondaryText} />
          </TouchableOpacity>
        ))}
        {!todayAgendaAssignments.length ? <View style={styles.workspaceEmpty}><Text style={styles.workspaceAgendaTitle}>Inga stallpass idag</Text><Text style={styles.workspaceSubtitle}>Kommande pass och stallets övriga aktiviteter finns i schemat.</Text></View> : null}
      </Card>
    </View>
  );
  const horseStatusSection = (
    <View style={styles.workspaceSection}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Häststatus & ansvar" accessibilityState={{ expanded: horseStatusExpanded }} onPress={() => setHorseStatusExpanded(value => !value)} style={styles.workspaceDisclosure}>
        <AppIcon name="horse" size={22} focused /><Text style={styles.workspaceDisclosureText}>Häststatus & ansvar</Text><Feather name={horseStatusExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.primaryText} />
      </TouchableOpacity>
      {horseStatusExpanded ? prioritySection : null}
    </View>
  );

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Idag"
          primaryAction={
            <HeaderIconButton accessibilityLabel="Sök" onPress={handleOpenSearch}>
              <SearchIcon />
            </HeaderIconButton>
          }
        />
        {!isDesktopWeb ? <StableSwitcher showAccess showLocation={false} /> : null}
        <View style={[styles.syncStatus, isDesktopWeb && styles.pageHeaderDesktop]}><DataSyncStatus /></View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {startHereSection}
          {stableAlertsSection}
          {overviewSection}
          {openTodayAssignment ? <TouchableOpacity accessibilityRole="button" onPress={() => handleOpenAssignment(openTodayAssignment.id)} style={styles.workspaceStaffing} activeOpacity={0.8}>
            <Feather name="users" size={20} color={palette.warning} />
            <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.workspaceAgendaTitle}>Ett pass behöver bemannas</Text><Text style={styles.workspaceSubtitle}>{openTodayAssignment.label} · {openTodayAssignment.time}</Text></View>
            <Feather name="chevron-right" size={18} color={palette.secondaryText} />
          </TouchableOpacity> : null}
          <View style={isDesktopWeb ? styles.desktopRow : styles.workspaceSection}>
            <View style={isDesktopWeb ? styles.desktopRowMain : styles.workspaceSection}>
              {nextPassSection}
              {agendaSection}
              {quickActionsSection}
              {feedSection}
            </View>
            <View style={isDesktopWeb ? styles.desktopRowSide : styles.workspaceSection}>
              {summarySection}
              {horseStatusSection}
              {postsSection}
              {messagesSection}
              {missedAssignments.length ? missedSection : null}
              {eventsSection}
            </View>
          </View>
      </ScrollView>
    </SafeAreaView>
      <QuickActionSheet
        visible={eventsModalVisible}
        title="Händelser"
        description="Skriv en kort uppdatering till stallet (t.ex. tappskor, hagbyte, parkering)."
        onClose={() => { if (!eventSavingRef.current) setEventsModalVisible(false); }}
        primaryLabel={eventSaving ? 'Sparar…' : 'Skicka'}
        primaryDisabled={!isEventValid || eventSaving}
        onPrimary={isEventValid ? handleSubmitEvent : undefined}
      >
        <View style={styles.eventKindRow}>
          {[
            { id: 'event', label: 'Händelse' },
            { id: 'important', label: 'Viktigt' },
            { id: 'urgent', label: 'Akut' },
          ].map((option) => {
            const active = eventKind === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: eventSaving }}
                {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
                style={[styles.eventKindChip, active && styles.eventKindChipActive]}
                disabled={eventSaving}
                onPress={() => setEventKind(option.id as typeof eventKind)}
                activeOpacity={0.85}
              >
                <Text style={[styles.eventKindText, active && styles.eventKindTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          editable={!eventSaving}
          multiline
          value={eventText}
          onChangeText={setEventText}
          placeholder="Ex. Kanel har tappat en sko. / Parkera inte vid containern."
          placeholderTextColor={palette.secondaryText}
          style={[styles.reportInput, styles.reportInputCompact]}
        />
        {eventSaveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{eventSaveError}</Text>}
        <Text style={styles.reportHint}>
          {eventKind === 'event'
            ? 'Händelsen hamnar i listan “Händelser” i överblicken.'
            : 'Viktiga och akuta notiser visas högre upp på Idag.'}
        </Text>
      </QuickActionSheet>

      <Modal visible={tourVisible} transparent animationType="fade" onRequestClose={closeTour}>
        <View style={styles.tourOverlay}>
          <View style={styles.tourCard}>
            <View style={styles.tourBadge}>
              <Text style={styles.tourBadgeText}>Guidad tur</Text>
            </View>
            <Text style={styles.tourTitle}>{tourSteps[tourStep].title}</Text>
            <Text style={styles.tourText}>{tourSteps[tourStep].text}</Text>
            <View style={styles.tourDots}>
              {tourSteps.map((_, idx) => (
                <View key={idx} style={[styles.tourDot, idx === tourStep && styles.tourDotActive]} />
              ))}
            </View>
            <View style={styles.tourActions}>
              <TouchableOpacity style={styles.tourSecondary} onPress={closeTour} activeOpacity={0.85}>
                <Text style={styles.tourSecondaryText}>Hoppa över</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tourPrimary} onPress={nextTour} activeOpacity={0.9}>
                <Text style={styles.tourPrimaryText}>
                  {tourStep === tourSteps.length - 1 ? 'Klar' : 'Nästa'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

function WeatherPanel({ stableLocation, onEditLocation, isDesktop = false }: { stableLocation?: string; onEditLocation?: () => void; isDesktop?: boolean }) {
  const { data: weather, status, error, retry } = useWeather(stableLocation);
  const locationError = error === 'Ort ej hittad' || error === 'Ange stallets ort';
  const canPress = Boolean(weather) || (status === 'error' && (!locationError || Boolean(onEditLocation)));
  const symbol = weather?.symbol;
  const icon = !weather ? 'cloud-off'
    : symbol === 1 || symbol === 2 ? 'sun'
      : symbol === 7 ? 'wind'
        : symbol === 11 || symbol === 21 ? 'cloud-lightning'
          : symbol && ((symbol >= 12 && symbol <= 17) || symbol >= 22) ? 'cloud-snow'
            : symbol && symbol >= 8 ? 'cloud-rain' : 'cloud';
  return (
    <TouchableOpacity
      disabled={!canPress}
      accessibilityRole={weather ? 'link' : canPress ? 'button' : undefined}
      accessibilityState={{ disabled: !canPress, busy: status === 'loading' }}
      accessibilityLabel={weather ? `Prognos för ${weather.location}: cirka ${weather.temperature} grader, ${weather.summary}. Kommande 24 timmar högst ${weather.high} och lägst ${weather.low} grader. Källa SMHI, uppdaterad ${weather.updatedAt}, avrundade värden. Öppna SMHI.` : canPress ? locationError ? 'Ändra stallets ort' : 'Hämta vädret igen' : undefined}
      activeOpacity={0.85}
      onPress={() => {
        if (weather) {
          void Linking.openURL('https://www.smhi.se/vader').catch(() => console.warn('[weather] Could not open SMHI.'));
        } else if (locationError) {
          onEditLocation?.();
        } else {
          retry();
        }
      }}
    >
    <LinearGradient colors={theme.gradients.weather} style={[styles.weatherTile, isDesktop && styles.weatherTileDesktop]}>
      <View>
        <Text numberOfLines={1} style={[styles.weatherTileLocation, isDesktop && styles.weatherTileLocationDesktop]}>{weather?.location ?? (stableLocation?.trim() || 'Väder')}</Text>
        <Text style={styles.weatherTileTemperature}>{weather ? '≈' : ''}{weather ? `${weather.temperature}°` : '—'}</Text>
      </View>
      {status !== 'error' ? <View style={styles.weatherTileIcon}>
        {status === 'loading' ? <ActivityIndicator size="small" color={palette.primaryText} /> : <Feather name={icon} size={26} color={palette.primaryText} />}
      </View> : null}
      <View>
        <Text numberOfLines={2} style={styles.weatherTileCaption}>{weather?.summary ?? (status === 'loading' ? 'Hämtar väder' : error ?? 'Ej tillgängligt')}</Text>
        {weather ? <>
          <Text style={styles.weatherTileSource}>24h H:{weather.high}° L:{weather.low}°</Text>
          <Text style={styles.weatherTileSource}>SMHI · {weather.updatedAt}</Text>
        </> : status === 'error' ? (
          <Text style={[styles.weatherTileAction, canPress && { textDecorationLine: 'underline' }]}>
            {locationError ? onEditLocation ? 'Ändra ort' : 'Be ägaren ändra ort' : 'Försök igen'}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
    </TouchableOpacity>
  );
}

const QuickActionCard = React.memo(function QuickActionCard({
  action,
  onPress,
  isDesktop,
}: {
  action: QuickAction;
  onPress?: (action: QuickAction) => void;
  isDesktop?: boolean;
}) {
  const iconColor = action.tint === 'warning' ? palette.warning : palette.primary;

  return (
    <Pressable
        disabled={action.disabled}
        onPress={() => onPress?.(action)}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [
          styles.quickActionCard,
          isDesktop && styles.quickActionCardDesktop,
          pressed && !action.disabled && styles.quickActionCardPressed,
          action.disabled && styles.quickActionCardDisabled,
        ]}
      >
      <View
        style={[
          styles.quickActionInner,
          !isDesktop && styles.quickActionInnerMobile,
          action.disabled && styles.quickActionInnerDisabled,
        ]}
      >
        {action.highlight && !action.disabled ? (
          <View style={[styles.quickActionBadge, { backgroundColor: iconColor }]} />
        ) : null}
        <View style={styles.quickActionIcon}>
          <Feather
            name={action.icon}
            size={18}
            color={action.disabled ? palette.secondaryText : iconColor}
          />
        </View>
        <View style={styles.quickActionText}>
          <Text
            numberOfLines={1}
            style={[styles.quickActionLabel, !isDesktop && styles.quickActionLabelMobile]}
          >
            {action.label}
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.quickActionCaption, !isDesktop && styles.quickActionCaptionMobile]}
          >
            {action.caption}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

type QuickActionSheetProps = {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

function QuickActionSheet({
  visible,
  title,
  description,
  onClose,
  children,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: QuickActionSheetProps) {
  const hasActions = Boolean(primaryLabel || secondaryLabel);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Stäng ${title.toLowerCase()}`} style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            {description ? <Text style={styles.sheetDescription}>{description}</Text> : null}
          </View>
          <View style={styles.sheetContent}>{children}</View>
          {hasActions ? (
            <View style={styles.sheetActions}>
              {secondaryLabel ? (
                <TouchableOpacity
                  style={styles.sheetSecondaryButton}
                  onPress={() => {
                    onSecondary?.();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sheetSecondaryLabel}>{secondaryLabel}</Text>
                </TouchableOpacity>
              ) : null}
              {primaryLabel ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                  style={[
                    styles.sheetPrimaryButton,
                    primaryDisabled && styles.sheetPrimaryButtonDisabled,
                  ]}
                  onPress={() => {
                    if (!primaryDisabled) {
                      onPrimary?.();
                    }
                  }}
                  disabled={primaryDisabled}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.sheetPrimaryLabel,
                      primaryDisabled && styles.sheetPrimaryLabelDisabled,
                    ]}
                  >
                    {primaryLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const SectionHeader = React.memo(function SectionHeader({ title, count, expanded, onPress }: { title: string; count: number; expanded?: boolean; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionDot} />
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {count > 1 ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Visa ${expanded ? 'färre' : 'fler'} ${title.toLowerCase()}`} onPress={onPress} style={styles.sectionMore}>
          <Text style={styles.sectionAction}>{expanded ? 'Visa mindre ↑' : 'Visa mer ↓'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const StackedCard = React.memo(function StackedCard({
  children,
  offset,
  onPress,
  accessibilityLabel,
  cardStyle,
  stacked = true,
  layerColors,
}: {
  children: React.ReactNode;
  offset?: [number, number];
  onPress?: () => void;
  accessibilityLabel?: string;
  cardStyle?: StyleProp<ViewStyle>;
  stacked?: boolean;
  layerColors?: {
    base?: string;
    top?: string;
  };
}) {
  const [firstOffset = 6, secondOffset = 14] = offset ?? [6, 14];

  return (
    <View style={[styles.stackedWrapper, !stacked && styles.stackedWrapperFlat]}>
      {stacked && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.stackLayer,
              layerColors?.base && { backgroundColor: layerColors.base },
              { transform: [{ translateY: secondOffset }] },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.stackLayer,
              layerColors?.top && { backgroundColor: layerColors.top },
              { transform: [{ translateY: firstOffset }] },
            ]}
          />
        </>
      )}
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryCard,
          cardStyle,
          pressed && onPress && styles.primaryCardPressed,
        ]}
      >
        {children}
      </Pressable>
    </View>
  );
});

function formatEventTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleString('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  workspaceHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 14 },
  workspaceGreeting: { flex: 1, minWidth: 0, gap: 10 },
  workspaceDate: { fontFamily: theme.fonts.medium, fontSize: 11, lineHeight: 17, color: palette.secondaryText },
  workspaceTitle: { fontFamily: theme.fonts.semibold, fontSize: 30, lineHeight: 37, letterSpacing: -1, color: palette.primaryText },
  workspaceSubtitle: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 19, color: palette.secondaryText },
  workspaceSection: { gap: 18 },
  workspaceSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  workspaceSectionTitle: { fontFamily: theme.fonts.semibold, fontSize: 18, lineHeight: 25, letterSpacing: -0.4, color: palette.primaryText },
  workspaceTextAction: { minHeight: 44, justifyContent: 'center' },
  workspaceLink: { fontFamily: theme.fonts.medium, fontSize: 12, color: palette.primary },
  workspaceNextPass: { padding: 22, gap: 21 },
  workspacePersonalLabel: { fontFamily: theme.fonts.medium, fontSize: 11, color: palette.success },
  workspacePassHeading: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  workspaceTypeIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: palette.surfaceTint, alignItems: 'center', justifyContent: 'center' },
  workspacePassTitle: { fontFamily: theme.fonts.semibold, fontSize: 22, lineHeight: 29, letterSpacing: -0.6, color: palette.primaryText },
  workspacePassNote: { fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 23, color: palette.secondaryText },
  workspacePassFooter: { gap: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: palette.border },
  workspaceButton: { alignSelf: 'flex-start', minHeight: 46, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  workspaceButtonText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: palette.primaryText },
  workspaceAgenda: { paddingHorizontal: 20, paddingVertical: 5 },
  workspaceAgendaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  workspaceTime: { width: 38, fontFamily: theme.fonts.regular, fontSize: 11, color: palette.secondaryText },
  workspaceAgendaIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.surfaceTint, alignItems: 'center', justifyContent: 'center' },
  workspaceAgendaTitle: { fontFamily: theme.fonts.semibold, fontSize: 13, lineHeight: 20, color: palette.primaryText },
  workspaceEmpty: { paddingVertical: 23, gap: 5 },
  workspaceStaffing: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: palette.surfaceTint, borderRadius: 14, borderWidth: 1, borderColor: palette.border },
  workspaceDisclosure: { minHeight: 52, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.border, borderRadius: 13 },
  workspaceDisclosureText: { flex: 1, fontFamily: theme.fonts.medium, fontSize: 13, color: palette.primaryText },
  overviewSection: { gap: 10 },
  overviewRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  calendarPreview: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F5F5F5',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
  },
  calendarToday: { flex: 1, minWidth: 0, gap: 3 },
  calendarWeekday: { fontFamily: theme.fonts.semibold, fontSize: 11, lineHeight: 14, color: '#2196F3', textTransform: 'uppercase' },
  calendarDate: { fontFamily: theme.fonts.regular, fontSize: 20, lineHeight: 24, color: palette.primaryText },
  calendarTag: { paddingHorizontal: 4, paddingVertical: 1, backgroundColor: '#E5F5FF', borderLeftWidth: 1.5, borderLeftColor: palette.primary, borderRadius: 2 },
  calendarTagOpen: { backgroundColor: '#FFE5E5', borderLeftColor: palette.error },
  calendarTagText: { fontFamily: theme.fonts.regular, fontSize: 10, lineHeight: 13, color: palette.primaryText },
  calendarNext: { flex: 1, minWidth: 0, gap: 8, justifyContent: 'center' },
  calendarNextDay: { gap: 3 },
  calendarNextDate: { fontFamily: theme.fonts.medium, fontSize: 10, lineHeight: 13, color: palette.secondaryText },
  previewEmpty: { fontFamily: theme.fonts.regular, fontSize: 11, lineHeight: 15, color: palette.secondaryText },
  horsePreview: { flex: 1, minWidth: 0, minHeight: 100, padding: 10, gap: 5, borderRadius: 12, backgroundColor: '#F5F5F5' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  previewTitle: { fontFamily: theme.fonts.regular, fontSize: 17, lineHeight: 22, color: palette.primaryText },
  previewBody: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 16, color: palette.primaryText },
  quickPreview: { flex: 1, minWidth: 0, minHeight: 100, padding: 10, borderRadius: 12, backgroundColor: '#0099FF', justifyContent: 'space-between' },
  quickPreviewTitle: { fontFamily: theme.fonts.regular, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  quickPreviewActions: { flexDirection: 'row', gap: 8 },
  quickPreviewButton: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  quickPreviewPill: { minHeight: 26, justifyContent: 'center', alignItems: 'center', borderRadius: 999, backgroundColor: '#FFFFFF' },
  quickPreviewButtonText: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 16, color: palette.primaryText },
  feedingCard: { padding: 14, borderRadius: 12, borderColor: '#F5F5F5', backgroundColor: '#FFFFFF', gap: 10 },
  feedingRow: { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 4, borderRadius: 0 },
  sectionMore: { minHeight: 44, paddingLeft: 12, justifyContent: 'center' },
  syncStatus: { paddingHorizontal: 20 },
  weatherTile: { width: 114, minHeight: 126, borderRadius: 16, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'space-between', gap: 9 },
  weatherTileDesktop: { width: 220, paddingHorizontal: 16, paddingVertical: 14 },
  weatherTileLocation: { fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 15, color: palette.primaryText, maxWidth: 80 },
  weatherTileLocationDesktop: { maxWidth: 170 },
  weatherTileTemperature: { fontFamily: theme.fonts.semibold, fontSize: 17, lineHeight: 22, color: palette.primaryText },
  weatherTileCaption: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 15, color: palette.primaryText },
  weatherTileSource: { fontFamily: theme.fonts.regular, fontSize: 10, lineHeight: 13, color: palette.primaryText },
  weatherTileAction: { fontFamily: theme.fonts.medium, fontSize: 11, lineHeight: 15, color: palette.primaryText, marginTop: 4 },
  weatherTileIcon: { position: 'absolute', right: 12, top: 36, width: 30, height: 30 },
  background: {
    flex: 1,
    backgroundColor: color.bg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 20,
  },
  scrollContentDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 0,
    paddingBottom: 40,
    gap: 20,
  },
  todayHeading: {
    gap: 5,
    paddingBottom: 2,
  },
  todayContext: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  todayTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    letterSpacing: 0,
    color: palette.primaryText,
  },
  todaySubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    width: '100%',
  },
  desktopRowMain: {
    flex: 1.2,
    minWidth: 0,
    gap: 20,
  },
  desktopRowSide: {
    flex: 0.8,
    minWidth: 0,
    gap: 20,
  },
  desktopClamp: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    marginBottom: 0,
  },
  alertCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 0,
    backgroundColor: '#FFECEC',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    color: palette.error,
  },
  alertText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: palette.primaryText,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: 0,
    marginBottom: 0,
  },
  quickActionsSection: {
    gap: 12,
  },
  eventsCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 12,
    borderRadius: radius.lg,
  },
  eventsCardMobile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  stableAlertStrip: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  stableAlertLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: '#FF0000',
    alignSelf: 'flex-start',
    paddingTop: 6,
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  eventsTitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
    color: palette.primaryText,
    letterSpacing: 0,
  },
  eventsTitleMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
  },
  eventsMeta: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  eventsMetaMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
  },
  eventsList: {
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  eventMessage: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: palette.primaryText,
    fontWeight: '500',
    lineHeight: 20,
  },
  eventMessageMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  eventTime: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  alertResolveButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  alertResolveText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  feedAllHorses: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
  },
  missedCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 16,
    borderRadius: radius.lg,
  },
  missedCardMobile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  missedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  missedTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 20,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -0.3,
  },
  missedTitleMobile: {
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    fontWeight: '600',
  },
  missedMeta: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  missedMetaMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
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
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: palette.primaryText,
    fontWeight: '500',
  },
  missedTime: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  missedEmpty: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: palette.secondaryText,
  },
  missedAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  missedActionText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },
  quickActionCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  quickActionCardDesktop: {
    flexBasis: '22%',
    minWidth: 0,
    flexGrow: 1,
  },
  quickActionCardPressed: {
    opacity: 0.8,
  },
  quickActionCardDisabled: {
    opacity: 0.7,
  },
  quickActionInner: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 0,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  quickActionInnerMobile: {
    paddingHorizontal: 14,
  },
  quickActionInnerDisabled: {
    opacity: 0.7,
  },
  quickActionBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.card,
    backgroundColor: palette.primary,
  },
  quickActionIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    gap: 3,
  },
  quickActionLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
    letterSpacing: 0,
  },
  quickActionLabelMobile: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    letterSpacing: 0,
    fontWeight: '500',
  },
  quickActionCaption: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: palette.secondaryText,
  },
  quickActionCaptionMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: palette.secondaryText,
  },
  startHereCard: {
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderWidth: 0,
    gap: 18,
    borderRadius: radius.xl,
  },
  startHereCardMobile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,22,34,0.08)',
    backgroundColor: palette.surface,
  },
  startHereHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  startHereTitleBlock: {
    flex: 1,
    gap: 6,
  },
  startHereTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 22,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -0.3,
  },
  startHereSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  startHereBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  startHereBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    fontWeight: '700',
    color: palette.primaryText,
  },
  startHereList: {
    gap: 10,
  },
  startHereRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startHereDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.primary,
  },
  startHereText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.primaryText,
  },
  startHereTextDone: {
    color: palette.mutedText,
    textDecorationLine: 'line-through',
  },
  startHereActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  startHerePrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  startHerePrimaryText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  startHereSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  startHereSecondaryText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  startHereHint: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  startHereHintText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  priorityCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 12,
    borderRadius: 12,
  },
  priorityCardMobile: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  priorityTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  priorityEyebrow: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    fontWeight: '500',
    color: palette.primary,
    textTransform: 'uppercase',
  },
  priorityTitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
    color: palette.primaryText,
  },
  priorityTitleMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
  },
  prioritySubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: palette.secondaryText,
  },
  priorityRolePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  priorityRoleText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
    fontWeight: '700',
    color: palette.primaryText,
  },
  priorityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
  },
  priorityNoticeText: {
    fontFamily: theme.fonts.regular,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: palette.primaryText,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  priorityGridDesktop: {
    flexWrap: 'wrap',
  },
  priorityItem: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 130,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 4,
  },
  priorityItemWarning: {
    borderColor: 'rgba(238, 166, 45, 0.38)',
    backgroundColor: 'rgba(255, 246, 230, 0.82)',
  },
  priorityItemMobile: {
    flexBasis: '45%',
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  priorityValueMobile: { fontSize: 20 },
  priorityItemSuccess: {
    borderColor: 'rgba(36, 153, 100, 0.22)',
    backgroundColor: 'rgba(235, 249, 241, 0.8)',
  },
  priorityValue: {
    fontFamily: theme.fonts.medium,
    fontSize: 20,
    fontWeight: '500',
    color: palette.primaryText,
  },
  priorityLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  priorityMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: palette.secondaryText,
  },
  priorityHorseButton: {
    minHeight: 42,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceTint,
  },
  priorityHorseButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  summarySection: {
    gap: 16,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    marginTop: 0,
    paddingHorizontal: 2,
  },
  summaryCard: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 16,
    borderRadius: radius.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryTitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
    color: palette.primaryText,
    letterSpacing: 0,
  },
  summaryTitleMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: 0,
  },
  summarySubtitle: {
    fontFamily: theme.fonts.regular,
    marginTop: 4,
    fontSize: 15,
    color: palette.secondaryText,
  },
  summarySubtitleMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.mutedText,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  summaryBadgeMobile: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  summaryBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
  summaryTiles: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    marginTop: 0,
  },
  summaryTilesDesktop: {
    gap: 16,
  },
  summaryEmpty: {
    fontFamily: theme.fonts.regular,
    marginTop: 8,
    fontSize: 13,
    color: palette.mutedText,
  },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    gap: 5,
  },
  summaryTileMobile: {
    paddingHorizontal: 2,
  },
  summaryValue: {
    fontFamily: theme.fonts.medium,
    fontSize: 20,
    fontWeight: '500',
    color: palette.primaryText,
    letterSpacing: 0,
  },
  summaryLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  summaryLabelMobile: {
    letterSpacing: 0.4,
  },
  summaryMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: palette.secondaryText,
  },
  summaryMetaMobile: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
  },
  activityColumn: {
    gap: 8,
  },
  activityTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  activityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activityChip: {
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  activityChipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  myPassList: {
    gap: 12,
  },
  myPassCard: {
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,22,34,0.05)',
    gap: 6,
  },
  myPassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  myPassTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  myPassMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  myPassNote: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.primaryText,
    lineHeight: 18,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: color.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15,22,34,0.15)',
  },
  sheetHeader: {
    gap: 8,
  },
  sheetTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
  },
  sheetDescription: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  sheetContent: {
    gap: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetSecondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sheetSecondaryLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    color: palette.primary,
  },
  sheetPrimaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  sheetPrimaryButtonDisabled: {
    backgroundColor: palette.surfaceTint,
    opacity: 0.7,
  },
  sheetPrimaryLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  sheetPrimaryLabelDisabled: {
    color: palette.primaryText,
  },
  actionDetail: {
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  actionDetailTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  actionDetailMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  actionDetailNote: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.primaryText,
    lineHeight: 18,
  },
  actionDetailHint: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.secondaryText,
  },
  actionEmptyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  eventKindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  eventKindChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  eventKindChipActive: {
    borderColor: palette.primary,
    backgroundColor: theme.tints.primary,
  },
  eventKindText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  eventKindTextActive: {
    color: palette.primary,
  },
  reportInput: {
    fontFamily: theme.fonts.regular,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.primaryText,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  reportInputCompact: {
    minHeight: 46,
    textAlignVertical: 'center',
  },
  reportHint: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.secondaryText,
  },
  weatherPanel: {
    borderRadius: radii.xl,
    paddingVertical: 22,
    paddingHorizontal: 24,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  weatherTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherLocationBlock: {
    gap: 2,
  },
  weatherMetaLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: palette.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  weatherLocation: {
    fontFamily: theme.fonts.semibold,
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  weatherMetaRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  weatherMetaValue: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  weatherContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherTempBlock: {
    gap: 4,
  },
  weatherTemperatureLarge: {
    fontFamily: theme.fonts.semibold,
    fontSize: 36,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -1,
  },
  weatherSummary: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.secondaryText,
    letterSpacing: 0.2,
  },
  weatherIconLarge: {
    marginRight: 2,
    width: 34,
    height: 34,
  },
  weatherMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  weatherMetricItem: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  weatherMetricLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 9,
    color: palette.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  weatherMetricValue: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  weatherMetricDivider: {
    width: 1,
    height: 16,
    backgroundColor: palette.border,
  },
  scheduleCard: {
    flex: 1,
    minHeight: 140,
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleBody: {
    flexDirection: 'row',
    gap: 10,
  },
  scheduleTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  scheduleSubtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: palette.secondaryText,
  },
  scheduleLeftColumn: {
    width: '50%',
    gap: 8,
  },
  scheduleRightColumn: {
    width: '50%',
    gap: 12,
  },
  scheduleMainDay: {
    gap: 2,
  },
  scheduleMainDayName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
    letterSpacing: 0.1,
  },
  scheduleMainDate: {
    fontFamily: theme.fonts.regular,
    fontSize: 21,
    fontWeight: '400',
    color: palette.primaryText,
    letterSpacing: 0.5,
  },
  scheduleMainEvents: {
    gap: 8,
  },
  scheduleSecondaryDay: {
    gap: 8,
  },
  scheduleSecondaryDayName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: palette.mutedText,
    letterSpacing: 0.2,
  },
  scheduleSecondaryEvents: {
    gap: 6,
  },
  scheduleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderLeftWidth: 1.5,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: radii.xs / 2,
    borderColor: palette.border,
    backgroundColor: 'transparent',
  },
  scheduleChipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    fontWeight: '500',
    color: palette.secondaryText,
    flexShrink: 1,
  },
  sectionBlock: {
    gap: 10,
    marginTop: 8,
  },
  sectionBlockDesktop: {
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  desktopCardVisible: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 0,
  },
  sectionTitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 17,
    fontWeight: '400',
    color: palette.primaryText,
    letterSpacing: 0,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: palette.accent,
  },
  sectionCount: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.secondaryText,
  },
  sectionAction: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.primaryText,
  },
  stackedWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  stackedWrapperFlat: {
    marginBottom: 0,
  },
  stackLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  primaryCard: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.lg,
    padding: 15,
  },
  primaryCardPressed: {
    transform: [{ translateY: 1 }],
  },
  postCard: {
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  messageCard: {
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  postAuthor: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    fontWeight: '400',
    color: palette.primaryText,
    marginBottom: 8,
  },
  postBody: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.primaryText,
    lineHeight: 17,
  },
  postContent: {
    flex: 1,
    gap: 4,
  },
  postMeta: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  postMetaDay: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  postMetaTime: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postStatText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.secondaryText,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  groupAvatar: {
    width: 46,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContent: {
    flex: 1,
    gap: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  messageTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageTitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: palette.primaryText,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  messageTime: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '400',
  },
  messageBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 10,
    color: palette.primaryText,
    fontWeight: '600',
  },
  messageAuthor: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  messagePreview: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: palette.mutedText,
    lineHeight: 17,
  },
  collapseButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  collapseButtonText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    fontWeight: '400',
    color: palette.primaryText,
  },
  tourOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tourCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tourBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  tourBadgeText: { fontSize: 12, fontWeight: '700', color: palette.primaryText },
  tourTitle: { fontSize: 18, fontWeight: '800', color: palette.primaryText },
  tourText: { fontSize: 14, lineHeight: 20, color: palette.secondaryText },
  tourDots: { flexDirection: 'row', gap: 6 },
  tourDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.surfaceTint,
  },
  tourDotActive: { backgroundColor: palette.primary },
  tourActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  tourSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
  },
  tourSecondaryText: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  tourPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  tourPrimaryText: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  userRowActive: { borderColor: 'rgba(62,155,95,0.4)', backgroundColor: 'rgba(62,155,95,0.08)' },
  userName: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  userMeta: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
});
