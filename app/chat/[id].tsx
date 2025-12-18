import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/components/theme';
import { radius, space } from '@/design/tokens';
import { HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppData } from '@/context/AppDataContext';
import type { ConversationMessage, MessagePreview } from '@/context/AppDataContext';
import UserGroupsIcon from '@/assets/images/User Groups.svg';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;

export default function ChatScreen() {
  const router = useRouter();
  const { state, actions } = useAppData();
  const { id: rawId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const conversationPreview = state.messages.find(
    (message: MessagePreview) => message.id === conversationId,
  );
  const displayName = name ?? conversationPreview?.title ?? 'Konversation';
  const isGroup = conversationPreview?.group ?? false;

  const messages = state.conversations[conversationId] ?? [];
  const [composerText, setComposerText] = React.useState('');
  const toast = useToast();

  React.useEffect(() => {
    if (conversationId) {
      actions.markConversationRead(conversationId);
    }
  }, [conversationId, actions]);

  const handleSend = () => {
    if (!conversationId || !composerText.trim()) {
      return;
    }
    const result = actions.sendConversationMessage(conversationId, composerText);
    if (result.success) {
      setComposerText('');
    } else if (!result.success) {
      toast.showToast(result.reason, 'error');
    }
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <ScreenHeader
            style={styles.pageHeader}
            title=""
            left={
              <HeaderIconButton
                accessibilityRole="button"
                accessibilityLabel="Tillbaka"
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Text style={styles.backIcon}>‹</Text>
              </HeaderIconButton>
            }
            showLogo={false}
            showSearch={false}
          >
            <View style={styles.headerProfile}>
              {isGroup ? (
                <View style={styles.headerGroupAvatar}>
                  <UserGroupsIcon width={20} height={20} />
                </View>
              ) : (
                <Image
                  source={
                    conversationPreview?.avatar ?? require('@/assets/images/dummy-avatar.png')
                  }
                  style={styles.headerAvatar}
                />
              )}
              <Text style={styles.headerTitle} numberOfLines={1}>
                {displayName}
              </Text>
            </View>
          </ScreenHeader>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message, index) => {
              const isMe = message.authorId === state.currentUserId;
              const isLast = index === messages.length - 1;
              const avatarSource = !isMe
                ? getAvatarForAuthor(message, conversationPreview)
                : undefined;

              return (
                <View
                  key={message.id}
                  style={[styles.messageGroup, isLast && styles.messageGroupLast]}
                >
                  <View
                    style={[
                      styles.messageRow,
                      isMe ? styles.messageRowMe : styles.messageRowOther,
                    ]}
                  >
                    {!isMe && avatarSource && (
                      <Image source={avatarSource} style={styles.messageAvatar} />
                    )}

                    <View
                      style={[
                        styles.messageBubble,
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
                      {message.status}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            <View style={styles.bottomSpacer} />
          </ScrollView>

          <View style={styles.composerContainer}>
            <View style={styles.composer}>
              <TouchableOpacity style={styles.composerAction}>
                <Text style={styles.composerActionIcon}>+</Text>
              </TouchableOpacity>

              <TextInput
                placeholder="Skriv ditt meddelande..."
                placeholderTextColor={palette.mutedText}
                style={styles.composerInput}
                value={composerText}
                onChangeText={setComposerText}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
            </View>

            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text style={styles.sendButtonIcon}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function getAvatarForAuthor(
  message: ConversationMessage,
  preview?: MessagePreview,
): ImageSourcePropType | undefined {
  if (preview?.group) {
    return require('@/assets/images/dummy-avatar.png');
  }
  if (message.authorId === 'user-karl') {
    return require('@/assets/images/dummy-avatar.png');
  }
  if (preview?.avatar) {
    return preview.avatar;
  }
  return require('@/assets/images/dummy-avatar.png');
}

const styles = StyleSheet.create({
  background: {
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
  pageHeader: {
    marginBottom: 0,
  },
  backButton: {
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
  },
  backIcon: {
    fontSize: 22,
    color: palette.icon,
    marginTop: -1,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    flexShrink: 1,
    flex: 1,
    width: '100%',
  },
  headerAvatar: {
    width: 35,
    height: 35,
    borderRadius: radius.full,
  },
  headerGroupAvatar: {
    width: 35,
    height: 35,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: palette.primaryText,
    maxWidth: 220,
  },
  scroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 30,
  },
  messageGroup: {
    marginBottom: 22,
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
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignSelf: 'flex-end',
    marginBottom: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.surfaceTint,
  },
  messageBubbleMe: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 18,
    color: palette.primaryText,
  },
  messageTextMe: {
    color: palette.inverseText,
  },
  statusText: {
    marginTop: 6,
    fontSize: 12,
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
    height: 12,
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: space.md,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.full,
    borderWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  composerAction: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  composerActionIcon: {
    fontSize: 18,
    color: palette.primary,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    color: palette.primaryText,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sendButtonIcon: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.inverseText,
  },
});
