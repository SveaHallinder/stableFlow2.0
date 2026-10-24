import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderActionButton } from '@/components/Primitives';
import { Avatar } from '@/components/Avatar';
import { StableSwitcher } from '@/components/StableSwitcher';
import { radius, space } from '@/design/tokens';
import { systemPalette } from '@/design/system';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import type { MessagePreview } from '@/context/AppDataContext';
import { MemberGroupCreateForm } from '@/components/MemberGroupModal';

const palette = theme.colors;

type MessageFilter = 'all' | 'stable' | 'custom' | 'private';

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
            <Ionicons name="people-outline" size={24} color={palette.primaryText} />
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
        {item.group ? <Text style={styles.emptyText}>{item.chatKind === 'custom'
          ? `Egen grupp${item.participantIds ? ` · ${item.participantIds.length} deltagare` : ''}`
          : 'Stallchatt · alla medlemmar'}</Text> : null}
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
  { label: 'Stallchatt', value: 'stable' },
  { label: 'Egna grupper', value: 'custom' },
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
  const isDesktopWeb = useIsDesktopWeb();
  const canManageOnboarding = derived.permissions.canManageOnboarding;
  const canOpenAdmin = canManageOnboarding;
  const [filter, setFilter] = React.useState<MessageFilter>('all');
  const [newChatOpen, setNewChatOpen] = React.useState(false);
  const [newChatMode, setNewChatMode] = React.useState<'private' | 'custom'>('private');
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const creatingGroupRef = React.useRef(false);
  const [memberSearch, setMemberSearch] = React.useState('');
  const [creatingUserId, setCreatingUserId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const creatingRef = React.useRef(false);
  const currentStateRef = React.useRef(state);
  currentStateRef.current = state;
  const chooserIdentity = `${currentUserId}:${state.sessionUserId}:${currentStableId}`;
  const chooserScopeRef = React.useRef({ identity: chooserIdentity, epoch: 0 });
  if (chooserScopeRef.current.identity !== chooserIdentity) {
    chooserScopeRef.current = { identity: chooserIdentity, epoch: chooserScopeRef.current.epoch + 1 };
  }
  React.useEffect(() => () => { chooserScopeRef.current.epoch += 1; }, []);
  const currentStableName = state.stables.find((stable) => stable.id === currentStableId)?.name;
  const memberOptions = React.useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase('sv-SE');
    return Object.values(state.users).filter((member) =>
      member.id !== currentUserId && !blockedUserIds.includes(member.id) &&
      member.membership.some((membership) => membership.stableId === currentStableId) &&
      (!query || member.name.toLocaleLowerCase('sv-SE').includes(query)),
    ).sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'));
  }, [blockedUserIds, currentStableId, currentUserId, memberSearch, state.users]);
  const stableChat = messages.find((item) => item.group && item.chatKind !== 'custom' && item.stableId === currentStableId);

  React.useEffect(() => {
    setNewChatOpen(false);
    setCreatingGroup(false);
    creatingGroupRef.current = false;
    setMemberSearch('');
    setCreateError(null);
  }, [currentStableId, currentUserId, state.sessionUserId]);

  const handleStartPrivateChat = React.useCallback(async (memberId: string) => {
    if (creatingRef.current) return;
    const current = currentStateRef.current;
    const member = current.users[memberId];
    if (!member || memberId === current.currentUserId || current.blockedUserIds.includes(memberId) ||
      !member.membership.some((membership) => membership.stableId === current.currentStableId)) {
      setCreateError('Välj en medlem i det aktuella stallet för att starta chatten.');
      return;
    }
    const epoch = chooserScopeRef.current.epoch;
    const sameContext = () => chooserScopeRef.current.epoch === epoch;
    creatingRef.current = true;
    setCreatingUserId(memberId);
    setCreateError(null);
    try {
      const result = await actions.createPrivateConversation(memberId);
      if (!sameContext()) return;
      if (!result.success || !result.data) {
        setCreateError(result.success ? 'Chatten kunde inte bekräftas. Försök igen.' : result.reason);
        return;
      }
      setNewChatOpen(false);
      setMemberSearch('');
      router.push({ pathname: '/chat/[id]', params: { id: result.data, name: member.name } });
    } catch (error) {
      console.warn('[chat chooser] Kunde inte öppna privat chatt', error instanceof Error ? error.name : 'Unknown');
      if (sameContext()) setCreateError('Chatten kunde inte öppnas. Ditt val finns kvar. Försök igen.');
    } finally {
      creatingRef.current = false;
      setCreatingUserId(null);
    }
  }, [actions, router]);

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
    stableFiltered.sort((a, b) => Number(Boolean(b.group)) - Number(Boolean(a.group)));
    if (filter === 'stable') return stableFiltered.filter((item) => item.group && item.chatKind !== 'custom');
    if (filter === 'custom') return stableFiltered.filter((item) => item.chatKind === 'custom');
    if (filter === 'private') return stableFiltered.filter((item) => !item.group);
    return stableFiltered;
  }, [messages, currentStableId, filter, isBlockedPrivateConversation]);

  const emptyStateActions = [
    ...(filter !== 'all' ? [{ label: 'Visa alla chattar', onPress: () => setFilter('all'), variant: 'secondary' as const }] : []),
    { label: 'Ny chatt', onPress: () => setNewChatOpen(true), variant: 'primary' as const },
    { label: 'Visa medlemmar', onPress: handleOpenMembers, variant: 'secondary' as const },
    ...(canOpenAdmin
      ? [{ label: 'Mitt stall', onPress: handleOpenAdmin, variant: 'secondary' as const }]
      : []),
  ];

  const emptyState = (
    <Card tone="muted" style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{filter === 'all' ? 'Inga meddelanden ännu' : filter === 'stable' ? 'Stallchatten kunde inte laddas' : filter === 'custom' ? 'Inga egna grupper ännu' : 'Inga privata chattar ännu'}</Text>
      <Text style={styles.emptyText}>
        {canManageOnboarding
          ? 'Starta en privat chatt eller en egen grupp med Ny chatt. Bjud in fler till stallet via Mitt stall.'
          : 'Välj Ny chatt för en privat konversation eller en egen grupp med valda stallmedlemmar.'}
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
          title="Chatt"
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
        title="Chatt"
        primaryAction={
          <HeaderActionButton label="Ny chatt" onPress={() => setNewChatOpen(true)} />
        }
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
        <View style={styles.introduction}>
          <Text style={styles.introductionTitle}>{currentStableName ? `Chattar i ${currentStableName}` : 'Dina konversationer'}</Text>
          <Text style={styles.emptyText}>Stallchatten är gemensam. Egna grupper har valda deltagare. Med Ny chatt startar du en privat chatt eller en egen grupp.</Text>
        </View>
        {newChatOpen ? (
          <Card style={styles.newChatCard}>
            <View style={styles.chooserHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text accessibilityRole="header" style={styles.emptyTitle}>Ny chatt</Text>
                <Text style={styles.emptyText}>{currentStableName ?? 'Det aktuella stallet'}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stäng ny chatt" disabled={creatingUserId !== null || creatingGroup} onPress={() => { if (!creatingRef.current && !creatingGroupRef.current) setNewChatOpen(false); }} style={styles.closeChooser}>
                <Ionicons name="close" size={21} color={palette.primaryText} />
              </TouchableOpacity>
            </View>
            <View style={styles.panelChips}>
              {([{ value: 'private', label: 'Privat chatt' }, { value: 'custom', label: 'Egen grupp' }] as const).map(option => (
                <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: newChatMode === option.value, disabled: creatingUserId !== null || creatingGroup }} disabled={creatingUserId !== null || creatingGroup} onPress={() => { if (!creatingRef.current && !creatingGroupRef.current) setNewChatMode(option.value); }} style={[styles.panelChip, newChatMode === option.value && styles.panelChipActive]}>
                  <Text style={styles.panelChipText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={newChatMode !== 'private' && styles.hiddenChooser}>
            <View style={styles.memberSearch}>
              <Ionicons name="search-outline" size={18} color={palette.secondaryText} />
              <TextInput accessibilityLabel="Sök medlem för ny chatt" placeholder="Sök medlem" placeholderTextColor={palette.secondaryText} value={memberSearch} onChangeText={setMemberSearch} style={styles.memberSearchInput} autoCorrect={false} returnKeyType="search" />
            </View>
            {createError ? <Text accessibilityRole="alert" style={styles.createError}>{createError}</Text> : null}
            {creatingUserId ? <Text accessibilityLiveRegion="polite" style={styles.emptyText}>Öppnar chatt…</Text> : null}
            {memberOptions.length ? memberOptions.map((member) => (
              <TouchableOpacity key={member.id} accessibilityRole="button" accessibilityLabel={`Starta privat chatt med ${member.name}`} accessibilityState={{ disabled: creatingUserId !== null, busy: creatingUserId === member.id }} disabled={creatingUserId !== null} onPress={() => handleStartPrivateChat(member.id)} style={styles.memberOption} activeOpacity={0.85}>
                <Avatar source={member.avatar} style={styles.memberAvatar} />
                <Text style={styles.memberName}>{member.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.secondaryText} />
              </TouchableOpacity>
            )) : (
              <Text style={styles.emptyText}>{memberSearch.trim() ? 'Ingen medlem matchar sökningen. Prova ett annat namn.' : 'Inga andra medlemmar i stallet ännu. När de har gått med visas de här.'}</Text>
            )}
            </View>
            <View style={newChatMode !== 'custom' && styles.hiddenChooser}>
              <MemberGroupCreateForm key={chooserIdentity} onBusyChange={busy => { creatingGroupRef.current = busy; setCreatingGroup(busy); }} onCreated={group => {
                setNewChatOpen(false);
                router.push({ pathname: '/chat/[id]', params: { id: group.id, name: group.title } });
              }} />
            </View>
          </Card>
        ) : null}
        {!stableChat && currentStableId ? (
          <Card style={styles.newChatCard}>
            <Text style={styles.emptyTitle}>Stallchatten kunde inte laddas</Text>
            <Text style={styles.emptyText}>Stallchatten samlar alla medlemmar i det här stallet. Uppdatera chattlistan för att hämta den.</Text>
            <TouchableOpacity accessibilityRole="button" disabled={refreshing} onPress={() => { void actions.refreshData(); }} style={[styles.emptyAction, styles.emptyActionPrimary]}>
              <Text style={styles.emptyActionPrimaryText}>{refreshing ? 'Uppdaterar…' : 'Uppdatera chattar'}</Text>
            </TouchableOpacity>
          </Card>
        ) : null}
        <View style={styles.panelChips}>
          {FILTER_OPTIONS.map((option) => {
            const active = filter === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                style={[styles.panelChip, active && styles.panelChipActive]}
                onPress={() => setFilter(option.value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.panelChipText, active && styles.panelChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.list}>{messageList}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hiddenChooser: { display: 'none' },
  introduction: { gap: 7 },
  introductionTitle: { fontFamily: theme.fonts.semibold, fontSize: 17, lineHeight: 24, color: palette.primaryText },
  newChatCard: { padding: 18, gap: 14 },
  chooserHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  closeChooser: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  memberSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12 },
  memberSearchInput: { flex: 1, minWidth: 0, minHeight: 44, fontFamily: theme.fonts.regular, fontSize: 16, color: palette.primaryText },
  memberOption: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  memberName: { flex: 1, minWidth: 0, fontFamily: theme.fonts.medium, fontSize: 15, color: palette.primaryText },
  createError: { fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 20, color: palette.error },
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
    paddingHorizontal: 22,
    paddingBottom: 120,
    paddingTop: 10,
    gap: 24,
  },
  contentDesktop: {
    maxWidth: 960,
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
    maxWidth: 960,
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
    borderRadius: 0,
    minHeight: 94,
    paddingVertical: 18,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    backgroundColor: 'transparent',
  },
  itemDesktop: {
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderRadius: 0,
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
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyActionPrimaryText: {
    color: palette.primaryText,
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
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  panelChipActive: {
    backgroundColor: palette.surfaceTint,
    borderColor: palette.primaryText,
  },
  panelChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  panelChipTextActive: {
    color: palette.primaryText,
  },
  avatarBubble: {
    marginRight: 10,
  },
  groupAvatar: {
    backgroundColor: palette.surfaceMuted,
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
    color: palette.secondaryText,
    lineHeight: 21,
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
