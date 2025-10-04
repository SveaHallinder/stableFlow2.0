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
          <EllipsisVertical size={18} color="#6B7280" />
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
          <Heart size={16} color="#6B7280" />
          <Text style={styles.statText}>{data.likes}</Text>
        </View>
        <View style={styles.stat}>
          <MessageCircle size={16} color="#6B7280" />
          <Text style={styles.statText}>{data.comments}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    color: '#111827',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  moreButton: {
    padding: 8,
  },
  content: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 20,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
});
