import React from 'react';
import type { PropsWithChildren } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { generateId } from '@/lib/ids';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';
import { supabase } from '@/lib/supabase';
import { trackPendingWrite } from '@/lib/writeTracker';
import { createTimeoutFetch } from '@/lib/requestTimeout';
import {
  clearPendingJoinCode,
  clearPendingOwnerStable,
  loadPendingJoinCode,
  loadPendingOwnerStable,
} from '@/lib/pendingAuth';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/context/AuthContext';
import { formatTimeAgo } from '@/lib/time';
import { isQaDemoMode, QA_DEMO_MEMBER_ID, QA_DEMO_USER_ID } from '@/lib/qaDemo';

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
  hasRoundPen: boolean;
  hasSchedule: boolean;
  bookingMode: ArenaBookingMode;
  rules?: string;
};

export type StableOnboardingSettings = {
  resourcesComplete?: boolean;
  membersComplete?: boolean;
};

export type StableSettings = {
  dayLogic: StableDayLogic;
  eventVisibility: StableEventVisibility;
  arena: StableArenaSettings;
  onboarding?: StableOnboardingSettings;
};

export type StableSettingsInput = Omit<Partial<StableSettings>, 'eventVisibility' | 'arena' | 'onboarding'> & {
  eventVisibility?: Partial<StableEventVisibility>;
  arena?: Partial<StableArenaSettings>;
  onboarding?: Partial<StableOnboardingSettings>;
};

export type Stable = {
  id: string;
  name: string;
  description?: string;
  location?: string;
  farmId?: string;
  rideTypes?: RideType[];
  settings?: StableSettings;
  joinCode?: string;
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
  requestId?: string;
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
  requestId?: string;
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

export type HorseResponsibility = {
  id: string;
  stableId: string;
  horseId: string;
  userId: string;
  kind: 'medryttare' | 'staff' | 'trainer' | 'other';
  canLogRide: boolean;
  canUpdateDailyStatus: boolean;
  canSuggestPlanChanges: boolean;
};

export type FeedSlot = 'morning' | 'lunch' | 'evening';

export type FeedPlanItem = {
  id: string;
  stableId: string;
  horseId?: string;
  slot: FeedSlot;
  label: string;
  amount?: string;
  note?: string;
  isStableDefault: boolean;
  active: boolean;
};

export type FeedCheck = {
  id: string;
  stableId: string;
  horseId: string;
  date: string;
  slot: FeedSlot;
  checkedByUserId?: string;
  checkedAt?: string;
  deviationNote?: string;
};

export type PlannedRideStatus = 'planned' | 'done' | 'cancelled';

export type PlannedRide = {
  id: string;
  stableId: string;
  horseId: string;
  riderUserId?: string;
  date: string;
  time?: string;
  rideTypeId?: string;
  note?: string;
  status: PlannedRideStatus;
  completedRideLogId?: string;
  createdAt: string;
};

export type ExternalContactType = 'farrier' | 'vet' | 'trainer' | 'therapist' | 'other';

export type ExternalContact = {
  id: string;
  stableId: string;
  name: string;
  type: ExternalContactType;
  phone?: string;
  email?: string;
  note?: string;
  createdAt: string;
};

export type CareEventType = 'farrier' | 'vet' | 'vaccination' | 'dental' | 'treatment' | 'other';

export type CareEventStatus = 'planned' | 'done' | 'cancelled';

export type CareEvent = {
  id: string;
  stableId: string;
  horseIds: string[];
  type: CareEventType;
  title: string;
  date: string;
  time?: string;
  contactId?: string;
  responsibleUserId?: string;
  status: CareEventStatus;
  note?: string;
  completedAt?: string;
  createdAt: string;
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
      return true;
    }
    await SecureStore.setItemAsync(key, JSON.stringify(normalized));
    return true;
  } catch (error) {
    console.warn('[default pass draft] Kunde inte spara lokala standardpass', error);
    return false;
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
  requestId?: string;
  date: string;
  stableId?: string;
  slot: AssignmentSlot;
  time?: string;
  note?: string;
  assignToCurrentUser?: boolean;
  labelOverride?: string;
};

export type CreateRecurringAssignmentsInput = {
  dateFrom: string;
  dateTo: string;
  weekdays: WeekdayIndex[];
  startTime: string;
  durationMinutes?: number;
  title: string;
  slotsCount?: number;
  stableId?: string;
  assignToCurrentUser?: boolean;
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

export type StableAlert = {
  id: string;
  stableId: string;
  title: string;
  body?: string;
  severity: 'info' | 'important' | 'urgent';
  horseId?: string;
  paddockId?: string;
  assignmentId?: string;
  createdByUserId: string;
  createdAt: string;
  resolvedAt?: string;
};

export type CreateStableAlertInput = {
  requestId?: string;
  stableId?: string;
  title: string;
  body?: string;
  severity?: StableAlert['severity'];
  horseId?: string;
  paddockId?: string;
  assignmentId?: string;
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
  authorId?: string;
  author: string;
  avatar: ImageSourcePropType;
  timeAgo: string;
  createdAt?: string;
  content?: string;
  image?: string;
  imagePath?: string;
  imageSignedUrl?: string;
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

export type ContentReport = {
  id: string;
  stableId: string | null;
  reporterUserId: string | null;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CreatePostInput = {
  requestId?: string;
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
  requestId?: string;
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
  requestId?: string;
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
  requestId?: string;
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

export type StableUpdates = Partial<Omit<Stable, 'settings' | 'joinCode'>> & { settings?: StableSettingsInput };

export type UpsertStableInput = {
  requestId?: string;
  id?: string;
  name: string;
  description?: string;
  location?: string;
  farmId?: string;
  rideTypes?: RideType[];
  settings?: StableSettingsInput;
};

export type UpsertFarmInput = {
  requestId?: string;
  id?: string;
  name?: string;
  location?: string;
  hasIndoorArena?: boolean;
  arenaNote?: string;
  accessStableId?: string;
};

export type UpsertHorseInput = {
  id?: string;
  name?: string;
  stableId: string;
  ownerUserId?: string;
  image?: Horse['image'] | null;
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

export type UpsertFeedPlanInput = {
  id?: string;
  stableId?: string;
  horseId?: string | null;
  slot: FeedSlot;
  label: string;
  amount?: string;
  note?: string;
  isStableDefault: boolean;
  active?: boolean;
};

export type UpsertFeedCheckInput = {
  stableId?: string;
  horseId: string;
  date: string;
  slot: FeedSlot;
  checked?: boolean;
  deviationNote?: string;
};

export type CreatePlannedRideInput = {
  requestId?: string;
  stableId?: string;
  horseId: string;
  date: string;
  time?: string;
  rideTypeId?: string;
  note?: string;
  riderUserId?: string;
};

export type UpdatePlannedRideInput = {
  id: string;
  updates: Partial<Pick<PlannedRide, 'date' | 'time' | 'rideTypeId' | 'note' | 'riderUserId' | 'status'>>;
};

export type CompletePlannedRideInput = {
  id: string;
  length?: string;
  note?: string;
};

export type UpsertExternalContactInput = {
  id?: string;
  stableId?: string;
  name: string;
  type: ExternalContactType;
  phone?: string;
  email?: string;
  note?: string;
};

export type CreateCareEventInput = {
  requestId?: string;
  stableId?: string;
  horseIds: string[];
  type: CareEventType;
  title: string;
  date: string;
  time?: string;
  contactId?: string;
  responsibleUserId?: string;
  note?: string;
};

export type UpdateCareEventInput = {
  id: string;
  updates: Partial<Pick<CareEvent, 'horseIds' | 'type' | 'title' | 'date' | 'time' | 'contactId' | 'responsibleUserId' | 'note' | 'status'>>;
};

export type CompleteCareEventInput = {
  id: string;
  note?: string;
};

export type InviteConfirmation = { inviteCode: string; codes: { stableId: string; code: string }[] };

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
  canManageCareEvents: boolean;
  canManagePaddocks: boolean;
  canUpdateHorseStatus: boolean;
  canManageHorses: boolean;
  canCreatePost: boolean;
  canCommentPost: boolean;
  canLikePost: boolean;
  canManageGroups: boolean;
};

type PostsCursor = {
  createdAt: string;
  id: string;
};

export type AppDataState = {
  currentStableId: string;
  stables: Stable[];
  farms: Farm[];
  horses: Horse[];
  currentUserId: string;
  sessionUserId: string | null;
  users: Record<string, UserProfile>;
  alerts: AlertMessage[];
  stableAlerts: StableAlert[];
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
  postsCursor: PostsCursor | null;
  postsHasMore: boolean;
  postsLoadingMore: boolean;
  postsLoadError: string | null;
  groups: Group[];
  ridingSchedule: RidingDay[];
  competitionEvents: CompetitionEvent[];
  dayEvents: DayEvent[];
  arenaBookings: ArenaBooking[];
  arenaStatuses: ArenaStatus[];
  rideLogs: RideLogEntry[];
  paddocks: Paddock[];
  horseDayStatuses: HorseDayStatus[];
  horseResponsibilities: HorseResponsibility[];
  feedPlans: FeedPlanItem[];
  feedChecks: FeedCheck[];
  plannedRides: PlannedRide[];
  externalContacts: ExternalContact[];
  careEvents: CareEvent[];
  blockedUserIds: string[];
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

type StableAlertUpsertAction = {
  type: 'STABLE_ALERT_UPSERT';
  payload: StableAlert;
};

type MarkMessageReadAction = {
  type: 'MESSAGE_MARK_READ';
  payload: { id: string };
};

type AppendConversationMessageAction = {
  type: 'CONVERSATION_APPEND';
  payload: { conversationId: string; message?: ConversationMessage; preview: MessagePreview };
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

type PostCommentUpsertAction = { type: 'POST_COMMENT_UPSERT'; payload: PostComment };
type PostLikeSetAction = { type: 'POST_LIKE_SET'; payload: { postId: string; userId: string; enabled: boolean } };

type PostDeleteAction = {
  type: 'POST_DELETE';
  payload: { id: string };
};

type PostRestoreAction = {
  type: 'POST_RESTORE';
  payload: { post: Post; index: number };
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

type FeedPlanUpsertAction = {
  type: 'FEED_PLAN_UPSERT';
  payload: FeedPlanItem;
};

type FeedPlanDeleteAction = {
  type: 'FEED_PLAN_DELETE';
  payload: { id: string };
};

type FeedCheckUpsertAction = {
  type: 'FEED_CHECK_UPSERT';
  payload: FeedCheck;
};

type FeedCheckDeleteAction = {
  type: 'FEED_CHECK_DELETE';
  payload: { id: string };
};

type PlannedRideUpsertAction = {
  type: 'PLANNED_RIDE_UPSERT';
  payload: PlannedRide;
};

type PlannedRideDeleteAction = {
  type: 'PLANNED_RIDE_DELETE';
  payload: { id: string };
};

type ExternalContactUpsertAction = {
  type: 'EXTERNAL_CONTACT_UPSERT';
  payload: ExternalContact;
};

type ExternalContactDeleteAction = {
  type: 'EXTERNAL_CONTACT_DELETE';
  payload: { id: string };
};

type CareEventUpsertAction = {
  type: 'CARE_EVENT_UPSERT';
  payload: CareEvent;
};

type CareEventDeleteAction = {
  type: 'CARE_EVENT_DELETE';
  payload: { id: string };
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
  | StableAlertUpsertAction
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
  | PostCommentUpsertAction
  | PostLikeSetAction
  | PostDeleteAction
  | PostRestoreAction
  | GroupAddAction
  | GroupUpdateAction
  | GroupDeleteAction
  | HorseDayStatusUpsertAction
  | FeedPlanUpsertAction
  | FeedPlanDeleteAction
  | FeedCheckUpsertAction
  | FeedCheckDeleteAction
  | PlannedRideUpsertAction
  | PlannedRideDeleteAction
  | ExternalContactUpsertAction
  | ExternalContactDeleteAction
  | CareEventUpsertAction
  | CareEventDeleteAction
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

type PersistOptions = {
  skipPersist?: boolean;
  skipPermission?: boolean;
};

type RefreshReason = 'join' | 'leave' | 'switch' | 'manual' | 'init';

type RefreshOptions = {
  stableId?: string;
  reason?: RefreshReason;
};

type AppDataContextValue = {
  state: AppDataState;
  hydrating: boolean;
  refreshing: boolean;
  refreshError?: string | null;
  lastRefreshedAt?: string | null;
  derived: {
    isFirstTimeOnboarding: boolean;
    canManageOnboardingAny: boolean;
    onboardingComplete: boolean;
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
    getMissedAssignmentsForStable: (stableId: string) => Assignment[];
    getAssignmentEndTime: (assignment: Assignment) => string | null;
    cleanAssignmentNote: (note?: string) => string | undefined;
    membership?: StableMembership;
    currentAccess: StableMembership['access'];
    currentRole: UserRole;
    permissions: PermissionSet;
  };
  actions: {
    logNextAssignment: () => ActionResult<Assignment>;
    claimNextOpenAssignment: () => Promise<ActionResult<Assignment>>;
    claimAssignment: (assignmentId: string) => Promise<ActionResult<Assignment>>;
    declineAssignment: (assignmentId: string) => Promise<ActionResult<Assignment>>;
    completeAssignment: (assignmentId: string) => Promise<ActionResult<Assignment>>;
    createAssignment: (input: CreateAssignmentInput) => Promise<ActionResult<Assignment>>;
    createRecurringAssignments: (
      input: CreateRecurringAssignmentsInput,
    ) => Promise<ActionResult<{ createdCount: number; skippedCount: number }>>;
    updateAssignment: (input: UpdateAssignmentInput) => Promise<ActionResult<Assignment>>;
    deleteAssignment: (assignmentId: string) => Promise<ActionResult>;
    addEvent: (message: string, type?: AlertMessage['type'], requestId?: string) => Promise<ActionResult<AlertMessage>>;
    createStableAlert: (input: CreateStableAlertInput) => Promise<ActionResult<StableAlert>>;
    resolveStableAlert: (alertId: string) => Promise<ActionResult<StableAlert>>;
    toggleDefaultPass: (weekday: WeekdayIndex, slot: AssignmentSlot) => Promise<ActionResult<UserProfile>>;
    upsertPaddock: (input: UpsertPaddockInput) => Promise<ActionResult<Paddock>>;
    deletePaddock: (paddockId: string) => Promise<ActionResult>;
    updateHorseDayStatus: (input: UpdateHorseDayStatusInput) => Promise<ActionResult<HorseDayStatus>>;
    upsertFeedPlan: (input: UpsertFeedPlanInput) => Promise<ActionResult<FeedPlanItem>>;
    deleteFeedPlan: (feedPlanId: string) => Promise<ActionResult>;
    upsertFeedCheck: (input: UpsertFeedCheckInput) => Promise<ActionResult<FeedCheck>>;
    createPlannedRide: (input: CreatePlannedRideInput) => Promise<ActionResult<PlannedRide>>;
    updatePlannedRide: (input: UpdatePlannedRideInput) => Promise<ActionResult<PlannedRide>>;
    deletePlannedRide: (plannedRideId: string) => Promise<ActionResult>;
    completePlannedRide: (input: CompletePlannedRideInput) => Promise<ActionResult<{ plannedRide: PlannedRide; rideLog: RideLogEntry }>>;
    upsertExternalContact: (input: UpsertExternalContactInput) => Promise<ActionResult<ExternalContact>>;
    deleteExternalContact: (contactId: string) => Promise<ActionResult>;
    createCareEvent: (input: CreateCareEventInput) => Promise<ActionResult<CareEvent>>;
    updateCareEvent: (input: UpdateCareEventInput) => Promise<ActionResult<CareEvent>>;
    deleteCareEvent: (careEventId: string) => Promise<ActionResult>;
    completeCareEvent: (input: CompleteCareEventInput) => Promise<ActionResult<CareEvent>>;
    addDayEvent: (input: CreateDayEventInput) => Promise<ActionResult<DayEvent>>;
    removeDayEvent: (eventId: string) => Promise<ActionResult>;
    addArenaBooking: (input: CreateArenaBookingInput) => Promise<ActionResult<ArenaBooking>>;
    updateArenaBooking: (input: { id: string; updates: Partial<ArenaBooking> }) => Promise<ActionResult<ArenaBooking>>;
    removeArenaBooking: (bookingId: string) => Promise<ActionResult>;
    addArenaStatus: (input: CreateArenaStatusInput) => Promise<ActionResult<ArenaStatus>>;
    removeArenaStatus: (statusId: string) => Promise<ActionResult>;
    addRideLog: (input: CreateRideLogInput) => Promise<ActionResult<RideLogEntry>>;
    removeRideLog: (rideLogId: string) => Promise<ActionResult>;
    addPost: (input: CreatePostInput) => Promise<ActionResult<Post>>;
    togglePostLike: (postId: string) => Promise<ActionResult>;
    addPostComment: (postId: string, text: string, requestId?: string) => Promise<ActionResult<PostComment>>;
    deletePost: (postId: string) => Promise<ActionResult>;
    reportPost: (postId: string, reason?: string) => Promise<ActionResult>;
    reportComment: (postId: string, commentId: string, reason?: string) => Promise<ActionResult>;
    fetchContentReports: (includeResolved?: boolean) => Promise<ActionResult<ContentReport[]>>;
    resolveContentReport: (reportId: string) => Promise<ActionResult>;
    blockUser: (targetUserId: string) => Promise<ActionResult>;
    unblockUser: (targetUserId: string) => Promise<ActionResult>;
    loadMorePosts: () => Promise<ActionResult>;
    createGroup: (input: CreateGroupInput) => Promise<ActionResult<Group>>;
    renameGroup: (input: RenameGroupInput) => Promise<ActionResult<Group>>;
    deleteGroup: (groupId: string) => Promise<ActionResult>;
    markConversationRead: (conversationId: string) => void;
    sendConversationMessage: (conversationId: string, text: string, requestId?: string) => Promise<ActionResult<ConversationMessage>>;
    createPrivateConversation: (otherUserId: string) => Promise<ActionResult<string>>;
    setCurrentStable: (stableId: string) => void;
    refreshData: (options?: RefreshOptions) => Promise<ActionResult>;
    setOnboardingDismissed: (dismissed: boolean) => ActionResult<UserProfile>;
    updateProfile: (input: UpdateProfileInput) => Promise<ActionResult<UserProfile>>;
    upsertFarm: (input: UpsertFarmInput, options?: PersistOptions) => Promise<ActionResult<Farm>>;
    deleteFarm: (farmId: string) => ActionResult;
    upsertStable: (input: UpsertStableInput, options?: PersistOptions) => Promise<ActionResult<Stable>>;
    updateStable: (input: { id: string; updates: StableUpdates }, options?: PersistOptions) => Promise<ActionResult<Stable>>;
    deleteStable: (stableId: string) => ActionResult;
    upsertHorse: (input: UpsertHorseInput) => Promise<ActionResult<Horse>>;
    deleteHorse: (horseId: string) => Promise<ActionResult>;
    addMember: (input: AddMemberInput) => Promise<ActionResult<InviteConfirmation>>;
    updateMemberRole: (input: UpdateMemberRoleInput) => Promise<ActionResult<UserProfile>>;
    updateMemberHorseIds: (input: UpdateMemberHorseIdsInput) => Promise<ActionResult<UserProfile>>;
    toggleMemberDefaultPass: (input: ToggleMemberDefaultPassInput) => Promise<ActionResult<UserProfile>>;
    removeMemberFromStable: (userId: string, stableId: string) => Promise<ActionResult<UserProfile>>;
    joinStableByCode: (code: string) => Promise<ActionResult<{ stableId: string }>>;
    acceptPendingInvites: () => Promise<ActionResult<{ count: number }>>;
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

const inviteCodeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * inviteCodeChars.length);
    code += inviteCodeChars[index];
  }
  return code;
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
  hasRoundPen: false,
  hasSchedule: false,
  bookingMode: 'open',
  rules: '',
};

export function createDefaultStableSettings(): StableSettings {
  return {
    dayLogic: 'box',
    eventVisibility: { ...defaultEventVisibility },
    arena: { ...defaultArenaSettings },
    onboarding: { resourcesComplete: false, membersComplete: false },
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
    onboarding: { ...defaults.onboarding, ...stable.settings.onboarding },
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
  canManageCareEvents: false,
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
    canManageCareEvents: canEditAccess,
    canManagePaddocks: canEditAccess,
    canUpdateHorseStatus: horseStatusRoles.has(role),
    canManageHorses: canEditAccess,
    canCreatePost: postRoles.has(role),
    canCommentPost: role !== 'guest',
    canLikePost: role !== 'guest',
    canManageGroups: groupRoles.has(role),
  };
}

const initialState: AppDataState = {
  currentStableId: '',
  stables: [],
  farms: [],
  horses: [],
  currentUserId: '',
  sessionUserId: null,
  users: {},
  alerts: [],
  stableAlerts: [],
  assignments: [],
  assignmentHistory: [],
  messages: [],
  conversations: {},
  posts: [],
  postsCursor: null,
  postsHasMore: true,
  postsLoadingMore: false,
  postsLoadError: null,
  groups: [],
  ridingSchedule: [],
  competitionEvents: [],
  dayEvents: [],
  arenaBookings: [],
  arenaStatuses: [],
  rideLogs: [],
  paddocks: [],
  horseDayStatuses: [],
  horseResponsibilities: [],
  feedPlans: [],
  feedChecks: [],
  plannedRides: [],
  externalContacts: [],
  careEvents: [],
  blockedUserIds: [],
};

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createQaDemoState(): AppDataState {
  const now = new Date().toISOString();
  const stableId = 'qa-stable-main';
  const farmId = 'qa-farm-main';
  const horseId = 'qa-horse-main';
  const paddockId = 'qa-paddock-main';
  const conversationId = 'qa-conversation-private';
  const groupConversationId = 'qa-conversation-stable';
  const groupId = 'qa-group-paddock';
  const today = addDaysIso(0);
  const tomorrow = addDaysIso(1);
  const stableSettings = createDefaultStableSettings();

  stableSettings.arena = {
    hasArena: true,
    hasRoundPen: true,
    hasSchedule: true,
    bookingMode: 'open',
    rules: 'Mocka efter ridning och lämna bommar på plats.',
  };
  stableSettings.onboarding = { resourcesComplete: true, membersComplete: true };

  return {
    ...initialState,
    currentStableId: stableId,
    currentUserId: QA_DEMO_USER_ID,
    sessionUserId: QA_DEMO_USER_ID,
    farms: [
      {
        id: farmId,
        name: 'QA Gården',
        location: 'Stockholm',
        hasIndoorArena: true,
        arenaNote: 'Ridhus och utevolt används i QA-flödet.',
      },
    ],
    stables: [
      {
        id: stableId,
        name: 'QA Stallet',
        location: 'Stockholm',
        farmId,
        joinCode: 'QATEST',
        rideTypes: [
          { id: 'qa-ride-dressage', code: 'DR', label: 'Dressyr' },
          { id: 'qa-ride-hack', code: 'UT', label: 'Uteritt' },
        ],
        settings: stableSettings,
      },
    ],
    users: {
      [QA_DEMO_USER_ID]: {
        id: QA_DEMO_USER_ID,
        name: 'QA Admin',
        email: 'qa-admin@example.com',
        membership: [{ stableId, role: 'admin', access: 'owner', riderRole: 'owner' }],
        horses: ['Saga'],
        location: 'Stockholm',
        phone: '070-000 00 01',
        responsibilities: ['Schema', 'Hagar'],
        defaultPasses: [{ weekday: 0, slot: 'Morning' }],
        awayNotices: [],
        avatar: require('@/assets/images/dummy-avatar.png'),
        onboardingDismissed: false,
      },
      [QA_DEMO_MEMBER_ID]: {
        id: QA_DEMO_MEMBER_ID,
        name: 'QA Medlem',
        email: 'qa-member@example.com',
        membership: [{ stableId, role: 'rider', access: 'view', riderRole: 'medryttare', horseIds: [horseId] }],
        horses: ['Saga'],
        location: 'Stockholm',
        phone: '070-000 00 02',
        responsibilities: ['Kvällsfodring'],
        defaultPasses: [{ weekday: 2, slot: 'Evening' }],
        awayNotices: [],
        avatar: require('@/assets/images/dummy-avatar.png'),
        onboardingDismissed: true,
      },
    },
    horses: [
      {
        id: horseId,
        stableId,
        name: 'Saga',
        ownerUserId: QA_DEMO_USER_ID,
        gender: 'mare',
        age: 9,
        boxNumber: '12',
        canSleepInside: true,
        note: 'Känslig för snabb foderändring.',
      },
    ],
    horseResponsibilities: [
      {
        id: 'qa-horse-responsibility-1',
        stableId,
        horseId,
        userId: QA_DEMO_MEMBER_ID,
        kind: 'medryttare',
        canLogRide: true,
        canUpdateDailyStatus: true,
        canSuggestPlanChanges: true,
      },
    ],
    paddocks: [
      {
        id: paddockId,
        stableId,
        name: 'Vinterhagen',
        horseNames: ['Saga'],
        updatedAt: now,
        season: 'winter',
      },
    ],
    assignments: [
      {
        id: 'qa-assignment-open',
        stableId,
        date: today,
        label: 'Lunchfodring',
        slot: 'Lunch',
        icon: 'clock',
        time: '12:00',
        status: 'open',
      },
      {
        id: 'qa-assignment-mine',
        stableId,
        date: today,
        label: 'Morgonfodring',
        slot: 'Morning',
        icon: 'sun',
        time: '07:00',
        status: 'assigned',
        assigneeId: QA_DEMO_USER_ID,
      },
      {
        id: 'qa-assignment-member',
        stableId,
        date: tomorrow,
        label: 'Kvällsfodring',
        slot: 'Evening',
        icon: 'moon',
        time: '19:00',
        status: 'assigned',
        assigneeId: QA_DEMO_MEMBER_ID,
      },
    ],
    assignmentHistory: [
      {
        id: 'qa-history-1',
        assignmentId: 'qa-assignment-open',
        label: 'Lunchfodring 12:00',
        timestamp: now,
        action: 'created',
      },
    ],
    stableAlerts: [
      {
        id: 'qa-stable-alert-1',
        stableId,
        title: 'Grinden till Vinterhagen är trög',
        body: 'Stäng med kedjan tills den är justerad.',
        severity: 'important',
        paddockId,
        createdByUserId: QA_DEMO_USER_ID,
        createdAt: now,
      },
    ],
    dayEvents: [
      { id: 'qa-event-1', stableId, date: today, label: 'Hovslagare kl 14', tone: 'farrierAway' },
    ],
    arenaBookings: [
      {
        id: 'qa-booking-1',
        stableId,
        date: today,
        startTime: '18:00',
        endTime: '18:45',
        purpose: 'Dressyr',
        bookedByUserId: QA_DEMO_USER_ID,
      },
    ],
    arenaStatuses: [
      { id: 'qa-arena-status-1', stableId, date: today, label: 'Sladdad', createdByUserId: QA_DEMO_USER_ID, createdAt: now },
    ],
    groups: [
      { id: groupId, stableId, name: 'Haggruppen', type: 'custom', createdAt: now, createdByUserId: QA_DEMO_USER_ID },
    ],
    messages: [
      {
        id: conversationId,
        title: 'QA Medlem',
        subtitle: 'Privat chatt',
        description: 'Kan du ta kvällspasset imorgon?',
        timeAgo: 'Nu',
        unreadCount: 1,
        stableId,
      },
      {
        id: groupConversationId,
        title: 'QA Stallet',
        subtitle: 'Stallchatt',
        description: 'Välkommen till QA-stallet.',
        timeAgo: 'Idag',
        group: true,
        stableId,
      },
    ],
    conversations: {
      [conversationId]: [
        {
          id: 'qa-message-1',
          conversationId,
          authorId: QA_DEMO_MEMBER_ID,
          text: 'Kan du ta kvällspasset imorgon?',
          timestamp: now,
          status: 'delivered',
        },
      ],
      [groupConversationId]: [
        {
          id: 'qa-message-2',
          conversationId: groupConversationId,
          authorId: QA_DEMO_USER_ID,
          text: 'Välkommen till QA-stallet.',
          timestamp: now,
          status: 'seen',
        },
      ],
    },
    posts: [
      {
        id: 'qa-post-1',
        authorId: QA_DEMO_USER_ID,
        author: 'QA Admin',
        avatar: require('@/assets/images/dummy-avatar.png'),
        timeAgo: 'Nyss',
        createdAt: now,
        content: 'Saga gick fint i ridhuset idag.',
        likes: 1,
        comments: 1,
        likedByUserIds: [QA_DEMO_MEMBER_ID],
        commentsData: [
          {
            id: 'qa-comment-1',
            postId: 'qa-post-1',
            authorId: QA_DEMO_MEMBER_ID,
            authorName: 'QA Medlem',
            text: 'Härligt!',
            createdAt: now,
          },
        ],
        stableId,
        groupIds: [groupId],
      },
    ],
    postsHasMore: false,
    ridingSchedule: [
      { id: 'qa-ride-day-1', stableId, label: 'Idag', upcomingRides: 'Saga 18:00', isToday: true },
    ],
    competitionEvents: [
      { id: 'qa-competition-1', start: today, end: tomorrow, title: 'Pay and ride', status: 'open' },
    ],
    horseDayStatuses: [
      {
        id: 'qa-horse-status-1',
        stableId,
        horseId,
        date: today,
        dayStatus: 'out',
        nightStatus: 'in',
        checked: true,
        water: true,
        hay: true,
      },
    ],
    feedPlans: [
      {
        id: 'qa-feed-plan-default-morning',
        stableId,
        slot: 'morning',
        label: 'Morgonfoder',
        amount: '2 kg hösilage + 0.5 kg krossad havre',
        isStableDefault: true,
        active: true,
      },
      {
        id: 'qa-feed-plan-saga-evening',
        stableId,
        horseId,
        slot: 'evening',
        label: 'Saga – kvällsfoder',
        amount: '3 kg hösilage',
        note: 'Trappa upp långsamt vid foderbyte.',
        isStableDefault: false,
        active: true,
      },
    ],
    feedChecks: [
      {
        id: 'qa-feed-check-saga-morning',
        stableId,
        horseId,
        date: today,
        slot: 'morning',
        checkedByUserId: QA_DEMO_USER_ID,
        checkedAt: now,
      },
    ],
    plannedRides: [
      {
        id: 'qa-planned-ride-1',
        stableId,
        horseId,
        date: today,
        time: '18:00',
        rideTypeId: 'qa-ride-dressage',
        note: 'Lugnt dressyrpass.',
        riderUserId: QA_DEMO_USER_ID,
        status: 'planned',
        createdAt: now,
      },
    ],
    externalContacts: [
      {
        id: 'qa-contact-vet',
        stableId,
        name: 'Anna Veterinär',
        type: 'vet',
        phone: '070-111 22 33',
        email: 'anna@example.com',
        createdAt: now,
      },
      {
        id: 'qa-contact-farrier',
        stableId,
        name: 'Per Hovslagare',
        type: 'farrier',
        phone: '070-222 33 44',
        createdAt: now,
      },
    ],
    careEvents: [
      {
        id: 'qa-care-vaccin',
        stableId,
        horseIds: [horseId],
        type: 'vaccination',
        title: 'Årsvaccination',
        date: tomorrow,
        time: '14:00',
        contactId: 'qa-contact-vet',
        responsibleUserId: QA_DEMO_USER_ID,
        status: 'planned',
        note: 'Påminn om hälsointyg.',
        createdAt: now,
      },
    ],
  };
}

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
        alerts: [action.payload, ...state.alerts.filter(alert => alert.id !== action.payload.id)],
      };
    case 'STABLE_ALERT_UPSERT': {
      const existingIndex = state.stableAlerts.findIndex((alert) => alert.id === action.payload.id);
      const stableAlerts = [...state.stableAlerts];
      if (existingIndex >= 0) {
        stableAlerts[existingIndex] = action.payload;
      } else {
        stableAlerts.push(action.payload);
      }
      stableAlerts.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return { ...state, stableAlerts };
    }
    case 'DAY_EVENT_ADD':
      return {
        ...state,
        dayEvents: [action.payload, ...state.dayEvents.filter(event => event.id !== action.payload.id)],
      };
    case 'DAY_EVENT_DELETE':
      return {
        ...state,
        dayEvents: state.dayEvents.filter((event) => event.id !== action.payload.id),
      };
    case 'ARENA_BOOKING_ADD':
      return {
        ...state,
        arenaBookings: [...state.arenaBookings.filter(booking => booking.id !== action.payload.id), action.payload],
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
        arenaStatuses: [action.payload, ...state.arenaStatuses.filter(status => status.id !== action.payload.id)],
      };
    case 'ARENA_STATUS_DELETE':
      return {
        ...state,
        arenaStatuses: state.arenaStatuses.filter((status) => status.id !== action.payload.id),
      };
    case 'RIDE_LOG_ADD':
      return {
        ...state,
        rideLogs: [action.payload, ...state.rideLogs.filter((log) => log.id !== action.payload.id)],
      };
    case 'RIDE_LOG_DELETE':
      return {
        ...state,
        rideLogs: state.rideLogs.filter((log) => log.id !== action.payload.id),
      };
    case 'POST_ADD':
      return {
        ...state,
        posts: state.posts.some((post) => post.id === action.payload.id)
          ? state.posts.map((post) => post.id === action.payload.id ? {
            ...post,
            content: action.payload.content,
            groupIds: action.payload.groupIds,
            image: action.payload.image,
            imagePath: action.payload.imagePath,
            imageSignedUrl: action.payload.imageSignedUrl,
          } : post) : [action.payload, ...state.posts],
      };
    case 'POST_UPDATE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        posts: state.posts.map((post) => (post.id === id ? { ...post, ...updates } : post)),
      };
    }
    case 'POST_COMMENT_UPSERT':
      return { ...state, posts: state.posts.map((post) => {
        if (post.id !== action.payload.postId) return post;
        const comments = post.commentsData ?? [];
        const existing = comments.some(comment => comment.id === action.payload.id);
        return { ...post, comments: post.comments + (existing ? 0 : 1),
          commentsData: existing ? comments.map(comment => comment.id === action.payload.id ? action.payload : comment)
            : [...comments, action.payload].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
      }) };
    case 'POST_LIKE_SET':
      return { ...state, posts: state.posts.map((post) => {
        if (post.id !== action.payload.postId) return post;
        const likedBy = new Set(post.likedByUserIds ?? []);
        const alreadyLiked = likedBy.has(action.payload.userId);
        if (action.payload.enabled) likedBy.add(action.payload.userId);
        else likedBy.delete(action.payload.userId);
        return { ...post, likedByUserIds: [...likedBy],
          likes: Math.max(0, post.likes + (alreadyLiked === action.payload.enabled ? 0 : action.payload.enabled ? 1 : -1)) };
      }) };
    case 'POST_DELETE':
      return {
        ...state,
        posts: state.posts.filter((post) => post.id !== action.payload.id),
      };
    case 'POST_RESTORE': {
      const { post, index } = action.payload;
      if (state.posts.some((item) => item.id === post.id)) {
        return state;
      }
      const next = [...state.posts];
      const insertAt = Math.max(0, Math.min(index, next.length));
      next.splice(insertAt, 0, post);
      return { ...state, posts: next };
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
      const duplicate = message && existingMessages.some((entry) => entry.id === message.id);
      const nextMessages = message && !duplicate
        ? [...existingMessages, message].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        : existingMessages;
      const preservePreview = duplicate || (message && nextMessages.at(-1)?.id !== message.id);
      const hasPreview = state.messages.some((msg) => msg.id === conversationId);
      const updatedPreview = hasPreview
        ? state.messages.map((msg) => (msg.id === conversationId && !preservePreview ? preview : msg))
        : [preview, ...state.messages];

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [conversationId]: nextMessages,
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
      return {
        ...state,
        horseDayStatuses: [...state.horseDayStatuses.filter((status) =>
          status.id !== action.payload.id && !(status.stableId === action.payload.stableId &&
            status.horseId === action.payload.horseId && status.date === action.payload.date),
        ), action.payload],
      };
    }
    case 'FEED_PLAN_UPSERT': {
      const existingIndex = state.feedPlans.findIndex((plan) => plan.id === action.payload.id);
      if (existingIndex >= 0) {
        const next = [...state.feedPlans];
        next[existingIndex] = action.payload;
        return { ...state, feedPlans: next };
      }
      return { ...state, feedPlans: [...state.feedPlans, action.payload] };
    }
    case 'FEED_PLAN_DELETE': {
      return {
        ...state,
        feedPlans: state.feedPlans.filter((plan) => plan.id !== action.payload.id),
      };
    }
    case 'FEED_CHECK_UPSERT': {
      return { ...state, feedChecks: [...state.feedChecks.filter((check) =>
        check.id !== action.payload.id && !(check.stableId === action.payload.stableId &&
          check.horseId === action.payload.horseId && check.date === action.payload.date && check.slot === action.payload.slot),
      ), action.payload] };
    }
    case 'FEED_CHECK_DELETE': {
      return {
        ...state,
        feedChecks: state.feedChecks.filter((check) => check.id !== action.payload.id),
      };
    }
    case 'PLANNED_RIDE_UPSERT': {
      const existingIndex = state.plannedRides.findIndex((ride) => ride.id === action.payload.id);
      if (existingIndex >= 0) {
        const next = [...state.plannedRides];
        next[existingIndex] = action.payload;
        return { ...state, plannedRides: next };
      }
      return { ...state, plannedRides: [...state.plannedRides, action.payload] };
    }
    case 'PLANNED_RIDE_DELETE': {
      return {
        ...state,
        plannedRides: state.plannedRides.filter((ride) => ride.id !== action.payload.id),
      };
    }
    case 'EXTERNAL_CONTACT_UPSERT': {
      const existingIndex = state.externalContacts.findIndex(
        (contact) => contact.id === action.payload.id,
      );
      if (existingIndex >= 0) {
        const next = [...state.externalContacts];
        next[existingIndex] = action.payload;
        return { ...state, externalContacts: next };
      }
      return { ...state, externalContacts: [...state.externalContacts, action.payload] };
    }
    case 'EXTERNAL_CONTACT_DELETE': {
      return {
        ...state,
        externalContacts: state.externalContacts.filter(
          (contact) => contact.id !== action.payload.id,
        ),
      };
    }
    case 'CARE_EVENT_UPSERT': {
      const existingIndex = state.careEvents.findIndex(
        (event) => event.id === action.payload.id,
      );
      if (existingIndex >= 0) {
        const next = [...state.careEvents];
        next[existingIndex] = action.payload;
        return { ...state, careEvents: next };
      }
      return { ...state, careEvents: [...state.careEvents, action.payload] };
    }
    case 'CARE_EVENT_DELETE': {
      return {
        ...state,
        careEvents: state.careEvents.filter((event) => event.id !== action.payload.id),
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
        horseResponsibilities: action.payload.horseResponsibilities ?? state.horseResponsibilities,
        stableAlerts: action.payload.stableAlerts ?? state.stableAlerts,
        feedPlans: action.payload.feedPlans ?? state.feedPlans,
        feedChecks: action.payload.feedChecks ?? state.feedChecks,
        plannedRides: action.payload.plannedRides ?? state.plannedRides,
        externalContacts: action.payload.externalContacts ?? state.externalContacts,
        careEvents: action.payload.careEvents ?? state.careEvents,
        blockedUserIds: action.payload.blockedUserIds ?? state.blockedUserIds,
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
        stableAlerts: state.stableAlerts.filter((alert) => alert.stableId !== action.payload.id),
        dayEvents: state.dayEvents.filter((event) => event.stableId !== action.payload.id),
        arenaBookings: state.arenaBookings.filter((booking) => booking.stableId !== action.payload.id),
        arenaStatuses: state.arenaStatuses.filter((status) => status.stableId !== action.payload.id),
        rideLogs: state.rideLogs.filter((log) => log.stableId !== action.payload.id),
        paddocks: state.paddocks.filter((paddock) => paddock.stableId !== action.payload.id),
        horses: state.horses.filter((horse) => horse.stableId !== action.payload.id),
        horseDayStatuses: state.horseDayStatuses.filter((status) => status.stableId !== action.payload.id),
        feedPlans: state.feedPlans.filter((plan) => plan.stableId !== action.payload.id),
        feedChecks: state.feedChecks.filter((check) => check.stableId !== action.payload.id),
        plannedRides: state.plannedRides.filter((ride) => ride.stableId !== action.payload.id),
        externalContacts: state.externalContacts.filter(
          (contact) => contact.stableId !== action.payload.id,
        ),
        careEvents: state.careEvents.filter((event) => event.stableId !== action.payload.id),
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
        feedPlans: state.feedPlans.filter((plan) => plan.horseId !== action.payload.id),
        feedChecks: state.feedChecks.filter((check) => check.horseId !== action.payload.id),
        plannedRides: state.plannedRides.filter((ride) => ride.horseId !== action.payload.id),
        stableAlerts: state.stableAlerts.map((alert) =>
          alert.horseId === action.payload.id ? { ...alert, horseId: undefined } : alert,
        ),
        careEvents: state.careEvents
          .map((event) => ({
            ...event,
            horseIds: event.horseIds.filter((horseId) => horseId !== action.payload.id),
          }))
          .filter((event) => event.horseIds.length > 0),
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

function resolveSlotFromTime(value: string): AssignmentSlot {
  const match = value.match(/^(\d{1,2})/);
  const hour = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(hour)) {
    return 'Morning';
  }
  if (hour < 10) {
    return 'Morning';
  }
  if (hour < 15) {
    return 'Lunch';
  }
  return 'Evening';
}

const ASSIGNMENT_NOTE_METADATA_REGEX = /\b(?:Till|Slut)\s*:?\s*(\d{1,2}:\d{2})/i;
const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 60;

function parseTimeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function calculateDurationMinutes(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) {
    return null;
  }
  const diff = end - start;
  if (diff <= 0) {
    return null;
  }
  return diff;
}

function addMinutesToTime(startTime: string, durationMinutes: number) {
  const start = parseTimeToMinutes(startTime);
  if (start === null) {
    return null;
  }
  return formatMinutesToTime(start + durationMinutes);
}

function extractEndTimeFromNote(note?: string) {
  if (!note) {
    return null;
  }
  const match = note.match(ASSIGNMENT_NOTE_METADATA_REGEX);
  return match?.[1]?.trim() ?? null;
}

export function stripAssignmentNoteMetadata(note?: string) {
  if (!note) {
    return undefined;
  }
  const cleaned = note.replace(ASSIGNMENT_NOTE_METADATA_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function resolvePostsCursor(rows: Array<{ created_at?: string; id?: string }>): PostsCursor | null {
  if (!rows.length) {
    return null;
  }
  const last = rows[rows.length - 1];
  if (!last?.created_at || !last?.id) {
    return null;
  }
  return { createdAt: last.created_at, id: last.id };
}

function buildRecurringAssignmentKey(
  stableId: string,
  date: string,
  title: string,
  startTime: string,
  durationMinutes: number,
) {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedStart = startTime.trim();
  return `${stableId}|${date}|${normalizedTitle}|${normalizedStart}|${durationMinutes}`;
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

type StorageUploadResult = {
  path: string;
  publicUrl: string;
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

function isLocalUri(uri: string) {
  return /^(file|content):\/\//i.test(uri);
}

function hasUriScheme(uri: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(uri);
}

const POSTS_BUCKET = 'posts';
const POSTS_PAGE_SIZE = 30;
const POST_IMAGE_TTL_SECONDS = 60 * 60;
const POST_IMAGE_TTL_MS = POST_IMAGE_TTL_SECONDS * 1000;
const POST_IMAGE_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const postImageUrlCache = new Map<
  string,
  { url: string; createdAt: number; expiresAt: number; version: number }
>();
const postImageUrlRequests = new Map<string, Promise<string | null>>();
const warnedLegacyPostImageUrls = new Set<string>();

function normalizePostImagePath(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) {
    return null;
  }
  let path = trimmed.replace(/^\/+/, '');
  const bucketPrefix = `${POSTS_BUCKET}/`;
  if (path.toLowerCase().startsWith(bucketPrefix)) {
    path = path.slice(bucketPrefix.length);
  }
  if (!path) {
    return null;
  }
  return path;
}

function warnLegacyPostImageUrl(postId: string, value: string) {
  if (warnedLegacyPostImageUrls.has(postId)) {
    return;
  }
  warnedLegacyPostImageUrls.add(postId);
  console.warn('Post image_url should be a storage path, got URL instead.', { postId, value });
}

function appendCacheBuster(url: string, version: number) {
  if (!version) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

function invalidateSignedUrl(path: string) {
  const normalized = normalizePostImagePath(path);
  if (!normalized) {
    return;
  }
  postImageUrlCache.delete(normalized);
  postImageUrlRequests.delete(normalized);
}

async function getSignedPostImageUrl(path: string) {
  const normalized = normalizePostImagePath(path);
  if (!normalized) {
    return null;
  }
  const cached = postImageUrlCache.get(normalized);
  const now = Date.now();
  if (cached && now < cached.expiresAt - POST_IMAGE_REFRESH_BUFFER_MS) {
    return cached.url;
  }
  const existingRequest = postImageUrlRequests.get(normalized);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const { data, error } = await supabase
      .storage
      .from(POSTS_BUCKET)
      .createSignedUrl(normalized, POST_IMAGE_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn('Kunde inte skapa signed URL för postbild.', { path: normalized, error });
      return null;
    }
    const nextVersion = (cached?.version ?? 0) + 1;
    const signedUrl = appendCacheBuster(data.signedUrl, nextVersion);
    const createdAt = Date.now();
    const expiresAt = createdAt + POST_IMAGE_TTL_MS;
    postImageUrlCache.set(normalized, { url: signedUrl, createdAt, expiresAt, version: nextVersion });
    return signedUrl;
  })();

  postImageUrlRequests.set(normalized, request);
  const resolved = await request;
  postImageUrlRequests.delete(normalized);
  return resolved;
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

  const response = await createTimeoutFetch((input, init) => fetch(input, init))(image.uri);
  return response.blob();
}

async function uploadPostImage(params: {
  stableId: string;
  userId: string;
  postId: string;
  image: UploadableImage;
}): Promise<string> {
  const { stableId, userId, postId, image } = params;
  const extension = getExtensionFromUri(image.uri, image.mimeType);
  const contentType = resolveContentType(extension, image.mimeType);
  const filePath = `${stableId}/${userId}/${postId}/${generateId()}.${extension}`;
  const blob = await resolveBlob(image, contentType);

  const { error } = await supabase.storage.from(POSTS_BUCKET).upload(filePath, blob, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }

  invalidateSignedUrl(filePath);
  return filePath;
}

async function uploadImageToStorage(
  bucket: string,
  pathPrefix: string,
  image: UploadableImage,
): Promise<StorageUploadResult> {
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
  return { path: filePath, publicUrl: data.publicUrl };
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const stateRef = React.useRef(state);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [hydrating, setHydrating] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<string | null>(null);
  const refreshRequestId = React.useRef(0);
  const pendingDataWrites = React.useRef(new Set<string>());
  const dataWriteVersion = React.useRef(0);
  const defaultPassesStableId = React.useRef('');
  const autoAssignmentAttempts = React.useRef(new Map<string, string>());
  const pendingOwnerStableErrorShown = React.useRef(false);
  // Surfaces a failed background write to the user instead of swallowing it in a
  // console.warn. Debounced so a burst of failed writes shows one toast, not many.
  // The toast tells the user the optimistic change did not persist so they can reload.
  const persistErrorAt = React.useRef(0);
  const reportPersistError = React.useCallback(
    (context: string, error: unknown) => {
      console.warn(context, error);
      // qaDemo is a backend-free demo seeded entirely from local state — every write
      // "fails" because there is no live Supabase session. Optimistic state is the
      // source of truth there, so don't alarm with persist-error toasts.
      if (isQaDemoMode) return;
      const now = Date.now();
      if (now - persistErrorAt.current > 4000) {
        persistErrorAt.current = now;
        showToast('Kunde inte spara ändringen. Ladda om för att se senaste data.', 'error');
      }
    },
    [showToast],
  );
  // Stable ref so persist callbacks can report errors without listing reportPersistError
  // in every dependency array. Persist calls run async after commit, so the effect-synced
  // ref is always current by the time it is invoked.
  const reportPersistErrorRef = React.useRef(reportPersistError);
  const trackDataWrite = React.useCallback((operation: Promise<unknown>) =>
    trackPendingWrite(operation, pendingDataWrites.current,
      () => { dataWriteVersion.current += 1; },
      (error) => reportPersistErrorRef.current('[stable save] Kunde inte spara ändringen', error)), []);
  React.useEffect(() => {
    reportPersistErrorRef.current = reportPersistError;
  }, [reportPersistError]);
  const recurringDurationById = React.useRef(new Map<string, number>());
  const pendingInviteDrafts = React.useRef(new Map<string, { code: string; rows: Record<string, unknown>[] }>());
  const pendingRecurringBatches = React.useRef(new Map<string, Assignment[]>());
  const pendingAssignmentClaimIdsRef = React.useRef(new Set<string>());

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
    async (assignment: Assignment): Promise<{ error: unknown; reason?: string }> => {
      if (isQaDemoMode) return { error: null };
      const writeKey = `assignment:${assignment.id}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { error: new Error('Passet sparas redan.') };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const payload = buildAssignmentInsertPayload(assignment);
        const { data, error } = await supabase.from('assignments')
          .insert(payload)
          .select('id')
          .abortSignal(controller.signal);
        if (error?.code === '23505') {
          // The first INSERT may have succeeded while its acknowledgement was lost.
          const { data: existing, error: readError } = await supabase.from('assignments')
            .select('*')
            .eq('id', assignment.id)
            .eq('stable_id', assignment.stableId)
            .abortSignal(controller.signal)
            .single();
          if (readError) throw readError;
          const matches = existing && Object.entries(payload).every(([key, value]) =>
            JSON.stringify(existing[key] ?? null) === JSON.stringify(value ?? null),
          );
          if (!matches) {
            const reason = 'Passet har redan sparats med andra uppgifter. Uppdatera schemat och öppna passet för att redigera.';
            console.warn('[assignment create] Befintligt pass matchar inte utkastet', { assignmentId: assignment.id });
            return { error: new Error(reason), reason };
          }
          return { error: null };
        }
        if (error) throw error;
        if (!data?.some((row) => row.id === assignment.id)) {
          throw new Error('Servern bekräftade inte det nya passet.');
        }
        return { error: null };
      } catch (error) {
        console.warn('[assignment create] Kunde inte skapa pass', error);
        return { error };
      } finally {
        clearTimeout(timeout);
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [user],
  );

  const persistAssignmentBatchInsert = React.useCallback(
    async (assignmentsToInsert: Assignment[]) => {
      if (isQaDemoMode) return { error: null };
      const keys = assignmentsToInsert.map((assignment) => `assignment:${assignment.id}`);
      if (keys.some((key) => pendingDataWrites.current.has(key))) return { error: new Error('Passen sparas redan.') };
      keys.forEach((key) => pendingDataWrites.current.add(key));
      dataWriteVersion.current += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const payload = assignmentsToInsert.map(buildAssignmentInsertPayload);
        const { data, error } = await supabase.from('assignments').insert(payload).select('id').abortSignal(controller.signal);
        if (error?.code === '23505') {
          const { data: existing, error: readError } = await supabase.from('assignments').select('*')
            .in('id', assignmentsToInsert.map((assignment) => assignment.id)).abortSignal(controller.signal);
          if (readError) throw readError;
          const matches = payload.every((row) => {
            const saved = existing?.find((item) => item.id === row.id);
            return saved && Object.entries(row).every(([key, value]) => JSON.stringify(saved[key] ?? null) === JSON.stringify(value ?? null));
          });
          if (!matches) throw new Error('Befintliga pass matchar inte serien. Uppdatera schemat.');
          return { error: null };
        }
        if (error) throw error;
        if (!assignmentsToInsert.every((assignment) => data?.some((row) => row.id === assignment.id))) {
          throw new Error('Servern bekräftade inte hela serien.');
        }
        return { error: null };
      } catch (error) {
        console.warn('[assignment series] Kunde inte skapa återkommande pass', error);
        return { error };
      } finally {
        clearTimeout(timeout);
        keys.forEach((key) => pendingDataWrites.current.delete(key));
      }
    },
    [user],
  );

  const persistAssignmentUpdate = React.useCallback(
    async (assignmentId: string, updates: Partial<Assignment>, overrides?: Record<string, unknown>, reportFailure = true) => {
      if (isQaDemoMode) return { error: null };
      const writeKey = `assignment:${assignmentId}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { error: new Error('Passet sparas redan.') };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const existing = stateRef.current.assignments.find((assignment) => assignment.id === assignmentId);
        if (!existing) throw new Error('Passet kunde inte hittas.');
        const payload = {
          ...buildAssignmentUpdatePayload(updates),
          ...(overrides ?? {}),
        };
        let query = supabase.from('assignments').update(payload)
          .eq('id', assignmentId)
          .eq('stable_id', existing.stableId)
          .eq('status', existing.status);
        query = existing.assigneeId
          ? query.eq('assignee_id', existing.assigneeId)
          : query.is('assignee_id', null);
        const { data, error } = await query.select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === assignmentId)) {
          throw new Error('Servern bekräftade inte passändringen. Passet kan ha ändrats av någon annan.');
        }
        return { error: null };
      } catch (error) {
        if (reportFailure) reportPersistError('[assignment update] Kunde inte uppdatera pass', error);
        else console.warn('[assignment update] Kunde inte uppdatera pass', error);
        return { error };
      } finally {
        clearTimeout(timeout);
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [user, reportPersistError],
  );

  const persistAssignmentClaim = React.useCallback(
    async (assignmentId: string, updates: Partial<Assignment>) => {
      if (isQaDemoMode) return { claimed: true, error: null };
      if (!user) {
        const error = new Error('Missing session');
        reportPersistError('[assignment claim] Session saknas', error);
        return { claimed: false, error };
      }

      const { data, error } = await supabase
        .from('assignments')
        .update(buildAssignmentUpdatePayload(updates))
        .eq('id', assignmentId)
        .eq('status', 'open')
        .is('assignee_id', null)
        .select('id');
      if (error) {
        reportPersistError('[assignment claim] Kunde inte ta pass', error);
      }
      return { claimed: Boolean(data?.length), error };
    },
    [user, reportPersistError],
  );

  const persistOwnAssignmentUpdate = React.useCallback(
    async (assignment: Assignment, updates: Partial<Assignment>): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const writeKey = `assignment:${assignment.id}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Passet sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('assignments')
          .update(buildAssignmentUpdatePayload(updates))
          .eq('id', assignment.id)
          .eq('stable_id', assignment.stableId)
          .eq('status', 'assigned')
          .eq('assignee_id', user.id)
          .select('id')
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === assignment.id)) {
          return { success: false, reason: 'Passet har ändrats av någon annan. Uppdatera schemat och försök igen.' };
        }
        return { success: true };
      } catch (error) {
        console.warn('[assignment update] Kunde inte uppdatera eget pass', error);
        return { success: false, reason: 'Passet kunde inte uppdateras. Försök igen.' };
      } finally {
        clearTimeout(timeout);
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [user],
  );

  const persistAssignmentDelete = React.useCallback(
    async (assignmentId: string) => {
      if (isQaDemoMode) return { error: null };
      const writeKey = `assignment:${assignmentId}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { error: new Error('Passet sparas redan.') };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const existing = stateRef.current.assignments.find((assignment) => assignment.id === assignmentId);
        if (!existing) throw new Error('Passet kunde inte hittas.');
        let query = supabase.from('assignments').delete()
          .eq('id', assignmentId)
          .eq('stable_id', existing.stableId)
          .eq('status', existing.status);
        query = existing.assigneeId
          ? query.eq('assignee_id', existing.assigneeId)
          : query.is('assignee_id', null);
        const { data, error } = await query.select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === assignmentId)) {
          throw new Error('Servern bekräftade inte borttagningen. Passet kan ha ändrats av någon annan.');
        }
        return { error: null };
      } catch (error) {
        console.warn('[assignment delete] Kunde inte ta bort pass', error);
        return { error };
      } finally {
        clearTimeout(timeout);
        pendingDataWrites.current.delete(writeKey);
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
        reportPersistError('Kunde inte spara passhistorik', error);
      }
    },
    [user, reportPersistError],
  );

  const persistPaddockUpsert = React.useCallback(
    async (paddock: Paddock, imageInput: PaddockImage | null | undefined, existing: boolean): Promise<ActionResult<Paddock>> => {
      if (isQaDemoMode) return { success: true, data: paddock };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const payload: Record<string, unknown> = {
          id: paddock.id, stable_id: paddock.stableId, name: paddock.name,
          horse_names: paddock.horseNames, season: paddock.season ?? 'yearRound', updated_at: paddock.updatedAt,
        };
        if (imageInput === null) {
          payload.image_url = null;
        } else if (imageInput) {
          const uploadable = getUploadableImage(imageInput);
          if (uploadable) {
            payload.image_url = isRemoteUri(uploadable.uri) ? uploadable.uri
              : (await uploadImageToStorage('paddocks', paddock.stableId, uploadable)).publicUrl;
          }
        }
        const query = existing
          ? supabase.from('paddocks').update(payload).eq('id', paddock.id).eq('stable_id', paddock.stableId)
          : supabase.from('paddocks').upsert(payload);
        const { data, error } = await query.select('*').abortSignal(controller.signal).single();
        if (error || data?.id !== paddock.id || data.stable_id !== paddock.stableId
          || data.name !== paddock.name || JSON.stringify(data.horse_names) !== JSON.stringify(paddock.horseNames)
          || data.season !== (paddock.season ?? 'yearRound')
          || ('image_url' in payload && data.image_url !== payload.image_url)) {
          throw error ?? new Error('Servern bekräftade inte hagen.');
        }
        return { success: true, data: {
          id: data.id, stableId: data.stable_id, name: data.name, horseNames: data.horse_names,
          season: data.season, updatedAt: data.updated_at,
          image: data.image_url ? { uri: data.image_url } : undefined,
        } };
      } catch (error) {
        console.warn('[paddock save] Kunde inte spara hage', error);
        return { success: false, reason: 'Hagen kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistPaddockDelete = React.useCallback(
    async (paddock: Paddock): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('paddocks').delete().eq('id', paddock.id)
          .eq('stable_id', paddock.stableId).select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === paddock.id)) throw new Error('Servern bekräftade inte borttagningen av hagen.');
        return { success: true };
      } catch (error) {
        console.warn('[paddock delete] Kunde inte ta bort hage', error);
        return { success: false, reason: 'Hagen kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistHorseUpsert = React.useCallback(
    async (horse: Horse, input: UpsertHorseInput, existing: boolean): Promise<ActionResult<Horse>> => {
      if (isQaDemoMode) return { success: true, data: horse };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const payload: Record<string, unknown> = { id: horse.id, stable_id: horse.stableId };
        if (!existing || 'name' in input) payload.name = horse.name;
        const fields = {
          ownerUserId: 'owner_user_id', boxNumber: 'box_number', canSleepInside: 'can_sleep_inside',
          gender: 'gender', age: 'age', note: 'note',
        } as const;
        for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
          if (key in input) payload[fields[key]] = horse[key] ?? null;
        }
        if ('image' in input) {
          const uploadable = input.image ? getUploadableImage(input.image) : null;
          if (uploadable) {
            payload.image_url = isRemoteUri(uploadable.uri) ? uploadable.uri
              : (await uploadImageToStorage('avatars', horse.stableId, uploadable)).publicUrl;
          } else if (!input.image) {
            payload.image_url = null;
          }
        }
        const query = existing
          ? supabase.from('horses').update(payload).eq('id', horse.id).eq('stable_id', horse.stableId)
          : supabase.from('horses').upsert(payload);
        const { data, error } = await query.select('*').abortSignal(controller.signal).single();
        if (error || data?.id !== horse.id || data.stable_id !== horse.stableId) {
          throw error ?? new Error('Servern bekräftade inte hästen.');
        }
        return { success: true, data: {
          id: data.id, stableId: data.stable_id, name: data.name,
          ownerUserId: data.owner_user_id ?? undefined, boxNumber: data.box_number ?? undefined,
          canSleepInside: data.can_sleep_inside ?? undefined, gender: data.gender ?? undefined,
          age: data.age ?? undefined, note: data.note ?? undefined,
          image: data.image_url ? { uri: data.image_url } : undefined,
        } };
      } catch (error) {
        console.warn('[horse save] Kunde inte spara häst', error);
        return { success: false, reason: 'Hästen kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistHorseDelete = React.useCallback(
    async (horse: Horse): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('horses').delete().eq('id', horse.id)
          .eq('stable_id', horse.stableId).select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === horse.id)) throw new Error('Servern bekräftade inte borttagningen av hästen.');
        return { success: true };
      } catch (error) {
        console.warn('[horse delete] Kunde inte ta bort häst', error);
        return { success: false, reason: 'Hästen kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistHorseDayStatusUpsert = React.useCallback(
    async (status: HorseDayStatus, updates: UpdateHorseDayStatusInput['updates']): Promise<HorseDayStatus> => {
      if (isQaDemoMode) return status;
      if (!user) throw new Error('Session saknas.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        // Send only edited fields so another phone's water/hay mark is preserved.
        const { data, error } = await supabase.from('horse_day_statuses').upsert(
          {
            id: status.id,
            stable_id: status.stableId,
            horse_id: status.horseId,
            date: status.date,
            ...('dayStatus' in updates ? { day_status: updates.dayStatus ?? null } : {}),
            ...('nightStatus' in updates ? { night_status: updates.nightStatus ?? null } : {}),
            ...('checked' in updates ? { checked: updates.checked ?? null } : {}),
            ...('water' in updates ? { water: updates.water ?? null } : {}),
            ...('hay' in updates ? { hay: updates.hay ?? null } : {}),
          },
          { onConflict: 'stable_id,horse_id,date' },
        ).select('*').abortSignal(controller.signal).single();
        if (error) throw error;
        if (!data?.id || data.horse_id !== status.horseId || data.date !== status.date) {
          throw new Error('Servern bekräftade inte häststatus.');
        }
        return {
          id: data.id, stableId: data.stable_id, horseId: data.horse_id, date: data.date,
          dayStatus: data.day_status ?? undefined, nightStatus: data.night_status ?? undefined,
          checked: data.checked ?? undefined, water: data.water ?? undefined, hay: data.hay ?? undefined,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistFeedPlanUpsert = React.useCallback(
    async (plan: FeedPlanItem): Promise<FeedPlanItem> => {
      if (isQaDemoMode) return plan;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const { data, error } = await supabase.from('feed_plans').upsert({
          id: plan.id,
          stable_id: plan.stableId,
          horse_id: plan.horseId ?? null,
          slot: plan.slot,
          label: plan.label,
          amount: plan.amount ?? null,
          note: plan.note ?? null,
          is_stable_default: plan.isStableDefault,
          active: plan.active,
          updated_at: new Date().toISOString(),
        }).select('*').abortSignal(controller.signal).single();
        if (error) throw error;
        if (!data || data.id !== plan.id || data.stable_id !== plan.stableId) {
          throw new Error('Servern bekräftade inte foderplanen.');
        }
        return {
          id: data.id, stableId: data.stable_id, horseId: data.horse_id ?? undefined,
          slot: data.slot, label: data.label, amount: data.amount ?? undefined,
          note: data.note ?? undefined, isStableDefault: data.is_stable_default ?? false,
          active: data.active ?? true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistFeedPlanDelete = React.useCallback(
    async (plan: FeedPlanItem): Promise<void> => {
      if (isQaDemoMode) return;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const { data, error } = await supabase.from('feed_plans').delete()
          .eq('id', plan.id).eq('stable_id', plan.stableId)
          .select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === plan.id)) {
          throw new Error('Servern bekräftade inte borttagningen av foderplanen.');
        }
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistFeedCheckUpsert = React.useCallback(
    async (check: FeedCheck, input: UpsertFeedCheckInput): Promise<FeedCheck> => {
      if (isQaDemoMode) return check;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const { data, error } = await supabase.from('feed_checks').upsert(
          {
            id: check.id,
            stable_id: check.stableId,
            horse_id: check.horseId,
            date: check.date,
            slot: check.slot,
            ...(input.checked !== undefined ? {
              checked_by_user_id: check.checkedByUserId ?? null,
              checked_at: check.checkedAt ?? null,
            } : {}),
            ...(input.deviationNote !== undefined ? { deviation_note: check.deviationNote ?? null } : {}),
          },
          { onConflict: 'horse_id,date,slot' },
        ).select('*').abortSignal(controller.signal).single();
        if (error) throw error;
        if (!data?.id || data.horse_id !== check.horseId || data.date !== check.date || data.slot !== check.slot) {
          throw new Error('Servern bekräftade inte foderkollen.');
        }
        return {
          id: data.id,
          stableId: data.stable_id,
          horseId: data.horse_id,
          date: data.date,
          slot: data.slot,
          checkedByUserId: data.checked_by_user_id ?? undefined,
          checkedAt: data.checked_at ?? undefined,
          deviationNote: data.deviation_note ?? undefined,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistPlannedRideUpsert = React.useCallback(
    async (ride: PlannedRide, previous?: PlannedRide, updates?: UpdatePlannedRideInput['updates']): Promise<PlannedRide> => {
      if (isQaDemoMode) return ride;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const completing = Boolean(previous && !updates && ride.status === 'done');
      const payload = {
        id: ride.id, stable_id: ride.stableId, horse_id: ride.horseId,
        rider_user_id: ride.riderUserId ?? null, date: ride.date, time: ride.time ?? null,
        ride_type_id: ride.rideTypeId ?? null, note: ride.note ?? null, status: ride.status,
        completed_ride_log_id: ride.completedRideLogId ?? null,
      };
      const fields = completing ? {
        status: 'done', completed_ride_log_id: ride.completedRideLogId,
      } : updates ? {
        ...('date' in updates ? { date: ride.date } : {}),
        ...('time' in updates ? { time: ride.time ?? null } : {}),
        ...('rideTypeId' in updates ? { ride_type_id: ride.rideTypeId ?? null } : {}),
        ...('note' in updates ? { note: ride.note ?? null } : {}),
        ...('riderUserId' in updates ? { rider_user_id: ride.riderUserId ?? null } : {}),
        ...('status' in updates ? { status: ride.status } : {}),
      } : payload;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const write = { ...fields, updated_at: new Date().toISOString() };
        let query;
        if (previous) {
          query = supabase.from('planned_rides').update(write)
            .eq('id', ride.id).eq('stable_id', ride.stableId).eq('status', previous.status);
          query = previous.completedRideLogId
            ? query.eq('completed_ride_log_id', previous.completedRideLogId)
            : query.is('completed_ride_log_id', null);
          if (completing) {
            query = query.eq('horse_id', previous.horseId).eq('date', previous.date);
            query = previous.rideTypeId ? query.eq('ride_type_id', previous.rideTypeId) : query.is('ride_type_id', null);
          }
        } else {
          query = supabase.from('planned_rides').insert(write);
        }
        const result = await query.select('*').abortSignal(controller.signal).single();
        let data = result.data;
        const recoverCreate = !previous && result.error?.code === '23505';
        const recoverCompletion = completing && ((!result.error && !data) || result.error?.code === 'PGRST116');
        if (recoverCreate || recoverCompletion) {
          const recovered = await supabase.from('planned_rides').select('*')
            .eq('id', ride.id).eq('stable_id', ride.stableId).abortSignal(controller.signal).single();
          if (recovered.error) throw recovered.error;
          data = recovered.data;
        } else if (result.error) {
          throw result.error;
        }
        if (!data || data.id !== ride.id || data.stable_id !== ride.stableId ||
            !Object.entries(fields).every(([key, value]) => JSON.stringify(data[key] ?? null) === JSON.stringify(value ?? null))) {
          throw new Error('Ridpasset har ändrats eller avbokats, eller kunde inte bekräftas. Uppdatera sidan.');
        }
        return {
          id: data.id, stableId: data.stable_id, horseId: data.horse_id,
          riderUserId: data.rider_user_id ?? undefined, date: data.date,
          time: data.time ?? undefined, rideTypeId: data.ride_type_id ?? undefined,
          note: data.note ?? undefined, status: data.status,
          completedRideLogId: data.completed_ride_log_id ?? undefined, createdAt: data.created_at,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistPlannedRideDelete = React.useCallback(
    async (ride: PlannedRide): Promise<void> => {
      if (isQaDemoMode) return;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        let query = supabase.from('planned_rides').delete().eq('id', ride.id)
          .eq('stable_id', ride.stableId).eq('status', ride.status);
        query = ride.completedRideLogId
          ? query.eq('completed_ride_log_id', ride.completedRideLogId)
          : query.is('completed_ride_log_id', null);
        const { data, error } = await query.select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === ride.id)) throw new Error('Servern bekräftade inte borttagningen av ridpasset.');
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistExternalContactUpsert = React.useCallback(
    async (contact: ExternalContact): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('external_contacts').upsert({
          id: contact.id, stable_id: contact.stableId, name: contact.name, type: contact.type,
          phone: contact.phone ?? null, email: contact.email ?? null, note: contact.note ?? null,
          updated_at: new Date().toISOString(),
        }).select('id').abortSignal(controller.signal).single();
        if (error || data?.id !== contact.id) throw error ?? new Error('Servern bekräftade inte kontakten.');
        return { success: true };
      } catch (error) {
        console.warn('[contacts save] Kunde inte spara kontakt', error);
        return { success: false, reason: 'Kontakten kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistExternalContactDelete = React.useCallback(
    async (contactId: string): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('external_contacts').delete().eq('id', contactId)
          .select('id').abortSignal(controller.signal).single();
        if (error || data?.id !== contactId) throw error ?? new Error('Servern bekräftade inte borttagningen.');
        return { success: true };
      } catch (error) {
        console.warn('[contacts delete] Kunde inte ta bort kontakt', error);
        return { success: false, reason: 'Kontakten kunde inte tas bort. Uppdatera eller försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistCareEventUpsert = React.useCallback(
    async (event: CareEvent, previous?: CareEvent, updates?: Partial<CareEvent>): Promise<CareEvent> => {
      if (isQaDemoMode) return event;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const payload = {
        id: event.id, stable_id: event.stableId, horse_ids: event.horseIds,
        type: event.type, title: event.title, date: event.date, time: event.time ?? null,
        contact_id: event.contactId ?? null, responsible_user_id: event.responsibleUserId ?? null,
        status: event.status, note: event.note ?? null, completed_at: event.completedAt ?? null,
      };
      const fields = previous && updates ? {
        ...('horseIds' in updates ? { horse_ids: event.horseIds } : {}),
        ...('type' in updates ? { type: event.type } : {}),
        ...('title' in updates ? { title: event.title } : {}),
        ...('date' in updates ? { date: event.date } : {}),
        ...('time' in updates ? { time: event.time ?? null } : {}),
        ...('contactId' in updates ? { contact_id: event.contactId ?? null } : {}),
        ...('responsibleUserId' in updates ? { responsible_user_id: event.responsibleUserId ?? null } : {}),
        ...('status' in updates ? { status: event.status } : {}),
        ...('note' in updates ? { note: event.note ?? null } : {}),
        ...('completedAt' in updates ? { completed_at: event.completedAt ?? null } : {}),
      } : payload;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const write = { ...fields, updated_at: new Date().toISOString() };
        const query = previous
          ? supabase.from('care_events').update(write).eq('id', event.id).eq('stable_id', event.stableId).eq('status', previous.status)
          : supabase.from('care_events').insert(write);
        const result = await query.select('*').abortSignal(controller.signal).single();
        let data = result.data;
        const recoverCreate = !previous && result.error?.code === '23505';
        const recoverStatus = Boolean(previous && updates?.status && previous.status !== updates.status && result.error?.code === 'PGRST116');
        if (recoverCreate || recoverStatus) {
          const recovered = await supabase.from('care_events').select('*')
            .eq('id', event.id).eq('stable_id', event.stableId).abortSignal(controller.signal).single();
          if (recovered.error) throw recovered.error;
          data = recovered.data;
        } else if (result.error) {
          throw result.error;
        }
        if (!data || data.id !== event.id || data.stable_id !== event.stableId ||
            !Object.entries(fields).every(([key, value]) => {
              if (key === 'completed_at' && value && data[key]) {
                return recoverStatus || new Date(data[key]).getTime() === new Date(value as string).getTime();
              }
              return JSON.stringify(data[key] ?? null) === JSON.stringify(value ?? null);
            })) {
          throw new Error('Vårdhändelsen har ändrats eller sparats med andra uppgifter. Uppdatera sidan innan du försöker igen.');
        }
        return {
          id: data.id, stableId: data.stable_id, horseIds: data.horse_ids,
          type: data.type, title: data.title, date: data.date, time: data.time ?? undefined,
          contactId: data.contact_id ?? undefined, responsibleUserId: data.responsible_user_id ?? undefined,
          status: data.status, note: data.note ?? undefined,
          completedAt: data.completed_at ?? undefined, createdAt: data.created_at,
        };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistCareEventDelete = React.useCallback(
    async (event: CareEvent): Promise<void> => {
      if (isQaDemoMode) return;
      if (!user) throw new Error('Session saknas. Logga in igen.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const { data, error } = await supabase.from('care_events').delete().eq('id', event.id)
          .eq('stable_id', event.stableId).eq('status', event.status).select('id').abortSignal(controller.signal);
        if (error) throw error;
        if (!data?.some((row) => row.id === event.id)) throw new Error('Servern bekräftade inte borttagningen av vårdhändelsen.');
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistDayEventInsert = React.useCallback(
    async (event: DayEvent): Promise<ActionResult<DayEvent>> => {
      if (isQaDemoMode) return { success: true, data: event };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const payload = { id: event.id, stable_id: event.stableId, date: event.date, label: event.label, tone: event.tone };
        let { data, error } = await supabase.from('day_events').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('day_events').select('*').eq('id', event.id)
            .eq('stable_id', event.stableId).abortSignal(controller.signal).single());
        }
        if (error || !data || Object.entries(payload).some(([key, value]) => data[key] !== value)) throw error ?? new Error('Servern bekräftade inte uppgifterna.');
        return { success: true, data: event };
      } catch (error) {
        console.warn('[day event save] Kunde inte spara', error);
        return { success: false, reason: 'Uppgifterna kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistDayEventDelete = React.useCallback(
    async (event: DayEvent): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('day_events').delete().eq('id', event.id)
          .eq('stable_id', event.stableId).select('id').abortSignal(controller.signal);
        if (error || !data?.some(row => row.id === event.id)) throw error ?? new Error('Servern bekräftade inte borttagningen.');
        return { success: true };
      } catch (error) {
        console.warn('[day event delete] Kunde inte ta bort', error);
        return { success: false, reason: 'Uppgifterna kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistArenaBookingInsert = React.useCallback(
    async (booking: ArenaBooking): Promise<ActionResult<ArenaBooking>> => {
      if (isQaDemoMode) return { success: true, data: booking };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const payload = { id: booking.id, stable_id: booking.stableId, date: booking.date,
          start_time: booking.startTime, end_time: booking.endTime, purpose: booking.purpose,
          note: booking.note ?? null, booked_by_user_id: booking.bookedByUserId };
        let { data, error } = await supabase.from('arena_bookings').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('arena_bookings').select('*').eq('id', booking.id)
            .eq('stable_id', booking.stableId).abortSignal(controller.signal).single());
        }
        if (error || !data || Object.entries(payload).some(([key, value]) =>
          (key === 'start_time' || key === 'end_time' ? String(data[key]).slice(0, 5) : data[key]) !== value)) {
          throw error ?? new Error('Servern bekräftade inte bokningen.');
        }
        return { success: true, data: booking };
      } catch (error) {
        console.warn('[arena booking save] Kunde inte spara ridhusbokning', error);
        return { success: false, reason: 'Bokningen kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistArenaBookingUpdate = React.useCallback(
    async (booking: ArenaBooking, updates: Partial<ArenaBooking>): Promise<ActionResult<ArenaBooking>> => {
      if (isQaDemoMode) return { success: true, data: { ...booking, ...updates } };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const fields = { date: 'date', startTime: 'start_time', endTime: 'end_time', purpose: 'purpose', note: 'note' } as const;
        const payload: Record<string, unknown> = {};
        for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
          if (hasOwnProperty(updates, key)) payload[fields[key]] = updates[key] ?? null;
        }
        if (!Object.keys(payload).length) return { success: true, data: booking };
        const { data, error } = await supabase.from('arena_bookings').update(payload).eq('id', booking.id)
          .eq('stable_id', booking.stableId).select('*').abortSignal(controller.signal).single();
        if (error || data?.id !== booking.id || data.stable_id !== booking.stableId) throw error ?? new Error('Servern bekräftade inte bokningen.');
        return { success: true, data: { id: data.id, stableId: data.stable_id, date: data.date,
          startTime: String(data.start_time).slice(0, 5), endTime: String(data.end_time).slice(0, 5),
          purpose: data.purpose, note: data.note ?? undefined, bookedByUserId: data.booked_by_user_id } };
      } catch (error) {
        console.warn('[arena booking update] Kunde inte uppdatera ridhusbokning', error);
        return { success: false, reason: 'Bokningen kunde inte uppdateras. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistArenaBookingDelete = React.useCallback(
    async (booking: ArenaBooking): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('arena_bookings').delete().eq('id', booking.id)
          .eq('stable_id', booking.stableId).select('id').abortSignal(controller.signal);
        if (error || !data?.some(row => row.id === booking.id)) throw error ?? new Error('Servern bekräftade inte borttagningen.');
        return { success: true };
      } catch (error) {
        console.warn('[arena booking delete] Kunde inte ta bort ridhusbokning', error);
        return { success: false, reason: 'Bokningen kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistArenaStatusInsert = React.useCallback(
    async (status: ArenaStatus): Promise<ActionResult<ArenaStatus>> => {
      if (isQaDemoMode) return { success: true, data: status };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const payload = { id: status.id, stable_id: status.stableId, date: status.date, label: status.label, created_by_user_id: status.createdByUserId };
        let { data, error } = await supabase.from('arena_statuses').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('arena_statuses').select('*').eq('id', status.id)
            .eq('stable_id', status.stableId).abortSignal(controller.signal).single());
        }
        if (error || !data || Object.entries(payload).some(([key, value]) => data[key] !== value)) throw error ?? new Error('Servern bekräftade inte uppgifterna.');
        return { success: true, data: status };
      } catch (error) {
        console.warn('[arena status save] Kunde inte spara', error);
        return { success: false, reason: 'Uppgifterna kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistArenaStatusDelete = React.useCallback(
    async (status: ArenaStatus): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('arena_statuses').delete().eq('id', status.id)
          .eq('stable_id', status.stableId).select('id').abortSignal(controller.signal);
        if (error || !data?.some(row => row.id === status.id)) throw error ?? new Error('Servern bekräftade inte borttagningen.');
        return { success: true };
      } catch (error) {
        console.warn('[arena status delete] Kunde inte ta bort', error);
        return { success: false, reason: 'Uppgifterna kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistRideLogInsert = React.useCallback(
    async (log: RideLogEntry, confirm = false): Promise<RideLogEntry | undefined> => {
      if (confirm && isQaDemoMode) return log;
      if (!user) {
        if (confirm) throw new Error('Session saknas. Logga in igen.');
        return;
      }
      const payload = {
        id: log.id, stable_id: log.stableId, horse_id: log.horseId, date: log.date,
        ride_type_id: log.rideTypeId, length: log.length ?? null, note: log.note ?? null,
        created_by_user_id: log.createdByUserId,
      };
      if (!confirm) {
        const { error } = await supabase.from('ride_logs').insert(payload);
        if (error) reportPersistError('Kunde inte spara ridpass', error);
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const result = await supabase.from('ride_logs').insert(payload)
          .select('*').abortSignal(controller.signal).single();
        let data = result.data;
        if (result.error?.code === '23505') {
          const recovered = await supabase.from('ride_logs').select('*')
            .eq('id', log.id).eq('stable_id', log.stableId).abortSignal(controller.signal).single();
          if (recovered.error) throw recovered.error;
          data = recovered.data;
        } else if (result.error) {
          throw result.error;
        }
        if (!data || !Object.entries(payload).every(([key, value]) =>
          JSON.stringify(data[key] ?? null) === JSON.stringify(value ?? null))) {
          throw new Error('Ridloggen kunde inte bekräftas med samma uppgifter och ryttare. Uppdatera sidan.');
        }
        return {
          id: data.id, stableId: data.stable_id, horseId: data.horse_id, date: data.date,
          rideTypeId: data.ride_type_id, length: data.length ?? undefined,
          note: data.note ?? undefined, createdByUserId: data.created_by_user_id,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user, reportPersistError],
  );

  const persistRideLogDelete = React.useCallback(
    async (log: RideLogEntry): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('ride_logs').delete().eq('id', log.id)
          .eq('stable_id', log.stableId).select('id').abortSignal(controller.signal);
        if (error || !data?.some(row => row.id === log.id)) throw error ?? new Error('Servern bekräftade inte borttagningen.');
        return { success: true };
      } catch (error) {
        console.warn('[ride log delete] Kunde inte ta bort ridpass', error);
        return { success: false, reason: 'Ridpasset kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistAlertInsert = React.useCallback(
    async (alert: AlertMessage): Promise<ActionResult<AlertMessage>> => {
      if (isQaDemoMode) return { success: true, data: alert };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const payload = { id: alert.id, stable_id: alert.stableId, message: alert.message, type: alert.type };
        let { data, error } = await supabase.from('alerts').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('alerts').select('*').eq('id', alert.id)
            .eq('stable_id', alert.stableId).abortSignal(controller.signal).single());
        }
        if (error || !data || Object.entries(payload).some(([key, value]) => data[key] !== value)) {
          throw error ?? new Error('Servern bekräftade inte händelsen.');
        }
        return { success: true, data: { ...alert, createdAt: data.created_at ?? alert.createdAt } };
      } catch (error) {
        console.warn('[stable event save] Kunde inte spara händelse', error);
        return { success: false, reason: 'Händelsen kunde inte sparas. Texten finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistStableAlertUpsert = React.useCallback(
    async (alert: StableAlert, resolveOnly = false): Promise<ActionResult<StableAlert>> => {
      if (isQaDemoMode) return { success: true, data: alert };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const payload = {
          id: alert.id, stable_id: alert.stableId, title: alert.title, body: alert.body ?? null,
          severity: alert.severity, horse_id: alert.horseId ?? null, paddock_id: alert.paddockId ?? null,
          assignment_id: alert.assignmentId ?? null, created_by_user_id: alert.createdByUserId,
          created_at: alert.createdAt, resolved_at: null,
        };
        const query = resolveOnly
          ? supabase.from('stable_alerts').update({ resolved_at: alert.resolvedAt })
            .eq('id', alert.id).eq('stable_id', alert.stableId).is('resolved_at', null)
          : supabase.from('stable_alerts').insert(payload);
        let { data, error } = await query.select('*').abortSignal(controller.signal).single();
        if ((!resolveOnly && error?.code === '23505') || (resolveOnly && error?.code === 'PGRST116')) {
          ({ data, error } = await supabase.from('stable_alerts').select('*')
            .eq('id', alert.id).eq('stable_id', alert.stableId).abortSignal(controller.signal).single());
        }
        if (error || data?.id !== alert.id || data.stable_id !== alert.stableId
          || (resolveOnly ? !data.resolved_at : Object.entries(payload)
            .some(([key, value]) => key !== 'created_at' && key !== 'resolved_at' && data[key] !== value))) {
          throw error ?? new Error('Servern bekräftade inte notisen.');
        }
        return { success: true, data: {
          ...alert, title: data.title, body: data.body ?? undefined, severity: data.severity,
          createdAt: data.created_at, resolvedAt: data.resolved_at ?? undefined,
          horseId: data.horse_id ?? undefined, paddockId: data.paddock_id ?? undefined,
          assignmentId: data.assignment_id ?? undefined,
        } };
      } catch (error) {
        console.warn('[stable alert save] Kunde inte spara viktig stallnotis', error);
        return { success: false, reason: resolveOnly
          ? 'Notisen kunde inte markeras som löst. Försök igen.'
          : 'Notisen kunde inte sparas. Din text finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistDefaultPassToggle = React.useCallback(
    async (input: { userId: string; stableId: string; weekday: WeekdayIndex; slot: AssignmentSlot; enabled: boolean }): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || !input.stableId) throw new Error('Session eller stall saknas.');
        const payload = { user_id: input.userId, stable_id: input.stableId, weekday: input.weekday, slot: input.slot };
        const read = () => supabase.from('default_passes').select('*').eq('user_id', input.userId)
          .eq('stable_id', input.stableId).eq('weekday', input.weekday).eq('slot', input.slot).abortSignal(controller.signal);
        if (input.enabled) {
          let { data, error } = await supabase.from('default_passes').insert(payload).select('*').abortSignal(controller.signal).single();
          if (error?.code === '23505') ({ data, error } = await read().single());
          if (error || !data || Object.entries(payload).some(([key, value]) => data[key] !== value)) throw error ?? new Error('Servern bekräftade inte standardpasset.');
        } else {
          const { data, error } = await supabase.from('default_passes').delete().eq('user_id', input.userId)
            .eq('stable_id', input.stableId).eq('weekday', input.weekday).eq('slot', input.slot).select('*').abortSignal(controller.signal);
          if (error) throw error;
          if (!data?.some(row => Object.entries(payload).every(([key, value]) => row[key] === value))) {
            const remaining = await read().maybeSingle();
            if (remaining.error || remaining.data) throw remaining.error ?? new Error('Standardpasset finns fortfarande kvar.');
          }
        }
        return { success: true };
      } catch (error) {
        console.warn('[default pass save] Kunde inte spara standardpass', error);
        return { success: false, reason: 'Standardpasset kunde inte sparas. Ditt tidigare val gäller fortfarande. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistGroupInsert = React.useCallback(
    async (group: Group): Promise<ActionResult<Group>> => {
      if (isQaDemoMode) return { success: true, data: group };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || group.createdByUserId !== user.id || !group.stableId) throw new Error('Session eller stall saknas.');
        const payload = {
          id: group.id, stable_id: group.stableId, farm_id: group.farmId ?? null,
          horse_id: group.horseId ?? null, name: group.name, type: group.type,
          created_by_user_id: user.id, created_at: group.createdAt,
        };
        let { data, error } = await supabase.from('groups').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('groups').select('*').eq('id', group.id).abortSignal(controller.signal).single());
          if (error || !data || data.id !== group.id || data.stable_id !== group.stableId
            || data.created_by_user_id !== user.id || data.type !== 'custom') throw error ?? new Error('Gruppen kunde inte verifieras.');
          // Same request after a lost acknowledgement; only the draft name may change.
          if (data.name !== group.name) {
            ({ data, error } = await supabase.from('groups').update({ name: group.name }).eq('id', group.id)
              .eq('stable_id', group.stableId).eq('created_by_user_id', user.id)
              .select('*').abortSignal(controller.signal).single());
          }
        }
        if (error || !data || data.id !== group.id || data.stable_id !== group.stableId
          || data.created_by_user_id !== user.id || data.name !== group.name || data.type !== 'custom') {
          throw error ?? new Error('Servern bekräftade inte gruppen.');
        }
        return { success: true, data: { ...group, name: data.name, createdAt: data.created_at ?? group.createdAt } };
      } catch (error) {
        console.warn('[group create] Kunde inte spara grupp', error);
        return { success: false, reason: 'Gruppen kunde inte sparas. Namnet finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistGroupUpdate = React.useCallback(
    async (groupId: string, updates: Partial<Group>, stableId: string): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('groups').update({ name: updates.name }).eq('id', groupId)
          .eq('stable_id', stableId).select('*').abortSignal(controller.signal).single();
        if (error || data?.id !== groupId || data?.stable_id !== stableId || data?.name !== updates.name) {
          throw error ?? new Error('Servern bekräftade inte gruppnamnet.');
        }
        return { success: true };
      } catch (error) {
        console.warn('[group rename] Kunde inte uppdatera grupp', error);
        return { success: false, reason: 'Gruppnamnet kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistGroupDelete = React.useCallback(
    async (groupId: string, stableId: string): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('groups').delete().eq('id', groupId)
          .eq('stable_id', stableId).select('id,stable_id').abortSignal(controller.signal);
        if (error || !data?.some((row) => row.id === groupId && row.stable_id === stableId)) {
          throw error ?? new Error('Servern bekräftade inte borttagningen.');
        }
        return { success: true };
      } catch (error) {
        console.warn('[group delete] Kunde inte ta bort grupp', error);
        return { success: false, reason: 'Gruppen kunde inte tas bort. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const postUploadCacheRef = React.useRef(new Map<string, { source: string; path: string }>());
  const persistPostInsert = React.useCallback(
    async (post: Post, rawImage?: string): Promise<ActionResult<Post>> => {
      if (isQaDemoMode) return { success: true, data: post };
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      try {
        if (!user || !post.stableId) throw new Error('Session eller stall saknas.');
        const authorId = user.id;
        const persist = async (): Promise<Post> => {
          let imagePath: string | null = null;
          if (rawImage) {
            const cached = postUploadCacheRef.current.get(post.id);
            if (cached?.source === rawImage) {
              imagePath = cached.path;
            } else {
              const uploadable = getUploadableImage(rawImage);
              if (!uploadable) throw new Error('Bilden kunde inte läsas. Välj bilden igen.');
              if (!hasUriScheme(uploadable.uri)) {
                imagePath = normalizePostImagePath(uploadable.uri) || null;
              } else if (/^https?:\/\//i.test(uploadable.uri)) {
                throw new Error('Välj en bild från enheten.');
              } else {
                imagePath = await uploadPostImage({
                  stableId: post.stableId!, userId: authorId, postId: post.id, image: uploadable,
                });
              }
              if (!imagePath) throw new Error('Bilden kunde inte laddas upp.');
              if (controller.signal.aborted) throw new Error('Publiceringen tog för lång tid.');
              postUploadCacheRef.current.set(post.id, { source: rawImage, path: imagePath });
            }
          }
          if (controller.signal.aborted) throw new Error('Publiceringen tog för lång tid.');
          const payload = {
            id: post.id, stable_id: post.stableId, user_id: authorId, content: post.content ?? null,
            group_ids: post.groupIds ?? [], media_type: imagePath ? 'image' : 'text', image_url: imagePath,
          };
          const result = await supabase.from('posts').insert(payload).select('*').abortSignal(controller.signal).single();
          let data = result.data;
          if (result.error?.code === '23505') {
            const recovered = await supabase.from('posts').select('*').eq('id', post.id)
              .eq('stable_id', post.stableId).eq('user_id', authorId).abortSignal(controller.signal).single();
            if (recovered.error) throw recovered.error;
            data = recovered.data;
            if (!data || data.id !== post.id || data.stable_id !== post.stableId || data.user_id !== authorId) {
              throw new Error('Det tidigare inlägget kunde inte bekräftas.');
            }
            const changes = { content: payload.content, group_ids: payload.group_ids, media_type: payload.media_type, image_url: payload.image_url };
            if (Object.entries(changes).some(([key, value]) => JSON.stringify(data[key] ?? null) !== JSON.stringify(value))) {
              const updated = await supabase.from('posts').update(changes).eq('id', post.id)
                .eq('stable_id', post.stableId).eq('user_id', authorId).select('*').abortSignal(controller.signal).single();
              if (updated.error) throw updated.error;
              data = updated.data;
            }
          } else if (result.error) throw result.error;
          if (!data || !Object.entries(payload).every(([key, value]) => JSON.stringify(data[key] ?? null) === JSON.stringify(value))) {
            throw new Error('Servern bekräftade inte inlägget med samma uppgifter.');
          }
          return { ...post, createdAt: data.created_at, content: data.content,
            groupIds: data.group_ids, imagePath: data.image_url ?? undefined,
            image: rawImage && hasUriScheme(rawImage) ? rawImage : undefined };
        };
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error('Publiceringen tog för lång tid.')); }, 15_000);
        });
        return { success: true, data: await Promise.race([persist(), deadline]) };
      } catch (error) {
        console.warn('[post publish] Kunde inte publicera inlägg', error);
        return { success: false, reason: 'Inlägget kunde inte publiceras. Text och bild finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout!); }
    },
    [user],
  );

  const persistPostLikeToggle = React.useCallback(
    async (postId: string, userId: string, enabled: boolean): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || user.id !== userId) throw new Error('Session saknas. Logga in igen.');
        if (enabled) {
          let { data, error } = await supabase.from('likes').insert({ user_id: userId, post_id: postId })
            .select('post_id,user_id').abortSignal(controller.signal).single();
          if (error?.code === '23505') {
            ({ data, error } = await supabase.from('likes').select('post_id,user_id')
              .eq('post_id', postId).eq('user_id', userId).abortSignal(controller.signal).single());
          }
          if (error || data?.post_id !== postId || data?.user_id !== userId) throw error ?? new Error('Servern bekräftade inte gillningen.');
        } else {
          const { data, error } = await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId)
            .select('post_id,user_id').abortSignal(controller.signal);
          if (error) throw error;
          if (!data?.some(row => row.post_id === postId && row.user_id === userId)) {
            const remaining = await supabase.from('likes').select('post_id,user_id')
              .eq('post_id', postId).eq('user_id', userId).abortSignal(controller.signal).maybeSingle();
            if (remaining.error || remaining.data) throw remaining.error ?? new Error('Gillningen finns kvar.');
            const visiblePost = await supabase.from('posts').select('id').eq('id', postId).abortSignal(controller.signal).single();
            if (visiblePost.error || visiblePost.data?.id !== postId) throw visiblePost.error ?? new Error('Inlägget kunde inte bekräftas.');
          }
        }
        return { success: true };
      } catch (error) {
        console.warn('[post like] Kunde inte spara gillning', error);
        return { success: false, reason: 'Gillningen kunde inte sparas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistPostCommentInsert = React.useCallback(
    async (comment: PostComment): Promise<ActionResult<PostComment>> => {
      if (isQaDemoMode) return { success: true, data: comment };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || user.id !== comment.authorId) throw new Error('Session saknas. Logga in igen.');
        const payload = { id: comment.id, user_id: comment.authorId, post_id: comment.postId, content: comment.text };
        let { data, error } = await supabase.from('comments').insert(payload).select('*').abortSignal(controller.signal).single();
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('comments').select('*').eq('id', comment.id)
            .eq('post_id', comment.postId).eq('user_id', comment.authorId).abortSignal(controller.signal).single());
          if (error || data?.id !== comment.id || data?.post_id !== comment.postId || data?.user_id !== comment.authorId) {
            throw error ?? new Error('Den tidigare kommentaren kunde inte bekräftas.');
          }
          if (data.content !== comment.text) {
            ({ data, error } = await supabase.from('comments').update({ content: comment.text }).eq('id', comment.id)
              .eq('post_id', comment.postId).eq('user_id', comment.authorId).select('*').abortSignal(controller.signal).single());
          }
        }
        if (error || !data || Object.entries(payload).some(([key, value]) => data[key] !== value) || !data.created_at) {
          throw error ?? new Error('Servern bekräftade inte kommentaren.');
        }
        return { success: true, data: { ...comment, text: data.content, createdAt: data.created_at } };
      } catch (error) {
        console.warn('[post comment] Kunde inte spara kommentar', error);
        return { success: false, reason: 'Kommentaren kunde inte sparas. Texten finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistPostDelete = React.useCallback(
    async (postId: string) => {
      if (!user) return { error: null };
      // .select('id') returns the deleted rows so we can detect an RLS-blocked delete
      // (0 rows, no error) and surface it as a failure instead of silently diverging.
      const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
      if (error) {
        reportPersistErrorRef.current('Kunde inte ta bort inlägg', error);
        return { error };
      }
      if (!data || data.length === 0) {
        const blocked = new Error('Inlägget kunde inte tas bort (behörighet saknas).');
        reportPersistErrorRef.current('Kunde inte ta bort inlägg', blocked);
        return { error: blocked };
      }
      return { error: null };
    },
    [user],
  );

  const persistFarmUpsert = React.useCallback(
    async (farm: Farm, input: UpsertFarmInput, existing: boolean): Promise<ActionResult<Farm>> => {
      if (isQaDemoMode) return { success: true, data: farm };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas. Logga in igen.');
        const columns = { name: 'name', location: 'location', hasIndoorArena: 'has_indoor_arena', arenaNote: 'arena_note' } as const;
        const updates: Record<string, unknown> = {};
        for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
          if (Object.prototype.hasOwnProperty.call(input, key)) updates[columns[key]] = farm[key] ?? null;
        }
        const payload = existing ? updates : {
          id: farm.id, created_by: user.id, name: farm.name, location: farm.location ?? null,
          has_indoor_arena: farm.hasIndoorArena ?? false, arena_note: farm.arenaNote ?? null,
        };
        const query = existing
          ? supabase.from('farms').update(payload).eq('id', farm.id).eq('created_by', user.id)
          : supabase.from('farms').insert(payload);
        let { data, error } = await query.select('*').abortSignal(controller.signal).single();
        let expected = payload;
        if (!existing && error?.code === '23505') {
          ({ data, error } = await supabase.from('farms').select('*').eq('id', farm.id).abortSignal(controller.signal).single());
          if (error) throw error;
          if (data?.id !== farm.id || data.created_by !== user.id) throw new Error('Gården tillhör en annan användare.');
          expected = updates;
          if (Object.entries(updates).some(([key, value]) => (data[key] ?? null) !== value)) {
            ({ data, error } = await supabase.from('farms').update(updates).eq('id', farm.id).eq('created_by', user.id)
              .select('*').abortSignal(controller.signal).single());
          }
        }
        if (error) throw error;
        if (data?.id !== farm.id || data.created_by !== user.id
          || Object.entries(expected).some(([key, value]) => (data[key] ?? null) !== value)) {
          throw new Error('Servern bekräftade inte gården.');
        }
        return { success: true, data: {
          id: data.id, name: data.name, location: data.location ?? undefined,
          hasIndoorArena: data.has_indoor_arena ?? false, arenaNote: data.arena_note ?? undefined,
        } };
      } catch (error) {
        console.warn('[farm save] Kunde inte spara gård', error);
        return { success: false, reason: 'Gården kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistFarmDelete = React.useCallback(
    async (farmId: string) => {
      if (!user) return;
      const result = await supabase.from('farms').delete().eq('id', farmId);
      if (result.error) {
        reportPersistErrorRef.current('Kunde inte ta bort gård', result.error);
      }
    },
    [user],
  );

  const persistStableUpsert = React.useCallback(
    async (stable: Stable, isNew: boolean, ownerId: string, input?: UpsertStableInput): Promise<ActionResult<Stable>> => {
      if (isQaDemoMode) return { success: true, data: stable };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || user.id !== ownerId) throw new Error('Session saknas. Logga in igen.');
        const serialize = (value: unknown) => JSON.stringify(value, (_key, entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
        const payload: Record<string, unknown> = {
          id: stable.id, name: stable.name, description: stable.description ?? null,
          location: stable.location ?? null, farm_id: stable.farmId ?? null,
          settings: stable.settings ?? null, ride_types: stable.rideTypes ?? [],
          ...(isNew ? { created_by: ownerId } : {}),
        };
        const query = isNew ? supabase.from('stables').insert(payload)
          : supabase.from('stables').update(payload).eq('id', stable.id);
        let { data, error } = await query.select('*').abortSignal(controller.signal).single();
        let expected = payload;
        if (isNew && error?.code === '23505') {
          ({ data, error } = await supabase.from('stables').select('*').eq('id', stable.id)
            .abortSignal(controller.signal).single());
          if (error) throw error;
          if (data?.id !== stable.id || data.created_by !== ownerId) throw new Error('Stallet tillhör en annan användare.');
          // A retained draft may be corrected after the original INSERT was committed.
          // Preserve fields the draft never supplied, including remotely updated settings.
          const requested = input ?? { name: stable.name };
          const correction: Record<string, unknown> = { name: stable.name };
          const columns = { description: 'description', location: 'location', farmId: 'farm_id', rideTypes: 'ride_types' } as const;
          for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
            if (Object.prototype.hasOwnProperty.call(requested, key)) correction[columns[key]] = payload[columns[key]];
          }
          if (requested.settings) {
            const previous = resolveStableSettings({ ...stable, settings: data.settings ?? undefined });
            correction.settings = {
              dayLogic: requested.settings.dayLogic ?? previous.dayLogic,
              eventVisibility: { ...previous.eventVisibility, ...requested.settings.eventVisibility },
              arena: { ...previous.arena, ...requested.settings.arena },
              onboarding: { ...previous.onboarding, ...requested.settings.onboarding },
            };
          }
          expected = { id: stable.id, created_by: ownerId, ...correction };
          if (Object.entries(correction).some(([key, value]) => serialize(data[key]) !== serialize(value))) {
            ({ data, error } = await supabase.from('stables').update(correction).eq('id', stable.id).eq('created_by', ownerId)
              .select('*').abortSignal(controller.signal).single());
          }
        }
        if (error) throw error;
        if (!data || Object.entries(expected).some(([key, value]) => serialize(data[key]) !== serialize(value))) {
          throw new Error('Servern bekräftade inte samma stall.');
        }
        if (isNew) {
          const member = { stable_id: stable.id, user_id: ownerId, role: 'admin', access: 'owner', rider_role: 'owner' };
          let memberResult = await supabase.from('stable_members').insert(member).select('*')
            .abortSignal(controller.signal).single();
          if (memberResult.error?.code === '23505') {
            memberResult = await supabase.from('stable_members').select('*').eq('stable_id', stable.id).eq('user_id', ownerId)
              .abortSignal(controller.signal).single();
          }
          if (memberResult.error) throw memberResult.error;
          if (!memberResult.data || Object.entries(member).some(([key, value]) => memberResult.data[key] !== value)) {
            throw new Error('Servern bekräftade inte ägarbehörigheten.');
          }
          const conversation = { id: stable.id, stable_id: stable.id, title: stable.name, is_group: true, created_by_user_id: ownerId };
          let chatResult = await supabase.from('conversations').insert(conversation).select('*')
            .abortSignal(controller.signal).single();
          if (chatResult.error?.code === '23505') {
            chatResult = await supabase.from('conversations').select('*').eq('stable_id', stable.id).eq('is_group', true)
              .abortSignal(controller.signal).single();
          }
          if (chatResult.error) throw chatResult.error;
          if (!chatResult.data?.id || chatResult.data.stable_id !== stable.id || chatResult.data.is_group !== true
            || chatResult.data.created_by_user_id !== ownerId) throw new Error('Servern bekräftade inte stallchatten.');
        }
        return { success: true, data: {
          id: data.id, name: data.name, description: data.description ?? undefined,
          location: data.location ?? undefined, farmId: data.farm_id ?? undefined,
          settings: data.settings ?? undefined, rideTypes: data.ride_types ?? [],
        } };
      } catch (error) {
        console.warn('[stable create] Kunde inte spara stall och ägarbehörighet', error);
        return { success: false, reason: 'Stallet kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistStableUpdate = React.useCallback(
    async (stableId: string, updates: Partial<Stable>, existing: Stable): Promise<ActionResult<Stable>> => {
      if (isQaDemoMode) return { success: true, data: { ...existing, ...updates } };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data: before, error: readError } = await supabase.from('stables').select('*')
          .eq('id', stableId).abortSignal(controller.signal).single();
        if (readError || !before) throw readError ?? new Error('Stallet kunde inte hämtas.');
        const serialize = (value: unknown) => JSON.stringify(value, (_key, entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
        const columns = { name: 'name', description: 'description', location: 'location', farmId: 'farm_id', settings: 'settings', rideTypes: 'ride_types' } as const;
        const payload: Record<string, unknown> = {};
        for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
          if (!hasOwnProperty(updates, key)) continue;
          const column = columns[key];
          const desired = updates[key] ?? (key === 'rideTypes' ? [] : null);
          const previous = key === 'settings' ? resolveStableSettings(existing) : existing[key] ?? (key === 'rideTypes' ? [] : null);
          const currentValue = key === 'settings' ? resolveStableSettings({ ...existing, settings: before.settings })
            : before[column] ?? (key === 'rideTypes' ? [] : null);
          if (serialize(currentValue) !== serialize(previous) && serialize(currentValue) !== serialize(desired)) {
            return { success: false, reason: 'Stallet har ändrats på en annan telefon. Uppdatera stalldata och försök igen. Ditt utkast finns kvar.' };
          }
          payload[column] = desired;
        }
        if (!Object.keys(payload).length) return { success: true, data: existing };
        let query = supabase.from('stables').update(payload).eq('id', stableId);
        // Compare the raw database values so a second writer cannot change them
        // between the read above and this update (including JSON settings).
        for (const column of Object.keys(payload)) {
          const value = before[column];
          query = value == null ? query.is(column, null)
            : query.eq(column, typeof value === 'object' ? JSON.stringify(value) : value);
        }
        const { data, error } = await query.select('*').abortSignal(controller.signal).single();
        if (error || data?.id !== stableId) throw error ?? new Error('Stallet ändrades innan sparningen bekräftades.');
        if (hasOwnProperty(updates, 'name')) {
          const { error: conversationError } = await supabase.from('conversations').update({ title: data.name })
            .eq('stable_id', stableId).eq('is_group', true).abortSignal(controller.signal);
          if (conversationError) console.warn('[stable settings] Kunde inte uppdatera chattnamnet', conversationError);
        }
        return { success: true, data: { ...existing, name: data.name, description: data.description ?? undefined,
          location: data.location ?? undefined, farmId: data.farm_id ?? undefined,
          rideTypes: data.ride_types ?? [], settings: resolveStableSettings({ ...existing, settings: data.settings }) } };
      } catch (error) {
        console.warn('[stable settings] Kunde inte spara stallinställningar', error);
        return { success: false, reason: 'Stalluppgifterna kunde inte sparas. Ditt utkast finns kvar. Uppdatera stalldata och försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistStableDelete = React.useCallback(
    async (stableId: string) => {
      if (!user) return;
      const result = await supabase.from('stables').delete().eq('id', stableId);
      if (result.error) {
        reportPersistErrorRef.current('Kunde inte ta bort stall', result.error);
      }
    },
    [user],
  );

  const persistStableInvite = React.useCallback(
    async (input: AddMemberInput, stableIds: string[]): Promise<ActionResult<InviteConfirmation>> => {
      const key = JSON.stringify([user?.id, input, stableIds]);
      let draft = pendingInviteDrafts.current.get(key);
      if (!draft) {
        const code = generateInviteCode();
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        draft = { code, rows: stableIds.map((stableId) => ({
          id: generateId(), stable_id: stableId, email: input.email.trim().toLowerCase(),
          role: input.role, custom_role: input.customRole?.trim() || null, access: input.access ?? 'view',
          rider_role: input.role === 'rider' ? input.riderRole ?? 'medryttare' : null,
          horse_ids: (input.horseIds ?? []).filter((id) => {
            const horse = stateRef.current.horses.find((entry) => entry.id === id);
            return horse ? horse.stableId === stableId : stableId === input.stableId;
          }),
          code: stableId === input.stableId ? code : generateInviteCode(), expires_at: expiresAt,
        })) };
        pendingInviteDrafts.current.set(key, draft);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!isQaDemoMode) {
          if (!user) throw new Error('Session saknas.');
          let { data, error } = await supabase.from('stable_invites').insert(draft.rows)
            .select('*').abortSignal(controller.signal);
          if (error?.code === '23505') {
            ({ data, error } = await supabase.from('stable_invites').select('*')
              .in('id', draft.rows.map((row) => String(row.id))).abortSignal(controller.signal));
          }
          if (error || data?.length !== draft.rows.length || draft.rows.some((expected) => {
            const row = data?.find((item) => item.id === expected.id);
            return !row || row.accepted_at || Object.entries(expected).some(([field, value]) =>
              field !== 'expires_at' && JSON.stringify(row[field]) !== JSON.stringify(value));
          })) throw error ?? new Error('Servern bekräftade inte alla inbjudningar.');
        }
        pendingInviteDrafts.current.delete(key);
        return { success: true, data: { inviteCode: draft.code,
          codes: draft.rows.map((row) => ({ stableId: String(row.stable_id), code: String(row.code) })) } };
      } catch (error) {
        console.warn('[invite create] Kunde inte skapa inbjudan', error);
        return { success: false, reason: 'Inbjudan kunde inte skapas. Uppgifterna finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistStableMemberUpdate = React.useCallback(
    async (stableId: string, userId: string, updates: Partial<StableMembership>): Promise<ActionResult<StableMembership>> => {
      if (isQaDemoMode) {
        const existing = stateRef.current.users[userId]?.membership.find((entry) => entry.stableId === stableId);
        return existing ? { success: true, data: { ...existing, ...updates } }
          : { success: false, reason: 'Medlemmen är inte kopplad till stallet.' };
      }
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
        return { success: false, reason: 'Ingen medlemsändring att spara.' };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('stable_members').update(payload)
          .eq('stable_id', stableId).eq('user_id', userId)
          .select('*').abortSignal(controller.signal).single();
        if (error || data?.stable_id !== stableId || data?.user_id !== userId) {
          throw error ?? new Error('Servern bekräftade inte medlemsändringen.');
        }
        return { success: true, data: {
          stableId: data.stable_id, role: data.role, access: data.access ?? undefined,
          customRole: data.custom_role ?? undefined, horseIds: data.horse_ids ?? [],
          riderRole: data.rider_role ?? undefined,
        } };
      } catch (error) {
        console.warn('[member update] Kunde inte uppdatera medlem', error);
        return { success: false, reason: 'Medlemsändringen kunde inte sparas. Uppdatera eller försök igen.' };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistStableMemberDelete = React.useCallback(
    async (stableId: string, userId: string): Promise<ActionResult> => {
      if (isQaDemoMode) return { success: true };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const { data, error } = await supabase.from('stable_members').delete()
          .eq('stable_id', stableId).eq('user_id', userId)
          .select('stable_id,user_id').abortSignal(controller.signal);
        if (error || !data?.some((row) => row.stable_id === stableId && row.user_id === userId)) {
          throw error ?? new Error('Servern bekräftade inte borttagningen.');
        }
        return { success: true };
      } catch (error) {
        console.warn('[member delete] Kunde inte ta bort medlem', error);
        return { success: false, reason: 'Medlemmen kunde inte tas bort. Uppdatera eller försök igen.' };
      } finally {
        clearTimeout(timeout);
      }
    },
    [user],
  );

  const persistProfileUpdate = React.useCallback(
    async (userId: string, updates: Record<string, unknown>): Promise<ActionResult<Record<string, unknown>>> => {
      if (isQaDemoMode) return { success: true, data: { id: userId, ...updates } };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user || user.id !== userId) throw new Error('Session saknas. Logga in igen.');
        const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId)
          .select('*').abortSignal(controller.signal).single();
        if (error) {
          if (error.code === 'PGRST204' && error.message?.includes('onboarding_dismissed') && Object.keys(updates).length === 1) {
            return { success: false, reason: 'Introduktionsstatus kunde inte sparas.' };
          }
          throw error;
        }
        if (!data || data.id !== userId || !Object.entries(updates).every(([key, value]) => (data[key] ?? null) === value)) {
          throw new Error('Servern bekräftade inte profiluppgifterna.');
        }
        return { success: true, data };
      } catch (error) {
        console.warn('[profile save] Kunde inte uppdatera profil', error);
        return { success: false, reason: 'Profilen kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const persistConversationMessage = React.useCallback(
    async (message: ConversationMessage): Promise<ActionResult<ConversationMessage>> => {
      if (isQaDemoMode) return { success: true, data: message };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        if (!user) throw new Error('Session saknas.');
        const payload = {
          id: message.id, conversation_id: message.conversationId,
          author_id: message.authorId, text: message.text, status: 'sent',
        };
        let { data, error } = await supabase.from('messages').insert(payload)
          .select('*').abortSignal(controller.signal).single();
        // A lost acknowledgement may leave the message saved. Retry the same ID safely.
        if (error?.code === '23505') {
          ({ data, error } = await supabase.from('messages').select('*')
            .eq('id', message.id).eq('conversation_id', message.conversationId)
            .eq('author_id', message.authorId).abortSignal(controller.signal).single());
        }
        if (error || data?.id !== message.id || data.conversation_id !== message.conversationId
          || data.author_id !== message.authorId || data.text !== message.text) {
          throw error ?? new Error('Servern bekräftade inte meddelandet.');
        }
        return { success: true, data: { ...message, timestamp: data.created_at ?? message.timestamp } };
      } catch (error) {
        console.warn('[chat send] Kunde inte skicka meddelande', error);
        return { success: false, reason: 'Meddelandet kunde inte skickas. Försök igen.' };
      } finally { clearTimeout(timeout); }
    },
    [user],
  );

  const loadAppData = React.useCallback(
    async (options: RefreshOptions = {}): Promise<ActionResult> => {
      if (pendingDataWrites.current.size) {
        const reason = 'En ändring sparas. Vänta ett ögonblick och uppdatera igen.';
        setRefreshError(reason);
        if (options.reason === 'init') setHydrating(false);
        return { success: false, reason };
      }
      const writeVersion = dataWriteVersion.current;
      const requestId = ++refreshRequestId.current;
      const reason = options.reason ?? 'manual';
      const isInit = reason === 'init';

      if (isInit) {
        setHydrating(true);
      } else {
        setRefreshing(true);
      }

      const fail = (message: string): ActionResult => {
        if (requestId === refreshRequestId.current) {
          setRefreshError(message);
        }
        return { success: false, reason: message };
      };

      try {
        if (isQaDemoMode) {
          if (requestId === refreshRequestId.current) {
            dispatch({ type: 'STATE_HYDRATE', payload: createQaDemoState() });
            setLastRefreshedAt(new Date().toISOString());
            setRefreshError(null);
          }
          return { success: true };
        }

        const sessionResult = await supabase.auth.getSession();
        const sessionUser = sessionResult.data.session?.user ?? null;
        const authUser = sessionUser ?? user;
        if (!authUser) {
          if (requestId === refreshRequestId.current) {
            dispatch({ type: 'STATE_RESET' });
          }
          return fail('Ingen aktiv session.');
        }
        const sessionUserId = sessionUser?.id ?? authUser.id;

        const pendingOwnerStable = await loadPendingOwnerStable();
        const authEmail = (authUser.email ?? '').trim().toLowerCase();
        // Only claim a pending stable that was requested by THIS account. Guards
        // against an abandoned signup being claimed by a different user on the
        // same device. A mismatch is left in storage for the right user to claim.
        if (pendingOwnerStable && pendingOwnerStable.email === authEmail) {
          const stablePayload = {
            id: pendingOwnerStable.id,
            name: pendingOwnerStable.name,
            created_by: authUser.id,
          };
          const stableInsert = await supabase.from('stables').insert(stablePayload);
          if (stableInsert.error && stableInsert.error.code !== '23505') {
            console.warn('Kunde inte skapa stall', stableInsert.error);
          }

          const memberInsert = await supabase.from('stable_members').insert({
            stable_id: pendingOwnerStable.id,
            user_id: authUser.id,
            role: 'admin',
            access: 'owner',
            rider_role: 'owner',
          });
          if (memberInsert.error && memberInsert.error.code !== '23505') {
            console.warn('Kunde inte koppla dig till stallet', memberInsert.error);
          }

          const stableOk = !stableInsert.error || stableInsert.error.code === '23505';
          const memberOk = !memberInsert.error || memberInsert.error.code === '23505';
          if (stableOk && memberOk) {
            await clearPendingOwnerStable();
          } else if (!pendingOwnerStableErrorShown.current) {
            showToast('Kunde inte skapa stallet automatiskt. Försök igen eller kontakta support.', 'error');
            pendingOwnerStableErrorShown.current = true;
          }
        }

        const pendingJoinCode = await loadPendingJoinCode();
        if (pendingJoinCode) {
          const joinResult = await supabase.rpc('accept_join_code', { p_code: pendingJoinCode });
          if (joinResult.error) {
            console.warn('Kunde inte använda inbjudningskod', joinResult.error);
            if (
              typeof joinResult.error.message === 'string' &&
              joinResult.error.message.includes('Invalid join code')
            ) {
              await clearPendingJoinCode();
            }
          } else {
            await clearPendingJoinCode();
          }
        }

        const inviteResult = await supabase.rpc('accept_pending_invites');
        if (inviteResult.error) {
          console.warn('Kunde inte hämta inbjudan', inviteResult.error);
        }

        const membershipResult = await supabase
          .from('stable_members')
          .select('*')
          .eq('user_id', authUser.id);
        if (membershipResult.error || !membershipResult.data) {
          console.warn('Kunde inte hämta medlemskap', membershipResult.error);
          return fail('Kunde inte hämta medlemskap.');
        }
        const myMembership = membershipResult.data;
        const stableIds = myMembership.map((row) => row.stable_id);
        if (stableIds.length === 0) {
          const profilesResult = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
          const profile = profilesResult.data;
          if (profilesResult.error || !profile) {
            console.warn('[stable refresh] Kunde inte hämta profilen', profilesResult.error);
            return fail('Kunde inte hämta profilen. Försök igen.');
          }
          const draftDefaultPasses = await loadDefaultPassDraft(authUser.id);
          const userProfile: UserProfile = {
            id: authUser.id,
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
          if (requestId === refreshRequestId.current) {
            dispatch({
              type: 'STATE_HYDRATE',
              payload: {
                users: { [authUser.id]: userProfile },
                stables: [],
                farms: [],
                horses: [],
                paddocks: [],
                assignments: [],
                assignmentHistory: [],
                dayEvents: [],
                arenaBookings: [],
                arenaStatuses: [],
                rideLogs: [],
                horseDayStatuses: [],
                feedPlans: [],
                feedChecks: [],
                plannedRides: [],
                externalContacts: [],
                careEvents: [],
                alerts: [],
                stableAlerts: [],
                ridingSchedule: [],
                competitionEvents: [],
                posts: [],
                postsCursor: null,
                postsHasMore: false,
                postsLoadingMore: false,
                postsLoadError: null,
                messages: [],
                conversations: {},
                groups: [],
                currentStableId: '',
                currentUserId: authUser.id,
                sessionUserId,
              },
            });
          }
          if (requestId === refreshRequestId.current) {
            setLastRefreshedAt(new Date().toISOString());
            setRefreshError(null);
          }
          return { success: true };
        }
        const previousStableId = stateRef.current.currentStableId;
        const requestedStableId = options.stableId;
        const selectedStableId =
          requestedStableId && stableIds.includes(requestedStableId)
            ? requestedStableId
            : stableIds.includes(previousStableId)
              ? previousStableId
              : stableIds[0] ?? '';
        const allMembershipResult = await supabase
          .from('stable_members')
          .select('*')
          .in('stable_id', stableIds);
        if (allMembershipResult.error) {
          console.warn('[stable refresh] Kunde inte hämta stallmedlemmar', allMembershipResult.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }
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
          stableAlertsResult,
          ridingDaysResult,
          competitionEventsResult,
          groupsResult,
          defaultPassesResult,
          awayNoticesResult,
          conversationsResult,
          feedPlansResult,
          feedChecksResult,
          plannedRidesResult,
          externalContactsResult,
          careEventsResult,
          blockedUsersResult,
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
          supabase.from('stable_alerts').select('*').in('stable_id', stableIds),
          supabase.from('riding_days').select('*').in('stable_id', stableIds),
          supabase.from('competition_events').select('*').in('stable_id', stableIds),
          supabase.from('groups').select('*').in('stable_id', stableIds),
          supabase.from('default_passes').select('*').in('stable_id', stableIds),
          supabase.from('away_notices').select('*').in('stable_id', stableIds),
          supabase.from('conversations').select('*'),
          supabase.from('feed_plans').select('*').in('stable_id', stableIds),
          supabase.from('feed_checks').select('*').in('stable_id', stableIds),
          supabase.from('planned_rides').select('*').in('stable_id', stableIds),
          supabase.from('external_contacts').select('*').in('stable_id', stableIds),
          supabase.from('care_events').select('*').in('stable_id', stableIds),
          supabase.from('blocked_users').select('blocked_user_id').eq('blocker_user_id', authUser.id),
        ]);

        const failedRead = [
          stablesResult, farmsResult, horsesResult, paddocksResult, assignmentsResult,
          assignmentHistoryResult, dayEventsResult, arenaBookingsResult, arenaStatusesResult,
          rideLogsResult, horseDayStatusesResult, alertsResult, stableAlertsResult, ridingDaysResult,
          competitionEventsResult, groupsResult, defaultPassesResult, awayNoticesResult,
          conversationsResult, feedPlansResult, feedChecksResult, plannedRidesResult,
          externalContactsResult, careEventsResult, blockedUsersResult,
        ].find((result) => result.error);
        if (failedRead?.error) {
          console.warn('[stable refresh] Kunde inte hämta stalldata', failedRead.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }

        const blockedUserIds = (blockedUsersResult.data ?? [])
          .map((row) => row.blocked_user_id as string)
          .filter(Boolean);

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
        const stableAlertRows = stableAlertsResult.data ?? [];
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
            created_by_user_id: authUser.id,
          }));
          const insertResult = await supabase.from('conversations').insert(inserts).select('*');
          if (insertResult.error && insertResult.error.code !== '23505') {
            console.warn('Kunde inte skapa gruppkonversation', insertResult.error);
          } else if (insertResult.data) {
            conversationRows = [...conversationRows, ...insertResult.data];
          }
        }

        // Load conversation members for private chats
        const privateConversationIds = conversationRows
          .filter((row) => !row.is_group)
          .map((row) => row.id);
        const conversationMembersResult = privateConversationIds.length
          ? await supabase
              .from('conversation_members')
              .select('*')
              .in('conversation_id', privateConversationIds)
          : { data: [] as { conversation_id: string; user_id: string }[] };
        if ('error' in conversationMembersResult && conversationMembersResult.error) {
          console.warn('[stable refresh] Kunde inte hämta chattmedlemmar', conversationMembersResult.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }
        const conversationMemberRows = conversationMembersResult.data ?? [];
        const membersByConversation = conversationMemberRows.reduce<Record<string, string[]>>(
          (acc, row) => {
            const list = acc[row.conversation_id] ?? [];
            list.push(row.user_id);
            acc[row.conversation_id] = list;
            return acc;
          },
          {},
        );

        // PII-safe: co-member name/avatar/location come from get_member_directory()
        // (phone masked for non-admins). The base profiles table is self-only RLS, so a
        // direct `.from('profiles').select('*')` would only ever return our own row.
        const profilesResult = await supabase.rpc('get_member_directory');
        if (profilesResult.error) {
          console.warn('[stable refresh] Kunde inte hämta medlemmar', profilesResult.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }

        type DirectoryRow = {
          id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          location: string | null;
          responsibilities: string[] | null;
          onboarding_dismissed: boolean | null;
          phone: string | null;
        };
        const profiles = (profilesResult.data ?? []) as DirectoryRow[];
        const profilesById = profiles.reduce<Record<string, DirectoryRow>>(
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

        if (!userMap[authUser.id]) {
          const profile = profilesById[authUser.id];
          if (profile) {
            userMap[authUser.id] = {
              id: authUser.id,
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
          // UserProfile defaults describe the selected stable, just like the profile UI.
          if (entry.stable_id !== selectedStableId) return;
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

        const postsResult = selectedStableId
          ? await supabase
              .from('posts')
              .select('*')
              .eq('stable_id', selectedStableId)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(POSTS_PAGE_SIZE)
          : { data: [] as any[] };
        if ('error' in postsResult && postsResult.error) {
          console.warn('[stable refresh] Kunde inte hämta inlägg', postsResult.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }
        const postRows = postsResult.data ?? [];
        const postIds = postRows.map((post) => post.id);

        const [likesResult, commentsResult] = await Promise.all([
          postIds.length ? supabase.from('likes').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
          postIds.length ? supabase.from('comments').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
        ]);

        const failedPostRead = [likesResult, commentsResult].find((result) => 'error' in result && result.error);
        if (failedPostRead && 'error' in failedPostRead) {
          console.warn('[stable refresh] Kunde inte hämta inläggsaktivitet', failedPostRead.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }
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

        const posts = await Promise.all(
          postRows.map(async (post) => {
            const authorProfile = profilesById[post.user_id];
            const likedByUserIds = likedByPost[post.id] ?? [];
            const commentsData = commentsByPost[post.id] ?? [];
            const rawImage = post.image_url ?? null;
            const normalizedPath = normalizePostImagePath(rawImage);
            if (!normalizedPath && rawImage && rawImage.trim()) {
              const lower = rawImage.trim().toLowerCase();
              if (
                lower.startsWith('http://') ||
                lower.startsWith('https://') ||
                lower.startsWith('data:')
              ) {
                warnLegacyPostImageUrl(post.id, rawImage);
              }
            }
            const imageSignedUrl = normalizedPath ? await getSignedPostImageUrl(normalizedPath) : undefined;
            return {
              id: post.id,
              authorId: post.user_id,
              author: authorProfile?.full_name || authorProfile?.username || 'Okänd',
              avatar: authorProfile?.avatar_url
                ? { uri: authorProfile.avatar_url }
                : require('@/assets/images/dummy-avatar.png'),
              timeAgo: 'Nu',
              createdAt: post.created_at,
              content: post.content ?? post.caption ?? '',
              imageSignedUrl,
              image: imageSignedUrl,
              imagePath: normalizedPath || undefined,
              likes: likedByUserIds.length,
              comments: commentsData.length,
              likedByUserIds,
              commentsData,
              stableId: post.stable_id ?? undefined,
              groupIds: post.group_ids ?? undefined,
            } as Post;
          }),
        );
        const postsCursor = resolvePostsCursor(postRows);
        const postsHasMore = postRows.length === POSTS_PAGE_SIZE;

        const conversationIds = conversationRows.map((row) => row.id);
        const messagesResult = conversationIds.length
          ? await supabase
              .from('messages')
              .select('*')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: true })
          : { data: [] as any[] };
        if ('error' in messagesResult && messagesResult.error) {
          console.warn('[stable refresh] Kunde inte hämta meddelanden', messagesResult.error);
          return fail('Kunde inte uppdatera stalldata. Försök igen.');
        }
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

            // For private chats, show the other participant's name
            let title = row.title ?? stable?.name ?? 'Konversation';
            let subtitle = stable?.location ?? (row.is_group ? 'Gruppchatt' : 'Privat chatt');
            let avatar: ImageSourcePropType | undefined;
            if (!row.is_group) {
              const members = membersByConversation[row.id] ?? [];
              const otherUserId = members.find((id) => id !== authUser.id);
              if (otherUserId) {
                const otherProfile = profilesById[otherUserId];
                if (otherProfile) {
                  title = otherProfile.full_name || otherProfile.username || 'Okänd';
                  subtitle = 'Privat chatt';
                  avatar = otherProfile.avatar_url
                    ? { uri: otherProfile.avatar_url }
                    : undefined;
                }
              }
            }

            const preview: MessagePreview = {
              id: row.id,
              title,
              subtitle,
              description: lastMessage?.text ?? 'Inga meddelanden ännu',
              timeAgo: sortTime ? formatTimeAgo(sortTime) : '',
              unreadCount: 0,
              group: row.is_group ?? false,
              stableId: row.stable_id ?? undefined,
              avatar,
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
          joinCode: row.join_code ?? undefined,
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

        const feedPlanRows = feedPlansResult.data ?? [];
        const feedCheckRows = feedChecksResult.data ?? [];
        const formattedFeedPlans: FeedPlanItem[] = feedPlanRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          horseId: row.horse_id ?? undefined,
          slot: row.slot,
          label: row.label,
          amount: row.amount ?? undefined,
          note: row.note ?? undefined,
          isStableDefault: row.is_stable_default ?? false,
          active: row.active ?? true,
        }));
        const formattedFeedChecks: FeedCheck[] = feedCheckRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          horseId: row.horse_id,
          date: row.date,
          slot: row.slot,
          checkedByUserId: row.checked_by_user_id ?? undefined,
          checkedAt: row.checked_at ?? undefined,
          deviationNote: row.deviation_note ?? undefined,
        }));

        const plannedRideRows = plannedRidesResult.data ?? [];
        const formattedPlannedRides: PlannedRide[] = plannedRideRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          horseId: row.horse_id,
          riderUserId: row.rider_user_id ?? undefined,
          date: row.date,
          time: row.time ?? undefined,
          rideTypeId: row.ride_type_id ?? undefined,
          note: row.note ?? undefined,
          status: row.status ?? 'planned',
          completedRideLogId: row.completed_ride_log_id ?? undefined,
          createdAt: row.created_at,
        }));

        const externalContactRows = externalContactsResult.data ?? [];
        const formattedExternalContacts: ExternalContact[] = externalContactRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          name: row.name,
          type: row.type,
          phone: row.phone ?? undefined,
          email: row.email ?? undefined,
          note: row.note ?? undefined,
          createdAt: row.created_at,
        }));

        const careEventRows = careEventsResult.data ?? [];
        const formattedCareEvents: CareEvent[] = careEventRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          horseIds: row.horse_ids ?? [],
          type: row.type,
          title: row.title,
          date: row.date,
          time: row.time ?? undefined,
          contactId: row.contact_id ?? undefined,
          responsibleUserId: row.responsible_user_id ?? undefined,
          status: row.status ?? 'planned',
          note: row.note ?? undefined,
          completedAt: row.completed_at ?? undefined,
          createdAt: row.created_at,
        }));

        const formattedAlerts: AlertMessage[] = alertRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          message: row.message,
          type: row.type,
          createdAt: row.created_at,
        }));

        const formattedStableAlerts: StableAlert[] = stableAlertRows.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          title: row.title,
          body: row.body ?? undefined,
          severity: row.severity ?? 'info',
          horseId: row.horse_id ?? undefined,
          paddockId: row.paddock_id ?? undefined,
          assignmentId: row.assignment_id ?? undefined,
          createdByUserId: row.created_by_user_id,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at ?? undefined,
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

        if (requestId !== refreshRequestId.current) {
          return { success: false, reason: 'Avbruten uppdatering.' };
        }
        if (writeVersion !== dataWriteVersion.current || pendingDataWrites.current.size) {
          return fail('En ändring sparas. Uppdatera igen om ett ögonblick.');
        }

        defaultPassesStableId.current = selectedStableId;
        autoAssignmentAttempts.current.clear();
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
            feedPlans: formattedFeedPlans,
            feedChecks: formattedFeedChecks,
            plannedRides: formattedPlannedRides,
            externalContacts: formattedExternalContacts,
            careEvents: formattedCareEvents,
            alerts: formattedAlerts,
            stableAlerts: formattedStableAlerts,
            ridingSchedule: formattedRidingDays,
            competitionEvents: formattedCompetitionEvents,
            posts,
            postsCursor,
            postsHasMore,
            postsLoadingMore: false,
            postsLoadError: null,
            messages: messagePreviews,
            conversations,
            groups: formattedGroups,
            users: userMap,
            currentStableId: selectedStableId,
            currentUserId: authUser.id,
            sessionUserId,
            blockedUserIds,
          },
        });
        setLastRefreshedAt(new Date().toISOString());
        setRefreshError(null);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ett okänt fel inträffade.';
        return fail(message);
      } finally {
        if (requestId === refreshRequestId.current) {
          setHydrating(false);
          setRefreshing(false);
        }
      }
    },
    [showToast, user],
  );

  const refreshData = React.useCallback(
    async (options: RefreshOptions = {}): Promise<ActionResult> => {
      const request = loadAppData({ ...options, reason: options.reason ?? 'manual' });
      const requestId = refreshRequestId.current;
      let timeout: ReturnType<typeof setTimeout>;
      const deadline = new Promise<ActionResult>((resolve) => {
        timeout = setTimeout(() => {
          const reason = 'Det tar för lång tid att hämta stalldata. Kontrollera anslutningen och försök igen.';
          if (requestId === refreshRequestId.current) {
            refreshRequestId.current += 1;
            setRefreshError(reason);
            setHydrating(false);
            setRefreshing(false);
          }
          resolve({ success: false, reason });
        }, 20_000);
      });
      try {
        return await Promise.race([request, deadline]);
      } finally {
        clearTimeout(timeout!);
      }
    },
    [loadAppData],
  );

  React.useEffect(() => {
    if (!user) {
      refreshRequestId.current += 1;
      dispatch({ type: 'STATE_RESET' });
      setHydrating(false);
      setRefreshing(false);
      setRefreshError(null);
      setLastRefreshedAt(null);
      return;
    }

    if (stateRef.current.sessionUserId && stateRef.current.sessionUserId !== user.id) {
      dispatch({ type: 'STATE_RESET' });
      defaultPassesStableId.current = '';
      autoAssignmentAttempts.current.clear();
    }
    void refreshData({ reason: 'init' });

    return () => {
      refreshRequestId.current += 1;
    };
  }, [refreshData, user]);

  React.useEffect(() => {
    if (!user || isQaDemoMode) return;
    const updateIfActive = () => {
      if (hydrating || refreshing || pendingDataWrites.current.size) return;
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (AppState.currentState && AppState.currentState !== 'active') return;
      void refreshData();
    };
    const interval = setInterval(updateIfActive, 60_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') updateIfActive();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [user, hydrating, refreshing, refreshData]);

  // Realtime subscription for new messages
  React.useEffect(() => {
    if (!user || isQaDemoMode) return;

    const channel = supabase
      .channel('messages-realtime')
      .on<{
        id: string;
        conversation_id: string;
        author_id: string;
        text: string;
        created_at: string;
        status: string | null;
      }>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new;
          // Skip messages we sent ourselves (already in state)
          if (row.author_id === user.id) return;

          const message: ConversationMessage = {
            id: row.id,
            conversationId: row.conversation_id,
            authorId: row.author_id,
            text: row.text,
            timestamp: row.created_at,
            status: (row.status as ConversationMessage['status']) ?? undefined,
          };

          const current = stateRef.current;
          const existingPreview = current.messages.find((msg) => msg.id === row.conversation_id);
          if (!existingPreview) return; // Unknown conversation

          const preview: MessagePreview = {
            ...existingPreview,
            description: row.text,
            timeAgo: formatTimeAgo(row.created_at),
            unreadCount: (existingPreview.unreadCount ?? 0) + 1,
          };

          dataWriteVersion.current += 1;
          dispatch({
            type: 'CONVERSATION_APPEND',
            payload: { conversationId: row.conversation_id, message, preview },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  React.useEffect(() => {
    if (hydrating || refreshing) {
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
      if (cancelled || !draft.length) return;
      const key = `default:${stableId}:${userId}`;
      if (pendingDataWrites.current.has(key)) return;
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const results = await Promise.all(draft.map(entry => persistDefaultPassToggle({
          userId, stableId, weekday: entry.weekday, slot: entry.slot, enabled: true,
        })));
        const failed = results.find(result => !result.success);
        const confirmed = draft.filter((_entry, index) => results[index].success);
        if (failed && !failed.success) {
          const remaining = draft.filter((_entry, index) => !results[index].success);
          if (confirmed.length && !(await saveDefaultPassDraft(userId, remaining))) {
            reportPersistErrorRef.current('[default pass draft] Kunde inte spara återstående standardpass', new Error('Telefonens lokala lagring kunde inte uppdateras.'));
            return;
          }
          reportPersistErrorRef.current('[default pass draft] Kunde inte synka lokala standardpass', new Error(failed.reason));
        }
        if (confirmed.length && !cancelled && stateRef.current.currentStableId === stableId) {
          const latest = stateRef.current.users[userId];
          if (latest) {
            const merged = [...latest.defaultPasses];
            for (const entry of confirmed) {
              if (!merged.some(value => value.weekday === entry.weekday && value.slot === entry.slot)) merged.push(entry);
            }
            dispatch({ type: 'USER_UPDATE', payload: { id: userId, updates: { defaultPasses: merged } } });
          }
        }
        if (!failed) await clearDefaultPassDraft(userId);
      } finally { pendingDataWrites.current.delete(key); }
    };

    void applyDraft();

    return () => {
      cancelled = true;
    };
  }, [hydrating, persistDefaultPassToggle, refreshing, state.currentStableId, state.currentUserId]);

  React.useEffect(() => {
    if (hydrating || refreshing || pendingDataWrites.current.size) return;
    const current = stateRef.current;
    if (!isQaDemoMode && defaultPassesStableId.current !== current.currentStableId) return;
    if (!resolvePermissions(current, current.currentStableId, current.currentUserId).canManageAssignments) return;
    const todayIso = toISODate(new Date());
    const users = Object.values(state.users).sort((a, b) => a.id.localeCompare(b.id));

    state.assignments.forEach((assignment) => {
      if (assignment.stableId !== current.currentStableId || assignment.status === 'completed' || assignment.date < todayIso) return;
      if (pendingDataWrites.current.has(`assignment:${assignment.id}`)) return;
      const weekday = getWeekdayIndex(assignment.date);
      const candidates = users.filter((user) =>
        resolvePermissions(current, assignment.stableId, user.id).canClaimAssignments &&
        hasDefaultPass(user, weekday, assignment.slot),
      );
      let updates: Partial<Assignment> | undefined;
      if (assignment.status === 'open' && !assignment.assigneeId && candidates.length === 1) {
        const candidate = candidates[0];
        if (!assignment.declinedByUserIds?.includes(candidate.id)) {
          updates = { status: 'assigned', assigneeId: candidate.id, assignedVia: 'default' };
        }
      } else if (assignment.status === 'assigned' && assignment.assignedVia === 'default' && assignment.assigneeId) {
        const shouldOwn = candidates.length === 1 && candidates[0].id === assignment.assigneeId;
        if (!shouldOwn || assignment.declinedByUserIds?.includes(assignment.assigneeId)) {
          updates = { status: 'open', assigneeId: undefined, assignedVia: undefined };
        }
      }
      if (!updates) return;
      const signature = JSON.stringify([assignment, updates]);
      if (autoAssignmentAttempts.current.get(assignment.id) === signature) return;
      autoAssignmentAttempts.current.set(assignment.id, signature);
      const confirmedUpdates = updates;
      void persistAssignmentUpdate(assignment.id, confirmedUpdates).then(({ error }) => {
        if (error) return;
        dispatch({ type: 'ASSIGNMENT_UPDATE', payload: { id: assignment.id, silent: true, updates: confirmedUpdates } });
      });
    });
  }, [hydrating, persistAssignmentUpdate, refreshing, state.assignments, state.users, state.currentStableId, state.currentUserId]);

  const derived = React.useMemo(() => {
    const { assignments, alerts, currentUserId, currentStableId, horses, stableAlerts } = state;
    const currentUser = state.users[currentUserId];
    const membership = state.users[currentUserId]?.membership?.find((m) => m.stableId === currentStableId);
    const currentAccess = membership?.access ?? 'view';
    const currentRole = membership?.role ?? 'guest';
    const permissions = resolvePermissions(state, currentStableId, currentUserId);
    const activeAssignments = assignments.filter((assignment) => assignment.stableId === currentStableId);
    const todayIso = toISODate(new Date());
    const missedAssignments = assignments.filter(
      (assignment) => assignment.status !== 'completed' && assignment.date < todayIso,
    );
    const getMissedAssignmentsForStable = (stableId: string) =>
      missedAssignments
        .filter((assignment) => assignment.stableId === stableId)
        .sort((a, b) => compareAssignmentDateTime(b, a));
    const getAssignmentEndTime = (assignment: Assignment) => {
      const storedDuration = recurringDurationById.current.get(assignment.id);
      if (storedDuration) {
        return addMinutesToTime(assignment.time, storedDuration);
      }
      const endTimeFromNote = extractEndTimeFromNote(assignment.note);
      if (!endTimeFromNote) {
        return null;
      }
      const durationFromNote = calculateDurationMinutes(assignment.time, endTimeFromNote);
      if (durationFromNote) {
        return addMinutesToTime(assignment.time, durationFromNote);
      }
      const endMinutes = parseTimeToMinutes(endTimeFromNote);
      return endMinutes !== null ? formatMinutesToTime(endMinutes) : null;
    };
    const cleanAssignmentNote = (note?: string) => stripAssignmentNoteMetadata(note);
    const stableEventAlerts = alerts.filter((alert) => alert.stableId === currentStableId);
    const activeImportantAlerts = stableAlerts.filter(
      (alert) =>
        alert.stableId === currentStableId &&
        !alert.resolvedAt &&
        alert.severity !== 'info',
    );
    const completed = activeAssignments.filter((assignment) => assignment.status === 'completed').length;
    const open = activeAssignments.filter((assignment) => assignment.status === 'open').length;
    const isFirstTimeOnboarding =
      state.stables.length === 0 && (currentUser?.membership.length ?? 0) === 0;
    const onboardingStableId = currentStableId || state.stables[0]?.id || '';
    const onboardingHasStable = Boolean(onboardingStableId);
    const onboardingStable = onboardingStableId
      ? state.stables.find((stable) => stable.id === onboardingStableId)
      : undefined;
    const onboardingSettings = resolveStableSettings(onboardingStable);
    const onboardingResourcesComplete = onboardingHasStable
      ? Boolean(onboardingSettings.onboarding?.resourcesComplete)
      : false;
    const onboardingHasHorse = onboardingStableId
      ? horses.some((horse) => horse.stableId === onboardingStableId)
      : false;
    const onboardingHasAssignment = onboardingStableId
      ? assignments.some((assignment) => assignment.stableId === onboardingStableId)
      : false;
    const onboardingComplete =
      onboardingHasStable && onboardingResourcesComplete && onboardingHasHorse && onboardingHasAssignment;
    const canManageOnboardingAny =
      isFirstTimeOnboarding ||
      (currentUser?.membership ?? []).some(
        (entry) => entry.role === 'admin' && (entry.access ?? 'view') === 'owner',
      );
    const summary = {
      total: activeAssignments.length,
      completed,
      open,
      alerts: activeImportantAlerts.length || stableEventAlerts.length,
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
      onboardingComplete,
      summary,
      loggableAssignment,
      claimableAssignment,
      upcomingAssignmentsForUser,
      nextAssignmentForUser: loggableAssignment ?? claimableAssignment,
      recentActivities: state.assignmentHistory.slice(0, 5),
      getMissedAssignmentsForStable,
      getAssignmentEndTime,
      cleanAssignmentNote,
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

  const claimAssignment = React.useCallback(
    async (assignmentId: string): Promise<ActionResult<Assignment>> => {
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
      if (pendingAssignmentClaimIdsRef.current.has(assignmentId)) {
        return { success: false, reason: 'Passet håller redan på att tas.' };
      }
      if (pendingDataWrites.current.has(`assignment:${assignmentId}`)) {
        return { success: false, reason: 'Passet sparas redan. Vänta ett ögonblick.' };
      }

      const declinedByUserIds = assignment.declinedByUserIds?.filter(
        (id) => id !== current.currentUserId,
      );
      const updated: Assignment = {
        ...assignment,
        status: 'assigned',
        assigneeId: current.currentUserId,
        assignedVia: 'manual',
        declinedByUserIds,
      };
      const updates: Partial<Assignment> = {
        status: 'assigned',
        assigneeId: current.currentUserId,
        assignedVia: 'manual',
        declinedByUserIds,
      };

      pendingAssignmentClaimIdsRef.current.add(assignmentId);
      pendingDataWrites.current.add(`assignment:${assignmentId}`);
      dataWriteVersion.current += 1;
      try {
        const persisted = await persistAssignmentClaim(assignment.id, updates);
        pendingDataWrites.current.delete(`assignment:${assignmentId}`);
        if (persisted.error) {
          await refreshData({ reason: 'manual' });
          return {
            success: false,
            reason: 'Det gick inte att ta passet just nu. Försök igen.',
          };
        }
        if (!persisted.claimed) {
          const refreshed = await refreshData({ reason: 'manual' });
          return {
            success: false,
            reason: refreshed.success
              ? 'Någon annan hann ta passet. Schemat har uppdaterats.'
              : 'Någon annan hann ta passet. Ladda om schemat för senaste läget.',
          };
        }

        dispatch({
          type: 'ASSIGNMENT_UPDATE',
          payload: { id: assignment.id, updates },
        });
        void persistAssignmentHistory(updated, 'assigned');

        return {
          success: true,
          data: updated,
        };
      } finally {
        pendingAssignmentClaimIdsRef.current.delete(assignmentId);
        pendingDataWrites.current.delete(`assignment:${assignmentId}`);
      }
    },
    [ensurePermission, persistAssignmentClaim, persistAssignmentHistory, refreshData],
  );

  const claimNextOpenAssignment = React.useCallback(async (): Promise<ActionResult<Assignment>> => {
    const assignment = findNextOpenAssignment(stateRef.current);
    if (!assignment) {
      return { success: false, reason: 'Alla pass är redan bemannade.' };
    }
    return claimAssignment(assignment.id);
  }, [claimAssignment]);

  const declineAssignment = React.useCallback(
    async (assignmentId: string): Promise<ActionResult<Assignment>> => {
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

      const saved = await persistOwnAssignmentUpdate(assignment, {
        status: 'open',
        assigneeId: undefined,
        assignedVia: undefined,
        declinedByUserIds: Array.from(declined),
      });
      if (!saved.success) return saved;

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
      void persistAssignmentHistory(updated, 'declined');

      return {
        success: true,
        data: updated,
      };
    },
    [ensurePermission, persistAssignmentHistory, persistOwnAssignmentUpdate],
  );

  const completeAssignment = React.useCallback(
    async (assignmentId: string): Promise<ActionResult<Assignment>> => {
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

      const saved = await persistOwnAssignmentUpdate(assignment, { status: 'completed', completedAt });
      if (!saved.success) return saved;

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
      void persistAssignmentHistory(updated, 'completed');

      return {
        success: true,
        data: updated,
      };
    },
    [ensurePermission, persistAssignmentHistory, persistOwnAssignmentUpdate],
  );

  const createAssignment = React.useCallback(
    async (input: CreateAssignmentInput): Promise<ActionResult<Assignment>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (!input.date) {
        return { success: false, reason: 'Datum måste anges.' };
      }
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (input.time?.trim() && !isValidTime(input.time.trim())) {
        return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
      }

      const slot = input.slot;
      const cleanedLabel = input.labelOverride?.trim();
      const cleanedTime = input.time?.trim();
      const label = cleanedLabel || slotTitles[slot] || 'Pass';
      const time = cleanedTime || slotDefaultTimes[slot];
      const status: AssignmentStatus = input.assignToCurrentUser ? 'assigned' : 'open';
      const assigneeId = input.assignToCurrentUser ? current.currentUserId : undefined;

      const assignment: Assignment = {
        id: input.requestId ?? generateId(),
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

      const saved = await persistAssignmentInsert(assignment);
      if (saved.error) return { success: false, reason: saved.reason ?? 'Passet kunde inte skapas. Försök igen.' };
      if (stateRef.current.assignments.some((item) => item.id === assignment.id)) {
        dispatch({ type: 'ASSIGNMENT_UPDATE', payload: { id: assignment.id, updates: assignment, silent: true } });
      } else {
        dispatch({ type: 'ASSIGNMENT_ADD', payload: assignment });
      }
      void persistAssignmentHistory(assignment, 'created');

      return { success: true, data: assignment };
    },
    [ensurePermission, persistAssignmentHistory, persistAssignmentInsert],
  );

  const createRecurringAssignments = React.useCallback(
    async (
      input: CreateRecurringAssignmentsInput,
    ): Promise<ActionResult<{ createdCount: number; skippedCount: number }>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }

      const title = input.title.trim();
      const startTime = input.startTime.trim();
      const durationMinutes =
        input.durationMinutes && input.durationMinutes > 0
          ? input.durationMinutes
          : DEFAULT_ASSIGNMENT_DURATION_MINUTES;
      if (!title) {
        return { success: false, reason: 'Titel saknas.' };
      }
      if (!isValidISODate(input.dateFrom) || !isValidISODate(input.dateTo)) {
        return { success: false, reason: 'Ange giltiga datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (!isValidTime(startTime)) {
        return { success: false, reason: 'Ange en giltig starttid i formatet HH:MM.' };
      }
      if (!input.weekdays.length) {
        return { success: false, reason: 'Välj minst en veckodag.' };
      }

      const startDate = new Date(`${input.dateFrom}T00:00:00`);
      const endDate = new Date(`${input.dateTo}T00:00:00`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return { success: false, reason: 'Ogiltigt datumintervall.' };
      }
      if (startDate > endDate) {
        return { success: false, reason: 'Startdatum måste vara före slutdatum.' };
      }

      const slotCount = Math.max(1, Math.floor(input.slotsCount ?? 1));
      const weekdays = new Set(input.weekdays);
      const existingKeys = new Set<string>();
      current.assignments
        .filter((assignment) => assignment.stableId === stableId)
        .forEach((assignment) => {
          const storedDuration = recurringDurationById.current.get(assignment.id);
          const endTimeFromNote = extractEndTimeFromNote(assignment.note);
          const durationFromNote =
            endTimeFromNote ? calculateDurationMinutes(assignment.time, endTimeFromNote) : null;
          const resolvedDuration =
            storedDuration ?? durationFromNote ?? DEFAULT_ASSIGNMENT_DURATION_MINUTES;
          existingKeys.add(
            buildRecurringAssignmentKey(
              stableId,
              assignment.date,
              assignment.label,
              assignment.time,
              resolvedDuration,
            ),
          );
        });

      const generatedAssignments: Assignment[] = [];
      let skippedCount = 0;
      const status: AssignmentStatus = input.assignToCurrentUser ? 'assigned' : 'open';
      const assigneeId = input.assignToCurrentUser ? current.currentUserId : undefined;
      const assignedVia: AssignmentAssignedVia | undefined = input.assignToCurrentUser ? 'manual' : undefined;
      const slot = resolveSlotFromTime(startTime);

      for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
        const isoDate = toISODate(cursor);
        if (!weekdays.has(getWeekdayIndex(isoDate))) {
          continue;
        }
        for (let index = 1; index <= slotCount; index += 1) {
          const label = slotCount > 1 ? `${title} #${index}` : title;
          const key = buildRecurringAssignmentKey(
            stableId,
            isoDate,
            label,
            startTime,
            durationMinutes,
          );
          if (existingKeys.has(key)) {
            skippedCount += 1;
            continue;
          }
          existingKeys.add(key);
          generatedAssignments.push({
            id: generateId(),
            date: isoDate,
            stableId,
            label,
            slot,
            icon: slotIcons[slot],
            time: startTime,
            status,
            assigneeId,
            assignedVia,
            note: `Slut: ${addMinutesToTime(startTime, durationMinutes)}`,
          });
        }
      }

      const batchKey = JSON.stringify([stableId, current.currentUserId, input]);
      const assignmentsToCreate = pendingRecurringBatches.current.get(batchKey) ?? generatedAssignments;
      if (!assignmentsToCreate.length) {
        return { success: true, data: { createdCount: 0, skippedCount } };
      }

      pendingRecurringBatches.current.set(batchKey, assignmentsToCreate);
      const { error } = await persistAssignmentBatchInsert(assignmentsToCreate);
      if (error) return { success: false, reason: 'Kunde inte skapa återkommande pass. Försök igen eller uppdatera schemat.' };
      pendingRecurringBatches.current.delete(batchKey);
      assignmentsToCreate.forEach((assignment) => {
        if (!stateRef.current.assignments.some((existing) => existing.id === assignment.id)) {
          dispatch({ type: 'ASSIGNMENT_ADD', payload: assignment });
        }
        recurringDurationById.current.set(assignment.id, durationMinutes);
      });
      assignmentsToCreate.forEach((assignment) => {
        void persistAssignmentHistory(assignment, 'created');
      });

      return {
        success: true,
        data: { createdCount: assignmentsToCreate.length, skippedCount },
      };
    },
    [ensurePermission, persistAssignmentBatchInsert, persistAssignmentHistory],
  );

  const updateAssignment = React.useCallback(
    async (input: UpdateAssignmentInput): Promise<ActionResult<Assignment>> => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === input.id);

      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (input.date !== undefined && !isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (input.time?.trim() && !isValidTime(input.time.trim())) {
        return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
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

      const { error } = await persistAssignmentUpdate(existing.id, updates, undefined, false);
      if (error) return { success: false, reason: 'Passet kunde inte uppdateras. Försök igen.' };

      dispatch({
        type: 'ASSIGNMENT_UPDATE',
        payload: {
          id: existing.id,
          updates,
        },
      });

      const updated = { ...existing, ...updates };
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
    async (assignmentId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.assignments.find((item) => item.id === assignmentId);
      if (!existing) {
        return { success: false, reason: 'Passet kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageAssignments);
      if (!accessCheck.success) {
        return accessCheck;
      }

      const { error } = await persistAssignmentDelete(assignmentId);
      if (error) return { success: false, reason: 'Passet kunde inte tas bort. Försök igen.' };
      dispatch({ type: 'ASSIGNMENT_REMOVE', payload: { id: assignmentId } });
      return { success: true };
    },
    [ensurePermission, persistAssignmentDelete],
  );

  const addEvent = React.useCallback(
    async (message: string, type: AlertMessage['type'] = 'info', requestId?: string): Promise<ActionResult<AlertMessage>> => {
      const current = stateRef.current;
      const accessCheck = ensurePermission(
        current.currentStableId,
        (permissions) => permissions.canManageDayEvents,
      );
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (!message.trim()) return { success: false, reason: 'Skriv en kort uppdatering.' };
      const alert: AlertMessage = {
        id: requestId ?? generateId(),
        stableId: current.currentStableId,
        message: message.trim(),
        type,
        createdAt: new Date().toISOString(),
      };
      const key = `event:${alert.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Händelsen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistAlertInsert(alert);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte händelsen. Försök igen.' };
        dispatch({ type: 'ALERT_ADD', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistAlertInsert],
  );

  const ensureStableAlertAccess = React.useCallback(
    (stableId: string) =>
      ensurePermission(
        stableId,
        (permissions) =>
          permissions.canManageAssignments ||
          permissions.canManageDayEvents ||
          permissions.canManageOnboarding,
      ),
    [ensurePermission],
  );

  const createStableAlert = React.useCallback(
    async (input: CreateStableAlertInput): Promise<ActionResult<StableAlert>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensureStableAlertAccess(stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const title = input.title.trim();
      if (!title) {
        return { success: false, reason: 'Skriv vad som är viktigt.' };
      }
      const alert: StableAlert = {
        id: input.requestId ?? generateId(),
        stableId,
        title,
        body: input.body?.trim() || undefined,
        severity: input.severity ?? 'important',
        horseId: input.horseId,
        paddockId: input.paddockId,
        assignmentId: input.assignmentId,
        createdByUserId: current.currentUserId,
        createdAt: new Date().toISOString(),
      };
      const key = `stable-alert:${alert.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Notisen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistStableAlertUpsert(alert);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte notisen. Försök igen.' };
        dispatch({ type: 'STABLE_ALERT_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensureStableAlertAccess, persistStableAlertUpsert],
  );

  const resolveStableAlert = React.useCallback(
    async (alertId: string): Promise<ActionResult<StableAlert>> => {
      const current = stateRef.current;
      const existing = current.stableAlerts.find((alert) => alert.id === alertId);
      if (!existing) {
        return { success: false, reason: 'Notisen kunde inte hittas.' };
      }
      const accessCheck = ensureStableAlertAccess(existing.stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (existing.resolvedAt) {
        return { success: false, reason: 'Notisen är redan löst.' };
      }
      const next: StableAlert = {
        ...existing,
        resolvedAt: new Date().toISOString(),
      };
      const key = `stable-alert:${next.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Notisen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistStableAlertUpsert(next, true);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte notisen. Försök igen.' };
        dispatch({ type: 'STABLE_ALERT_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensureStableAlertAccess, persistStableAlertUpsert],
  );

  const toggleDefaultPass = React.useCallback(
    async (weekday: WeekdayIndex, slot: AssignmentSlot): Promise<ActionResult<UserProfile>> => {
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

      if (stableId && defaultPassesStableId.current !== stableId) return { success: false, reason: 'Standardpassen för stallet hämtas fortfarande. Vänta ett ögonblick.' };
      const key = `default:${stableId}:${user.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Standardpassen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        if (!stableId) {
          if (!(await saveDefaultPassDraft(user.id, nextDefaultPasses))) return { success: false, reason: 'Standardpassen kunde inte sparas på telefonen. Försök igen.' };
        } else {
          const result = await persistDefaultPassToggle({ userId: user.id, stableId, weekday, slot, enabled: !exists });
          if (!result.success) return result;
        }
        // These preferences in state always belong to the currently selected stable.
        if (stateRef.current.currentStableId === stableId) {
          const latest = stateRef.current.users[user.id] ?? user;
          const remaining = latest.defaultPasses.filter(entry => !(entry.weekday === weekday && entry.slot === slot));
          const saved = exists ? remaining : [...remaining, { weekday, slot }];
          dispatch({ type: 'USER_UPDATE', payload: { id: user.id, updates: { defaultPasses: saved } } });
          return { success: true, data: { ...latest, defaultPasses: saved } };
        }
        return { success: true, data: user };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [persistDefaultPassToggle],
  );

  const markConversationRead = React.useCallback((conversationId: string) => {
    dispatch({ type: 'MESSAGE_MARK_READ', payload: { id: conversationId } });
  }, []);

  const sendConversationMessage = React.useCallback(
    async (conversationId: string, text: string, requestId?: string): Promise<ActionResult<ConversationMessage>> => {
      if (!text.trim()) return { success: false, reason: 'Meddelandet kan inte vara tomt.' };
      const current = stateRef.current;
      if (!current.currentUserId) return { success: false, reason: 'Ingen inloggad användare.' };
      const existingPreview = current.messages.find((msg) => msg.id === conversationId);
      if (!existingPreview) return { success: false, reason: 'Konversationen kunde inte hittas. Uppdatera och försök igen.' };
      const message: ConversationMessage = {
        id: requestId ?? generateId(), conversationId, authorId: current.currentUserId,
        text: text.trim(), timestamp: new Date().toISOString(), status: 'sent',
      };
      const key = `message:${message.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Meddelandet skickas redan.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistConversationMessage(message);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Meddelandet kunde inte skickas. Försök igen.' };
        const preview: MessagePreview = {
          ...existingPreview, description: result.data.text,
          timeAgo: formatTimeAgo(result.data.timestamp), unreadCount: 0,
        };
        dispatch({ type: 'CONVERSATION_APPEND', payload: { conversationId, message: result.data, preview } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [persistConversationMessage],
  );

  const createPrivateConversation = React.useCallback(
    async (otherUserId: string): Promise<ActionResult<string>> => {
      const current = stateRef.current;
      if (!current.currentUserId) {
        return { success: false, reason: 'Ingen inloggad användare.' };
      }
      if (current.blockedUserIds.includes(otherUserId)) {
        return {
          success: false,
          reason: 'Du har blockerat den här användaren. Häv blockeringen för att chatta.',
        };
      }

      // Look through conversations for an existing private chat with this user
      for (const preview of current.messages) {
        if (preview.group) continue;
        const msgs = current.conversations[preview.id] ?? [];
        const participants = new Set<string>();
        participants.add(current.currentUserId);
        msgs.forEach((m) => participants.add(m.authorId));
        if (participants.has(otherUserId)) {
          return { success: true, data: preview.id };
        }
      }

      // Create new conversation. qaDemo is backend-free, so fabricate a local id and
      // skip the Supabase round-trip (which would otherwise fail and block the chat).
      let conversationId: string;
      if (isQaDemoMode) {
        conversationId = generateId();
      } else {
        const { data: conversationData, error: convError } = await supabase
          .from('conversations')
          .insert({
            is_group: false,
            created_by_user_id: current.currentUserId,
          })
          .select('id')
          .single();

        if (convError || !conversationData) {
          return { success: false, reason: 'Kunde inte skapa konversation.' };
        }

        conversationId = conversationData.id;

        // Add both users as conversation members
        const { error: memberError } = await supabase
          .from('conversation_members')
          .insert([
            { conversation_id: conversationId, user_id: current.currentUserId },
            { conversation_id: conversationId, user_id: otherUserId },
          ]);

        if (memberError) {
          console.warn('Kunde inte lägga till konversationsmedlemmar', memberError);
        }
      }

      // Add preview to local state
      const otherUser = current.users[otherUserId];
      const preview: MessagePreview = {
        id: conversationId,
        title: otherUser?.name ?? 'Okänd',
        subtitle: 'Privat chatt',
        description: 'Inga meddelanden ännu',
        timeAgo: '',
        unreadCount: 0,
        group: false,
        avatar: otherUser?.avatar,
      };

      dispatch({
        type: 'CONVERSATION_APPEND',
        payload: { conversationId, preview },
      });

      return { success: true, data: conversationId };
    },
    [],
  );

  const upsertPaddock = React.useCallback(
    async (input: UpsertPaddockInput): Promise<ActionResult<Paddock>> => {
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

      if (existing && existing.stableId !== stableId) return { success: false, reason: 'Hagen tillhör ett annat stall.' };

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

      const writeKey = `paddock:${id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Hagen sparas redan. Vänta och försök igen.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const result = await persistPaddockUpsert(paddock, input.image, Boolean(existing));
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte hagen. Försök igen.' };
        dispatch({ type: 'PADDOCK_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(writeKey); }

    },
    [ensurePermission, persistPaddockUpsert],
  );

  const deletePaddock = React.useCallback(async (paddockId: string): Promise<ActionResult> => {
    const current = stateRef.current;
    const existing = current.paddocks.find((paddock) => paddock.id === paddockId);
    if (!existing) {
      return { success: false, reason: 'Hagen kunde inte hittas.' };
    }
    const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManagePaddocks);
    if (!accessCheck.success) {
      return accessCheck;
    }

    const writeKey = `paddock:${paddockId}`;
    if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Hagen sparas redan. Vänta och försök igen.' };
    pendingDataWrites.current.add(writeKey);
    dataWriteVersion.current += 1;
    try {
      const result = await persistPaddockDelete(existing);
      if (!result.success) return result;
      dispatch({ type: 'PADDOCK_DELETE', payload: { id: paddockId } });
      return result;
    } finally { pendingDataWrites.current.delete(writeKey); }

  }, [ensurePermission, persistPaddockDelete]);

  const updateHorseDayStatus = React.useCallback(
    async (input: UpdateHorseDayStatusInput): Promise<ActionResult<HorseDayStatus>> => {
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
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
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

      const writeKey = `status:${stableId}:${input.horseId}:${input.date}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Häststatus sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistHorseDayStatusUpsert(next, input.updates);
        dispatch({ type: 'HORSE_DAY_STATUS_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[horse status] Kunde inte spara häststatus', error);
        return { success: false, reason: 'Häststatus kunde inte sparas. Försök igen.' };
      } finally {
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [ensurePermission, persistHorseDayStatusUpsert],
  );

  const upsertFeedPlan = React.useCallback(
    async (input: UpsertFeedPlanInput): Promise<ActionResult<FeedPlanItem>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const label = input.label.trim();
      if (!label) {
        return { success: false, reason: 'Foderplanen måste ha en titel.' };
      }
      const horseId = input.horseId ?? undefined;
      const horse = horseId ? current.horses.find((entry) => entry.id === horseId) : undefined;
      if (horseId && (!horse || horse.stableId !== stableId)) {
        return { success: false, reason: 'Hästen kunde inte hittas.' };
      }
      const isHorseOwner =
        Boolean(horse) && horse?.ownerUserId === current.currentUserId;
      const accessCheck = ensurePermission(stableId, (permissions) => {
        if (input.isStableDefault) {
          return permissions.canManageHorses || permissions.canManageOnboarding;
        }
        if (isHorseOwner) {
          return true;
        }
        return permissions.canManageHorses || permissions.canManageOnboarding;
      });
      if (!accessCheck.success) {
        return accessCheck;
      }
      const existing = input.id
        ? current.feedPlans.find((plan) => plan.id === input.id)
        : undefined;
      const id = existing?.id ?? input.id ?? generateId();
      const plan: FeedPlanItem = {
        id,
        stableId,
        horseId: input.isStableDefault ? undefined : horseId ?? existing?.horseId,
        slot: input.slot,
        label,
        amount: input.amount?.trim() || undefined,
        note: input.note?.trim() || undefined,
        isStableDefault: input.isStableDefault,
        active: input.active ?? existing?.active ?? true,
      };

      const writeKey = `feed-plan:${stableId}:${plan.isStableDefault ? 'default' : plan.horseId}:${plan.slot}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Foderplanen sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistFeedPlanUpsert(plan);
        dispatch({ type: 'FEED_PLAN_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[feed plan save] Kunde inte spara foderplan', error);
        return { success: false, reason: 'Foderplanen kunde inte sparas. Försök igen.' };
      } finally {
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [ensurePermission, persistFeedPlanUpsert],
  );

  const deleteFeedPlan = React.useCallback(
    async (feedPlanId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.feedPlans.find((plan) => plan.id === feedPlanId);
      if (!existing) {
        return { success: false, reason: 'Foderplanen kunde inte hittas.' };
      }
      const horse = existing.horseId
        ? current.horses.find((entry) => entry.id === existing.horseId)
        : undefined;
      const isHorseOwner = Boolean(horse) && horse?.ownerUserId === current.currentUserId;
      const accessCheck = ensurePermission(existing.stableId, (permissions) => {
        if (existing.isStableDefault) {
          return permissions.canManageHorses || permissions.canManageOnboarding;
        }
        if (isHorseOwner) {
          return true;
        }
        return permissions.canManageHorses || permissions.canManageOnboarding;
      });
      if (!accessCheck.success) {
        return accessCheck;
      }

      const writeKey = `feed-plan:${existing.stableId}:${existing.isStableDefault ? 'default' : existing.horseId}:${existing.slot}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Foderplanen sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        await persistFeedPlanDelete(existing);
        dispatch({ type: 'FEED_PLAN_DELETE', payload: { id: feedPlanId } });
        return { success: true };
      } catch (error) {
        console.warn('[feed plan delete] Kunde inte ta bort foderplan', error);
        return { success: false, reason: 'Foderplanen kunde inte tas bort. Försök igen.' };
      } finally {
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [ensurePermission, persistFeedPlanDelete],
  );

  const upsertFeedCheck = React.useCallback(
    async (input: UpsertFeedCheckInput): Promise<ActionResult<FeedCheck>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const horse = current.horses.find((entry) => entry.id === input.horseId);
      if (!horse || horse.stableId !== stableId) {
        return { success: false, reason: 'Hästen kunde inte hittas.' };
      }
      const isHorseOwner = horse.ownerUserId === current.currentUserId;
      const accessCheck = ensurePermission(
        stableId,
        (permissions) => permissions.canUpdateHorseStatus || isHorseOwner,
      );
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      const existing = current.feedChecks.find(
        (check) =>
          check.horseId === input.horseId &&
          check.date === input.date &&
          check.slot === input.slot,
      );
      const id = existing?.id ?? generateId();
      const checked = input.checked ?? Boolean(existing?.checkedAt);
      const trimmedNote = input.deviationNote?.trim();
      const deviationNote =
        input.deviationNote === undefined
          ? existing?.deviationNote
          : trimmedNote || undefined;
      const checkedAt = checked
        ? existing?.checkedAt ?? new Date().toISOString()
        : undefined;
      const next: FeedCheck = {
        id,
        stableId,
        horseId: input.horseId,
        date: input.date,
        slot: input.slot,
        checkedByUserId: checked ? existing?.checkedByUserId ?? current.currentUserId : undefined,
        checkedAt,
        deviationNote,
      };

      const writeKey = `feed:${stableId}:${input.horseId}:${input.date}:${input.slot}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Foderkollen sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistFeedCheckUpsert(next, input);
        dispatch({ type: 'FEED_CHECK_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[feed check] Kunde inte spara foderkoll', error);
        return { success: false, reason: 'Foderkollen kunde inte sparas. Försök igen.' };
      } finally {
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [ensurePermission, persistFeedCheckUpsert],
  );

  const addDayEvent = React.useCallback(
    async (input: CreateDayEventInput): Promise<ActionResult<DayEvent>> => {
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
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }

      const event: DayEvent = {
        id: input.requestId ?? generateId(),
        stableId,
        date: input.date,
        label,
        tone: input.tone ?? 'info',
      };
      const key = `day event:${event.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Sparning pågår. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistDayEventInsert(event);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte uppgifterna. Försök igen.' };
        dispatch({ type: 'DAY_EVENT_ADD', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistDayEventInsert],
  );

  const removeDayEvent = React.useCallback(
    async (eventId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.dayEvents.find((event) => event.id === eventId);
      if (!existing) {
        return { success: false, reason: 'Händelsen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageDayEvents);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const key = `day event:${eventId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Sparning pågår. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistDayEventDelete(existing);
        if (!result.success) return result;
        dispatch({ type: 'DAY_EVENT_DELETE', payload: { id: eventId } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistDayEventDelete],
  );

  const addArenaBooking = React.useCallback(
    async (input: CreateArenaBookingInput): Promise<ActionResult<ArenaBooking>> => {
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
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
        return { success: false, reason: 'Ange start och sluttid i formatet HH:MM.' };
      }
      if (input.startTime >= input.endTime) {
        return { success: false, reason: 'Sluttiden måste vara efter starttiden.' };
      }
      const hasOverlap = current.arenaBookings.some((booking) => {
        if (booking.id === input.requestId || booking.stableId !== stableId || booking.date !== input.date) {
          return false;
        }
        return input.startTime < booking.endTime && booking.startTime < input.endTime;
      });
      if (hasOverlap) {
        return { success: false, reason: 'Tiden krockar med en annan bokning' };
      }

      const booking: ArenaBooking = {
        id: input.requestId ?? generateId(),
        stableId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        purpose,
        note: input.note?.trim() || undefined,
        bookedByUserId: current.currentUserId,
      };
      const key = `arena:${booking.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Bokningen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistArenaBookingInsert(booking);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte bokningen. Försök igen.' };
        dispatch({ type: 'ARENA_BOOKING_ADD', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistArenaBookingInsert],
  );

  const updateArenaBooking = React.useCallback(
    async (input: { id: string; updates: Partial<ArenaBooking> }): Promise<ActionResult<ArenaBooking>> => {
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
        ...('purpose' in input.updates ? { purpose: input.updates.purpose?.trim() ?? '' } : {}),
        ...('note' in input.updates ? { note: input.updates.note?.trim() || undefined } : {}),
      };
      const updated = { ...existing, ...updates, id: existing.id, stableId: existing.stableId, bookedByUserId: existing.bookedByUserId };
      if (!updated.purpose || !isValidISODate(updated.date) || !isValidTime(updated.startTime) || !isValidTime(updated.endTime) || updated.startTime >= updated.endTime) {
        return { success: false, reason: 'Ange syfte, giltigt datum och en sluttid efter starttiden.' };
      }
      const hasOverlap = current.arenaBookings.some((booking) => {
        if (booking.id === existing.id) {
          return false;
        }
        if (booking.stableId !== updated.stableId || booking.date !== updated.date) {
          return false;
        }
        return updated.startTime < booking.endTime && booking.startTime < updated.endTime;
      });
      if (hasOverlap) {
        return { success: false, reason: 'Tiden krockar med en annan bokning' };
      }
      const key = `arena:${existing.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Bokningen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistArenaBookingUpdate(existing, updates);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte bokningen. Försök igen.' };
        dispatch({ type: 'ARENA_BOOKING_UPDATE', payload: { id: existing.id, updates: result.data } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistArenaBookingUpdate],
  );

  const removeArenaBooking = React.useCallback(
    async (bookingId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.arenaBookings.find((booking) => booking.id === bookingId);
      if (!existing) {
        return { success: false, reason: 'Bokningen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageArenaBookings);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const key = `arena:${bookingId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Bokningen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistArenaBookingDelete(existing);
        if (!result.success) return result;
        dispatch({ type: 'ARENA_BOOKING_DELETE', payload: { id: bookingId } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistArenaBookingDelete],
  );

  const addArenaStatus = React.useCallback(
    async (input: CreateArenaStatusInput): Promise<ActionResult<ArenaStatus>> => {
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
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }

      const status: ArenaStatus = {
        id: input.requestId ?? generateId(),
        stableId,
        date: input.date,
        label,
        createdByUserId: current.currentUserId,
        createdAt: new Date().toISOString(),
      };
      const key = `arena status:${status.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Sparning pågår. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistArenaStatusInsert(status);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte uppgifterna. Försök igen.' };
        dispatch({ type: 'ARENA_STATUS_ADD', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistArenaStatusInsert],
  );

  const removeArenaStatus = React.useCallback(
    async (statusId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.arenaStatuses.find((status) => status.id === statusId);
      if (!existing) {
        return { success: false, reason: 'Statusen kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageArenaStatus);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const key = `arena status:${statusId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Sparning pågår. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistArenaStatusDelete(existing);
        if (!result.success) return result;
        dispatch({ type: 'ARENA_STATUS_DELETE', payload: { id: statusId } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistArenaStatusDelete],
  );

  const addRideLog = React.useCallback(
    async (input: CreateRideLogInput): Promise<ActionResult<RideLogEntry>> => {
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
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
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
        id: input.requestId ?? generateId(),
        stableId,
        horseId: input.horseId,
        date: input.date,
        rideTypeId: input.rideTypeId,
        length: input.length?.trim() || undefined,
        note: input.note?.trim() || undefined,
        createdByUserId: current.currentUserId,
      };
      const key = `ride-log:${log.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistRideLogInsert(log, true);
        if (!saved) throw new Error('Servern bekräftade inte ridpasset.');
        dispatch({ type: 'RIDE_LOG_ADD', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[ride log save] Kunde inte registrera ridpass', error);
        return { success: false, reason: 'Ridpasset kunde inte sparas. Dina uppgifter finns kvar. Försök igen.' };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistRideLogInsert],
  );

  const removeRideLog = React.useCallback(
    async (rideLogId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.rideLogs.find((log) => log.id === rideLogId);
      if (!existing) {
        return { success: false, reason: 'Ridpasset kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageRideLogs);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const key = `ride-log:${rideLogId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistRideLogDelete(existing);
        if (!result.success) return result;
        dispatch({ type: 'RIDE_LOG_DELETE', payload: { id: rideLogId } });
        return { success: true };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistRideLogDelete],
  );

  const ensurePlannedRideAccess = React.useCallback(
    (stableId: string, horseId: string) => {
      const horse = stateRef.current.horses.find((entry) => entry.id === horseId);
      const isHorseOwner = Boolean(horse) && horse?.ownerUserId === stateRef.current.currentUserId;
      return ensurePermission(
        stableId,
        (permissions) => permissions.canManageRideLogs || isHorseOwner,
      );
    },
    [ensurePermission],
  );

  const createPlannedRide = React.useCallback(
    async (input: CreatePlannedRideInput): Promise<ActionResult<PlannedRide>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      if (!input.horseId) {
        return { success: false, reason: 'Välj en häst.' };
      }
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (input.time?.trim() && !isValidTime(input.time.trim())) {
        return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
      }
      const horse = current.horses.find((item) => item.id === input.horseId);
      if (!horse || horse.stableId !== stableId) {
        return { success: false, reason: 'Hästen finns inte i valt stall.' };
      }
      const accessCheck = ensurePlannedRideAccess(stableId, input.horseId);
      if (!accessCheck.success) {
        return accessCheck;
      }

      const ride: PlannedRide = {
        id: input.requestId ?? generateId(),
        stableId,
        horseId: input.horseId,
        riderUserId: input.riderUserId ?? current.currentUserId,
        date: input.date,
        time: input.time?.trim() || undefined,
        rideTypeId: input.rideTypeId?.trim() || undefined,
        note: input.note?.trim() || undefined,
        status: 'planned',
        createdAt: new Date().toISOString(),
      };
      const writeKey = `planned-ride:${ride.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistPlannedRideUpsert(ride);
        dispatch({ type: 'PLANNED_RIDE_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[planned ride create] Kunde inte spara ridpass', error);
        return { success: false, reason: 'Ridpasset kunde inte sparas. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensurePlannedRideAccess, persistPlannedRideUpsert],
  );

  const updatePlannedRide = React.useCallback(
    async (input: UpdatePlannedRideInput): Promise<ActionResult<PlannedRide>> => {
      const current = stateRef.current;
      const existing = current.plannedRides.find((ride) => ride.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Ridpasset kunde inte hittas.' };
      }
      const accessCheck = ensurePlannedRideAccess(existing.stableId, existing.horseId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const next: PlannedRide = { ...existing, ...input.updates };
      if (existing.status !== 'planned' || next.status === 'done') {
        return { success: false, reason: 'Passet har ändrats. Använd Slutför ridpass för att logga det.' };
      }
      if (!isValidISODate(next.date)) return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      if (next.time?.trim() && !isValidTime(next.time.trim())) return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
      next.time = next.time?.trim() || undefined;
      const writeKey = `planned-ride:${existing.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistPlannedRideUpsert(next, existing, input.updates);
        dispatch({ type: 'PLANNED_RIDE_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[planned ride update] Kunde inte uppdatera ridpass', error);
        return { success: false, reason: 'Ridpasset kunde inte sparas. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensurePlannedRideAccess, persistPlannedRideUpsert],
  );

  const deletePlannedRide = React.useCallback(
    async (plannedRideId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.plannedRides.find((ride) => ride.id === plannedRideId);
      if (!existing) {
        return { success: false, reason: 'Ridpasset kunde inte hittas.' };
      }
      const accessCheck = ensurePlannedRideAccess(existing.stableId, existing.horseId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const writeKey = `planned-ride:${existing.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        await persistPlannedRideDelete(existing);
        dispatch({ type: 'PLANNED_RIDE_DELETE', payload: { id: plannedRideId } });
        return { success: true };
      } catch (error) {
        console.warn('[planned ride delete] Kunde inte ta bort ridpass', error);
        return { success: false, reason: 'Ridpasset kunde inte tas bort. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensurePlannedRideAccess, persistPlannedRideDelete],
  );

  const completePlannedRide = React.useCallback(
    async (input: CompletePlannedRideInput): Promise<ActionResult<{ plannedRide: PlannedRide; rideLog: RideLogEntry }>> => {
      const current = stateRef.current;
      const existing = current.plannedRides.find((ride) => ride.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Ridpasset kunde inte hittas.' };
      }
      if (existing.status !== 'planned') {
        return { success: false, reason: 'Passet är redan klart eller avbokat. Uppdatera sidan.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageRideLogs);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const stable = current.stables.find((item) => item.id === existing.stableId);
      if (!stable) {
        return { success: false, reason: 'Stallet kunde inte hittas.' };
      }
      // Falla tillbaka till ride type från planet om det finns, annars kräv att stallet har en
      const rideTypeId = existing.rideTypeId ?? stable.rideTypes?.[0]?.id;
      if (!rideTypeId) {
        return { success: false, reason: 'Stallet saknar ridpass-typer. Lägg till en först.' };
      }

      const rideLog: RideLogEntry = {
        id: existing.completedRideLogId ?? existing.id,
        stableId: existing.stableId,
        horseId: existing.horseId,
        date: existing.date,
        rideTypeId,
        length: input.length?.trim() || undefined,
        note: input.note?.trim() || existing.note,
        createdByUserId: current.currentUserId,
      };
      const updatedRide: PlannedRide = {
        ...existing,
        status: 'done',
        completedRideLogId: rideLog.id,
      };

      const writeKey = `planned-ride:${existing.id}`;
      if (pendingDataWrites.current.has(writeKey)) {
        return { success: false, reason: 'Ridpasset sparas redan. Vänta ett ögonblick.' };
      }
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      let logConfirmed = false;
      try {
        const savedLog = await persistRideLogInsert(rideLog, true);
        if (!savedLog) throw new Error('Servern bekräftade inte ridloggen.');
        logConfirmed = true;
        const savedRide = await persistPlannedRideUpsert(updatedRide, existing);
        if (!savedRide) throw new Error('Servern bekräftade inte ridpasset.');
        if (!stateRef.current.rideLogs.some((entry) => entry.id === savedLog.id)) {
          dispatch({ type: 'RIDE_LOG_ADD', payload: savedLog });
        }
        dispatch({ type: 'PLANNED_RIDE_UPSERT', payload: savedRide });
        return { success: true, data: { plannedRide: savedRide, rideLog: savedLog } };
      } catch (error) {
        console.warn('[planned ride complete] Kunde inte slutföra ridpass', error);
        return {
          success: false,
          reason: logConfirmed
            ? 'Ridloggen har sparats, men passet kunde inte markeras klart. Försök igen eller uppdatera sidan om passet har ändrats.'
            : 'Ridpasset kunde inte loggas med dessa uppgifter. Försök igen eller uppdatera sidan om passet redan har loggats.',
        };
      } finally {
        pendingDataWrites.current.delete(writeKey);
      }
    },
    [ensurePermission, persistRideLogInsert, persistPlannedRideUpsert],
  );

  const upsertExternalContact = React.useCallback(
    async (input: UpsertExternalContactInput): Promise<ActionResult<ExternalContact>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageOnboarding || permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const name = input.name.trim();
      if (!name) {
        return { success: false, reason: 'Ange ett namn för kontakten.' };
      }
      const existing = input.id
        ? current.externalContacts.find((entry) => entry.id === input.id)
        : undefined;
      const id = existing?.id ?? input.id ?? generateId();
      const contact: ExternalContact = {
        id,
        stableId,
        name,
        type: input.type,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        note: input.note?.trim() || undefined,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      const key = `contact:${contact.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Kontakten sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistExternalContactUpsert(contact);
        if (!result.success) return result;
        dispatch({ type: 'EXTERNAL_CONTACT_UPSERT', payload: contact });
        return { success: true, data: contact };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistExternalContactUpsert],
  );

  const deleteExternalContact = React.useCallback(
    async (contactId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.externalContacts.find((entry) => entry.id === contactId);
      if (!existing) {
        return { success: false, reason: 'Kontakten kunde inte hittas.' };
      }
      const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageOnboarding || permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const key = `contact:${contactId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Kontakten sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistExternalContactDelete(contactId);
        if (!result.success) return result;
        dispatch({ type: 'EXTERNAL_CONTACT_DELETE', payload: { id: contactId } });
        return { success: true };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistExternalContactDelete],
  );

  const ensureCareEventAccess = React.useCallback(
    (stableId: string) =>
      ensurePermission(
        stableId,
        (permissions) => permissions.canManageCareEvents,
      ),
    [ensurePermission],
  );

  const createCareEvent = React.useCallback(
    async (input: CreateCareEventInput): Promise<ActionResult<CareEvent>> => {
      const current = stateRef.current;
      const stableId = input.stableId ?? current.currentStableId;
      const accessCheck = ensureCareEventAccess(stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const title = input.title.trim();
      if (!title) {
        return { success: false, reason: 'Vårdhändelsen behöver en titel.' };
      }
      if (!isValidISODate(input.date)) {
        return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      }
      if (input.time?.trim() && !isValidTime(input.time.trim())) {
        return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
      }
      if (!input.horseIds.length) {
        return { success: false, reason: 'Välj minst en häst.' };
      }
      const validHorseIds = input.horseIds.filter((horseId) =>
        current.horses.some((horse) => horse.id === horseId && horse.stableId === stableId),
      );
      if (!validHorseIds.length) {
        return { success: false, reason: 'Inga giltiga hästar valda.' };
      }
      const event: CareEvent = {
        id: input.requestId ?? generateId(),
        stableId,
        horseIds: validHorseIds,
        type: input.type,
        title,
        date: input.date,
        time: input.time?.trim() || undefined,
        contactId: input.contactId,
        responsibleUserId: input.responsibleUserId,
        status: 'planned',
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      const writeKey = `care-event:${event.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Vårdhändelsen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistCareEventUpsert(event);
        dispatch({ type: 'CARE_EVENT_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[care event create] Kunde inte spara vårdhändelse', error);
        return { success: false, reason: 'Vårdhändelsen kunde inte sparas. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensureCareEventAccess, persistCareEventUpsert],
  );

  const updateCareEvent = React.useCallback(
    async (input: UpdateCareEventInput): Promise<ActionResult<CareEvent>> => {
      const current = stateRef.current;
      const existing = current.careEvents.find((event) => event.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Vårdhändelsen kunde inte hittas.' };
      }
      const accessCheck = ensureCareEventAccess(existing.stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const next: CareEvent = { ...existing, ...input.updates };
      if (input.updates.status && (existing.status !== 'planned' || input.updates.status === 'done')) {
        return { success: false, reason: 'Vårdhändelsen har ändrats. Använd Slutför vård för att logga den.' };
      }
      if (!next.title?.trim()) return { success: false, reason: 'Vårdhändelsen behöver en titel.' };
      if (!isValidISODate(next.date)) return { success: false, reason: 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' };
      if (next.time?.trim() && !isValidTime(next.time.trim())) return { success: false, reason: 'Ange en giltig tid i formatet HH:MM (00:00–23:59).' };
      if (!next.horseIds.length || next.horseIds.some((id) => !current.horses.some((horse) => horse.id === id && horse.stableId === existing.stableId))) {
        return { success: false, reason: 'Välj giltiga hästar i stallet.' };
      }
      next.title = next.title.trim();
      next.time = next.time?.trim() || undefined;
      const writeKey = `care-event:${next.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Vårdhändelsen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistCareEventUpsert(next, existing, input.updates);
        dispatch({ type: 'CARE_EVENT_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[care event update] Kunde inte spara vårdhändelse', error);
        return { success: false, reason: 'Vårdhändelsen kunde inte sparas. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensureCareEventAccess, persistCareEventUpsert],
  );

  const deleteCareEvent = React.useCallback(
    async (careEventId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const existing = current.careEvents.find((event) => event.id === careEventId);
      if (!existing) {
        return { success: false, reason: 'Vårdhändelsen kunde inte hittas.' };
      }
      const accessCheck = ensureCareEventAccess(existing.stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const writeKey = `care-event:${existing.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Vårdhändelsen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        await persistCareEventDelete(existing);
        dispatch({ type: 'CARE_EVENT_DELETE', payload: { id: careEventId } });
        return { success: true };
      } catch (error) {
        console.warn('[care event delete] Kunde inte ta bort vårdhändelse', error);
        return { success: false, reason: 'Vårdhändelsen kunde inte tas bort. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensureCareEventAccess, persistCareEventDelete],
  );

  const completeCareEvent = React.useCallback(
    async (input: CompleteCareEventInput): Promise<ActionResult<CareEvent>> => {
      const current = stateRef.current;
      const existing = current.careEvents.find((event) => event.id === input.id);
      if (!existing) {
        return { success: false, reason: 'Vårdhändelsen kunde inte hittas.' };
      }
      const accessCheck = ensureCareEventAccess(existing.stableId);
      if (!accessCheck.success) {
        return accessCheck;
      }
      if (existing.status !== 'planned') {
        return { success: false, reason: 'Vårdhändelsen är redan klar eller avbokad. Uppdatera sidan.' };
      }
      const next: CareEvent = {
        ...existing,
        status: 'done',
        completedAt: new Date().toISOString(),
        note: input.note?.trim() || existing.note,
      };
      const writeKey = `care-event:${next.id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Vårdhändelsen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const saved = await persistCareEventUpsert(next, existing, { status: 'done', note: next.note, completedAt: next.completedAt });
        dispatch({ type: 'CARE_EVENT_UPSERT', payload: saved });
        return { success: true, data: saved };
      } catch (error) {
        console.warn('[care event complete] Kunde inte spara vårdhändelse', error);
        return { success: false, reason: 'Vårdhändelsen kunde inte sparas. Försök igen.' };
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensureCareEventAccess, persistCareEventUpsert],
  );

  const addPost = React.useCallback(
    async (input: CreatePostInput): Promise<ActionResult<Post>> => {
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
      const imagePath =
        input.image && !hasUriScheme(input.image) ? normalizePostImagePath(input.image) : undefined;
      const post: Post = {
        id: input.requestId ?? generateId(),
        authorId: current.currentUserId,
        author: user.name,
        avatar: user.avatar ?? require('@/assets/images/dummy-avatar.png'),
        timeAgo: 'Nu',
        createdAt: new Date().toISOString(),
        content,
        image: isQaDemoMode ? input.image : undefined,
        imageSignedUrl: isQaDemoMode ? input.image : undefined,
        imagePath: imagePath || undefined,
        likes: 0,
        comments: 0,
        likedByUserIds: [],
        commentsData: [],
        stableId,
        groupIds: groupIds.includes(defaultGroupId) ? groupIds : [defaultGroupId, ...groupIds],
      };
      const key = `post:${post.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Inlägget publiceras redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistPostInsert(post, input.image);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte inlägget. Försök igen.' };
        dispatch({ type: 'POST_ADD', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistPostInsert],
  );

  const togglePostLike = React.useCallback(
    async (postId: string): Promise<ActionResult> => {
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
      const enabled = !(post.likedByUserIds ?? []).includes(userId);
      const key = `post like:${postId}:${userId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Gillningen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistPostLikeToggle(post.id, userId, enabled);
        if (!result.success) return result;
        dispatch({ type: 'POST_LIKE_SET', payload: { postId, userId, enabled } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistPostLikeToggle],
  );

  const addPostComment = React.useCallback(
    async (postId: string, text: string, requestId?: string): Promise<ActionResult<PostComment>> => {
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
        id: requestId ?? generateId(),
        postId,
        authorId: current.currentUserId,
        authorName: author?.name ?? 'Okänd',
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      const key = `post comment:${postId}:${current.currentUserId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Kommentaren sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistPostCommentInsert(comment);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte kommentaren. Försök igen.' };
        dispatch({ type: 'POST_COMMENT_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistPostCommentInsert],
  );

  const deletePost = React.useCallback(
    async (postId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const postIndex = current.posts.findIndex((post) => post.id === postId);
      if (postIndex === -1) {
        return { success: false, reason: 'Inlägget kunde inte hittas.' };
      }
      const post = current.posts[postIndex];
      const userId = current.currentUserId;
      if (!userId) {
        return { success: false, reason: 'Ingen aktiv användare.' };
      }
      const membership = post.stableId
        ? current.users[userId]?.membership?.find((entry) => entry.stableId === post.stableId)
        : undefined;
      const isAdmin = membership?.role === 'admin' || membership?.access === 'owner';
      const isAuthor = post.authorId === userId;
      if (!isAuthor && !isAdmin) {
        return { success: false, reason: 'Du saknar behörighet att ta bort inlägget.' };
      }
      dispatch({ type: 'POST_DELETE', payload: { id: postId } });
      const { error } = await persistPostDelete(postId);
      if (error) {
        dispatch({ type: 'POST_RESTORE', payload: { post, index: postIndex } });
        return { success: false, reason: 'Kunde inte ta bort inlägget.' };
      }
      const imagePath = post.imagePath ?? '';
      if (imagePath) {
        invalidateSignedUrl(imagePath);
      }
      if (isAuthor && imagePath) {
        const { error: storageError } = await supabase
          .storage
          .from(POSTS_BUCKET)
          .remove([imagePath]);
        if (storageError) {
          console.warn('Kunde inte ta bort inläggsbild', storageError);
        }
      }
      return { success: true };
    },
    [persistPostDelete],
  );

  const reportPost = React.useCallback(
    async (postId: string, reason?: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const post = current.posts.find((entry) => entry.id === postId);
      if (!post) {
        return { success: false, reason: 'Inlägget kunde inte hittas.' };
      }
      const userId = current.currentUserId;
      if (!userId) {
        return { success: false, reason: 'Ingen aktiv användare.' };
      }
      if (isQaDemoMode) return { success: true };
      const { error } = await supabase.from('content_reports').insert({
        id: generateId(),
        stable_id: post.stableId ?? current.currentStableId,
        reporter_user_id: userId,
        target_type: 'post',
        target_id: postId,
        reason: reason?.trim() ? reason.trim() : null,
      });
      if (error) {
        reportPersistErrorRef.current('Kunde inte skicka rapport', error);
        return { success: false, reason: 'Kunde inte skicka rapporten.' };
      }
      return { success: true };
    },
    [],
  );

  const reportComment = React.useCallback(
    async (postId: string, commentId: string, reason?: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const post = current.posts.find((entry) => entry.id === postId);
      if (!post) {
        return { success: false, reason: 'Inlägget kunde inte hittas.' };
      }
      const userId = current.currentUserId;
      if (!userId) {
        return { success: false, reason: 'Ingen aktiv användare.' };
      }
      if (isQaDemoMode) return { success: true };
      const { error } = await supabase.from('content_reports').insert({
        id: generateId(),
        stable_id: post.stableId ?? current.currentStableId,
        reporter_user_id: userId,
        target_type: 'comment',
        target_id: commentId,
        reason: reason?.trim() ? reason.trim() : null,
      });
      if (error) {
        reportPersistErrorRef.current('Kunde inte skicka rapport', error);
        return { success: false, reason: 'Kunde inte skicka rapporten.' };
      }
      return { success: true };
    },
    [],
  );

  const fetchContentReports = React.useCallback(
    async (includeResolved = false): Promise<ActionResult<ContentReport[]>> => {
      const current = stateRef.current;
      const stableId = current.currentStableId;
      if (!stableId) {
        return { success: false, reason: 'Inget aktivt stall.' };
      }
      if (isQaDemoMode) return { success: true, data: [] };
      let query = supabase
        .from('content_reports')
        .select('id, stable_id, reporter_user_id, target_type, target_id, reason, created_at, resolved_at')
        .eq('stable_id', stableId)
        .order('created_at', { ascending: false });
      if (!includeResolved) {
        query = query.is('resolved_at', null);
      }
      const { data, error } = await query;
      if (error || !data) {
        return { success: false, reason: 'Kunde inte hämta rapporter.' };
      }
      const reports: ContentReport[] = data.map((row) => ({
        id: row.id,
        stableId: row.stable_id ?? null,
        reporterUserId: row.reporter_user_id ?? null,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason ?? null,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at ?? null,
      }));
      return { success: true, data: reports };
    },
    [],
  );

  const resolveContentReport = React.useCallback(
    async (reportId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      if (isQaDemoMode) return { success: true };
      const { error } = await supabase
        .from('content_reports')
        .update({ resolved_at: new Date().toISOString(), resolved_by_user_id: current.currentUserId })
        .eq('id', reportId);
      if (error) {
        reportPersistErrorRef.current('Kunde inte lösa rapport', error);
        return { success: false, reason: 'Kunde inte markera rapporten som löst.' };
      }
      return { success: true };
    },
    [],
  );

  const blockUser = React.useCallback(
    async (targetUserId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const userId = current.currentUserId;
      if (!userId) {
        return { success: false, reason: 'Ingen aktiv användare.' };
      }
      if (targetUserId === userId) {
        return { success: false, reason: 'Du kan inte blockera dig själv.' };
      }
      if (current.blockedUserIds.includes(targetUserId)) {
        return { success: true };
      }
      // Optimistic: hide their content immediately.
      const previous = current.blockedUserIds;
      dispatch({ type: 'STATE_HYDRATE', payload: { blockedUserIds: [...previous, targetUserId] } });
      if (isQaDemoMode) return { success: true };
      const { error } = await supabase.from('blocked_users').insert({
        id: generateId(),
        blocker_user_id: userId,
        blocked_user_id: targetUserId,
      });
      if (error) {
        // Roll back the optimistic update so UI never lies about a failed write.
        dispatch({ type: 'STATE_HYDRATE', payload: { blockedUserIds: previous } });
        reportPersistErrorRef.current('Kunde inte blockera användaren', error);
        return { success: false, reason: 'Kunde inte blockera användaren.' };
      }
      return { success: true };
    },
    [],
  );

  const unblockUser = React.useCallback(
    async (targetUserId: string): Promise<ActionResult> => {
      const current = stateRef.current;
      const userId = current.currentUserId;
      if (!userId) {
        return { success: false, reason: 'Ingen aktiv användare.' };
      }
      if (!current.blockedUserIds.includes(targetUserId)) {
        return { success: true };
      }
      const previous = current.blockedUserIds;
      dispatch({
        type: 'STATE_HYDRATE',
        payload: { blockedUserIds: previous.filter((id) => id !== targetUserId) },
      });
      if (isQaDemoMode) return { success: true };
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_user_id', userId)
        .eq('blocked_user_id', targetUserId);
      if (error) {
        dispatch({ type: 'STATE_HYDRATE', payload: { blockedUserIds: previous } });
        reportPersistErrorRef.current('Kunde inte häva blockeringen', error);
        return { success: false, reason: 'Kunde inte häva blockeringen.' };
      }
      return { success: true };
    },
    [],
  );

  const loadMorePosts = React.useCallback(async (): Promise<ActionResult> => {
    const current = stateRef.current;
    const stableId = current.currentStableId;
    if (!stableId) {
      return { success: false, reason: 'Inget aktivt stall.' };
    }
    if (current.postsLoadingMore || !current.postsHasMore) {
      return { success: true };
    }
    const cursor = current.postsCursor;
    if (!cursor) {
      return { success: true };
    }

    dispatch({
      type: 'STATE_HYDRATE',
      payload: { postsLoadingMore: true, postsLoadError: null },
    });

    try {
      let query = supabase
        .from('posts')
        .select('*')
        .eq('stable_id', stableId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(POSTS_PAGE_SIZE);
      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }
      const { data, error } = await query;
      if (error) {
        console.warn('Kunde inte ladda fler inlägg', error);
        dispatch({
          type: 'STATE_HYDRATE',
          payload: { postsLoadingMore: false, postsLoadError: 'Kunde inte ladda fler inlägg.' },
        });
        return { success: false, reason: 'Kunde inte ladda fler inlägg.' };
      }

      const postRows = data ?? [];
      if (!postRows.length) {
        dispatch({
          type: 'STATE_HYDRATE',
          payload: { postsLoadingMore: false, postsHasMore: false },
        });
        return { success: true };
      }

      const existingIds = new Set(current.posts.map((post) => post.id));
      const newPostRows = postRows.filter((post) => !existingIds.has(post.id));
      const nextCursor = resolvePostsCursor(postRows);
      const hasMore = postRows.length === POSTS_PAGE_SIZE;
      if (!newPostRows.length) {
        dispatch({
          type: 'STATE_HYDRATE',
          payload: {
            postsCursor: nextCursor,
            postsHasMore: hasMore,
            postsLoadingMore: false,
            postsLoadError: null,
          },
        });
        return { success: true };
      }

      const postIds = newPostRows.map((post) => post.id);
      const [likesResult, commentsResult] = await Promise.all([
        postIds.length ? supabase.from('likes').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from('comments').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
      ]);
      const likes = likesResult.data ?? [];
      const comments = commentsResult.data ?? [];

      const commentsByPost = comments.reduce<Record<string, PostComment[]>>((acc, comment) => {
        const list = acc[comment.post_id] ?? [];
        const authorProfile = current.users[comment.user_id];
        list.push({
          id: comment.id.toString(),
          postId: comment.post_id,
          authorId: comment.user_id,
          authorName: authorProfile?.name ?? 'Okänd',
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

      const formattedPosts = await Promise.all(
        newPostRows.map(async (post) => {
          const authorProfile = current.users[post.user_id];
          const likedByUserIds = likedByPost[post.id] ?? [];
          const commentsData = commentsByPost[post.id] ?? [];
          const rawImage = post.image_url ?? null;
          const normalizedPath = normalizePostImagePath(rawImage);
          if (!normalizedPath && rawImage && rawImage.trim()) {
            const lower = rawImage.trim().toLowerCase();
            if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) {
              warnLegacyPostImageUrl(post.id, rawImage);
            }
          }
          const imageSignedUrl = normalizedPath ? await getSignedPostImageUrl(normalizedPath) : undefined;
          return {
            id: post.id,
            authorId: post.user_id,
            author: authorProfile?.name ?? 'Okänd',
            avatar: authorProfile?.avatar ?? require('@/assets/images/dummy-avatar.png'),
            timeAgo: 'Nu',
            createdAt: post.created_at,
            content: post.content ?? post.caption ?? '',
            imageSignedUrl,
            image: imageSignedUrl,
            imagePath: normalizedPath || undefined,
            likes: likedByUserIds.length,
            comments: commentsData.length,
            likedByUserIds,
            commentsData,
            stableId: post.stable_id ?? undefined,
            groupIds: post.group_ids ?? undefined,
          } as Post;
        }),
      );

      const nextPosts = [...current.posts, ...formattedPosts];
      dispatch({
        type: 'STATE_HYDRATE',
        payload: {
          posts: nextPosts,
          postsCursor: nextCursor,
          postsHasMore: hasMore,
          postsLoadingMore: false,
          postsLoadError: null,
        },
      });
      return { success: true };
    } catch (error) {
      console.warn('Kunde inte ladda fler inlägg', error);
      dispatch({
        type: 'STATE_HYDRATE',
        payload: { postsLoadingMore: false, postsLoadError: 'Kunde inte ladda fler inlägg.' },
      });
      return { success: false, reason: 'Kunde inte ladda fler inlägg.' };
    }
  }, []);

  const createGroup = React.useCallback(
    async (input: CreateGroupInput): Promise<ActionResult<Group>> => {
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
        id: input.requestId ?? generateId(),
        name,
        type: 'custom',
        stableId,
        createdAt: new Date().toISOString(),
        createdByUserId: current.currentUserId,
      };
      const key = `group:${group.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Gruppen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistGroupInsert(group);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte gruppen.' };
        if (stateRef.current.groups.some((entry) => entry.id === group.id)) {
          dispatch({ type: 'GROUP_UPDATE', payload: { id: group.id, updates: result.data } });
        } else {
          dispatch({ type: 'GROUP_ADD', payload: result.data });
        }
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistGroupInsert],
  );

  const renameGroup = React.useCallback(
    async (input: RenameGroupInput): Promise<ActionResult<Group>> => {
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
      const key = `group:${input.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Gruppen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistGroupUpdate(input.id, { name }, stableId);
        if (!result.success) return result;
        dispatch({ type: 'GROUP_UPDATE', payload: { id: input.id, updates: { name } } });
        return { success: true, data: { ...existing, name } };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistGroupUpdate],
  );

  const deleteGroup = React.useCallback(
    async (groupId: string): Promise<ActionResult> => {
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
      const key = `group:${groupId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Gruppen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistGroupDelete(groupId, stableId);
        if (!result.success) return result;
        dispatch({ type: 'GROUP_DELETE', payload: { id: groupId } });
        return { success: true };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistGroupDelete],
  );

  const setCurrentStable = React.useCallback((stableId: string) => {
    refreshRequestId.current += 1;
    setHydrating(false);
    setRefreshing(false);
    dispatch({ type: 'STABLE_SET', payload: { stableId } });
    void refreshData({ stableId, reason: 'switch' });
  }, [refreshData]);

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
      void trackDataWrite(persistProfileUpdate(userId, { onboarding_dismissed: dismissed }));
      return { success: true, data: { ...profile, onboardingDismissed: dismissed } };
    },
    [trackDataWrite, persistProfileUpdate],
  );

  React.useEffect(() => {
    const current = stateRef.current;
    const profile = current.users[current.currentUserId];
    if (!profile || profile.onboardingDismissed) {
      return;
    }
    if (derived.onboardingComplete) {
      setOnboardingDismissed(true);
    }
  }, [derived.onboardingComplete, setOnboardingDismissed]);

  const updateProfile = React.useCallback(
    async (input: UpdateProfileInput): Promise<ActionResult<UserProfile>> => {
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

      const key = `profile:${userId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Profilen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistProfileUpdate(userId, payload);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte profilen. Försök igen.' };
        const saved: Partial<UserProfile> = {
          ...('name' in updates ? { name: String(result.data.full_name ?? '') } : {}),
          ...('phone' in updates ? { phone: String(result.data.phone ?? '') } : {}),
          ...('location' in updates ? { location: String(result.data.location ?? '') } : {}),
        };
        dispatch({ type: 'USER_UPDATE', payload: { id: userId, updates: saved } });
        return { success: true, data: { ...profile, ...saved } };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [persistProfileUpdate],
  );

  const upsertFarm = React.useCallback(
    async (input: UpsertFarmInput, options?: PersistOptions): Promise<ActionResult<Farm>> => {
      const current = stateRef.current;
      if (!options?.skipPermission) {
        const accessCheck = ensurePermission(
          input.accessStableId ?? current.currentStableId,
          (permissions) => permissions.canManageOnboarding,
        );
        if (!accessCheck.success) {
          return accessCheck;
        }
      }
      if (!user?.id) {
        return { success: false, reason: 'Du måste logga in igen.' };
      }
      const existing = input.id ? current.farms.find((farm) => farm.id === input.id) : undefined;
      const name = input.name === undefined ? existing?.name ?? '' : input.name.trim();
      if (!name) {
        return { success: false, reason: 'Gården måste ha ett namn.' };
      }
      const id = input.id ?? input.requestId ?? generateId();
      const farm: Farm = {
        id,
        name,
        location: Object.prototype.hasOwnProperty.call(input, 'location') ? input.location?.trim() || undefined : existing?.location,
        hasIndoorArena: input.hasIndoorArena ?? existing?.hasIndoorArena,
        arenaNote: Object.prototype.hasOwnProperty.call(input, 'arenaNote') ? input.arenaNote?.trim() || undefined : existing?.arenaNote,
      };
      const key = `farm:${id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Gården sparas redan. Vänta och försök igen.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = options?.skipPersist ? { success: true as const, data: farm }
          : await persistFarmUpsert(farm, input, Boolean(existing));
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte gården. Försök igen.' };
        dispatch({ type: 'FARM_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistFarmUpsert, user],
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
    void trackDataWrite(persistFarmDelete(farmId));
    return { success: true };
  }, [trackDataWrite, ensurePermission, persistFarmDelete]);

  const upsertStable = React.useCallback(
    async (input: UpsertStableInput, options?: PersistOptions): Promise<ActionResult<Stable>> => {
      const current = stateRef.current;
      if (!options?.skipPermission) {
        const accessCheck = ensurePermission(
          input.id ?? current.currentStableId,
          (permissions) => permissions.canManageOnboarding,
        );
        if (!accessCheck.success) {
          return accessCheck;
        }
      }
      const ownerId = user?.id ?? current.currentUserId;
      if (!ownerId) {
        return { success: false, reason: 'Du måste logga in igen.' };
      }
      const id = input.id ?? input.requestId ?? generateId();
      const existing = input.id ? current.stables.find((stable) => stable.id === input.id) : undefined;
      const baseSettings = existing ? resolveStableSettings(existing) : createDefaultStableSettings();
      const settingsUpdates = input.settings;
      const nextSettings = settingsUpdates
        ? {
            dayLogic: settingsUpdates.dayLogic ?? baseSettings.dayLogic,
            eventVisibility: {
              ...baseSettings.eventVisibility,
              ...(settingsUpdates.eventVisibility ?? {}),
            },
            arena: {
              ...baseSettings.arena,
              ...(settingsUpdates.arena ?? {}),
            },
            onboarding: {
              ...baseSettings.onboarding,
              ...(settingsUpdates.onboarding ?? {}),
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

      const writeKey = `stable:${id}`;
      if (pendingDataWrites.current.has(writeKey)) return { success: false, reason: 'Stallet sparas redan. Vänta och försök igen.' };
      pendingDataWrites.current.add(writeKey);
      dataWriteVersion.current += 1;
      try {
        const result = options?.skipPersist ? { success: true as const, data: stable }
          : await persistStableUpsert(stable, !existing, ownerId, input);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte stallet. Försök igen.' };
        dispatch({ type: 'STABLE_UPSERT', payload: result.data });

        // Owner membership is visible locally only after the server confirmed it.
        const currentUserProfile = stateRef.current.users[current.currentUserId];
        if (currentUserProfile && !currentUserProfile.membership.some((m) => m.stableId === stable.id)) {
          dispatch({
            type: 'USER_UPDATE',
            payload: {
              id: currentUserProfile.id,
              updates: {
                membership: [
                  ...currentUserProfile.membership,
                  { stableId: stable.id, role: 'admin', access: 'owner' },
                ],
              },
            },
          });
        }

        return result;
      } finally { pendingDataWrites.current.delete(writeKey); }
    },
    [ensurePermission, persistStableUpsert, user],
  );

  const updateStable = React.useCallback(
    async (input: { id: string; updates: StableUpdates }, options?: PersistOptions): Promise<ActionResult<Stable>> => {
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
      const { settings: settingsUpdates, ...restUpdates } = input.updates;
      const mergedSettings = settingsUpdates
        ? {
            dayLogic: settingsUpdates.dayLogic ?? baseSettings.dayLogic,
            eventVisibility: {
              ...baseSettings.eventVisibility,
              ...(settingsUpdates.eventVisibility ?? {}),
            },
            arena: {
              ...baseSettings.arena,
              ...(settingsUpdates.arena ?? {}),
            },
            onboarding: {
              ...baseSettings.onboarding,
              ...(settingsUpdates.onboarding ?? {}),
            },
          }
        : existing.settings;
      const updates: Partial<Stable> = settingsUpdates
        ? { ...restUpdates, settings: mergedSettings }
        : restUpdates;
      const updated: Stable = { ...existing, ...updates };
      if (!updated.name.trim()) {
        return { success: false, reason: 'Stallet måste ha ett namn.' };
      }
      const key = `stable:${input.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Stallet sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = options?.skipPersist ? { success: true as const, data: updated }
          : await persistStableUpdate(input.id, updates, existing);
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte stalluppgifterna.' };
        dispatch({ type: 'STABLE_UPDATE', payload: { id: input.id, updates: result.data } });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
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
    void trackDataWrite(persistStableDelete(stableId));
    return { success: true };
  }, [trackDataWrite, ensurePermission, persistStableDelete]);

  const upsertHorse = React.useCallback(
    async (input: UpsertHorseInput): Promise<ActionResult<Horse>> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageHorses);
      if (!accessCheck.success) return accessCheck;
      const existing = input.id ? stateRef.current.horses.find((horse) => horse.id === input.id) : undefined;
      const name = (input.name ?? existing?.name ?? '').trim();
      if (!name) return { success: false, reason: 'Hästen måste ha ett namn.' };
      if (input.age !== undefined && (!Number.isInteger(input.age) || input.age < 0 || input.age > 60)) {
        return { success: false, reason: 'Ange en ålder i hela år mellan 0 och 60.' };
      }
      if (existing && existing.stableId !== input.stableId) return { success: false, reason: 'Hästen tillhör ett annat stall.' };
      const horse: Horse = {
        ...existing, ...input, id: input.id ?? generateId(), name,
        image: 'image' in input ? input.image ?? undefined : existing?.image,
        boxNumber: 'boxNumber' in input ? input.boxNumber?.trim() || undefined : existing?.boxNumber,
        note: 'note' in input ? input.note?.trim() || undefined : existing?.note,
      };
      const key = `horse:${horse.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Hästen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistHorseUpsert(horse, input, Boolean(existing));
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte hästen. Försök igen.' };
        dispatch({ type: 'HORSE_UPSERT', payload: result.data });
        return result;
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistHorseUpsert],
  );

  const deleteHorse = React.useCallback(async (horseId: string): Promise<ActionResult> => {
    const current = stateRef.current;
    const existing = current.horses.find((horse) => horse.id === horseId);
    if (!existing) {
      return { success: false, reason: 'Hästen kunde inte hittas.' };
    }
    const accessCheck = ensurePermission(existing.stableId, (permissions) => permissions.canManageHorses);
    if (!accessCheck.success) {
      return accessCheck;
    }
    const key = `horse:${horseId}`;
    if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Hästen sparas redan. Vänta ett ögonblick.' };
    pendingDataWrites.current.add(key);
    dataWriteVersion.current += 1;
    try {
      const result = await persistHorseDelete(existing);
      if (!result.success) return result;
      dispatch({ type: 'HORSE_DELETE', payload: { id: horseId } });
      return { success: true };
    } finally { pendingDataWrites.current.delete(key); }
  }, [ensurePermission, persistHorseDelete]);

  const addMember = React.useCallback(
    async (input: AddMemberInput): Promise<ActionResult<InviteConfirmation>> => {
      const stableIds = Array.from(new Set(input.stableIds ?? [input.stableId])).filter(Boolean);
      if (!stableIds.length || !stableIds.includes(input.stableId)) {
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, reason: 'Ange en giltig e-postadress.' };
      }
      const key = `invite:${JSON.stringify([email.toLowerCase(), stableIds])}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Inbjudan skapas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        return await persistStableInvite(input, stableIds);
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistStableInvite],
  );

  // An owner = admin role with owner access (matches is_stable_owner in RLS).
  // Reads last-rendered state via stateRef, so it assumes sequential user actions
  // (a re-render happens between promoting a new owner and demoting the old one).
  // A two-step transfer fired in a single synchronous tick is not a real UI flow.
  // This client snapshot cannot enforce the last-owner invariant across phones;
  // atomic protection requires a database constraint or transaction.
  const countStableOwners = React.useCallback((stableId: string) => {
    const current = stateRef.current;
    return Object.values(current.users).filter((u) =>
      u.membership?.some(
        (e) => e.stableId === stableId && e.role === 'admin' && (e.access ?? 'view') === 'owner',
      ),
    ).length;
  }, []);

  const updateMemberRole = React.useCallback(
    async (input: UpdateMemberRoleInput): Promise<ActionResult<UserProfile>> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      // Guard against demoting the last owner — would lock the stable out of administration.
      const currentEntry = user.membership.find((entry) => entry.stableId === input.stableId);
      if (!currentEntry) return { success: false, reason: 'Medlemmen är inte kopplad till stallet.' };
      const wasOwner =
        currentEntry?.role === 'admin' && (currentEntry.access ?? 'view') === 'owner';
      const nextAccess =
        input.access ??
        (input.role === 'admin' ? 'owner' : input.role === 'staff' ? 'edit' : currentEntry?.access ?? 'view');
      const staysOwner = input.role === 'admin' && nextAccess === 'owner';
      if (wasOwner && !staysOwner && countStableOwners(input.stableId) <= 1) {
        return {
          success: false,
          reason: 'Stallet måste ha minst en ägare. Utse en ny ägare först.',
        };
      }
      const key = `member:${input.stableId}:${user.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Medlemmen uppdateras redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistStableMemberUpdate(input.stableId, user.id, {
          role: input.role,
          access: nextAccess,
          riderRole: input.role === 'rider' ? input.riderRole ?? currentEntry.riderRole ?? 'medryttare' : undefined,
          ...('customRole' in input ? { customRole: input.customRole?.trim() || undefined } : {}),
          ...('horseIds' in input ? { horseIds: input.horseIds } : {}),
        });
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte medlemsändringen.' };
        const latestUser = stateRef.current.users[user.id] ?? user;
        const membership = latestUser.membership.map((entry) => entry.stableId === input.stableId ? result.data! : entry);
        dispatch({ type: 'USER_UPDATE', payload: { id: user.id, updates: { membership } } });
        return { success: true, data: { ...latestUser, membership } };
      } finally {
        pendingDataWrites.current.delete(key);
      }
    },
    [ensurePermission, persistStableMemberUpdate, countStableOwners],
  );

  const updateMemberHorseIds = React.useCallback(
    async (input: UpdateMemberHorseIdsInput): Promise<ActionResult<UserProfile>> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const hasMembership = user.membership.some((entry) => entry.stableId === input.stableId);
      if (!hasMembership) {
        return { success: false, reason: 'Medlemmen är inte kopplad till stallet.' };
      }
      const key = `member:${input.stableId}:${user.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Medlemmen uppdateras redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistStableMemberUpdate(input.stableId, user.id, { horseIds: input.horseIds });
        if (!result.success) return result;
        if (!result.data) return { success: false, reason: 'Servern bekräftade inte hästkopplingen.' };
        const latestUser = stateRef.current.users[user.id] ?? user;
        const membership = latestUser.membership.map((entry) => entry.stableId === input.stableId ? result.data! : entry);
        dispatch({ type: 'USER_UPDATE', payload: { id: user.id, updates: { membership } } });
        return { success: true, data: { ...latestUser, membership } };
      } finally {
        pendingDataWrites.current.delete(key);
      }
    },
    [ensurePermission, persistStableMemberUpdate],
  );

  const toggleMemberDefaultPass = React.useCallback(
    async (input: ToggleMemberDefaultPassInput): Promise<ActionResult<UserProfile>> => {
      const accessCheck = ensurePermission(input.stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[input.userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      const stableId = input.stableId;
      const weekday = input.weekday;
      const slot = input.slot;
      const exists = user.defaultPasses.some(
        (entry) => entry.weekday === input.weekday && entry.slot === input.slot,
      );
      const nextDefaultPasses = exists
        ? user.defaultPasses.filter(
            (entry) => !(entry.weekday === input.weekday && entry.slot === input.slot),
          )
        : [...user.defaultPasses, { weekday: input.weekday, slot: input.slot }];

      if (stableId && defaultPassesStableId.current !== stableId) return { success: false, reason: 'Standardpassen för stallet hämtas fortfarande. Vänta ett ögonblick.' };
      const key = `default:${stableId}:${user.id}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Standardpassen sparas redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        if (!stableId) {
          if (!(await saveDefaultPassDraft(user.id, nextDefaultPasses))) return { success: false, reason: 'Standardpassen kunde inte sparas på telefonen. Försök igen.' };
        } else {
          const result = await persistDefaultPassToggle({ userId: user.id, stableId, weekday, slot, enabled: !exists });
          if (!result.success) return result;
        }
        // These preferences in state always belong to the currently selected stable.
        if (stateRef.current.currentStableId === stableId) {
          const latest = stateRef.current.users[user.id] ?? user;
          const remaining = latest.defaultPasses.filter(entry => !(entry.weekday === weekday && entry.slot === slot));
          const saved = exists ? remaining : [...remaining, { weekday, slot }];
          dispatch({ type: 'USER_UPDATE', payload: { id: user.id, updates: { defaultPasses: saved } } });
          return { success: true, data: { ...latest, defaultPasses: saved } };
        }
        return { success: true, data: user };
      } finally { pendingDataWrites.current.delete(key); }
    },
    [ensurePermission, persistDefaultPassToggle],
  );

  const removeMemberFromStable = React.useCallback(
    async (userId: string, stableId: string): Promise<ActionResult<UserProfile>> => {
      const accessCheck = ensurePermission(stableId, (permissions) => permissions.canManageMembers);
      if (!accessCheck.success) {
        return accessCheck;
      }
      const current = stateRef.current;
      const user = current.users[userId];
      if (!user) {
        return { success: false, reason: 'Användaren hittades inte.' };
      }
      // Guard against removing the last owner — would lock the stable out of administration.
      const targetEntry = user.membership.find((entry) => entry.stableId === stableId);
      if (!targetEntry) return { success: false, reason: 'Medlemmen är inte kopplad till stallet.' };
      const targetIsOwner =
        targetEntry?.role === 'admin' && (targetEntry.access ?? 'view') === 'owner';
      if (targetIsOwner && countStableOwners(stableId) <= 1) {
        return {
          success: false,
          reason: 'Stallet måste ha minst en ägare. Utse en ny ägare innan du tar bort denna.',
        };
      }
      const key = `member:${stableId}:${userId}`;
      if (pendingDataWrites.current.has(key)) return { success: false, reason: 'Medlemmen uppdateras redan. Vänta ett ögonblick.' };
      pendingDataWrites.current.add(key);
      dataWriteVersion.current += 1;
      try {
        const result = await persistStableMemberDelete(stableId, userId);
        if (!result.success) return result;
        const latestUser = stateRef.current.users[userId] ?? user;
        const membership = latestUser.membership.filter((entry) => entry.stableId !== stableId);
        dispatch({ type: 'USER_UPDATE', payload: { id: userId, updates: { membership } } });
        pendingDataWrites.current.delete(key);
        if (userId === current.currentUserId) await refreshData({ reason: 'leave' });
        return { success: true, data: { ...latestUser, membership } };
      } finally {
        pendingDataWrites.current.delete(key);
      }
    },
    [ensurePermission, persistStableMemberDelete, refreshData, countStableOwners],
  );

  const joinStableByCode = React.useCallback(
    async (code: string): Promise<ActionResult<{ stableId: string }>> => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        return { success: false, reason: 'Ange en giltig inbjudningskod.' };
      }
      const extractStableId = (value: unknown): string | null => {
        if (!value) {
          return null;
        }
        if (typeof value === 'string') {
          return value;
        }
        if (Array.isArray(value)) {
          return extractStableId(value[0]);
        }
        if (typeof value === 'object') {
          const record = value as Record<string, unknown>;
          const candidate = record.stableId ?? record.stable_id ?? record.id;
          return typeof candidate === 'string' ? candidate : null;
        }
        return null;
      };
      const { data, error } = await supabase.rpc('accept_join_code', { p_code: trimmed });
      const stableId = extractStableId(data);
      if (error || !stableId) {
        console.warn('Kunde inte använda inbjudningskod', error);
        return { success: false, reason: 'Inbjudningskoden är ogiltig.' };
      }
      return { success: true, data: { stableId } };
    },
    [],
  );

  const acceptPendingInvites = React.useCallback(
    async (): Promise<ActionResult<{ count: number }>> => {
      const { data, error } = await supabase.rpc('accept_pending_invites');
      if (error) {
        console.warn('Kunde inte acceptera inbjudningar', error);
        return { success: false, reason: 'Kunde inte acceptera inbjudningar.' };
      }
      const count = typeof data === 'number' ? data : 0;
      if (count <= 0) {
        return { success: false, reason: 'Ingen inbjudan hittades.' };
      }
      return { success: true, data: { count } };
    },
    [],
  );

  const value = React.useMemo<AppDataContextValue>(
    () => ({
      state,
      hydrating,
      refreshing,
      refreshError,
      lastRefreshedAt,
      derived,
      actions: {
        logNextAssignment,
        claimNextOpenAssignment,
        claimAssignment,
        declineAssignment,
        completeAssignment,
        createAssignment,
        createRecurringAssignments,
        updateAssignment,
        deleteAssignment,
        addEvent,
        createStableAlert,
        resolveStableAlert,
        toggleDefaultPass,
        upsertPaddock,
        deletePaddock,
        updateHorseDayStatus,
        upsertFeedPlan,
        deleteFeedPlan,
        upsertFeedCheck,
        addDayEvent,
        removeDayEvent,
        addArenaBooking,
        updateArenaBooking,
        removeArenaBooking,
        addArenaStatus,
        removeArenaStatus,
        addRideLog,
        removeRideLog,
        createPlannedRide,
        updatePlannedRide,
        deletePlannedRide,
        completePlannedRide,
        upsertExternalContact,
        deleteExternalContact,
        createCareEvent,
        updateCareEvent,
        deleteCareEvent,
        completeCareEvent,
        addPost,
        togglePostLike,
        addPostComment,
        deletePost,
        reportPost,
        reportComment,
        fetchContentReports,
        resolveContentReport,
        blockUser,
        unblockUser,
        loadMorePosts,
        createGroup,
        renameGroup,
        deleteGroup,
        markConversationRead,
        sendConversationMessage,
        createPrivateConversation,
        setCurrentStable,
        refreshData,
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
        joinStableByCode,
        acceptPendingInvites,
      },
    }),
    [
      state,
      hydrating,
      refreshing,
      refreshError,
      lastRefreshedAt,
      derived,
      logNextAssignment,
      claimNextOpenAssignment,
      claimAssignment,
      declineAssignment,
      completeAssignment,
      createAssignment,
      createRecurringAssignments,
      updateAssignment,
      deleteAssignment,
      addEvent,
      createStableAlert,
      resolveStableAlert,
      toggleDefaultPass,
      upsertPaddock,
      deletePaddock,
      updateHorseDayStatus,
      upsertFeedPlan,
      deleteFeedPlan,
      upsertFeedCheck,
      addDayEvent,
      removeDayEvent,
      addArenaBooking,
      updateArenaBooking,
      removeArenaBooking,
      addArenaStatus,
      removeArenaStatus,
      addRideLog,
      removeRideLog,
      createPlannedRide,
      updatePlannedRide,
      deletePlannedRide,
      completePlannedRide,
      upsertExternalContact,
      deleteExternalContact,
      createCareEvent,
      updateCareEvent,
      deleteCareEvent,
      completeCareEvent,
      addPost,
      togglePostLike,
      addPostComment,
      deletePost,
      reportPost,
      reportComment,
      fetchContentReports,
      resolveContentReport,
      blockUser,
      unblockUser,
      loadMorePosts,
      createGroup,
      renameGroup,
      deleteGroup,
      markConversationRead,
      sendConversationMessage,
      createPrivateConversation,
      setCurrentStable,
      refreshData,
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
      joinStableByCode,
      acceptPendingInvites,
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
