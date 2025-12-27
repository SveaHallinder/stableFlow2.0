import React from 'react';
import type { PropsWithChildren } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type * as SecureStoreType from 'expo-secure-store';

export type AssignmentStatus = 'open' | 'assigned' | 'completed';
export type AssignmentSlot = 'Morning' | 'Lunch' | 'Evening';
export type AssignmentIcon = 'sun' | 'clock' | 'moon';

// Monday-first index (0 = Monday, 6 = Sunday)
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type UserRole = 'admin' | 'staff' | 'rider' | 'farrier' | 'vet' | 'trainer' | 'therapist' | 'guest';

export type StableDayLogic = 'box' | 'loose';

export type StableEventVisibility = {
  feeding: boolean;
  cleaning: boolean;
  riderAway: boolean;
  farrierAway: boolean;
  vetAway: boolean;
  evening: boolean;
};

export type StableSettings = {
  dayLogic: StableDayLogic;
  eventVisibility: StableEventVisibility;
};

export type Stable = {
  id: string;
  name: string;
  location?: string;
  farmId?: string;
  rideTypes?: RideType[];
  settings?: StableSettings;
};

export type RideType = {
  id: string;
  code: string;
  label: string;
  description?: string;
};

export type RideLogEntry = {
  id: string;
  stableId: string;
  horseId: string;
  date: string;
  rideTypeId: string;
  length?: string;
  note?: string;
  createdByUserId: string;
};

export type CreateRideLogInput = {
  stableId?: string;
  horseId: string;
  date: string;
  rideTypeId: string;
  length?: string;
  note?: string;
};

export type ArenaStatus = {
  id: string;
  stableId: string;
  date: string;
  label: string;
  createdByUserId: string;
  createdAt: string;
};

export type CreateArenaStatusInput = {
  stableId?: string;
  date: string;
  label: string;
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

export type HorseDayStatus = {
  id: string;
  stableId: string;
  horseId: string;
  date: string;
  dayStatus?: 'in' | 'out';
  nightStatus?: 'in' | 'out';
  checked?: boolean;
  water?: boolean;
  hay?: boolean;
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
  stableId?: string;
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
  createdAt?: string;
  content?: string;
  image?: string;
  likes: number;
  comments: number;
  likedByUserIds?: string[];
  commentsData?: PostComment[];
  stableId?: string;
  groupIds?: string[];
};

export type PostComment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type CreatePostInput = {
  content: string;
  stableId?: string;
  groupIds?: string[];
  image?: string;
};

export type GroupType = 'stable' | 'farm' | 'horse' | 'custom';

export type Group = {
  id: string;
  name: string;
  type: GroupType;
  stableId?: string;
  farmId?: string;
  horseId?: string;
  createdAt: string;
  createdByUserId?: string;
};

export type CreateGroupInput = {
  name: string;
  stableId?: string;
};

export type RenameGroupInput = {
  id: string;
  name: string;
};

export type RidingDay = {
  id: string;
  stableId?: string;
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
  | 'vetAway'
  | 'evening'
  | 'info';

export type DayEvent = {
  id: string;
  date: string;
  stableId: string;
  label: string;
  tone: DayEventTone;
};

export type CreateDayEventInput = {
  date: string;
  stableId?: string;
  label: string;
  tone: DayEventTone;
};

export type ArenaBooking = {
  id: string;
  stableId: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  bookedByUserId: string;
  note?: string;
};

export type CreateArenaBookingInput = {
  date: string;
  stableId?: string;
  startTime: string;
  endTime: string;
  purpose: string;
  note?: string;
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

export type SignInInput = {
  email: string;
  password?: string;
};

export type SignUpInput = {
  name: string;
  email: string;
  password?: string;
  stableId?: string;
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
  rideTypes?: RideType[];
  settings?: StableSettings;
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
  image?: Horse['image'];
  gender?: Horse['gender'];
  age?: number;
  note?: string;
};

export type UpdateHorseDayStatusInput = {
  horseId: string;
  date: string;
  stableId?: string;
  updates: Partial<Pick<HorseDayStatus, 'dayStatus' | 'nightStatus' | 'checked' | 'water' | 'hay'>>;
};

export type AddMemberInput = {
  name: string;
  email: string;
  stableId: string;
  stableIds?: string[];
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

export type UpdateMemberHorseIdsInput = {
  userId: string;
  stableId: string;
  horseIds: string[];
};

export type ToggleMemberDefaultPassInput = {
  userId: string;
  stableId: string;
  weekday: WeekdayIndex;
  slot: AssignmentSlot;
};

export type PermissionSet = {
  canManageOnboarding: boolean;
  canManageMembers: boolean;
  canManageAssignments: boolean;
  canClaimAssignments: boolean;
  canCompleteAssignments: boolean;
  canManageRideLogs: boolean;
  canManageArenaBookings: boolean;
  canManageArenaStatus: boolean;
  canManageDayEvents: boolean;
  canManagePaddocks: boolean;
  canUpdateHorseStatus: boolean;
  canManageHorses: boolean;
  canCreatePost: boolean;
  canCommentPost: boolean;
  canLikePost: boolean;
  canManageGroups: boolean;
};

type AppDataState = {
  currentStableId: string;
  stables: Stable[];
  farms: Farm[];
  horses: Horse[];
  currentUserId: string;
  sessionUserId: string | null;
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
  groups: Group[];
  ridingSchedule: RidingDay[];
  competitionEvents: CompetitionEvent[];
  dayEvents: DayEvent[];
  arenaBookings: ArenaBooking[];
  arenaStatuses: ArenaStatus[];
  rideLogs: RideLogEntry[];
  paddocks: Paddock[];
  horseDayStatuses: HorseDayStatus[];
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

type UserUpsertAction = {
  type: 'USER_UPSERT';
  payload: { user: UserProfile };
};

type UserSetAction = {
  type: 'USER_SET';
  payload: { id: string };
};

type SessionClearAction = {
  type: 'SESSION_CLEAR';
};

type PaddockUpsertAction = {
  type: 'PADDOCK_UPSERT';
  payload: Paddock;
};

type PaddockDeleteAction = {
  type: 'PADDOCK_DELETE';
  payload: { id: string };
};

type DayEventAddAction = {
  type: 'DAY_EVENT_ADD';
  payload: DayEvent;
};

type DayEventDeleteAction = {
  type: 'DAY_EVENT_DELETE';
  payload: { id: string };
};

type ArenaBookingAddAction = {
  type: 'ARENA_BOOKING_ADD';
  payload: ArenaBooking;
};

type ArenaBookingUpdateAction = {
  type: 'ARENA_BOOKING_UPDATE';
  payload: { id: string; updates: Partial<ArenaBooking> };
};

type ArenaBookingDeleteAction = {
  type: 'ARENA_BOOKING_DELETE';
  payload: { id: string };
};

type ArenaStatusAddAction = {
  type: 'ARENA_STATUS_ADD';
  payload: ArenaStatus;
};

type ArenaStatusDeleteAction = {
  type: 'ARENA_STATUS_DELETE';
  payload: { id: string };
};

type RideLogAddAction = {
  type: 'RIDE_LOG_ADD';
  payload: RideLogEntry;
};

type RideLogDeleteAction = {
  type: 'RIDE_LOG_DELETE';
  payload: { id: string };
};

type PostAddAction = {
  type: 'POST_ADD';
  payload: Post;
};

type PostUpdateAction = {
  type: 'POST_UPDATE';
  payload: { id: string; updates: Partial<Post> };
};

type GroupAddAction = {
  type: 'GROUP_ADD';
  payload: Group;
};

type GroupUpdateAction = {
  type: 'GROUP_UPDATE';
  payload: { id: string; updates: Partial<Group> };
};

type GroupDeleteAction = {
  type: 'GROUP_DELETE';
  payload: { id: string };
};

type HorseDayStatusUpsertAction = {
  type: 'HORSE_DAY_STATUS_UPSERT';
  payload: HorseDayStatus;
};

type StableUpsertAction = {
  type: 'STABLE_UPSERT';
  payload: Stable;
};

type StableUpdateAction = {
  type: 'STABLE_UPDATE';
  payload: { id: string; updates: Partial<Stable> };
};

type StableDeleteAction = {
  type: 'STABLE_DELETE';
  payload: { id: string };
};

type StateHydrateAction = {
  type: 'STATE_HYDRATE';
  payload: Partial<AppDataState>;
};

type StateResetAction = {
  type: 'STATE_RESET';
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
  | UserUpsertAction
  | PaddockUpsertAction
  | PaddockDeleteAction
  | DayEventAddAction
  | DayEventDeleteAction
  | ArenaBookingAddAction
  | ArenaBookingUpdateAction
  | ArenaBookingDeleteAction
  | ArenaStatusAddAction
  | ArenaStatusDeleteAction
  | RideLogAddAction
  | RideLogDeleteAction
  | PostAddAction
  | PostUpdateAction
  | GroupAddAction
  | GroupUpdateAction
  | GroupDeleteAction
  | HorseDayStatusUpsertAction
  | StableSetAction
  | StableUpsertAction
  | StableUpdateAction
  | StableDeleteAction
  | FarmUpsertAction
  | FarmDeleteAction
  | HorseUpsertAction
  | HorseDeleteAction
  | StateHydrateAction
  | StateResetAction
  | UserSetAction
  | SessionClearAction;

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
    currentRole: UserRole;
    permissions: PermissionSet;
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
    updateHorseDayStatus: (input: UpdateHorseDayStatusInput) => ActionResult<HorseDayStatus>;
    addDayEvent: (input: CreateDayEventInput) => ActionResult<DayEvent>;
    removeDayEvent: (eventId: string) => ActionResult;
    addArenaBooking: (input: CreateArenaBookingInput) => ActionResult<ArenaBooking>;
    updateArenaBooking: (input: { id: string; updates: Partial<ArenaBooking> }) => ActionResult<ArenaBooking>;
    removeArenaBooking: (bookingId: string) => ActionResult;
    addArenaStatus: (input: CreateArenaStatusInput) => ActionResult<ArenaStatus>;
    removeArenaStatus: (statusId: string) => ActionResult;
    addRideLog: (input: CreateRideLogInput) => ActionResult<RideLogEntry>;
    removeRideLog: (rideLogId: string) => ActionResult;
    addPost: (input: CreatePostInput) => ActionResult<Post>;
    togglePostLike: (postId: string) => ActionResult<Post>;
    addPostComment: (postId: string, text: string) => ActionResult<PostComment>;
    createGroup: (input: CreateGroupInput) => ActionResult<Group>;
    renameGroup: (input: RenameGroupInput) => ActionResult<Group>;
    deleteGroup: (groupId: string) => ActionResult;
    markConversationRead: (conversationId: string) => void;
    sendConversationMessage: (conversationId: string, text: string) => ActionResult<ConversationMessage>;
    setCurrentStable: (stableId: string) => void;
    upsertFarm: (input: UpsertFarmInput) => ActionResult<Farm>;
    deleteFarm: (farmId: string) => ActionResult;
    upsertStable: (input: UpsertStableInput) => ActionResult<Stable>;
    updateStable: (input: { id: string; updates: Partial<Stable> }) => ActionResult<Stable>;
    deleteStable: (stableId: string) => ActionResult;
    upsertHorse: (input: UpsertHorseInput) => ActionResult<Horse>;
    deleteHorse: (horseId: string) => ActionResult;
    addMember: (input: AddMemberInput) => ActionResult<UserProfile>;
    updateMemberRole: (input: UpdateMemberRoleInput) => ActionResult<UserProfile>;
    updateMemberHorseIds: (input: UpdateMemberHorseIdsInput) => ActionResult<UserProfile>;
    toggleMemberDefaultPass: (input: ToggleMemberDefaultPassInput) => ActionResult<UserProfile>;
    removeMemberFromStable: (userId: string, stableId: string) => ActionResult<UserProfile>;
    setCurrentUser: (userId: string) => ActionResult;
    signIn: (input: SignInInput) => ActionResult<UserProfile>;
    signUp: (input: SignUpInput) => ActionResult<UserProfile>;
    signOut: () => ActionResult;
    resetAppData: () => ActionResult;
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

const defaultEventVisibility: StableEventVisibility = {
  feeding: true,
  cleaning: true,
  riderAway: true,
  farrierAway: true,
  vetAway: true,
  evening: true,
};

export function createDefaultStableSettings(): StableSettings {
  return {
    dayLogic: 'box',
    eventVisibility: { ...defaultEventVisibility },
  };
}

export function resolveStableSettings(stable?: Stable): StableSettings {
  const defaults = createDefaultStableSettings();
  if (!stable?.settings) {
    return defaults;
  }
  return {
    dayLogic: stable.settings.dayLogic ?? defaults.dayLogic,
    eventVisibility: { ...defaults.eventVisibility, ...stable.settings.eventVisibility },
  };
}

const systemGroupIds = {
  stable: (id: string) => `stable:${id}`,
  farm: (id: string) => `farm:${id}`,
  horse: (id: string) => `horse:${id}`,
};

function buildSystemGroups(farms: Farm[], stables: Stable[], horses: Horse[]): Group[] {
  const createdAt = new Date().toISOString();
  const farmGroups = farms.map((farm) => ({
    id: systemGroupIds.farm(farm.id),
    name: farm.name,
    type: 'farm' as const,
    farmId: farm.id,
    createdAt,
  }));
  const stableGroups = stables.map((stable) => ({
    id: systemGroupIds.stable(stable.id),
    name: stable.name,
    type: 'stable' as const,
    stableId: stable.id,
    farmId: stable.farmId,
    createdAt,
  }));
  const horseGroups = horses.map((horse) => ({
    id: systemGroupIds.horse(horse.id),
    name: horse.name,
    type: 'horse' as const,
    stableId: horse.stableId,
    horseId: horse.id,
    createdAt,
  }));
  return [...farmGroups, ...stableGroups, ...horseGroups];
}

function upsertGroup(groups: Group[], group: Group): Group[] {
  const existingIndex = groups.findIndex((item) => item.id === group.id);
  if (existingIndex >= 0) {
    const existing = groups[existingIndex];
    const next = [...groups];
    next[existingIndex] = { ...existing, ...group, createdAt: existing.createdAt };
    return next;
  }
  return [...groups, group];
}

function ensureSystemGroups(
  existing: Group[] | undefined,
  farms: Farm[],
  stables: Stable[],
  horses: Horse[],
): Group[] {
  const base = existing ? [...existing] : [];
  const systemGroups = buildSystemGroups(farms, stables, horses);
  return systemGroups.reduce((acc, group) => upsertGroup(acc, group), base);
}

const PERSIST_KEY = 'stableflow-appdata';
const accessLevel: Record<NonNullable<StableMembership['access']>, number> = {
  view: 0,
  edit: 1,
  owner: 2,
};

const emptyPermissions: PermissionSet = {
  canManageOnboarding: false,
  canManageMembers: false,
  canManageAssignments: false,
  canClaimAssignments: false,
  canCompleteAssignments: false,
  canManageRideLogs: false,
  canManageArenaBookings: false,
  canManageArenaStatus: false,
  canManageDayEvents: false,
  canManagePaddocks: false,
  canUpdateHorseStatus: false,
  canManageHorses: false,
  canCreatePost: false,
  canCommentPost: false,
  canLikePost: false,
  canManageGroups: false,
};

const claimAssignmentRoles = new Set<UserRole>(['admin', 'staff', 'rider']);
const rideLogRoles = new Set<UserRole>(['admin', 'staff', 'rider']);
const dayEventRoles = new Set<UserRole>([
  'admin',
  'staff',
  'rider',
  'farrier',
  'vet',
  'trainer',
  'therapist',
]);
const arenaRoles = new Set<UserRole>(['admin', 'staff']);
const groupRoles = new Set<UserRole>(['admin', 'staff']);
const postRoles = new Set<UserRole>(['admin', 'staff', 'rider']);
const horseStatusRoles = new Set<UserRole>(['admin', 'staff']);

function resolvePermissions(
  state: AppDataState,
  stableId: string,
  userId: string,
): PermissionSet {
  const user = state.users[userId];
  if (!user) {
    return emptyPermissions;
  }
  const membership = user.membership.find((entry) => entry.stableId === stableId);
  if (!membership) {
    return emptyPermissions;
  }
  const role = membership.role ?? 'guest';
  const access = membership.access ?? 'view';
  const accessValue = accessLevel[access];
  const canEditAccess = accessValue >= accessLevel.edit;
  const canOwnerAccess = accessValue >= accessLevel.owner;
  const isAdmin = role === 'admin';

  return {
    canManageOnboarding: isAdmin && canOwnerAccess,
    canManageMembers: isAdmin && canOwnerAccess,
    canManageAssignments: canEditAccess,
    canClaimAssignments: claimAssignmentRoles.has(role),
    canCompleteAssignments: claimAssignmentRoles.has(role),
    canManageRideLogs: rideLogRoles.has(role),
    canManageArenaBookings: arenaRoles.has(role),
    canManageArenaStatus: arenaRoles.has(role),
    canManageDayEvents: dayEventRoles.has(role),
    canManagePaddocks: canEditAccess,
    canUpdateHorseStatus: horseStatusRoles.has(role),
    canManageHorses: canEditAccess,
    canCreatePost: postRoles.has(role),
    canCommentPost: role !== 'guest',
    canLikePost: role !== 'guest',
    canManageGroups: groupRoles.has(role),
  };
}

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
const stableOneSettings = createDefaultStableSettings();
const stableTwoSettings = { ...createDefaultStableSettings(), dayLogic: 'loose' as StableDayLogic };
const postTime1 = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const postTime2 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const initialFarms: Farm[] = [
  { id: 'farm-1', name: 'Gillmyra gård', location: 'Täby', hasIndoorArena: true, arenaNote: '20x60 · bokningsbar' },
];

const initialStables: Stable[] = [
  {
    id: 'stable-1',
    name: 'Stall A',
    location: 'Täby gård',
    farmId: 'farm-1',
    settings: stableOneSettings,
    rideTypes: [
      { id: 'ride-type-1', code: 'K', label: 'Kort pass' },
      { id: 'ride-type-2', code: 'K+', label: 'Kort + tempo' },
      { id: 'ride-type-3', code: 'M', label: 'Mellanpass' },
      { id: 'ride-type-4', code: 'H', label: 'Hoppträning' },
      { id: 'ride-type-5', code: 'D', label: 'Dressyrpass' },
    ],
  },
  {
    id: 'stable-2',
    name: 'Stall B',
    location: 'Täby gård',
    farmId: 'farm-1',
    settings: stableTwoSettings,
    rideTypes: [
      { id: 'ride-type-6', code: 'K', label: 'Kort pass' },
      { id: 'ride-type-7', code: 'M', label: 'Mellanpass' },
      { id: 'ride-type-8', code: 'U', label: 'Uteritt' },
    ],
  },
];

const initialHorses: Horse[] = [
  { id: 'horse-1', name: 'Cinder', stableId: 'stable-1', ownerUserId: 'user-jane', gender: 'mare', age: 10 },
  { id: 'horse-2', name: 'Kanel', stableId: 'stable-1', ownerUserId: 'user-jane', gender: 'mare', age: 9 },
  { id: 'horse-3', name: 'Atlas', stableId: 'stable-2', ownerUserId: 'user-karl', gender: 'gelding', age: 8 },
];

const initialGroups: Group[] = [
  ...buildSystemGroups(initialFarms, initialStables, initialHorses),
  {
    id: 'group-custom-1',
    name: 'Fodergruppen',
    type: 'custom',
    stableId: 'stable-1',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user-jane',
  },
];

const initialState: AppDataState = {
  currentStableId: 'stable-1',
  farms: initialFarms,
  stables: initialStables,
  horses: initialHorses,
  currentUserId: 'user-jane',
  sessionUserId: 'user-jane',
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
      stableId: 'stable-1',
    },
    {
      id: 'person-1',
      title: 'Ida Magnusson',
      subtitle: '1h sedan',
      description: 'Hej! Har du möjlighet att...',
      timeAgo: '1h',
      unreadCount: 0,
      avatar: require('@/assets/images/dummy-avatar.png'),
      stableId: 'stable-2',
    },
    {
      id: 'person-2',
      title: 'Samuel Hall',
      subtitle: '2h sedan',
      description: 'Glöm inte täcket ikväll!',
      timeAgo: '2h',
      unreadCount: 0,
      avatar: require('@/assets/images/dummy-avatar.png'),
      stableId: 'stable-1',
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
      createdAt: postTime1,
      content: 'Glöm inte att mockningen i Stall B ska vara klar innan lunch i morgon.',
      likes: 8,
      comments: 1,
      likedByUserIds: ['user-jane'],
      commentsData: [
        {
          id: 'comment-1',
          postId: 'post-1',
          authorId: 'user-karl',
          authorName: 'Karl Johansson',
          text: 'Fixar det.',
          createdAt: postTime1,
        },
      ],
      stableId: 'stable-2',
      groupIds: ['stable:stable-2', 'farm:farm-1'],
    },
    {
      id: 'post-2',
      author: 'Ida Magnusson',
      avatar: require('@/assets/images/dummy-avatar.png'),
      timeAgo: '2h',
      createdAt: postTime2,
      content: 'Vilken kväll! Härlig uteritt med gänget.',
      image: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?q=80&w=1000&auto=format&fit=crop',
      likes: 12,
      comments: 0,
      likedByUserIds: [],
      commentsData: [],
      stableId: 'stable-1',
      groupIds: ['stable:stable-1', 'horse:horse-1', 'farm:farm-1'],
    },
  ],
  groups: initialGroups,
  ridingSchedule: [
    { id: 'ride-1', stableId: 'stable-1', label: 'Tue 10', upcomingRides: 'Dressyr · 18:30', isToday: true },
    { id: 'ride-2', stableId: 'stable-1', label: 'Wed 11', upcomingRides: 'Ridhus bokat 17:00' },
    { id: 'ride-3', stableId: 'stable-1', label: 'Thu 12', upcomingRides: 'Uteritt 19:00' },
    { id: 'ride-4', stableId: 'stable-2', label: 'Fri 13', upcomingRides: 'Inga ridpass' },
    { id: 'ride-5', stableId: 'stable-2', label: 'Sat 14' },
    { id: 'ride-6', stableId: 'stable-2', label: 'Sun 15' },
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
  arenaBookings: [
    {
      id: 'arena-1',
      stableId: 'stable-1',
      date: isoDay0,
      startTime: '17:00',
      endTime: '18:00',
      purpose: 'Dressyrträning',
      bookedByUserId: 'user-jane',
    },
    {
      id: 'arena-2',
      stableId: 'stable-1',
      date: isoDay1,
      startTime: '19:00',
      endTime: '20:30',
      purpose: 'Hoppträning',
      bookedByUserId: 'user-karl',
    },
  ],
  arenaStatuses: [
    {
      id: 'arena-status-1',
      stableId: 'stable-1',
      date: isoDay0,
      label: 'Harvat',
      createdByUserId: 'user-jane',
      createdAt: new Date().toISOString(),
    },
  ],
  rideLogs: [
    {
      id: 'ride-log-1',
      stableId: 'stable-1',
      horseId: 'horse-1',
      date: isoDay0,
      rideTypeId: 'ride-type-1',
      length: '45 min',
      note: 'Lugn uteritt',
      createdByUserId: 'user-jane',
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
  horseDayStatuses: [],
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
    case 'DAY_EVENT_ADD':
      return {
        ...state,
        dayEvents: [action.payload, ...state.dayEvents],
      };
    case 'DAY_EVENT_DELETE':
      return {
        ...state,
        dayEvents: state.dayEvents.filter((event) => event.id !== action.payload.id),
      };
    case 'ARENA_BOOKING_ADD':
      return {
        ...state,
        arenaBookings: [...state.arenaBookings, action.payload],
      };
    case 'ARENA_BOOKING_UPDATE': {
      const updated = state.arenaBookings.map((booking) =>
        booking.id === action.payload.id ? { ...booking, ...action.payload.updates } : booking,
      );
      return {
        ...state,
        arenaBookings: updated,
      };
    }
    case 'ARENA_BOOKING_DELETE':
      return {
        ...state,
        arenaBookings: state.arenaBookings.filter((booking) => booking.id !== action.payload.id),
      };
    case 'ARENA_STATUS_ADD':
      return {
        ...state,
        arenaStatuses: [action.payload, ...state.arenaStatuses],
      };
    case 'ARENA_STATUS_DELETE':
      return {
        ...state,
        arenaStatuses: state.arenaStatuses.filter((status) => status.id !== action.payload.id),
      };
    case 'RIDE_LOG_ADD':
      return {
        ...state,
        rideLogs: [action.payload, ...state.rideLogs],
      };
    case 'RIDE_LOG_DELETE':
      return {
        ...state,
        rideLogs: state.rideLogs.filter((log) => log.id !== action.payload.id),
      };
    case 'POST_ADD':
      return {
        ...state,
        posts: [action.payload, ...state.posts],
      };
    case 'POST_UPDATE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        posts: state.posts.map((post) => (post.id === id ? { ...post, ...updates } : post)),
      };
    }
    case 'GROUP_ADD':
      return {
        ...state,
        groups: [action.payload, ...state.groups],
      };
    case 'GROUP_UPDATE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        groups: state.groups.map((group) => (group.id === id ? { ...group, ...updates } : group)),
      };
    }
    case 'GROUP_DELETE': {
      const nextGroups = state.groups.filter((group) => group.id !== action.payload.id);
      const nextPosts = state.posts.map((post) => ({
        ...post,
        groupIds: post.groupIds?.filter((groupId) => groupId !== action.payload.id),
      }));
      return {
        ...state,
        groups: nextGroups,
        posts: nextPosts,
      };
    }
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
    case 'USER_UPSERT': {
      const { user } = action.payload;
      const existing = state.users[user.id];
      return {
        ...state,
        users: {
          ...state.users,
          [user.id]: existing ? { ...existing, ...user } : user,
        },
      };
    }
    case 'USER_SET': {
      if (!state.users[action.payload.id]) {
        return state;
      }
      return { ...state, currentUserId: action.payload.id, sessionUserId: action.payload.id };
    }
    case 'SESSION_CLEAR': {
      return { ...state, sessionUserId: null };
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
    case 'HORSE_DAY_STATUS_UPSERT': {
      const existingIndex = state.horseDayStatuses.findIndex((status) => status.id === action.payload.id);
      if (existingIndex >= 0) {
        const next = [...state.horseDayStatuses];
        next[existingIndex] = action.payload;
        return {
          ...state,
          horseDayStatuses: next,
        };
      }
      return {
        ...state,
        horseDayStatuses: [...state.horseDayStatuses, action.payload],
      };
    }
    case 'STATE_HYDRATE': {
      const hydratedStables = action.payload.stables?.map((stable) => ({
        ...stable,
        settings: resolveStableSettings(stable),
      }));
      const farms = action.payload.farms ?? state.farms;
      const stables = hydratedStables ?? state.stables;
      const horses = action.payload.horses ?? state.horses;
      const users = action.payload.users ?? state.users;
      const currentUserId =
        action.payload.currentUserId && users[action.payload.currentUserId]
          ? action.payload.currentUserId
          : state.currentUserId;
      const rawSessionUserId =
        typeof action.payload.sessionUserId !== 'undefined'
          ? action.payload.sessionUserId
          : currentUserId;
      const sessionUserId =
        rawSessionUserId && users[rawSessionUserId] ? rawSessionUserId : null;
      const groups = ensureSystemGroups(action.payload.groups, farms, stables, horses);
      return {
        ...state,
        ...action.payload,
        farms,
        stables,
        horses,
        users,
        currentUserId,
        sessionUserId,
        groups,
        horseDayStatuses: action.payload.horseDayStatuses ?? state.horseDayStatuses,
      };
    }
    case 'STATE_RESET':
      return { ...initialState };
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
      const groups = upsertGroup(state.groups, {
        id: systemGroupIds.farm(action.payload.id),
        name: action.payload.name,
        type: 'farm',
        farmId: action.payload.id,
        createdAt: new Date().toISOString(),
      });
      return { ...state, farms, groups };
    }
    case 'FARM_DELETE': {
      const farmId = action.payload.id;
      const removeGroupIds = new Set(
        state.groups
          .filter((group) => group.farmId === farmId && group.type === 'farm')
          .map((group) => group.id),
      );
      const groups = state.groups
        .filter((group) => !removeGroupIds.has(group.id))
        .map((group) =>
          group.type === 'stable' && group.farmId === farmId ? { ...group, farmId: undefined } : group,
        );
      const posts = state.posts.map((post) => ({
        ...post,
        groupIds: post.groupIds?.filter((groupId) => !removeGroupIds.has(groupId)),
      }));
      return {
        ...state,
        farms: state.farms.filter((farm) => farm.id !== farmId),
        stables: state.stables.map((stable) =>
          stable.farmId === farmId ? { ...stable, farmId: undefined } : stable,
        ),
        groups,
        posts,
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
      const groups = upsertGroup(state.groups, {
        id: systemGroupIds.stable(action.payload.id),
        name: action.payload.name,
        type: 'stable',
        stableId: action.payload.id,
        farmId: action.payload.farmId,
        createdAt: new Date().toISOString(),
      });
      return {
        ...state,
        stables,
        currentStableId: action.payload.id,
        groups,
      };
    }
    case 'STABLE_UPDATE': {
      const { id, updates } = action.payload;
      const existing = state.stables.find((stable) => stable.id === id);
      if (!existing) {
        return state;
      }
      const nextStable = { ...existing, ...updates };
      const groups = upsertGroup(state.groups, {
        id: systemGroupIds.stable(nextStable.id),
        name: nextStable.name,
        type: 'stable',
        stableId: nextStable.id,
        farmId: nextStable.farmId,
        createdAt: new Date().toISOString(),
      });
      return {
        ...state,
        stables: state.stables.map((stable) => (stable.id === id ? nextStable : stable)),
        groups,
      };
    }
    case 'STABLE_DELETE': {
      const stables = state.stables.filter((stable) => stable.id !== action.payload.id);
      const nextStableId = state.currentStableId === action.payload.id && stables[0] ? stables[0].id : state.currentStableId;
      const removeGroupIds = new Set(
        state.groups
          .filter((group) => group.stableId === action.payload.id)
          .map((group) => group.id),
      );
      const groups = state.groups.filter((group) => !removeGroupIds.has(group.id));
      const posts = state.posts.map((post) => ({
        ...post,
        groupIds: post.groupIds?.filter((groupId) => !removeGroupIds.has(groupId)),
      }));
      return {
        ...state,
        stables,
        currentStableId: nextStableId,
        assignments: state.assignments.filter((assignment) => assignment.stableId !== action.payload.id),
        dayEvents: state.dayEvents.filter((event) => event.stableId !== action.payload.id),
        arenaBookings: state.arenaBookings.filter((booking) => booking.stableId !== action.payload.id),
        arenaStatuses: state.arenaStatuses.filter((status) => status.stableId !== action.payload.id),
        rideLogs: state.rideLogs.filter((log) => log.stableId !== action.payload.id),
        paddocks: state.paddocks.filter((paddock) => paddock.stableId !== action.payload.id),
        horses: state.horses.filter((horse) => horse.stableId !== action.payload.id),
        horseDayStatuses: state.horseDayStatuses.filter((status) => status.stableId !== action.payload.id),
        groups,
        posts,
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
      const groups = upsertGroup(state.groups, {
        id: systemGroupIds.horse(action.payload.id),
        name: action.payload.name,
        type: 'horse',
        stableId: action.payload.stableId,
        horseId: action.payload.id,
        createdAt: new Date().toISOString(),
      });
      return {
        ...state,
        horses,
        groups,
      };
    }
    case 'HORSE_DELETE': {
      const removeGroupId = systemGroupIds.horse(action.payload.id);
      const groups = state.groups.filter((group) => group.id !== removeGroupId);
      const posts = state.posts.map((post) => ({
        ...post,
        groupIds: post.groupIds?.filter((groupId) => groupId !== removeGroupId),
      }));
      return {
        ...state,
        horses: state.horses.filter((horse) => horse.id !== action.payload.id),
        rideLogs: state.rideLogs.filter((log) => log.horseId !== action.payload.id),
        horseDayStatuses: state.horseDayStatuses.filter((status) => status.horseId !== action.payload.id),
        groups,
        posts,
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

  const ensurePermission = React.useCallback(
    (stableId: string, check: (permissions: PermissionSet) => boolean): ActionResult => {
      const current = stateRef.current;
      const permissions = resolvePermissions(current, stableId, current.currentUserId);
      if (!check(permissions)) {
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

  const clearPersisted = React.useCallback(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PERSIST_KEY);
    }
    if (secureStoreModule?.deleteItemAsync) {
      try {
        await secureStoreModule.deleteItemAsync(PERSIST_KEY);
      } catch (error) {
        console.warn('Kunde inte rensa sparad data', error);
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
      horseDayStatuses: state.horseDayStatuses,
      users: state.users,
      currentStableId: state.currentStableId,
      currentUserId: state.currentUserId,
      sessionUserId: state.sessionUserId,
    };
    (async () => {
      try {
        await savePersisted(JSON.stringify(payload));
      } catch (error) {
        console.warn('Kunde inte spara data', error);
      }
    })();
  }, [
    savePersisted,
    state.farms,
    state.stables,
    state.horses,
    state.paddocks,
    state.horseDayStatuses,
    state.users,
    state.currentStableId,
    state.sessionUserId,
  ]);

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
    const currentRole = membership?.role ?? 'guest';
    const permissions = resolvePermissions(state, currentStableId, currentUserId);
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
      currentRole,
      permissions,
    };
  }, [state]);

  const logNextAssignment = React.useCallback((): ActionResult<Assignment> => {
    const current = stateRef.current;
    const assignment = findNextAssignedAssignment(current, current.currentUserId);
    if (!assignment) {
      return { success: false, reason: 'Inga tilldelade pass att logga just nu.' };
    }
    const accessCheck = ensurePermission(assignment.stableId, (permissions) => permissions.canCompleteAssignments);
    if (!accessCheck.success) {
      return accessCheck;
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
  }, [ensurePermission]);

  const claimNextOpenAssignment = React.useCallback((): ActionResult<Assignment> => {
    const current = stateRef.current;
    const assignment = findNextOpenAssignment(current);
    if (!assignment) {
      return { success: false, reason: 'Alla pass är redan bemannade.' };
    }
    const accessCheck = ensurePermission(assignment.stableId, (permissions) => permissions.canClaimAssignments);
    if (!accessCheck.success) {
      return accessCheck;
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
  }, [ensurePermission]);

  const claimAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(assignment.stableId, (permissions) => permissions.canClaimAssignments);
      if (!accessCheck.success) {
        return accessCheck;
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
    [ensurePermission],
  );

  const declineAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(assignment.stableId, (permissions) => permissions.canCompleteAssignments);
      if (!accessCheck.success) {
        return accessCheck;
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
    [ensurePermission],
  );

  const completeAssignment = React.useCallback(
    (assignmentId: string): ActionResult<Assignment> => {
      const current = stateRef.current;
      const assignment = current.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(assignment.stableId, (permissions) => permissions.canCompleteAssignments);
      if (!accessCheck.success) {
        return accessCheck;
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
    [ensurePermission],
  );

  const createAssignment = React.useCallback(
    (input: CreateAssignmentInput): ActionResult<Assignment> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (!input.date) {
        return { success: false, reason: 'Datum måste anges.' };
      }

      const slot = input.slot;
      const cleanedLabel = input.labelOverride?.trim();
      const cleanedTime = input.time?.trim();
      const label = cleanedLabel || slotTitles[slot] || 'Pass';
      const time = cleanedTime || slotDefaultTimes[slot];
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
    [ensurePermission],
  );

  const updateAssignment = React.useCallback(
    (input: UpdateAssignmentInput): ActionResult<Assignment> => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === input.id);

      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
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

      const timeProvided = input.time !== undefined;
      const labelProvided = input.labelOverride !== undefined;

      if (timeProvided || slotChanged) {
        const cleanedTime = input.time?.trim();
        updates.time = cleanedTime
          ? cleanedTime
          : slotChanged || timeProvided
            ? slotDefaultTimes[slot]
            : existing.time;
      }

      if (labelProvided || slotChanged) {
        const cleanedLabel = input.labelOverride?.trim();
        updates.label = cleanedLabel
          ? cleanedLabel
          : slotTitles[slot] ?? existing.label;
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
    [ensurePermission],
  );

  const deleteAssignment = React.useCallback(
    (assignmentId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === assignmentId);
      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }

      dispatch({ type: 'ASSIGNMENT_REMOVE', payload: { id: assignmentId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const addEvent = React.useCallback(
    (message: string, type: AlertMessage['type'] = 'info'): ActionResult<AlertMessage> => {
      const current = stateRef.current;
      const accessCheck = ensurePermission(
        current.currentStableId,
        (permissions) => permissions.canManageDayEvents,
      );
      if (!accessCheck.success) {
        return accessCheck;
      }
      const alert: AlertMessage = {
        id: `alert-${Date.now()}`,
        message,
        type,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ALERT_ADD', payload: alert });
      return { success: true, data: alert };
    },
    [ensurePermission],
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
        stableId: current.messages.find((msg) => msg.id === conversationId)?.stableId ?? current.currentStableId,
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

      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManagePaddocks);
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
    [ensurePermission],
  );

  const deletePaddock = React.useCallback((paddockId: string): ActionResult => {
    const current = stateRef.current;
    const existing = current.paddocks.find((paddock) => paddock.id === paddockId);
    if (!existing) {
      return { success: false, reason: 'Hagen kunde inte hittas.' };
    }
    const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManagePaddocks);
    if (!accessCheck.success) {
      return accessCheck;
    }

    dispatch({ type: 'PADDOCK_DELETE', payload: { id: paddockId } });
    return { success: true };
  }, [ensurePermission]);

  const updateHorseDayStatus = React.useCallback(
    (input: UpdateHorseDayStatusInput): ActionResult<HorseDayStatus> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canUpdateHorseStatus);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const horse = current.horses.find((entry) => entry.id === input.horseId);
      if (!horse || horse.stableId !== stableId) {
        return { success: false, reason: 'Hästen kunde inte hittas.' };
      }
      if (!input.date) {
        return { success: false, reason: 'Datum saknas.' };
      }

      const existing = current.horseDayStatuses.find(
        (status) =>
          status.horseId === input.horseId &&
          status.date === input.date &&
          status.stableId === stableId,
      );
      const id = existing?.id ?? `horse-day-${input.horseId}-${input.date}`;
      const next: HorseDayStatus = {
        id,
        horseId: input.horseId,
        stableId,
        date: input.date,
        dayStatus: existing?.dayStatus,
        nightStatus: existing?.nightStatus,
        checked: existing?.checked,
        water: existing?.water,
        hay: existing?.hay,
        ...input.updates,
      };

      dispatch({ type: 'HORSE_DAY_STATUS_UPSERT', payload: next });
      return { success: true, data: next };
    },
    [ensurePermission],
  );

  const addDayEvent = React.useCallback(
    (input: CreateDayEventInput): ActionResult<DayEvent> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageDayEvents);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const label = input.label.trim();
      if (!label) {
        return { success: false, reason: 'Händelsen måste ha en titel.' };
      }
      if (!input.date) {
        return { success: false, reason: 'Datum saknas.' };
      }

      const event: DayEvent = {
        id: `day-${Date.now()}`,
        stableId,
        date: input.date,
        label,
        tone: input.tone ?? 'info',
      };
      dispatch({ type: 'DAY_EVENT_ADD', payload: event });
      return { success: true, data: event };
    },
    [ensurePermission],
  );

  const removeDayEvent = React.useCallback(
    (eventId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.dayEvents.find((event) => event.id === eventId);
      if (!existing) {
        return { success: false, reason: 'Händelsen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageDayEvents);
      if (!accessCheck.success) {
        return accessCheck;
      }
      dispatch({ type: 'DAY_EVENT_DELETE', payload: { id: eventId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const addArenaBooking = React.useCallback(
    (input: CreateArenaBookingInput): ActionResult<ArenaBooking> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageArenaBookings);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const purpose = input.purpose.trim();
      if (!purpose) {
        return { success: false, reason: 'Bokningen måste ha ett syfte.' };
      }
      if (!input.date) {
        return { success: false, reason: 'Datum saknas.' };
      }
      if (!input.startTime || !input.endTime) {
        return { success: false, reason: 'Ange start och sluttid.' };
      }
      if (input.startTime >= input.endTime) {
        return { success: false, reason: 'Sluttiden måste vara efter starttiden.' };
      }

      const booking: ArenaBooking = {
        id: `arena-${Date.now()}`,
        stableId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        purpose,
        note: input.note?.trim() || undefined,
        bookedByUserId: current.currentUserId,
      };
      dispatch({ type: 'ARENA_BOOKING_ADD', payload: booking });
      return { success: true, data: booking };
    },
    [ensurePermission],
  );

  const updateArenaBooking = React.useCallback(
    (input: { id: string; updates: Partial<ArenaBooking> }): ActionResult<ArenaBooking> => {
      const current = stateRef.current;
      const existing = current.arenaBookings.find((booking) => booking.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Bokningen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageArenaBookings);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const updates = {
        ...input.updates,
        purpose: input.updates.purpose?.trim() ?? existing.purpose,
        note: input.updates.note?.trim() ?? existing.note,
      };
      const updated = { ...existing, ...updates };
      dispatch({ type: 'ARENA_BOOKING_UPDATE', payload: { id: input.id, updates } });
      return { success: true, data: updated };
    },
    [ensurePermission],
  );

  const removeArenaBooking = React.useCallback(
    (bookingId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.arenaBookings.find((booking) => booking.id === bookingId);
      if (!existing) {
        return { success: false, reason: 'Bokningen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageArenaBookings);
      if (!accessCheck.success) {
        return accessCheck;
      }
      dispatch({ type: 'ARENA_BOOKING_DELETE', payload: { id: bookingId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const addArenaStatus = React.useCallback(
    (input: CreateArenaStatusInput): ActionResult<ArenaStatus> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageArenaStatus);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const label = input.label.trim();
      if (!label) {
        return { success: false, reason: 'Statusen behöver en titel.' };
      }
      if (!input.date) {
        return { success: false, reason: 'Datum saknas.' };
      }

      const status: ArenaStatus = {
        id: `arena-status-${Date.now()}`,
        stableId,
        date: input.date,
        label,
        createdByUserId: current.currentUserId,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ARENA_STATUS_ADD', payload: status });
      return { success: true, data: status };
    },
    [ensurePermission],
  );

  const removeArenaStatus = React.useCallback(
    (statusId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.arenaStatuses.find((status) => status.id === statusId);
      if (!existing) {
        return { success: false, reason: 'Statusen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageArenaStatus);
      if (!accessCheck.success) {
        return accessCheck;
      }
      dispatch({ type: 'ARENA_STATUS_DELETE', payload: { id: statusId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const addRideLog = React.useCallback(
    (input: CreateRideLogInput): ActionResult<RideLogEntry> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageRideLogs);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const stable = current.stables.find((item) => item.id === stableId);
      if (!stable) {
        return { success: false, reason: 'Stallet kunde inte hittas.' };
      }
      if (!input.date) {
        return { success: false, reason: 'Datum saknas.' };
      }
      if (!input.horseId) {
        return { success: false, reason: 'Välj en häst.' };
      }
      if (!input.rideTypeId) {
        return { success: false, reason: 'Välj en ridpass-typ.' };
      }
      const horse = current.horses.find((item) => item.id === input.horseId);
      if (!horse || horse.stableId !== stableId) {
        return { success: false, reason: 'Hästen finns inte i valt stall.' };
      }
      const rideTypeExists = stable.rideTypes?.some((type) => type.id === input.rideTypeId);
      if (!rideTypeExists) {
        return { success: false, reason: 'Ridpass-typ saknas i stallet.' };
      }

      const log: RideLogEntry = {
        id: `ride-log-${Date.now()}`,
        stableId,
        horseId: input.horseId,
        date: input.date,
        rideTypeId: input.rideTypeId,
        length: input.length?.trim() || undefined,
        note: input.note?.trim() || undefined,
        createdByUserId: current.currentUserId,
      };
      dispatch({ type: 'RIDE_LOG_ADD', payload: log });
      return { success: true, data: log };
    },
    [ensurePermission],
  );

  const removeRideLog = React.useCallback(
    (rideLogId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.rideLogs.find((log) => log.id === rideLogId);
      if (!existing) {
        return { success: false, reason: 'Ridpasset kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageRideLogs);
      if (!accessCheck.success) {
        return accessCheck;
      }
      dispatch({ type: 'RIDE_LOG_DELETE', payload: { id: rideLogId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const addPost = React.useCallback(
    (input: CreatePostInput): ActionResult<Post> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canCreatePost);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const user = current.users[current.currentUserId];
      if (!user) {
        return { success: false, reason: 'Användaren kunde inte hittas.' };
      }
      const content = input.content.trim();
      if (!content) {
        return { success: false, reason: 'Inlägget kan inte vara tomt.' };
      }
      const defaultGroupId = `stable:${stableId}`;
      const groupIds = input.groupIds?.length ? input.groupIds : [defaultGroupId];
      const post: Post = {
        id: `post-${Date.now()}`,
        author: user.name,
        avatar: user.avatar ?? require('@/assets/images/dummy-avatar.png'),
        timeAgo: 'Nu',
        createdAt: new Date().toISOString(),
        content,
        image: input.image,
        likes: 0,
        comments: 0,
        likedByUserIds: [],
        commentsData: [],
        stableId,
        groupIds: groupIds.includes(defaultGroupId) ? groupIds : [defaultGroupId, ...groupIds],
      };
      dispatch({ type: 'POST_ADD', payload: post });
      return { success: true, data: post };
    },
    [ensurePermission],
  );

  const togglePostLike = React.useCallback(
    (postId: string): ActionResult<Post> => {
      const current = stateRef.current;
      const post = current.posts.find((item) => item.id === postId);
      if (!post) {
        return { success: false, reason: 'Inlägget kunde inte hittas.' };
      }
      const stableId = post.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canLikePost);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const userId = current.currentUserId;
      const likedBy = new Set(post.likedByUserIds ?? []);
      const hasLiked = likedBy.has(userId);
      if (hasLiked) {
        likedBy.delete(userId);
      } else {
        likedBy.add(userId);
      }
      const nextLikes = Math.max(0, post.likes + (hasLiked ? -1 : 1));
      const updates = {
        likedByUserIds: Array.from(likedBy),
        likes: nextLikes,
      };
      dispatch({ type: 'POST_UPDATE', payload: { id: post.id, updates } });
      return { success: true, data: { ...post, ...updates } };
    },
    [ensurePermission],
  );

  const addPostComment = React.useCallback(
    (postId: string, text: string): ActionResult<PostComment> => {
      const trimmed = text.trim();
      if (!trimmed) {
        return { success: false, reason: 'Kommentaren kan inte vara tom.' };
      }
      const current = stateRef.current;
      const post = current.posts.find((item) => item.id === postId);
      if (!post) {
        return { success: false, reason: 'Inlägget kunde inte hittas.' };
      }
      const stableId = post.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canCommentPost);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const author = current.users[current.currentUserId];
      const comment: PostComment = {
        id: `comment-${Date.now()}`,
        postId,
        authorId: current.currentUserId,
        authorName: author?.name ?? 'Okänd',
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      const nextCommentsData = [...(post.commentsData ?? []), comment];
      const updates = {
        commentsData: nextCommentsData,
        comments: post.comments + 1,
      };
      dispatch({ type: 'POST_UPDATE', payload: { id: post.id, updates } });
      return { success: true, data: comment };
    },
    [ensurePermission],
  );

  const createGroup = React.useCallback(
    (input: CreateGroupInput): ActionResult<Group> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageGroups);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const name = input.name.trim();
      if (!name) {
        return { success: false, reason: 'Gruppen behöver ett namn.' };
      }
      const group: Group = {
        id: `group-${Date.now()}`,
        name,
        type: 'custom',
        stableId,
        createdAt: new Date().toISOString(),
        createdByUserId: current.currentUserId,
      };
      dispatch({ type: 'GROUP_ADD', payload: group });
      return { success: true, data: group };
    },
    [ensurePermission],
  );

  const renameGroup = React.useCallback(
    (input: RenameGroupInput): ActionResult<Group> => {
      const current = stateRef.current;
      const existing = current.groups.find((group) => group.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Gruppen kunde inte hittas.' };
      }
      if (existing.type !== 'custom') {
        return { success: false, reason: 'Systemgrupper kan inte byta namn.' };
      }
      const stableId = existing.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageGroups);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const name = input.name.trim();
      if (!name) {
        return { success: false, reason: 'Gruppen behöver ett namn.' };
      }
      dispatch({ type: 'GROUP_UPDATE', payload: { id: input.id, updates: { name } } });
      return { success: true, data: { ...existing, name } };
    },
    [ensurePermission],
  );

  const deleteGroup = React.useCallback(
    (groupId: string): ActionResult => {
      const current = stateRef.current;
      const existing = current.groups.find((group) => group.id === groupId);
      if (!existing) {
        return { success: false, reason: 'Gruppen kunde inte hittas.' };
      }
      if (existing.type !== 'custom') {
        return { success: false, reason: 'Systemgrupper kan inte tas bort.' };
      }
      const stableId = existing.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageGroups);
      if (!accessCheck.success) {
        return accessCheck;
      }
      dispatch({ type: 'GROUP_DELETE', payload: { id: groupId } });
      return { success: true };
    },
    [ensurePermission],
  );

  const setCurrentStable = React.useCallback((stableId: string) => {
    dispatch({ type: 'STABLE_SET', payload: { stableId } });
  }, []);

  const upsertFarm = React.useCallback(
    (input: UpsertFarmInput): ActionResult<Farm> => {
      const current = stateRef.current;
      const accessCheck = ensurePermission(
        current.currentStableId,
        (permissions) => permissions.canManageOnboarding,
      );
      if (!accessCheck.success) {
        return accessCheck;
      }
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
    [ensurePermission],
  );

  const deleteFarm = React.useCallback((farmId: string): ActionResult => {
    const current = stateRef.current;
    const accessCheck = ensurePermission(
      current.currentStableId,
      (permissions) => permissions.canManageOnboarding,
    );
    if (!accessCheck.success) {
      return accessCheck;
    }
    const exists = current.farms.find((farm) => farm.id === farmId);
    if (!exists) {
      return { success: false, reason: 'Gården kunde inte hittas.' };
    }
    dispatch({ type: 'FARM_DELETE', payload: { id: farmId } });
    return { success: true };
  }, [ensurePermission]);

  const upsertStable = React.useCallback(
    (input: UpsertStableInput): ActionResult<Stable> => {
      const current = stateRef.current;
      const accessCheck = ensurePermission(
        input.id ?? current.currentStableId,
        (permissions) => permissions.canManageOnboarding,
      );
      if (!accessCheck.success) {
        return accessCheck;
      }
      const id = input.id ?? `stable-${Date.now()}`;
      const existing = input.id ? current.stables.find((stable) => stable.id === input.id) : undefined;
      const baseSettings = existing ? resolveStableSettings(existing) : createDefaultStableSettings();
      const nextSettings = input.settings
        ? {
            dayLogic: input.settings.dayLogic ?? baseSettings.dayLogic,
            eventVisibility: {
              ...baseSettings.eventVisibility,
              ...input.settings.eventVisibility,
            },
          }
        : baseSettings;
      const stable: Stable = {
        id,
        name: input.name.trim(),
        location: input.location?.trim() || undefined,
        farmId: input.farmId,
        rideTypes: input.rideTypes ?? existing?.rideTypes ?? [],
        settings: nextSettings,
      };

      if (!stable.name) {
        return { success: false, reason: 'Stallet måste ha ett namn.' };
      }

      dispatch({ type: 'STABLE_UPSERT', payload: stable });

      // ensure current user is admin of new stable
      const user = current.users[current.currentUserId];
      if (user && !user.membership.some((m) => m.stableId === stable.id)) {
        dispatch({
          type: 'USER_UPDATE',
          payload: {
            id: user.id,
            updates: {
              membership: [...user.membership, { stableId: stable.id, role: 'admin', access: 'owner' }],
            },
          },
        });
      }

      return { success: true, data: stable };
    },
    [ensurePermission],
  );

  const updateStable = React.useCallback(
    (input: { id: string; updates: Partial<Stable> }): ActionResult<Stable> => {
      const accessCheck = ensurePermission(input.id, (permissions) => permissions.canManageOnboarding);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const existing = current.stables.find((stable) => stable.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Stallet kunde inte hittas.' };
      }
      const baseSettings = resolveStableSettings(existing);
      const mergedSettings = input.updates.settings
        ? {
            dayLogic: input.updates.settings.dayLogic ?? baseSettings.dayLogic,
            eventVisibility: {
              ...baseSettings.eventVisibility,
              ...input.updates.settings.eventVisibility,
            },
          }
        : existing.settings;
      const updates = input.updates.settings
        ? { ...input.updates, settings: mergedSettings }
        : input.updates;
      const updated: Stable = { ...existing, ...updates };
      if (!updated.name.trim()) {
        return { success: false, reason: 'Stallet måste ha ett namn.' };
      }
      dispatch({
        type: 'STABLE_UPDATE',
        payload: { id: input.id, updates },
      });
      return { success: true, data: updated };
    },
    [ensurePermission],
  );

  const deleteStable = React.useCallback((stableId: string): ActionResult => {
    const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageOnboarding);
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
  }, [ensurePermission]);

  const upsertHorse = React.useCallback(
    (input: UpsertHorseInput): ActionResult<Horse> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageHorses);
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
        image: input.image,
        gender: input.gender,
        age: input.age,
        note: input.note?.trim() || undefined,
      };
      dispatch({ type: 'HORSE_UPSERT', payload: horse });
      return { success: true, data: horse };
    },
    [ensurePermission],
  );

  const deleteHorse = React.useCallback((horseId: string): ActionResult => {
    const current = stateRef.current;
    const existing = current.horses.find((horse) => horse.id === horseId);
    if (!existing) {
      return { success: false, reason: 'Hästen kunde inte hittas.' };
    }
    const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageHorses);
    if (!accessCheck.success) {
      return accessCheck;
    }
    dispatch({ type: 'HORSE_DELETE', payload: { id: horseId } });
    return { success: true };
  }, [ensurePermission]);

  const addMember = React.useCallback(
    (input: AddMemberInput): ActionResult<UserProfile> => {
      const stableIds = Array.from(new Set([input.stableId, ...(input.stableIds ?? [])]));
      if (!stableIds.length) {
        return { success: false, reason: 'Välj minst ett stall.' };
      }
      for (const stableId of stableIds) {
        const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageMembers);
        if (!accessCheck.success) {
          return accessCheck;
        }
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
      const membership: StableMembership[] = stableIds.map((stableId) => ({
        stableId,
        role: input.role,
        customRole: input.customRole?.trim() || undefined,
        access:
          input.access ??
          (input.role === 'admin' ? 'owner' : input.role === 'staff' ? 'edit' : 'view'),
        horseIds: stableId === input.stableId ? input.horseIds : undefined,
        riderRole: input.role === 'rider' ? input.riderRole ?? 'medryttare' : undefined,
      }));
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
      dispatch({ type: 'USER_UPSERT', payload: { user } });
      return { success: true, data: user };
    },
    [ensurePermission],
  );

  const updateMemberRole = React.useCallback(
    (input: UpdateMemberRoleInput): ActionResult<UserProfile> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
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
              access:
                input.access ??
                (input.role === 'admin'
                  ? 'owner'
                  : input.role === 'staff'
                    ? 'edit'
                    : entry.access ?? 'view'),
              horseIds: input.horseIds ?? entry.horseIds,
              riderRole:
                input.role === 'rider'
                  ? input.riderRole ?? entry.riderRole ?? 'medryttare'
                  : undefined,
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
    [ensurePermission],
  );

  const updateMemberHorseIds = React.useCallback(
    (input: UpdateMemberHorseIdsInput): ActionResult<UserProfile> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const membership = user.membership.map((entry) =>
        entry.stableId === input.stableId ? { ...entry, horseIds: input.horseIds } : entry,
      );
      const hasMembership = membership.some((entry) => entry.stableId === input.stableId);
      if (!hasMembership) {
        return { success: false, reason: 'Medlemmen är inte kopplad till stallet.' };
      }
      dispatch({
        type: 'USER_UPDATE',
        payload: {
          id: user.id,
          updates: { membership },
        },
      });
      return { success: true, data: { ...user, membership } };
    },
    [ensurePermission],
  );

  const toggleMemberDefaultPass = React.useCallback(
    (input: ToggleMemberDefaultPassInput): ActionResult<UserProfile> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const exists = user.defaultPasses.some(
        (entry) => entry.weekday === input.weekday && entry.slot === input.slot,
      );
      const nextDefaultPasses = exists
        ? user.defaultPasses.filter(
            (entry) => !(entry.weekday === input.weekday && entry.slot === input.slot),
          )
        : [...user.defaultPasses, { weekday: input.weekday, slot: input.slot }];

      dispatch({
        type: 'USER_UPDATE',
        payload: {
          id: user.id,
          updates: { defaultPasses: nextDefaultPasses },
        },
      });

      return { success: true, data: { ...user, defaultPasses: nextDefaultPasses } };
    },
    [ensurePermission],
  );

  const removeMemberFromStable = React.useCallback(
    (userId: string, stableId: string): ActionResult<UserProfile> => {
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageMembers);
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
    [ensurePermission],
  );

  const setCurrentUser = React.useCallback((userId: string): ActionResult => {
    const current = stateRef.current;
    if (!current.users[userId]) {
      return { success: false, reason: 'Användaren finns inte.' };
    }
    dispatch({ type: 'USER_SET', payload: { id: userId } });
    return { success: true };
  }, []);

  const signIn = React.useCallback((input: SignInInput): ActionResult<UserProfile> => {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      return { success: false, reason: 'Ange e-post.' };
    }
    const current = stateRef.current;
    const user = Object.values(current.users).find(
      (entry) => entry.email?.toLowerCase() === email,
    );
    if (!user) {
      return { success: false, reason: 'Ingen användare med den e-posten.' };
    }
    dispatch({ type: 'USER_SET', payload: { id: user.id } });
    return { success: true, data: user };
  }, []);

  const signUp = React.useCallback((input: SignUpInput): ActionResult<UserProfile> => {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) {
      return { success: false, reason: 'Namn krävs.' };
    }
    if (!email) {
      return { success: false, reason: 'E-post krävs.' };
    }
    const current = stateRef.current;
    const existing = Object.values(current.users).some(
      (entry) => entry.email?.toLowerCase() === email,
    );
    if (existing) {
      return { success: false, reason: 'E-postadressen finns redan.' };
    }
    const stableId = input.stableId ?? current.currentStableId ?? current.stables[0]?.id;
    if (!stableId) {
      return { success: false, reason: 'Skapa ett stall först.' };
    }
    const user: UserProfile = {
      id: `user-${Date.now()}`,
      name,
      email,
      membership: [
        {
          stableId,
          role: 'rider',
          access: 'view',
          riderRole: 'medryttare',
        },
      ],
      horses: [],
      location: '',
      phone: '',
      responsibilities: [],
      defaultPasses: [],
      awayNotices: [],
      avatar: require('@/assets/images/dummy-avatar.png'),
    };
    dispatch({ type: 'USER_UPSERT', payload: { user } });
    dispatch({ type: 'USER_SET', payload: { id: user.id } });
    return { success: true, data: user };
  }, []);

  const signOut = React.useCallback((): ActionResult => {
    dispatch({ type: 'SESSION_CLEAR' });
    return { success: true };
  }, []);

  const resetAppData = React.useCallback((): ActionResult => {
    dispatch({ type: 'STATE_RESET' });
    void clearPersisted();
    return { success: true };
  }, [clearPersisted]);

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
        updateHorseDayStatus,
        addDayEvent,
        removeDayEvent,
        addArenaBooking,
        updateArenaBooking,
        removeArenaBooking,
        addArenaStatus,
        removeArenaStatus,
        addRideLog,
        removeRideLog,
        addPost,
        togglePostLike,
        addPostComment,
        createGroup,
        renameGroup,
        deleteGroup,
        markConversationRead,
        sendConversationMessage,
        setCurrentStable,
        upsertFarm,
        deleteFarm,
        upsertStable,
        updateStable,
        deleteStable,
        upsertHorse,
        deleteHorse,
        addMember,
        updateMemberRole,
        updateMemberHorseIds,
        toggleMemberDefaultPass,
        removeMemberFromStable,
        setCurrentUser,
        signIn,
        signUp,
        signOut,
        resetAppData,
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
      updateHorseDayStatus,
      addDayEvent,
      removeDayEvent,
      addArenaBooking,
      updateArenaBooking,
      removeArenaBooking,
      addArenaStatus,
      removeArenaStatus,
      addRideLog,
      removeRideLog,
      addPost,
      togglePostLike,
      addPostComment,
      createGroup,
      renameGroup,
      deleteGroup,
      markConversationRead,
      sendConversationMessage,
      setCurrentStable,
      upsertFarm,
      deleteFarm,
      upsertStable,
      updateStable,
      deleteStable,
      upsertHorse,
      deleteHorse,
      addMember,
      updateMemberRole,
      updateMemberHorseIds,
      toggleMemberDefaultPass,
      removeMemberFromStable,
      setCurrentUser,
      signIn,
      signUp,
      signOut,
      resetAppData,
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
