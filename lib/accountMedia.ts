import { supabase, supabaseConfig } from './supabase';

export type AccountMediaPlan = {
  plan_id: string | null;
  plan_generation: string | null;
  reselect_allowed: boolean;
  reselect_blocked_reason: string | null;
  replacement_user_id: string | null;
  state: 'not_started' | 'pending' | 'ready';
  delete_count: number;
  transfer_count: number;
  copied_count: number;
  removed_count: number;
  next_copy_item_id: string | null;
  next_remove_item_id: string | null;
};
export type AccountMediaStatus = {
  user_id: string;
  complete: true;
  blocked_count: number;
  requires_owner: boolean;
  affected_stable_count: number;
  replacement_owners: { user_id: string; display_name: string }[];
  own: AccountMediaPlan;
  incoming: AccountMediaPlan[];
};
export type AccountMediaRequest = {
  action: 'prepare_media' | 'transfer_shared_media' | 'remove_own_media' | 'reselect_media_owner';
  expected_user_id: string;
  replacement_user_id: string | null;
  media_plan_id: string | null;
  media_item_id: string | null;
  media_plan_generation: string;
  expected_replacement_user_id: string | null;
  next_plan_generation: string | null;
};
export type AccountMediaResult = { success: true } | { success: false; outcome: 'rejected' | 'uncertain'; reason?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const idOrNull = (value: unknown) => value === null || validId(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function validAccountMediaPlan(value: unknown): value is AccountMediaPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as AccountMediaPlan;
  if (!idOrNull(plan.plan_id) || !idOrNull(plan.plan_generation) || typeof plan.reselect_allowed !== 'boolean'
    || (plan.reselect_blocked_reason !== null && plan.reselect_blocked_reason !== 'operation_already_reserved') || !idOrNull(plan.replacement_user_id) || !idOrNull(plan.next_copy_item_id) || !idOrNull(plan.next_remove_item_id)
    || !['not_started', 'pending', 'ready'].includes(plan.state)
    || ![plan.delete_count, plan.transfer_count, plan.copied_count, plan.removed_count].every(count)
    || plan.copied_count > plan.transfer_count || plan.removed_count > plan.delete_count + plan.transfer_count) return false;
  if (plan.state === 'not_started') return plan.plan_id === null && plan.plan_generation === null && !plan.reselect_allowed && plan.reselect_blocked_reason === null && plan.replacement_user_id === null
    && plan.copied_count === 0 && plan.removed_count === 0 && plan.next_copy_item_id === null && plan.next_remove_item_id === null;
  if (!plan.plan_id || !plan.plan_generation || (plan.reselect_allowed && (plan.copied_count !== 0 || plan.removed_count !== 0))
    || (plan.reselect_allowed ? plan.reselect_blocked_reason !== null : plan.reselect_blocked_reason !== 'operation_already_reserved') || (plan.transfer_count > 0 && !plan.replacement_user_id)) return false;
  if (plan.state === 'ready') return plan.copied_count === plan.transfer_count && plan.removed_count === plan.delete_count + plan.transfer_count
    && plan.next_copy_item_id === null && plan.next_remove_item_id === null;
  return (plan.copied_count < plan.transfer_count ? plan.next_copy_item_id !== null && plan.next_remove_item_id === null
    : plan.next_copy_item_id === null && plan.next_remove_item_id !== null);
}
export function validAccountMediaStatus(value: unknown, userId: string): value is AccountMediaStatus {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as AccountMediaStatus;
  return receipt.user_id === userId && receipt.complete === true && count(receipt.blocked_count)
    && typeof receipt.requires_owner === 'boolean' && count(receipt.affected_stable_count)
    && (receipt.requires_owner || receipt.affected_stable_count === 0) && Array.isArray(receipt.replacement_owners)
    && receipt.replacement_owners.every(person => validId(person?.user_id) && person.user_id !== userId && typeof person.display_name === 'string' && person.display_name.trim())
    && new Set(receipt.replacement_owners.map(person => person.user_id)).size === receipt.replacement_owners.length
    && (receipt.affected_stable_count > 0 || receipt.replacement_owners.length === 0)
    && validAccountMediaPlan(receipt.own) && Array.isArray(receipt.incoming)
    && receipt.incoming.every(plan => validAccountMediaPlan(plan) && plan.plan_id !== null && plan.replacement_user_id === userId )
    && new Set(receipt.incoming.map(plan => plan.plan_id)).size === receipt.incoming.length;
}
export async function readOwnAccountMediaStatus(userId: string, signal?: AbortSignal): Promise<AccountMediaStatus> {
  const query = supabase.rpc('own_account_media_status', { p_project_url: supabaseConfig.url });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error || !validAccountMediaStatus(data, userId)) throw new Error('Account media inventory could not be verified.');
  return data;
}

// expected_user_id fences a late global SDK session; Edge getUser establishes authority.
// The timeout bounds even a SDK storage/token await; no work starts after it expires.
export async function runAccountMediaRequest(request: AccountMediaRequest, isCurrent: () => boolean): Promise<AccountMediaResult> {
  const canonical = { ...request };
  if (!isCurrent() || !validId(canonical.expected_user_id) || !idOrNull(canonical.replacement_user_id)
    || (canonical.action !== 'transfer_shared_media' && canonical.replacement_user_id === canonical.expected_user_id) || !idOrNull(canonical.media_plan_id) || !idOrNull(canonical.media_item_id)
    || !validId(canonical.media_plan_generation) || !idOrNull(canonical.expected_replacement_user_id) || !idOrNull(canonical.next_plan_generation)
    || !['prepare_media', 'transfer_shared_media', 'remove_own_media', 'reselect_media_owner'].includes(canonical.action)
    || (canonical.action === 'prepare_media' ? canonical.media_plan_id !== null || canonical.media_item_id !== null : canonical.action === 'reselect_media_owner' ? !canonical.media_plan_id || canonical.media_item_id !== null || !canonical.next_plan_generation : !canonical.media_plan_id || !canonical.media_item_id)) {
    return { success: false, outcome: 'rejected' };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async (): Promise<AccountMediaResult> => {
    try {
      const session = await supabase.auth.getSession();
      if (session.error || session.data?.session?.user.id !== canonical.expected_user_id || controller.signal.aborted || !isCurrent()) return { success: false, outcome: 'rejected' };
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST', signal: controller.signal, body: { ...canonical } });
      if (controller.signal.aborted || !isCurrent()) return { success: false, outcome: 'uncertain' };
      if (error) return { success: false, outcome: 'uncertain' };
      if (canonical.action === 'prepare_media' || canonical.action === 'reselect_media_owner') {
        if (data?.prepared !== true || data.user_id !== canonical.expected_user_id || !validAccountMediaPlan(data.plan)
          || data.plan.plan_id === null || (canonical.action === 'reselect_media_owner' && data.plan.plan_id !== canonical.media_plan_id) || data.plan.plan_generation !== (canonical.next_plan_generation ?? canonical.media_plan_generation) || data.plan.replacement_user_id !== canonical.replacement_user_id) return { success: false, outcome: 'uncertain' };
      } else if (data?.confirmed !== true || data.user_id !== canonical.expected_user_id || data.plan_id !== canonical.media_plan_id
        || data.plan_generation !== canonical.media_plan_generation || data.item_id !== canonical.media_item_id || data.state !== (canonical.action === 'transfer_shared_media' ? 'copied' : 'removed')) return { success: false, outcome: 'uncertain' };
      return { success: true };
    } catch (error) {
      console.warn('[account media] Outcome unconfirmed', error instanceof Error ? 'Error' : 'Unknown');
      return { success: false, outcome: 'uncertain' };
    }
  };
  const deadline = new Promise<AccountMediaResult>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ success: false, outcome: 'uncertain' }); }, 15_000);
  });
  try { return await Promise.race([operation(), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
