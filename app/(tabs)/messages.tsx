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
import UserGroups from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { radius, shadow, space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import type { MessagePreview } from '@/context/AppDataContext';

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;

export default function MessagesScreen() {
  const router = useRouter();
  const { state, actions } = useAppData();
  const { messages } = state;

  const handleOpenConversation = (item: MessagePreview) => {
    actions.markConversationRead(item.id);
    router.push({
      pathname: '/chat/[id]',
      params: { id: item.id, name: item.title },
    });
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={styles.pageHeader}
          title="Messages"
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >

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
                  <Image
                    source={item.avatar ?? require('@/assets/images/dummy-avatar.png')}
                    style={styles.personAvatar}
                  />
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
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
    paddingBottom: 50,
    gap: 24,
    paddingTop: 24,
  },
  pageHeader: {
    marginBottom: 0,
  },
  list: {
    gap: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.xl,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    marginRight: 14,
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontSize: 16,
    color: palette.primaryText,
    fontWeight: '500',
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
    borderRadius: radius.full,
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
