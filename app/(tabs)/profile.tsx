import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  UserRound,
} from 'lucide-react-native';
import { theme } from '@/components/theme';
import { color, shadow, radius, space } from '@/design/tokens';
import { ScreenHeader } from '@/components/ScreenHeader';
import CloudSun from '@/assets/images/cloud-sun.svg';

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;
const tints = theme.tints;

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// March 2024 starts on Friday (index 5), so we need to add empty cells for the first week
const MARCH_2024_START_DAY = 5; // Friday
const MARCH_DAYS = 31;
const TODAY = 11;
const RIDING_DAYS = new Set([1, 5, 8, 12, 15, 19, 22, 26, 29]);
const AWAY_DAYS = new Set([2, 3, 4, 6]);

// Create calendar grid with empty cells for days before March 1st
const createCalendarDays = () => {
  const days = [];
  
  // Add empty cells for days before March 1st
  for (let i = 0; i < MARCH_2024_START_DAY; i++) {
    days.push(null);
  }
  
  // Add March days
  for (let i = 1; i <= MARCH_DAYS; i++) {
    days.push(i);
  }
  
  return days;
};

const CALENDAR_DAYS = createCalendarDays();

export default function ProfileScreen() {
  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={styles.pageHeader}
          title="Jane Doe"
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

        <View style={styles.profileCard}>
          <Image
            source={require('@/assets/images/dummy-avatar.png')}
            style={styles.avatar}
          />
          <View style={styles.profileDetails}>
            <View style={styles.detailRow}>
              <UserRound size={14} color={palette.icon} strokeWidth={1.5} />
              <Text style={styles.detailText}>Cinder, Kanel</Text>
            </View>
            <View style={styles.detailRow}>
              <MapPin size={14} color={palette.icon} strokeWidth={1.5} />
              <Text style={styles.detailText}>Täby, Stockholm</Text>
            </View>
            <View style={styles.detailRow}>
              <Phone size={14} color={palette.icon} strokeWidth={1.5} />
              <Text style={styles.detailText}>+46 70-000 00 00</Text>
            </View>
          </View>
          <View style={styles.profileActions}>
            <TouchableOpacity style={styles.moreButton}>
              <MoreHorizontal size={18} color={palette.icon} strokeWidth={1.5} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageButton}>
              <MessageCircle size={18} color={palette.icon} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.legendContainer}>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={styles.legendDotToday} />
              <Text style={styles.legendText}>Today</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotRiding} />
              <Text style={styles.legendText}>Riding days</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotAway} />
              <Text style={styles.legendText}>Away</Text>
            </View>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity style={styles.calendarArrow}>
              <Text style={styles.calendarArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calendarMonth}>March</Text>
            <TouchableOpacity style={styles.calendarArrow}>
              <Text style={styles.calendarArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((day) => (
              <View key={day} style={styles.weekDayContainer}>
                <Text style={styles.weekDay}>{day}</Text>
              </View>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {CALENDAR_DAYS.map((day, index) => {
              if (day === null) {
                return <View key={index} style={styles.dayCell} />;
              }
              
              const isToday = day === TODAY;
              const isRidingDay = RIDING_DAYS.has(day);
              const isAwayDay = AWAY_DAYS.has(day);
              
              return (
                <View key={index} style={styles.dayCell}>
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && styles.todayDay,
                      isRidingDay && styles.ridingDay,
                      isAwayDay && styles.awayDay,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        isToday && styles.todayDayText,
                        isRidingDay && styles.ridingDayText,
                        isAwayDay && styles.awayDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.sectionTitle}>Recent post</Text>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionCount}>4</Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.sectionAction}>View more ↓</Text>
            </TouchableOpacity>
          </View>
          <Image
            resizeMode="cover"
            source={{
              uri: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
            }}
            style={styles.recentImage}
          />
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    gap: 18,
    paddingTop: 12,
  },
  pageHeader: {
    marginBottom: 0,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 20,
    paddingVertical: 24,
    paddingHorizontal: 0,
    borderWidth: 0,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
  },
  profileDetails: {
    flex: 1,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '400',
    color: palette.primaryText,
  },
  profileActions: {
    alignItems: 'center',
    gap: 12,
  },
  moreButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
  },
  messageButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendContainer: {
    flexDirection: 'column',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    width: '100%',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  legendDotToday: {
    width: 10,
    height: 10,
    backgroundColor: palette.icon,
    borderRadius: radius.full,
  },
  legendDotRiding: {
    width: 10,
    height: 10,
    backgroundColor: palette.accent,
    borderRadius: radius.full,
  },
  legendDotAway: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: palette.icon,
    borderRadius: radius.full,
  },
  legendText: {
    fontWeight: '500',
    fontSize: 10,
    color: palette.primaryText,
    letterSpacing: 0.1,
  },
  calendarCard: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  calendarArrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarArrowText: {
    fontSize: 18,
    color: color.textMuted,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  calendarMonth: {
    fontWeight: '400',
    fontSize: 18,
    lineHeight: 22,
    color: color.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  weekDayContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  weekDay: {
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 12,
    textTransform: 'uppercase',
    color: palette.mutedText,
    textAlign: 'center',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'flex-start',
    width: '100%',
  },
  dayCell: {
    width: '14.28%',
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontWeight: '500',
    fontSize: 14,
    lineHeight: 17,
    color: palette.primaryText,
  },
  ridingDay: {
    backgroundColor: palette.accent,
  },
  ridingDayText: {
    color: palette.inverseText,
  },
  todayDay: {
    backgroundColor: palette.icon,
  },
  todayDayText: {
    color: palette.inverseText,
  },
  awayDay: {
    borderWidth: 1,
    borderColor: palette.icon,
  },
  awayDayText: {
    color: palette.primaryText,
  },
  recentSection: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: palette.primaryText,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: palette.accent,
  },
  sectionCount: {
    fontSize: 12,
    color: palette.mutedText,
  },
  sectionAction: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  recentImage: {
    width: '100%',
    height: 200,
    borderRadius: radii.lg,
  },
});
