import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import HeartIcon from '@/assets/images/Heart.svg';
import SpeechBubbleIcon from '@/assets/images/Speech Bubble.svg';
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo-blue.svg';
import CloudSun from '@/assets/images/cloud-sun.svg';
import WarningIcon from '@/assets/images/⚠.svg';
import BroomIcon from '@/assets/images/broom.svg';
import UserGroupsIcon from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';
import { Card } from '@/components/Primitives';
import { color, radius, shadow, space } from '@/design/tokens';

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;
const tints = theme.tints;
const statusColors = theme.status;
const weatherGradient = theme.gradients.weather;

type StatusChip = {
  label: string;
  tone: 'alert' | 'info' | 'neutral';
  icon?: 'warning' | 'broom';
};


type MessageItem = {
  id: string;
  title: string;
  author: string;
  timeAgo: string;
  preview: string;
  group?: boolean;
};

type PostItem = {
  id: string;
  author: string;
  body: string;
  day: string;
  time: string;
  likes: number;
  comments: number;
};

const statusChips: StatusChip[] = [
  { label: 'Feeding ev..', tone: 'alert', icon: 'warning' },
  { label: 'Cleaning day', tone: 'info', icon: 'broom' },
];

const upcomingDays: Array<{ id: string; label: string; items: StatusChip[] }> = [
  {
    id: 'sun-9',
    label: 'SUN, 9 MAR',
    items: [
      { label: 'Cleaning day', tone: 'info', icon: 'broom' },
      { label: 'Meeting comp...', tone: 'neutral' },
    ],
  },
  {
    id: 'tue-11',
    label: 'TUE, 11 MAR',
    items: [
      { label: 'Feeding mor..', tone: 'alert', icon: 'warning' },
    ],
  },
];


const messages: MessageItem[] = [
  {
    id: 'msg-1',
    title: 'Group Name',
    author: 'Jane Doe',
    timeAgo: '30 min ago',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
    group: true,
  },
  {
    id: 'msg-2',
    title: 'Ingrid B',
    author: 'Ingrid B',
    timeAgo: '1h ago',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
  },
];

const posts: PostItem[] = [
  {
    id: 'post-1',
    author: 'Jane Doe',
    body:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
    day: 'Thu',
    time: '10:23',
    likes: 3,
    comments: 3,
  },
  {
    id: 'post-2',
    author: 'Samuel H',
    body: 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',
    day: 'Wed',
    time: '18:45',
    likes: 5,
    comments: 2,
  },
  {
    id: 'post-3',
    author: 'Ingrid B',
    body: 'Curabitur non nulla sit amet nisl tempus convallis quis ac lectus.',
    day: 'Tue',
    time: '14:12',
    likes: 2,
    comments: 1,
  },
];

export default function OverviewScreen() {
  const [messagesExpanded, setMessagesExpanded] = React.useState(false);
  const visibleMessages = messagesExpanded ? messages : messages.slice(0, 1);
  const [postsExpanded, setPostsExpanded] = React.useState(false);
  const visiblePosts = postsExpanded ? posts : posts.slice(0, 1);

  const handleMessagePress = () => {
    setMessagesExpanded((prev) => !prev);
  };

  const handlePostPress = () => {
    setPostsExpanded((prev) => !prev);
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Logo width={32} height={32} />
          <Text style={styles.headerTitle}>Todays overview</Text>
          <TouchableOpacity style={styles.iconButton}>
            <SearchIcon width={20} height={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.alertBanner}>
          <Text style={styles.alertLabel}>OBS!</Text>
          <Text style={styles.alertText}>No parking by the container today.</Text>
        </View>

        <View style={styles.rowGap}>
          <LinearGradient
            colors={weatherGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.weatherCard}
          >
            <View style={styles.weatherHeader}>
              <Text style={styles.weatherCity}>Stockholm</Text>
              <Text style={styles.weatherArrow}>➢</Text>
            </View>
            <View style={styles.weatherTempRow}>
              <Text style={styles.weatherTemperature}>10°</Text>
              <CloudSun width={32} height={32} style={styles.weatherIcon} />
            </View>
            <Text style={styles.weatherDescription}>Cloudy</Text>
            <View style={styles.weatherRangeRow}>
              <Text style={styles.weatherRange}>H:12°</Text>
              <Text style={styles.weatherRange}>L:6°</Text>
            </View>
          </LinearGradient>

          <Card style={styles.scheduleCard}>
            {/* Left Column - Saturday MAR 8 */}
            <View style={styles.scheduleLeftColumn}>
              <View style={styles.scheduleMainDay}>
                <Text style={styles.scheduleMainDayName}>SATURDAY</Text>
                <Text style={styles.scheduleMainDate}>MAR 8</Text>
              </View>
              <View style={styles.scheduleMainEvents}>
                <ScheduleChip label="Feeding ev.." tone="alert" icon="warning" />
                <ScheduleChip label="Cleaning day" tone="info" icon="broom" />
                <ScheduleChip label="Cleaning day" tone="info" icon="broom" />
              </View>
            </View>

            {/* Right Column - Other Days */}
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
          </Card>
        </View>


        <View style={styles.sectionBlock}>
          <SectionHeader title="New messages" count={8} />
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
                      source={require('@/assets/images/dummy-avatar.png')}
                      style={styles.messageAvatar}
                    />
                  )}
                  <View style={styles.messageContent}>
                    <View style={styles.messageHeader}>
                      <View style={styles.messageTitleBlock}>
                        <Text style={styles.messageTitle}>{message.title}</Text>
                        {message.group && (
                          <View style={styles.messageBadge}>
                            <Text style={styles.messageBadgeText}>2</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.messageTime}>{message.timeAgo}</Text>
                    </View>
                    <Text style={styles.messageAuthor}>{message.author}</Text>
                    <Text numberOfLines={1} style={styles.messagePreview}>
                      {message.preview}
                    </Text>
                  </View>
                </View>
              </StackedCard>
            );
          })}
          {messagesExpanded && (
            <TouchableOpacity style={styles.collapseButton} onPress={handleMessagePress}>
              <Text style={styles.collapseButtonText}>Show less ↑</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader title="Recent post" count={posts.length} />
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
                    <Text style={styles.postBody}>{post.body}</Text>
                  </View>
                  <View style={styles.postMeta}>
                    <Text style={styles.postMetaDay}>{post.day}</Text>
                    <Text style={styles.postMetaTime}>{post.time}</Text>
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
              <Text style={styles.collapseButtonText}>Show less ↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
      {icon === 'warning' && <WarningIcon width={8} height={8} style={styles.chipIcon} />}
      {icon === 'broom' && <BroomIcon width={8} height={8} style={styles.chipIcon} />}
      <Text style={styles.scheduleChipText} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
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
      <Text style={styles.sectionAction}>View more ↓</Text>
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
    paddingBottom: 140,
    gap: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: palette.primaryText,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: palette.surfaceGlass,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 0,
  },
  alertLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.error,
  },
  alertText: {
    fontSize: 17,
    color: palette.primaryText,
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  weatherCard: {
    width: 125,
    height: 125,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
    overflow: 'hidden',
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'white',
  },
  weatherCity: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  weatherArrow: {
    fontSize: 16,
    color: 'white',
    transform: [{ rotate: '320deg' }],
  },
  weatherTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    color: 'white',
  },
  weatherTemperature: {
    fontSize: 28,
    fontWeight: '600',
    color: 'white',
  },
  weatherIcon: {
    marginTop: 2,
  },
  weatherDescription: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  weatherRangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  weatherRange: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  scheduleCard: {
    flex: 1,
    height: 125,
    backgroundColor: 'white',
    flexDirection: 'row',
    gap: 4,
    marginLeft: 12,
    marginRight: 0,
  },
  scheduleLeftColumn: {
    width: '50%',
    gap: 10,
  },
  scheduleRightColumn: {
    width: '50%',
    gap: 14,
  },
  scheduleMainDay: {
    gap: 2,
  },
  scheduleMainDayName: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.1,
  },
  scheduleMainDate: {
    fontSize: 21,
    fontWeight: '400',
    color: palette.primaryText,
    textTransform: 'uppercase',
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
    textTransform: 'uppercase',
  },
  scheduleSecondaryEvents: {
    gap: 6,
  },
  scheduleDateColumn: {
    gap: 6,
  },
  scheduleDay: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
  },
  scheduleDate: {
    fontSize: 22,
    fontWeight: '400',
    color: palette.primaryText,
  },
  scheduleTodayList: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
    width: '50%',
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
  chipIcon: {
    margin: 0,
    padding: 0,
  },
  scheduleChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: palette.secondaryText,
    flexShrink: 1,
  },
  upcomingList: {
    gap: 6,
    flexDirection: 'column',
    wordWrap: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  upcomingRow: {
    gap: 6,
    wordWrap: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  upcomingLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  upcomingChips: {
    flexDirection: 'column',
    gap: 6,
    wordWrap: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sectionBlock: {
    gap: 14,
    paddingHorizontal: 12,
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
    backgroundColor: color.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 0,
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
