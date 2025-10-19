import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { EllipsisVertical, Heart, MessageCircle } from 'lucide-react-native';
import { theme } from '@/components/theme';
import { color, space, radius } from '@/design/tokens';

export type PostData = {
  id: string;
  author: string;
  avatar: ImageSourcePropType;
  timeAgo: string;
  content?: string;
  image?: string;
  likes: number;
  comments: number;
};

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;

export function PostCard({ data }: { data: PostData }) {
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
        <TouchableOpacity style={styles.moreButton}>
          <EllipsisVertical size={18} color={palette.secondaryText} />
        </TouchableOpacity>
      </View>

      {data.content && <Text style={styles.content}>{data.content}</Text>}

      {data.image && (
        <Image
          source={{ uri: data.image }}
          style={styles.postImage}
          resizeMode="cover"
        />
      )}

      <View style={styles.footer}>
        <View style={styles.stat}>
          <Heart size={16} color={palette.secondaryText} />
          <Text style={styles.statText}>{data.likes}</Text>
        </View>
        <View style={styles.stat}>
          <MessageCircle size={16} color={palette.secondaryText} />
          <Text style={styles.statText}>{data.comments}</Text>
        </View>
      </View>
    </View>
  );
}

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
    height: 260,
    borderRadius: radius.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.sm,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  statText: {
    fontSize: 13,
    color: color.textMuted,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
