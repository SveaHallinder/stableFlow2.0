type DbResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<DbResult> };
type StorageResult = { data: unknown; error: unknown };
type StorageClient = { storage: { from: (bucket: string) => {
  copy: (source: string, destination: string) => PromiseLike<StorageResult>;
  remove: (paths: string[]) => PromiseLike<StorageResult>;
  info: (path: string) => PromiseLike<StorageResult>;
} } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const knownPath = (bucket: string, path: string) => {
  const parts = path.split('/');
  return ['posts', 'avatars', 'paddocks'].includes(bucket) && parts.length === (bucket === 'posts' ? 4 : 2)
    && parts.slice(0, -1).every(id) && id(parts[parts.length - 1].split('.')[0]) && /^[a-zA-Z0-9]+$/.test(parts[parts.length - 1].split('.')[1] ?? '')
    && parts[parts.length - 1].split('.').length === 2;
};
function failure(reason: string) { console.warn('[account media] ' + reason); return { status: 409, body: { error: reason } }; }
async function bounded<T>(work: () => PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Account media phase unconfirmed.')), timeoutMs); });
  try { return await Promise.race([Promise.resolve().then(work), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

// Caller comes only from Edge getUser. The body UID is a fence, never authority.
// Service reserves immutable source/destination BEFORE any Storage API operation.
export async function accountMediaAction(admin: RpcClient & StorageClient, userClient: StorageClient, caller: string,
  body: Record<string, unknown>, projectUrl: string, timeoutMs = 10_000): Promise<{ status: number; body: Record<string, unknown> }> {
  const action = body.action;
  const replacement = body.replacement_user_id ?? null;
  if (!id(caller) || body.expected_user_id !== caller || (replacement !== null && !id(replacement))
    || !id(body.media_plan_generation) || !['prepare_media', 'transfer_shared_media', 'remove_own_media', 'reselect_media_owner'].includes(String(action))) return failure('invalid_request');
  try {
    if (action === 'prepare_media' || action === 'reselect_media_owner') {
      if (replacement === caller || body.media_item_id !== null || (action === 'prepare_media' ? body.media_plan_id !== null
        : !id(body.media_plan_id) || !id(body.next_plan_generation) || (body.expected_replacement_user_id !== null && !id(body.expected_replacement_user_id)))) return failure('invalid_request');
      const next = action === 'reselect_media_owner' ? body.next_plan_generation : body.media_plan_generation;
      const result = await bounded(() => action === 'prepare_media'
        ? admin.rpc('prepare_account_media_deletion', { p_user_id: caller, p_replacement_user_id: replacement, p_project_url: projectUrl, p_plan_generation: body.media_plan_generation })
        : admin.rpc('reselect_account_media_owner', { p_user_id: caller, p_plan_id: body.media_plan_id, p_expected_generation: body.media_plan_generation,
          p_expected_owner: body.expected_replacement_user_id, p_replacement_user_id: replacement, p_next_generation: next }), timeoutMs);
      const data = object(result.data), plan = object(data.plan);
      if (result.error || data.prepared !== true || data.user_id !== caller || !id(plan.plan_id) || plan.plan_generation !== next || (action === 'reselect_media_owner' && plan.plan_id !== body.media_plan_id) || plan.replacement_user_id !== replacement) return failure('prepare_unconfirmed');
      return { status: 200, body: data };
    }
    if (!id(body.media_plan_id) || !id(body.media_item_id) || action === 'transfer_shared_media' && replacement !== caller) return failure('invalid_request');
    const planId = body.media_plan_id, itemId = body.media_item_id;
    const copy = action === 'transfer_shared_media';
    const args = { p_plan_id: planId, p_item_id: itemId, p_caller_id: caller, p_action: copy ? 'claim_copy' : 'claim_remove', p_storage_receipt: null, p_plan_generation: body.media_plan_generation };
    const reserved = await bounded(() => admin.rpc('account_media_step', args), timeoutMs);
    const target = object(reserved.data);
    if (reserved.error || target.plan_id !== planId || target.item_id !== itemId || target.plan_generation !== body.media_plan_generation || target.caller_id !== caller || target.replacement_user_id !== replacement) return failure('reservation_unconfirmed');
    const acknowledged = () => ({ status: 200, body: { user_id: caller, plan_id: planId, plan_generation: body.media_plan_generation, item_id: itemId, confirmed: true, state: copy ? 'copied' : 'removed' } });
    if (target.confirmed === true) return (copy ? ['copied', 'remove_pending', 'removed'].includes(String(target.state)) : target.state === 'removed') ? acknowledged() : failure('reservation_unconfirmed');
    if (target.confirmed !== false || typeof target.bucket_id !== 'string' || typeof target.source_path !== 'string'
      || !knownPath(target.bucket_id, target.source_path) || ![copy ? 'copy' : 'remove', ...copy ? [] : ['verify_remove']].includes(String(target.action))) return failure('reservation_unconfirmed');
    const bucket = target.bucket_id, source = target.source_path;
    let storageReceipt: string | null = null;
    if (copy) {
      if (!['avatars', 'paddocks'].includes(bucket) || typeof target.destination_path !== 'string' || !knownPath(bucket, target.destination_path) || source === target.destination_path) return failure('reservation_unconfirmed');
      // The new owner is B's JWT subject. A service-key copy would not transfer ownership.
      try { await bounded(() => userClient.storage.from(bucket).copy(source, target.destination_path as string), timeoutMs); }
      catch { return failure('copy_unconfirmed'); }
      // Even a known Storage error may mean a prior same-path copy committed. SQL verifies exact source, B ownership/version/content metadata and frozen references.
    } else {
      if (!id(target.source_id)) return failure('reservation_unconfirmed');
      if (target.action === 'remove') {
        let removed: StorageResult;
        try { removed = await bounded(() => admin.storage.from(bucket).remove([source]), timeoutMs); }
        catch { return failure('remove_unconfirmed'); }
        if (!removed.error && Array.isArray(removed.data) && removed.data.length === 1
          && object(removed.data[0]).id === target.source_id && object(removed.data[0]).name === source) storageReceipt = 'removed';
      }
      if (!storageReceipt) {
        const info = await bounded(() => admin.storage.from(bucket).info(source), timeoutMs);
        const error = object(info.error);
        // Only an actual SDK HTTP 404 absence receipt; generic error/400/empty ack is unknown.
        if (info.data === null && error.name === 'StorageApiError' && error.status === 404 && error.statusCode === '404') storageReceipt = 'absent';
      }
      if (!storageReceipt) return failure('remove_unconfirmed');
    }
    const confirmed = await bounded(() => admin.rpc('account_media_step', { ...args, p_action: copy ? 'confirm_copy' : 'confirm_remove', p_storage_receipt: storageReceipt }), timeoutMs);
    const receipt = object(confirmed.data);
    if (confirmed.error || receipt.plan_id !== planId || receipt.item_id !== itemId || receipt.plan_generation !== body.media_plan_generation || receipt.caller_id !== caller
      || receipt.replacement_user_id !== replacement || receipt.confirmed !== true || receipt.state !== (copy ? 'copied' : 'removed')) return failure('receipt_unconfirmed');
    return acknowledged();
  } catch { return failure('outcome_unconfirmed'); }
}
