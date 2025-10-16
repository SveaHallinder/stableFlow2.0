import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Moon, Plus, Sun } from 'lucide-react-native';
import SearchIcon from '@/assets/images/Search-icon.svg';
import Logo from '@/assets/images/logo.svg';
import { theme } from '@/components/theme';
import { LinearGradient } from 'expo-linear-gradient';

const palette = theme.colors;
const radii = theme.radii;
const shadows = theme.shadows;
const tints = theme.tints;
const statusColors = theme.status;
const gradients = theme.gradients;

const filters = ['Regular', 'Riding', 'Competition'] as const;
type Filter = (typeof filters)[number];

const legend = [
  { label: 'Feeding missing', color: statusColors.feeding },
  { label: 'Cleaning day', color: statusColors.cleaning },
  { label: 'IB Away', color: statusColors.neutral },
  { label: 'Rider Away', color: statusColors.riderAway },
  { label: 'Farrier Away', color: statusColors.farrierAway },
];

type RegularSlotIcon = 'sun' | 'clock' | 'moon';

type RegularSlot = {
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
};

type RegularDay = {
  id: string;
  day: string;
  date: string;
  selected?: boolean;
  slots: RegularSlot[];
};

const regularSchedule: RegularDay[] = [
  {
    id: 'tue-10',
    day: 'Tue',
    date: '10',
    selected: true,
    slots: [
      { label: 'Morning', icon: 'sun', color: palette.warning, note: 'Feeding missing' },
      { label: 'Lunch', icon: 'clock', color: palette.info, note: 'Check turnout' },
      { label: 'Evening', icon: 'moon', color: statusColors.evening, note: 'Hay top-up' },
    ],
  },
  {
    id: 'wed-11',
    day: 'Wed',
    date: '11',
    slots: [
      { label: 'Morning', icon: 'sun', color: palette.warning, note: 'Paddock swap' },
      { label: 'Lunch', icon: 'clock', color: palette.info },
      { label: 'Evening', icon: 'moon', color: statusColors.evening, note: 'Stretch session' },
    ],
  },
  {
    id: 'thu-12',
    day: 'Thu',
    date: '12',
    slots: [
      { label: 'Morning', icon: 'sun', color: palette.warning },
      { label: 'Lunch', icon: 'clock', color: palette.info, note: 'Farrier away' },
      { label: 'Evening', icon: 'moon', color: statusColors.evening },
    ],
  },
];

type RidingDay = {
  id: string;
  label: string;
  upcomingRides?: string;
  isToday?: boolean;
};

const ridingSchedule: RidingDay[] = [
  { id: 'tue-10', label: 'Tue 10', upcomingRides: 'Dressage - 18:30', isToday: true },
  { id: 'wed-11', label: 'Wed 11', upcomingRides: 'Arena booked 17:00' },
  { id: 'thu-12', label: 'Thu 12', upcomingRides: 'Trail group 19:00' },
  { id: 'fri-13', label: 'Fri 13', upcomingRides: 'No rides planned' },
  { id: 'sat-14', label: 'Sat 14' },
  { id: 'sun-15', label: 'Sun 15' },
];

type CompetitionStatus = 'open' | 'closed';

type CompetitionEvent = {
  id: string;
  start: string;
  end: string;
  title: string;
  status: CompetitionStatus;
};

const competitionEvents: CompetitionEvent[] = [
  {
    id: 'comp-1',
    start: '2025-03-29',
    end: '2025-03-30',
    title: 'CEI Barbaste (FRA). Internationell tävling i distansritt ponny och ridhäst',
    status: 'closed',
  },
  {
    id: 'comp-2',
    start: '2025-03-30',
    end: '2025-03-31',
    title: 'Göingeritten 4*, 3* och 2* nationell tävling',
    status: 'open',
  },
  {
    id: 'comp-3',
    start: '2025-04-05',
    end: '2025-04-06',
    title: 'Kristinehamnsritten 4*, 3* och 2* tävling i distansritt ponny och ridhäst',
    status: 'open',
  },
  {
    id: 'comp-4',
    start: '2025-04-11',
    end: '2025-04-12',
    title: 'CEI Šamorín (SVK) internationell tävling i distansritt',
    status: 'open',
  },
];

const competitionCategories = ['Endurance', 'Dressage'] as const;

export default function CalendarScreen() {
  const [activeFilter, setActiveFilter] = React.useState<Filter>('Regular');
  const [categoryIndex, setCategoryIndex] = React.useState(0);

  const selectedCategory = competitionCategories[categoryIndex];

  const handleCategoryToggle = () => {
    setCategoryIndex((prev) => (prev + 1) % competitionCategories.length);
  };

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
          <Text style={styles.headerTitle}>Calendar</Text>
          <TouchableOpacity style={styles.iconButton}>
            <SearchIcon width={20} height={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {filters.map((label) => {
            const active = label === activeFilter;
            return (
              <TouchableOpacity
                key={label}
                onPress={() => setActiveFilter(label)}
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

        {activeFilter === 'Regular' && (
          <View style={styles.legendCard}>
            {legend.map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthButton}>
            <ChevronLeft size={16} color={palette.icon} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>March</Text>
          <TouchableOpacity style={styles.monthButton}>
            <ChevronRight size={16} color={palette.icon} />
          </TouchableOpacity>
        </View>

        {activeFilter === 'Regular' && (
          <View style={styles.scheduleList}>
            {regularSchedule.map((day) => (
              <RegularDayCard key={day.id} day={day.day} date={day.date} selected={day.selected} slots={day.slots} />
            ))}
          </View>
        )}

        {activeFilter === 'Riding' && (
          <View style={styles.ridingList}>
            {ridingSchedule.map((day) => (
              <RidingDayRow key={day.id} label={day.label} upcoming={day.upcomingRides} isToday={day.isToday} />
            ))}
          </View>
        )}

        {activeFilter === 'Competition' && (
          <View style={styles.competitionSection}>
            <TouchableOpacity style={styles.competitionCategory} onPress={handleCategoryToggle}>
              <Text style={styles.competitionCategoryText}>{selectedCategory}</Text>
              <ChevronDown size={14} color={palette.icon} />
            </TouchableOpacity>
            <View style={styles.competitionList}>
              {competitionEvents.map((event) => (
                <CompetitionCard key={event.id} event={event} />
              ))}
            </View>
          </View>
        )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function RegularDayCard({
  day,
  date,
  selected,
  slots,
}: {
  day: string;
  date: string;
  selected?: boolean;
  slots: RegularSlot[];
}) {
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
        {slots.map((slot) => (
          <ScheduleIcon key={`${day}-${date}-${slot.label}`} label={slot.label} icon={slot.icon} color={slot.color} note={slot.note} />
        ))}
      </View>
    </View>
  );
}

function ScheduleIcon({
  label,
  icon,
  color,
  note,
}: {
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
}) {
  const renderIcon = () => {
    if (icon === 'sun') {
      return <Sun size={16} color={color} strokeWidth={2} />;
    }
    if (icon === 'moon') {
      return <Moon size={16} color={color} strokeWidth={2} />;
    }
    return <Clock3 size={16} color={color} strokeWidth={2} />;
  };

  return (
    <View style={styles.scheduleIcon}>
      <View style={[styles.scheduleIconBadge, { backgroundColor: `${color}1A` }]}>
        {renderIcon()}
      </View>
      <Text style={styles.scheduleLabel}>{label}</Text>
      {note && <Text style={styles.scheduleNote}>{note}</Text>}
    </View>
  );
}

function RidingDayRow({
  label,
  upcoming,
  isToday,
}: {
  label: string;
  upcoming?: string;
  isToday?: boolean;
}) {
  return (
    <View style={[styles.ridingRow, isToday ? styles.ridingRowActive : undefined]}>
      <View>
        <Text style={[styles.ridingLabel, isToday ? styles.ridingLabelActive : undefined]}>{label}</Text>
        {upcoming && <Text style={styles.ridingSubtitle}>{upcoming}</Text>}
      </View>
      <TouchableOpacity style={styles.ridingRegisterButton}>
        <Plus size={16} color={palette.icon} strokeWidth={2} />
        <Text style={styles.ridingRegisterText}>Register ride</Text>
      </TouchableOpacity>
    </View>
  );
}

function CompetitionCard({ event }: { event: CompetitionEvent }) {
  const statusLabel = event.status === 'open' ? 'ÖPPEN' : 'STÄNGD';
  const statusColor = event.status === 'open' ? palette.success : palette.error;

  return (
    <View style={styles.competitionCard}>
      <Text style={styles.competitionDate}>
        {event.start}
        {'\n'}
        {event.end}
      </Text>
      <View style={styles.competitionDetails}>
        <Text style={styles.competitionTitle}>{event.title}</Text>
        <View style={[styles.competitionBadge, { backgroundColor: `${statusColor}1A` }]}>
          <Text style={[styles.competitionBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 24,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.primaryText,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceGlass,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    padding: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterChip: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: palette.icon,
  },
  filterChipInactive: {
    backgroundColor: 'transparent',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  filterChipTextActive: {
    color: palette.inverseText,
  },
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadows.cardSoft,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  legendLabel: {
    fontSize: 12,
    color: palette.secondaryText,
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
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceTint,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.primaryText,
  },
  scheduleList: {
    gap: 18,
  },
  dayCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: 0,
    padding: 20,
    height: 220,
    gap: 30,
    overflow: 'hidden',
    ...shadows.card,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dayBadgeInactive: {
    backgroundColor: palette.surfaceMuted,
  },
  dayBadgeActive: {
    backgroundColor: palette.primary,
  },
  dayBadgeText: {
    fontSize: 15,
    color: palette.primaryText,
    fontWeight: '600',
  },
  dayBadgeTextActive: {
    color: palette.inverseText,
  },
  dayMore: {
    fontSize: 22,
    color: palette.mutedText,
  },
  dayIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  scheduleIcon: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
    gap: 8,
  },
  scheduleIconBadge: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  scheduleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
    textAlign: 'center',
  },
  scheduleNote: {
    fontSize: 12,
    color: palette.secondaryText,
    marginTop: 2,
    textAlign: 'center',
  },
  registerButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: palette.border,
  },
  registerText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  ridingList: {
    gap: 14,
  },
  ridingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 0,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
    flexWrap: 'wrap',
    ...shadows.cardSoft,
  },
  ridingRowActive: {
    borderWidth: 1,
    borderColor: palette.borderMuted,
  },
  ridingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  ridingLabelActive: {
    color: palette.primaryText,
  },
  ridingSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: palette.secondaryText,
  },
  ridingRegisterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceTint,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: palette.border,
    alignSelf: 'flex-end',
  },
  ridingRegisterText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  competitionSection: {
    gap: 16,
  },
  competitionCategory: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadows.cardSoft,
  },
  competitionCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  competitionList: {
    gap: 14,
  },
  competitionCard: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.border,
    flexWrap: 'wrap',
    ...shadows.card,
  },
  competitionDate: {
    width: 88,
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
    lineHeight: 18,
  },
  competitionDetails: {
    flex: 1,
    gap: 12,
    minWidth: 180,
  },
  competitionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
    lineHeight: 20,
  },
  competitionBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  competitionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
