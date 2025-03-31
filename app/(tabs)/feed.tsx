import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { theme } from '@/components/theme';
import { Post } from '@/components/Post';

const POSTS = [
  {
    id: '1',
    username: 'Ida Magnusson',
    userImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
    image: '',
    likes: 8,
    comments: 1,
    timeAgo: '1h ago'
  },
  {
    id: '2',
    username: 'Ida Magnusson',
    userImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    content: 'Lorem ipsum dolor sit amet, consectetur.',
    image: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
    likes: 8,
    comments: 1,
    timeAgo: '1h ago'
  },
  {
    id: '3',
    username: 'Ida Magnusson',
    userImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
    image: '',
    likes: 8,
    comments: 1,
    timeAgo: '1h ago'
  }
];

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://raw.githubusercontent.com/SveaHallinder/StableFlow/main/assets/logo.png' }}
          style={styles.logo}
        />
        <Text style={styles.title}>Feed</Text>
      </View>
      <ScrollView style={styles.content}>
        {POSTS.map((post) => (
          <Post key={post.id} {...post} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingTop: 50,
    gap: theme.spacing.md,
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  title: {
    ...theme.typography.h1,
  },
  content: {
    flex: 1,
  },
});