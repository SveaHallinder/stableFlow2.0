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
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.xl,
    borderWidth: 0,
    padding: 22,
    gap: 18,
    ...shadows.cardSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
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
    color: palette.primaryText,
  },
  timestamp: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  moreButton: {
    padding: 8,
  },
  content: {
    fontSize: 14,
    color: palette.primaryText,
    lineHeight: 20,
    opacity: 0.9,
  },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: radii.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    color: palette.secondaryText,
    fontWeight: '500',
  },
});
