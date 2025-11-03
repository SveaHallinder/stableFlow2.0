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
  type DateOption,
  toISODate,
} from '@/lib/schedule';
import { NewAssignmentModal } from '@/components/NewAssignmentModal';
import { useToast } from '@/components/ToastProvider';

const palette = theme.colors;
const radii = theme.radii;
const statusColors = theme.status;
const gradients = theme.gradients;

const filters = ['Regular', 'Riding', 'Competition'] as const;
type Filter = (typeof filters)[number];

type RegularSlotIcon = 'sun' | 'clock' | 'moon';

type RegularSlot = {
  id: string;
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
  assignedTo?: string;
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
  openAssignments: Assignment[];
  events: Array<{ id: string; label: string; color: string }>;
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

export default function CalendarScreen() {
  const { state, actions } = useAppData();
  const { assignments, users, ridingSchedule, competitionEvents, dayEvents, currentUserId } = state;
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
  const [activeFilter, setActiveFilter] = React.useState<Filter>('Regular');
  const [categoryIndex, setCategoryIndex] = React.useState(0);

  const groupedDays = React.useMemo(() => groupAssignmentsByDay(assignments), [assignments]);

  const dayEventsByDate = React.useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    dayEvents.forEach((event) => {
      if (!map.has(event.date)) {
        map.set(event.date, []);
      }
      map.get(event.date)!.push(event);
    });
    return map;
  }, [dayEvents]);

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
  const activeDays = activeWeek?.days ?? [];

  const regularDays = React.useMemo<RegularDayView[]>(() => {
    return activeDays.map((day, index) => {
      const sortedAssignments = sortAssignments(day.assignments);
      const eventsForDay = dayEventsByDate.get(day.isoDate) ?? [];
      const eventLabels = eventsForDay.map((event) => formatPassNote(event.label));

      const slots: RegularSlot[] = sortedAssignments.map((assignment) => {
        const formattedNote = formatPassNote(assignment.note, assignment.status);
        const noteHidden = formattedNote && eventLabels.includes(formattedNote);
        return {
          id: assignment.id,
          label: assignment.label,
          icon: slotIconMap[assignment.slot],
          color: slotColorMap[assignment.slot],
          note: noteHidden ? undefined : formattedNote,
          assignedTo: assignment.assigneeId
            ? users[assignment.assigneeId]?.name ?? undefined
            : undefined,
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
        selected: index === 0,
        slots,
        openAssignments: sortedAssignments.filter((assignment) => assignment.status === 'open'),
        events: dayEventViews,
      };
    });
  }, [activeDays, users, dayEventsByDate]);

  const selectedCategory = competitionCategories[categoryIndex];
  const weekHeading = activeWeek ? formatWeekHeading(activeWeek.start, activeWeek.end) : 'Veckoschema';
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

          {activeFilter === 'Regular' && (
            <Card tone="muted" style={styles.legendCard}>
              {legend.map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </Card>
          )}

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

          {activeFilter === 'Regular' && (
            <View style={styles.scheduleList}>
              {regularDays.map((day) => (
                <RegularDayCard
                  key={day.id}
                  day={day.day}
                  date={day.date}
                  isoDate={day.id}
                  selected={day.selected}
                  slots={day.slots}
                  openAssignments={day.openAssignments}
                  events={day.events}
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
                />
              ))}
            </View>
          )}

          {activeFilter === 'Riding' && (
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

          {activeFilter === 'Competition' && (
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
            assignmentModal.date ?? dateOptions[0]?.value ?? new Date().toISOString().split('T')[0];
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
  openAssignments,
  events,
  onClaimOpenAssignment,
  onCreateAssignment,
  onEditAssignment,
}: {
  day: string;
  date: string;
  isoDate: string;
  selected?: boolean;
  slots: RegularSlot[];
  openAssignments: Assignment[];
  events: Array<{ id: string; label: string; color: string }>;
  onClaimOpenAssignment?: (assignmentId?: string, fallback?: { date: string; slot?: AssignmentSlot }) => void;
  onCreateAssignment?: (defaults: { date: string; slot?: AssignmentSlot }) => void;
  onEditAssignment?: (assignmentId: string) => void;
}) {
  const openSlots = openAssignments.length;

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

  return (
    <Card tone="muted" elevated style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <View style={[styles.dayBadge, selected ? styles.dayBadgeActive : styles.dayBadgeInactive]}>
          <Text style={[styles.dayBadgeText, selected ? styles.dayBadgeTextActive : undefined]}>
            {day} {date}
          </Text>
        </View>
        <View style={styles.dayStatusGroup}>
          {openSlots > 0 ? (
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
        {slots.map((slot, index) => (
          <ScheduleIcon
            key={slot.id}
            label={slot.label}
            icon={slot.icon}
            color={slot.color}
            note={slot.note}
            assignedTo={slot.assignedTo}
            time={slot.time}
            isLast={index === slots.length - 1}
            status={slot.status}
            onAction={() => {
              if (slot.status === 'open') {
                onClaimOpenAssignment?.(slot.id, {
                  date: isoDate,
                  slot: slot.slotType,
                });
              } else {
                onEditAssignment?.(slot.id);
              }
            }}
          />
        ))}
      </View>
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
            {openSlots > 0 ? 'Ta pass' : 'Visa detaljer'}
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function ScheduleIcon({
  label,
  icon,
  color,
  note,
  assignedTo,
  time,
  isLast,
  status,
  onAction,
}: {
  label: string;
  icon: RegularSlotIcon;
  color: string;
  note?: string;
  assignedTo?: string;
  time?: string;
  isLast?: boolean;
  status: AssignmentStatus;
  onAction?: () => void;
}) {
  const noteColor = note ? resolveNoteColor(note) : undefined;
  const isOpen = status === 'open';

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
              ) : isOpen ? (
                <View style={[styles.scheduleTag, styles.scheduleTagOpen]}>
                  <Feather name="alert-circle" size={12} color={palette.primary} />
                  <Text style={[styles.scheduleTagText, styles.scheduleTagOpenText]}>
                    Ledigt pass
                  </Text>
                </View>
              ) : null}
              {onAction ? (
                <TouchableOpacity
                  style={[
                    styles.scheduleManageButton,
                    isOpen && styles.scheduleTakeButton,
                  ]}
                  onPress={onAction}
                >
                  <Feather
                    name={isOpen ? 'plus' : 'edit-3'}
                    size={14}
                    color={isOpen ? palette.inverseText : palette.primary}
                  />
                  <Text
                    style={[
                      styles.scheduleManageLabel,
                      isOpen && styles.scheduleTakeLabel,
                    ]}
                  >
                    {isOpen ? 'Ta pass' : 'Hantera'}
                  </Text>
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

function formatWeekHeading(start: Date, end: Date) {
  const week = getISOWeekNumber(start);
  return `Vecka ${week} · ${formatWeekRange(start, end)}`;
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
  filterChip: {
    flex: 1,
    width: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  filterChipTextActive: {
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
  scheduleTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  scheduleTagOpenText: {
    color: palette.primary,
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
  scheduleManageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
  scheduleTakeButton: {
    backgroundColor: palette.primary,
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
