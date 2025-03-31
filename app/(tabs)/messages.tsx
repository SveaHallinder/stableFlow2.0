import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { theme } from '@/components/theme';
import { MessageCircle } from 'lucide-react-native';

const MESSAGES = [
  {
    id: '1',
    type: 'group',
    name: 'Group name',
    image: null,
    lastMessage: 'Person 3: Lorem ipsum dolor ...',
    unread: 2,
    timeAgo: '30 min ago'
  },
  {
    id: '2',
    type: 'user',
    name: 'Person 1',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    lastMessage: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago'
  },
  {
    id: '3',
    type: 'user',
    name: 'Person 1',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    lastMessage: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago'
  },
  {
    id: '4',
    type: 'user',
    name: 'Person 1',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    lastMessage: 'Lorem ipsum dolor sit amet...',
    timeAgo: '1h ago'
  }
];

export default function MessagesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://raw.githubusercontent.com/SveaHallinder/StableFlow/main/assets/logo.png' }}
          style={styles.logo}
        />
      </View>
      <ScrollView style={styles.content}>
        {MESSAGES.map((message) => (
          <TouchableOpacity key={message.id} style={styles.messageItem}>
            {message.type === 'group' ? (
              <View style={styles.groupIcon}>
                <MessageCircle size={24} color={theme.colors.primary} />
              </View>
            ) : (
              <Image source={{ uri: message.image }} style={styles.avatar} />
            )}
            <View style={styles.messageContent}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageName}>{message.name}</Text>
                {message.unread && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}> • {message.unread}</Text>
                  </View>
                )}
                <Text style={styles.messageTime}>{message.timeAgo}</Text>
              </View>
              <Text style={styles.messageText} numberOfLines={1}>
                {message.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
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
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  content: {
    flex: 1,
  },
  messageItem: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  messageContent: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageName: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  unreadBadge: {
    marginLeft: theme.spacing.xs,
  },
  unreadText: {
    color: '#059669',
    fontWeight: '500',
  },
  messageTime: {
    ...theme.typography.caption,
    marginLeft: 'auto',
  },
  messageText: {
    ...theme.typography.body,
    color: theme.colors.secondary,
  },
});