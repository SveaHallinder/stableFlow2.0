import type {
  AlertMessage,
  AppDataState,
  Assignment,
  FeedCheck,
  FeedPlanItem,
  FeedSlot,
  Horse,
  HorseDayStatus,
  Paddock,
  PermissionSet,
  RideLogEntry,
  StableMembership,
} from '@/context/AppDataContext';

export type TodayMode = 'admin' | 'worker' | 'horseOwner' | 'reader';

export type FeedFocusItem = {
  horse: Horse;
  plan?: FeedPlanItem;
  fallback?: FeedPlanItem;
  check?: FeedCheck;
};

export type FeedFocus = {
  slot: FeedSlot;
  label: string;
  items: FeedFocusItem[];
  totalCount: number;
  checkedCount: number;
  deviationCount: number;
};

export const feedSlotLabels: Record<FeedSlot, string> = {
  morning: 'Morgonfoder',
  lunch: 'Lunchfoder',
  evening: 'Kvällsfoder',
};

export function getCurrentFeedSlot(now: Date = new Date()): FeedSlot {
  const hour = now.getHours();
  if (hour < 10) return 'morning';
  if (hour < 14) return 'lunch';
  return 'evening';
}

type DeriveFeedFocusInput = {
  state: AppDataState;
  currentStableId: string;
  todayIso: string;
  slot: FeedSlot;
  horseIds?: string[];
};

export function deriveFeedFocus({
  state,
  currentStableId,
  todayIso,
  slot,
  horseIds,
}: DeriveFeedFocusInput): FeedFocus {
  const stablePlans = state.feedPlans.filter(
    (plan) => plan.stableId === currentStableId && plan.slot === slot && plan.active,
  );
  const fallback = stablePlans.find((plan) => plan.isStableDefault && !plan.horseId);
  const stableHorses = state.horses.filter((horse) => horse.stableId === currentStableId);
  const filteredHorses = horseIds
    ? stableHorses.filter((horse) => horseIds.includes(horse.id))
    : stableHorses;

  const items = filteredHorses.map<FeedFocusItem>((horse) => {
    const override = stablePlans.find(
      (plan) => !plan.isStableDefault && plan.horseId === horse.id,
    );
    const check = state.feedChecks.find(
      (entry) =>
        entry.stableId === currentStableId &&
        entry.horseId === horse.id &&
        entry.date === todayIso &&
        entry.slot === slot,
    );
    return {
      horse,
      plan: override ?? fallback,
      fallback,
      check,
    };
  });

  const checkedCount = items.filter((item) => Boolean(item.check?.checkedAt)).length;
  const deviationCount = items.filter((item) => Boolean(item.check?.deviationNote)).length;

  return {
    slot,
    label: feedSlotLabels[slot],
    items,
    totalCount: items.length,
    checkedCount,
    deviationCount,
  };
}

export type TodayInsight = {
  id: string;
  label: string;
  value: string;
  meta: string;
  tone?: 'default' | 'warning' | 'success';
};

export type TodayHorseSummary = {
  horse: Horse;
  status?: HorseDayStatus;
  paddock?: Paddock;
  latestRide?: RideLogEntry;
  gaps: string[];
};

export type TodayOverview = {
  mode: TodayMode;
  headline: string;
  subheadline: string;
  noStableData: boolean;
  permissionNote?: string;
  myTasksToday: Assignment[];
  openTasksToday: Assignment[];
  overdueTasks: Assignment[];
  importantAlerts: AlertMessage[];
  horseStatusGaps: TodayHorseSummary[];
  myHorseSummaries: TodayHorseSummary[];
  insights: TodayInsight[];
};

type DeriveTodayOverviewInput = {
  state: AppDataState;
  currentUserId: string;
  currentStableId: string;
  todayIso: string;
  membership?: StableMembership;
  permissions: PermissionSet;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

function findPaddockForHorse(paddocks: Paddock[], horse: Horse) {
  const horseName = normalizeName(horse.name);
  return paddocks.find((paddock) =>
    paddock.horseNames.some((name) => normalizeName(name) === horseName),
  );
}

function findLatestRide(rideLogs: RideLogEntry[], horseId: string) {
  return rideLogs
    .filter((log) => log.horseId === horseId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getHorseGaps(status: HorseDayStatus | undefined, paddock: Paddock | undefined) {
  const gaps: string[] = [];
  if (!status) {
    gaps.push('dagstatus');
    gaps.push('foder');
  } else {
    if (!status.hay) gaps.push('foder');
    if (!status.water) gaps.push('vatten');
    if (!status.checked) gaps.push('koll');
  }
  if (!paddock) {
    gaps.push('hage');
  }
  return gaps;
}

function makeHorseSummary(
  horse: Horse,
  statuses: HorseDayStatus[],
  paddocks: Paddock[],
  rideLogs: RideLogEntry[],
) {
  const status = statuses.find((entry) => entry.horseId === horse.id);
  const paddock = findPaddockForHorse(paddocks, horse);
  const latestRide = findLatestRide(rideLogs, horse.id);

  return {
    horse,
    status,
    paddock,
    latestRide,
    gaps: getHorseGaps(status, paddock),
  };
}

function resolveTodayMode(
  permissions: PermissionSet,
  membership: StableMembership | undefined,
  myHorseSummaries: TodayHorseSummary[],
  currentUserId: string,
): TodayMode {
  if (permissions.canManageOnboarding || membership?.access === 'owner') {
    return 'admin';
  }
  if (
    membership?.riderRole === 'owner' ||
    myHorseSummaries.some((summary) => summary.horse.ownerUserId === currentUserId)
  ) {
    return 'horseOwner';
  }
  if (membership?.role === 'staff' || membership?.role === 'rider' || permissions.canClaimAssignments) {
    return 'worker';
  }
  return 'reader';
}

export function deriveTodayOverview({
  state,
  currentUserId,
  currentStableId,
  todayIso,
  membership,
  permissions,
}: DeriveTodayOverviewInput): TodayOverview {
  const stableAssignments = state.assignments.filter(
    (assignment) => assignment.stableId === currentStableId,
  );
  const todayAssignments = stableAssignments.filter((assignment) => assignment.date === todayIso);
  const myTasksToday = todayAssignments.filter(
    (assignment) => assignment.assigneeId === currentUserId && assignment.status !== 'open',
  );
  const openTasksToday = todayAssignments.filter((assignment) => assignment.status === 'open');
  const overdueTasks = stableAssignments.filter(
    (assignment) => assignment.date < todayIso && assignment.status !== 'completed',
  );
  const incompleteToday = todayAssignments.filter((assignment) => assignment.status !== 'completed');
  const stableAlerts = state.alerts.filter((alert) => alert.stableId === currentStableId);
  const importantAlerts = stableAlerts
    .filter((alert) => alert.type === 'critical')
    .concat(stableAlerts.filter((alert) => alert.type !== 'critical'))
    .slice(0, 3);
  const stableHorses = state.horses.filter((horse) => horse.stableId === currentStableId);
  const stablePaddocks = state.paddocks.filter((paddock) => paddock.stableId === currentStableId);
  const todayStatuses = state.horseDayStatuses.filter(
    (status) => status.stableId === currentStableId && status.date === todayIso,
  );
  const stableRideLogs = state.rideLogs.filter((log) => log.stableId === currentStableId);
  const currentUser = state.users[currentUserId];
  const linkedHorseIds = new Set([
    ...(currentUser?.horses ?? []),
    ...(membership?.horseIds ?? []),
  ]);
  const myHorses = stableHorses.filter(
    (horse) => horse.ownerUserId === currentUserId || linkedHorseIds.has(horse.id),
  );
  const horseSummaries = stableHorses.map((horse) =>
    makeHorseSummary(horse, todayStatuses, stablePaddocks, stableRideLogs),
  );
  const myHorseSummaries = myHorses.map((horse) =>
    makeHorseSummary(horse, todayStatuses, stablePaddocks, stableRideLogs),
  );
  const horseStatusGaps = horseSummaries.filter((summary) => summary.gaps.length > 0);
  const myHorseGaps = myHorseSummaries.filter((summary) => summary.gaps.length > 0);
  const mode = resolveTodayMode(permissions, membership, myHorseSummaries, currentUserId);
  const noStableData = !currentStableId || (stableAssignments.length === 0 && stableHorses.length === 0);
  const canDoDailyActions =
    permissions.canManageAssignments ||
    permissions.canClaimAssignments ||
    permissions.canCompleteAssignments ||
    permissions.canUpdateHorseStatus ||
    permissions.canManageDayEvents;
  const permissionNote =
    !canDoDailyActions
      ? 'Du kan läsa detta, men inte ändra.'
      : undefined;

  if (mode === 'admin') {
    return {
      mode,
      headline: 'Stallstatus först',
      subheadline: 'Fokus på luckor, ej klart och saker som behöver ansvar.',
      noStableData,
      permissionNote,
      myTasksToday,
      openTasksToday,
      overdueTasks,
      importantAlerts,
      horseStatusGaps,
      myHorseSummaries,
      insights: [
        {
          id: 'stable-status',
          label: 'Stallstatus',
          value: `${todayAssignments.length - incompleteToday.length}/${todayAssignments.length}`,
          meta: todayAssignments.length ? 'Pass klara idag' : 'Slutför setup för att se dagens stallstatus.',
          tone: todayAssignments.length && incompleteToday.length === 0 ? 'success' : 'default',
        },
        {
          id: 'open',
          label: 'Saknar ansvarig',
          value: `${openTasksToday.length}`,
          meta: openTasksToday.length ? 'Behöver täckas idag' : 'Alla pass har ansvarig.',
          tone: openTasksToday.length ? 'warning' : 'success',
        },
        {
          id: 'incomplete',
          label: 'Ej klart',
          value: `${incompleteToday.length + overdueTasks.length}`,
          meta: overdueTasks.length ? `${overdueTasks.length} försenade` : 'Inget försenat just nu.',
          tone: incompleteToday.length || overdueTasks.length ? 'warning' : 'success',
        },
        {
          id: 'horse-gaps',
          label: 'Foder/hage saknas',
          value: `${horseStatusGaps.length}`,
          meta: horseStatusGaps.length ? 'Hästar med luckor idag' : 'Häststatus ser komplett ut.',
          tone: horseStatusGaps.length ? 'warning' : 'success',
        },
        {
          id: 'alerts',
          label: 'Alerts',
          value: `${importantAlerts.length}`,
          meta: importantAlerts[0]?.message ?? 'Inga viktiga alerts.',
          tone: importantAlerts.length ? 'warning' : 'success',
        },
      ],
    };
  }

  if (mode === 'horseOwner') {
    const latestRide = myHorseSummaries.find((summary) => summary.latestRide)?.latestRide;
    return {
      mode,
      headline: 'Dina hästar först',
      subheadline: 'Fokus på foder, hage, status och senaste ridning/vård.',
      noStableData,
      permissionNote,
      myTasksToday,
      openTasksToday,
      overdueTasks,
      importantAlerts,
      horseStatusGaps: myHorseGaps,
      myHorseSummaries,
      insights: [
        {
          id: 'my-horses',
          label: 'Mina hästar',
          value: `${myHorseSummaries.length}`,
          meta: myHorseSummaries.length ? 'Kopplade till dig' : 'Du har ingen häst kopplad ännu.',
        },
        {
          id: 'my-horse-gaps',
          label: 'Foder/status/hage',
          value: `${myHorseGaps.length}`,
          meta: myHorseGaps.length ? 'Saker att kontrollera idag' : 'Allt ser ifyllt ut idag.',
          tone: myHorseGaps.length ? 'warning' : 'success',
        },
        {
          id: 'care',
          label: 'Ridning/vård',
          value: latestRide?.date ? '1' : '0',
          meta: latestRide?.date ? `Senast loggat ${latestRide.date}` : 'Ingen ridning/vård loggad ännu.',
        },
        {
          id: 'alerts',
          label: 'Alerts',
          value: `${importantAlerts.length}`,
          meta: importantAlerts[0]?.message ?? 'Inga viktiga alerts.',
          tone: importantAlerts.length ? 'warning' : 'success',
        },
      ],
    };
  }

  if (mode === 'worker') {
    const nextTask = myTasksToday
      .filter((assignment) => assignment.status !== 'completed')
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    return {
      mode,
      headline: 'Dina uppgifter först',
      subheadline: 'Fokus på vad du ska göra nu, vad som är ledigt och viktiga alerts.',
      noStableData,
      permissionNote,
      myTasksToday,
      openTasksToday,
      overdueTasks,
      importantAlerts,
      horseStatusGaps,
      myHorseSummaries,
      insights: [
        {
          id: 'my-tasks',
          label: 'Mina uppgifter',
          value: `${myTasksToday.length}`,
          meta: myTasksToday.length ? 'På dig idag' : 'Inget att göra just nu.',
          tone: myTasksToday.length ? 'default' : 'success',
        },
        {
          id: 'next-task',
          label: 'Nästa pass',
          value: nextTask?.time ?? '—',
          meta: nextTask?.label ?? 'Inget att göra just nu.',
        },
        {
          id: 'open',
          label: 'Lediga pass',
          value: `${openTasksToday.length}`,
          meta: openTasksToday.length ? 'Kan tas idag' : 'Inga lediga pass idag.',
        },
        {
          id: 'alerts',
          label: 'Alerts',
          value: `${importantAlerts.length}`,
          meta: importantAlerts[0]?.message ?? 'Inga viktiga alerts.',
          tone: importantAlerts.length ? 'warning' : 'success',
        },
      ],
    };
  }

  return {
    mode,
    headline: 'Läsbar stallstatus',
    subheadline: 'Du ser det viktigaste, men vissa åtgärder kräver högre behörighet.',
    noStableData,
    permissionNote,
    myTasksToday,
    openTasksToday,
    overdueTasks,
    importantAlerts,
    horseStatusGaps,
    myHorseSummaries,
    insights: [
      {
        id: 'stable-status',
        label: 'Stallstatus',
        value: `${todayAssignments.length}`,
        meta: todayAssignments.length ? 'Pass idag' : 'Inget att göra just nu.',
      },
      {
        id: 'horses',
        label: 'Hästar',
        value: `${stableHorses.length}`,
        meta: stableHorses.length ? 'I valt stall' : 'Du har ingen häst kopplad ännu.',
      },
      {
        id: 'alerts',
        label: 'Alerts',
        value: `${importantAlerts.length}`,
        meta: importantAlerts[0]?.message ?? 'Inga viktiga alerts.',
      },
    ],
  };
}
