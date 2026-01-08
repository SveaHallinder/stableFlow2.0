import type { Assignment } from '@/context/AppDataContext';

export type GroupedAssignmentDay = {
  isoDate: string;
  date: Date;
  assignments: Assignment[];
};

const SHORT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export function groupAssignmentsByDay(assignments: Assignment[]): GroupedAssignmentDay[] {
  const map = new Map<string, GroupedAssignmentDay>();

  assignments.forEach((assignment) => {
    const key = assignment.date;
    const date = getDateFromISO(key);
    const existing = map.get(key);

    if (existing) {
      existing.assignments.push(assignment);
    } else {
      map.set(key, {
        isoDate: key,
        date,
        assignments: [assignment],
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function formatShortWeekday(date: Date) {
  return SHORT_WEEKDAY_FORMATTER.format(date);
}

export function formatDayNumber(date: Date) {
  return date.getDate().toString();
}

export type DateOption = {
  label: string;
  value: string;
};

export function generateDateOptions(
  groupedDays: GroupedAssignmentDay[],
  options?: { count?: number; includeDates?: string[] },
): DateOption[] {
  const list: DateOption[] = [];
  const seen = new Set<string>();
  const count = options?.count ?? 5;

  const addDate = (date: Date) => {
    const value = toISODate(date);
    if (seen.has(value)) {
      return;
    }
    list.push({ label: formatOptionLabel(date), value });
    seen.add(value);
  };

  groupedDays.forEach((day) => {
    if (list.length >= count) {
      return;
    }
    addDate(day.date);
  });

  options?.includeDates?.forEach((isoDate) => {
    if (!isoDate) {
      return;
    }
    addDate(getDateFromISO(isoDate));
  });

  let cursor = new Date();
  while (list.length < count) {
    addDate(cursor);
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  return list.slice(0, count);
}

export function formatOptionLabel(date: Date) {
  return date.toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

export function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateFromISO(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`);
}
