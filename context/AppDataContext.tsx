import React from 'react';
import type { PropsWithChildren } from 'react';
import type { ImageSourcePropType } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { generateId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatTimeAgo } from '@/lib/time';

export type AssignmentStatus = 'open' | 'assigned' | 'completed';
export type AssignmentSlot = 'Morning' | 'Lunch' | 'Evening';
export type AssignmentIcon = 'sun' | 'clock' | 'moon';
export type AssignmentHistoryAction = 'created' | 'assigned' | 'declined' | 'completed';

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

export type ArenaBookingMode = 'open' | 'approval' | 'staff';

export type StableArenaSettings = {
  hasArena: boolean;
  hasSchedule: boolean;
  bookingMode: ArenaBookingMode;
  rules?: string;
};

export type StableSettings = {
  dayLogic: StableDayLogic;
  eventVisibility: StableEventVisibility;
  arena: StableArenaSettings;
};

export type Stable = {
  id: string;
  name: string;
  description?: string;
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
  boxNumber?: string;
  canSleepInside?: boolean;
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

const DEFAULT_PASS_DRAFT_PREFIX = 'default_passes_draft';
const VALID_DEFAULT_SLOTS: AssignmentSlot[] = ['Morning', 'Lunch', 'Evening'];

function buildDefaultPassDraftKey(userId: string) {
  return `${DEFAULT_PASS_DRAFT_PREFIX}:${userId}`;
}

function normalizeDefaultPasses(value: unknown): DefaultPass[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: DefaultPass[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const rawWeekday = (entry as { weekday?: number | string }).weekday;
    const rawSlot = (entry as { slot?: AssignmentSlot }).slot;
    const weekday = typeof rawWeekday === 'number' ? rawWeekday : Number(rawWeekday);
    const slot = rawSlot;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return;
    }
    if (!slot || !VALID_DEFAULT_SLOTS.includes(slot)) {
      return;
    }
    const key = `${weekday}-${slot}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({ weekday: weekday as WeekdayIndex, slot });
  });
  return normalized;
}

async function loadDefaultPassDraft(userId: string): Promise<DefaultPass[]> {
  if (!userId) {
    return [];
  }
  try {
    const stored = await SecureStore.getItemAsync(buildDefaultPassDraftKey(userId));
    if (!stored) {
      return [];
    }
    return normalizeDefaultPasses(JSON.parse(stored));
  } catch {
    return [];
  }
}

async function saveDefaultPassDraft(userId: string, passes: DefaultPass[]) {
  if (!userId) {
    return;
  }
  const normalized = normalizeDefaultPasses(passes);
  const key = buildDefaultPassDraftKey(userId);
  try {
    if (!normalized.length) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
    await SecureStore.setItemAsync(key, JSON.stringify(normalized));
  } catch {
    return;
  }
}

async function clearDefaultPassDraft(userId: string) {
  if (!userId) {
    return;
  }
  try {
    await SecureStore.deleteItemAsync(buildDefaultPassDraftKey(userId));
  } catch {
    return;
  }
}

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
  stableId: string;
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
  onboardingDismissed: boolean;
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
  description?: string;
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
  boxNumber?: string;
  canSleepInside?: boolean;
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

export type UpdateProfileInput = {
  name?: string;
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
    action: AssignmentHistoryAction;
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
    action: AssignmentHistoryAction;
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
  | SessionClearAction;

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; reason: string };

type AppDataContextValue = {
  state: AppDataState;
  hydrating: boolean;
  derived: {
    isFirstTimeOnboarding: boolean;
    canManageOnboardingAny: boolean;
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
    setOnboardingDismissed: (dismissed: boolean) => ActionResult<UserProfile>;
    updateProfile: (input: UpdateProfileInput) => ActionResult<UserProfile>;
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

const defaultArenaSettings: StableArenaSettings = {
  hasArena: false,
  hasSchedule: false,
  bookingMode: 'open',
  rules: '',
};

export function createDefaultStableSettings(): StableSettings {
  return {
    dayLogic: 'box',
    eventVisibility: { ...defaultEventVisibility },
    arena: { ...defaultArenaSettings },
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
    arena: { ...defaults.arena, ...stable.settings.arena },
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
  const isFirstTimeOnboarding = state.stables.length === 0 && user.membership.length === 0;
  const membership = user.membership.find((entry) => entry.stableId === stableId);
  if (!membership) {
    if (isFirstTimeOnboarding && !stableId) {
      return { ...emptyPermissions, canManageOnboarding: true };
    }
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

const referenceDay = new Date();
referenceDay.setHours(0, 0, 0, 0);
const isoDay0 = toISODate(referenceDay);
const isoDay1 = toISODate(addDays(referenceDay, 1));
const isoDay2 = toISODate(addDays(referenceDay, 2));
const todayWeekday = ((referenceDay.getDay() + 6) % 7) as WeekdayIndex;

const initialState: AppDataState = {
  currentStableId: '',
  stables: [],
  farms: [],
  horses: [],
  currentUserId: '',
  sessionUserId: null,
  users: {},
  alerts: [],
  assignments: [],
  assignmentHistory: [],
  messages: [],
  conversations: {},
  posts: [],
  groups: [],
  ridingSchedule: [],
  competitionEvents: [],
  dayEvents: [],
  arenaBookings: [],
  arenaStatuses: [],
  rideLogs: [],
  paddocks: [],
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
              id: generateId(),
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
            id: generateId(),
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
      const hasPreview = state.messages.some((msg) => msg.id === conversationId);
      const updatedPreview = hasPreview
        ? state.messages.map((msg) => (msg.id === conversationId ? preview : msg))
        : [preview, ...state.messages];

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

function hasOwnProperty<T extends object>(target: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function buildAssignmentInsertPayload(assignment: Assignment) {
  return {
    id: assignment.id,
    stable_id: assignment.stableId,
    date: assignment.date,
    slot: assignment.slot,
    label: assignment.label,
    icon: assignment.icon,
    time: assignment.time,
    note: assignment.note ?? null,
    status: assignment.status,
    assignee_id: assignment.assigneeId ?? null,
    completed_at: assignment.completedAt ?? null,
    assigned_via: assignment.assignedVia ?? null,
    declined_by_user_ids: assignment.declinedByUserIds ?? [],
  };
}

function buildAssignmentUpdatePayload(updates: Partial<Assignment>) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (hasOwnProperty(updates, 'stableId')) {
    payload.stable_id = updates.stableId;
  }
  if (hasOwnProperty(updates, 'date')) {
    payload.date = updates.date;
  }
  if (hasOwnProperty(updates, 'slot')) {
    payload.slot = updates.slot;
  }
  if (hasOwnProperty(updates, 'label')) {
    payload.label = updates.label;
  }
  if (hasOwnProperty(updates, 'icon')) {
    payload.icon = updates.icon;
  }
  if (hasOwnProperty(updates, 'time')) {
    payload.time = updates.time;
  }
  if (hasOwnProperty(updates, 'note')) {
    payload.note = updates.note ?? null;
  }
  if (hasOwnProperty(updates, 'status')) {
    payload.status = updates.status;
  }
  if (hasOwnProperty(updates, 'assigneeId')) {
    payload.assignee_id = updates.assigneeId ?? null;
  }
  if (hasOwnProperty(updates, 'assignedVia')) {
    payload.assigned_via = updates.assignedVia ?? null;
  }
  if (hasOwnProperty(updates, 'declinedByUserIds')) {
    payload.declined_by_user_ids = updates.declinedByUserIds ?? [];
  }
  if (hasOwnProperty(updates, 'completedAt')) {
    payload.completed_at = updates.completedAt ?? null;
  }

  return payload;
}

type UploadableImage = {
  uri: string;
  base64?: string;
  mimeType?: string;
};

const imageContentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function getUploadableImage(input: unknown): UploadableImage | null {
  if (!input) {
    return null;
  }
  if (typeof input === 'string') {
    return { uri: input };
  }
  if (typeof input === 'number' || Array.isArray(input)) {
    return null;
  }
  if (typeof input === 'object' && 'uri' in input) {
    const record = input as { uri?: string; base64?: string; mimeType?: string };
    if (!record.uri) {
      return null;
    }
    return {
      uri: record.uri,
      base64: record.base64,
      mimeType: record.mimeType,
    };
  }
  return null;
}

function isRemoteUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function getExtensionFromUri(uri: string, mimeType?: string) {
  if (mimeType) {
    const mapped = Object.entries(imageContentTypes).find(([, value]) => value === mimeType);
    if (mapped) {
      return mapped[0];
    }
  }
  const match = uri.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  return 'jpg';
}

function resolveContentType(extension: string, mimeType?: string) {
  if (mimeType) {
    return mimeType;
  }
  return imageContentTypes[extension] ?? 'image/jpeg';
}

async function resolveBlob(image: UploadableImage, contentType: string) {
  if (image.base64) {
    const base64Payload = image.base64.includes(',')
      ? image.base64.split(',').pop() ?? image.base64
      : image.base64;
    const response = await fetch(`data:${contentType};base64,${base64Payload}`);
    return response.blob();
  }

  const response = await fetch(image.uri);
  return response.blob();
}

async function uploadImageToStorage(bucket: string, pathPrefix: string, image: UploadableImage) {
  const extension = getExtensionFromUri(image.uri, image.mimeType);
  const contentType = resolveContentType(extension, image.mimeType);
  const filePath = `${pathPrefix || 'misc'}/${generateId()}.${extension}`;
  const blob = await resolveBlob(image, contentType);

  const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const stateRef = React.useRef(state);
  const { user } = useAuth();
  const [hydrating, setHydrating] = React.useState(true);

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

  const persistAssignmentInsert = React.useCallback(
    async (assignment: Assignment) => {
      if (!user) return;
      const { error } = await supabase
        .from('assignments')
        .insert(buildAssignmentInsertPayload(assignment));
      if (error) {
        console.warn('Kunde inte spara pass', error);
      }
    },
    [user],
  );

  const persistAssignmentUpdate = React.useCallback(
    async (assignmentId: string, updates: Partial<Assignment>, overrides?: Record<string, unknown>) => {
      if (!user) return;
      const payload = {
        ...buildAssignmentUpdatePayload(updates),
        ...(overrides ?? {}),
      };
      const { error } = await supabase.from('assignments').update(payload).eq('id', assignmentId);
      if (error) {
        console.warn('Kunde inte uppdatera pass', error);
      }
    },
    [user],
  );

  const persistAssignmentDelete = React.useCallback(
    async (assignmentId: string) => {
      if (!user) return;
      const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
      if (error) {
        console.warn('Kunde inte ta bort pass', error);
      }
    },
    [user],
  );

  const persistAssignmentHistory = React.useCallback(
    async (assignment: Assignment, action: AssignmentHistoryAction) => {
      if (!user) return;
      const { error } = await supabase.from('assignment_history').insert({
        id: generateId(),
        stable_id: assignment.stableId,
        assignment_id: assignment.id,
        label: `${assignment.label} ${assignment.time}`.trim(),
        action,
      });
      if (error) {
        console.warn('Kunde inte spara passhistorik', error);
      }
    },
    [user],
  );

  const persistPaddockUpsert = React.useCallback(
    async (paddock: Paddock, imageInput: PaddockImage | null | undefined) => {
      if (!user) return;
      try {
        let imageUrl: string | null | undefined;
        if (imageInput === null) {
          imageUrl = null;
        } else if (paddock.image) {
          const uploadable = getUploadableImage(paddock.image);
          if (uploadable) {
            imageUrl = isRemoteUri(uploadable.uri)
              ? uploadable.uri
              : await uploadImageToStorage('paddocks', paddock.stableId, uploadable);
          }
        }

        const payload: Record<string, unknown> = {
          id: paddock.id,
          stable_id: paddock.stableId,
          name: paddock.name,
          horse_names: paddock.horseNames,
          season: paddock.season ?? 'yearRound',
          updated_at: paddock.updatedAt,
        };
        if (imageUrl !== undefined) {
          payload.image_url = imageUrl;
        }

        const { error } = await supabase.from('paddocks').upsert(payload);
        if (error) {
          console.warn('Kunde inte spara hage', error);
          return;
        }

        if (imageUrl && paddock.image?.uri !== imageUrl) {
          dispatch({
            type: 'PADDOCK_UPSERT',
            payload: { ...paddock, image: { uri: imageUrl } },
          });
        }
      } catch (error) {
        console.warn('Kunde inte spara hage', error);
      }
    },
    [user],
  );

  const persistPaddockDelete = React.useCallback(
    async (paddockId: string) => {
      if (!user) return;
      const { error } = await supabase.from('paddocks').delete().eq('id', paddockId);
      if (error) {
        console.warn('Kunde inte ta bort hage', error);
      }
    },
    [user],
  );

  const persistHorseUpsert = React.useCallback(
    async (horse: Horse) => {
      if (!user) return;
      try {
        let imageUrl: string | null | undefined;
        if (horse.image) {
          const uploadable = getUploadableImage(horse.image);
          if (uploadable) {
            imageUrl = isRemoteUri(uploadable.uri)
              ? uploadable.uri
              : await uploadImageToStorage('avatars', horse.stableId, uploadable);
          }
        }

        const payload: Record<string, unknown> = {
          id: horse.id,
          stable_id: horse.stableId,
          name: horse.name,
          owner_user_id: horse.ownerUserId ?? null,
          box_number: horse.boxNumber ?? null,
          can_sleep_inside: horse.canSleepInside ?? null,
          gender: horse.gender ?? null,
          age: horse.age ?? null,
          note: horse.note ?? null,
        };
        if (imageUrl !== undefined) {
          payload.image_url = imageUrl;
        }

        const { error } = await supabase.from('horses').upsert(payload);
        if (error) {
          console.warn('Kunde inte spara häst', error);
          return;
        }

        const currentUri =
          horse.image && typeof horse.image === 'object' && 'uri' in horse.image
            ? (horse.image as { uri?: string }).uri
            : undefined;
        if (imageUrl && imageUrl !== currentUri) {
          dispatch({
            type: 'HORSE_UPSERT',
            payload: { ...horse, image: { uri: imageUrl } },
          });
        }
      } catch (error) {
        console.warn('Kunde inte spara häst', error);
      }
    },
    [user],
  );

  const persistHorseDelete = React.useCallback(
    async (horseId: string) => {
      if (!user) return;
      const { error } = await supabase.from('horses').delete().eq('id', horseId);
      if (error) {
        console.warn('Kunde inte ta bort häst', error);
      }
    },
    [user],
  );

  const persistHorseDayStatusUpsert = React.useCallback(
    async (status: HorseDayStatus) => {
      if (!user) return;
      const { error } = await supabase.from('horse_day_statuses').upsert(
        {
          id: status.id,
          stable_id: status.stableId,
          horse_id: status.horseId,
          date: status.date,
          day_status: status.dayStatus ?? null,
          night_status: status.nightStatus ?? null,
          checked: status.checked ?? null,
          water: status.water ?? null,
          hay: status.hay ?? null,
        },
        { onConflict: 'stable_id,horse_id,date' },
      );
      if (error) {
        console.warn('Kunde inte spara häststatus', error);
      }
    },
    [user],
  );

  const persistDayEventInsert = React.useCallback(
    async (event: DayEvent) => {
      if (!user) return;
      const { error } = await supabase.from('day_events').insert({
        id: event.id,
        stable_id: event.stableId,
        date: event.date,
        label: event.label,
        tone: event.tone,
      });
      if (error) {
        console.warn('Kunde inte spara dagsnotis', error);
      }
    },
    [user],
  );

  const persistDayEventDelete = React.useCallback(
    async (eventId: string) => {
      if (!user) return;
      const { error } = await supabase.from('day_events').delete().eq('id', eventId);
      if (error) {
        console.warn('Kunde inte ta bort dagsnotis', error);
      }
    },
    [user],
  );

  const persistArenaBookingInsert = React.useCallback(
    async (booking: ArenaBooking) => {
      if (!user) return;
      const { error } = await supabase.from('arena_bookings').insert({
        id: booking.id,
        stable_id: booking.stableId,
        date: booking.date,
        start_time: booking.startTime,
        end_time: booking.endTime,
        purpose: booking.purpose,
        note: booking.note ?? null,
        booked_by_user_id: booking.bookedByUserId,
      });
      if (error) {
        console.warn('Kunde inte spara ridhusbokning', error);
      }
    },
    [user],
  );

  const persistArenaBookingUpdate = React.useCallback(
    async (bookingId: string, updates: Partial<ArenaBooking>) => {
      if (!user) return;
      const payload: Record<string, unknown> = {};
      if (hasOwnProperty(updates, 'date')) {
        payload.date = updates.date;
      }
      if (hasOwnProperty(updates, 'startTime')) {
        payload.start_time = updates.startTime;
      }
      if (hasOwnProperty(updates, 'endTime')) {
        payload.end_time = updates.endTime;
      }
      if (hasOwnProperty(updates, 'purpose')) {
        payload.purpose = updates.purpose;
      }
      if (hasOwnProperty(updates, 'note')) {
        payload.note = updates.note ?? null;
      }
      if (!Object.keys(payload).length) {
        return;
      }
      const { error } = await supabase.from('arena_bookings').update(payload).eq('id', bookingId);
      if (error) {
        console.warn('Kunde inte uppdatera ridhusbokning', error);
      }
    },
    [user],
  );

  const persistArenaBookingDelete = React.useCallback(
    async (bookingId: string) => {
      if (!user) return;
      const { error } = await supabase.from('arena_bookings').delete().eq('id', bookingId);
      if (error) {
        console.warn('Kunde inte ta bort ridhusbokning', error);
      }
    },
    [user],
  );

  const persistArenaStatusInsert = React.useCallback(
    async (status: ArenaStatus) => {
      if (!user) return;
      const { error } = await supabase.from('arena_statuses').insert({
        id: status.id,
        stable_id: status.stableId,
        date: status.date,
        label: status.label,
        created_by_user_id: status.createdByUserId,
      });
      if (error) {
        console.warn('Kunde inte spara ridhusstatus', error);
      }
    },
    [user],
  );

  const persistArenaStatusDelete = React.useCallback(
    async (statusId: string) => {
      if (!user) return;
      const { error } = await supabase.from('arena_statuses').delete().eq('id', statusId);
      if (error) {
        console.warn('Kunde inte ta bort ridhusstatus', error);
      }
    },
    [user],
  );

  const persistRideLogInsert = React.useCallback(
    async (log: RideLogEntry) => {
      if (!user) return;
      const { error } = await supabase.from('ride_logs').insert({
        id: log.id,
        stable_id: log.stableId,
        horse_id: log.horseId,
        date: log.date,
        ride_type_id: log.rideTypeId,
        length: log.length ?? null,
        note: log.note ?? null,
        created_by_user_id: log.createdByUserId,
      });
      if (error) {
        console.warn('Kunde inte spara ridpass', error);
      }
    },
    [user],
  );

  const persistRideLogDelete = React.useCallback(
    async (rideLogId: string) => {
      if (!user) return;
      const { error } = await supabase.from('ride_logs').delete().eq('id', rideLogId);
      if (error) {
        console.warn('Kunde inte ta bort ridpass', error);
      }
    },
    [user],
  );

  const persistAlertInsert = React.useCallback(
    async (alert: AlertMessage) => {
      if (!user) return;
      const { error } = await supabase.from('alerts').insert({
        id: alert.id,
        stable_id: alert.stableId,
        message: alert.message,
        type: alert.type,
      });
      if (error) {
        console.warn('Kunde inte spara notis', error);
      }
    },
    [user],
  );

  const persistDefaultPassToggle = React.useCallback(
    async (input: { userId: string; stableId: string; weekday: WeekdayIndex; slot: AssignmentSlot; enabled: boolean }) => {
      if (!user) return;
      if (!input.stableId) return;
      if (input.enabled) {
        const { error } = await supabase.from('default_passes').insert({
          user_id: input.userId,
          stable_id: input.stableId,
          weekday: input.weekday,
          slot: input.slot,
        });
        if (error && error.code !== '23505') {
          console.warn('Kunde inte spara standardpass', error);
        }
        return;
      }

      const { error } = await supabase
        .from('default_passes')
        .delete()
        .eq('user_id', input.userId)
        .eq('stable_id', input.stableId)
        .eq('weekday', input.weekday)
        .eq('slot', input.slot);
      if (error) {
        console.warn('Kunde inte ta bort standardpass', error);
      }
    },
    [user],
  );

  const persistGroupInsert = React.useCallback(
    async (group: Group) => {
      if (!user) return;
      const { error } = await supabase.from('groups').insert({
        id: group.id,
        stable_id: group.stableId ?? null,
        farm_id: group.farmId ?? null,
        horse_id: group.horseId ?? null,
        name: group.name,
        type: group.type,
        created_by_user_id: group.createdByUserId ?? null,
        created_at: group.createdAt,
      });
      if (error) {
        console.warn('Kunde inte spara grupp', error);
      }
    },
    [user],
  );

  const persistGroupUpdate = React.useCallback(
    async (groupId: string, updates: Partial<Group>) => {
      if (!user) return;
      const payload: Record<string, unknown> = {};
      if (hasOwnProperty(updates, 'name')) {
        payload.name = updates.name;
      }
      if (!Object.keys(payload).length) {
        return;
      }
      const { error } = await supabase.from('groups').update(payload).eq('id', groupId);
      if (error) {
        console.warn('Kunde inte uppdatera grupp', error);
      }
    },
    [user],
  );

  const persistGroupDelete = React.useCallback(
    async (groupId: string) => {
      if (!user) return;
      const { error } = await supabase.from('groups').delete().eq('id', groupId);
      if (error) {
        console.warn('Kunde inte ta bort grupp', error);
      }
    },
    [user],
  );

  const persistPostInsert = React.useCallback(
    async (post: Post, rawImage?: string) => {
      if (!user || !post.stableId) return;
      try {
        let imageUrl: string | null | undefined;
        if (rawImage) {
          const uploadable = getUploadableImage(rawImage);
          if (uploadable) {
            imageUrl = isRemoteUri(uploadable.uri)
              ? uploadable.uri
              : await uploadImageToStorage('posts', post.stableId, uploadable);
          }
        }

        const { error } = await supabase.from('posts').insert({
          id: post.id,
          stable_id: post.stableId,
          user_id: user.id,
          content: post.content ?? null,
          group_ids: post.groupIds ?? [],
          media_type: imageUrl ? 'image' : 'text',
          image_url: imageUrl ?? null,
        });
        if (error) {
          console.warn('Kunde inte spara inlägg', error);
          return;
        }

        if (imageUrl && imageUrl !== post.image) {
          dispatch({
            type: 'POST_UPDATE',
            payload: { id: post.id, updates: { image: imageUrl } },
          });
        }
      } catch (error) {
        console.warn('Kunde inte spara inlägg', error);
      }
    },
    [user],
  );

  const persistPostLikeToggle = React.useCallback(
    async (postId: string, userId: string, enabled: boolean) => {
      if (!user) return;
      if (enabled) {
        const { error } = await supabase.from('likes').insert({ user_id: userId, post_id: postId });
        if (error && error.code !== '23505') {
          console.warn('Kunde inte gilla inlägg', error);
        }
        return;
      }

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId);
      if (error) {
        console.warn('Kunde inte ta bort gillning', error);
      }
    },
    [user],
  );

  const persistPostCommentInsert = React.useCallback(
    async (postId: string, userId: string, text: string) => {
      if (!user) return;
      const { error } = await supabase.from('comments').insert({
        user_id: userId,
        post_id: postId,
        content: text,
      });
      if (error) {
        console.warn('Kunde inte spara kommentar', error);
      }
    },
    [user],
  );

  const persistFarmUpsert = React.useCallback(
    async (farm: Farm) => {
      if (!user) return;
      const { error } = await supabase.from('farms').upsert({
        id: farm.id,
        name: farm.name,
        location: farm.location ?? null,
        has_indoor_arena: farm.hasIndoorArena ?? null,
        arena_note: farm.arenaNote ?? null,
      });
      if (error) {
        console.warn('Kunde inte spara gård', error);
      }
    },
    [user],
  );

  const persistFarmDelete = React.useCallback(
    async (farmId: string) => {
      if (!user) return;
      const { error } = await supabase.from('farms').delete().eq('id', farmId);
      if (error) {
        console.warn('Kunde inte ta bort gård', error);
      }
    },
    [user],
  );

  const persistStableUpsert = React.useCallback(
    async (stable: Stable, isNew: boolean, ownerId: string) => {
      if (!user) return;
      const payload: Record<string, unknown> = {
        id: stable.id,
        name: stable.name,
        description: stable.description ?? null,
        location: stable.location ?? null,
        farm_id: stable.farmId ?? null,
        settings: stable.settings ?? null,
        ride_types: stable.rideTypes ?? [],
      };
      if (isNew) {
        payload.created_by = ownerId;
      }
      const { error } = await supabase.from('stables').upsert(payload);
      if (error) {
        console.warn('Kunde inte spara stall', error);
        return;
      }

      if (isNew) {
        const { error: memberError } = await supabase.from('stable_members').upsert(
          {
            stable_id: stable.id,
            user_id: ownerId,
            role: 'admin',
            access: 'owner',
            rider_role: 'owner',
          },
          { onConflict: 'stable_id,user_id' },
        );
        if (memberError) {
          console.warn('Kunde inte koppla admin till stallet', memberError);
        }
        const { error: conversationError } = await supabase.from('conversations').insert({
          stable_id: stable.id,
          title: stable.name,
          is_group: true,
          created_by_user_id: ownerId,
        });
        if (conversationError && conversationError.code !== '23505') {
          console.warn('Kunde inte skapa gruppkonversation', conversationError);
        }
      }
    },
    [user],
  );

  const persistStableUpdate = React.useCallback(
    async (stableId: string, updates: Partial<Stable>) => {
      if (!user) return;
      const payload: Record<string, unknown> = {};
      if (hasOwnProperty(updates, 'name')) {
        payload.name = updates.name;
      }
      if (hasOwnProperty(updates, 'description')) {
        payload.description = updates.description ?? null;
      }
      if (hasOwnProperty(updates, 'location')) {
        payload.location = updates.location ?? null;
      }
      if (hasOwnProperty(updates, 'farmId')) {
        payload.farm_id = updates.farmId ?? null;
      }
      if (hasOwnProperty(updates, 'settings')) {
        payload.settings = updates.settings ?? null;
      }
      if (hasOwnProperty(updates, 'rideTypes')) {
        payload.ride_types = updates.rideTypes ?? [];
      }
      if (!Object.keys(payload).length) {
        return;
      }
      const { error } = await supabase.from('stables').update(payload).eq('id', stableId);
      if (error) {
        console.warn('Kunde inte uppdatera stall', error);
        return;
      }
      if (hasOwnProperty(updates, 'name')) {
        const { error: conversationError } = await supabase
          .from('conversations')
          .update({ title: updates.name ?? null })
          .eq('stable_id', stableId)
          .eq('is_group', true);
        if (conversationError) {
          console.warn('Kunde inte uppdatera stallchatten', conversationError);
        }
      }
    },
    [user],
  );

  const persistStableDelete = React.useCallback(
    async (stableId: string) => {
      if (!user) return;
      const { error } = await supabase.from('stables').delete().eq('id', stableId);
      if (error) {
        console.warn('Kunde inte ta bort stall', error);
      }
    },
    [user],
  );

  const persistStableInvite = React.useCallback(
    async (input: AddMemberInput, stableIds: string[]) => {
      if (!user) return;
      const invites = stableIds.map((stableId) => ({
        stable_id: stableId,
        email: input.email.trim(),
        role: input.role,
        custom_role: input.customRole?.trim() || null,
        access: input.access ?? 'view',
        rider_role: input.role === 'rider' ? input.riderRole ?? 'medryttare' : null,
        horse_ids: stableId === input.stableId ? input.horseIds ?? [] : [],
        code: null,
      }));
      const { error } = await supabase.from('stable_invites').insert(invites);
      if (error) {
        console.warn('Kunde inte skicka inbjudan', error);
      }
    },
    [user],
  );

  const persistStableMemberUpdate = React.useCallback(
    async (stableId: string, userId: string, updates: Partial<StableMembership>) => {
      if (!user) return;
      const payload: Record<string, unknown> = {};
      if (hasOwnProperty(updates, 'role')) {
        payload.role = updates.role;
      }
      if (hasOwnProperty(updates, 'customRole')) {
        payload.custom_role = updates.customRole ?? null;
      }
      if (hasOwnProperty(updates, 'access')) {
        payload.access = updates.access ?? null;
      }
      if (hasOwnProperty(updates, 'horseIds')) {
        payload.horse_ids = updates.horseIds ?? [];
      }
      if (hasOwnProperty(updates, 'riderRole')) {
        payload.rider_role = updates.riderRole ?? null;
      }
      if (!Object.keys(payload).length) {
        return;
      }
      const { error } = await supabase
        .from('stable_members')
        .update(payload)
        .eq('stable_id', stableId)
        .eq('user_id', userId);
      if (error) {
        console.warn('Kunde inte uppdatera medlem', error);
      }
    },
    [user],
  );

  const persistStableMemberDelete = React.useCallback(
    async (stableId: string, userId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('stable_members')
        .delete()
        .eq('stable_id', stableId)
        .eq('user_id', userId);
      if (error) {
        console.warn('Kunde inte ta bort medlem', error);
      }
    },
    [user],
  );

  const persistProfileUpdate = React.useCallback(
    async (userId: string, updates: Record<string, unknown>) => {
      if (!user) return;
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (error) {
        if (
          error.code === 'PGRST204' &&
          typeof error.message === 'string' &&
          error.message.includes('onboarding_dismissed')
        ) {
          return;
        }
        console.warn('Kunde inte uppdatera profil', error);
      }
    },
    [user],
  );

  const persistConversationMessage = React.useCallback(
    async (message: ConversationMessage) => {
      if (!user) return;
      const { error } = await supabase.from('messages').insert({
        id: message.id,
        conversation_id: message.conversationId,
        author_id: message.authorId,
        text: message.text,
        status: message.status ?? null,
      });
      if (error) {
        console.warn('Kunde inte spara meddelande', error);
      }
    },
    [user],
  );

  React.useEffect(() => {
    if (!user) {
      dispatch({ type: 'STATE_RESET' });
      setHydrating(false);
      return;
    }

    let cancelled = false;
    setHydrating(true);

    const hydrate = async () => {
      const membershipResult = await supabase
        .from('stable_members')
        .select('*')
        .eq('user_id', user.id);
      if (membershipResult.error || !membershipResult.data) {
        console.warn('Kunde inte hämta medlemskap', membershipResult.error);
        setHydrating(false);
        return;
      }
      const myMembership = membershipResult.data;
      const stableIds = myMembership.map((row) => row.stable_id);
      if (stableIds.length === 0) {
        const profilesResult = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const profile = profilesResult.data;
        if (!profile) {
          setHydrating(false);
          return;
        }
        const draftDefaultPasses = await loadDefaultPassDraft(user.id);
        const userProfile: UserProfile = {
          id: user.id,
          name: profile.full_name || profile.username || 'Okänd',
          email: '',
          membership: [],
          horses: [],
          location: profile.location ?? '',
          phone: profile.phone ?? '',
          responsibilities: profile.responsibilities ?? [],
          defaultPasses: draftDefaultPasses,
          awayNotices: [],
          avatar: profile.avatar_url ? { uri: profile.avatar_url } : undefined,
          onboardingDismissed: profile.onboarding_dismissed ?? false,
        };
        if (!cancelled) {
          dispatch({
            type: 'STATE_HYDRATE',
            payload: {
              users: { [user.id]: userProfile },
              currentUserId: user.id,
              sessionUserId: user.id,
              messages: [],
              conversations: {},
            },
          });
          setHydrating(false);
        }
        return;
      }
      const allMembershipResult = await supabase
        .from('stable_members')
        .select('*')
        .in('stable_id', stableIds);
      const membership = allMembershipResult.data ?? myMembership;

      const [
        stablesResult,
        farmsResult,
        horsesResult,
        paddocksResult,
        assignmentsResult,
        assignmentHistoryResult,
        dayEventsResult,
        arenaBookingsResult,
        arenaStatusesResult,
        rideLogsResult,
        horseDayStatusesResult,
        alertsResult,
        ridingDaysResult,
        competitionEventsResult,
        groupsResult,
        defaultPassesResult,
        awayNoticesResult,
        conversationsResult,
      ] = await Promise.all([
        supabase.from('stables').select('*').in('id', stableIds),
        supabase.from('farms').select('*'),
        supabase.from('horses').select('*').in('stable_id', stableIds),
        supabase.from('paddocks').select('*').in('stable_id', stableIds),
        supabase.from('assignments').select('*').in('stable_id', stableIds),
        supabase.from('assignment_history').select('*').in('stable_id', stableIds),
        supabase.from('day_events').select('*').in('stable_id', stableIds),
        supabase.from('arena_bookings').select('*').in('stable_id', stableIds),
        supabase.from('arena_statuses').select('*').in('stable_id', stableIds),
        supabase.from('ride_logs').select('*').in('stable_id', stableIds),
        supabase.from('horse_day_statuses').select('*').in('stable_id', stableIds),
        supabase.from('alerts').select('*').in('stable_id', stableIds),
        supabase.from('riding_days').select('*').in('stable_id', stableIds),
        supabase.from('competition_events').select('*').in('stable_id', stableIds),
        supabase.from('groups').select('*').in('stable_id', stableIds),
        supabase.from('default_passes').select('*').in('stable_id', stableIds),
        supabase.from('away_notices').select('*').in('stable_id', stableIds),
        supabase.from('conversations').select('*').in('stable_id', stableIds).eq('is_group', true),
      ]);

      const stableRows = stablesResult.data ?? [];
      const farmRows = farmsResult.data ?? [];
      const horseRows = horsesResult.data ?? [];
      const paddockRows = paddocksResult.data ?? [];
      const assignmentRows = assignmentsResult.data ?? [];
      const assignmentHistoryRows = assignmentHistoryResult.data ?? [];
      const dayEventRows = dayEventsResult.data ?? [];
      const arenaBookingRows = arenaBookingsResult.data ?? [];
      const arenaStatusRows = arenaStatusesResult.data ?? [];
      const rideLogRows = rideLogsResult.data ?? [];
      const horseStatusRows = horseDayStatusesResult.data ?? [];
      const alertRows = alertsResult.data ?? [];
      const ridingDayRows = ridingDaysResult.data ?? [];
      const competitionRows = competitionEventsResult.data ?? [];
      const groupRows = groupsResult.data ?? [];
      const defaultPassRows = defaultPassesResult.data ?? [];
      const awayNoticeRows = awayNoticesResult.data ?? [];
      let conversationRows = conversationsResult.data ?? [];

      const stableById = stableRows.reduce<Record<string, (typeof stableRows)[number]>>(
        (acc, stable) => {
          acc[stable.id] = stable;
          return acc;
        },
        {},
      );
      const conversationStableIds = new Set<string>(
        conversationRows.map((row) => row.stable_id).filter((id): id is string => Boolean(id)),
      );
      const missingConversationStableIds = stableIds.filter((stableId) => !conversationStableIds.has(stableId));
      if (missingConversationStableIds.length) {
        const inserts = missingConversationStableIds.map((stableId) => ({
          stable_id: stableId,
          title: stableById[stableId]?.name ?? null,
          is_group: true,
          created_by_user_id: user.id,
        }));
        const insertResult = await supabase.from('conversations').insert(inserts).select('*');
        if (insertResult.error && insertResult.error.code !== '23505') {
          console.warn('Kunde inte skapa gruppkonversation', insertResult.error);
        } else if (insertResult.data) {
          conversationRows = [...conversationRows, ...insertResult.data];
        }
      }

      const profileIds = new Set<string>([user.id]);
      membership.forEach((row) => profileIds.add(row.user_id));
      const profilesResult = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(profileIds));

      const profiles = profilesResult.data ?? [];
      const profilesById = profiles.reduce<Record<string, (typeof profiles)[number]>>(
        (acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        },
        {},
      );

      const userMap: Record<string, UserProfile> = {};
      membership.forEach((row) => {
        const profile = profilesById[row.user_id];
        if (!profile) {
          return;
        }
        const existing = userMap[row.user_id];
        const base: UserProfile = existing ?? {
          id: row.user_id,
          name: profile.full_name || profile.username || 'Okänd',
          email: '',
          membership: [],
          horses: [],
          location: profile.location ?? '',
          phone: profile.phone ?? '',
          responsibilities: profile.responsibilities ?? [],
          defaultPasses: [],
          awayNotices: [],
          avatar: profile.avatar_url ? { uri: profile.avatar_url } : undefined,
          onboardingDismissed: profile.onboarding_dismissed ?? false,
        };

        base.membership = [
          ...base.membership,
          {
            stableId: row.stable_id,
            role: row.role ?? 'guest',
            customRole: row.custom_role ?? undefined,
            access: row.access ?? 'view',
            horseIds: row.horse_ids ?? [],
            riderRole: row.rider_role ?? undefined,
          },
        ];

        userMap[row.user_id] = base;
      });

      if (!userMap[user.id]) {
        const profile = profilesById[user.id];
        if (profile) {
          userMap[user.id] = {
            id: user.id,
            name: profile.full_name || profile.username || 'Okänd',
            email: '',
            membership: [],
            horses: [],
            location: profile.location ?? '',
            phone: profile.phone ?? '',
            responsibilities: profile.responsibilities ?? [],
            defaultPasses: [],
            awayNotices: [],
            avatar: profile.avatar_url ? { uri: profile.avatar_url } : undefined,
            onboardingDismissed: profile.onboarding_dismissed ?? false,
          };
        }
      }

      defaultPassRows.forEach((entry) => {
        const target = userMap[entry.user_id];
        if (!target) return;
        target.defaultPasses = [
          ...target.defaultPasses,
          { weekday: entry.weekday as WeekdayIndex, slot: entry.slot as AssignmentSlot },
        ];
      });

      awayNoticeRows.forEach((entry) => {
        const target = userMap[entry.user_id];
        if (!target) return;
        target.awayNotices = [
          ...target.awayNotices,
          { id: entry.id, start: entry.start, end: entry.end, note: entry.note ?? '' },
        ];
      });

      horseRows.forEach((horse) => {
        const ownerId = horse.owner_user_id;
        if (!ownerId || !userMap[ownerId]) return;
        const current = userMap[ownerId].horses;
        if (!current.includes(horse.name)) {
          userMap[ownerId].horses = [...current, horse.name];
        }
      });

      const postsResult = await supabase
        .from('posts')
        .select('*')
        .in('stable_id', stableIds)
        .order('created_at', { ascending: false });
      const postRows = postsResult.data ?? [];
      const postIds = postRows.map((post) => post.id);

      const [likesResult, commentsResult] = await Promise.all([
        postIds.length ? supabase.from('likes').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from('comments').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
      ]);

      const likes = likesResult.data ?? [];
      const comments = commentsResult.data ?? [];

      const commentsByPost = comments.reduce<Record<string, PostComment[]>>((acc, comment) => {
        const list = acc[comment.post_id] ?? [];
        const authorProfile = profilesById[comment.user_id];
        list.push({
          id: comment.id.toString(),
          postId: comment.post_id,
          authorId: comment.user_id,
          authorName: authorProfile?.full_name || authorProfile?.username || 'Okänd',
          text: comment.content,
          createdAt: comment.created_at,
        });
        acc[comment.post_id] = list;
        return acc;
      }, {});

      const likedByPost = likes.reduce<Record<string, string[]>>((acc, like) => {
        const list = acc[like.post_id] ?? [];
        list.push(like.user_id);
        acc[like.post_id] = list;
        return acc;
      }, {});

      const posts = postRows.map((post) => {
        const authorProfile = profilesById[post.user_id];
        const likedByUserIds = likedByPost[post.id] ?? [];
        const commentsData = commentsByPost[post.id] ?? [];
        return {
          id: post.id,
          author: authorProfile?.full_name || authorProfile?.username || 'Okänd',
          avatar: authorProfile?.avatar_url ? { uri: authorProfile.avatar_url } : require('@/assets/images/dummy-avatar.png'),
          timeAgo: 'Nu',
          createdAt: post.created_at,
          content: post.content ?? post.caption ?? '',
          image: post.image_url ?? post.image ?? undefined,
          likes: likedByUserIds.length,
          comments: commentsData.length,
          likedByUserIds,
          commentsData,
          stableId: post.stable_id ?? undefined,
          groupIds: post.group_ids ?? undefined,
        } as Post;
      });

      const conversationIds = conversationRows.map((row) => row.id);
      const messagesResult = conversationIds.length
        ? await supabase
            .from('messages')
            .select('*')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: true })
        : { data: [] as any[] };
      const messageRows = messagesResult.data ?? [];
      const conversations = messageRows.reduce<Record<string, ConversationMessage[]>>((acc, row) => {
        const list = acc[row.conversation_id] ?? [];
        list.push({
          id: row.id,
          conversationId: row.conversation_id,
          authorId: row.author_id,
          text: row.text,
          timestamp: row.created_at,
          status: row.status ?? undefined,
        });
        acc[row.conversation_id] = list;
        return acc;
      }, {});

      const messagePreviews = conversationRows
        .map((row) => {
          const stable = row.stable_id ? stableById[row.stable_id] : undefined;
          const previewMessages = conversations[row.id] ?? [];
          const lastMessage = previewMessages.length
            ? previewMessages[previewMessages.length - 1]
            : undefined;
          const sortTime = lastMessage?.timestamp ?? row.created_at ?? '';
          const sortMs = sortTime ? new Date(sortTime).getTime() : 0;
          const preview: MessagePreview = {
            id: row.id,
            title: row.title ?? stable?.name ?? 'Konversation',
            subtitle: stable?.location ?? (row.is_group ? 'Gruppchatt' : ''),
            description: lastMessage?.text ?? 'Inga meddelanden ännu',
            timeAgo: sortTime ? formatTimeAgo(sortTime) : '',
            unreadCount: 0,
            group: row.is_group ?? false,
            stableId: row.stable_id ?? undefined,
          };
          return { preview, sortMs };
        })
        .sort((a, b) => b.sortMs - a.sortMs)
        .map((entry) => entry.preview);

      const formattedStables: Stable[] = stableRows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        location: row.location ?? undefined,
        farmId: row.farm_id ?? undefined,
        rideTypes: (row.ride_types as RideType[] | null) ?? undefined,
        settings: (row.settings as StableSettings | null) ?? undefined,
      }));

      const formattedFarms: Farm[] = farmRows.map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location ?? undefined,
        hasIndoorArena: row.has_indoor_arena ?? undefined,
        arenaNote: row.arena_note ?? undefined,
      }));

      const formattedHorses: Horse[] = horseRows.map((row) => ({
        id: row.id,
        name: row.name,
        stableId: row.stable_id,
        ownerUserId: row.owner_user_id ?? undefined,
        boxNumber: row.box_number ?? undefined,
        canSleepInside: row.can_sleep_inside ?? undefined,
        gender: row.gender ?? undefined,
        age: row.age ?? undefined,
        note: row.note ?? undefined,
        image: row.image_url ? { uri: row.image_url } : undefined,
      }));

      const formattedPaddocks: Paddock[] = paddockRows.map((row) => ({
        id: row.id,
        name: row.name,
        stableId: row.stable_id,
        horseNames: row.horse_names ?? [],
        updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
        season: row.season ?? 'yearRound',
        image: row.image_url ? { uri: row.image_url } : undefined,
      }));

      const formattedAssignments: Assignment[] = assignmentRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        date: row.date,
        label: row.label,
        slot: row.slot,
        icon: row.icon,
        time: row.time,
        note: row.note ?? undefined,
        status: row.status,
        assigneeId: row.assignee_id ?? undefined,
        completedAt: row.completed_at ?? undefined,
        assignedVia: row.assigned_via ?? undefined,
        declinedByUserIds: row.declined_by_user_ids ?? [],
      }));

      const formattedAssignmentHistory = assignmentHistoryRows
        .map((row) => ({
          id: row.id,
          assignmentId: row.assignment_id,
          label: row.label,
          timestamp: row.created_at,
          action: row.action as AssignmentHistoryAction,
        }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const formattedDayEvents: DayEvent[] = dayEventRows.map((row) => ({
        id: row.id,
        date: row.date,
        stableId: row.stable_id,
        label: row.label,
        tone: row.tone,
      }));

      const formattedArenaBookings: ArenaBooking[] = arenaBookingRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        date: row.date,
        startTime: row.start_time,
        endTime: row.end_time,
        purpose: row.purpose,
        note: row.note ?? undefined,
        bookedByUserId: row.booked_by_user_id,
      }));

      const formattedArenaStatuses: ArenaStatus[] = arenaStatusRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        date: row.date,
        label: row.label,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
      }));

      const formattedRideLogs: RideLogEntry[] = rideLogRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        horseId: row.horse_id,
        date: row.date,
        rideTypeId: row.ride_type_id,
        length: row.length ?? undefined,
        note: row.note ?? undefined,
        createdByUserId: row.created_by_user_id,
      }));

      const formattedHorseStatuses: HorseDayStatus[] = horseStatusRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        horseId: row.horse_id,
        date: row.date,
        dayStatus: row.day_status ?? undefined,
        nightStatus: row.night_status ?? undefined,
        checked: row.checked ?? undefined,
        water: row.water ?? undefined,
        hay: row.hay ?? undefined,
      }));

      const formattedAlerts: AlertMessage[] = alertRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        message: row.message,
        type: row.type,
        createdAt: row.created_at,
      }));

      const formattedRidingDays: RidingDay[] = ridingDayRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        label: row.label,
        upcomingRides: row.upcoming_rides ?? undefined,
        isToday: row.is_today ?? undefined,
      }));

      const formattedCompetitionEvents: CompetitionEvent[] = competitionRows.map((row) => ({
        id: row.id,
        start: row.start,
        end: row.end,
        title: row.title,
        status: row.status,
      }));

      const formattedGroups: Group[] = groupRows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        stableId: row.stable_id ?? undefined,
        farmId: row.farm_id ?? undefined,
        horseId: row.horse_id ?? undefined,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id ?? undefined,
      }));

      if (cancelled) {
        return;
      }

      const previousStableId = stateRef.current.currentStableId;
      const currentStableId = stableIds.includes(previousStableId) ? previousStableId : stableIds[0] ?? '';
      dispatch({
        type: 'STATE_HYDRATE',
        payload: {
          farms: formattedFarms,
          stables: formattedStables,
          horses: formattedHorses,
          paddocks: formattedPaddocks,
          assignments: formattedAssignments,
          assignmentHistory: formattedAssignmentHistory,
          dayEvents: formattedDayEvents,
          arenaBookings: formattedArenaBookings,
          arenaStatuses: formattedArenaStatuses,
          rideLogs: formattedRideLogs,
          horseDayStatuses: formattedHorseStatuses,
          alerts: formattedAlerts,
          ridingSchedule: formattedRidingDays,
          competitionEvents: formattedCompetitionEvents,
          posts,
          messages: messagePreviews,
          conversations,
          groups: formattedGroups,
          users: userMap,
          currentStableId,
          currentUserId: user.id,
          sessionUserId: user.id,
        },
      });
      setHydrating(false);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    if (hydrating) {
      return;
    }
    const stableId = state.currentStableId;
    const userId = state.currentUserId;
    if (!stableId || !userId) {
      return;
    }

    let cancelled = false;

    const applyDraft = async () => {
      const draft = await loadDefaultPassDraft(userId);
      if (cancelled || !draft.length) {
        return;
      }
      const currentUser = stateRef.current.users[userId];
      if (!currentUser) {
        return;
      }
      if (currentUser.defaultPasses.length === 0) {
        dispatch({
          type: 'USER_UPDATE',
          payload: { id: userId, updates: { defaultPasses: draft } },
        });
      }
      draft.forEach((entry) => {
        void persistDefaultPassToggle({
          userId,
          stableId,
          weekday: entry.weekday,
          slot: entry.slot,
          enabled: true,
        });
      });
      await clearDefaultPassDraft(userId);
    };

    void applyDraft();

    return () => {
      cancelled = true;
    };
  }, [hydrating, persistDefaultPassToggle, state.currentStableId, state.currentUserId]);

  React.useEffect(() => {
    if (hydrating) {
      return;
    }
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
        void persistAssignmentUpdate(assignment.id, {
          status: 'assigned',
          assigneeId: candidate.id,
          assignedVia: 'default',
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
          void persistAssignmentUpdate(assignment.id, {
            status: 'open',
            assigneeId: undefined,
            assignedVia: undefined,
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
          void persistAssignmentUpdate(assignment.id, {
            status: 'open',
            assigneeId: undefined,
            assignedVia: undefined,
          });
        }
      }
    });
  }, [hydrating, persistAssignmentUpdate, state.assignments, state.users]);

  const derived = React.useMemo(() => {
    const { assignments, alerts, currentUserId, currentStableId } = state;
    const currentUser = state.users[currentUserId];
    const membership = state.users[currentUserId]?.membership.find((m) => m.stableId === currentStableId);
    const currentAccess = membership?.access ?? 'view';
    const currentRole = membership?.role ?? 'guest';
    const permissions = resolvePermissions(state, currentStableId, currentUserId);
    const activeAssignments = assignments.filter((assignment) => assignment.stableId === currentStableId);
    const stableAlerts = alerts.filter((alert) => alert.stableId === currentStableId);
    const completed = activeAssignments.filter((assignment) => assignment.status === 'completed').length;
    const open = activeAssignments.filter((assignment) => assignment.status === 'open').length;
    const isFirstTimeOnboarding =
      state.stables.length === 0 && (currentUser?.membership.length ?? 0) === 0;
    const canManageOnboardingAny =
      isFirstTimeOnboarding ||
      (currentUser?.membership ?? []).some(
        (entry) => entry.role === 'admin' && (entry.access ?? 'view') === 'owner',
      );
    const summary = {
      total: activeAssignments.length,
      completed,
      open,
      alerts: stableAlerts.length,
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
      isFirstTimeOnboarding,
      canManageOnboardingAny,
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
    const updated = { ...assignment, status: 'completed' as AssignmentStatus, completedAt };
    void persistAssignmentUpdate(assignment.id, {
      status: 'completed',
      completedAt,
    });
    void persistAssignmentHistory(updated, 'completed');

    return { success: true, data: updated };
  }, [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate]);

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

    const updated: Assignment = {
      ...assignment,
      status: 'assigned',
      assigneeId: current.currentUserId,
      assignedVia: 'manual',
      declinedByUserIds,
    };
    void persistAssignmentUpdate(assignment.id, {
      status: 'assigned',
      assigneeId: current.currentUserId,
      assignedVia: 'manual',
      declinedByUserIds,
    });
    void persistAssignmentHistory(updated, 'assigned');

    return {
      success: true,
      data: updated,
    };
  }, [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate]);

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

      const updated: Assignment = {
        ...assignment,
        status: 'assigned',
        assigneeId: current.currentUserId,
        assignedVia: 'manual',
        declinedByUserIds,
      };
      void persistAssignmentUpdate(assignment.id, {
        status: 'assigned',
        assigneeId: current.currentUserId,
        assignedVia: 'manual',
        declinedByUserIds,
      });
      void persistAssignmentHistory(updated, 'assigned');

      return {
        success: true,
        data: updated,
      };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate],
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

      const updated: Assignment = {
        ...assignment,
        status: 'open',
        assigneeId: undefined,
        assignedVia: undefined,
        declinedByUserIds: Array.from(declined),
      };
      void persistAssignmentUpdate(assignment.id, {
        status: 'open',
        assigneeId: undefined,
        assignedVia: undefined,
        declinedByUserIds: Array.from(declined),
      });
      void persistAssignmentHistory(updated, 'declined');

      return {
        success: true,
        data: updated,
      };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate],
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

      const updated: Assignment = {
        ...assignment,
        status: 'completed',
        completedAt,
      };
      void persistAssignmentUpdate(assignment.id, {
        status: 'completed',
        completedAt,
      });
      void persistAssignmentHistory(updated, 'completed');

      return {
        success: true,
        data: updated,
      };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate],
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
        id: generateId(),
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
      void persistAssignmentInsert(assignment);
      void persistAssignmentHistory(assignment, 'created');

      return { success: true, data: assignment };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentInsert],
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

      const updated = { ...existing, ...updates };
      void persistAssignmentUpdate(existing.id, updates);
      if (updates.status) {
        const action: AssignmentHistoryAction =
          updates.status === 'completed'
            ? 'completed'
            : updates.status === 'open'
              ? 'declined'
              : 'assigned';
        void persistAssignmentHistory(updated, action);
      }

      return { success: true, data: updated };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentUpdate],
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
      void persistAssignmentDelete(assignmentId);
      return { success: true };
    },
    [ensurePermission, persistAssignmentDelete],
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
        id: generateId(),
        stableId: current.currentStableId,
        message,
        type,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ALERT_ADD', payload: alert });
      void persistAlertInsert(alert);
      return { success: true, data: alert };
    },
    [ensurePermission, persistAlertInsert],
  );

  const toggleDefaultPass = React.useCallback(
    (weekday: WeekdayIndex, slot: AssignmentSlot): ActionResult<UserProfile> => {
      const current = stateRef.current;
      const user = current.users[current.currentUserId];
      if (!user) {
        return { success: false, reason: 'Användaren kunde inte hittas.' };
      }

      const stableId = current.currentStableId;
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

      if (!stableId) {
        void saveDefaultPassDraft(user.id, nextDefaultPasses);
        return { success: true, data: { ...user, defaultPasses: nextDefaultPasses } };
      }

      void persistDefaultPassToggle({
        userId: user.id,
        stableId,
        weekday,
        slot,
        enabled: !exists,
      });

      return { success: true, data: { ...user, defaultPasses: nextDefaultPasses } };
    },
    [persistDefaultPassToggle],
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
      if (!current.currentUserId) {
        return { success: false, reason: 'Ingen inloggad användare.' };
      }
      const timestamp = new Date().toISOString();
      const message: ConversationMessage = {
        id: generateId(),
        conversationId,
        authorId: current.currentUserId,
        text: text.trim(),
        timestamp,
        status: 'sent',
      };

      const existingPreview = current.messages.find((msg) => msg.id === conversationId);
      const preview: MessagePreview = {
        ...(existingPreview ?? {
          id: conversationId,
          title: 'Konversation',
          subtitle: '',
          description: '',
          timeAgo: '',
        }),
        stableId: existingPreview?.stableId ?? current.currentStableId,
        description: text.trim(),
        timeAgo: formatTimeAgo(timestamp),
        unreadCount: 0,
      };

      dispatch({
        type: 'CONVERSATION_APPEND',
        payload: { conversationId, message, preview },
      });
      void persistConversationMessage(message);

      return { success: true, data: message };
    },
    [persistConversationMessage],
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

      const id = existing?.id ?? input.id ?? generateId();
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
      void persistPaddockUpsert(paddock, input.image);
      return { success: true, data: paddock };
    },
    [ensurePermission, persistPaddockUpsert],
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
    void persistPaddockDelete(paddockId);
    return { success: true };
  }, [ensurePermission, persistPaddockDelete]);

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
      const id = existing?.id ?? generateId();
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
      void persistHorseDayStatusUpsert(next);
      return { success: true, data: next };
    },
    [ensurePermission, persistHorseDayStatusUpsert],
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
        id: generateId(),
        stableId,
        date: input.date,
        label,
        tone: input.tone ?? 'info',
      };
      dispatch({ type: 'DAY_EVENT_ADD', payload: event });
      void persistDayEventInsert(event);
      return { success: true, data: event };
    },
    [ensurePermission, persistDayEventInsert],
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
      void persistDayEventDelete(eventId);
      return { success: true };
    },
    [ensurePermission, persistDayEventDelete],
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
        id: generateId(),
        stableId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        purpose,
        note: input.note?.trim() || undefined,
        bookedByUserId: current.currentUserId,
      };
      dispatch({ type: 'ARENA_BOOKING_ADD', payload: booking });
      void persistArenaBookingInsert(booking);
      return { success: true, data: booking };
    },
    [ensurePermission, persistArenaBookingInsert],
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
      void persistArenaBookingUpdate(input.id, updates);
      return { success: true, data: updated };
    },
    [ensurePermission, persistArenaBookingUpdate],
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
      void persistArenaBookingDelete(bookingId);
      return { success: true };
    },
    [ensurePermission, persistArenaBookingDelete],
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
        id: generateId(),
        stableId,
        date: input.date,
        label,
        createdByUserId: current.currentUserId,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ARENA_STATUS_ADD', payload: status });
      void persistArenaStatusInsert(status);
      return { success: true, data: status };
    },
    [ensurePermission, persistArenaStatusInsert],
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
      void persistArenaStatusDelete(statusId);
      return { success: true };
    },
    [ensurePermission, persistArenaStatusDelete],
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
        id: generateId(),
        stableId,
        horseId: input.horseId,
        date: input.date,
        rideTypeId: input.rideTypeId,
        length: input.length?.trim() || undefined,
        note: input.note?.trim() || undefined,
        createdByUserId: current.currentUserId,
      };
      dispatch({ type: 'RIDE_LOG_ADD', payload: log });
      void persistRideLogInsert(log);
      return { success: true, data: log };
    },
    [ensurePermission, persistRideLogInsert],
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
      void persistRideLogDelete(rideLogId);
      return { success: true };
    },
    [ensurePermission, persistRideLogDelete],
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
        id: generateId(),
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
      void persistPostInsert(post, input.image);
      return { success: true, data: post };
    },
    [ensurePermission, persistPostInsert],
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
      void persistPostLikeToggle(post.id, userId, !hasLiked);
      return { success: true, data: { ...post, ...updates } };
    },
    [ensurePermission, persistPostLikeToggle],
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
        id: generateId(),
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
      void persistPostCommentInsert(postId, current.currentUserId, trimmed);
      return { success: true, data: comment };
    },
    [ensurePermission, persistPostCommentInsert],
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
        id: generateId(),
        name,
        type: 'custom',
        stableId,
        createdAt: new Date().toISOString(),
        createdByUserId: current.currentUserId,
      };
      dispatch({ type: 'GROUP_ADD', payload: group });
      void persistGroupInsert(group);
      return { success: true, data: group };
    },
    [ensurePermission, persistGroupInsert],
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
      void persistGroupUpdate(input.id, { name });
      return { success: true, data: { ...existing, name } };
    },
    [ensurePermission, persistGroupUpdate],
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
      void persistGroupDelete(groupId);
      return { success: true };
    },
    [ensurePermission, persistGroupDelete],
  );

  const setCurrentStable = React.useCallback((stableId: string) => {
    dispatch({ type: 'STABLE_SET', payload: { stableId } });
  }, []);

  const setOnboardingDismissed = React.useCallback(
    (dismissed: boolean): ActionResult<UserProfile> => {
      const current = stateRef.current;
      const userId = current.currentUserId;
      const profile = current.users[userId];
      if (!profile) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      dispatch({
        type: 'USER_UPDATE',
        payload: { id: userId, updates: { onboardingDismissed: dismissed } },
      });
      void persistProfileUpdate(userId, { onboarding_dismissed: dismissed });
      return { success: true, data: { ...profile, onboardingDismissed: dismissed } };
    },
    [persistProfileUpdate],
  );

  const updateProfile = React.useCallback(
    (input: UpdateProfileInput): ActionResult<UserProfile> => {
      const current = stateRef.current;
      const userId = current.currentUserId;
      const profile = current.users[userId];
      if (!profile) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }

      const updates: Partial<UserProfile> = {};
      const payload: Record<string, unknown> = {};

      if (hasOwnProperty(input, 'name')) {
        const name = input.name?.trim() ?? '';
        if (!name) {
          return { success: false, reason: 'Namn kan inte vara tomt.' };
        }
        updates.name = name;
        payload.full_name = name;
      }

      if (hasOwnProperty(input, 'phone')) {
        const phone = input.phone?.trim() ?? '';
        updates.phone = phone;
        payload.phone = phone || null;
      }

      if (hasOwnProperty(input, 'location')) {
        const location = input.location?.trim() ?? '';
        updates.location = location;
        payload.location = location || null;
      }

      if (!Object.keys(updates).length) {
        return { success: true, data: profile };
      }

      dispatch({
        type: 'USER_UPDATE',
        payload: { id: userId, updates },
      });
      void persistProfileUpdate(userId, payload);
      return { success: true, data: { ...profile, ...updates } };
    },
    [persistProfileUpdate],
  );

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
      const id = input.id ?? generateId();
      const farm: Farm = {
        id,
        name,
        location: input.location?.trim() || undefined,
        hasIndoorArena: input.hasIndoorArena,
        arenaNote: input.arenaNote?.trim() || undefined,
      };
      dispatch({ type: 'FARM_UPSERT', payload: farm });
      void persistFarmUpsert(farm);
      return { success: true, data: farm };
    },
    [ensurePermission, persistFarmUpsert],
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
    void persistFarmDelete(farmId);
    return { success: true };
  }, [ensurePermission, persistFarmDelete]);

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
      const id = input.id ?? generateId();
      const existing = input.id ? current.stables.find((stable) => stable.id === input.id) : undefined;
      const baseSettings = existing ? resolveStableSettings(existing) : createDefaultStableSettings();
      const nextSettings = input.settings
        ? {
            dayLogic: input.settings.dayLogic ?? baseSettings.dayLogic,
            eventVisibility: {
              ...baseSettings.eventVisibility,
              ...input.settings.eventVisibility,
            },
            arena: {
              ...baseSettings.arena,
              ...input.settings.arena,
            },
          }
        : baseSettings;
      const stable: Stable = {
        id,
        name: input.name.trim(),
        description: input.description?.trim() || existing?.description,
        location: input.location?.trim() || undefined,
        farmId: input.farmId,
        rideTypes: input.rideTypes ?? existing?.rideTypes ?? [],
        settings: nextSettings,
      };

      if (!stable.name) {
        return { success: false, reason: 'Stallet måste ha ett namn.' };
      }

      dispatch({ type: 'STABLE_UPSERT', payload: stable });
      void persistStableUpsert(stable, !existing, current.currentUserId);

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
    [ensurePermission, persistStableUpsert],
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
            arena: {
              ...baseSettings.arena,
              ...input.updates.settings.arena,
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
      void persistStableUpdate(input.id, updates);
      return { success: true, data: updated };
    },
    [ensurePermission, persistStableUpdate],
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
    void persistStableDelete(stableId);
    return { success: true };
  }, [ensurePermission, persistStableDelete]);

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
      const existing = input.id ? stateRef.current.horses.find((horse) => horse.id === input.id) : undefined;
      const id = input.id ?? generateId();
      const horse: Horse = {
        id,
        name,
        stableId: input.stableId,
        ownerUserId: input.ownerUserId,
        image: input.image ?? existing?.image,
        gender: input.gender,
        age: input.age,
        boxNumber: input.boxNumber?.trim() || undefined,
        canSleepInside: input.canSleepInside,
        note: input.note?.trim() || undefined,
      };
      dispatch({ type: 'HORSE_UPSERT', payload: horse });
      void persistHorseUpsert(horse);
      return { success: true, data: horse };
    },
    [ensurePermission, persistHorseUpsert],
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
    void persistHorseDelete(horseId);
    return { success: true };
  }, [ensurePermission, persistHorseDelete]);

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
      void persistStableInvite(input, stableIds);
      return { success: true };
    },
    [ensurePermission, persistStableInvite],
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
      const nextEntry = membership.find((entry) => entry.stableId === input.stableId);
      dispatch({
        type: 'USER_UPDATE',
        payload: {
          id: user.id,
          updates: { membership },
        },
      });
      if (nextEntry) {
        void persistStableMemberUpdate(input.stableId, user.id, {
          role: nextEntry.role,
          customRole: nextEntry.customRole,
          access: nextEntry.access,
          horseIds: nextEntry.horseIds,
          riderRole: nextEntry.riderRole,
        });
      }
      return { success: true, data: { ...user, membership } };
    },
    [ensurePermission, persistStableMemberUpdate],
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
      void persistStableMemberUpdate(input.stableId, user.id, { horseIds: input.horseIds });
      return { success: true, data: { ...user, membership } };
    },
    [ensurePermission, persistStableMemberUpdate],
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

      void persistDefaultPassToggle({
        userId: user.id,
        stableId: input.stableId,
        weekday: input.weekday,
        slot: input.slot,
        enabled: !exists,
      });

      return { success: true, data: { ...user, defaultPasses: nextDefaultPasses } };
    },
    [ensurePermission, persistDefaultPassToggle],
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
      void persistStableMemberDelete(stableId, userId);
      return { success: true, data: { ...user, membership } };
    },
    [ensurePermission, persistStableMemberDelete],
  );

  const value = React.useMemo<AppDataContextValue>(
    () => ({
      state,
      hydrating,
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
        setOnboardingDismissed,
        updateProfile,
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
      },
    }),
    [
      state,
      hydrating,
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
      setOnboardingDismissed,
      updateProfile,
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
