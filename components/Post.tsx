import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Heart, MessageCircle } from 'lucide-react-native';
import { theme } from './theme';

interface PostProps {
  username: string;
  userImage: string;
  content: string;
  image: string;
  likes: number;
  comments: number;
}

export function Post({ username, userImage, content, image, likes, comments }: PostProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={{ uri: userImage }} style={styles.avatar} />
        <Text style={styles.username}>{username}</Text>
      </View>
      
      <Image source={{ uri: image }} style={styles.postImage} />
      
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Heart size={24} color={theme.colors.primary} />
          <Text style={styles.actionText}>{likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <MessageCircle size={24} color={theme.colors.primary} />
          <Text style={styles.actionText}>{comments}</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.content}>{content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    marginRight: theme.spacing.sm,
  },
  username: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  postImage: {
    width: '100%',
    height: 400,
  },
  actions: {
    flexDirection: 'row',
    padding: theme.spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.lg,
  },
  actionText: {
    ...theme.typography.body,
    marginLeft: theme.spacing.xs,
  },
  content: {
    ...theme.typography.body,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
});