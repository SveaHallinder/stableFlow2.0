import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '@/components/theme';
import { ChevronLeft, ChevronRight, Sun, Clock, Moon } from 'lucide-react-native';

export default function CalendarScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>March</Text>
      </View>

      {/* Calendar Filter */}
      <View style={styles.filter}>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonActive]}>
          <Text style={styles.filterButtonTextActive}>Regular</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Riding</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Competition</Text>
        </TouchableOpacity>
      </View>

      {/* Status Indicators */}
      <View style={styles.statusContainer}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: '#DC2626' }]} />
          <Text>IB Away</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: '#FBBF24' }]} />
          <Text>Rider Away</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: '#059669' }]} />
          <Text>Farrier Away</Text>
        </View>
      </View>

      {/* Day Schedule */}
      <View style={styles.daySchedule}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>Tue 10</Text>
          <TouchableOpacity>
            <Text>...</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timeSlot}>
          <Sun size={20} color={theme.colors.primary} />
          <Text style={styles.timeText}>Morning</Text>
        </View>
        <View style={styles.timeSlot}>
          <Clock size={20} color={theme.colors.primary} />
          <Text style={styles.timeText}>Lunch</Text>
        </View>
        <View style={styles.timeSlot}>
          <Moon size={20} color={theme.colors.primary} />
          <Text style={styles.timeText}>Evening</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
  },
  filter: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: theme.borderRadius.full,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  filterButton: {
    flex: 1,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: theme.colors.background,
  },
  filterButtonText: {
    color: theme.colors.secondary,
  },
  filterButtonTextActive: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.xl,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  daySchedule: {
    backgroundColor: '#F3F4F6',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  dayTitle: {
    ...theme.typography.h2,
  },
  timeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  timeText: {
    ...theme.typography.body,
    color: theme.colors.secondary,
  },
});