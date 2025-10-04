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
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';
import UserGroups from '@/assets/images/User Groups.svg';

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
  return (
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
            <TouchableOpacity key={item.id} style={styles.item}>
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 24,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '300',
    color: '#111827',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderColor: '#F1F1F1',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  groupAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  personAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
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
    color: '#111827',
    fontWeight: '600',
  },
  itemTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemDescription: {
    fontSize: 12,
    color: '#111827',
  },
  unreadDot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
