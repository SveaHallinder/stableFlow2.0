import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { theme } from '@/components/theme';
import { Card, Pill } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { color, radius, space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import type {
  Assignment,
  AssignmentStatus,
  AssignmentSlot,
  CompetitionEvent,
  CreateAssignmentInput,
  DayEvent,
  DayEventTone,
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

const filters = ['Pass', 'Riddagar', 'Tävling'] as const;
type Filter = (typeof filters)[number];

type PassView = 'all' | 'mine' | 'open';

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

const legend = [
  { label: 'Fodring saknas', color: statusColors.feeding },
  { label: 'Städning/Mockning', color: statusColors.cleaning },
  { label: 'Ryttare bortrest', color: statusColors.riderAway },
  { label: 'Farrier bortrest', color: statusColors.farrierAway },
  { label: 'Kvällspass', color: statusColors.evening },
];

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
  evening: statusColors.evening,
  info: palette.secondaryText,
};

const competitionCategories = ['Endurance', 'Dressage'] as const;

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
  const { state, actions } = useAppData();
  const { assignments, users, ridingSchedule, competitionEvents, dayEvents, currentUserId, currentStableId } = state;
  const { view } = useLocalSearchParams<{ view?: string | string[] }>();
  const [assignmentModal, setAssignmentModal] = React.useState<{
    visible: boolean;
    mode: 'create' | 'edit';
    assignmentId?: string;
    date?: string;
    slot?: AssignmentSlot;
    note?: string;
    assignToMe?: boolean;
  }>({ visible: false, mode: 'create' });
  const toast = useToast();
  const [activeFilter, setActiveFilter] = React.useState<Filter>('Pass');
  const [passView, setPassView] = React.useState<PassView>(() => resolvePassView(view));
  const [categoryIndex, setCategoryIndex] = React.useState(0);

  const activeAssignments = React.useMemo(
    () => assignments.filter((assignment) => assignment.stableId === currentStableId),
    [assignments, currentStableId],
  );
  const activeDayEvents = React.useMemo(
    () => dayEvents.filter((event) => event.stableId === currentStableId),
    [dayEvents, currentStableId],
  );

  const groupedDays = React.useMemo(() => groupAssignmentsByDay(activeAssignments), [activeAssignments]);

  React.useEffect(() => {
    setPassView(resolvePassView(view));
  }, [view]);

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
      visiblePassDays.find((day) => day.isoDate === todayIso)?.isoDate ??
      visiblePassDays[0]?.isoDate;

    return visiblePassDays.map((day) => {
      const sortedAssignments = sortAssignments(day.assignments);
      const weekdayIndex = weekdayIndexFromDate(day.date);
      const eventsForDay = dayEventsByDate.get(day.isoDate) ?? [];
      const eventLabels = eventsForDay.map((event) => formatPassNote(event.label));

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

      const dayEventViews = eventsForDay.map((event) => ({
        id: event.id,
        label: formatPassNote(event.label) ?? event.label,
        color: dayEventColorMap[event.tone] ?? palette.secondaryText,
      }));

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
  }, [visiblePassDays, users, dayEventsByDate, currentUserId, todayIso]);

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

  const handleCreateSlot = React.useCallback(() => {
    setAssignmentModal({ visible: true, mode: 'create' });
  }, []);

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
        note: assignment.note,
        assignToMe: assignment.assigneeId === currentUserId && assignment.status === 'assigned',
      });
    },
    [assignments, currentUserId, toast],
  );

  const handleRegisterRide = React.useCallback(() => {
    toast.showToast('Bokning av ridpass från appen är på väg.', 'info');
  }, [toast]);

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

  return (
    <LinearGradient colors={gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={styles.pageHeader}
          title="Schema"
          primaryActionLabel="Nytt pass"
          onPressPrimaryAction={handleCreateSlot}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Card tone="muted" style={styles.filterRow}>
            {filters.map((label) => {
              const active = label === activeFilter;
              return (
                <TouchableOpacity key={label} onPress={() => setActiveFilter(label)}>
                  <Pill active={active} style={styles.filterChip}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {label}
                    </Text>
                  </Pill>
                </TouchableOpacity>
              );
            })}
          </Card>

          {activeFilter === 'Pass' && (
            <Card tone="muted" style={styles.subFilterRow}>
              {passViewOptions.map((option) => {
                const active = option.id === passView;
                return (
                  <TouchableOpacity key={option.id} onPress={() => setPassView(option.id)}>
                    <Pill active={active} style={styles.subFilterChip}>
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
            <Card tone="muted" style={styles.legendCard}>
              {legend.map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </Card>
          )}

          {activeFilter === 'Pass' && passView === 'all' ? (
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

          {activeFilter === 'Pass' && (
            <View style={styles.scheduleList}>
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
                  onClaimOpenAssignment={handleClaimAssignment}
                  onCreateAssignment={(defaults) =>
                    setAssignmentModal({
                      visible: true,
                      mode: 'create',
                      date: defaults.date,
                      slot: defaults.slot,
                      note: 'Behöver bemanning',
                    })
                  }
                  onEditAssignment={handleEditAssignment}
                  onDeclineAssignment={handleDeclineAssignment}
                  onCompleteAssignment={handleCompleteAssignment}
                />
              ))}
              {visibleRegularDays.length === 0 ? (
                <Text style={styles.emptyStateText}>
                  {passView === 'mine'
                    ? 'Du har inga pass på dig kommande dagar.'
                    : passView === 'open'
                      ? 'Inga lediga pass kommande dagar.'
                      : 'Inga pass att visa.'}
                </Text>
              ) : null}
            </View>
          )}

          {activeFilter === 'Riddagar' && (
            <View style={styles.ridingList}>
              {ridingSchedule.map((day) => (
                <RidingDayRow
                  key={day.id}
                  label={day.label}
                  upcoming={day.upcomingRides}
                  isToday={day.isToday}
                  onRegisterRide={handleRegisterRide}
                />
              ))}
            </View>
          )}

          {activeFilter === 'Tävling' && (
            <View style={styles.competitionSection}>
              <TouchableOpacity style={styles.competitionCategory} onPress={handleCategoryToggle}>
                <Text style={styles.competitionCategoryText}>{selectedCategory}</Text>
                <Feather name="chevron-down" size={14} color={palette.icon} />
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
              note: input.noteProvided
                ? (input.note && input.note.length > 0 ? input.note : '')
                : undefined,
              assignToCurrentUser: assignChanged ? resolvedAssign : undefined,
            });
          } else {
            handleCreateAssignment({
              date: resolvedDate,
              slot: resolvedSlot,
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
      onClaimOpenAssignment?.(openAssignments[0]?.id, {
        date: isoDate,
        slot: openAssignments[0]?.slot,
      });
    } else {
      onCreateAssignment?.({
        date: isoDate,
        slot: slots[0]?.slotType,
      });
    }
  };

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
  onRegisterRide: () => void;
}) {
  return (
    <Card tone="muted" style={[styles.ridingRow, isToday && styles.ridingRowActive]}>
      <View>
        <Text style={[styles.ridingLabel, isToday ? styles.ridingLabelActive : undefined]}>
          {label}
        </Text>
        {upcoming ? <Text style={styles.ridingSubtitle}>{upcoming}</Text> : null}
      </View>
      <TouchableOpacity style={styles.ridingRegisterButton} onPress={onRegisterRide}>
        <Feather name="plus" size={16} color={palette.inverseText} />
        <Text style={styles.ridingRegisterText}>Registrera ridpass</Text>
      </TouchableOpacity>
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

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort(
    (a, b) =>
      new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime(),
  );
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
  pageHeader: {
    marginBottom: 0,
  },
  filterRow: {
    flexDirection: 'row',
    padding: space.xs,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subFilterRow: {
    flexDirection: 'row',
    padding: space.xs,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    width: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  subFilterChip: {
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyStateText: {
    textAlign: 'center',
    fontSize: 13,
    color: palette.secondaryText,
    paddingVertical: 18,
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
  ridingList: {
    gap: 14,
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
