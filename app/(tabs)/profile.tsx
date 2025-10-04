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
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';
import CloudSun from '@/assets/images/cloud-sun.svg';

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const CALENDAR_DAYS = Array.from({ length: 31 }, (_, idx) => idx + 1);
const TODAY = 11;
const RIDING_DAYS = new Set([1, 5, 8, 12, 15, 19, 22, 26, 29]);

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
           <Logo width={32} height={32} />
          <Text style={styles.headerTitle}>Jane Doe</Text>
          <TouchableOpacity style={styles.iconButton}>
            <SearchIcon width={20} height={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
          <Image
            source={require('@/assets/images/dummy-avatar.png')}
            style={styles.avatar}
          />
          <View style={styles.profileDetails}>
            <View style={styles.detailRow}>
              <UserRound size={16} color="#000" strokeWidth={1.5} />
              <Text style={styles.detailText}>Cinder, Kanel</Text>
            </View>
            <View style={styles.detailRow}>
              <MapPin size={16} color="#000" strokeWidth={1.5} />
              <Text style={styles.detailText}>Täby, Stockholm</Text>
            </View>
            <View style={styles.detailRow}>
              <Phone size={16} color="#000" strokeWidth={1.5} />
              <Text style={styles.detailText}>+46 70-000 00 00</Text>
            </View>
          </View>
          <View style={styles.profileActions}>
            <TouchableOpacity style={styles.moreButton}>
              <MoreHorizontal size={18} color="#000" strokeWidth={1.5} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageButton}>
              <MessageCircle size={18} color="#000" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterRow}>
          <FilterChip label="Today" active />
          <FilterChip label="Riding days" />
          <FilterChip label="Away" />
        </View>

        <LinearGradient
          colors={['#5681AC', '#9AC3EC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.weatherCard}
        >
          <View>
            <View style={styles.weatherHeaderRow}>
              <Text style={styles.weatherLocation}>Stockholm</Text>
              <Text style={styles.weatherArrow}>➢</Text>
            </View>
            <Text style={styles.weatherTemperature}>10°</Text>
          </View>
          <View>
            <Text style={styles.weatherCondition}>Cloudy</Text>
            <View style={styles.weatherRangeRow}>
              <Text style={styles.weatherRangeText}>H:12°</Text>
              <Text style={styles.weatherRangeText}>L:6°</Text>
            </View>
          </View>
          <CloudSun width={30} height={30} style={styles.weatherIcon} />
        </LinearGradient>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <View style={styles.calendarHeaderLeft}>
              <Calendar size={18} color="#000" strokeWidth={1.2} />
              <Text style={styles.calendarMonth}>March</Text>
            </View>
            <View style={styles.calendarHeaderRight}>
              <TouchableOpacity style={styles.calendarArrow}>
                <Text style={styles.calendarArrowText}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarArrow}>
                <Text style={styles.calendarArrowText}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((day) => (
              <Text key={day} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {CALENDAR_DAYS.map((day) => (
              <View key={day} style={styles.dayCell}>
                <View
                  style={[
                    styles.dayCircle,
                    RIDING_DAYS.has(day) && styles.ridingDay,
                    day === TODAY && styles.todayDay,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      RIDING_DAYS.has(day) && styles.ridingDayText,
                      day === TODAY && styles.todayDayText,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </View>
            ))}
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
  );
}

function FilterChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipInactive]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : undefined]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 20,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '300',
    color: '#000000',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: 16,
    paddingVertical: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 40,
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
    fontWeight: '300',
    color: '#000000',
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
  },
  messageButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  weatherCard: {
    width: 120,
    height: 120,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    position: 'relative',
  },
  weatherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherLocation: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  weatherArrow: {
    fontSize: 10,
    color: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
  },
  weatherTemperature: {
    fontSize: 26,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  weatherCondition: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  weatherRangeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  weatherRangeText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  weatherIcon: {
    position: 'absolute',
    right: 12,
    bottom: 14,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterChipInactive: {
    borderColor: '#D4D4D8',
    backgroundColor: '#FFFFFF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#1F2933',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderColor: '#E8E8E8',
    ...theme.shadows.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarHeaderRight: {
    flexDirection: 'row',
    gap: 12,
  },
  calendarArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarArrowText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
  calendarMonth: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 14,
    color: '#111827',
  },
  ridingDay: {
    backgroundColor: '#D9FBE1',
  },
  ridingDayText: {
    color: '#16794C',
  },
  todayDay: {
    backgroundColor: '#111827',
  },
  todayDayText: {
    color: '#FFFFFF',
    fontWeight: '600',
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
    color: '#111827',
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3BAA6E',
  },
  sectionCount: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
  },
  sectionAction: {
    fontSize: 12,
    color: '#1F2933',
  },
  recentImage: {
    width: '100%',
    height: 200,
    borderRadius: 20,
  },
});
