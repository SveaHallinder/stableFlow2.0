import React from 'react';
import {
  Image,
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
import Logo from '@/assets/images/logo.svg';
import CloudSun from '@/assets/images/cloud-sun.svg';
import WarningIcon from '@/assets/images/⚠.svg';
import BroomIcon from '@/assets/images/broom.svg';
import PlusIcon from '@/assets/images/plus.svg';
import UserGroupsIcon from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';

type StatusChip = {
  label: string;
  tone: 'alert' | 'info' | 'neutral';
  icon?: 'warning' | 'broom';
};

type HorseStatus = {
  name: string;
  note: string;
  tone?: 'alert';
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

const horseStatuses: HorseStatus[] = [
  { name: 'Majid', note: 'Lost shoe' },
  { name: 'Cinder', note: 'Injured', tone: 'alert' },
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
            colors={['#5681AC', '#9AC3EC']}
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

          <View style={styles.scheduleCard}>
            {/* Left Column - Saturday MAR 8 */}
            <View style={styles.scheduleLeftColumn}>
              <View style={styles.scheduleMainDay}>
                <Text style={styles.scheduleMainDayName}>SATURDAY</Text>
                <Text style={styles.scheduleMainDate}>MAR 8</Text>
              </View>
              <View style={styles.scheduleMainEvents}>
                <ScheduleChip label="Feeding ev.." tone="alert" icon="warning" />
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
          </View>
        </View>

        <View style={styles.rowGap}>
          <View style={styles.horseCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Horse Status</Text>
              <Text style={styles.cardEllipsis}>···</Text>
            </View>
            {horseStatuses.map((item) => (
              <View style={styles.horseRow} key={item.name}>
                <Text style={styles.horseName}>{item.name}</Text>
                <Text style={styles.horseDash}>-</Text>
                <Text
                  style={[
                    styles.horseNote,
                    item.tone === 'alert' && styles.horseNoteAlert,
                  ]}
                >
                  {item.note}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.quickCard}>
            <View style={styles.quickHeader}>
              <Text style={styles.quickTitle}>Quick Actions</Text>
              <Text style={styles.cardEllipsis}>···</Text>
            </View>
            <View style={styles.quickActions}>
              <QuickAction label="Activity" />
              <QuickAction label="Post" />
            </View>
          </View>
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
                layerColors={{ base: '#E1E7F0', top: '#F4F7FB' }}
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
  );
}

function ScheduleChip({ label, tone, icon }: StatusChip) {
  const background =
    tone === 'alert'
      ? 'rgba(255, 0, 0, 0.1)'
      : tone === 'info'
      ? 'rgba(0, 153, 255, 0.1)'
      : 'rgba(255, 115, 0, 0.1)';
  const borderColor =
    tone === 'alert'
      ? '#FF0000'
      : tone === 'info'
      ? '#0099FF'
      : '#FF7300';

  return (
    <View style={[styles.scheduleChip, { backgroundColor: background, borderLeftColor: borderColor }]}>
      {icon === 'warning' && <WarningIcon width={8} height={8} style={styles.chipIcon} />}
      {icon === 'broom' && <BroomIcon width={8} height={8} style={styles.chipIcon} />}
      <Text style={styles.scheduleChipText} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
    </View>
  );
}

function QuickAction({ label }: { label: string }) {
  return (
    <View style={styles.quickActionWrapper}>
      <View style={styles.quickActionPill}>
        <Text style={styles.quickActionText}>{label}</Text>
      </View>
      <View style={styles.quickActionBadge}>
        <PlusIcon width={12} height={12} color="#87C6A2" />
      </View>
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
              styles.stackLayer,
              layerColors?.base && { backgroundColor: layerColors.base },
              { transform: [{ translateY: secondOffset }] },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.stackLayer,
              styles.stackLayerTop,
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
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 140,
    gap: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '300',
    color: '#000000',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  alertLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF0000',
  },
  alertText: {
    fontSize: 16,
    color: '#000000',
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  weatherCard: {
    width: 120,
    height: 120,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherCity: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  weatherArrow: {
    fontSize: 16,
    color: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
  },
  weatherTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  weatherTemperature: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  weatherIcon: {
    marginTop: 0,
  },
  weatherDescription: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  weatherRangeRow: {
    flexDirection: 'row',
    gap: 14,
  },
  weatherRange: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  scheduleCard: {
    flex: 1,
    height: 120,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#F5F5F5',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 12,
  },
  scheduleLeftColumn: {
    width: '45%',
    gap: 15,
  },
  scheduleRightColumn: {
    width: '45%',
    gap: 8,
  },
  scheduleMainDay: {
    gap: 4,
  },
  scheduleMainDayName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4BAA74',
    textTransform: 'uppercase',
  },
  scheduleMainDate: {
    fontSize: 20,
    fontWeight: '400',
    color: '#000000',
    textTransform: 'uppercase',
  },
  scheduleMainEvents: {
    gap: 4,
  },
  scheduleSecondaryDay: {
    gap: 4,
  },
  scheduleSecondaryDayName: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.5)',
    textTransform: 'uppercase',
  },
  scheduleSecondaryEvents: {
    gap: 3,
  },
  scheduleDateColumn: {
    gap: 4,
  },
  scheduleDay: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4BAA74',
  },
  scheduleDate: {
    fontSize: 22,
    fontWeight: '400',
    color: '#000000',
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
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  chipIcon: {
    margin: 0,
    padding: 0,
  },
  scheduleChipText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#000000',
    flexShrink: 1,
  },
  upcomingList: {
    gap: 10,
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
    color: '#94A3B8',
  },
  upcomingChips: {
    flexDirection: 'column',
    gap: 6,
    wordWrap: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  horseCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    height: 100,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 4,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '500',
    color: '#111827',
  },
  cardEllipsis: {
    fontSize: 12,
    color: 'rgba(17, 24, 39, 0.5)',
  },
  horseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  horseName: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '400',
    color: '#000000',
  },
  horseDash: {
    fontSize: 12,
    lineHeight: 15,
    color: '#000000',
  },
  horseNote: {
    fontSize: 12,
    lineHeight: 15,
    color: '#000000',
  },
  horseNoteAlert: {
    color: '#D92D20',
    fontWeight: '500',
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#87C6A2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 100,
    gap: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
  },
  quickHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 4,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 18,
    color: '#FFFFFF',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickActionWrapper: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  quickActionPill: {
    width: '100%',
    height: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
  },
  quickActionBadge: {
    position: 'absolute',
    top: -8,
    right: 0,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    gap: 16,
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
    fontWeight: '400',
    color: '#111827',
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4BAA74',
  },
  sectionCount: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
  },
  sectionAction: {
    fontSize: 12,
    color: '#111827',
  },
  stackedWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  stackedWrapperFlat: {
    marginBottom: 0,
  },
  stackLayer: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: 12,
    borderRadius: 26,
    backgroundColor: '#f5f5f5',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    zIndex: -1,
  },
  stackLayerTop: {
    marginHorizontal: 4,
    backgroundColor: '#F4F7FB',
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  primaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  primaryCardPressed: {
    transform: [{ translateY: 1 }],
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 16,
    borderRadius: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 10,
    borderRadius: 26,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
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
    color: '#111827',
    marginBottom: 8,
  },
  postBody: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
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
    color: '#111827',
  },
  postMetaTime: {
    fontSize: 12,
    color: '#111827',
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
    color: '#111827',
  },
  messageRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
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
    color: '#0F172A',
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  messageBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  messageAuthor: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  messagePreview: {
    fontSize: 12,
    color: '#1F2937',
    opacity: 0.85,
  },
  collapseButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2F6',
  },
  collapseButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0F172A',
  },
});
