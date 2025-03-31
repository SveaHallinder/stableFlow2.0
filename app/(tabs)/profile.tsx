import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { theme } from '@/components/theme';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react-native';

const CALENDAR_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const RIDING_DAYS = [1, 5, 8, 12, 15, 19, 22, 26, 29];
const TODAY = 11;

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://raw.githubusercontent.com/SveaHallinder/StableFlow/main/assets/logo.png' }}
          style={styles.logo}
        />
        <Text style={styles.title}>Jane Doe</Text>
      </View>

      <View style={styles.profile}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop' }}
          style={styles.profileImage}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.infoText}>🐎 Cinder, Kanel</Text>
          <Text style={styles.infoText}>♀ Täby, Stockholm</Text>
          <Text style={styles.infoText}>📞 +46 70-000 00 00</Text>
        </View>
        <TouchableOpacity style={styles.messageButton}>
          <Text>💬</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonActive]}>
          <Text style={styles.filterButtonTextActive}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Riding days</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Away</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendar}>
        <View style={styles.calendarHeader}>
          <ChevronLeft size={24} color={theme.colors.primary} />
          <Text style={styles.calendarTitle}>March</Text>
          <ChevronRight size={24} color={theme.colors.primary} />
        </View>
        
        <View style={styles.weekDays}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
            <Text key={day} style={styles.weekDay}>{day}</Text>
          ))}
        </View>

        <View style={styles.days}>
          {CALENDAR_DAYS.map((day) => (
            <View key={day} style={styles.dayContainer}>
              <View
                style={[
                  styles.day,
                  RIDING_DAYS.includes(day) && styles.ridingDay,
                  day === TODAY && styles.today,
                ]}>
                <Text
                  style={[
                    styles.dayText,
                    RIDING_DAYS.includes(day) && styles.ridingDayText,
                    day === TODAY && styles.todayText,
                  ]}>
                  {day}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.recentPosts}>
        <Text style={styles.sectionTitle}>Recent post</Text>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop' }}
          style={styles.postImage}
        />
      </View>
    </ScrollView>
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
  profile: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  infoText: {
    ...theme.typography.body,
    marginBottom: 4,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  filterButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: '#F3F4F6',
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  filterButtonText: {
    color: theme.colors.secondary,
  },
  filterButtonTextActive: {
    color: theme.colors.background,
  },
  calendar: {
    padding: theme.spacing.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  calendarTitle: {
    ...theme.typography.h2,
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  weekDay: {
    width: 40,
    textAlign: 'center',
    color: theme.colors.secondary,
    fontSize: 12,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayContainer: {
    width: 40,
    height: 40,
    marginBottom: theme.spacing.sm,
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayText: {
    fontSize: 16,
  },
  ridingDay: {
    backgroundColor: '#D1FAE5',
  },
  ridingDayText: {
    color: theme.colors.primary,
  },
  today: {
    backgroundColor: theme.colors.primary,
  },
  todayText: {
    color: theme.colors.background,
  },
  recentPosts: {
    padding: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.h2,
    marginBottom: theme.spacing.md,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.borderRadius.lg,
  },
});