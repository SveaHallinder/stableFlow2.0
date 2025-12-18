import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import HeartIcon from '@/assets/images/Heart.svg';
import SpeechBubbleIcon from '@/assets/images/Speech Bubble.svg';
import CloudSun from '@/assets/images/cloud-sun.svg';
import WarningIcon from '@/assets/images/⚠.svg';
import BroomIcon from '@/assets/images/broom.svg';
import UserGroupsIcon from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';
import { quickActionVariants, systemPalette } from '@/design/system';
import { Card } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { color, radius, space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import type { Assignment } from '@/context/AppDataContext';
import {
  groupAssignmentsByDay,
  formatPrimaryDay,
  formatPrimaryDate,
  formatSecondaryLabel,
} from '@/lib/schedule';

const palette = theme.colors;
const radii = theme.radii;

type StatusChip = {
  label: string;
  tone: 'alert' | 'info' | 'neutral';
  icon?: 'warning' | 'broom';
};

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

const quickActionStyles: Record<
  QuickActionTint,
  { gradient: [string, string]; icon: string; accentBorder: string; shadow: string }
> = {
  primary: quickActionVariants.primary,
  accent: quickActionVariants.accent,
  warning: quickActionVariants.warning,
};

export default function OverviewScreen() {
  const router = useRouter();
  const { state, derived, actions } = useAppData();
  const {
    assignments,
    alerts,
    messages: messageItems,
    posts: postItems,
    currentUserId,
    paddocks,
  } = state;
  const toast = useToast();

  const [messagesExpanded, setMessagesExpanded] = React.useState(false);
  const [postsExpanded, setPostsExpanded] = React.useState(false);
  const [eventsModalVisible, setEventsModalVisible] = React.useState(false);
  const [eventText, setEventText] = React.useState('');

  React.useEffect(() => {
    if (eventsModalVisible) {
      setEventText('');
    }
  }, [eventsModalVisible]);

  const alertBanner = React.useMemo(
    () => alerts.find((alert) => alert.type === 'critical'),
    [alerts],
  );
  const latestEvent = alerts[0];
  const groupedDays = React.useMemo(() => groupAssignmentsByDay(assignments), [assignments]);
  const primaryDayGroup = groupedDays[0];
  const secondaryDayGroups = groupedDays.slice(1, 2);

  const primaryDayLabel = primaryDayGroup ? formatPrimaryDay(primaryDayGroup.date) : '';
  const primaryDateLabel = primaryDayGroup ? formatPrimaryDate(primaryDayGroup.date) : '';

  const primaryChips = React.useMemo<StatusChip[]>(() => {
    if (!primaryDayGroup) {
      return [];
    }
    return sortAssignments(primaryDayGroup.assignments).map(createStatusChip);
  }, [primaryDayGroup]);

  const upcomingDays = React.useMemo(
    () =>
      secondaryDayGroups.map((day) => ({
        id: day.isoDate,
        label: formatSecondaryLabel(day.date),
        items: sortAssignments(day.assignments).map(createStatusChip),
      })),
    [secondaryDayGroups],
  );

  const myAssignedUpcoming = React.useMemo(
    () =>
      derived.upcomingAssignmentsForUser.filter(
        (assignment) => assignment.assigneeId === currentUserId,
      ),
    [derived.upcomingAssignmentsForUser, currentUserId],
  );

  const myNextAssignment = myAssignedUpcoming[0];

  const paddockSummary = React.useMemo(() => {
    const paddockCount = paddocks.length;
    const horseCount = paddocks.reduce((total, paddock) => total + paddock.horseNames.length, 0);
    return { paddockCount, horseCount };
  }, [paddocks]);

  const quickActions = React.useMemo<QuickAction[]>(() => {
    return [
      {
        id: 'my-passes',
        label: 'Mina pass',
        caption: myNextAssignment
          ? `Nästa: ${myNextAssignment.label} · ${myNextAssignment.time}`
          : 'Inga tilldelade pass',
        icon: 'clock',
        tint: 'primary',
        highlight: myAssignedUpcoming.length > 0,
      },
      {
        id: 'open-passes',
        label: 'Lediga pass',
        caption: derived.summary.open
          ? `${derived.summary.open} lediga pass\nÖppna schema`
          : 'Alla pass är bemannade\nÖppna schema',
        icon: 'users',
        tint: 'accent',
        highlight: derived.summary.open > 0,
      },
      {
        id: 'events',
        label: 'Händelser',
        caption: latestEvent
          ? `${truncateText(latestEvent.message, 34)}\nLägg till uppdatering`
          : 'Lägg till uppdatering\nSe senaste',
        icon: 'alert-triangle',
        tint: 'warning',
      },
      {
        id: 'paddocks',
        label: 'Hagar',
        caption: paddockSummary.paddockCount
          ? `${paddockSummary.paddockCount} hagar · ${paddockSummary.horseCount} hästar\nÖppna & skriv ut`
          : 'Lägg in hagar\nSkriv ut haglista',
        icon: 'map',
        tint: 'primary',
        highlight: paddockSummary.paddockCount === 0,
      },
    ];
  }, [
    myNextAssignment,
    myAssignedUpcoming.length,
    derived.summary.open,
    latestEvent,
    paddockSummary,
  ]);
  const isEventValid = eventText.trim().length >= 3;

  const todaySummary = React.useMemo(() => {
    const assignmentsForDay = primaryDayGroup?.assignments ?? [];
    const total = assignmentsForDay.length;
    const completed = assignmentsForDay.filter((assignment) => assignment.status === 'completed').length;
    const open = assignmentsForDay.filter((assignment) => assignment.status === 'open').length;
    const mine = assignmentsForDay.filter(
      (assignment) =>
        assignment.assigneeId === currentUserId &&
        (assignment.status === 'assigned' || assignment.status === 'completed'),
    ).length;

    return { total, completed, open, mine };
  }, [primaryDayGroup, currentUserId]);

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

  const visibleMessages = messagesExpanded ? messageItems : messageItems.slice(0, 1);
  const visiblePosts = postsExpanded ? postItems : postItems.slice(0, 1);

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
        setEventsModalVisible(true);
      }
    },
    [router],
  );

  const handlePrimaryAction = React.useCallback(() => {
    router.push('/calendar');
  }, [router]);

  const handleSubmitEvent = React.useCallback(() => {
    const details = eventText.trim();
    if (!details) {
      toast.showToast('Skriv en kort uppdatering.', 'error');
      return;
    }
    const result = actions.addEvent(details, 'info');
    if (result.success) {
      toast.showToast('Händelsen lades till.', 'success');
      setEventsModalVisible(false);
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, eventText, toast]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={styles.pageHeader}
          title="Dagens överblick"
          primaryActionLabel="Öppna schema"
          onPressPrimaryAction={handlePrimaryAction}
          primaryActionDisabled={false}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {alertBanner && (
            <Card tone="muted" style={styles.alertCard}>
              <View style={styles.alertRow}>
                <Text style={styles.alertLabel}>OBS!</Text>
                <Text style={styles.alertText}>{alertBanner.message}</Text>
              </View>
            </Card>
          )}

          <View style={styles.quickActionGrid}>
            {quickActions.map((action) => (
              <QuickActionCard
                key={action.id}
                action={action}
                onPress={handleQuickActionPress}
              />
            ))}
          </View>

          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.summaryTitle}>Idag</Text>
                <Text style={styles.summarySubtitle}>Status för dagens pass</Text>
              </View>
              <View style={styles.summaryBadge}>
                <Feather name="clock" size={14} color={palette.primary} />
                <Text style={styles.summaryBadgeText}>{derived.summary.nextUpdateLabel}</Text>
              </View>
            </View>
            <View style={styles.summaryTiles}>
              {summaryStats.map((item) => (
                <View key={item.id} style={styles.summaryTile}>
                  <Text style={styles.summaryValue}>{item.value}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                  {item.meta ? <Text style={styles.summaryMeta}>{item.meta}</Text> : null}
                </View>
              ))}
            </View>
            {derived.recentActivities.length > 0 ? (
              <View style={styles.activityColumn}>
                <Text style={styles.activityTitle}>Senaste aktivitet</Text>
                <View style={styles.activityRow}>
                  {derived.recentActivities.slice(0, 3).map((activity) => (
                    <View key={activity.id} style={styles.activityChip}>
                      <Text style={styles.activityChipText}>{activity.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <WeatherPanel />

          {primaryDayGroup && (
            <Card elevated tone="muted" style={styles.scheduleCard}>
              <View style={styles.scheduleHeaderRow}>
                <Text style={styles.scheduleTitle}>Kommande pass</Text>
                <Text style={styles.scheduleSubtitle}>Vecka 10</Text>
              </View>
              <View style={styles.scheduleBody}>
                <View style={styles.scheduleLeftColumn}>
                  <View style={styles.scheduleMainDay}>
                    <Text style={styles.scheduleMainDayName}>{primaryDayLabel}</Text>
                    <Text style={styles.scheduleMainDate}>{primaryDateLabel}</Text>
                  </View>
                  <View style={styles.scheduleMainEvents}>
                    {primaryChips.map((chip) => (
                      <ScheduleChip
                        key={`${primaryDayGroup.isoDate}-${chip.label}`}
                        {...chip}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.scheduleRightColumn}>
                  {upcomingDays.map((day) => (
                    <View key={day.id} style={styles.scheduleSecondaryDay}>
                      <Text style={styles.scheduleSecondaryDayName}>{day.label}</Text>
                      <View style={styles.scheduleSecondaryEvents}>
                        {day.items.map((chip) => (
                          <ScheduleChip key={`${day.id}-${chip.label}`} {...chip} />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          )}

          <View style={styles.sectionBlock}>
            <SectionHeader title="Nya meddelanden" count={messageItems.length} />
            {visibleMessages.map((message, index) => {
              const isPrimaryCard = index === 0;
              const stacked = isPrimaryCard && !messagesExpanded;

              return (
                <StackedCard
                  key={message.id}
                  offset={stacked ? [6, 16] : undefined}
                  stacked={stacked}
                  onPress={isPrimaryCard ? handleMessagePress : undefined}
                  cardStyle={styles.messageCard}
                >
                  <View style={styles.messageRow}>
                    {message.group ? (
                      <View style={styles.groupAvatar}>
                        <UserGroupsIcon width={28} height={28} />
                      </View>
                    ) : (
                      <Image
                        source={message.avatar ?? require('@/assets/images/dummy-avatar.png')}
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
              <TouchableOpacity style={styles.collapseButton} onPress={handleMessagePress}>
                <Text style={styles.collapseButtonText}>Visa mindre ↑</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <SectionHeader title="Senaste inlägg" count={postItems.length} />
            {visiblePosts.map((post, index) => {
              const isPrimaryCard = index === 0;
              const stacked = isPrimaryCard && !postsExpanded;

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
                      <Text style={styles.postMetaDay}>Nu</Text>
                      <Text style={styles.postMetaTime}>{post.timeAgo}</Text>
                    </View>
                  </View>
                  <View style={styles.postFooter}>
                    <View style={styles.postStat}>
                      <HeartIcon width={16} height={16} />
                      <Text style={styles.postStatText}>{post.likes}</Text>
                    </View>
                    <View style={styles.postStat}>
                      <SpeechBubbleIcon width={16} height={16} />
                      <Text style={styles.postStatText}>{post.comments}</Text>
                    </View>
                  </View>
                </StackedCard>
              );
            })}
            {postsExpanded && (
              <TouchableOpacity style={styles.collapseButton} onPress={handlePostPress}>
                <Text style={styles.collapseButtonText}>Visa mindre ↑</Text>
              </TouchableOpacity>
            )}
          </View>
      </ScrollView>
    </SafeAreaView>
      <QuickActionSheet
        visible={eventsModalVisible}
        title="Händelser"
        description="Skriv en kort uppdatering till stallet (t.ex. tappskor, hagbyte, parkering)."
        onClose={() => setEventsModalVisible(false)}
        primaryLabel="Skicka"
        primaryDisabled={!isEventValid}
        onPrimary={isEventValid ? handleSubmitEvent : undefined}
      >
        <TextInput
          value={eventText}
          onChangeText={setEventText}
          placeholder="Ex. Kanel har tappat en sko. / Parkera inte vid containern."
          placeholderTextColor={palette.secondaryText}
          style={[styles.reportInput, styles.reportInputCompact]}
        />
        <Text style={styles.reportHint}>Händelsen syns högst upp i överblicken och i schemat.</Text>
      </QuickActionSheet>
    </LinearGradient>
  );
}

function WeatherPanel() {
  return (
    <LinearGradient
      colors={['#3A73FF', '#5F96FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.weatherPanel}
    >
      <View style={styles.weatherTopRow}>
        <View style={styles.weatherLocationBlock}>
          <Text style={styles.weatherMetaLabel}>Plats</Text>
          <Text style={styles.weatherLocation}>Stockholm</Text>
        </View>
        <View style={styles.weatherMetaRight}>
          <Text style={styles.weatherMetaLabel}>Uppdaterad</Text>
          <Text style={styles.weatherMetaValue}>08:05</Text>
        </View>
      </View>

      <View style={styles.weatherContentRow}>
        <View style={styles.weatherTempBlock}>
          <Text style={styles.weatherTemperatureLarge}>10°</Text>
          <Text style={styles.weatherSummary}>Molnigt med solglimtar</Text>
        </View>
        <CloudSun width={48} height={48} style={styles.weatherIconLarge} />
      </View>

      <View style={styles.weatherMetrics}>
        <View style={styles.weatherMetricItem}>
          <Text style={styles.weatherMetricLabel}>Högsta</Text>
          <Text style={styles.weatherMetricValue}>12°</Text>
        </View>
        <View style={styles.weatherMetricDivider} />
        <View style={styles.weatherMetricItem}>
          <Text style={styles.weatherMetricLabel}>Lägsta</Text>
          <Text style={styles.weatherMetricValue}>6°</Text>
        </View>
        <View style={styles.weatherMetricDivider} />
        <View style={styles.weatherMetricItem}>
          <Text style={styles.weatherMetricLabel}>Vind</Text>
          <Text style={styles.weatherMetricValue}>4 m/s</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function QuickActionCard({
  action,
  onPress,
}: {
  action: QuickAction;
  onPress?: (action: QuickAction) => void;
}) {
  const themeStyles = quickActionStyles[action.tint];
  const badgeColor = themeStyles.icon;

  return (
    <Pressable
      disabled={action.disabled}
      onPress={() => onPress?.(action)}
      style={({ pressed }) => [
        styles.quickActionCard,
        pressed && !action.disabled && styles.quickActionCardPressed,
        action.disabled && styles.quickActionCardDisabled,
      ]}
    >
      <LinearGradient
        colors={themeStyles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.quickActionInner,
          {
            borderColor: themeStyles.accentBorder,
            shadowColor: themeStyles.shadow,
            shadowOpacity: 0.2,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 2,
          },
          action.disabled && styles.quickActionInnerDisabled,
        ]}
      >
        {action.highlight && !action.disabled ? (
          <View style={[styles.quickActionBadge, { backgroundColor: badgeColor }]} />
        ) : null}
        <View style={[styles.quickActionIcon, { backgroundColor: `${themeStyles.icon}10` }]}>
          <Feather
            name={action.icon}
            size={20}
            color={action.disabled ? `${themeStyles.icon}60` : themeStyles.icon}
          />
        </View>
        <View style={styles.quickActionText}>
          <Text numberOfLines={1} style={styles.quickActionLabel}>
            {action.label}
          </Text>
          <Text numberOfLines={2} style={styles.quickActionCaption}>
            {action.caption}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

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
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
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

function ScheduleChip({ label, tone, icon }: StatusChip) {
  const toneStyles = {
    alert: { background: palette.surfaceTint, border: palette.error },
    info: { background: palette.surfaceTint, border: palette.info },
    neutral: { background: palette.surfaceTint, border: palette.accent },
  } as const;

  const { background, border } = toneStyles[tone];

  return (
    <View style={[styles.scheduleChip, { backgroundColor: background, borderLeftColor: border }]}>
      {icon === 'warning' && <WarningIcon width={8} height={8} />}
      {icon === 'broom' && <BroomIcon width={8} height={8} />}
      <Text style={styles.scheduleChipText} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionDot} />
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <Text style={styles.sectionAction}>Visa mer ↓</Text>
    </View>
  );
}

function StackedCard({
  children,
  offset,
  onPress,
  cardStyle,
  stacked = true,
  layerColors,
}: {
  children: React.ReactNode;
  offset?: [number, number];
  onPress?: () => void;
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
              layerColors?.base && { backgroundColor: layerColors.base },
              { transform: [{ translateY: secondOffset }] },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              layerColors?.top && { backgroundColor: layerColors.top },
              { transform: [{ translateY: firstOffset }] },
            ]}
          />
        </>
      )}
      <Pressable
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
}

function createStatusChip(assignment: Assignment): StatusChip {
  const tone: StatusChip['tone'] =
    assignment.status === 'open' ? 'alert' : assignment.status === 'assigned' ? 'info' : 'neutral';

  const label =
    assignment.note ??
    `${assignment.label} · ${assignment.time}`;

  const icon =
    assignment.status === 'open'
      ? 'warning'
      : assignment.note?.toLowerCase().includes('mock') ||
        assignment.note?.toLowerCase().includes('städ')
        ? 'broom'
        : undefined;

  return {
    label,
    tone,
    icon,
  };
}

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort(
    (a, b) =>
      new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime(),
  );
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
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
    paddingTop: 16,
    paddingBottom: 50,
    gap: 12,
  },
  pageHeader: {
    marginBottom: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: palette.error,
  },
  alertText: {
    fontSize: 15,
    color: palette.primaryText,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    flexGrow: 0,
    flexBasis: '48%',
    minWidth: '48%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  quickActionCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  quickActionCardDisabled: {
    opacity: 0.7,
  },
  quickActionInner: {
    borderRadius: radii.lg,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: systemPalette.surface,
  },
  quickActionInnerDisabled: {
    opacity: 0.7,
  },
  quickActionBadge: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 10,
    height: 10,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.card,
    backgroundColor: '#0A84FF',
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    gap: 4,
  },
  quickActionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  quickActionCaption: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  summarySection: {
    gap: 20,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    marginTop: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: palette.primaryText,
  },
  summarySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: palette.secondaryText,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
  summaryTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  summaryTile: {
    flex: 1,
    minWidth: 110,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: color.card,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,22,34,0.06)',
    shadowColor: 'rgba(15,22,34,0.08)',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1B1E2F',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#5F6473',
  },
  summaryMeta: {
    fontSize: 12,
    color: palette.mutedText,
  },
  activityColumn: {
    gap: 8,
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.secondaryText,
  },
  activityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activityChip: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(10,132,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activityChipText: {
    fontSize: 12,
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
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  myPassMeta: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  myPassNote: {
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
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
  },
  sheetDescription: {
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
    fontSize: 15,
    fontWeight: '600',
    color: palette.primary,
  },
  sheetPrimaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryButtonDisabled: {
    backgroundColor: palette.surfaceTint,
    opacity: 0.7,
  },
  sheetPrimaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.inverseText,
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
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  actionDetailMeta: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  actionDetailNote: {
    fontSize: 13,
    color: palette.primaryText,
    lineHeight: 18,
  },
  actionDetailHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  actionEmptyText: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  reportInput: {
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
    fontSize: 12,
    color: palette.secondaryText,
  },
  weatherPanel: {
    borderRadius: radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
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
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  weatherLocation: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  weatherMetaRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  weatherMetaValue: {
    fontSize: 12,
    fontWeight: '500',
    color: 'white',
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
    fontSize: 30,
    fontWeight: '700',
    color: 'white',
    letterSpacing: -1,
  },
  weatherSummary: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  weatherMetricValue: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  weatherMetricDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  scheduleSubtitle: {
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
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
    letterSpacing: 0.1,
  },
  scheduleMainDate: {
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
    fontSize: 11,
    fontWeight: '500',
    color: palette.secondaryText,
    flexShrink: 1,
  },
  sectionBlock: {
    gap: 14,
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
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: palette.primaryText,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: palette.accent,
  },
  sectionCount: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  sectionAction: {
    fontSize: 12,
    color: palette.primary,
  },
  stackedWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  stackedWrapperFlat: {
    marginBottom: 0,
  },
  primaryCard: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  primaryCardPressed: {
    transform: [{ translateY: 1 }],
  },
  postCard: {
    gap: 12,
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  messageCard: {
    paddingHorizontal: 0,
    paddingVertical: 14,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  postAuthor: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.primaryText,
    marginBottom: 8,
  },
  postBody: {
    fontSize: 12,
    color: palette.primaryText,
    lineHeight: 18,
  },
  postContent: {
    flex: 1,
  },
  postMeta: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  postMetaDay: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  postMetaTime: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postStatText: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageAvatar: {
    width: 44,
    height: 44,
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
    fontSize: 16,
    color: palette.primaryText,
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 12,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  messageBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: {
    fontSize: 10,
    color: palette.inverseText,
    fontWeight: '600',
  },
  messageAuthor: {
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  messagePreview: {
    fontSize: 12,
    color: palette.mutedText,
  },
  collapseButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  collapseButtonText: {
    fontSize: 12,
    fontWeight: '400',
    color: palette.primaryText,
  },
});
