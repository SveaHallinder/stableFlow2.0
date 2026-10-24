import React from 'react';
import {
  AppState,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/components/theme';
import { radius, space } from '@/design/tokens';
import { HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar } from '@/components/Avatar';
import { DesktopNav } from '@/components/DesktopNav';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import type { MessagePreview } from '@/context/AppDataContext';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '@/components/ToastProvider';
import { generateId } from '@/lib/ids';
import { chatUnreadIds, scrollReadViewport, visibleMessageIds } from '@/lib/chatReadReceipts';
import { useAuth } from '@/context/AuthContext';

const palette = theme.colors;

export default function ChatScreen() {
  const router = useRouter();
  const { state, actions } = useAppData();
  const { user } = useAuth();
  const focused = useIsFocused();
  const { markConversationRead, sendConversationMessage } = actions;
  const { id: rawId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const isDesktopWeb = useIsDesktopWeb();
  const conversationPreview = state.messages.find(
    (message: MessagePreview) => message.id === conversationId,
  );
  const displayName = name ?? conversationPreview?.title ?? 'Konversation';
  const isGroup = conversationPreview?.group ?? false;

  const conversationMessages = state.conversations[conversationId];
  const messages = React.useMemo(
    () =>
      (conversationMessages ?? []).filter(
        (message) => !state.blockedUserIds.includes(message.authorId),
      ),
    [conversationMessages, state.blockedUserIds],
  );
  const [composerText, setComposerText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const sendingRef = React.useRef(false);
  const requestIdRef = React.useRef<string | null>(null);
  const attemptedTextRef = React.useRef('');
  const toast = useToast();
  const scrollViewRef = React.useRef<ScrollView>(null);

  const [foreground, setForeground] = React.useState(() =>
    (!AppState.currentState || AppState.currentState === 'active')
    && (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState !== 'hidden'));
  const [readError, setReadError] = React.useState<string | null>(null);
  const [savingRead, setSavingRead] = React.useState(false);
  const [observed, setObserved] = React.useState<{ epoch: number; ids: string[] }>({ epoch: -1, ids: [] });
  const layoutsRef = React.useRef(new Map<string, { y: number; height: number }>());
  const viewportRef = React.useRef({ y: 0, height: 0 });
  const pendingReadRef = React.useRef<object | null>(null);
  const failedReadIdsRef = React.useRef<{ epoch: number; ids: string[] } | null>(null);
  const measureVersionRef = React.useRef(0);
  const layoutIdentity = `${user?.id ?? ''}:${state.sessionUserId ?? ''}:${conversationId}`;
  const layoutIdentityRef = React.useRef(layoutIdentity);
  if (layoutIdentityRef.current !== layoutIdentity) {
    layoutIdentityRef.current = layoutIdentity;
    layoutsRef.current.clear();
    viewportRef.current = { y: 0, height: 0 };
  }
  const identity = `${user?.id ?? ''}:${state.sessionUserId ?? ''}:${conversationId}:${focused}:${foreground}`;
  const readScopeRef = React.useRef({ identity, epoch: 0 });
  if (readScopeRef.current.identity !== identity) {
    readScopeRef.current = { identity, epoch: readScopeRef.current.epoch + 1 };
  }
  const readReady = Boolean(conversationPreview?.readMessageIds && conversationPreview.unreadMessageIds)
    && user?.id === state.sessionUserId && user?.id === state.currentUserId;
  const unreadIds = React.useMemo(() => readReady && conversationPreview
    ? chatUnreadIds(conversationPreview, conversationMessages ?? [], state.currentUserId, state.blockedUserIds) : [],
  [readReady, conversationPreview, conversationMessages, state.currentUserId, state.blockedUserIds]);
  const observerEpoch = readScopeRef.current.epoch;
  const visibleUnreadKey = observed.epoch === observerEpoch ? observed.ids.filter(id => unreadIds.includes(id)).sort().join(',') : '';
  const retryReadIds = failedReadIdsRef.current?.epoch === observerEpoch ? failedReadIdsRef.current.ids : [];
  const unloadedUnreadCount = unreadIds.filter(id => !messages.some(message => message.id === id)).length;
  const updateObserved = React.useCallback(() => {
    if (readScopeRef.current.identity !== identity || readScopeRef.current.epoch !== observerEpoch) return;
    const epoch = readScopeRef.current.epoch;
    const version = ++measureVersionRef.current;
    const node = scrollViewRef.current?.getNativeScrollRef();
    node?.measureInWindow((left, top, width, height) => {
      if (readScopeRef.current.epoch !== epoch || measureVersionRef.current !== version) return;
      const clips: { top: number; bottom: number }[] = [];
      const horizontalClips = [{ left: 0, right: Dimensions.get('window').width }];
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const visualViewport = window.visualViewport;
        if (visualViewport) {
          clips.push({ top: visualViewport.offsetTop, bottom: visualViewport.offsetTop + visualViewport.height });
          horizontalClips.push({ left: visualViewport.offsetLeft, right: visualViewport.offsetLeft + visualViewport.width });
        }
        // Web ancestors can clip the native scroll rectangle independently of
        // the browser window. The returned DOM host already belongs to this view.
        let parent = (node as unknown as HTMLElement).parentElement;
        while (parent) {
          const overflow = window.getComputedStyle(parent);
          if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow.overflowY)) {
            const rect = parent.getBoundingClientRect();
            const clipTop = rect.top + parent.clientTop;
            clips.push({ top: clipTop, bottom: clipTop + parent.clientHeight });
          }
          if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow.overflowX)) {
            const clipLeft = parent.getBoundingClientRect().left + parent.clientLeft;
            horizontalClips.push({ left: clipLeft, right: clipLeft + parent.clientWidth });
          }
          parent = parent.parentElement;
        }
      }
      const viewport = scrollReadViewport(viewportRef.current.y, top, height, Dimensions.get('window').height, clips);
      const horizontallyVisible = Math.min(left + width, ...horizontalClips.map(clip => clip.right))
        > Math.max(left, ...horizontalClips.map(clip => clip.left));
      const next = horizontallyVisible ? visibleMessageIds(layoutsRef.current, viewport,
        messages.filter(message => message.authorId !== state.currentUserId).map(message => message.id)) : [];
      setObserved(previous => previous.epoch === epoch && previous.ids.join(',') === next.join(',')
        ? previous : { epoch, ids: next });
    });
  }, [messages, state.currentUserId, identity, observerEpoch]);

  React.useEffect(() => {
    const update = () => setForeground((!AppState.currentState || AppState.currentState === 'active')
      && (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState !== 'hidden'));
    const subscription = AppState.addEventListener('change', update);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', update);
    update();
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', update);
    };
  }, []);
  React.useEffect(() => {
    setReadError(null);
    setSavingRead(false);
    pendingReadRef.current = null;
    failedReadIdsRef.current = null;
  }, [conversationId, user?.id, state.sessionUserId]);
  React.useEffect(() => {
    failedReadIdsRef.current = null;
    setReadError(null);
  }, [observerEpoch]);
  React.useEffect(() => {
    updateObserved();
    const subscription = Dimensions.addEventListener('change', updateObserved);
    const visualViewport = Platform.OS === 'web' && typeof window !== 'undefined' ? window.visualViewport : null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('scroll', updateObserved, true);
    visualViewport?.addEventListener('scroll', updateObserved);
    visualViewport?.addEventListener('resize', updateObserved);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('scroll', updateObserved, true);
      visualViewport?.removeEventListener('scroll', updateObserved);
      visualViewport?.removeEventListener('resize', updateObserved);
    };
  }, [updateObserved]);
  React.useEffect(() => () => {
    readScopeRef.current.epoch += 1;
    pendingReadRef.current = null;
  }, []);

  React.useEffect(() => {
    const failed = failedReadIdsRef.current;
    if (readError && readReady && failed?.epoch === observerEpoch && failed.ids.length
      && failed.ids.every(id => conversationPreview?.readMessageIds?.includes(id))) {
      failedReadIdsRef.current = null;
      setReadError(null);
    }
  }, [readError, readReady, conversationPreview?.readMessageIds, observerEpoch]);
  const saveObserved = React.useCallback(async (retry = false) => {
    if (readScopeRef.current.epoch !== observerEpoch) return;
    const ids = retry
      ? failedReadIdsRef.current?.epoch === observerEpoch ? [...failedReadIdsRef.current.ids] : []
      : visibleUnreadKey ? visibleUnreadKey.split(',') : [];
    if (!focused || !foreground || !readReady || !ids.length) return;
    if (pendingReadRef.current) return;
    const epoch = readScopeRef.current.epoch;
    const attempt = {};
    pendingReadRef.current = attempt;
    setSavingRead(true);
    setReadError(null);
    try {
      const result = await markConversationRead(conversationId, ids);
      if (readScopeRef.current.epoch !== epoch) return;
      if (!result.success) {
        failedReadIdsRef.current = { epoch, ids };
        setReadError(result.reason);
      }
    } finally {
      if (pendingReadRef.current === attempt) {
        pendingReadRef.current = null;
        setSavingRead(false);
      }
    }
  }, [focused, foreground, readReady, visibleUnreadKey, markConversationRead, conversationId, observerEpoch]);
  React.useEffect(() => {
    if (!savingRead && !readError) void saveObserved();
  }, [saveObserved, savingRead, readError]);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = composerText.trim();
    if (!conversationId || !trimmed || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    if (attemptedTextRef.current !== trimmed) requestIdRef.current = null;
    requestIdRef.current ??= generateId();
    attemptedTextRef.current = trimmed;
    try {
      const result = await sendConversationMessage(conversationId, trimmed, requestIdRef.current);
      if (result.success) {
        setComposerText('');
        requestIdRef.current = null;
      } else {
        setSendError(result.reason);
        toast.showToast(result.reason, 'error');
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const wrapDesktop = (content: React.ReactNode) => {
    if (!isDesktopWeb) {
      return content;
    }
    return (
      <View style={styles.desktopShell}>
        <View style={styles.desktopSidebar}>
          <DesktopNav variant="sidebar" />
        </View>
        <View style={styles.desktopMain}>{content}</View>
      </View>
    );
  };

  if (!conversationId) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: palette.primaryText, marginBottom: 8 }}>
              Konversationen kunde inte hittas
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 999 }}>
              <Text style={{ color: palette.primaryText, fontWeight: '600', fontSize: 14 }}>Tillbaka</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        {wrapDesktop(
          <View style={styles.container}>
            <ScreenHeader
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              title=""
              left={
                <HeaderIconButton
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka"
                  onPress={() => router.back()}
                  style={styles.backButton}
                >
                  <Ionicons name="arrow-back" size={22} color={palette.primaryText} />
                </HeaderIconButton>
              }
              showLogo={false}
              showSearch={false}
            >
              <View style={styles.headerProfile}>
                {isGroup ? (
                  <View style={styles.headerGroupAvatar}>
                    <Ionicons name="people-outline" size={23} color={palette.primaryText} />
                  </View>
                ) : (
                  <Avatar
                    source={conversationPreview?.avatar}
                    style={styles.headerAvatar}
                    accessibilityLabel={`${displayName} profilbild`}
                  />
                )}
                <Text style={[styles.headerTitle, isDesktopWeb && styles.headerTitleDesktop]} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </ScreenHeader>

            <ScrollView
              key={`${user?.id ?? ''}:${state.sessionUserId ?? ''}:${conversationId}`}
              ref={scrollViewRef}
              onLayout={event => { if (readScopeRef.current.epoch !== observerEpoch) return; viewportRef.current.height = event.nativeEvent.layout.height; updateObserved(); }}
              onScroll={event => { if (readScopeRef.current.epoch !== observerEpoch) return; viewportRef.current.y = event.nativeEvent.contentOffset.y; updateObserved(); }}
              scrollEventThrottle={100}
              style={styles.scroll}
              contentContainerStyle={[
                styles.messagesContent,
                isDesktopWeb && styles.messagesContentDesktop,
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {!messages.length && (
                <Text style={styles.emptyText}>Inga meddelanden har laddats här. Uppdatera chattlistan eller skriv ett meddelande.</Text>
              )}
              {messages.map((message, index) => {
                const isMe = message.authorId === state.currentUserId;
                const isLast = index === messages.length - 1;
                const authorProfile = state.users[message.authorId];
                const avatarSource = !isMe
                  ? authorProfile?.avatar ??
                    conversationPreview?.avatar
                  : undefined;

                return (
                  <View
                    key={message.id}
                    onLayout={event => { if (readScopeRef.current.epoch !== observerEpoch) return; layoutsRef.current.set(message.id, event.nativeEvent.layout); updateObserved(); }}
                    style={[styles.messageGroup, isLast && styles.messageGroupLast]}
                  >
                    <View
                      style={[
                        styles.messageRow,
                        isMe ? styles.messageRowMe : styles.messageRowOther,
                      ]}
                    >
                      {!isMe && (
                        <Avatar source={avatarSource} style={styles.messageAvatar} />
                      )}

                      <View
                        style={[
                          styles.messageBubble,
                          isDesktopWeb && styles.messageBubbleDesktop,
                          isMe && styles.messageBubbleMe,
                        ]}
                      >
                        <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                          {message.text}
                        </Text>
                      </View>
                    </View>

                    {message.status ? (
                      <Text
                        style={[
                          styles.statusText,
                          isMe ? styles.statusTextMe : styles.statusTextOther,
                        ]}
                      >
                        {{ sent: 'Skickat', delivered: 'Levererat', seen: 'Läst' }[message.status]}
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              <View style={styles.bottomSpacer} />
            </ScrollView>

            {unloadedUnreadCount > 0 && <Text style={styles.emptyText}>{unloadedUnreadCount === 1
              ? '1 oläst meddelande finns utanför den historik som laddats. Det markeras inte som läst här.'
              : `${unloadedUnreadCount} olästa meddelanden finns utanför den historik som laddats. De markeras inte som lästa här.`}</Text>}
            {!readReady && <Text style={styles.emptyText}>Oläststatus har inte kunnat bekräftas. Uppdatera chattlistan och försök igen.</Text>}
            {savingRead && <Text accessibilityLiveRegion="polite" style={styles.emptyText}>Sparar läskvittens…</Text>}
            {readError && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
                <Text accessibilityRole="alert" style={{ color: palette.error }}>{readError}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Försök spara läskvittensen igen"
                  disabled={savingRead || !focused || !foreground || !readReady || !retryReadIds.length}
                  onPress={() => { void saveObserved(true); }}>
                  <Text style={{ color: palette.primary, paddingVertical: 8 }}>Försök igen</Text>
                </TouchableOpacity>
              </View>
            )}
            {sendError && <Text accessibilityRole="alert" style={styles.errorText}>{sendError}</Text>}
            {sending && <Text accessibilityLiveRegion="polite" style={styles.emptyText}>Skickar…</Text>}
            <View style={[styles.composerContainer, isDesktopWeb && styles.composerContainerDesktop]}>
              <View style={[styles.composer, isDesktopWeb && styles.composerDesktop]}>
                <TextInput
                  placeholder="Skriv ditt meddelande..."
                  placeholderTextColor={palette.mutedText}
                  style={styles.composerInput}
                  value={composerText}
                  onChangeText={setComposerText}
                  editable={!sending}
                  accessibilityLabel="Meddelande"
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.sendButton, (sending || !composerText.trim()) && { opacity: 0.5 }]}
                  onPress={handleSend}
                  disabled={sending || !composerText.trim() || !conversationPreview}
                  accessibilityState={{ disabled: sending || !composerText.trim() || !conversationPreview, busy: sending }}
                  accessibilityRole="button"
                  accessibilityLabel="Skicka meddelande"
                  activeOpacity={0.85}
                >
                  <View style={styles.sendButtonCircle}>
                    <Ionicons name="arrow-up" size={20} color={palette.primaryText} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>,
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  emptyText: { color: palette.mutedText, fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingVertical: 12 },
  errorText: { color: palette.error, fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingVertical: 12 },
  background: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surface,
  },
  desktopMain: { flex: 1, minWidth: 0 },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    marginBottom: 10,
  },
  backButton: {
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexShrink: 1,
    flex: 1,
    width: '100%',
  },
  headerAvatar: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
  },
  headerGroupAvatar: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
    maxWidth: 220,
  },
  headerTitleDesktop: {
    maxWidth: 420,
  },
  scroll: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 8,
  },
  messagesContentDesktop: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  messageGroup: {
    marginBottom: 10,
  },
  messageGroupLast: {
    marginBottom: 0,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 25,
    height: 25,
    borderRadius: radius.full,
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  messageBubble: {
    maxWidth: '74%',
    borderRadius: 20,
    borderWidth: 0,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: palette.surfaceMuted,
  },
  messageBubbleDesktop: {
    maxWidth: '60%',
  },
  messageBubbleMe: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  messageText: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    lineHeight: 23,
    color: palette.primaryText,
  },
  messageTextMe: {
    color: palette.primaryText,
  },
  statusText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    color: palette.mutedText,
  },
  statusTextMe: {
    alignSelf: 'flex-end',
    marginRight: 6,
  },
  statusTextOther: {
    alignSelf: 'flex-start',
    marginLeft: 38,
  },
  bottomSpacer: {
    height: 4,
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: space.md,
  },
  composerContainerDesktop: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 54,
    backgroundColor: palette.surface,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: palette.border,
    paddingLeft: 15,
    paddingRight: 4,
    paddingVertical: 4,
  },
  composerDesktop: {
    paddingVertical: 4,
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    color: palette.primaryText,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonCircle: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonIcon: {
    fontSize: 18,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
});
