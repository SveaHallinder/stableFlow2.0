import React from 'react';
import type { PropsWithChildren } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type * as SecureStoreType from 'expo-secure-store';

export type AssignmentStatus = 'open' | 'assigned' | 'completed';
export type AssignmentSlot = 'Morning' | 'Lunch' | 'Evening';
export type AssignmentIcon = 'sun' | 'clock' | 'moon';

// Monday-first index (0 = Monday, 6 = Sunday)
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type UserRole = 'admin' | 'staff' | 'rider' | 'farrier' | 'vet' | 'trainer' | 'guest';

export type Stable = {
  id: string;
  name: string;
  location?: string;
  farmId?: string;
};

export type StableMembership = {
  stableId: string;
  role: UserRole;
  customRole?: string;
  access?: 'owner' | 'edit' | 'view';
  horseIds?: string[];
  riderRole?: 'owner' | 'medryttare' | 'other';
};

export type Farm = {
  id: string;
  name: string;
  location?: string;
  hasIndoorArena?: boolean;
  arenaNote?: string;
};

export type Horse = {
  id: string;
  name: string;
  stableId: string;
  ownerUserId?: string;
  image?: ImageSourcePropType;
  gender?: 'mare' | 'gelding' | 'stallion' | 'unknown';
  age?: number;
  note?: string;
};

export type DefaultPass = {
  weekday: WeekdayIndex;
  slot: AssignmentSlot;
};

export type AssignmentAssignedVia = 'default' | 'manual';

export type Assignment = {
  id: string;
  date: string; // ISO date string e.g. 2025-03-10
  stableId: string;
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
  stableId?: string;
  slot: AssignmentSlot;
  time?: string;
  note?: string;
  assignToCurrentUser?: boolean;
  labelOverride?: string;
};

export type UpdateAssignmentInput = {
  id: string;
  date?: string;
  stableId?: string;
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
  stableId: string;
  horseNames: string[];
  image?: PaddockImage;
  updatedAt: string;
  season?: 'summer' | 'winter' | 'yearRound';
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
  stableId: string;
  label: string;
  tone: DayEventTone;
};

export type UserProfile = {
  id: string;
  name: string;
  email?: string;
  membership: StableMembership[];
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
  stableId: string;
  image?: PaddockImage | null;
  season?: Paddock['season'];
};

export type UpsertStableInput = {
  id?: string;
  name: string;
  location?: string;
  farmId?: string;
};

export type UpsertFarmInput = {
  id?: string;
  name: string;
  location?: string;
  hasIndoorArena?: boolean;
  arenaNote?: string;
};

export type UpsertHorseInput = {
  id?: string;
  name: string;
  stableId: string;
  ownerUserId?: string;
  gender?: Horse['gender'];
  age?: number;
  note?: string;
};

export type AddMemberInput = {
  name: string;
  email: string;
  stableId: string;
  role: UserRole;
  customRole?: string;
  access?: 'owner' | 'edit' | 'view';
  horseIds?: string[];
  riderRole?: StableMembership['riderRole'];
  phone?: string;
  location?: string;
};

export type UpdateMemberRoleInput = {
  userId: string;
  stableId: string;
  role: UserRole;
  customRole?: string;
  access?: 'owner' | 'edit' | 'view';
  horseIds?: string[];
  riderRole?: StableMembership['riderRole'];
};

type AppDataState = {
  currentStableId: string;
  stables: Stable[];
  farms: Farm[];
  horses: Horse[];
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

type UserSetAction = {
  type: 'USER_SET';
  payload: { id: string };
};

type PaddockUpsertAction = {
  type: 'PADDOCK_UPSERT';
  payload: Paddock;
};

type PaddockDeleteAction = {
  type: 'PADDOCK_DELETE';
  payload: { id: string };
};

type StableUpsertAction = {
  type: 'STABLE_UPSERT';
  payload: Stable;
};

type StableDeleteAction = {
  type: 'STABLE_DELETE';
  payload: { id: string };
};

type StateHydrateAction = {
  type: 'STATE_HYDRATE';
  payload: Partial<AppDataState>;
};

type FarmUpsertAction = {
  type: 'FARM_UPSERT';
  payload: Farm;
};

type FarmDeleteAction = {
  type: 'FARM_DELETE';
  payload: { id: string };
};

type HorseUpsertAction = {
  type: 'HORSE_UPSERT';
  payload: Horse;
};

type HorseDeleteAction = {
  type: 'HORSE_DELETE';
  payload: { id: string };
};

type StableSetAction = {
  type: 'STABLE_SET';
  payload: { stableId: string };
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
  | PaddockDeleteAction
  | StableSetAction
  | StableUpsertAction
  | StableDeleteAction
  | FarmUpsertAction
  | FarmDeleteAction
  | HorseUpsertAction
  | HorseDeleteAction
  | StateHydrateAction
  | UserSetAction;

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
    membership?: StableMembership;
    currentAccess: StableMembership['access'];
  };
  actions: {
    logNextAssignment: () => ActionResult<Assignment>;
    claimNextOpenAssignment: () => ActionResult<Assignment>;
    claimAssignment: (assignmentId: string) => ActionResult<Assignment>;
    declineAssignment: (assignmentId: string) => ActionResult<Assignment>;
    completeAssignment: (assignmentId: string) => ActionResult<Assignment>;
    createAssignment: (input: CreateAssignmentInput) => ActionResult<Assignment>;
    updateAssignment: (input: UpdateAssignmentInput) => ActionResult<Assignment>;
    deleteAssignment: (assignmentId: string) => ActionResult;
    addEvent: (message: string, type?: AlertMessage['type']) => ActionResult<AlertMessage>;
    toggleDefaultPass: (weekday: WeekdayIndex, slot: AssignmentSlot) => ActionResult<UserProfile>;
    upsertPaddock: (input: UpsertPaddockInput) => ActionResult<Paddock>;
    deletePaddock: (paddockId: string) => ActionResult;
    markConversationRead: (conversationId: string) => void;
    sendConversationMessage: (conversationId: string, text: string) => ActionResult<ConversationMessage>;
    setCurrentStable: (stableId: string) => void;
    upsertFarm: (input: UpsertFarmInput) => ActionResult<Farm>;
    deleteFarm: (farmId: string) => ActionResult;
    upsertStable: (input: UpsertStableInput) => ActionResult<Stable>;
    deleteStable: (stableId: string) => ActionResult;
    upsertHorse: (input: UpsertHorseInput) => ActionResult<Horse>;
    deleteHorse: (horseId: string) => ActionResult;
    addMember: (input: AddMemberInput) => ActionResult<UserProfile>;
    updateMemberRole: (input: UpdateMemberRoleInput) => ActionResult<UserProfile>;
    removeMemberFromStable: (userId: string, stableId: string) => ActionResult<UserProfile>;
    setCurrentUser: (userId: string) => ActionResult;
  };
};

const AppDataContext = React.createContext<AppDataContextValue | undefined>(undefined);

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PERSIST_KEY = 'stableflow-appdata';
const accessLevel: Record<NonNullable<StableMembership['access']>, number> = {
  view: 0,
  edit: 1,
  owner: 2,
};

let secureStoreModule: typeof SecureStoreType | null = null;
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  secureStoreModule = require('expo-secure-store');
} catch {
  secureStoreModule = null;
}

const referenceDay = new Date();
referenceDay.setHours(0, 0, 0, 0);
const isoDay0 = toISODate(referenceDay);
const isoDay1 = toISODate(addDays(referenceDay, 1));
const isoDay2 = toISODate(addDays(referenceDay, 2));
const todayWeekday = ((referenceDay.getDay() + 6) % 7) as WeekdayIndex;

const initialState: AppDataState = {
  currentStableId: 'stable-1',
  farms: [
    { id: 'farm-1', name: 'Gillmyra gård', location: 'Täby', hasIndoorArena: true, arenaNote: '20x60 · bokningsbar' },
  ],
  stables: [
    { id: 'stable-1', name: 'Stall A', location: 'Täby gård', farmId: 'farm-1' },
    { id: 'stable-2', name: 'Stall B', location: 'Täby gård', farmId: 'farm-1' },
  ],
  horses: [
    { id: 'horse-1', name: 'Cinder', stableId: 'stable-1', ownerUserId: 'user-jane', gender: 'mare', age: 10 },
    { id: 'horse-2', name: 'Kanel', stableId: 'stable-1', ownerUserId: 'user-jane', gender: 'mare', age: 9 },
    { id: 'horse-3', name: 'Atlas', stableId: 'stable-2', ownerUserId: 'user-karl', gender: 'gelding', age: 8 },
  ],
  currentUserId: 'user-jane',
  users: {
    'user-jane': {
      id: 'user-jane',
      name: 'Jane Doe',
      email: 'jane@example.com',
      membership: [
        { stableId: 'stable-1', role: 'admin', access: 'owner', horseIds: ['horse-1', 'horse-2'], riderRole: 'owner' },
        { stableId: 'stable-2', role: 'staff', access: 'edit' },
      ],
      horses: ['Cinder', 'Kanel'],
      location: 'Täby, Stockholm',
      phone: '+46 70-000 00 00',
      responsibilities: ['Foder', 'Kvällspass'],
      defaultPasses: [
        { weekday: todayWeekday, slot: 'Morning' },
        { weekday: todayWeekday, slot: 'Evening' },
      ],
      awayNotices: [
        {
          id: 'away-1',
          start: toISODate(addDays(referenceDay, 14)),
          end: toISODate(addDays(referenceDay, 15)),
          note: 'Träningsläger med Cinder',
        },
        { id: 'away-2', start: toISODate(addDays(referenceDay, 24)), end: toISODate(addDays(referenceDay, 24)), note: 'Semester' },
      ],
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
    'user-karl': {
      id: 'user-karl',
      name: 'Karl Johansson',
      email: 'karl@example.com',
      membership: [{ stableId: 'stable-2', role: 'staff' }],
      horses: ['Atlas'],
      location: 'Täby, Stockholm',
      phone: '+46 72-111 11 11',
      responsibilities: ['Lunchpass'],
      defaultPasses: [{ weekday: todayWeekday, slot: 'Lunch' }],
      awayNotices: [],
      avatar: require('@/assets/images/dummy-avatar.png'),
    },
  },
  alerts: [
    {
      id: 'alert-1',
      message: 'Ingen parkering vid containern idag.',
      type: 'critical',
      createdAt: new Date().toISOString(),
    },
  ],
  assignments: [
    {
      id: 'assign-1',
      stableId: 'stable-1',
      date: isoDay0,
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
      stableId: 'stable-1',
      date: isoDay0,
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
      stableId: 'stable-1',
      date: isoDay0,
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
      stableId: 'stable-2',
      date: isoDay1,
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
      stableId: 'stable-2',
      date: isoDay1,
      label: 'Lunch',
      slot: 'Lunch',
      icon: 'clock',
      time: '12:00',
      note: 'Behöver ansvarig',
      status: 'open',
    },
    {
      id: 'assign-6',
      stableId: 'stable-2',
      date: isoDay1,
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
      stableId: 'stable-1',
      date: isoDay2,
      label: 'Morgon',
      slot: 'Morning',
      icon: 'sun',
      time: '07:00',
      status: 'assigned',
      assigneeId: 'user-jane',
    },
    {
      id: 'assign-8',
      stableId: 'stable-1',
      date: isoDay2,
      label: 'Lunch',
      slot: 'Lunch',
      icon: 'clock',
      time: '12:00',
      note: 'Hovslagare bortrest',
      status: 'open',
    },
    {
      id: 'assign-9',
      stableId: 'stable-1',
      date: isoDay2,
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
      stableId: 'stable-1',
      date: isoDay1,
      label: 'Hovslagare bortrest',
      tone: 'farrierAway',
    },
    {
      id: 'day-2',
      stableId: 'stable-1',
      date: isoDay2,
      label: 'Ryttare bortrest',
      tone: 'riderAway',
    },
  ],
  paddocks: [
    {
      id: 'paddock-1',
      name: 'Hage 1',
      stableId: 'stable-1',
      horseNames: ['Cinder', 'Atlas'],
      updatedAt: new Date().toISOString(),
      season: 'summer',
    },
    {
      id: 'paddock-2',
      name: 'Hage 2',
      stableId: 'stable-1',
      horseNames: ['Kanel'],
      updatedAt: new Date().toISOString(),
      season: 'yearRound',
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
    case 'USER_SET': {
      if (!state.users[action.payload.id]) {
        return state;
      }
      return { ...state, currentUserId: action.payload.id };
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
    case 'STATE_HYDRATE': {
      return {
        ...state,
        ...action.payload,
      };
    }
    case 'STABLE_SET': {
      const target = state.stables.find((stable) => stable.id === action.payload.stableId);
      if (!target) {
        return state;
      }
      return {
        ...state,
        currentStableId: target.id,
      };
    }
    case 'FARM_UPSERT': {
      const existingIndex = state.farms.findIndex((farm) => farm.id === action.payload.id);
      const farms = [...state.farms];
      if (existingIndex >= 0) {
        farms[existingIndex] = action.payload;
      } else {
        farms.push(action.payload);
      }
      return { ...state, farms };
    }
    case 'FARM_DELETE': {
      return {
        ...state,
        farms: state.farms.filter((farm) => farm.id !== action.payload.id),
        stables: state.stables.map((stable) =>
          stable.farmId === action.payload.id ? { ...stable, farmId: undefined } : stable,
        ),
      };
    }
    case 'STABLE_UPSERT': {
      const existingIndex = state.stables.findIndex((stable) => stable.id === action.payload.id);
      let stables = state.stables;
      if (existingIndex >= 0) {
        stables = [...state.stables];
        stables[existingIndex] = action.payload;
      } else {
        stables = [...state.stables, action.payload];
      }
      return {
        ...state,
        stables,
        currentStableId: action.payload.id,
      };
    }
    case 'STABLE_DELETE': {
      const stables = state.stables.filter((stable) => stable.id !== action.payload.id);
      const nextStableId = state.currentStableId === action.payload.id && stables[0] ? stables[0].id : state.currentStableId;
      return {
        ...state,
        stables,
        currentStableId: nextStableId,
        assignments: state.assignments.filter((assignment) => assignment.stableId !== action.payload.id),
        dayEvents: state.dayEvents.filter((event) => event.stableId !== action.payload.id),
        paddocks: state.paddocks.filter((paddock) => paddock.stableId !== action.payload.id),
        horses: state.horses.filter((horse) => horse.stableId !== action.payload.id),
      };
    }
    case 'HORSE_UPSERT': {
      const existingIndex = state.horses.findIndex((horse) => horse.id === action.payload.id);
      const horses = [...state.horses];
      if (existingIndex >= 0) {
        horses[existingIndex] = action.payload;
      } else {
        horses.push(action.payload);
      }
      return {
        ...state,
        horses,
      };
    }
    case 'HORSE_DELETE': {
      return {
        ...state,
        horses: state.horses.filter((horse) => horse.id !== action.payload.id),
      };
    }
    default:
      return state;
    }
  }

function findNextAssignedAssignment(state: AppDataState, userId: string) {
  const stableId = state.currentStableId;
  return state.assignments
    .filter(
      (assignment) =>
        assignment.assigneeId === userId &&
        assignment.status === 'assigned' &&
        assignment.stableId === stableId,
    )
    .sort((a, b) => compareAssignmentDateTime(a, b))[0];
}

function findNextOpenAssignment(state: AppDataState) {
  const stableId = state.currentStableId;
  return state.assignments
    .filter((assignment) => assignment.status === 'open' && assignment.stableId === stableId)
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

  const ensureAccess = React.useCallback(
    (stableId: string, minimum: StableMembership['access']): ActionResult => {
      const current = stateRef.current;
      const user = current.users[current.currentUserId];
      const membership = user?.membership.find((m) => m.stableId === stableId);
      if (!membership) {
        return { success: false, reason: 'Ingen behörighet till stallet.' };
      }
      const level = accessLevel[membership.access ?? 'view'];
      if (level < accessLevel[minimum]) {
        return { success: false, reason: 'Behörighet saknas för den här åtgärden.' };
      }
      return { success: true };
    },
    [],
  );

  const loadPersisted = React.useCallback(async () => {
    // Prefer localStorage on web
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) return raw;
    }
    if (secureStoreModule?.getItemAsync) {
      try {
        return await secureStoreModule.getItemAsync(PERSIST_KEY);
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const savePersisted = React.useCallback(async (value: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PERSIST_KEY, value);
    }
    if (secureStoreModule?.setItemAsync) {
      try {
        await secureStoreModule.setItemAsync(PERSIST_KEY, value);
      } catch (error) {
        console.warn('Kunde inte spara data', error);
      }
    }
  }, []);

  // Hydrate from storage
  React.useEffect(() => {
    (async () => {
      try {
        const raw = await loadPersisted();
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<AppDataState>;
        dispatch({
          type: 'STATE_HYDRATE',
          payload: parsed,
        });
      } catch (error) {
        console.warn('Kunde inte läsa sparad data', error);
      }
    })();
  }, [loadPersisted]);

  // Persist key slices
  React.useEffect(() => {
    const payload: Partial<AppDataState> = {
      farms: state.farms,
      stables: state.stables,
      horses: state.horses,
      paddocks: state.paddocks,
      users: state.users,
      currentStableId: state.currentStableId,
      currentUserId: state.currentUserId,
    };
    (async () => {
      try {
        await savePersisted(JSON.stringify(payload));
      } catch (error) {
        console.warn('Kunde inte spara data', error);
      }
    })();
  }, [savePersisted, state.farms, state.stables, state.horses, state.paddocks, state.users, state.currentStableId]);

  React.useEffect(() => {
    const todayIso = toISODate(new Date());
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
    const { assignments, alerts, currentUserId, currentStableId } = state;
    const membership = state.users[currentUserId]?.membership.find((m) => m.stableId === currentStableId);
    const currentAccess = membership?.access ?? 'view';
    const activeAssignments = assignments.filter((assignment) => assignment.stableId === currentStableId);
    const completed = activeAssignments.filter((assignment) => assignment.status === 'completed').length;
    const open = activeAssignments.filter((assignment) => assignment.status === 'open').length;
    const summary = {
      total: activeAssignments.length,
      completed,
      open,
      alerts: alerts.length,
      openSlotLabels: formatSlotList(activeAssignments, 'open'),
      nextUpdateLabel: formatNextUpdate(activeAssignments),
    };

    const loggableAssignment = findNextAssignedAssignment(state, currentUserId);
    const claimableAssignment = findNextOpenAssignment(state);

    const upcomingAssignmentsForUser = activeAssignments
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
      membership,
      currentAccess,
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

  const declineAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }

      if (assignment.status !== 'assigned' || assignment.assigneeId !== current.currentUserId) {
        return { success: false, reason: 'Du kan bara släppa pass som står på dig.' };
      }

      const declined = new Set(assignment.declinedByUserIds ?? []);
      declined.add(current.currentUserId);

      dispatch({
        type: 'ASSIGNMENT_UPDATE',
        payload: {
          id: assignment.id,
          updates: {
            status: 'open',
            assigneeId: undefined,
            assignedVia: undefined,
            declinedByUserIds: Array.from(declined),
          },
        },
      });

      return {
        success: true,
        data: {
          ...assignment,
          status: 'open',
          assigneeId: undefined,
          assignedVia: undefined,
          declinedByUserIds: Array.from(declined),
        },
      };
    },
    [],
  );

  const completeAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }

      if (assignment.status !== 'assigned' || assignment.assigneeId !== current.currentUserId) {
        return { success: false, reason: 'Du kan bara markera egna pass som klara.' };
      }

      const completedAt = new Date().toISOString();

      dispatch({
        type: 'ASSIGNMENT_UPDATE',
        payload: {
          id: assignment.id,
          updates: {
            status: 'completed',
            completedAt,
          },
        },
      });

      return {
        success: true,
        data: {
          ...assignment,
          status: 'completed',
          completedAt,
        },
      };
    },
    [],
  );

  const createAssignment = React.useCallback(
    (input: CreateAssignmentInput): ActionResult<Assignment> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
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
        stableId,
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

      if (input.stableId && input.stableId !== existing.stableId) {
        updates.stableId = input.stableId;
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
      const stableId = input.stableId || current.currentStableId;

      const accessCheck = ensureAccess(stableId, 'edit');
      if (!accessCheck.success) {
        return accessCheck;
      }

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
      const season = input.season ?? existing?.season ?? 'yearRound';

      const paddock: Paddock = {
        id,
        name,
        stableId,
        horseNames,
        image,
        updatedAt,
        season,
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

  const setCurrentStable = React.useCallback((stableId: string) => {
    dispatch({ type: 'STABLE_SET', payload: { stableId } });
  }, []);

  const upsertFarm = React.useCallback(
    (input: UpsertFarmInput): ActionResult<Farm> => {
      const name = input.name.trim();
      if (!name) {
        return { success: false, reason: 'Gården måste ha ett namn.' };
      }
      const id = input.id ?? `farm-${Date.now()}`;
      const farm: Farm = {
        id,
        name,
        location: input.location?.trim() || undefined,
        hasIndoorArena: input.hasIndoorArena,
        arenaNote: input.arenaNote?.trim() || undefined,
      };
      dispatch({ type: 'FARM_UPSERT', payload: farm });
      return { success: true, data: farm };
    },
    [],
  );

  const deleteFarm = React.useCallback((farmId: string): ActionResult => {
    const current = stateRef.current;
    const exists = current.farms.find((farm) => farm.id === farmId);
    if (!exists) {
      return { success: false, reason: 'Gården kunde inte hittas.' };
    }
    dispatch({ type: 'FARM_DELETE', payload: { id: farmId } });
    return { success: true };
  }, []);

  const upsertStable = React.useCallback(
    (input: UpsertStableInput): ActionResult<Stable> => {
      if (input.id) {
        const accessCheck = ensureAccess(input.id, 'owner');
        if (!accessCheck.success) {
          return accessCheck;
        }
      }
      const id = input.id ?? `stable-${Date.now()}`;
      const stable: Stable = {
        id,
        name: input.name.trim(),
        location: input.location?.trim() || undefined,
        farmId: input.farmId,
      };

      if (!stable.name) {
        return { success: false, reason: 'Stallet måste ha ett namn.' };
      }

      dispatch({ type: 'STABLE_UPSERT', payload: stable });

      // ensure current user is admin of new stable
      const current = stateRef.current;
      const user = current.users[current.currentUserId];
      if (user && !user.membership.some((m) => m.stableId === stable.id)) {
        dispatch({
          type: 'USER_UPDATE',
          payload: {
            id: user.id,
            updates: {
              membership: [...user.membership, { stableId: stable.id, role: 'admin' }],
            },
          },
        });
      }

      return { success: true, data: stable };
    },
    [],
  );

  const deleteStable = React.useCallback((stableId: string): ActionResult => {
    const accessCheck = ensureAccess(stableId, 'owner');
    if (!accessCheck.success) {
      return accessCheck;
    }
    const current = stateRef.current;
    const exists = current.stables.find((stable) => stable.id === stableId);
    if (!exists) {
      return { success: false, reason: 'Stallet kunde inte hittas.' };
    }
    dispatch({ type: 'STABLE_DELETE', payload: { id: stableId } });
    return { success: true };
  }, []);

  const upsertHorse = React.useCallback(
    (input: UpsertHorseInput): ActionResult<Horse> => {
      const accessCheck = ensureAccess(input.stableId, 'edit');
      if (!accessCheck.success) {
        return accessCheck;
      }
      const name = input.name.trim();
      if (!name) {
        return { success: false, reason: 'Hästen måste ha ett namn.' };
      }
      const id = input.id ?? `horse-${Date.now()}`;
      const horse: Horse = {
        id,
        name,
        stableId: input.stableId,
        ownerUserId: input.ownerUserId,
        gender: input.gender,
        age: input.age,
        note: input.note?.trim() || undefined,
      };
      dispatch({ type: 'HORSE_UPSERT', payload: horse });
      return { success: true, data: horse };
    },
    [],
  );

  const deleteHorse = React.useCallback((horseId: string): ActionResult => {
    const current = stateRef.current;
    const existing = current.horses.find((horse) => horse.id === horseId);
    if (!existing) {
      return { success: false, reason: 'Hästen kunde inte hittas.' };
    }
    const accessCheck = ensureAccess(existing.stableId, 'edit');
    if (!accessCheck.success) {
      return accessCheck;
    }
    dispatch({ type: 'HORSE_DELETE', payload: { id: horseId } });
    return { success: true };
  }, []);

  const addMember = React.useCallback(
    (input: AddMemberInput): ActionResult<UserProfile> => {
      const accessCheck = ensureAccess(input.stableId, 'edit');
      if (!accessCheck.success) {
        return accessCheck;
      }
      const name = input.name.trim();
      const email = input.email.trim();
      if (!name) {
        return { success: false, reason: 'Namn krävs.' };
      }
      if (!email) {
        return { success: false, reason: 'E-post krävs.' };
      }
      const id = `user-${Date.now()}`;
      const membership: StableMembership[] = [
        {
          stableId: input.stableId,
          role: input.role,
          customRole: input.customRole?.trim() || undefined,
          access: input.access ?? 'view',
          horseIds: input.horseIds,
          riderRole: input.riderRole ?? 'medryttare',
        },
      ];
      const user: UserProfile = {
        id,
        name,
        email,
        membership,
        horses: [],
        location: input.location ?? 'Okänd plats',
        phone: input.phone ?? '',
        responsibilities: [],
        defaultPasses: [],
        awayNotices: [],
      };
      dispatch({ type: 'USER_UPDATE', payload: { id, updates: user } });
      return { success: true, data: user };
    },
    [],
  );

  const updateMemberRole = React.useCallback(
    (input: UpdateMemberRoleInput): ActionResult<UserProfile> => {
      const accessCheck = ensureAccess(input.stableId, 'edit');
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const membership = user.membership.map((entry) =>
        entry.stableId === input.stableId
          ? {
              ...entry,
              role: input.role,
              customRole: input.customRole?.trim() || entry.customRole,
              access: input.access ?? entry.access,
              horseIds: input.horseIds ?? entry.horseIds,
              riderRole: input.riderRole ?? entry.riderRole,
            }
          : entry,
      );
      dispatch({
        type: 'USER_UPDATE',
        payload: {
          id: user.id,
          updates: { membership },
        },
      });
      return { success: true, data: { ...user, membership } };
    },
    [],
  );

  const removeMemberFromStable = React.useCallback(
    (userId: string, stableId: string): ActionResult<UserProfile> => {
      const accessCheck = ensureAccess(stableId, 'owner');
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const membership = user.membership.filter((entry) => entry.stableId !== stableId);
      dispatch({
        type: 'USER_UPDATE',
        payload: { id: userId, updates: { membership } },
      });
      return { success: true, data: { ...user, membership } };
    },
    [],
  );

  const setCurrentUser = React.useCallback((userId: string): ActionResult => {
    const current = stateRef.current;
    if (!current.users[userId]) {
      return { success: false, reason: 'Användaren finns inte.' };
    }
    dispatch({ type: 'USER_SET', payload: { id: userId } });
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
        declineAssignment,
        completeAssignment,
        createAssignment,
        updateAssignment,
        deleteAssignment,
        addEvent,
        toggleDefaultPass,
        upsertPaddock,
        deletePaddock,
        markConversationRead,
        sendConversationMessage,
        setCurrentStable,
        upsertFarm,
        deleteFarm,
        upsertStable,
        deleteStable,
        upsertHorse,
        deleteHorse,
        addMember,
        updateMemberRole,
        removeMemberFromStable,
        setCurrentUser,
      },
    }),
    [
      state,
      derived,
      logNextAssignment,
      claimNextOpenAssignment,
      claimAssignment,
      declineAssignment,
      completeAssignment,
      createAssignment,
      updateAssignment,
      deleteAssignment,
      addEvent,
      toggleDefaultPass,
      upsertPaddock,
      deletePaddock,
      markConversationRead,
      sendConversationMessage,
      setCurrentStable,
      upsertFarm,
      deleteFarm,
      upsertStable,
      deleteStable,
      upsertHorse,
      deleteHorse,
      addMember,
      updateMemberRole,
      removeMemberFromStable,
      setCurrentUser,
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
