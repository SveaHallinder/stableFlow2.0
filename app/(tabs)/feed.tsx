import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PostCard, PostData } from '@/components/Post';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { space } from '@/design/tokens';

const palette = theme.colors;
const gradients = theme.gradients;

const posts: PostData[] = [
  {
    id: '1',
    author: 'Ida Magnusson',
    avatar: require('@/assets/images/dummy-avatar.png'),
    timeAgo: '1h ago',
    content:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
    likes: 8,
    comments: 1,
  },
  {
    id: '2',
    author: 'Ida Magnusson',
    avatar: require('@/assets/images/dummy-avatar.png'),
    timeAgo: '1h ago',
    content: 'Lorem ipsum dolor sit amet, consectetur.',
    image:
      'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
    likes: 8,
    comments: 1,
  },
  {
    id: '3',
    author: 'Ida Magnusson',
    avatar: require('@/assets/images/dummy-avatar.png'),
    timeAgo: '1h ago',
    content:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et.',
    likes: 8,
    comments: 1,
  },
];

export default function FeedScreen() {
  return (
    <LinearGradient colors={gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={styles.pageHeader}
          title="Feed"
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.postList}>
            {posts.map((post) => (
              <PostCard key={post.id} data={post} />
            ))}
          </View>
        </ScrollView>
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
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: 50,
    gap: space.xl,
    paddingTop: 24,
  },
  pageHeader: {
    marginBottom: 0,
  },
  postList: {
    gap: space.xl,
  },
});
