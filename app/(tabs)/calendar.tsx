import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Clock3, Moon, Plus, Sun } from 'lucide-react-native';
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';

const filters = ['Regular', 'Riding', 'Competition'] as const;
const legend = [
  { label: 'Feeding missing', color: '#FF3B30' },
  { label: 'Cleaning day', color: '#3B82F6' },
  { label: 'IB Away', color: '#FF3B30' },
  { label: 'Rider Away', color: '#F59E0B' },
  { label: 'Farrier Away', color: '#059669' },
];

const schedule = [
  { day: 'Tue', date: '10', selected: true },
  { day: 'Wed', date: '11' },
  { day: 'Thu', date: '12' },
  { day: 'Fri', date: '13' },
  { day: 'Sat', date: '14' },
  { day: 'Sun', date: '15' },
  { day: 'Mon', date: '16' },
  { day: 'Tue', date: '17' },
];

export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Logo width={32} height={32} />
          <Text style={styles.headerTitle}>Calendar</Text>
          <TouchableOpacity style={styles.iconButton}>
            <SearchIcon width={20} height={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {filters.map((label, index) => {
            const active = index === 0;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipInactive]}
              >
                <Text
                  style={[styles.filterChipText, active ? styles.filterChipTextActive : undefined]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.legendRow}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthButton}>
            <ChevronLeft size={16} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>March</Text>
          <TouchableOpacity style={styles.monthButton}>
            <ChevronRight size={16} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.scheduleList}>
          {schedule.map(({ day, date, selected }) => (
            <DayCard key={`${day}-${date}`} day={day} date={date} selected={selected} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DayCard({ day, date, selected }: { day: string; date: string; selected?: boolean }) {
  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <View style={[styles.dayBadge, selected ? styles.dayBadgeActive : styles.dayBadgeInactive]}>
          <Text style={[styles.dayBadgeText, selected ? styles.dayBadgeTextActive : undefined]}>
            {day} {date}
          </Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.dayMore}>···</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.dayIcons}>
        <ScheduleIcon label="Morning" icon={<Sun size={16} color="#F59E0B" />} />
        <ScheduleIcon label="Lunch" icon={<Clock3 size={16} color="#3B82F6" />} />
        <ScheduleIcon label="Evening" icon={<Moon size={16} color="#8B5CF6" />} />
      </View>
      <TouchableOpacity style={styles.registerButton}>
        <Plus size={16} color="#111827" strokeWidth={2} />
        <Text style={styles.registerText}>Register ride</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScheduleIcon({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <View style={styles.scheduleIcon}>
      {icon}
      <Text style={styles.scheduleLabel}>{label}</Text>
    </View>
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 24,
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
    color: '#111827',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#111827',
  },
  filterChipInactive: {
    backgroundColor: '#F3F4F6',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: '#4B5563',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  monthButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '300',
  },
  scheduleList: {
    gap: 16,
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderColor: '#F0F0F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    gap: 16,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayBadgeInactive: {
    backgroundColor: '#F3F4F6',
  },
  dayBadgeActive: {
    backgroundColor: '#111827',
  },
  dayBadgeText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  dayBadgeTextActive: {
    color: '#FFFFFF',
  },
  dayMore: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  dayIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  scheduleIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleLabel: {
    fontSize: 12,
    color: '#4B5563',
  },
  registerButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  registerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
});
