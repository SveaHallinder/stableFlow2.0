import React from 'react';
import type { PropsWithChildren } from 'react';
import type { ImageSourcePropType } from 'react-native';

export type AssignmentStatus = 'open' | 'assigned' | 'completed';
export type AssignmentSlot = 'Morning' | 'Lunch' | 'Evening';
export type AssignmentIcon = 'sun' | 'clock' | 'moon';

// Monday-first index (0 = Monday, 6 = Sunday)
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DefaultPass = {
  weekday: WeekdayIndex;
  slot: AssignmentSlot;
};

export type AssignmentAssignedVia = 'default' | 'manual';

export type Assignment = {
  id: string;
  date: string; // ISO date string e.g. 2025-03-10
  label: string;
  slot: AssignmentSlot;
  icon: AssignmentIcon;
  time: string;
  note?: string;
  status: AssignmentStatus;
  assigneeId?: string;
  completedAt?: string;
  assignedVia?: AssignmentAssignedVia;
  declinedByUserIds?: string[];
};

export type CreateAssignmentInput = {
  date: string;
  slot: AssignmentSlot;
  time?: string;
  note?: string;
  assignToCurrentUser?: boolean;
  labelOverride?: string;
};

export type UpdateAssignmentInput = {
  id: string;
  date?: string;
  slot?: AssignmentSlot;
  time?: string;
  note?: string;
  assignToCurrentUser?: boolean;
  labelOverride?: string;
};

export type AlertMessage = {
  id: string;
  message: string;
  type: 'critical' | 'info';
  createdAt: string;
};

export type MessagePreview = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  timeAgo: string;
  unreadCount?: number;
  group?: boolean;
  avatar?: ImageSourcePropType;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  timestamp: string;
  status?: 'delivered' | 'sent' | 'seen';
};

export type Post = {
  id: string;
  author: string;
  avatar: ImageSourcePropType;
  timeAgo: string;
  content?: string;
  image?: string;
  likes: number;
  comments: number;
};

export type RidingDay = {
  id: string;
  label: string;
  upcomingRides?: string;
  isToday?: boolean;
};

export type CompetitionEvent = {
  id: string;
  start: string;
  end: string;
  title: string;
  status: 'open' | 'closed';
};

export type PaddockImage = {
  uri: string;
  base64?: string;
  mimeType?: string;
};

export type Paddock = {
  id: string;
  name: string;
  horseNames: string[];
  image?: PaddockImage;
  updatedAt: string;
};

type AwayNotice = {
  id: string;
  start: string;
  end: string;
  note: string;
};

export type DayEventTone =
  | 'feeding'
  | 'cleaning'
  | 'riderAway'
  | 'farrierAway'
  | 'evening'
  | 'info';

export type DayEvent = {
  id: string;
  date: string;
  label: string;
  tone: DayEventTone;
};

export type UserProfile = {
  id: string;
  name: string;
  horses: string[];
  location: string;
  phone: string;
  responsibilities: string[];
  defaultPasses: DefaultPass[];
  awayNotices: AwayNotice[];
  avatar?: ImageSourcePropType;
};

export type UpsertPaddockInput = {
  id?: string;
  name: string;
  horseNames: string[];
  image?: PaddockImage | null;
};

type AppDataState = {
  currentUserId: string;
  users: Record<string, UserProfile>;
  alerts: AlertMessage[];
  assignments: Assignment[];
  assignmentHistory: Array<{
    id: string;
    assignmentId: string;
    label: string;
    timestamp: string;
    action: 'created' | 'completed' | 'assigned' | 'declined';
  }>;
  messages: MessagePreview[];
  conversations: Record<string, ConversationMessage[]>;
  posts: Post[];
  ridingSchedule: RidingDay[];
  competitionEvents: CompetitionEvent[];
  dayEvents: DayEvent[];
  paddocks: Paddock[];
};

type AssignmentUpdateAction = {
  type: 'ASSIGNMENT_UPDATE';
  payload: { id: string; updates: Partial<Assignment>; silent?: boolean };
};

type AssignmentAddAction = {
  type: 'ASSIGNMENT_ADD';
  payload: Assignment;
};

type AssignmentHistoryPushAction = {
  type: 'ASSIGNMENT_HISTORY_PUSH';
  payload: {
    assignmentId: string;
    label: string;
    action: 'created' | 'completed' | 'assigned' | 'declined';
  };
};

type AssignmentRemoveAction = {
  type: 'ASSIGNMENT_REMOVE';
  payload: { id: string };
};

type AddAlertAction = {
  type: 'ALERT_ADD';
  payload: AlertMessage;
};

type MarkMessageReadAction = {
  type: 'MESSAGE_MARK_READ';
  payload: { id: string };
};

type AppendConversationMessageAction = {
  type: 'CONVERSATION_APPEND';
  payload: { conversationId: string; message: ConversationMessage; preview: MessagePreview };
};

type UserUpdateAction = {
  type: 'USER_UPDATE';
  payload: { id: string; updates: Partial<UserProfile> };
};

type PaddockUpsertAction = {
  type: 'PADDOCK_UPSERT';
  payload: Paddock;
};

type PaddockDeleteAction = {
  type: 'PADDOCK_DELETE';
  payload: { id: string };
};

type AppDataAction =
  | AssignmentUpdateAction
  | AssignmentAddAction
  | AssignmentHistoryPushAction
  | AssignmentRemoveAction
  | AddAlertAction
  | MarkMessageReadAction
  | AppendConversationMessageAction
  | UserUpdateAction
  | PaddockUpsertAction
  | PaddockDeleteAction;

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; reason: string };

type AppDataContextValue = {
  state: AppDataState;
  derived: {
    summary: {
      total: number;
      completed: number;
      open: number;
      alerts: number;
      openSlotLabels: string[];
      nextUpdateLabel: string;
    };
    loggableAssignment?: Assignment;
    claimableAssignment?: Assignment;
    upcomingAssignmentsForUser: Assignment[];
    nextAssignmentForUser?: Assignment;
    recentActivities: AppDataState['assignmentHistory'];
  };
  actions: {
    logNextAssignment: () => ActionResult<Assignment>;
    claimNextOpenAssignment: () => ActionResult<Assignment>;
    claimAssignment: (assignmentId: string) => ActionResult<Assignment>;
    createAssignment: (input: CreateAssignmentInput) => ActionResult<Assignment>;
    updateAssignment: (input: UpdateAssignmentInput) => ActionResult<Assignment>;
    deleteAssignment: (assignmentId: string) => ActionResult;
    addEvent: (message: string, type?: AlertMessage['type']) => ActionResult<AlertMessage>;
    toggleDefaultPass: (weekday: WeekdayIndex, slot: AssignmentSlot) => ActionResult<UserProfile>;
    upsertPaddock: (input: UpsertPaddockInput) => ActionResult<Paddock>;
    deletePaddock: (paddockId: string) => ActionResult;
    markConversationRead: (conversationId: string) => void;
    sendConversationMessage: (conversationId: string, text: string) => ActionResult<ConversationMessage>;
  };
};

const AppDataContext = React.createContext<AppDataContextValue | undefined>(undefined);

const initialState: AppDataState = {
  currentUserId: 'user-jane',
  users: {
    'user-jane': {
      id: 'user-jane',
      name: 'Jane Doe',
      horses: ['Cinder', 'Kanel'],
      location: 'Täby, Stockholm',
      phone: '+46 70-000 00 00',
      responsibilities: ['Foder', 'Kvällspass'],
      defaultPasses: [
        { weekday: 0, slot: 'Morning' },
        { weekday: 0, slot: 'Evening' },
      ],
      awayNotices: [
        { id: 'away-1', start: '2025-03-13', end: '2025-03-14', note: 'Träningsläger med Cinder' },
        { id: 'away-2', start: '2025-03-22', end: '2025-03-22', note: 'Semester' },
      ],
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
    'user-karl': {
      id: 'user-karl',
      name: 'Karl Johansson',
      horses: ['Atlas'],
      location: 'Täby, Stockholm',
      phone: '+46 72-111 11 11',
      responsibilities: ['Lunchpass'],
      defaultPasses: [{ weekday: 0, slot: 'Lunch' }],
      awayNotices: [],
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
  },
  alerts: [
    {
      id: 'alert-1',
      message: 'Ingen parkering vid containern idag.',
      type: 'critical',
      createdAt: '2025-03-08T06:30:00Z',
    },
  ],
  assignments: [
    {
      id: 'assign-1',
      date: '2025-03-10',
      label: 'Morgon',
      slot: 'Morning',
      icon: 'sun',
      time: '07:00',
      note: 'Fodring saknas',
      status: 'assigned',
      assigneeId: 'user-jane',
    },
    {
      id: 'assign-2',
      date: '2025-03-10',
      label: 'Lunch',
      slot: 'Lunch',
      icon: 'clock',
      time: '12:00',
      note: 'Kolla utevistelse',
      status: 'assigned',
      assigneeId: 'user-karl',
    },
    {
      id: 'assign-3',
      date: '2025-03-10',
      label: 'Kväll',
      slot: 'Evening',
      icon: 'moon',
      time: '18:00',
      note: 'Hö påfyllning',
      status: 'assigned',
      assigneeId: 'user-jane',
    },
    {
      id: 'assign-4',
      date: '2025-03-11',
      label: 'Morgon',
      slot: 'Morning',
      icon: 'sun',
      time: '07:00',
      note: 'Hage byte',
      status: 'assigned',
      assigneeId: 'user-karl',
    },
    {
      id: 'assign-5',
      date: '2025-03-11',
      label: 'Lunch',
      slot: 'Lunch',
      icon: 'clock',
      time: '12:00',
      note: 'Behöver ansvarig',
      status: 'open',
    },
    {
      id: 'assign-6',
      date: '2025-03-11',
      label: 'Kväll',
      slot: 'Evening',
      icon: 'moon',
      time: '18:00',
      note: 'Stretch av hästar',
      status: 'assigned',
      assigneeId: 'user-karl',
    },
    {
      id: 'assign-7',
      date: '2025-03-12',
      label: 'Morgon',
      slot: 'Morning',
      icon: 'sun',
      time: '07:00',
      status: 'assigned',
      assigneeId: 'user-jane',
    },
    {
      id: 'assign-8',
      date: '2025-03-12',
      label: 'Lunch',
      slot: 'Lunch',
      icon: 'clock',
      time: '12:00',
      note: 'Hovslagare bortrest',
      status: 'open',
    },
    {
      id: 'assign-9',
      date: '2025-03-12',
      label: 'Kväll',
      slot: 'Evening',
      icon: 'moon',
      time: '18:00',
      status: 'assigned',
      assigneeId: 'user-jane',
    },
  ],
  assignmentHistory: [],
  messages: [
    {
      id: 'group-1',
      title: 'Fodergruppen',
      subtitle: 'Karl',
      description: 'Kan någon dubbla kvällsmaten på torsdag?',
      timeAgo: '30 min',
      unreadCount: 2,
      group: true,
    },
    {
      id: 'person-1',
      title: 'Ida Magnusson',
      subtitle: '1h sedan',
      description: 'Hej! Har du möjlighet att...',
      timeAgo: '1h',
      unreadCount: 0,
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
    {
      id: 'person-2',
      title: 'Samuel Hall',
      subtitle: '2h sedan',
      description: 'Glöm inte täcket ikväll!',
      timeAgo: '2h',
      unreadCount: 0,
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
  ],
  conversations: {
    'group-1': [
      {
        id: 'group-1-msg-1',
        conversationId: 'group-1',
        authorId: 'user-karl',
        text: 'Kan någon dubbla kvällsmaten på torsdag?',
        timestamp: '2025-03-08T15:00:00Z',
      },
      {
        id: 'group-1-msg-2',
        conversationId: 'group-1',
        authorId: 'user-jane',
        text: 'Det kan jag fixa!',
        timestamp: '2025-03-08T15:05:00Z',
        status: 'delivered',
      },
    ],
    'person-1': [
      {
        id: 'person-1-msg-1',
        conversationId: 'person-1',
        authorId: 'person-1',
        text: 'Hej! Har du möjlighet att hjälpa mig på fredag?',
        timestamp: '2025-03-08T14:20:00Z',
      },
    ],
  },
  posts: [
    {
      id: 'post-1',
      author: 'Ida Magnusson',
      avatar: require('@/assets/images/dummy-avatar.png'),
      timeAgo: '1h',
      content: 'Glöm inte att mockningen i Stall B ska vara klar innan lunch i morgon.',
      likes: 8,
      comments: 1,
    },
    {
      id: 'post-2',
      author: 'Ida Magnusson',
      avatar: require('@/assets/images/dummy-avatar.png'),
      timeAgo: '2h',
      content: 'Vilken kväll! Härlig uteritt med gänget.',
      image: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
      likes: 12,
      comments: 3,
    },
  ],
  ridingSchedule: [
    { id: 'ride-1', label: 'Tue 10', upcomingRides: 'Dressyr · 18:30', isToday: true },
    { id: 'ride-2', label: 'Wed 11', upcomingRides: 'Ridhus bokat 17:00' },
    { id: 'ride-3', label: 'Thu 12', upcomingRides: 'Uteritt 19:00' },
    { id: 'ride-4', label: 'Fri 13', upcomingRides: 'Inga ridpass' },
    { id: 'ride-5', label: 'Sat 14' },
    { id: 'ride-6', label: 'Sun 15' },
  ],
  competitionEvents: [
    {
      id: 'comp-1',
      start: '2025-03-29',
      end: '2025-03-30',
      title: 'CEI Barbaste (FRA) · Distansritt ponny & ridhäst',
      status: 'closed',
    },
    {
      id: 'comp-2',
      start: '2025-03-30',
      end: '2025-03-31',
      title: 'Göingeritten · Nationell tävling',
      status: 'open',
    },
    {
      id: 'comp-3',
      start: '2025-04-05',
      end: '2025-04-06',
      title: 'Kristinehamnsritten · Distansritt',
      status: 'open',
    },
  ],
  dayEvents: [
    {
      id: 'day-1',
      date: '2025-03-11',
      label: 'Hovslagare bortrest',
      tone: 'farrierAway',
    },
    {
      id: 'day-2',
      date: '2025-03-12',
      label: 'Ryttare bortrest',
      tone: 'riderAway',
    },
  ],
  paddocks: [
    {
      id: 'paddock-1',
      name: 'Hage 1',
      horseNames: ['Cinder', 'Atlas'],
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'paddock-2',
      name: 'Hage 2',
      horseNames: ['Kanel'],
      updatedAt: new Date().toISOString(),
    },
  ],
};

function reducer(state: AppDataState, action: AppDataAction): AppDataState {
  switch (action.type) {
    case 'ASSIGNMENT_ADD': {
      return {
        ...state,
        assignments: [...state.assignments, action.payload],
        assignmentHistory: [
          {
            id: action.payload.id,
            assignmentId: action.payload.id,
            label: `${action.payload.label} ${action.payload.time}`,
            timestamp: new Date().toISOString(),
            action: 'created',
          },
          ...state.assignmentHistory,
        ],
      };
    }
    case 'ASSIGNMENT_UPDATE': {
      const { id, updates, silent } = action.payload;
      const updatedAssignments = state.assignments.map((assignment) =>
        assignment.id === id ? { ...assignment, ...updates } : assignment,
      );
      const updatedAssignment = updatedAssignments.find((item) => item.id === id);
      const historyEntry =
        !silent && updates.status && updatedAssignment
          ? {
              id: `${id}-${Date.now()}`,
              assignmentId: id,
              label: `${updatedAssignment.label} ${updatedAssignment.time}`.trim(),
              timestamp: new Date().toISOString(),
              action:
                updates.status === 'completed'
                  ? 'completed'
                  : updates.status === 'open'
                    ? 'declined'
                    : 'assigned',
            } as const
          : undefined;

      return {
        ...state,
        assignments: updatedAssignments,
        assignmentHistory: historyEntry
          ? [historyEntry, ...state.assignmentHistory]
          : state.assignmentHistory,
      };
    }
    case 'ASSIGNMENT_HISTORY_PUSH': {
      const { assignmentId, label, action: historyAction } = action.payload;
      return {
        ...state,
        assignmentHistory: [
          {
            id: `${assignmentId}-${Date.now()}`,
            assignmentId,
            label,
            timestamp: new Date().toISOString(),
            action: historyAction,
          },
          ...state.assignmentHistory,
        ],
      };
    }
    case 'ASSIGNMENT_REMOVE': {
      const assignments = state.assignments.filter((assignment) => assignment.id !== action.payload.id);
      return {
        ...state,
        assignments,
      };
    }
    case 'ALERT_ADD':
      return {
        ...state,
        alerts: [action.payload, ...state.alerts],
      };
    case 'MESSAGE_MARK_READ':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.payload.id ? { ...message, unreadCount: 0 } : message,
        ),
      };
    case 'CONVERSATION_APPEND': {
      const { conversationId, message, preview } = action.payload;
      const existingMessages = state.conversations[conversationId] ?? [];
      const updatedPreview = state.messages.map((msg) =>
        msg.id === conversationId ? preview : msg,
      );

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [conversationId]: [...existingMessages, message],
        },
        messages: updatedPreview,
      };
    }
    case 'USER_UPDATE': {
      const { id, updates } = action.payload;
      const existing = state.users[id];
      if (!existing) {
        return state;
      }

      return {
        ...state,
        users: {
          ...state.users,
          [id]: {
            ...existing,
            ...updates,
          },
        },
      };
    }
    case 'PADDOCK_UPSERT': {
      const existingIndex = state.paddocks.findIndex((paddock) => paddock.id === action.payload.id);
      if (existingIndex >= 0) {
        const next = [...state.paddocks];
        next[existingIndex] = action.payload;
        return {
          ...state,
          paddocks: next,
        };
      }
      return {
        ...state,
        paddocks: [...state.paddocks, action.payload],
      };
    }
    case 'PADDOCK_DELETE': {
      return {
        ...state,
        paddocks: state.paddocks.filter((paddock) => paddock.id !== action.payload.id),
      };
    }
    default:
      return state;
  }
}

function findNextAssignedAssignment(state: AppDataState, userId: string) {
  return state.assignments
    .filter((assignment) => assignment.assigneeId === userId && assignment.status === 'assigned')
    .sort((a, b) => compareAssignmentDateTime(a, b))[0];
}

function findNextOpenAssignment(state: AppDataState) {
  return state.assignments
    .filter((assignment) => assignment.status === 'open')
    .sort((a, b) => compareAssignmentDateTime(a, b))[0];
}

function compareAssignmentDateTime(a: Assignment, b: Assignment) {
  const aDate = new Date(`${a.date}T${a.time}`);
  const bDate = new Date(`${b.date}T${b.time}`);
  return aDate.getTime() - bDate.getTime();
}

function getWeekdayIndex(isoDate: string): WeekdayIndex {
  const date = new Date(`${isoDate}T00:00:00`);
  const mondayFirst = (date.getDay() + 6) % 7;
  return mondayFirst as WeekdayIndex;
}

function hasDefaultPass(user: UserProfile, weekday: WeekdayIndex, slot: AssignmentSlot) {
  return user.defaultPasses.some((entry) => entry.weekday === weekday && entry.slot === slot);
}

const slotLabels: Record<AssignmentSlot, string> = {
  Morning: 'morgon',
  Lunch: 'lunch',
  Evening: 'kväll',
};

const slotDefaultTimes: Record<AssignmentSlot, string> = {
  Morning: '07:00',
  Lunch: '12:00',
  Evening: '18:00',
};

const slotIcons: Record<AssignmentSlot, AssignmentIcon> = {
  Morning: 'sun',
  Lunch: 'clock',
  Evening: 'moon',
};

const slotTitles: Record<AssignmentSlot, string> = {
  Morning: 'Morgon',
  Lunch: 'Lunch',
  Evening: 'Kväll',
};

function formatSlotList(assignments: Assignment[], status: AssignmentStatus) {
  return assignments
    .filter((assignment) => assignment.status === status)
    .map((assignment) => slotLabels[assignment.slot]);
}

function formatNextUpdate(assignments: Assignment[]) {
  const latestCompletion = assignments
    .filter((assignment) => assignment.completedAt)
    .map((assignment) => new Date(assignment.completedAt as string))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!latestCompletion) {
    return 'Uppdaterad nyss';
  }

  return `Uppdaterad ${latestCompletion.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function normalizeHorseNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  names.forEach((name) => {
    const cleaned = name.trim();
    if (!cleaned) {
      return;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(cleaned);
  });

  return result;
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    const todayIso = new Date().toISOString().split('T')[0];
    const users = Object.values(state.users).sort((a, b) => a.id.localeCompare(b.id));

    state.assignments.forEach((assignment) => {
      if (assignment.status === 'completed') {
        return;
      }

      if (assignment.date < todayIso) {
        return;
      }

      const weekday = getWeekdayIndex(assignment.date);
      const candidates = users.filter((user) => hasDefaultPass(user, weekday, assignment.slot));

      if (assignment.status === 'open' && !assignment.assigneeId) {
        if (candidates.length !== 1) {
          return;
        }

        const candidate = candidates[0];
        if (assignment.declinedByUserIds?.includes(candidate.id)) {
          return;
        }

        dispatch({
          type: 'ASSIGNMENT_UPDATE',
          payload: {
            id: assignment.id,
            silent: true,
            updates: {
              status: 'assigned',
              assigneeId: candidate.id,
              assignedVia: 'default',
            },
          },
        });
        return;
      }

      if (assignment.status === 'assigned' && assignment.assignedVia === 'default' && assignment.assigneeId) {
        const owner = state.users[assignment.assigneeId];
        if (!owner) {
          dispatch({
            type: 'ASSIGNMENT_UPDATE',
            payload: {
              id: assignment.id,
              silent: true,
              updates: {
                status: 'open',
                assigneeId: undefined,
                assignedVia: undefined,
              },
            },
          });
          return;
        }

        const shouldOwn = candidates.length === 1 && candidates[0].id === owner.id;
        const declined = assignment.declinedByUserIds?.includes(owner.id);

        if (!shouldOwn || declined) {
          dispatch({
            type: 'ASSIGNMENT_UPDATE',
            payload: {
              id: assignment.id,
              silent: true,
              updates: {
                status: 'open',
                assigneeId: undefined,
                assignedVia: undefined,
              },
            },
          });
        }
      }
    });
  }, [state.assignments, state.users]);

  const derived = React.useMemo(() => {
    const { assignments, alerts, currentUserId } = state;
    const completed = assignments.filter((assignment) => assignment.status === 'completed').length;
    const open = assignments.filter((assignment) => assignment.status === 'open').length;
    const summary = {
      total: assignments.length,
      completed,
      open,
      alerts: alerts.length,
      openSlotLabels: formatSlotList(assignments, 'open'),
      nextUpdateLabel: formatNextUpdate(assignments),
    };

    const loggableAssignment = findNextAssignedAssignment(state, currentUserId);
    const claimableAssignment = findNextOpenAssignment(state);

    const upcomingAssignmentsForUser = assignments
      .filter(
        (assignment) =>
          assignment.assigneeId === currentUserId || assignment.status === 'open',
      )
      .sort((a, b) => compareAssignmentDateTime(a, b))
      .slice(0, 5);

    return {
      summary,
      loggableAssignment,
      claimableAssignment,
      upcomingAssignmentsForUser,
      nextAssignmentForUser: loggableAssignment ?? claimableAssignment,
      recentActivities: state.assignmentHistory.slice(0, 5),
    };
  }, [state]);

  const logNextAssignment = React.useCallback((): ActionResult<Assignment> => {
    const current = stateRef.current;
    const assignment = findNextAssignedAssignment(current, current.currentUserId);
    if (!assignment) {
      return { success: false, reason: 'Inga tilldelade pass att logga just nu.' };
    }

    dispatch({
      type: 'ASSIGNMENT_UPDATE',
      payload: {
        id: assignment.id,
        updates: {
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true, data: { ...assignment, status: 'completed' } };
  }, []);

  const claimNextOpenAssignment = React.useCallback((): ActionResult<Assignment> => {
    const current = stateRef.current;
    const assignment = findNextOpenAssignment(current);
    if (!assignment) {
      return { success: false, reason: 'Alla pass är redan bemannade.' };
    }

    const declinedByUserIds = assignment.declinedByUserIds?.filter(
      (id) => id !== current.currentUserId,
    );

    dispatch({
      type: 'ASSIGNMENT_UPDATE',
      payload: {
        id: assignment.id,
        updates: {
          status: 'assigned',
          assigneeId: current.currentUserId,
          assignedVia: 'manual',
          declinedByUserIds,
        },
      },
    });

    return {
      success: true,
      data: {
        ...assignment,
        status: 'assigned',
        assigneeId: current.currentUserId,
        assignedVia: 'manual',
        declinedByUserIds,
      },
    };
  }, []);

  const claimAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }

      if (assignment.status !== 'open') {
        return { success: false, reason: 'Passet är redan bemannat.' };
      }

      const declinedByUserIds = assignment.declinedByUserIds?.filter(
        (id) => id !== current.currentUserId,
      );

      dispatch({
        type: 'ASSIGNMENT_UPDATE',
        payload: {
          id: assignment.id,
          updates: {
            status: 'assigned',
            assigneeId: current.currentUserId,
            assignedVia: 'manual',
            declinedByUserIds,
          },
        },
      });

      return {
        success: true,
        data: {
          ...assignment,
          status: 'assigned',
          assigneeId: current.currentUserId,
          assignedVia: 'manual',
          declinedByUserIds,
        },
      };
    },
    [],
  );

  const createAssignment = React.useCallback(
    (input: CreateAssignmentInput): ActionResult<Assignment> => {
      const current = stateRef.current;
      if (!input.date) {
        return { success: false, reason: 'Datum måste anges.' };
      }

      const slot = input.slot;
      const label = input.labelOverride ?? slotTitles[slot] ?? 'Pass';
      const time = input.time ?? slotDefaultTimes[slot];
      const status: AssignmentStatus = input.assignToCurrentUser ? 'assigned' : 'open';
      const assigneeId = input.assignToCurrentUser ? current.currentUserId : undefined;

      const assignment: Assignment = {
        id: `assign-${Date.now()}`,
        date: input.date,
        label,
        slot,
        icon: slotIcons[slot],
        time,
        note: input.note,
        status,
        assigneeId,
        assignedVia: input.assignToCurrentUser ? 'manual' : undefined,
      };

      dispatch({ type: 'ASSIGNMENT_ADD', payload: assignment });

      return { success: true, data: assignment };
    },
    [],
  );

  const updateAssignment = React.useCallback(
    (input: UpdateAssignmentInput): ActionResult<Assignment> => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === input.id);

      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }

      const slot = input.slot ?? existing.slot;
      const slotChanged = slot !== existing.slot;

      const updates: Partial<Assignment> = {};

      if (input.date && input.date !== existing.date) {
        updates.date = input.date;
      }

      if (slotChanged) {
        updates.slot = slot;
        updates.icon = slotIcons[slot];
      }

      if (input.time || slotChanged) {
        updates.time = input.time ?? (slotChanged ? slotDefaultTimes[slot] : existing.time);
      }

      if (input.labelOverride || slotChanged) {
        updates.label = input.labelOverride ?? slotTitles[slot] ?? existing.label;
      }

      if (input.note !== undefined) {
        updates.note = input.note.trim() ? input.note.trim() : undefined;
      }

      if (input.assignToCurrentUser !== undefined) {
        if (input.assignToCurrentUser) {
          updates.status = 'assigned';
          updates.assigneeId = current.currentUserId;
          updates.assignedVia = 'manual';
          updates.declinedByUserIds = existing.declinedByUserIds?.filter(
            (id) => id !== current.currentUserId,
          );
        } else {
          updates.status = 'open';
          updates.assigneeId = undefined;
          updates.assignedVia = undefined;

          if (existing.assigneeId === current.currentUserId) {
            const nextDeclined = new Set(existing.declinedByUserIds ?? []);
            nextDeclined.add(current.currentUserId);
            updates.declinedByUserIds = Array.from(nextDeclined);
          }
        }
      }

      dispatch({
        type: 'ASSIGNMENT_UPDATE',
        payload: {
          id: existing.id,
          updates,
        },
      });

      return { success: true, data: { ...existing, ...updates } };
    },
    [],
  );

  const deleteAssignment = React.useCallback(
    (assignmentId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === assignmentId);
      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }

      dispatch({ type: 'ASSIGNMENT_REMOVE', payload: { id: assignmentId } });
      return { success: true };
    },
    [],
  );

  const addEvent = React.useCallback(
    (message: string, type: AlertMessage['type'] = 'info'): ActionResult<AlertMessage> => {
      const alert: AlertMessage = {
        id: `alert-${Date.now()}`,
        message,
        type,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ALERT_ADD', payload: alert });
      return { success: true, data: alert };
    },
    [],
  );

  const toggleDefaultPass = React.useCallback(
    (weekday: WeekdayIndex, slot: AssignmentSlot): ActionResult<UserProfile> => {
      const current = stateRef.current;
      const user = current.users[current.currentUserId];
      if (!user) {
        return { success: false, reason: 'Användaren kunde inte hittas.' };
      }

      const exists = user.defaultPasses.some(
        (entry) => entry.weekday === weekday && entry.slot === slot,
      );
      const nextDefaultPasses = exists
        ? user.defaultPasses.filter((entry) => !(entry.weekday === weekday && entry.slot === slot))
        : [...user.defaultPasses, { weekday, slot }];

      dispatch({
        type: 'USER_UPDATE',
        payload: {
          id: user.id,
          updates: {
            defaultPasses: nextDefaultPasses,
          },
        },
      });

      return { success: true, data: { ...user, defaultPasses: nextDefaultPasses } };
    },
    [],
  );

  const markConversationRead = React.useCallback((conversationId: string) => {
    dispatch({ type: 'MESSAGE_MARK_READ', payload: { id: conversationId } });
  }, []);

  const sendConversationMessage = React.useCallback(
    (conversationId: string, text: string): ActionResult<ConversationMessage> => {
      if (!text.trim()) {
        return { success: false, reason: 'Meddelandet kan inte vara tomt.' };
      }

      const current = stateRef.current;
      const message: ConversationMessage = {
        id: `${conversationId}-${Date.now()}`,
        conversationId,
        authorId: current.currentUserId,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent',
      };

      const preview: MessagePreview = {
        ...(current.messages.find((msg) => msg.id === conversationId) ?? {
          id: conversationId,
          title: 'Okänd konversation',
          subtitle: '',
          description: '',
          timeAgo: 'Nu',
        }),
        description: text.trim(),
        timeAgo: 'Nu',
        unreadCount: 0,
      };

      dispatch({
        type: 'CONVERSATION_APPEND',
        payload: { conversationId, message, preview },
      });

      return { success: true, data: message };
    },
    [],
  );

  const upsertPaddock = React.useCallback(
    (input: UpsertPaddockInput): ActionResult<Paddock> => {
      const current = stateRef.current;
      const name = input.name.trim();

      if (!name) {
        return { success: false, reason: 'Hagen måste ha ett namn.' };
      }

      const existing = input.id
        ? current.paddocks.find((paddock) => paddock.id === input.id)
        : undefined;

      const id = existing?.id ?? input.id ?? `paddock-${Date.now()}`;
      const updatedAt = new Date().toISOString();
      const horseNames = normalizeHorseNames(input.horseNames);
      const image =
        input.image === null ? undefined : input.image ?? existing?.image;

      const paddock: Paddock = {
        id,
        name,
        horseNames,
        image,
        updatedAt,
      };

      dispatch({ type: 'PADDOCK_UPSERT', payload: paddock });
      return { success: true, data: paddock };
    },
    [],
  );

  const deletePaddock = React.useCallback((paddockId: string): ActionResult => {
    const current = stateRef.current;
    const existing = current.paddocks.find((paddock) => paddock.id === paddockId);
    if (!existing) {
      return { success: false, reason: 'Hagen kunde inte hittas.' };
    }

    dispatch({ type: 'PADDOCK_DELETE', payload: { id: paddockId } });
    return { success: true };
  }, []);

  const value = React.useMemo<AppDataContextValue>(
    () => ({
      state,
      derived,
      actions: {
        logNextAssignment,
        claimNextOpenAssignment,
        claimAssignment,
        createAssignment,
        updateAssignment,
        deleteAssignment,
        addEvent,
        toggleDefaultPass,
        upsertPaddock,
        deletePaddock,
        markConversationRead,
        sendConversationMessage,
      },
    }),
    [
      state,
      derived,
      logNextAssignment,
      claimNextOpenAssignment,
      claimAssignment,
      createAssignment,
      updateAssignment,
      deleteAssignment,
      addEvent,
      toggleDefaultPass,
      upsertPaddock,
      deletePaddock,
      markConversationRead,
      sendConversationMessage,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = React.useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
