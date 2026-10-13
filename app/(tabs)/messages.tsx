import React from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import UserGroups from '@/assets/images/figma/group.svg';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Primitives';
import { Avatar } from '@/components/Avatar';
import { StableSwitcher } from '@/components/StableSwitcher';
import { radius, space } from '@/design/tokens';
import { systemPalette } from '@/design/system';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb, webStickyStyle } from '@/hooks/useIsDesktopWeb';
import type { MessagePreview } from '@/context/AppDataContext';

const palette = theme.colors;

type MessageFilter = 'all' | 'group' | 'private';

const MessageItem = React.memo(function MessageItem({
  item,
  onPress,
  desktop,
}: {
  item: MessagePreview;
  onPress: () => void;
  desktop?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.item, desktop && styles.itemDesktop]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Öppna konversation med ${item.title}${item.unreadCount ? `, ${item.unreadCount} olästa meddelanden` : ''}`}
    >
      <View style={styles.avatarBubble}>
        {item.group ? (
          <View style={styles.groupAvatar}>
            <UserGroups />
          </View>
        ) : (
          <Avatar
            source={item.avatar}
            style={styles.personAvatar}
            accessibilityLabel={`${item.title} profilbild`}
          />
        )}
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleRow}>
            <Text numberOfLines={1} style={[styles.itemTitle, item.unreadCount ? styles.itemTitleUnread : undefined]}>{item.title}</Text>
            {item.unreadCount ? (
              <View style={styles.unreadBadge}>
                <View style={styles.unreadDot} />
                <Text style={styles.unreadCount}>{item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.itemTime}>{item.timeAgo}</Text>
        </View>
        <Text numberOfLines={1} style={styles.itemPreview}>
          {item.description}
        </Text>
        {(!item.readMessageIds || !item.unreadMessageIds) && (
          <Text style={styles.readStatusHint}>Oläststatus ej bekräftad. Uppdatera chattlistan.</Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const FILTER_OPTIONS: { label: string; value: MessageFilter }[] = [
  { label: 'Alla', value: 'all' },
  { label: 'Grupper', value: 'group' },
  { label: 'Privat', value: 'private' },
];

export default function MessagesScreen() {
  const router = useRouter();
  const { state, actions, derived, hydrating, refreshing, refreshError } = useAppData();
  const { messages, currentStableId, conversations, currentUserId, blockedUserIds } = state;

  // A private conversation whose only other participant is blocked is hidden from the list.
  const isBlockedPrivateConversation = React.useCallback(
    (item: MessagePreview) => {
      if (item.group || !blockedUserIds.length) {
        return false;
      }
      const participants = conversations[item.id] ?? [];
      const others = participants
        .map((message) => message.authorId)
        .filter((authorId) => authorId && authorId !== currentUserId);
      return others.length > 0 && others.every((authorId) => blockedUserIds.includes(authorId));
    },
    [blockedUserIds, conversations, currentUserId],
  );
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = useIsDesktopWeb();
  const stickyPanelStyle = isDesktopWeb ? webStickyStyle : undefined;
  const canManageOnboarding = derived.permissions.canManageOnboarding;
  const canOpenAdmin = canManageOnboarding && isWeb;
  const adminHint = canManageOnboarding && !isWeb ? ' Admin finns i webben.' : '';
  const [filter, setFilter] = React.useState<MessageFilter>('all');

  const handleOpenConversation = (item: MessagePreview) => {
    router.push({
      pathname: '/chat/[id]',
      params: { id: item.id, name: item.title },
    });
  };

  const handleOpenMembers = React.useCallback(() => {
    router.push('/members');
  }, [router]);

  const handleOpenAdmin = React.useCallback(() => {
    router.push('/admin');
  }, [router]);

  const activeMessages = React.useMemo(() => {
    const stableFiltered = messages.filter(
      (item) =>
        (!item.stableId || item.stableId === currentStableId) &&
        !isBlockedPrivateConversation(item),
    );
    if (filter === 'group') return stableFiltered.filter((item) => item.group);
    if (filter === 'private') return stableFiltered.filter((item) => !item.group);
    return stableFiltered;
  }, [messages, currentStableId, filter, isBlockedPrivateConversation]);

  const emptyStateActions = [
    { label: 'Hitta medlem', onPress: handleOpenMembers, variant: 'primary' as const },
    ...(canOpenAdmin
      ? [{ label: 'Öppna admin', onPress: handleOpenAdmin, variant: 'secondary' as const }]
      : []),
  ];

  const emptyState = (
    <Card tone="muted" style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>Inga meddelanden ännu</Text>
      <Text style={styles.emptyText}>
        {canManageOnboarding
          ? `Starta en chatt via en medlem eller bjud in fler via Admin.${adminHint}`
          : 'Öppna en medlem och tryck Chatta.'}
      </Text>
      <View style={styles.emptyActions}>
        {emptyStateActions.map((action) => {
          const isPrimary = action.variant === 'primary';
          return (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.emptyAction,
                isPrimary ? styles.emptyActionPrimary : styles.emptyActionSecondary,
              ]}
              onPress={action.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.emptyActionText,
                  isPrimary ? styles.emptyActionPrimaryText : styles.emptyActionSecondaryText,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );

  const messageList = activeMessages.length === 0
    ? emptyState
    : activeMessages.map((item) => (
        <MessageItem
          key={item.id}
          item={item}
          onPress={() => handleOpenConversation(item)}
          desktop={isDesktopWeb}
        />
      ));

  if (hydrating) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Meddelanden"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
        title="Meddelanden"
      />
      {!isDesktopWeb ? <StableSwitcher /> : null}
      {refreshError && <Text accessibilityRole="alert" style={styles.emptyText}>{refreshError} Oläststatus kan inte bekräftas just nu.</Text>}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
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
            <View style={[styles.desktopPanel, stickyPanelStyle]}>
              <Card tone="muted" style={styles.panelCard}>
                <Text style={styles.panelTitle}>Inkorg</Text>
                <Text style={styles.panelText}>
                  Håll koll på nya meddelanden och grupptrådar för ditt stall.
                </Text>
              </Card>
              <Card tone="muted" style={styles.panelCard}>
                <Text style={styles.panelTitle}>Snabbfilter</Text>
                <View style={styles.panelChips}>
                  {FILTER_OPTIONS.map((option) => {
                    const active = filter === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.panelChip, active && styles.panelChipActive]}
                        onPress={() => setFilter(option.value)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.panelChipText, active && styles.panelChipTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>
            </View>
            <View style={styles.desktopList}>
              <View style={[styles.list, styles.listDesktop]}>{messageList}</View>
            </View>
          </View>
        ) : (
          <View style={styles.list}>{messageList}</View>
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
    paddingBottom: 120,
    paddingTop: 0,
    gap: 0,
  },
  contentDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  desktopLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  desktopPanel: {
    width: 240,
    flexShrink: 0,
    gap: 12,
  },
  desktopList: {
    flex: 1,
    minWidth: 0,
  },
  pageHeader: {
    marginBottom: 8,
  },
  pageHeaderDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 40,
    marginBottom: 8,
  },
  list: {
    gap: 0,
  },
  listDesktop: {
    gap: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    minHeight: 80,
    padding: 15,
    backgroundColor: 'transparent',
  },
  itemDesktop: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  panelCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 0,
    gap: 10,
  },
  panelTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    fontWeight: '700',
    color: palette.primaryText,
  },
  panelText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  emptyCard: {
    padding: space.lg,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: theme.fonts.bold,
    fontWeight: '700',
    color: palette.primaryText,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  emptyAction: {
    flexGrow: 1,
    minWidth: 140,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
  },
  emptyActionPrimary: {
    backgroundColor: palette.primary,
  },
  emptyActionPrimaryText: {
    color: palette.inverseText,
    fontWeight: '700',
  },
  emptyActionSecondary: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  emptyActionSecondaryText: {
    color: palette.primaryText,
  },
  panelChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  panelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  panelChipActive: {
    backgroundColor: palette.surfaceTint,
    borderColor: palette.primary,
  },
  panelChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  panelChipTextActive: {
    color: palette.primary,
  },
  avatarBubble: {
    marginRight: 10,
  },
  groupAvatar: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatar: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    gap: 8,
    justifyContent: 'space-between',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    color: palette.primaryText,
    fontWeight: '400',
    flexShrink: 1,
  },
  itemTitleUnread: {
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
  },
  itemTime: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    flexShrink: 0,
  },
  itemPreview: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: palette.primaryText,
    lineHeight: 19,
  },
  readStatusHint: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  unreadCount: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.secondaryText,
  },
});
