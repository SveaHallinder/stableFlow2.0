import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/components/theme';
import { color, space, radius } from '@/design/tokens';
import type { PostComment } from '@/context/AppDataContext';

export type PostData = {
  id: string;
  authorId?: string;
  author: string;
  avatar: ImageSourcePropType;
  timeAgo: string;
  content?: string;
  imageSignedUrl?: string;
  likes: number;
  comments: number;
  groupLabels?: string[];
  likedByUserIds?: string[];
  commentsData?: PostComment[];
  stableId?: string;
};

const palette = theme.colors;

type PostCardProps = {
  data: PostData;
  currentUserId?: string;
  onToggleLike?: () => void;
  onAddComment?: (text: string) => void;
  canInteract?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
  onReport?: () => void;
  onReportComment?: (commentId: string) => void;
};

export const PostCard = React.memo(function PostCard({
  data,
  currentUserId,
  onToggleLike,
  onAddComment,
  canInteract = true,
  canDelete = false,
  onDelete,
  onReport,
  onReportComment,
}: PostCardProps) {
  const [showComposer, setShowComposer] = React.useState(false);
  const [commentText, setCommentText] = React.useState('');
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [data.imageSignedUrl]);

  const isLiked = currentUserId ? data.likedByUserIds?.includes(currentUserId) : false;
  const comments = data.commentsData ?? [];
  const visibleComments = comments.slice(-2);

  const handleSubmitComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed || !onAddComment) {
      return;
    }
    onAddComment(trimmed);
    setCommentText('');
    setShowComposer(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          <Image source={data.avatar} style={styles.avatar} />
        </View>
        <View style={styles.authorBlock}>
          <Text style={styles.author}>{data.author}</Text>
          <Text style={styles.timestamp}>{data.timeAgo}</Text>
        </View>
        {onReport ? (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={onReport}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Rapportera inlägg"
          >
            <Feather name="flag" size={16} color={palette.secondaryText} />
          </TouchableOpacity>
        ) : null}
        {canDelete && onDelete ? (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={onDelete}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ta bort inlägg"
          >
            <Feather name="more-vertical" size={18} color={palette.secondaryText} />
          </TouchableOpacity>
        ) : null}
      </View>

      {data.groupLabels?.length ? (
        <View style={styles.groupRow}>
          {data.groupLabels.map((label) => (
            <View key={label} style={styles.groupChip}>
              <Text style={styles.groupChipText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.content && <Text style={styles.content}>{data.content}</Text>}

      {data.imageSignedUrl && !imageFailed && (
        <Image
          source={{ uri: data.imageSignedUrl }}
          style={styles.postImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      )}

      {visibleComments.length ? (
        <View style={styles.commentList}>
          {visibleComments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
              {onReportComment && comment.authorId && comment.authorId !== currentUserId ? (
                <TouchableOpacity
                  onPress={() => onReportComment(comment.id)}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Rapportera kommentar"
                >
                  <Feather name="flag" size={13} color={palette.secondaryText} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, isLiked && styles.actionButtonActive]}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            onToggleLike?.();
          }}
          disabled={!canInteract}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Ta bort gilla' : 'Gilla inlägg'}
          accessibilityState={{ selected: isLiked }}
        >
          <Feather
            name="heart"
            size={16}
            color={isLiked ? palette.primary : palette.secondaryText}
          />
          <Text style={[styles.actionText, isLiked && styles.actionTextActive]}>{data.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => canInteract && setShowComposer((prev) => !prev)}
          disabled={!canInteract}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Kommentera"
        >
          <Feather name="message-circle" size={16} color={palette.secondaryText} />
          <Text style={styles.actionText}>{data.comments}</Text>
        </TouchableOpacity>
      </View>

      {showComposer && canInteract ? (
        <View style={styles.commentComposer}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Skriv en kommentar..."
            placeholderTextColor={palette.mutedText}
            style={styles.commentInput}
          />
          <TouchableOpacity
            style={[
              styles.commentSendButton,
              !commentText.trim() && styles.commentSendButtonDisabled,
            ]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Skicka kommentar"
          >
            <Text style={styles.commentSendText}>Skicka</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: space.md,
    paddingHorizontal: 0,
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  authorBlock: {
    flex: 1,
    gap: 2,
  },
  author: {
    fontSize: 16,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  timestamp: {
    fontSize: 13,
    color: color.textMuted,
    fontWeight: '400',
  },
  moreButton: {
    padding: 8,
  },
  content: {
    fontSize: 15,
    color: color.text,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  postImage: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-start',
    aspectRatio: 1,
    borderRadius: radius.lg,
  },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  groupChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  groupChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  commentList: {
    gap: 6,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  commentBody: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  commentText: {
    fontSize: 12,
    color: palette.secondaryText,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  actionButtonActive: {
    transform: [{ scale: 1.01 }],
  },
  actionText: {
    fontSize: 13,
    color: color.textMuted,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  actionTextActive: {
    color: palette.primary,
  },
  commentComposer: {
    marginTop: space.sm,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: palette.primaryText,
  },
  commentSendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  commentSendButtonDisabled: {
    opacity: 0.5,
  },
  commentSendText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.inverseText,
  },
});
