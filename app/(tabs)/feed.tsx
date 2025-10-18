import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';
import { PostCard, PostData } from '@/components/Post';
import { theme } from '@/components/theme';

const palette = theme.colors;
const gradients = theme.gradients;
const radii = theme.radii;

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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Logo width={32} height={32} />
            <Text style={styles.headerTitle}>Feed</Text>
            <TouchableOpacity style={styles.iconButton}>
              <SearchIcon width={20} height={20} />
            </TouchableOpacity>
          </View>

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
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 32,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: palette.primaryText,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.full,
    backgroundColor: palette.surfaceGlass,
  },
  postList: {
    gap: 32,
  },
});
