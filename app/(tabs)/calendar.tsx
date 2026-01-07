import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { Card, Pill } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StableSwitcher } from '@/components/StableSwitcher';
import { color, radius, space } from '@/design/tokens';
import { useAppData, resolveStableSettings } from '@/context/AppDataContext';
import type {
  ArenaBooking,
  ArenaStatus,
  Assignment,
  AssignmentStatus,
  AssignmentSlot,
  CompetitionEvent,
  CreateAssignmentInput,
  DayEvent,
  DayEventTone,
  RideLogEntry,
  RideType,
  UpdateAssignmentInput,
} from '@/context/AppDataContext';
import {
  groupAssignmentsByDay,
  formatShortWeekday,
  formatDayNumber,
  generateDateOptions,
  type GroupedAssignmentDay,
  toISODate,
} from '@/lib/schedule';
import { NewAssignmentModal } from '@/components/NewAssignmentModal';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;
const statusColors = theme.status;
const gradients = theme.gradients;

const filters = ['Pass', 'Riddagar', 'Ridhus', 'Tävling'] as const;
type Filter = (typeof filters)[number];

type PassView = 'all' | 'mine' | 'open';

type EmptyStateAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

type EmptyStateConfig = {
  title: string;
  body: string;
  actions?: EmptyStateAction[];
};

const WEEKDAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

const filterLabels: Record<Filter, string> = {
  Pass: 'Stallschema',
  Riddagar: 'Ridschema',
  Ridhus: 'Ridhus',
  Tävling: 'Tävling',
};

const passViewOptions: { id: PassView; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'mine', label: 'Mina' },
  { id: 'open', label: 'Lediga' },
];

type RegularSlotIcon = 'sun' | 'clock' | 'moon';

type RegularSlot = {
  id: string;
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
  assignedTo?: string;
  isMine: boolean;
  isDefault: boolean;
  assignedVia?: Assignment['assignedVia'];
  time?: string;
  status: AssignmentStatus;
  slotType: AssignmentSlot;
};

type RegularDayView = {
  id: string;
  day: string;
  date: string;
  selected?: boolean;
  slots: RegularSlot[];
  openSlots: number;
  mineSlots: number;
  openAssignments: Assignment[];
  events: { id: string; label: string; color: string }[];
};

const legendBase = [
  { id: 'feeding', label: 'Fodring saknas', color: statusColors.feeding },
  { id: 'cleaning', label: 'Städning/Mockning', color: statusColors.cleaning },
  { id: 'riderAway', label: 'Ryttare bortrest', color: statusColors.riderAway },
  { id: 'farrierAway', label: 'Hovslagare bortrest', color: statusColors.farrierAway },
  { id: 'vetAway', label: 'Veterinär bortrest', color: statusColors.vetAway ?? statusColors.farrierAway },
  { id: 'evening', label: 'Kvällspass', color: statusColors.evening },
] as const;

const slotColorMap: Record<AssignmentSlot, string> = {
  Morning: palette.warning,
  Lunch: palette.info,
  Evening: statusColors.evening,
};

const slotIconMap: Record<AssignmentSlot, RegularSlotIcon> = {
  Morning: 'sun',
  Lunch: 'clock',
  Evening: 'moon',
};

const dayEventColorMap: Record<DayEventTone, string> = {
  feeding: statusColors.feeding,
  cleaning: statusColors.cleaning,
  riderAway: statusColors.riderAway,
  farrierAway: statusColors.farrierAway,
  vetAway: statusColors.vetAway ?? statusColors.farrierAway,
  evening: statusColors.evening,
  info: palette.secondaryText,
};

const arenaEventColors = {
  booking: palette.info,
  status: palette.accent,
};

const dayEventToneLabels: Record<DayEventTone, string> = {
  feeding: 'Fodring saknas',
  cleaning: 'Städning/Mockning',
  riderAway: 'Ryttare bortrest',
  farrierAway: 'Hovslagare bortrest',
  vetAway: 'Veterinär bortrest',
  evening: 'Kvällspass',
  info: 'Info',
};

const dayEventToneOptions: { id: DayEventTone; label: string }[] = [
  { id: 'feeding', label: dayEventToneLabels.feeding },
  { id: 'cleaning', label: dayEventToneLabels.cleaning },
  { id: 'riderAway', label: dayEventToneLabels.riderAway },
  { id: 'farrierAway', label: dayEventToneLabels.farrierAway },
  { id: 'vetAway', label: dayEventToneLabels.vetAway },
  { id: 'evening', label: dayEventToneLabels.evening },
  { id: 'info', label: dayEventToneLabels.info },
];

const competitionCategories = ['Endurance', 'Dressage'] as const;
const arenaStatusPresets = ['Harvat', 'Vattnat', 'Sladdat', 'Hinder framme', 'Stängt'] as const;

function resolvePassView(raw?: string | string[]): PassView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'mine') {
    return 'mine';
  }
  if (value === 'open') {
    return 'open';
  }
  return 'all';
}

function resolveFilterFromSection(raw?: string | string[]): Filter | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'riding') {
    return 'Riddagar';
  }
  if (value === 'arena') {
    return 'Ridhus';
  }
  if (value === 'competition') {
    return 'Tävling';
  }
  if (value === 'pass') {
    return 'Pass';
  }
  return undefined;
}

function weekdayIndexFromDate(date: Date) {
  return (date.getDay() + 6) % 7;
}

function isDefaultForUser(
  defaultPasses: { weekday: number; slot: AssignmentSlot }[],
  weekday: number,
  slot: AssignmentSlot,
) {
  return defaultPasses.some((entry) => entry.weekday === weekday && entry.slot === slot);
}

export default function CalendarScreen() {
  const { state, actions, derived } = useAppData();
  const router = useRouter();
  const {
    assignments,
    users,
    ridingSchedule,
    competitionEvents,
    dayEvents,
    arenaBookings,
    arenaStatuses,
    rideLogs,
    stables,
    horses,
    currentUserId,
    currentStableId,
  } = state;
  const { view, date, section } = useLocalSearchParams<{
    view?: string | string[];
    date?: string | string[];
    section?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && width >= 1024;
  const { permissions } = derived;
  const canManageOnboarding = permissions.canManageOnboarding;
  const canManageAssignments = permissions.canManageAssignments;
  const canClaimAssignments = permissions.canClaimAssignments;
  const canCompleteAssignments = permissions.canCompleteAssignments;
  const canManageRideLogs = permissions.canManageRideLogs;
  const canManageArenaBookings = permissions.canManageArenaBookings;
  const canManageArenaStatus = permissions.canManageArenaStatus;
  const canManageDayEvents = permissions.canManageDayEvents;
  const [assignmentModal, setAssignmentModal] = React.useState<{
    visible: boolean;
    mode: 'create' | 'edit';
    assignmentId?: string;
    date?: string;
    slot?: AssignmentSlot;
    label?: string;
    time?: string;
    note?: string;
    assignToMe?: boolean;
  }>({ visible: false, mode: 'create' });
  const toast = useToast();
  const focusDate = React.useMemo(() => {
    const raw = Array.isArray(date) ? date[0] : date;
    if (!raw) {
      return undefined;
    }
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return toISODate(parsed);
  }, [date]);

  const resolvedFilter = React.useMemo(() => resolveFilterFromSection(section), [section]);
  const [activeFilter, setActiveFilter] = React.useState<Filter>(resolvedFilter ?? 'Pass');
  const [passView, setPassView] = React.useState<PassView>(() => resolvePassView(view));
  const [categoryIndex, setCategoryIndex] = React.useState(0);
  const [monthCursor, setMonthCursor] = React.useState(() => startOfMonth(new Date()));
  const [arenaModalVisible, setArenaModalVisible] = React.useState(false);
  const [arenaForm, setArenaForm] = React.useState(() => ({
    date: toISODate(new Date()),
    startTime: '',
    endTime: '',
    purpose: '',
    note: '',
  }));
  const [dayEventModalVisible, setDayEventModalVisible] = React.useState(false);
  const [dayEventForm, setDayEventForm] = React.useState(() => ({
    date: toISODate(new Date()),
    label: '',
    tone: 'info' as DayEventTone,
  }));
  const [arenaStatusModalVisible, setArenaStatusModalVisible] = React.useState(false);
  const [arenaStatusForm, setArenaStatusForm] = React.useState(() => ({
    date: toISODate(new Date()),
    label: 'Harvat',
  }));
  const [rideLogModalVisible, setRideLogModalVisible] = React.useState(false);
  const [rideLogForm, setRideLogForm] = React.useState(() => ({
    date: toISODate(new Date()),
    horseId: '',
    rideTypeId: '',
    length: '',
    note: '',
  }));

  React.useEffect(() => {
    if (resolvedFilter && resolvedFilter !== activeFilter) {
      setActiveFilter(resolvedFilter);
    }
  }, [activeFilter, resolvedFilter]);

  const activeAssignments = React.useMemo(
    () => assignments.filter((assignment) => assignment.stableId === currentStableId),
    [assignments, currentStableId],
  );
  const currentStable = React.useMemo(
    () => stables.find((stable) => stable.id === currentStableId),
    [stables, currentStableId],
  );
  const stableSettings = React.useMemo(() => resolveStableSettings(currentStable), [currentStable]);
  const enabledEventTones = React.useMemo(() => {
    const entries = Object.entries(stableSettings.eventVisibility) as [DayEventTone, boolean][];
    const enabled = entries.filter(([, value]) => value).map(([tone]) => tone);
    return new Set<DayEventTone>(enabled);
  }, [stableSettings]);
  const legendItems = React.useMemo(
    () => legendBase.filter((item) => enabledEventTones.has(item.id)),
    [enabledEventTones],
  );
  const visibleDayEventToneOptions = React.useMemo(
    () => dayEventToneOptions.filter((option) => option.id === 'info' || enabledEventTones.has(option.id)),
    [enabledEventTones],
  );
  const activeRideTypes = React.useMemo(
    () => currentStable?.rideTypes ?? [],
    [currentStable],
  );
  const activeHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === currentStableId),
    [horses, currentStableId],
  );
  const canRegisterRide =
    canManageRideLogs && activeRideTypes.length > 0 && activeHorses.length > 0;
  const activeRidingSchedule = React.useMemo(
    () =>
      ridingSchedule.filter(
        (day) => !day.stableId || day.stableId === currentStableId,
      ),
    [ridingSchedule, currentStableId],
  );
  const activeDayEvents = React.useMemo(
    () =>
      dayEvents.filter(
        (event) =>
          event.stableId === currentStableId &&
          (event.tone === 'info' || enabledEventTones.has(event.tone)),
      ),
    [dayEvents, currentStableId, enabledEventTones],
  );
  const activeArenaBookings = React.useMemo(
    () => arenaBookings.filter((booking) => booking.stableId === currentStableId),
    [arenaBookings, currentStableId],
  );
  const activeArenaStatuses = React.useMemo(
    () => arenaStatuses.filter((status) => status.stableId === currentStableId),
    [arenaStatuses, currentStableId],
  );
  const activeRideLogs = React.useMemo(
    () =>
      rideLogs
        .filter((log) => log.stableId === currentStableId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [rideLogs, currentStableId],
  );
  const rideTypeById = React.useMemo(
    () =>
      activeRideTypes.reduce<Record<string, RideType>>((acc, type) => {
        acc[type.id] = type;
        return acc;
      }, {}),
    [activeRideTypes],
  );
  const horseById = React.useMemo(
    () =>
      horses.reduce<Record<string, string>>((acc, horse) => {
        acc[horse.id] = horse.name;
        return acc;
      }, {}),
    [horses],
  );
  const desktopPassAssignments = React.useMemo(() => {
    if (passView === 'mine') {
      return activeAssignments.filter((assignment) => assignment.assigneeId === currentUserId);
    }
    if (passView === 'open') {
      return activeAssignments.filter((assignment) => assignment.status === 'open');
    }
    return activeAssignments;
  }, [activeAssignments, passView, currentUserId]);
  const desktopAssignmentsByDate = React.useMemo(() => {
    const map = new Map<string, Assignment[]>();
    desktopPassAssignments.forEach((assignment) => {
      const existing = map.get(assignment.date);
      if (existing) {
        existing.push(assignment);
      } else {
        map.set(assignment.date, [assignment]);
      }
    });
    map.forEach((value, key) => {
      map.set(key, sortAssignments(value));
    });
    return map;
  }, [desktopPassAssignments]);
  const monthWeeks = React.useMemo(() => buildMonthWeeks(monthCursor), [monthCursor]);
  const monthLabel = React.useMemo(() => formatMonthLabel(monthCursor), [monthCursor]);

  const groupedDays = React.useMemo(() => {
    const base = groupAssignmentsByDay(activeAssignments);
    if (!focusDate) {
      return base;
    }
    if (base.some((day) => day.isoDate === focusDate)) {
      return base;
    }
    const parsed = new Date(`${focusDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return base;
    }
    return [...base, { isoDate: focusDate, date: parsed, assignments: [] }].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [activeAssignments, focusDate]);

  React.useEffect(() => {
    if (focusDate) {
      setPassView('all');
      return;
    }
    setPassView(resolvePassView(view));
  }, [focusDate, view]);

  React.useEffect(() => {
    if (!focusDate) {
      return;
    }
    setActiveFilter('Pass');
  }, [focusDate]);

  React.useEffect(() => {
    if (!focusDate) {
      return;
    }
    const parsed = new Date(`${focusDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    setMonthCursor(startOfMonth(parsed));
  }, [focusDate]);

  React.useEffect(() => {
    if (visibleDayEventToneOptions.some((option) => option.id === dayEventForm.tone)) {
      return;
    }
    setDayEventForm((prev) => ({ ...prev, tone: 'info' }));
  }, [dayEventForm.tone, visibleDayEventToneOptions]);

  const dayEventsByDate = React.useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    activeDayEvents.forEach((event) => {
      if (!map.has(event.date)) {
        map.set(event.date, []);
      }
      map.get(event.date)!.push(event);
    });
    return map;
  }, [activeDayEvents]);

  const arenaBookingsByDate = React.useMemo(() => {
    const map = new Map<string, ArenaBooking[]>();
    activeArenaBookings.forEach((booking) => {
      if (!map.has(booking.date)) {
        map.set(booking.date, []);
      }
      map.get(booking.date)!.push(booking);
    });
    map.forEach((bookings, date) => {
      map.set(date, [...bookings].sort((a, b) => compareBookingTime(a, b)));
    });
    return Array.from(map.entries())
      .map(([date, bookings]) => ({ date, bookings }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeArenaBookings]);

  const arenaBookingsByDateMap = React.useMemo(
    () => new Map(arenaBookingsByDate.map((group) => [group.date, group.bookings])),
    [arenaBookingsByDate],
  );

  const arenaStatusByDate = React.useMemo(() => {
    const map = new Map<string, ArenaStatus[]>();
    activeArenaStatuses.forEach((status) => {
      if (!map.has(status.date)) {
        map.set(status.date, []);
      }
      map.get(status.date)!.push(status);
    });
    map.forEach((statuses, date) => {
      map.set(
        date,
        [...statuses].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    });
    return Array.from(map.entries())
      .map(([date, statuses]) => ({ date, statuses }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeArenaStatuses]);

  const arenaStatusByDateMap = React.useMemo(
    () => new Map(arenaStatusByDate.map((group) => [group.date, group.statuses])),
    [arenaStatusByDate],
  );

  const latestArenaStatus = React.useMemo(() => {
    if (activeArenaStatuses.length === 0) {
      return undefined;
    }
    return [...activeArenaStatuses].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }, [activeArenaStatuses]);

  const rideLogsByDate = React.useMemo(() => {
    const map = new Map<string, RideLogEntry[]>();
    activeRideLogs.forEach((log) => {
      if (!map.has(log.date)) {
        map.set(log.date, []);
      }
      map.get(log.date)!.push(log);
    });
    map.forEach((logs, date) => {
      map.set(date, [...logs].sort((a, b) => a.horseId.localeCompare(b.horseId)));
    });
    return Array.from(map.entries())
      .map(([date, logs]) => ({ date, logs }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeRideLogs]);

  const sortedDayEvents = React.useMemo(
    () =>
      [...activeDayEvents].sort((a, b) => {
        if (a.date === b.date) {
          return a.label.localeCompare(b.label);
        }
        return a.date.localeCompare(b.date);
      }),
    [activeDayEvents],
  );

  const weekGroups = React.useMemo(() => {
    const grouped = new Map<string, { start: Date; end: Date; days: GroupedAssignmentDay[] }>();

    groupedDays.forEach((day) => {
      const start = startOfWeek(day.date);
      const key = toISODate(start);
      const existing = grouped.get(key);
      if (existing) {
        existing.days.push(day);
        // ensure end is last day of week for consistency
        existing.end = endOfWeek(start);
      } else {
        grouped.set(key, {
          start,
          end: endOfWeek(start),
          days: [day],
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [groupedDays]);

  const [weekIndex, setWeekIndex] = React.useState(0);

  React.useEffect(() => {
    if (weekGroups.length === 0) {
      setWeekIndex(0);
      return;
    }
    setWeekIndex((prev) => Math.min(prev, weekGroups.length - 1));
  }, [weekGroups.length]);

  React.useEffect(() => {
    if (!focusDate || weekGroups.length === 0) {
      return;
    }
    const parsed = new Date(`${focusDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    const targetTime = parsed.getTime();
    const index = weekGroups.findIndex(
      (group) => targetTime >= group.start.getTime() && targetTime <= group.end.getTime(),
    );
    if (index >= 0) {
      setWeekIndex(index);
    }
  }, [focusDate, weekGroups]);

  const activeWeek = weekGroups[weekIndex] ?? weekGroups[0];
  const activeDays = React.useMemo(() => activeWeek?.days ?? [], [activeWeek]);

  const todayIso = toISODate(new Date());
  const upcomingDayGroups = React.useMemo(
    () => groupedDays.filter((day) => day.isoDate >= todayIso).slice(0, 7),
    [groupedDays, todayIso],
  );

  const visiblePassDays = React.useMemo(
    () => (passView === 'all' ? activeDays : upcomingDayGroups),
    [activeDays, passView, upcomingDayGroups],
  );

  const regularDays = React.useMemo<RegularDayView[]>(() => {
    const defaultPasses = users[currentUserId]?.defaultPasses ?? [];
    const selectedIso =
      focusDate && visiblePassDays.some((day) => day.isoDate === focusDate)
        ? focusDate
        : visiblePassDays.find((day) => day.isoDate === todayIso)?.isoDate ??
          visiblePassDays[0]?.isoDate;

    return visiblePassDays.map((day) => {
      const sortedAssignments = sortAssignments(day.assignments);
      const weekdayIndex = weekdayIndexFromDate(day.date);
      const eventsForDay = dayEventsByDate.get(day.isoDate) ?? [];
      const arenaBookingsForDay = arenaBookingsByDateMap.get(day.isoDate) ?? [];
      const arenaStatusesForDay = arenaStatusByDateMap.get(day.isoDate) ?? [];
      const arenaEvents: { id: string; label: string; color: string }[] = [];
      if (arenaBookingsForDay.length > 0) {
        arenaEvents.push({
          id: `arena-bookings-${day.isoDate}`,
          label:
            arenaBookingsForDay.length === 1
              ? 'Ridhus bokat'
              : `Ridhus bokat · ${arenaBookingsForDay.length}`,
          color: arenaEventColors.booking,
        });
      }
      if (arenaStatusesForDay.length > 0) {
        arenaEvents.push({
          id: `arena-status-${day.isoDate}`,
          label: `Ridhus: ${arenaStatusesForDay[0].label}`,
          color: arenaEventColors.status,
        });
      }
      const eventLabels = [
        ...eventsForDay.map((event) => formatPassNote(event.label) ?? event.label),
        ...arenaEvents.map((event) => event.label),
      ];

      const slots: RegularSlot[] = sortedAssignments.map((assignment) => {
        const formattedNote = formatPassNote(assignment.note, assignment.status);
        const noteHidden = formattedNote && eventLabels.includes(formattedNote);
        const isMine = assignment.assigneeId === currentUserId;
        return {
          id: assignment.id,
          label: assignment.label,
          icon: slotIconMap[assignment.slot],
          color: slotColorMap[assignment.slot],
          note: noteHidden ? undefined : formattedNote,
          assignedTo: assignment.assigneeId
            ? assignment.assigneeId === currentUserId
              ? 'Du'
              : users[assignment.assigneeId]?.name ?? undefined
            : undefined,
          isMine,
          isDefault: isMine
            ? isDefaultForUser(defaultPasses, weekdayIndex, assignment.slot)
            : false,
          assignedVia: assignment.assignedVia,
          time: assignment.time,
          status: assignment.status,
          slotType: assignment.slot,
        };
      });

      const dayEventViews = [
        ...eventsForDay.map((event) => ({
          id: event.id,
          label: formatPassNote(event.label) ?? event.label,
          color: dayEventColorMap[event.tone] ?? palette.secondaryText,
        })),
        ...arenaEvents,
      ];

      return {
        id: day.isoDate,
        day: formatShortWeekday(day.date),
        date: formatDayNumber(day.date),
        selected: selectedIso ? day.isoDate === selectedIso : undefined,
        slots,
        openSlots: sortedAssignments.filter((assignment) => assignment.status === 'open').length,
        mineSlots: sortedAssignments.filter(
          (assignment) => assignment.assigneeId === currentUserId && assignment.status !== 'open',
        ).length,
        openAssignments: sortedAssignments.filter((assignment) => assignment.status === 'open'),
        events: dayEventViews,
      };
    });
  }, [
    visiblePassDays,
    users,
    dayEventsByDate,
    currentUserId,
    todayIso,
    focusDate,
    arenaBookingsByDateMap,
    arenaStatusByDateMap,
  ]);

  const visibleRegularDays = React.useMemo(() => {
    if (passView === 'mine') {
      return regularDays.filter((day) => day.mineSlots > 0);
    }
    if (passView === 'open') {
      return regularDays.filter((day) => day.openSlots > 0);
    }
    return regularDays;
  }, [passView, regularDays]);

  const selectedCategory = competitionCategories[categoryIndex];
  const weekRangeLabel = activeWeek ? formatWeekRange(activeWeek.start, activeWeek.end) : '';
  const weekNumber = activeWeek ? getISOWeekNumber(activeWeek.start) : undefined;
  const canGoPreviousWeek = weekIndex > 0;
  const canGoNextWeek = weekGroups.length > 0 && weekIndex < weekGroups.length - 1;

  const dateOptions = React.useMemo(
    () =>
      generateDateOptions(groupedDays, {
        includeDates: assignmentModal.date ? [assignmentModal.date] : undefined,
      }),
    [groupedDays, assignmentModal.date],
  );

  const openArenaModal = React.useCallback(() => {
    setArenaForm({
      date: toISODate(new Date()),
      startTime: '',
      endTime: '',
      purpose: '',
      note: '',
    });
    setArenaModalVisible(true);
  }, []);

  const openDayEventModal = React.useCallback(() => {
    setDayEventForm({
      date: toISODate(new Date()),
      label: '',
      tone: 'info',
    });
    setDayEventModalVisible(true);
  }, []);

  const openRideLogModal = React.useCallback(() => {
    const defaultHorseId = activeHorses[0]?.id ?? '';
    const defaultRideTypeId = activeRideTypes[0]?.id ?? '';
    setRideLogForm({
      date: toISODate(new Date()),
      horseId: defaultHorseId,
      rideTypeId: defaultRideTypeId,
      length: '',
      note: '',
    });
    setRideLogModalVisible(true);
  }, [activeHorses, activeRideTypes]);

  const openArenaStatusModal = React.useCallback((label?: string) => {
    setArenaStatusForm({
      date: toISODate(new Date()),
      label: label ?? 'Harvat',
    });
    setArenaStatusModalVisible(true);
  }, []);

  const handleCreateSlot = React.useCallback(() => {
    setAssignmentModal({ visible: true, mode: 'create' });
  }, []);

  const handleOpenProfile = React.useCallback(() => {
    router.push({ pathname: '/(tabs)/profile', params: { section: 'availability' } });
  }, [router]);

  const handleOpenRideTypes = React.useCallback(() => {
    router.push('/(onboarding)/ride-types');
  }, [router]);

  const handleCategoryToggle = React.useCallback(() => {
    setCategoryIndex((prev) => (prev + 1) % competitionCategories.length);
  }, []);

  const handleClaimAssignment = React.useCallback(
    (assignmentId?: string, fallback?: { date: string; slot?: AssignmentSlot }) => {
      if (assignmentId) {
        const result = actions.claimAssignment(assignmentId);
        if (result.success && result.data) {
          toast.showToast(`${result.data.label} ${result.data.time} är nu ditt.`, 'success');
        } else if (!result.success) {
          toast.showToast(result.reason, 'error');
        }
        return;
      }

      if (fallback) {
        setAssignmentModal({
          visible: true,
          mode: 'create',
          date: fallback.date,
          slot: fallback.slot,
        });
      }
    },
    [actions, toast],
  );

  const handleEditAssignment = React.useCallback(
    (assignmentId: string) => {
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        toast.showToast('Passet kunde inte hittas.', 'error');
        return;
      }

      setAssignmentModal({
        visible: true,
        mode: 'edit',
        assignmentId,
        date: assignment.date,
        slot: assignment.slot,
        label: assignment.label,
        time: assignment.time,
        note: assignment.note,
        assignToMe: assignment.assigneeId === currentUserId && assignment.status === 'assigned',
      });
    },
    [assignments, currentUserId, toast],
  );

  const handleRegisterRide = React.useCallback(() => {
    if (activeRideTypes.length === 0 || activeHorses.length === 0) {
      toast.showToast('Lägg till hästar och ridpass-typer först.', 'info');
      return;
    }
    openRideLogModal();
  }, [activeHorses.length, activeRideTypes.length, openRideLogModal, toast]);

  const handlePrevWeek = React.useCallback(() => {
    setWeekIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextWeek = React.useCallback(() => {
    setWeekIndex((prev) => {
      if (weekGroups.length === 0) {
        return prev;
      }
      return Math.min(weekGroups.length - 1, prev + 1);
    });
  }, [weekGroups.length]);

  const handlePrevMonth = React.useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = React.useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleCreateAssignment = React.useCallback(
    (input: CreateAssignmentInput) => {
      const result = actions.createAssignment(input);
      if (result.success && result.data) {
        const message = result.data.assigneeId
          ? `${result.data.label} ${result.data.time} lades till på dig.`
          : `${result.data.label} ${result.data.time} finns nu som ledigt pass.`;
        toast.showToast(message, 'success');
      } else if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleUpdateAssignment = React.useCallback(
    (input: UpdateAssignmentInput) => {
      const result = actions.updateAssignment(input);
      if (result.success && result.data) {
        toast.showToast(`${result.data.label} ${result.data.time} uppdaterades.`, 'success');
      } else if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleDeleteAssignment = React.useCallback(
    (assignmentId: string) => {
      const result = actions.deleteAssignment(assignmentId);
      if (result.success) {
        toast.showToast('Passet togs bort.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleDeclineAssignment = React.useCallback(
    (assignmentId: string) => {
      const result = actions.declineAssignment(assignmentId);
      if (result.success) {
        toast.showToast('Passet släpptes och blev ledigt.', 'success');
      } else if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleCompleteAssignment = React.useCallback(
    (assignmentId: string) => {
      const result = actions.completeAssignment(assignmentId);
      if (result.success) {
        toast.showToast('Markerat som klart.', 'success');
      } else if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const passEmptyState = React.useMemo<EmptyStateConfig>(() => {
    if (passView === 'mine') {
      return {
        title: 'Inga pass på dig ännu',
        body: canManageAssignments
          ? 'Skapa pass eller sätt standardpass så schemat fylls automatiskt.'
          : 'Sätt standardpass i profilen så schemat fylls automatiskt.',
        actions: [
          canManageAssignments
            ? { label: 'Skapa pass', onPress: handleCreateSlot, variant: 'primary' }
            : { label: 'Ställ in standardpass', onPress: handleOpenProfile, variant: 'primary' },
          { label: 'Se lediga pass', onPress: () => setPassView('open'), variant: 'secondary' },
        ],
      };
    }

    if (passView === 'open') {
      return {
        title: 'Inga lediga pass',
        body: canManageAssignments
          ? 'Skapa nya pass eller gör pass lediga för bemanning.'
          : 'Inga lediga pass just nu. Kolla hela schemat för att planera.',
        actions: canManageAssignments
          ? [
              { label: 'Skapa pass', onPress: handleCreateSlot, variant: 'primary' },
              { label: 'Visa hela schemat', onPress: () => setPassView('all'), variant: 'secondary' },
            ]
          : [{ label: 'Visa hela schemat', onPress: () => setPassView('all'), variant: 'primary' }],
      };
    }

    return {
      title: 'Schemat är tomt',
      body: canManageAssignments
        ? 'Skapa första passet för att komma igång.'
        : 'Stalladmin behöver lägga upp schemat. Under tiden kan du ställa in standardpass.',
      actions: canManageAssignments
        ? [{ label: 'Skapa pass', onPress: handleCreateSlot, variant: 'primary' }]
        : [{ label: 'Ställ in standardpass', onPress: handleOpenProfile, variant: 'primary' }],
    };
  }, [canManageAssignments, handleCreateSlot, handleOpenProfile, passView, setPassView]);

  const handleCreateArenaBooking = React.useCallback(() => {
    const result = actions.addArenaBooking({
      date: arenaForm.date,
      startTime: arenaForm.startTime,
      endTime: arenaForm.endTime,
      purpose: arenaForm.purpose,
      note: arenaForm.note,
    });
    if (result.success) {
      toast.showToast('Ridhusbokning skapad.', 'success');
      setArenaModalVisible(false);
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, arenaForm, toast]);

  const handleRemoveArenaBooking = React.useCallback(
    (bookingId: string) => {
      const result = actions.removeArenaBooking(bookingId);
      if (result.success) {
        toast.showToast('Bokningen togs bort.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleCreateDayEvent = React.useCallback(() => {
    const result = actions.addDayEvent({
      date: dayEventForm.date,
      label: dayEventForm.label,
      tone: dayEventForm.tone,
    });
    if (result.success) {
      toast.showToast('Händelsen lades till.', 'success');
      setDayEventModalVisible(false);
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, dayEventForm, toast]);

  const handleRemoveDayEvent = React.useCallback(
    (eventId: string) => {
      const result = actions.removeDayEvent(eventId);
      if (result.success) {
        toast.showToast('Händelsen togs bort.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleQuickArenaStatus = React.useCallback(
    (label: string) => {
      const result = actions.addArenaStatus({
        date: toISODate(new Date()),
        label,
      });
      if (result.success) {
        toast.showToast(`${label} markerat.`, 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleCreateArenaStatus = React.useCallback(() => {
    const result = actions.addArenaStatus({
      date: arenaStatusForm.date,
      label: arenaStatusForm.label,
    });
    if (result.success) {
      toast.showToast('Ridhusstatus uppdaterad.', 'success');
      setArenaStatusModalVisible(false);
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, arenaStatusForm, toast]);

  const handleRemoveArenaStatus = React.useCallback(
    (statusId: string) => {
      const result = actions.removeArenaStatus(statusId);
      if (result.success) {
        toast.showToast('Statusen togs bort.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleCreateRideLog = React.useCallback(() => {
    if (!canManageRideLogs) {
      toast.showToast('Behörighet saknas för att registrera ridpass.', 'error');
      return;
    }
    const result = actions.addRideLog({
      date: rideLogForm.date,
      horseId: rideLogForm.horseId,
      rideTypeId: rideLogForm.rideTypeId,
      length: rideLogForm.length,
      note: rideLogForm.note,
    });
    if (result.success) {
      toast.showToast('Ridpass registrerat.', 'success');
      setRideLogModalVisible(false);
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, canManageRideLogs, rideLogForm, toast]);

  const handleRemoveRideLog = React.useCallback(
    (rideLogId: string) => {
      if (!canManageRideLogs) {
        toast.showToast('Behörighet saknas för att ta bort ridpass.', 'error');
        return;
      }
      const result = actions.removeRideLog(rideLogId);
      if (result.success) {
        toast.showToast('Ridpass borttaget.', 'success');
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, canManageRideLogs, toast],
  );

  const headerAction = React.useMemo(() => {
    if (activeFilter === 'Pass') {
      if (!canManageAssignments) {
        return null;
      }
      return { label: 'Nytt pass', onPress: handleCreateSlot };
    }
    if (activeFilter === 'Riddagar') {
      if (!canManageRideLogs) {
        return null;
      }
      const hasRideOptions = activeRideTypes.length > 0 && activeHorses.length > 0;
      return hasRideOptions ? { label: 'Registrera', onPress: openRideLogModal } : null;
    }
    if (activeFilter === 'Ridhus') {
      if (!canManageArenaBookings) {
        return null;
      }
      return { label: 'Ny bokning', onPress: openArenaModal };
    }
    return null;
  }, [
    activeFilter,
    activeHorses.length,
    activeRideTypes.length,
    canManageAssignments,
    canManageArenaBookings,
    canManageRideLogs,
    handleCreateSlot,
    openArenaModal,
    openRideLogModal,
  ]);

  return (
    <LinearGradient colors={gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Schema"
          primaryActionLabel={headerAction?.label}
          onPressPrimaryAction={headerAction?.onPress}
          primaryActionDisabled={headerAction?.disabled}
        />
        {!isDesktopWeb ? <StableSwitcher /> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
          showsVerticalScrollIndicator={false}
        >
          <Card tone="muted" style={[styles.filterRow, isDesktopWeb && styles.filterRowDesktop]}>
            {filters.map((label) => {
              const active = label === activeFilter;
              return (
                <TouchableOpacity key={label} onPress={() => setActiveFilter(label)}>
                  <Pill active={active} style={[styles.filterChip, isDesktopWeb && styles.filterChipDesktop]}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {filterLabels[label]}
                    </Text>
                  </Pill>
                </TouchableOpacity>
              );
            })}
          </Card>

          {activeFilter === 'Pass' && (
            <Card tone="muted" style={[styles.subFilterRow, isDesktopWeb && styles.subFilterRowDesktop]}>
              {passViewOptions.map((option) => {
                const active = option.id === passView;
                return (
                  <TouchableOpacity key={option.id} onPress={() => setPassView(option.id)}>
                    <Pill active={active} style={[styles.subFilterChip, isDesktopWeb && styles.subFilterChipDesktop]}>
                      <Text style={[styles.subFilterText, active && styles.subFilterTextActive]}>
                        {option.label}
                      </Text>
                    </Pill>
                  </TouchableOpacity>
                );
              })}
            </Card>
          )}

          {activeFilter === 'Pass' && (
            <Card tone="muted" style={[styles.legendCard, isDesktopWeb && styles.legendCardDesktop]}>
              {legendItems.map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </Card>
          )}

          {activeFilter === 'Pass' && isDesktopWeb && passView === 'all' ? (
            <View style={styles.monthSection}>
              <View style={styles.monthHeader}>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={handlePrevMonth}
                  activeOpacity={0.8}
                >
                  <Feather name="chevron-left" size={18} color={palette.icon} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={handleNextMonth}
                  activeOpacity={0.8}
                >
                  <Feather name="chevron-right" size={18} color={palette.icon} />
                </TouchableOpacity>
              </View>
              <View style={styles.monthWeekHeaderRow}>
                <Text style={[styles.monthWeekHeaderLabel, styles.monthWeekHeaderWeekLabel]}>V</Text>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.monthWeekHeaderLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.monthGrid}>
                {monthWeeks.map((week) => (
                  <View key={`${week.weekNumber}-${week.start}`} style={styles.monthWeekRow}>
                    <View style={styles.monthWeekNumber}>
                      <Text style={styles.monthWeekNumberText}>{week.weekNumber}</Text>
                    </View>
                    {week.days.map((day) => {
                      const isoDate = toISODate(day);
                      const isOutside = day.getMonth() !== monthCursor.getMonth();
                      const isToday = isoDate === todayIso;
                      const assignmentsForDay = desktopAssignmentsByDate.get(isoDate) ?? [];
                      const eventsForDay = dayEventsByDate.get(isoDate) ?? [];
                      const visibleAssignments = assignmentsForDay.slice(0, 3);
                      const hiddenCount = Math.max(0, assignmentsForDay.length - visibleAssignments.length);
                      const visibleEvents = eventsForDay.slice(0, 3);

                      return (
                        <View
                          key={isoDate}
                          style={[
                            styles.monthDayCell,
                            isOutside && styles.monthDayCellMuted,
                            isToday && styles.monthDayCellToday,
                          ]}
                        >
                          <View style={styles.monthDayHeader}>
                            <Text
                              style={[
                                styles.monthDayNumber,
                                isOutside && styles.monthDayNumberMuted,
                              ]}
                            >
                              {day.getDate()}
                            </Text>
                            {isToday ? (
                              <View style={styles.todayPill}>
                                <Text style={styles.todayPillText}>Idag</Text>
                              </View>
                            ) : null}
                          </View>
                          {visibleEvents.length > 0 ? (
                            <View style={styles.monthEventRow}>
                              {visibleEvents.map((event) => (
                                <View
                                  key={event.id}
                                  style={[
                                    styles.monthEventDot,
                                    { backgroundColor: dayEventColorMap[event.tone] ?? palette.secondaryText },
                                  ]}
                                />
                              ))}
                              {eventsForDay.length > 3 ? (
                                <Text style={styles.monthEventMore}>+{eventsForDay.length - 3}</Text>
                              ) : null}
                            </View>
                          ) : null}
                          <View style={styles.monthAssignmentList}>
                            {visibleAssignments.map((assignment) => {
                              const assignee = assignment.assigneeId
                                ? users[assignment.assigneeId]?.name ?? 'Tilldelad'
                                : 'Ledigt';
                              const label = `${assignment.label} · ${assignee}`;
                              return (
                                <View key={assignment.id} style={styles.monthAssignmentRow}>
                                  <View
                                    style={[
                                      styles.monthSlotDot,
                                      { backgroundColor: slotColorMap[assignment.slot] },
                                    ]}
                                  />
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.monthAssignmentText,
                                      assignment.status === 'open' && styles.monthAssignmentOpen,
                                      assignment.status === 'completed' && styles.monthAssignmentDone,
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </View>
                              );
                            })}
                            {hiddenCount > 0 ? (
                              <Text style={styles.monthMoreText}>+{hiddenCount} till</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          ) : activeFilter === 'Pass' && passView === 'all' ? (
            <View style={styles.weekRow}>
              <TouchableOpacity
                style={[styles.weekButton, !canGoPreviousWeek && styles.weekButtonDisabled]}
                onPress={handlePrevWeek}
                disabled={!canGoPreviousWeek}
              >
                <Feather
                  name="chevron-left"
                  size={16}
                  color={canGoPreviousWeek ? palette.icon : palette.secondaryText}
                />
              </TouchableOpacity>
              <View style={styles.weekTitleBlock}>
                <Text style={styles.weekTitle}>
                  {weekNumber ? `Vecka ${weekNumber}` : 'Veckoschema'}
                </Text>
                {weekRangeLabel ? <Text style={styles.weekSubtitle}>{weekRangeLabel}</Text> : null}
              </View>
              <TouchableOpacity
                style={[styles.weekButton, !canGoNextWeek && styles.weekButtonDisabled]}
                onPress={handleNextWeek}
                disabled={!canGoNextWeek}
              >
                <Feather
                  name="chevron-right"
                  size={16}
                  color={canGoNextWeek ? palette.icon : palette.secondaryText}
                />
              </TouchableOpacity>
            </View>
          ) : activeFilter === 'Pass' ? (
            <View style={styles.listHeaderRow}>
              <View>
                <Text style={styles.weekTitle}>Kommande dagar</Text>
                <Text style={styles.weekSubtitle}>
                  {passView === 'mine'
                    ? 'Pass som står på dig'
                    : 'Pass som saknar ansvarig'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.listHeaderAction}
                onPress={() => setPassView('all')}
                activeOpacity={0.85}
              >
                <Text style={styles.listHeaderActionText}>Veckovy</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {activeFilter === 'Pass' && (!isDesktopWeb || passView !== 'all') && (
            <View style={[styles.scheduleList, isDesktopWeb && styles.scheduleListDesktop]}>
              {visibleRegularDays.map((day) => (
                <RegularDayCard
                  key={day.id}
                  day={day.day}
                  date={day.date}
                  isoDate={day.id}
                  selected={day.selected}
                  slots={day.slots}
                  openSlots={day.openSlots}
                  mineSlots={day.mineSlots}
                  openAssignments={day.openAssignments}
                  events={day.events}
                  mode={passView}
                  onClaimOpenAssignment={canClaimAssignments ? handleClaimAssignment : undefined}
                  onCreateAssignment={
                    canManageAssignments
                      ? (defaults) =>
                          setAssignmentModal({
                            visible: true,
                            mode: 'create',
                            date: defaults.date,
                            slot: defaults.slot,
                            note: 'Behöver bemanning',
                          })
                      : undefined
                  }
                  onEditAssignment={canManageAssignments ? handleEditAssignment : undefined}
                  onDeclineAssignment={canCompleteAssignments ? handleDeclineAssignment : undefined}
                  onCompleteAssignment={canCompleteAssignments ? handleCompleteAssignment : undefined}
                />
              ))}
              {visibleRegularDays.length === 0 ? (
                <EmptyStateCard
                  title={passEmptyState.title}
                  body={passEmptyState.body}
                  actions={passEmptyState.actions}
                />
              ) : null}
            </View>
          )}

          {activeFilter === 'Riddagar' && (
            <View style={styles.ridingSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Ridschema</Text>
              </View>
              <View style={styles.ridingList}>
                {activeRidingSchedule.map((day) => (
                  <RidingDayRow
                    key={day.id}
                    label={day.label}
                    upcoming={day.upcomingRides}
                    isToday={day.isToday}
                    onRegisterRide={canManageRideLogs ? handleRegisterRide : undefined}
                  />
                ))}
                {activeRidingSchedule.length === 0 ? (
                  <EmptyStateCard
                    title="Ridschemat saknas"
                    body={
                      canManageOnboarding
                        ? 'Ridschemat är tomt just nu. När det läggs in syns det här.'
                        : 'Ridschemat läggs in av stalladmin. När det finns data syns det här.'
                    }
                    actions={
                      canRegisterRide
                        ? [
                            {
                              label: 'Registrera ridpass',
                              onPress: openRideLogModal,
                              variant: 'primary',
                            },
                          ]
                        : undefined
                    }
                  />
                ) : null}
              </View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Ridlogg</Text>
                {canManageRideLogs ? (
                  <TouchableOpacity style={styles.sectionActionButton} onPress={openRideLogModal}>
                    <Feather name="plus" size={14} color={palette.inverseText} />
                    <Text style={styles.sectionActionText}>Registrera</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {activeRideTypes.length === 0 ? (
                <EmptyStateCard
                  title="Inga ridpass-typer"
                  body={
                    canManageOnboarding
                      ? 'Lägg till ridpass-typer i uppstarten för att kunna registrera ridpass.'
                      : 'Ridpass-typer saknas. Be stalladmin lägga till dem.'
                  }
                  actions={
                    canManageOnboarding
                      ? [
                          {
                            label: 'Lägg till ridpass-typer',
                            onPress: handleOpenRideTypes,
                            variant: 'primary',
                          },
                        ]
                      : undefined
                  }
                />
              ) : rideLogsByDate.length > 0 ? (
                <View style={styles.rideLogGroups}>
                  {rideLogsByDate.map((group) => (
                    <View key={group.date} style={styles.rideLogGroup}>
                      <Text style={styles.bookingDate}>{formatShortDateLabel(group.date)}</Text>
                      <View style={styles.rideLogList}>
                        {group.logs.map((log) => {
                          const horseName = horseById[log.horseId] ?? 'Okänd häst';
                          const rideType = rideTypeById[log.rideTypeId];
                          const rideTypeLabel = rideType
                            ? `${rideType.code} · ${rideType.label}`
                            : 'Okänd typ';
                          return (
                            <Card key={log.id} tone="muted" style={styles.rideLogCard}>
                              <View style={styles.rideLogRow}>
                                <View style={styles.rideLogInfo}>
                                  <Text style={styles.rideLogHorse}>{horseName}</Text>
                                  <Text style={styles.rideLogMeta}>{rideTypeLabel}</Text>
                                  {log.length ? (
                                    <Text style={styles.rideLogMeta}>Längd: {log.length}</Text>
                                  ) : null}
                                </View>
                                {canManageRideLogs ? (
                                  <TouchableOpacity
                                    style={styles.bookingDelete}
                                    onPress={() => handleRemoveRideLog(log.id)}
                                  >
                                    <Feather name="x" size={16} color={palette.secondaryText} />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                              {log.note ? <Text style={styles.bookingNote}>{log.note}</Text> : null}
                            </Card>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyStateCard
                  title="Ingen ridlogg ännu"
                  body={
                    canManageRideLogs
                      ? 'Registrera första ridpasset så syns det här.'
                      : 'Ridloggen fylls av de som får registrera ridpass.'
                  }
                  actions={
                    canManageRideLogs
                      ? [
                          {
                            label: 'Registrera ridpass',
                            onPress: openRideLogModal,
                            variant: 'primary',
                          },
                        ]
                      : undefined
                  }
                />
              )}
            </View>
          )}

          {activeFilter === 'Ridhus' && isDesktopWeb ? (
            <View style={styles.monthSection}>
              <View style={styles.monthHeader}>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={handlePrevMonth}
                  activeOpacity={0.8}
                >
                  <Feather name="chevron-left" size={18} color={palette.icon} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={handleNextMonth}
                  activeOpacity={0.8}
                >
                  <Feather name="chevron-right" size={18} color={palette.icon} />
                </TouchableOpacity>
              </View>
              <View style={styles.monthWeekHeaderRow}>
                <Text style={[styles.monthWeekHeaderLabel, styles.monthWeekHeaderWeekLabel]}>V</Text>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.monthWeekHeaderLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.monthGrid}>
                {monthWeeks.map((week) => (
                  <View key={`${week.weekNumber}-${week.start}`} style={styles.monthWeekRow}>
                    <View style={styles.monthWeekNumber}>
                      <Text style={styles.monthWeekNumberText}>{week.weekNumber}</Text>
                    </View>
                    {week.days.map((day) => {
                      const isoDate = toISODate(day);
                      const isOutside = day.getMonth() !== monthCursor.getMonth();
                      const isToday = isoDate === todayIso;
                      const bookings = arenaBookingsByDateMap.get(isoDate) ?? [];
                      const statuses = arenaStatusByDateMap.get(isoDate) ?? [];
                      const latestStatus = statuses[0];
                      const items: { id: string; label: string; color: string }[] = [];

                      if (bookings.length > 0) {
                        items.push({
                          id: `arena-bookings-${isoDate}`,
                          label:
                            bookings.length === 1
                              ? 'Ridhus bokat'
                              : `Ridhus bokat · ${bookings.length}`,
                          color: arenaEventColors.booking,
                        });
                      }
                      if (latestStatus) {
                        items.push({
                          id: `arena-status-${isoDate}`,
                          label: `Status: ${latestStatus.label}`,
                          color: arenaEventColors.status,
                        });
                      }

                      return (
                        <View
                          key={isoDate}
                          style={[
                            styles.monthDayCell,
                            isOutside && styles.monthDayCellMuted,
                            isToday && styles.monthDayCellToday,
                          ]}
                        >
                          <View style={styles.monthDayHeader}>
                            <Text
                              style={[
                                styles.monthDayNumber,
                                isOutside && styles.monthDayNumberMuted,
                              ]}
                            >
                              {day.getDate()}
                            </Text>
                            {isToday ? (
                              <View style={styles.todayPill}>
                                <Text style={styles.todayPillText}>Idag</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.monthAssignmentList}>
                            {items.map((item) => (
                              <View key={item.id} style={styles.monthAssignmentRow}>
                                <View
                                  style={[
                                    styles.monthSlotDot,
                                    { backgroundColor: item.color },
                                  ]}
                                />
                                <Text numberOfLines={1} style={styles.monthAssignmentText}>
                                  {item.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {activeFilter === 'Ridhus' && (
            <View style={styles.ridingSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Ridhus-bokningar</Text>
                {canManageArenaBookings ? (
                  <TouchableOpacity style={styles.sectionActionButton} onPress={openArenaModal}>
                    <Feather name="plus" size={14} color={palette.inverseText} />
                    <Text style={styles.sectionActionText}>Ny bokning</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {arenaBookingsByDate.length > 0 ? (
                <View style={styles.bookingGroups}>
                  {arenaBookingsByDate.map((group) => (
                    <View key={group.date} style={styles.bookingGroup}>
                      <Text style={styles.bookingDate}>{formatShortDateLabel(group.date)}</Text>
                      <View style={styles.bookingList}>
                        {group.bookings.map((booking) => {
                          const bookedBy = users[booking.bookedByUserId]?.name ?? 'Okänd';
                          return (
                            <Card key={booking.id} tone="muted" style={styles.bookingCard}>
                              <View style={styles.bookingRow}>
                                <View style={styles.bookingInfo}>
                                  <Text style={styles.bookingTime}>
                                    {booking.startTime}–{booking.endTime}
                                  </Text>
                                  <Text style={styles.bookingPurpose}>{booking.purpose}</Text>
                                  <Text style={styles.bookingMeta}>Bokad av {bookedBy}</Text>
                                </View>
                                {canManageArenaBookings ? (
                                  <TouchableOpacity
                                    style={styles.bookingDelete}
                                    onPress={() => handleRemoveArenaBooking(booking.id)}
                                  >
                                    <Feather name="x" size={16} color={palette.secondaryText} />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                              {booking.note ? (
                                <Text style={styles.bookingNote}>{booking.note}</Text>
                              ) : null}
                            </Card>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyStateCard
                  title="Inga bokningar ännu"
                  body={
                    canManageArenaBookings
                      ? 'Boka första passet i ridhuset så syns det här.'
                      : 'Bokningar syns här när stalladmin lägger in dem.'
                  }
                  actions={
                    canManageArenaBookings
                      ? [{ label: 'Ny bokning', onPress: openArenaModal, variant: 'primary' }]
                      : undefined
                  }
                />
              )}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Ridhusstatus</Text>
                {canManageArenaStatus ? (
                  <TouchableOpacity style={styles.sectionActionButton} onPress={() => openArenaStatusModal('Harvat')}>
                    <Feather name="plus" size={14} color={palette.inverseText} />
                    <Text style={styles.sectionActionText}>Markera</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {latestArenaStatus ? (
                <Text style={styles.sectionMeta}>
                  Senast: {latestArenaStatus.label} · {formatShortDateLabel(latestArenaStatus.date)}{' '}
                  {formatClockTime(latestArenaStatus.createdAt)}
                </Text>
              ) : null}
              {canManageArenaStatus ? (
                <View style={styles.statusQuickRow}>
                  {arenaStatusPresets.map((label) => (
                    <TouchableOpacity
                      key={label}
                      style={styles.statusQuickButton}
                      onPress={() => handleQuickArenaStatus(label)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.statusQuickText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {arenaStatusByDate.length > 0 ? (
                <View style={styles.arenaStatusList}>
                  {arenaStatusByDate.map((group) => (
                    <View key={group.date} style={styles.rideLogGroup}>
                      <Text style={styles.bookingDate}>{formatShortDateLabel(group.date)}</Text>
                      <View style={styles.rideLogList}>
                        {group.statuses.map((status) => (
                          <Card key={status.id} tone="muted" style={styles.rideLogCard}>
                            <View style={styles.rideLogRow}>
                              <View style={styles.rideLogInfo}>
                                <Text style={styles.rideLogHorse}>{status.label}</Text>
                                <Text style={styles.rideLogMeta}>
                                  {formatClockTime(status.createdAt)} · {users[status.createdByUserId]?.name ?? 'Okänd'}
                                </Text>
                              </View>
                              {canManageArenaStatus ? (
                                <TouchableOpacity
                                  style={styles.bookingDelete}
                                  onPress={() => handleRemoveArenaStatus(status.id)}
                                >
                                  <Feather name="x" size={16} color={palette.secondaryText} />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </Card>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyStateCard
                  title="Ingen status markerad"
                  body={
                    canManageArenaStatus
                      ? 'Markera dagens status så alla vet vad som gäller.'
                      : 'Statusen syns här när den markeras.'
                  }
                  actions={
                    canManageArenaStatus
                      ? [
                          {
                            label: 'Markera status',
                            onPress: () => openArenaStatusModal('Harvat'),
                            variant: 'primary',
                          },
                        ]
                      : undefined
                  }
                />
              )}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Dagshändelser</Text>
                {canManageDayEvents ? (
                  <TouchableOpacity style={styles.sectionActionButton} onPress={openDayEventModal}>
                    <Feather name="plus" size={14} color={palette.inverseText} />
                    <Text style={styles.sectionActionText}>Lägg till</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {sortedDayEvents.length > 0 ? (
                <View style={styles.dayEventList}>
                  {sortedDayEvents.map((event) => (
                    <Card key={event.id} tone="muted" style={styles.dayEventCard}>
                      <View style={styles.dayEventCardRow}>
                        <View
                          style={[
                            styles.dayEventToneDot,
                            { backgroundColor: dayEventColorMap[event.tone] ?? palette.secondaryText },
                          ]}
                        />
                        <View style={styles.dayEventInfo}>
                          <Text style={styles.dayEventLabel}>{event.label}</Text>
                          <Text style={styles.dayEventMeta}>
                            {formatShortDateLabel(event.date)} · {dayEventToneLabels[event.tone]}
                          </Text>
                        </View>
                        {canManageDayEvents ? (
                          <TouchableOpacity
                            style={styles.dayEventDelete}
                            onPress={() => handleRemoveDayEvent(event.id)}
                          >
                            <Feather name="x" size={16} color={palette.secondaryText} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </Card>
                  ))}
                </View>
              ) : (
                <EmptyStateCard
                  title="Inga dagshändelser"
                  body={
                    canManageDayEvents
                      ? 'Lägg till händelser så alla ser vad som händer i stallet.'
                      : 'Dagshändelser syns här när de läggs in.'
                  }
                  actions={
                    canManageDayEvents
                      ? [{ label: 'Lägg till', onPress: openDayEventModal, variant: 'primary' }]
                      : undefined
                  }
                />
              )}
            </View>
          )}

          {activeFilter === 'Tävling' && (
            <View style={styles.competitionSection}>
              <TouchableOpacity style={styles.competitionCategory} onPress={handleCategoryToggle}>
                <Text style={styles.competitionCategoryText}>{selectedCategory}</Text>
                <Feather name="chevron-down" size={14} color={palette.icon} />
              </TouchableOpacity>
              <View style={styles.competitionList}>
                {competitionEvents.length > 0 ? (
                  competitionEvents.map((event) => <CompetitionCard key={event.id} event={event} />)
                ) : (
                  <EmptyStateCard
                    title="Inga tävlingar planerade"
                    body="När tävlingar läggs in syns de här."
                  />
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <Modal
        transparent
        animationType="fade"
        visible={arenaModalVisible}
        onRequestClose={() => setArenaModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <Card tone="muted" style={styles.modalCard}>
              <Text style={styles.modalTitle}>Ny ridhusbokning</Text>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Datum</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="ÅÅÅÅ-MM-DD"
                  placeholderTextColor={palette.secondaryText}
                  keyboardType="numbers-and-punctuation"
                  value={arenaForm.date}
                  onChangeText={(value) => setArenaForm((prev) => ({ ...prev, date: value }))}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.modalRow}>
                <View style={styles.modalFieldFlex}>
                  <Text style={styles.modalLabel}>Start</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="17:00"
                    placeholderTextColor={palette.secondaryText}
                    keyboardType="numbers-and-punctuation"
                    value={arenaForm.startTime}
                    onChangeText={(value) => setArenaForm((prev) => ({ ...prev, startTime: value }))}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.modalFieldFlex}>
                  <Text style={styles.modalLabel}>Slut</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="18:00"
                    placeholderTextColor={palette.secondaryText}
                    keyboardType="numbers-and-punctuation"
                    value={arenaForm.endTime}
                    onChangeText={(value) => setArenaForm((prev) => ({ ...prev, endTime: value }))}
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Syfte</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Dressyrträning"
                  placeholderTextColor={palette.secondaryText}
                  value={arenaForm.purpose}
                  onChangeText={(value) => setArenaForm((prev) => ({ ...prev, purpose: value }))}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notering</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Valfritt"
                  placeholderTextColor={palette.secondaryText}
                  value={arenaForm.note}
                  onChangeText={(value) => setArenaForm((prev) => ({ ...prev, note: value }))}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalGhostButton}
                  onPress={() => setArenaModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleCreateArenaBooking}>
                  <Text style={styles.modalPrimaryText}>Skapa</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={dayEventModalVisible}
        onRequestClose={() => setDayEventModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <Card tone="muted" style={styles.modalCard}>
              <Text style={styles.modalTitle}>Ny dagshändelse</Text>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Datum</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="ÅÅÅÅ-MM-DD"
                  placeholderTextColor={palette.secondaryText}
                  keyboardType="numbers-and-punctuation"
                  value={dayEventForm.date}
                  onChangeText={(value) => setDayEventForm((prev) => ({ ...prev, date: value }))}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Rubrik</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Hovslagare bortrest"
                  placeholderTextColor={palette.secondaryText}
                  value={dayEventForm.label}
                  onChangeText={(value) => setDayEventForm((prev) => ({ ...prev, label: value }))}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Typ</Text>
                <View style={styles.toneRow}>
                  {visibleDayEventToneOptions.map((option) => {
                    const active = option.id === dayEventForm.tone;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => setDayEventForm((prev) => ({ ...prev, tone: option.id }))}
                      >
                        <Pill style={[styles.toneChip, active && styles.toneChipActive]}>
                          <View
                            style={[
                              styles.toneDot,
                              { backgroundColor: dayEventColorMap[option.id] ?? palette.secondaryText },
                            ]}
                          />
                          <Text style={[styles.toneLabel, active && styles.toneLabelActive]}>
                            {option.label}
                          </Text>
                        </Pill>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalGhostButton}
                  onPress={() => setDayEventModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleCreateDayEvent}>
                  <Text style={styles.modalPrimaryText}>Lägg till</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={arenaStatusModalVisible}
        onRequestClose={() => setArenaStatusModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <Card tone="muted" style={styles.modalCard}>
              <Text style={styles.modalTitle}>Ridhusstatus</Text>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Datum</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="ÅÅÅÅ-MM-DD"
                  placeholderTextColor={palette.secondaryText}
                  keyboardType="numbers-and-punctuation"
                  value={arenaStatusForm.date}
                  onChangeText={(value) => setArenaStatusForm((prev) => ({ ...prev, date: value }))}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Status</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Harvat"
                  placeholderTextColor={palette.secondaryText}
                  value={arenaStatusForm.label}
                  onChangeText={(value) => setArenaStatusForm((prev) => ({ ...prev, label: value }))}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalGhostButton}
                  onPress={() => setArenaStatusModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleCreateArenaStatus}>
                  <Text style={styles.modalPrimaryText}>Spara</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={rideLogModalVisible}
        onRequestClose={() => setRideLogModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <Card tone="muted" style={styles.modalCard}>
              <Text style={styles.modalTitle}>Registrera ridpass</Text>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Datum</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="ÅÅÅÅ-MM-DD"
                  placeholderTextColor={palette.secondaryText}
                  keyboardType="numbers-and-punctuation"
                  value={rideLogForm.date}
                  onChangeText={(value) => setRideLogForm((prev) => ({ ...prev, date: value }))}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Häst</Text>
                <View style={styles.selectorRow}>
                  {activeHorses.map((horse) => {
                    const active = rideLogForm.horseId === horse.id;
                    return (
                      <TouchableOpacity
                        key={horse.id}
                        onPress={() => setRideLogForm((prev) => ({ ...prev, horseId: horse.id }))}
                      >
                        <Pill style={[styles.selectorChip, active && styles.selectorChipActive]}>
                          <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>
                            {horse.name}
                          </Text>
                        </Pill>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {activeHorses.length === 0 ? (
                  <Text style={styles.modalHint}>Inga hästar i stallet ännu.</Text>
                ) : null}
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Typ</Text>
                <View style={styles.selectorRow}>
                  {activeRideTypes.map((type) => {
                    const active = rideLogForm.rideTypeId === type.id;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        onPress={() => setRideLogForm((prev) => ({ ...prev, rideTypeId: type.id }))}
                      >
                        <Pill style={[styles.selectorChip, active && styles.selectorChipActive]}>
                          <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>
                            {type.code}
                          </Text>
                        </Pill>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {activeRideTypes.length === 0 ? (
                  <Text style={styles.modalHint}>Lägg till ridpass-typer i onboarding.</Text>
                ) : null}
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Längd</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="45 min / 8 km"
                  placeholderTextColor={palette.secondaryText}
                  value={rideLogForm.length}
                  onChangeText={(value) => setRideLogForm((prev) => ({ ...prev, length: value }))}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notering</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Valfritt"
                  placeholderTextColor={palette.secondaryText}
                  value={rideLogForm.note}
                  onChangeText={(value) => setRideLogForm((prev) => ({ ...prev, note: value }))}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalGhostButton}
                  onPress={() => setRideLogModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalPrimaryButton,
                    (!rideLogForm.horseId || !rideLogForm.rideTypeId) && styles.modalPrimaryButtonDisabled,
                  ]}
                  onPress={handleCreateRideLog}
                  disabled={!rideLogForm.horseId || !rideLogForm.rideTypeId}
                >
                  <Text style={styles.modalPrimaryText}>Spara</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <NewAssignmentModal
        visible={assignmentModal.visible}
        mode={assignmentModal.mode}
        onClose={() => setAssignmentModal({ visible: false, mode: 'create' })}
        onSubmit={(input) => {
          const fallbackDate =
            assignmentModal.date ?? dateOptions[0]?.value ?? toISODate(new Date());
          const resolvedDate = input.date ?? fallbackDate;
          const resolvedSlot = input.slot ?? assignmentModal.slot ?? 'Morning';
          const resolvedAssign =
            input.assignToCurrentUser ?? assignmentModal.assignToMe ?? false;

          if (assignmentModal.mode === 'edit' && assignmentModal.assignmentId) {
            const assignChanged = resolvedAssign !== (assignmentModal.assignToMe ?? false);
            handleUpdateAssignment({
              id: assignmentModal.assignmentId,
              date: resolvedDate,
              slot: resolvedSlot,
              labelOverride: input.labelOverride,
              time: input.time,
              note: input.noteProvided
                ? (input.note && input.note.length > 0 ? input.note : '')
                : undefined,
              assignToCurrentUser: assignChanged ? resolvedAssign : undefined,
            });
          } else {
            handleCreateAssignment({
              date: resolvedDate,
              slot: resolvedSlot,
              labelOverride: input.labelOverride,
              time: input.time,
              note: input.noteProvided
                ? input.note && input.note.length > 0
                  ? input.note
                  : undefined
                : assignmentModal.note?.trim()
                  ? assignmentModal.note.trim()
                  : undefined,
              assignToCurrentUser: resolvedAssign,
            });
          }

          setAssignmentModal({ visible: false, mode: 'create' });
        }}
        onDelete={
          assignmentModal.mode === 'edit' && assignmentModal.assignmentId
            ? () => {
                handleDeleteAssignment(assignmentModal.assignmentId as string);
                setAssignmentModal({ visible: false, mode: 'create' });
              }
            : undefined
        }
        dateOptions={dateOptions}
        initialDate={assignmentModal.date}
        initialSlot={assignmentModal.slot}
        initialLabel={assignmentModal.label}
        initialTime={assignmentModal.time}
        initialNote={assignmentModal.note}
        initialAssignToMe={assignmentModal.assignToMe}
      />
    </LinearGradient>
  );
}

function RegularDayCard({
  day,
  date,
  isoDate,
  selected,
  slots,
  openSlots,
  mineSlots,
  openAssignments,
  events,
  mode,
  onClaimOpenAssignment,
  onCreateAssignment,
  onEditAssignment,
  onDeclineAssignment,
  onCompleteAssignment,
}: {
  day: string;
  date: string;
  isoDate: string;
  selected?: boolean;
  slots: RegularSlot[];
  openSlots: number;
  mineSlots: number;
  openAssignments: Assignment[];
  events: { id: string; label: string; color: string }[];
  mode: PassView;
  onClaimOpenAssignment?: (assignmentId?: string, fallback?: { date: string; slot?: AssignmentSlot }) => void;
  onCreateAssignment?: (defaults: { date: string; slot?: AssignmentSlot }) => void;
  onEditAssignment?: (assignmentId: string) => void;
  onDeclineAssignment?: (assignmentId: string) => void;
  onCompleteAssignment?: (assignmentId: string) => void;
}) {
  const visibleSlots =
    mode === 'mine'
      ? slots.filter((slot) => slot.isMine)
      : mode === 'open'
        ? slots.filter((slot) => slot.status === 'open')
        : slots;

  const handleActionPress = () => {
    if (openSlots > 0) {
      if (!onClaimOpenAssignment) {
        return;
      }
      onClaimOpenAssignment(openAssignments[0]?.id, {
        date: isoDate,
        slot: openAssignments[0]?.slot,
      });
      return;
    }
    if (!onCreateAssignment) {
      return;
    }
    onCreateAssignment({
      date: isoDate,
      slot: slots[0]?.slotType,
    });
  };

  const showActionButton = openSlots > 0 ? Boolean(onClaimOpenAssignment) : Boolean(onCreateAssignment);
  const showFooter = mode !== 'mine';

  return (
    <Card tone="muted" elevated style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <View style={[styles.dayBadge, selected ? styles.dayBadgeActive : styles.dayBadgeInactive]}>
          <Text style={[styles.dayBadgeText, selected ? styles.dayBadgeTextActive : undefined]}>
            {day} {date}
          </Text>
        </View>
        <View style={styles.dayStatusGroup}>
          {mode === 'mine' ? (
            <View style={styles.dayStatusPill}>
              <Text style={styles.dayStatusPillText}>
                {mineSlots > 0 ? `${mineSlots} på dig` : 'Inget på dig'}
              </Text>
            </View>
          ) : openSlots > 0 ? (
            <View style={styles.dayStatusPill}>
              <Text style={styles.dayStatusPillText}>{openSlots} ledigt</Text>
            </View>
          ) : (
            <Text style={styles.dayStatusLabel}>Alla pass täckta</Text>
          )}
        </View>
      </View>
      {events.length ? (
        <View style={styles.dayEventRow}>
          {events.map((event) => (
            <View key={event.id} style={styles.dayEventChip}>
              <View style={[styles.legendDot, { backgroundColor: event.color }]} />
              <Text style={styles.dayEventText}>{event.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.daySlots}>
        {visibleSlots.map((slot, index) => (
          <ScheduleIcon
            key={slot.id}
            label={slot.label}
            icon={slot.icon}
            color={slot.color}
            note={slot.note}
            assignedTo={slot.assignedTo}
            isMine={slot.isMine}
            isDefault={slot.isDefault}
            assignedVia={slot.assignedVia}
            time={slot.time}
            isLast={index === visibleSlots.length - 1}
            status={slot.status}
            onTake={
              slot.status === 'open'
                ? () =>
                    onClaimOpenAssignment?.(slot.id, {
                      date: isoDate,
                      slot: slot.slotType,
                    })
                : undefined
            }
            onManage={slot.status !== 'open' ? () => onEditAssignment?.(slot.id) : undefined}
            onDecline={
              slot.isMine && slot.status === 'assigned'
                ? () => onDeclineAssignment?.(slot.id)
                : undefined
            }
            onComplete={
              slot.isMine && slot.status === 'assigned'
                ? () => onCompleteAssignment?.(slot.id)
                : undefined
            }
          />
        ))}
      </View>
      {showFooter ? (
        <View style={styles.dayFooterRow}>
          {openSlots > 0 ? (
            <View style={styles.dayStatusBadge}>
              <Feather name="alert-triangle" size={12} color={palette.warning} />
              <Text style={styles.dayStatusBadgeText}>{openSlots} lediga pass</Text>
            </View>
          ) : (
            <Text style={styles.dayStatusLabel}>Alla pass täckta</Text>
          )}
          {showActionButton ? (
            <TouchableOpacity
              style={[
                styles.dayActionButton,
                openSlots > 0 && styles.dayActionButtonPrimary,
              ]}
              activeOpacity={0.85}
              onPress={handleActionPress}
            >
              <Text
                style={[
                  styles.dayActionLabel,
                  openSlots > 0 && styles.dayActionLabelPrimary,
                ]}
              >
                {openSlots > 0 ? 'Ta pass' : 'Nytt pass'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function ScheduleIcon({
  label,
  icon,
  color,
  note,
  assignedTo,
  isMine,
  isDefault,
  assignedVia,
  time,
  isLast,
  status,
  onTake,
  onManage,
  onDecline,
  onComplete,
}: {
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
  assignedTo?: string;
  isMine: boolean;
  isDefault: boolean;
  assignedVia?: Assignment['assignedVia'];
  time?: string;
  isLast?: boolean;
  status: AssignmentStatus;
  onTake?: () => void;
  onManage?: () => void;
  onDecline?: () => void;
  onComplete?: () => void;
}) {
  const noteColor = note ? resolveNoteColor(note) : undefined;
  const isOpen = status === 'open';
  const isCompleted = status === 'completed';
  const showDefaultTag =
    isMine && status === 'assigned' && (assignedVia === 'default' || isDefault);

  const renderIcon = () => {
    if (icon === 'sun') {
      return <Feather name="sun" size={16} color={color} />;
    }
    if (icon === 'moon') {
      return <Feather name="moon" size={16} color={color} />;
    }
    return <Feather name="clock" size={16} color={color} />;
  };

  return (
    <View style={[styles.scheduleIcon, isLast && styles.scheduleIconLast]}>
      <View style={styles.scheduleRow}>
        <View style={[styles.scheduleIconBadge, { backgroundColor: `${color}1A` }]}>
          {renderIcon()}
        </View>
        <View style={styles.scheduleBody}>
          <View style={styles.scheduleHeaderRow}>
            <View style={styles.scheduleTitleGroup}>
              <Text style={styles.scheduleLabel}>{label}</Text>
              {time ? <Text style={styles.scheduleTime}>{time}</Text> : null}
              {assignedTo ? (
                <View style={styles.scheduleAssigneeRow}>
                  <Feather name="user" size={12} color={palette.secondaryText} />
                  <Text style={styles.scheduleAssignee}>{assignedTo}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.scheduleActionColumn}>
              {note ? (
                <View style={styles.scheduleTag}>
                  <View
                    style={[
                      styles.legendDot,
                      noteColor ? { backgroundColor: noteColor } : styles.legendDotFallback,
                    ]}
                  />
                  <Text style={styles.scheduleTagText}>{note}</Text>
                </View>
              ) : null}
              {!note && isOpen ? (
                <View style={[styles.scheduleTag, styles.scheduleTagOpen]}>
                  <Feather name="alert-circle" size={12} color={palette.primary} />
                  <Text style={[styles.scheduleTagText, styles.scheduleTagOpenText]}>
                    Ledigt pass
                  </Text>
                </View>
              ) : null}
              {isCompleted ? (
                <View style={[styles.scheduleTag, styles.scheduleTagComplete]}>
                  <Feather name="check" size={12} color={palette.success} />
                  <Text style={[styles.scheduleTagText, styles.scheduleTagCompleteText]}>
                    Klart
                  </Text>
                </View>
              ) : null}
              {showDefaultTag ? (
                <View style={[styles.scheduleTag, styles.scheduleTagDefault]}>
                  <Feather name="repeat" size={12} color={palette.secondaryText} />
                  <Text style={styles.scheduleTagText}>Standard</Text>
                </View>
              ) : null}
              {isMine && status === 'assigned' && onDecline && onComplete ? (
                <View style={styles.scheduleMineActions}>
                  <TouchableOpacity
                    style={styles.scheduleCantButton}
                    onPress={onDecline}
                    activeOpacity={0.85}
                  >
                    <Feather name="x" size={14} color={palette.secondaryText} />
                    <Text style={styles.scheduleCantLabel}>Kan inte</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scheduleManageButton, styles.scheduleCompleteButton]}
                    onPress={onComplete}
                    activeOpacity={0.85}
                  >
                    <Feather name="check" size={14} color={palette.inverseText} />
                    <Text style={[styles.scheduleManageLabel, styles.scheduleTakeLabel]}>
                      Klart
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : onTake ? (
                <TouchableOpacity
                  style={[styles.scheduleManageButton, styles.scheduleTakeButton]}
                  onPress={onTake}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={14} color={palette.inverseText} />
                  <Text style={[styles.scheduleManageLabel, styles.scheduleTakeLabel]}>Ta pass</Text>
                </TouchableOpacity>
              ) : onManage ? (
                <TouchableOpacity style={styles.scheduleManageButton} onPress={onManage} activeOpacity={0.85}>
                  <Feather name="edit-3" size={14} color={palette.primary} />
                  <Text style={styles.scheduleManageLabel}>Hantera</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function RidingDayRow({
  label,
  upcoming,
  isToday,
  onRegisterRide,
}: {
  label: string;
  upcoming?: string;
  isToday?: boolean;
  onRegisterRide?: () => void;
}) {
  return (
    <Card tone="muted" style={[styles.ridingRow, isToday && styles.ridingRowActive]}>
      <View>
        <Text style={[styles.ridingLabel, isToday ? styles.ridingLabelActive : undefined]}>
          {label}
        </Text>
        {upcoming ? <Text style={styles.ridingSubtitle}>{upcoming}</Text> : null}
      </View>
      {onRegisterRide ? (
        <TouchableOpacity style={styles.ridingRegisterButton} onPress={onRegisterRide}>
          <Feather name="plus" size={16} color={palette.inverseText} />
          <Text style={styles.ridingRegisterText}>Registrera ridpass</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function CompetitionCard({ event }: { event: CompetitionEvent }) {
  const statusLabel = event.status === 'open' ? 'ÖPPEN' : 'STÄNGD';
  const statusColor = event.status === 'open' ? palette.success : palette.error;

  return (
    <Card tone="muted" elevated style={styles.competitionCard}>
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
    </Card>
  );
}

function EmptyStateCard({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: EmptyStateAction[];
}) {
  return (
    <Card tone="muted" style={styles.emptyStateCard}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateBody}>{body}</Text>
      {actions?.length ? (
        <View style={styles.emptyStateActions}>
          {actions.map((action) => {
            const variant = action.variant ?? 'primary';
            const isPrimary = variant === 'primary';
            return (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.emptyStateAction,
                  isPrimary ? styles.emptyStatePrimary : styles.emptyStateSecondary,
                ]}
                onPress={action.onPress}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.emptyStateActionText,
                    isPrimary ? styles.emptyStatePrimaryText : styles.emptyStateSecondaryText,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort(
    (a, b) =>
      new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime(),
  );
}

function compareBookingTime(a: ArenaBooking, b: ArenaBooking) {
  return (
    new Date(`${a.date}T${a.startTime}`).getTime() -
    new Date(`${b.date}T${b.startTime}`).getTime()
  );
}

function formatShortDateLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date
    .toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace('.', '');
}

function formatClockTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

type MonthWeek = { weekNumber: number; start: string; days: Date[] };

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildMonthWeeks(date: Date): MonthWeek[] {
  const start = startOfWeek(startOfMonth(date));
  const end = endOfWeek(endOfMonth(date));
  const days: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: MonthWeek[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7);
    const weekStart = weekDays[0];
    weeks.push({
      weekNumber: getISOWeekNumber(weekStart),
      start: toISODate(weekStart),
      days: weekDays,
    });
  }

  return weeks;
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString('sv-SE', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay() || 7; // Monday = 1
  if (day !== 1) {
    result.setDate(result.getDate() - (day - 1));
  }
  return result;
}

function endOfWeek(start: Date) {
  const result = new Date(start);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + 6);
  return result;
}

function getISOWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatWeekRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  });
  const endLabel = end.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
  return `${startLabel}–${endLabel}`.replace('.', '');
}

function formatPassNote(note?: string, status?: AssignmentStatus) {
  if (!note) {
    return undefined;
  }

  let cleaned = note.trim();
  if (!cleaned) {
    return undefined;
  }

  if (status && status !== 'open') {
    cleaned = cleaned.replace(/saknas/gi, '').trim();
    cleaned = cleaned.replace(/^behöver\s+/i, '').trim();
  }

  return cleaned ? capitalizeWord(cleaned) : undefined;
}

function capitalizeWord(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveNoteColor(note: string) {
  const normalized = note.toLowerCase();
  if (normalized.includes('fodr')) {
    return statusColors.feeding;
  }
  if (normalized.includes('städ') || normalized.includes('mock')) {
    return statusColors.cleaning;
  }
  if (normalized.includes('ryttar')) {
    return statusColors.riderAway;
  }
  if (normalized.includes('farrier') || normalized.includes('hov')) {
    return statusColors.farrierAway;
  }
  if (normalized.includes('vet') || normalized.includes('veterin')) {
    return statusColors.vetAway ?? statusColors.farrierAway;
  }
  if (normalized.includes('kväll')) {
    return statusColors.evening;
  }
  return undefined;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    gap: 24,
    paddingTop: 10,
  },
  contentDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    padding: space.xs,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterRowDesktop: {
    justifyContent: 'flex-start',
    gap: 12,
    paddingHorizontal: space.md,
  },
  subFilterRow: {
    flexDirection: 'row',
    padding: space.xs,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subFilterRowDesktop: {
    justifyContent: 'flex-start',
    paddingHorizontal: space.md,
  },
  filterChip: {
    flex: 1,
    width: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  filterChipDesktop: {
    flex: 0,
    paddingHorizontal: 20,
  },
  subFilterChip: {
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFilterChipDesktop: {
    paddingHorizontal: 16,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  filterChipTextActive: {
    color: palette.inverseText,
  },
  subFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  subFilterTextActive: {
    color: palette.inverseText,
  },
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  legendCardDesktop: {
    justifyContent: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  legendDotFallback: {
    backgroundColor: palette.secondaryText,
  },
  legendLabel: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  monthSection: {
    gap: 16,
    paddingBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  monthWeekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  monthWeekHeaderLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  monthWeekHeaderWeekLabel: {
    flex: 0,
    width: 32,
  },
  monthGrid: {
    gap: 10,
  },
  monthWeekRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  monthWeekNumber: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  monthWeekNumberText: {
    fontSize: 11,
    color: palette.secondaryText,
    fontWeight: '600',
  },
  monthDayCell: {
    flex: 1,
    minHeight: 120,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 6,
  },
  monthDayCellMuted: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.borderMuted,
    opacity: 0.75,
  },
  monthDayCellToday: {
    borderColor: palette.primary,
    borderWidth: 1,
  },
  monthDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  monthDayNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  monthDayNumberMuted: {
    color: palette.secondaryText,
  },
  todayPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,108,246,0.12)',
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
  },
  monthEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthEventDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  monthEventMore: {
    fontSize: 10,
    color: palette.secondaryText,
  },
  monthAssignmentList: {
    gap: 6,
  },
  monthAssignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthSlotDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  monthAssignmentText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: palette.primaryText,
  },
  monthAssignmentOpen: {
    color: palette.primary,
  },
  monthAssignmentDone: {
    color: palette.secondaryText,
    textDecorationLine: 'line-through',
  },
  monthMoreText: {
    fontSize: 11,
    color: palette.secondaryText,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 4,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  listHeaderAction: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  listHeaderActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
  },
  weekButton: {
    width: 36,
    height: 36,
    backgroundColor: palette.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  weekButtonDisabled: {
    opacity: 0.6,
  },
  weekTitleBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  weekSubtitle: {
    fontSize: 12,
    color: palette.secondaryText,
    letterSpacing: 0.3,
  },
  scheduleList: {
    gap: 10,
  },
  scheduleListDesktop: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'flex-start',
  },
  emptyStateCard: {
    padding: space.lg,
    gap: 10,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  emptyStateBody: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
  emptyStateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  emptyStateAction: {
    flexGrow: 1,
    minWidth: 140,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStatePrimary: {
    backgroundColor: palette.primary,
  },
  emptyStatePrimaryText: {
    color: palette.inverseText,
    fontWeight: '700',
  },
  emptyStateSecondary: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  emptyStateSecondaryText: {
    color: palette.primaryText,
  },
  dayCard: {
    paddingHorizontal: space.lg,
    paddingVertical: 16,
    gap: 14,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayBadgeInactive: {
    backgroundColor: palette.surfaceMuted,
  },
  dayBadgeActive: {
    backgroundColor: palette.icon,
  },
  dayBadgeText: {
    fontSize: 14,
    color: palette.primaryText,
    fontWeight: '500',
  },
  dayBadgeTextActive: {
    color: palette.inverseText,
  },
  dayStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayEventRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  dayEventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayEventText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  dayStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dayStatusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
  dayStatusLabel: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  daySlots: {
    flexDirection: 'column',
    gap: 8,
  },
  scheduleIcon: {
    width: '100%',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  scheduleIconLast: {
    borderBottomWidth: 0,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    width: '100%',
  },
  scheduleContent: {
    flex: 1,
    gap: 6,
  },
  scheduleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleTitleBlock: {
    flex: 1,
    gap: 6,
  },
  scheduleBody: {
    flex: 1,
    gap: 8,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  scheduleTitleGroup: {
    flex: 1,
    gap: 8,
  },
  scheduleActionColumn: {
    alignItems: 'flex-end',
    gap: 10,
  },
  scheduleTime: {
    fontSize: 11,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: -0.1,
  },
  scheduleIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: color.text,
    letterSpacing: -0.2,
  },
  scheduleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  scheduleTagOpen: {
    backgroundColor: 'rgba(10,132,255,0.12)',
  },
  scheduleTagComplete: {
    backgroundColor: 'rgba(27,169,122,0.14)',
  },
  scheduleTagDefault: {
    backgroundColor: 'rgba(15,22,34,0.06)',
  },
  scheduleTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  scheduleTagOpenText: {
    color: palette.primary,
  },
  scheduleTagCompleteText: {
    color: palette.success,
  },
  scheduleAssigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleAssignee: {
    fontSize: 12,
    fontWeight: '500',
    color: color.text,
  },
  scheduleManageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(10,132,255,0.08)',
  },
  scheduleMineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleCantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15,22,34,0.06)',
  },
  scheduleCantLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  scheduleManageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
  scheduleTakeButton: {
    backgroundColor: palette.primary,
  },
  scheduleCompleteButton: {
    backgroundColor: palette.success,
  },
  scheduleTakeLabel: {
    color: palette.inverseText,
  },
  dayFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  dayStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 214, 10, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dayStatusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.warning,
  },
  dayActionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  dayActionButtonPrimary: {
    backgroundColor: palette.primary,
  },
  dayActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
    letterSpacing: -0.1,
  },
  dayActionLabelPrimary: {
    color: palette.inverseText,
  },
  ridingSection: {
    gap: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  sectionMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  sectionActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.inverseText,
  },
  ridingList: {
    gap: 14,
  },
  bookingGroups: {
    gap: 14,
  },
  bookingGroup: {
    gap: 10,
  },
  rideLogGroups: {
    gap: 14,
  },
  rideLogGroup: {
    gap: 10,
  },
  bookingDate: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
    letterSpacing: 0.3,
  },
  bookingList: {
    gap: 10,
  },
  rideLogList: {
    gap: 10,
  },
  bookingCard: {
    padding: space.lg,
    gap: 6,
  },
  rideLogCard: {
    padding: space.lg,
    gap: 6,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rideLogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  bookingInfo: {
    flex: 1,
    gap: 4,
  },
  rideLogInfo: {
    flex: 1,
    gap: 4,
  },
  bookingTime: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  rideLogHorse: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  bookingPurpose: {
    fontSize: 13,
    color: palette.primaryText,
  },
  rideLogMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  bookingMeta: {
    fontSize: 11,
    color: palette.secondaryText,
  },
  bookingNote: {
    fontSize: 12,
    color: palette.secondaryText,
    marginTop: 4,
  },
  bookingDelete: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  dayEventList: {
    gap: 10,
  },
  dayEventCard: {
    padding: space.lg,
  },
  dayEventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayEventToneDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  dayEventInfo: {
    flex: 1,
    gap: 4,
  },
  dayEventLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  dayEventMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  dayEventDelete: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  arenaStatusList: {
    gap: 10,
  },
  statusQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusQuickButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  statusQuickText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9,13,25,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalKeyboard: {
    width: '100%',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  modalField: {
    gap: 6,
  },
  modalHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalFieldFlex: {
    flex: 1,
    gap: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalGhostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  modalGhostText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  modalPrimaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  modalPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.inverseText,
  },
  toneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  selectorChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.surfaceTint,
  },
  selectorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  selectorChipTextActive: {
    color: palette.primaryText,
  },
  toneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  toneChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.surfaceTint,
  },
  toneLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  toneLabelActive: {
    color: palette.primaryText,
  },
  toneDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  ridingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.md,
    flexWrap: 'wrap',
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.lg,
  },
  ridingRowActive: {
    backgroundColor: palette.surfaceTint,
    borderColor: palette.primary,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  ridingRegisterText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.inverseText,
  },
  competitionSection: {
    gap: 16,
  },
  competitionCategory: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    gap: space.md,
    padding: space.lg,
    flexWrap: 'wrap',
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
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  competitionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
