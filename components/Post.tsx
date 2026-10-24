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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/components/theme';
import { Avatar } from '@/components/Avatar';
import { color, space, radius } from '@/design/tokens';
import type { ActionResult, PostComment } from '@/context/AppDataContext';
import { generateId } from '@/lib/ids';

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
  onToggleLike?: () => Promise<ActionResult>;
  onAddComment?: (text: string, requestId: string) => Promise<ActionResult<PostComment>>;
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
  const commentPendingRef = React.useRef(false);
  const commentRequestIdRef = React.useRef<string | null>(null);
  const [commentPending, setCommentPending] = React.useState(false);
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const likePendingRef = React.useRef(false);
  const [likePending, setLikePending] = React.useState(false);
  const [likeError, setLikeError] = React.useState<string | null>(null);
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [data.imageSignedUrl]);

  const isLiked = currentUserId ? data.likedByUserIds?.includes(currentUserId) : false;
  const comments = data.commentsData ?? [];
  const visibleComments = comments.slice(-2);

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !onAddComment || !canInteract || commentPendingRef.current) {
      return;
    }
    commentPendingRef.current = true;
    setCommentPending(true);
    setCommentError(null);
    commentRequestIdRef.current ??= generateId();
    try {
      const result = await onAddComment(trimmed, commentRequestIdRef.current);
      if (!result.success) { setCommentError(result.reason); return; }
      setCommentText('');
      commentRequestIdRef.current = null;
      setShowComposer(false);
    } catch (error) {
      console.warn('[post comment form] Kunde inte skicka kommentar', error);
      setCommentError('Kommentaren kunde inte sparas. Texten finns kvar. Försök igen.');
    } finally { commentPendingRef.current = false; setCommentPending(false); }
  };

  const handleToggleLike = async () => {
    if (!canInteract || !onToggleLike || likePendingRef.current) return;
    likePendingRef.current = true;
    setLikePending(true);
    setLikeError(null);
    try {
      const result = await onToggleLike();
      if (!result.success) { setLikeError(result.reason); return; }
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn('[post like control] Kunde inte spara gillning', error);
      setLikeError('Gillningen kunde inte sparas. Försök igen.');
    } finally { likePendingRef.current = false; setLikePending(false); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          <Avatar source={data.avatar} style={styles.avatar} />
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
            <Ionicons name="flag-outline" size={19} color={palette.secondaryText} />
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
            <Ionicons name="trash-outline" size={19} color={palette.secondaryText} />
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

      {data.imageSignedUrl && !imageFailed && (
        <Image
          source={{ uri: data.imageSignedUrl }}
          style={styles.postImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      )}

      {data.content && <Text style={styles.content}>{data.content}</Text>}

      {showComposer && visibleComments.length ? (
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
                  <Ionicons name="flag-outline" size={13} color={palette.secondaryText} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, isLiked && styles.actionButtonActive]}
          onPress={handleToggleLike}
          disabled={!canInteract || likePending}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Ta bort gilla' : 'Gilla inlägg'}
          accessibilityState={{ selected: isLiked, disabled: !canInteract || likePending, busy: likePending }}
        >
          <Ionicons name={isLiked ? "heart" : "heart-outline"} size={21} color={isLiked ? palette.primary : palette.primaryText} />
          <Text style={[styles.actionText, isLiked && styles.actionTextActive]}>{likePending ? 'Sparar…' : data.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => canInteract && !commentPendingRef.current && setShowComposer((prev) => !prev)}
          disabled={!canInteract || commentPending}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Kommentera"
        >
          <Ionicons name="chatbubble-outline" size={20} color={palette.primaryText} />
          <Text style={styles.actionText}>{data.comments}</Text>
        </TouchableOpacity>
      </View>
      {likeError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{likeError}</Text> : null}

      {showComposer && canInteract ? (
        <View style={{ gap: 8 }}>
        {commentError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{commentError}</Text> : null}
        <View style={styles.commentComposer}>
          <TextInput
            value={commentText}
            editable={!commentPending}
            onChangeText={setCommentText}
            placeholder="Skriv en kommentar..."
            placeholderTextColor={palette.mutedText}
            style={styles.commentInput}
          />
          <TouchableOpacity
            style={[
              styles.commentSendButton,
              (!commentText.trim() || commentPending) && styles.commentSendButtonDisabled,
            ]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim() || commentPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Skicka kommentar"
          >
            <Text style={styles.commentSendText}>{commentPending ? 'Skickar…' : 'Skicka'}</Text>
          </TouchableOpacity>
        </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    padding: 18,
    gap: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
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
    fontSize: 15,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: color.text,
  },
  timestamp: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: color.textMuted,
    fontWeight: '400',
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: color.text,
    lineHeight: 23,
    fontWeight: '400',
  },
  postImage: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-start',
    aspectRatio: 1.75,
    borderRadius: 18,
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
    backgroundColor: palette.surfaceMuted,
  },
  groupChipText: {
    fontSize: 11,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
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
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  commentText: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: -4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 44,
    minHeight: 44,
  },
  actionButtonActive: {
    opacity: 1,
  },
  actionText: {
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: color.text,
    fontWeight: '400',
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
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    minHeight: 44,
    color: palette.primaryText,
  },
  commentSendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  commentSendButtonDisabled: {
    opacity: 0.5,
  },
  commentSendText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
});
