import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';
import UserGroups from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';

type MessagePreview = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  timeAgo: string;
  unreadCount?: number;
  avatar?: any;
  group?: boolean;
};

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;

const messages: MessagePreview[] = [
  {
    id: 'group-1',
    title: 'Group name',
    subtitle: 'Person 3',
    description: 'Lorem ipsum dolor ...',
    timeAgo: '30 min ago',
    unreadCount: 2,
    group: true,
  },
  {
    id: 'person-1',
    title: 'Person 1',
    subtitle: '1h ago',
    description: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago',
    avatar: require('@/assets/images/dummy-avatar.png'),
  },
  {
    id: 'person-2',
    title: 'Person 1',
    subtitle: '1h ago',
    description: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago',
    avatar: require('@/assets/images/dummy-avatar.png'),
  },
  {
    id: 'person-3',
    title: 'Person 1',
    subtitle: '1h ago',
    description: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago',
    avatar: require('@/assets/images/dummy-avatar.png'),
  },
];

export default function MessagesScreen() {
  const router = useRouter();

  const handleOpenConversation = (item: MessagePreview) => {
    router.push({
      pathname: '/chat/[id]',
      params: { id: item.id, name: item.title },
    });
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Logo width={32} height={32} />
            <Text style={styles.headerTitle}>Messages</Text>
            <TouchableOpacity style={styles.iconButton}>
              <SearchIcon width={20} height={20} />
            </TouchableOpacity>
          </View>

          <View style={styles.list}>
            {messages.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                onPress={() => handleOpenConversation(item)}
                activeOpacity={0.85}
              >
                {item.group ? (
                  <View style={styles.groupAvatar}>
                    <UserGroups width={28} height={28} />
                  </View>
                ) : (
                  <Image source={item.avatar} style={styles.personAvatar} />
                )}

                <View style={styles.itemContent}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.group && (
                        <View style={styles.unreadDot}>
                          <Text style={styles.unreadCount}>{item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemTime}>{item.timeAgo}</Text>
                  </View>
                  <Text style={styles.itemSubtitle}>
                    {item.group ? `${item.subtitle}:` : item.subtitle}
                  </Text>
                  <Text numberOfLines={1} style={styles.itemDescription}>
                    {item.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 24,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.primaryText,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceGlass,
  },
  list: {
    gap: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.xl,
    paddingVertical: 20,
    paddingHorizontal: 18,
    ...shadows.cardSoft,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    marginRight: 14,
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontSize: 16,
    color: palette.primaryText,
    fontWeight: '600',
  },
  itemTime: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  itemSubtitle: {
    fontSize: 12,
    color: palette.mutedText,
  },
  itemDescription: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  unreadDot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 10,
    color: palette.inverseText,
    fontWeight: '600',
  },
});
