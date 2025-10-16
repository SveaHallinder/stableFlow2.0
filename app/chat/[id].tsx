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

type ConversationMessage = {
  id: string;
  author: 'me' | 'other';
  text: string;
  timestamp?: string;
  status?: string;
  avatar?: ImageSourcePropType;
};

const palette = theme.colors;
const radii = theme.radii;

const conversation: ConversationMessage[] = [
  {
    id: 'msg-1',
    author: 'other',
    text:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
    avatar: require('@/assets/images/dummy-avatar.png'),
  },
  {
    id: 'msg-2',
    author: 'me',
    text:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
  },
  {
    id: 'msg-3',
    author: 'me',
    text: 'Lorem ipsum dolor sit amet.',
    status: 'Delivered',
  },
];

export default function ChatScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>

          <View style={styles.headerProfile}>
            <Image
              source={require('@/assets/images/dummy-avatar.png')}
              style={styles.headerAvatar}
            />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {name ?? 'Ida Magnusson'}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {conversation.map((item, index) => {
            const isMe = item.author === 'me';
            const isLast = index === conversation.length - 1;

            return (
              <View
                key={item.id}
                style={[
                  styles.messageGroup,
                  isLast && styles.messageGroupLast,
                ]}
              >
                <View
                  style={[
                    styles.messageRow,
                    isMe ? styles.messageRowMe : styles.messageRowOther,
                  ]}
                >
                  {!isMe && item.avatar && (
                    <Image source={item.avatar} style={styles.messageAvatar} />
                  )}

                  <View
                    style={[
                      styles.messageBubble,
                      isMe && styles.messageBubbleMe,
                    ]}
                  >
                    <Text
                      style={[styles.messageText, isMe && styles.messageTextMe]}
                    >
                      {item.text}
                    </Text>
                  </View>
                </View>

                {item.status && (
                  <Text
                    style={[
                      styles.statusText,
                      isMe ? styles.statusTextMe : styles.statusTextOther,
                    ]}
                  >
                    {item.status}
                  </Text>
                )}
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
              placeholder="Write your message here..."
              placeholderTextColor={palette.mutedText}
              style={styles.composerInput}
            />
          </View>

          <TouchableOpacity style={styles.sendButton}>
            <Text style={styles.sendButtonIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
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
    gap: 14,
    flexShrink: 1,
    flex: 1,
  },
  headerAvatar: {
    width: 50,
    height: 50,
    borderRadius: radii.pill,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
    maxWidth: 220,
  },
  headerPlaceholder: {
    width: 32,
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
    borderRadius: radii.pill,
    alignSelf: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: radii.lg,
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
    paddingBottom: 18,
    gap: 12,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.pill,
    borderWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  composerAction: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
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
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonIcon: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.inverseText,
  },
});
