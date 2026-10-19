// REVIEW PROPOSAL ONLY: this worker is not deployed or scheduled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activePushRegistrations, isUuid, registration, sendPushTargets } from "../_shared/push-receipts.ts";
import type { PushTarget } from "../_shared/push-receipts.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
interface DuePlan { planId: string; requestId: string; attemptId: string; stableId: string; recipientUserIds: string[] }
const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

async function bounded<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Care reminder state is unconfirmed")); }, 15_000);
    })]);
  } finally { clearTimeout(timer!); }
}

async function targets(plan: DuePlan): Promise<PushTarget[]> {
  const recipients = new Set(plan.recipientUserIds);
  const tokenAnswer = await bounded(signal => supabase.from("push_tokens").select("id,user_id,token,registration_generation", { count: "exact" })
    .in("user_id", plan.recipientUserIds).order("id").abortSignal(signal));
  if (tokenAnswer.error || !Array.isArray(tokenAnswer.data) || !Number.isSafeInteger(tokenAnswer.count)
    || tokenAnswer.count !== tokenAnswer.data.length) throw new Error("Care token state is unconfirmed");
  const tokenRows = tokenAnswer.data.map((row: unknown) => registration(row));
  if (tokenRows.some(row => !recipients.has(row.registration.user_id))) throw new Error("Care token scope is unconfirmed");
  const preferenceAnswer = await bounded(signal => supabase.from("notification_preferences").select("user_id,reminders", { count: "exact" })
    .in("user_id", plan.recipientUserIds).abortSignal(signal));
  if (preferenceAnswer.error || !Array.isArray(preferenceAnswer.data) || !Number.isSafeInteger(preferenceAnswer.count)
    || preferenceAnswer.count !== preferenceAnswer.data.length) throw new Error("Care preferences are unconfirmed");
  const disabled = new Set<string>();
  const seen = new Set<string>();
  for (const row of preferenceAnswer.data) {
    if (!recipients.has(row.user_id) || typeof row.reminders !== "boolean" || seen.has(row.user_id)) throw new Error("Care preferences are malformed");
    seen.add(row.user_id);
    if (!row.reminders) disabled.add(row.user_id);
  }
  const eligible = tokenRows.filter(row => !disabled.has(row.registration.user_id));
  const active = await activePushRegistrations(supabase, eligible.map(row => row.registration));
  const keys = new Set(active.map(row => JSON.stringify(row)));
  return eligible.filter(row => keys.has(JSON.stringify(row.registration))).map(row => ({
    registration: row.registration,
    message: { to: row.token, title: "Påminnelse i StableFlow", body: "Öppna StableFlow och kontrollera vårdplanen.",
      data: { screen: "home", recipientUserId: row.registration.user_id }, sound: "default", channelId: "default" },
  }));
}

async function finish(plan: DuePlan, state: "held" | "submitted"): Promise<void> {
  const answer = await bounded(signal => supabase.rpc("care_reminder_finish", {
    p_plan_id: plan.planId, p_request_id: plan.requestId, p_attempt_id: plan.attemptId, p_state: state,
  }).abortSignal(signal));
  const ack = object(answer.data);
  if (answer.error || ack?.planId !== plan.planId || ack?.requestId !== plan.requestId
    || ack?.attemptId !== plan.attemptId || ack?.state !== state) throw new Error("Care completion is unconfirmed");
}

Deno.serve(async req => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || req.headers.get("Authorization") !== `Bearer ${key}`) return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  try {
    const answer = await bounded(signal => supabase.rpc("care_reminder_claim_due", { p_limit: 10 }).abortSignal(signal));
    const batch = object(answer.data)?.items;
    if (answer.error || !Array.isArray(batch) || batch.length > 10) throw new Error("Care claim is unconfirmed");
    const ids = new Set<string>();
    for (const value of batch) {
      const plan = object(value);
      if (!isUuid(plan?.planId) || !isUuid(plan?.requestId) || !isUuid(plan?.attemptId) || !isUuid(plan?.stableId)
        || ids.has(plan.planId) || !Array.isArray(plan.recipientUserIds) || !plan.recipientUserIds.length
        || plan.recipientUserIds.length > 10000 || !plan.recipientUserIds.every(isUuid)
        || new Set(plan.recipientUserIds).size !== plan.recipientUserIds.length) throw new Error("Care claim is malformed");
      ids.add(plan.planId);
    }
    let submitted = 0, held = 0;
    for (const value of batch) {
      const plan = value as DuePlan;
      const messages = await targets(plan);
      if (!messages.length) { await finish(plan, "held"); held++; continue; }
      if (await sendPushTargets(supabase, plan.attemptId, messages) !== messages.length) {
        throw new Error("Care provider tickets are unconfirmed");
      }
      await finish(plan, "submitted");
      submitted++;
    }
    return new Response(JSON.stringify({ submitted, held }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch {
    console.error("[care reminder] Worker outcome unconfirmed", { category: "care_worker_unconfirmed" });
    return new Response(JSON.stringify({ error: "care_reminder_unconfirmed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
