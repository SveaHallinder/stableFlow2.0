import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { navigatorLock, processLock } from '@supabase/supabase-js';
import { authStorageKey, supabase } from './supabase';
import { readOwnAccountMediaStatus, type AccountMediaStatus } from './accountMedia';

export type AccountDeletionPlan = {
  version: 1;
  userId: string;
  ownerId: string | null;
  attempts: number;
  mediaGeneration?: string;
  mediaPlanId?: string;
  mediaReselect?: { planId: string; expectedGeneration: string; expectedOwner: string | null; nextGeneration: string; nextOwner: string };

};
export type AccountDeletionStatus = {
  media?: AccountMediaStatus;
  user_id: string;
  status: 'not_started' | 'pending' | 'deleted' | 'unconfirmed';
  auth_present: boolean;
  profile_present: boolean;
  requires_owner: boolean;
  affected_stable_count: number;
  replacement_owners: { user_id: string; display_name: string }[];
  replacement_user_id: string | null;
  prepared_at: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (userId: string) => `${authStorageKey}-deletion-plan-${userId}`;
const storage = {
  get: (name: string) => Platform.OS === 'web' ? globalThis.localStorage.getItem(name) : SecureStore.getItemAsync(name),
  set: (name: string, value: string) => Platform.OS === 'web' ? globalThis.localStorage.setItem(name, value) : SecureStore.setItemAsync(name, value),
};
const lock = Platform.OS === 'web' && globalThis.navigator?.locks ? navigatorLock : processLock;
async function withPlanLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  if (Platform.OS === 'web' && !globalThis.navigator?.locks) {
    throw new Error('Account deletion durable browser lock is unavailable.');
  }
  const result = await lock(`deletion-plan:${key(userId)}`, 5_000, async () => {
    try { return { ok: true as const, value: await operation() }; }
    catch (error) { return { ok: false as const, error }; }
  });
  if (!result.ok) throw result.error;
  return result.value;
}

// Durable UID/project-scoped choice before dispatch, with no in-memory fallback.
// A missing receipt never cancels a possibly late request or unlocks this choice.
export async function readAccountDeletionPlan(userId: string): Promise<AccountDeletionPlan | null> {
  if (!uuid.test(userId)) throw new Error('Account deletion identity is invalid.');
  const value = await storage.get(key(userId));
  if (value === null) return null;
  const plan = JSON.parse(value) as AccountDeletionPlan;
  if (plan?.version !== 1 || plan.userId !== userId ||
    (plan.ownerId !== null && (typeof plan.ownerId !== 'string' || !uuid.test(plan.ownerId))) ||
    !Number.isInteger(plan.attempts) || plan.attempts < 0 || plan.attempts > 3
    || (plan.mediaGeneration !== undefined && !uuid.test(plan.mediaGeneration)) || (plan.mediaPlanId !== undefined && !uuid.test(plan.mediaPlanId))
    || (plan.mediaReselect && (!uuid.test(plan.mediaReselect.planId) || !uuid.test(plan.mediaReselect.expectedGeneration)
      || !uuid.test(plan.mediaReselect.nextGeneration) || !uuid.test(plan.mediaReselect.nextOwner)
      || (plan.mediaReselect.expectedOwner !== null && !uuid.test(plan.mediaReselect.expectedOwner)))) ) {
    throw new Error('Account deletion plan could not be verified.');
  }
  return plan;
}

export async function persistAccountDeletionPlan(userId: string, ownerId: string | null): Promise<AccountDeletionPlan> {
  if (ownerId !== null && (!uuid.test(ownerId) || ownerId === userId)) throw new Error('Account deletion owner is invalid.');
  return withPlanLock(userId, async () => {
    const existing = await readAccountDeletionPlan(userId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new Error('Account deletion owner is already fixed.');
      return existing;
    }
    const plan: AccountDeletionPlan = { version: 1, userId, ownerId, attempts: 0 };
    await storage.set(key(userId), JSON.stringify(plan));
    const confirmed = await readAccountDeletionPlan(userId);
    if (confirmed?.ownerId !== ownerId || confirmed.attempts !== 0) throw new Error('Account deletion plan was not saved.');
    return confirmed;
  });
}

// Exact durable nonce before first media dispatch; no memory fallback or owner reset.
export async function persistAccountMediaJournal(userId: string, ownerId: string | null, generation: string): Promise<AccountDeletionPlan> {
  if (!uuid.test(generation)) throw new Error('Account media generation is invalid.');
  await persistAccountDeletionPlan(userId, ownerId);
  return withPlanLock(userId, async () => {
    const old = await readAccountDeletionPlan(userId);
    if (!old || old.ownerId !== ownerId || old.mediaReselect || (old.mediaGeneration && old.mediaGeneration !== generation)) throw new Error('Account media journal changed.');
    const next = { ...old, mediaGeneration: generation };
    await storage.set(key(userId), JSON.stringify(next));
    const saved = await readAccountDeletionPlan(userId);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('Account media journal was not saved.');
    return saved;
  });
}
export async function persistAccountMediaReselect(userId: string, request: NonNullable<AccountDeletionPlan['mediaReselect']>): Promise<AccountDeletionPlan> {
  return withPlanLock(userId, async () => {
    const old = await readAccountDeletionPlan(userId);
    if (!old || old.attempts !== 0 || old.mediaGeneration !== request.expectedGeneration || old.ownerId !== request.expectedOwner
      || (old.mediaReselect && JSON.stringify(old.mediaReselect) !== JSON.stringify(request))) throw new Error('Account media owner change is not safe.');
    const next = { ...old, mediaReselect: { ...request } };
    await storage.set(key(userId), JSON.stringify(next));
    const saved = await readAccountDeletionPlan(userId);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('Account media owner change was not saved.');
    return saved;
  });
}
export async function reconcileAccountMediaJournal(userId: string, media: AccountMediaStatus): Promise<AccountDeletionPlan | null> {
  if (media.user_id !== userId || media.complete !== true) throw new Error('Account media identity receipt is invalid.');
  return withPlanLock(userId, async () => {
    const old = await readAccountDeletionPlan(userId);
    if (!media.own.plan_id || !media.own.plan_generation) return old;
    if (old?.mediaReselect) {
      const change = old.mediaReselect;
      if (media.own.plan_id !== change.planId) throw new Error('Account media plan receipt changed.');
      if (media.own.plan_generation === change.expectedGeneration && media.own.replacement_user_id === change.expectedOwner) return old;
      if (media.own.plan_generation !== change.nextGeneration || media.own.replacement_user_id !== change.nextOwner || old.attempts !== 0) throw new Error('Account media owner receipt is unconfirmed.');
      const next: AccountDeletionPlan = { version: 1, userId, ownerId: change.nextOwner, attempts: 0, mediaGeneration: change.nextGeneration, mediaPlanId: change.planId };
      await storage.set(key(userId), JSON.stringify(next));
      const saved = await readAccountDeletionPlan(userId);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('Account media owner receipt was not saved.');
      return saved;
    }
    if (old && (old.ownerId !== media.own.replacement_user_id || (old.mediaGeneration && old.mediaGeneration !== media.own.plan_generation))) throw new Error('Account media journal and server receipt differ.');
    const next: AccountDeletionPlan = { ...(old ?? { version: 1, userId, attempts: 0 }), ownerId: media.own.replacement_user_id, mediaGeneration: media.own.plan_generation, mediaPlanId: media.own.plan_id };
    await storage.set(key(userId), JSON.stringify(next));
    const saved = await readAccountDeletionPlan(userId);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('Account media plan receipt was not saved.');
    return saved;
  });
}

export async function reserveAccountDeletionAttempt(plan: AccountDeletionPlan): Promise<AccountDeletionPlan> {
  return withPlanLock(plan.userId, async () => {
    const existing = await readAccountDeletionPlan(plan.userId);
    if (!existing || existing.ownerId !== plan.ownerId) throw new Error('Account deletion plan changed.');
    if (existing.attempts >= 3) throw new Error('Account deletion retry limit reached.');
    const next = { ...existing, attempts: existing.attempts + 1 };
    await storage.set(key(plan.userId), JSON.stringify(next));
    const confirmed = await readAccountDeletionPlan(plan.userId);
    if (confirmed?.ownerId !== next.ownerId || confirmed.attempts !== next.attempts) throw new Error('Account deletion attempt was not saved.');
    return confirmed;
  });
}

export async function readOwnAccountDeletionStatus(userId: string, signal?: AbortSignal): Promise<AccountDeletionStatus> {
  const query = supabase.rpc('own_account_deletion_status'); // No raw UID parameter.
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  const status = data as AccountDeletionStatus;
  if (error || status?.user_id !== userId || typeof status.auth_present !== 'boolean' || typeof status.profile_present !== 'boolean' ||
    typeof status.requires_owner !== 'boolean' || !Number.isSafeInteger(status.affected_stable_count) || status.affected_stable_count < 0 ||
    !Array.isArray(status.replacement_owners) || status.replacement_owners.some(candidate =>
      !candidate || typeof candidate.user_id !== 'string' || !uuid.test(candidate.user_id) || candidate.user_id === userId ||
      typeof candidate.display_name !== 'string' || !candidate.display_name.trim()) ||
    new Set(status.replacement_owners.map(candidate => candidate.user_id)).size !== status.replacement_owners.length ||
    (!status.requires_owner && (status.affected_stable_count !== 0 || status.replacement_owners.length !== 0)) ||
    (status.affected_stable_count === 0 && status.replacement_owners.length !== 0) ||
    !['not_started', 'pending', 'deleted', 'unconfirmed'].includes(status.status)) {
    throw new Error('Account deletion status could not be verified.');
  }
  if (status.status === 'pending' && (!status.auth_present || !status.profile_present ||
    (status.replacement_user_id !== null && (typeof status.replacement_user_id !== 'string' || !uuid.test(status.replacement_user_id))) ||
    typeof status.prepared_at !== 'string' || !Number.isFinite(Date.parse(status.prepared_at)))) {
    throw new Error('Account deletion pending receipt is invalid.');
  }
  if (status.status === 'deleted' && (status.auth_present || status.profile_present || status.requires_owner || status.replacement_user_id !== null || status.prepared_at !== null)) {
    throw new Error('Account deletion removal receipt is invalid.');
  }
  if (status.status === 'not_started' && (!status.auth_present || !status.profile_present || status.replacement_user_id !== null || status.prepared_at !== null)) {
    throw new Error('Account deletion initial receipt is invalid.');
  }
  if (status.status === 'unconfirmed') throw new Error('Account deletion rows are inconsistent.');
  if (status.status !== 'deleted') {
    const media = await readOwnAccountMediaStatus(userId, signal);
    if (media.own.plan_id && (status.status !== 'pending' || status.replacement_user_id !== media.own.replacement_user_id)) throw new Error('Account media/core receipts are inconsistent.');
    // Both server statements are complete and caller-bound; the mutation rechecks/freeze is atomic.
    // A lost/unknown inventory never becomes a verified empty scope before the local journal.
    return { ...status, media, requires_owner: media.requires_owner, affected_stable_count: media.affected_stable_count,
      replacement_owners: media.replacement_owners };
  }
  return status;
}
