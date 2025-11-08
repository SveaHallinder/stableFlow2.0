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
import { useRouter } from 'expo-router';
import UserGroups from '@/assets/images/User Groups.svg';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { radius, space } from '@/design/tokens';
import { surfacePresets, systemPalette } from '@/design/system';
import { useAppData } from '@/context/AppDataContext';
import type { MessagePreview } from '@/context/AppDataContext';

const palette = theme.colors;
const radii = theme.radii;

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
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        style={styles.pageHeader}
        title="Meddelanden"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.list}>
          {messages.map((item) => {
            const badgeColor = item.group ? '#2E7CF6' : '#22B686';
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                onPress={() => handleOpenConversation(item)}
                activeOpacity={0.9}
              >
                <View style={styles.avatarBubble}>
                  {item.group ? (
                    <View style={[styles.groupAvatar, { backgroundColor: `${badgeColor}15` }]}>
                      <UserGroups width={22} height={22} />
                    </View>
                  ) : (
                    <Image
                      source={item.avatar ?? require('@/assets/images/dummy-avatar.png')}
                      style={styles.personAvatar}
                    />
                  )}
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.unreadCount ? (
                        <View style={[styles.unreadDot, { backgroundColor: badgeColor }]}>
                          <Text style={styles.unreadCount}>{item.unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemTime}>{item.timeAgo}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.itemSubtitle}>
                    {item.group ? `${item.subtitle}` : item.subtitle}
                  </Text>
                  <Text numberOfLines={1} style={styles.itemPreview}>
                    {item.description}
                  </Text>
                  <View style={styles.itemFooter}>
                    <View style={styles.statusChip}>
                      <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
                      <Text style={styles.statusText}>
                        {item.group ? 'Grupptråd' : 'Privat chatt'}
                      </Text>
                    </View>
                    <Text style={styles.ctaText}>Visa tråd →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: systemPalette.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 40,
    paddingTop: 10,
    gap: 18,
  },
  pageHeader: {
    marginBottom: 8,
  },
  list: {
    gap: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.xl,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    shadowColor: palette.overlay,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  avatarBubble: {
    marginRight: 16,
  },
  groupAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surfacePresets.section,
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderMuted,
  },
  itemBody: {
    flex: 1,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemTitle: {
    fontSize: 17,
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
  itemPreview: {
    fontSize: 13,
    color: '#1C2439',
    opacity: 0.7,
  },
  unreadDot: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 10,
    color: palette.inverseText,
    fontWeight: '600',
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: palette.secondaryText,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '600',
    color: systemPalette.primary,
  },
});
