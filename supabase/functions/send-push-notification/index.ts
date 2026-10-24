import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { activePushRegistrations, isUuid, registration, sendPushTargets } from "../_shared/push-receipts.ts";
import type { PushRegistration, PushTarget } from "../_shared/push-receipts.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type NotificationType = "message" | "assignment" | "post" | "alert";

interface WebhookPayload {
  request_id: string;
  type: NotificationType;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

// Fetch push tokens for a list of user IDs, filtered by their notification preferences
async function getEligibleTokens(
  userIds: string[],
  prefKey: keyof { messages: boolean; assignments: boolean; feed: boolean; reminders: boolean },
): Promise<{ registration: PushRegistration; token: string }[]> {
  if (!userIds.length) return [];

  // Get tokens
  const { data: tokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("id, user_id, token, registration_generation")
    .in("user_id", userIds);

  if (tokenError) {
    console.error("[push notification] Token lookup failed", { category: "token_lookup_failed" });
    throw new Error("Push token lookup failed");
  }
  if (!tokens?.length) return [];

  // Check preferences — users without a row default to all enabled
  const { data: prefs, error: preferenceError } = await supabase
    .from("notification_preferences")
    .select(`user_id, ${prefKey}` as const)
    .in("user_id", userIds);

  if (preferenceError) {
    console.error("[push notification] Preference lookup failed", { category: "preference_lookup_failed" });
    throw new Error("Notification preference lookup failed");
  }

  const disabledUsers = new Set(
    (prefs ?? [])
      .filter((p: Record<string, unknown>) => p[prefKey] === false)
      .map((p: Record<string, unknown>) => p.user_id as string),
  );

  const eligible = tokens.filter((t) => !disabledUsers.has(t.user_id)).map((t) => registration(t));
  if (!eligible.length) return [];
  const active = await activePushRegistrations(supabase, eligible.map(target => target.registration));
  const key = (target: PushRegistration) => `${target.token_id}:${target.user_id}:${target.registration_generation}`;
  const selected = new Set(active.map(key));
  return eligible.filter(target => selected.has(key(target.registration)));
}

// Re-evaluated before each provider chunk so queued work cannot outlive membership.
async function messageRecipientIds(record: Record<string, unknown>): Promise<string[]> {
  const conversationId = record.conversation_id as string;
  const authorId = record.author_id as string;
  if (!isUuid(conversationId) || !isUuid(authorId)) throw new Error("Invalid message identity");

  const { data: members, error: memberError } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (memberError) {
    console.error("[push notification] Conversation member lookup failed", { category: "member_lookup_failed" });
    throw new Error("Conversation member lookup failed");
  }

  const { data: convo, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();
  if (conversationError) {
    if (conversationError.code === "PGRST116") return [];
    console.error("[push notification] Conversation lookup failed", { category: "conversation_lookup_failed" });
    throw new Error("Conversation lookup failed");
  }

  // Legacy rows are supported; an explicit unknown kind must never widen access.
  const kind = Object.prototype.hasOwnProperty.call(convo ?? {}, "chat_kind")
    ? convo.chat_kind : convo?.is_group ? "stable" : "direct";
  if (!["stable", "direct", "custom"].includes(kind)) throw new Error("Unknown conversation type");
  const participantIds = new Set<string>((members ?? []).map((m) => m.user_id));
  let recipientIds: string[] = [...participantIds];

  if (kind === "stable" || kind === "custom") {
    if (!isUuid(convo?.stable_id)) throw new Error("Missing conversation stable");
    const { data: stableMembers, error: stableMemberError } = await supabase
      .from("stable_members")
      .select("user_id")
      .eq("stable_id", convo.stable_id);
    if (stableMemberError) {
      console.error("[push notification] Stable member lookup failed", { category: "stable_member_lookup_failed" });
      throw new Error("Stable member lookup failed");
    }
    const stableIds = new Set<string>((stableMembers ?? []).map((m) => m.user_id));
    if (!stableIds.has(authorId) || (kind === "custom" && !participantIds.has(authorId))) return [];
    recipientIds = kind === "stable" ? [...stableIds] : recipientIds.filter(id => stableIds.has(id));
  } else if (!participantIds.has(authorId)) {
    return [];
  }
  recipientIds = recipientIds.filter(id => id !== authorId);

  if (kind === "custom") {
    // Service-only SQL applies the same active-account rules as chat RLS.
    const { data: activeRecipients, error: recipientError } = await supabase.rpc("chat_push_recipients", {
      target_conversation_id: conversationId, target_author_id: authorId,
    });
    if (recipientError || !Array.isArray(activeRecipients) || activeRecipients.some(id => !isUuid(id))) {
      console.error("[chat group] Active push audience lookup failed", { category: "recipient_lookup_failed" });
      throw new Error("Active chat audience could not be verified");
    }
    const active = new Set(activeRecipients);
    recipientIds = recipientIds.filter(id => active.has(id));
  }

  if (recipientIds.length) {
    const { data: blocks, error: blockError } = await supabase
      .from("blocked_users")
      .select("blocker_user_id")
      .eq("blocked_user_id", authorId)
      .in("blocker_user_id", recipientIds);
    if (blockError) {
      console.error("[push notification] Block preference lookup failed", { category: "block_lookup_failed" });
      throw new Error("Block preference lookup failed");
    }
    const blockers = new Set((blocks ?? []).map((row) => row.blocker_user_id));
    recipientIds = recipientIds.filter(id => !blockers.has(id));
  }
  return recipientIds;
}

// Handle new chat message. Push deliberately carries no private chat content.
async function handleMessage(record: Record<string, unknown>): Promise<PushTarget[]> {
  const recipientIds = await messageRecipientIds(record);
  const tokens = await getEligibleTokens(recipientIds, "messages");
  if (!tokens.length) return [];

  return tokens.map(({ token, registration: targetRegistration }) => ({
    registration: targetRegistration,
    message: {
      to: token,
      title: "Nytt meddelande",
      body: "Öppna StableFlow för att läsa dina meddelanden.",
      data: { screen: "messages", recipientUserId: targetRegistration.user_id },
      sound: "default" as const,
      channelId: "default",
    },
  }));
}

// Handle assignment change (new assignee)
async function handleAssignment(
  record: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
): Promise<PushTarget[]> {
  const newAssignee = record.assignee_id as string | null;
  const oldAssignee = oldRecord?.assignee_id as string | null;

  // Only notify if the assignee actually changed to someone new
  if (!newAssignee || newAssignee === oldAssignee) return [];

  const tokens = await getEligibleTokens([newAssignee], "assignments");
  if (!tokens.length) return [];

  return tokens.map(({ token, registration: targetRegistration }) => ({
    registration: targetRegistration,
    message: {
      to: token,
      title: "Nytt pass tilldelat",
      body: "Öppna StableFlow för att se dina pass.",
      data: { screen: "calendar", recipientUserId: targetRegistration.user_id },
      sound: "default" as const,
      channelId: "default",
    },
  }));
}

// Handle new feed post
async function handlePost(record: Record<string, unknown>): Promise<PushTarget[]> {
  // Phase 6: normal feed posts do not push. Feed stays social; alerts carry urgency.
  return [];
}

async function handleAlert(record: Record<string, unknown>): Promise<PushTarget[]> {
  const stableId = record.stable_id as string | null;
  const authorId = record.created_by_user_id as string | null;
  const severity = record.severity as string | null;

  if (!stableId || severity === "info") return [];

  // Get all stable members except the author
  let query = supabase
    .from("stable_members")
    .select("user_id")
    .eq("stable_id", stableId);
  if (authorId) {
    query = query.neq("user_id", authorId);
  }
  const { data: members, error: memberError } = await query;
  if (memberError) {
    console.error("[push notification] Alert member lookup failed", { category: "member_lookup_failed" });
    throw new Error("Alert member lookup failed");
  }

  const recipientIds = (members ?? []).map((m) => m.user_id);
  const tokens = await getEligibleTokens(recipientIds, "reminders");
  if (!tokens.length) return [];

  const notificationTitle = severity === "urgent" ? "Akut i stallet" : "Viktigt i stallet";

  return tokens.map(({ token, registration: targetRegistration }) => ({
    registration: targetRegistration,
    message: {
      to: token,
      title: notificationTitle,
      body: "Öppna StableFlow för att läsa dina stallnotiser.",
      data: { screen: "home", recipientUserId: targetRegistration.user_id },
      sound: "default" as const,
      channelId: "default",
    },
  }));
}

// Reserve the entire webhook attempt before sending any 100-message chunk.
async function sendToExpo(messages: PushTarget[], attemptId: string, messageRecord?: Record<string, unknown>): Promise<number> {
  return await sendPushTargets(supabase, attemptId, messages, fetch, messageRecord ? async chunk => {
    const authorized = new Set(await messageRecipientIds(messageRecord));
    if (chunk.some(target => !authorized.has(target.registration.user_id))) {
      console.error("[chat group] Queued push audience changed", { category: "recipient_revoked" });
      throw new Error("Chat push membership changed");
    }
    const active = await getEligibleTokens([...new Set(chunk.map(target => target.registration.user_id))], "messages");
    const key = (target: PushRegistration) => `${target.token_id}:${target.user_id}:${target.registration_generation}`;
    const eligible = new Map(active.map(target => [key(target.registration), target.token]));
    if (chunk.some(target => eligible.get(key(target.registration)) !== target.message.to)) {
      throw new Error("Chat push device or preference changed");
    }
  } : undefined);
}

Deno.serve(async (req) => {
  // Verify the request is from our own Supabase instance
  const authHeader = req.headers.get("Authorization");
  const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }

  try {
    const payload: WebhookPayload = await req.json();
    if (!payload || !isUuid(payload.request_id) || !["message", "assignment", "post", "alert"].includes(payload.type)
      || typeof payload.record !== "object" || payload.record === null || Array.isArray(payload.record)) {
      console.error("[push notification] Invalid webhook payload");
      return new Response(JSON.stringify({ error: "invalid_push_request" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    let messages: PushTarget[] = [];

    switch (payload.type) {
      case "message":
        messages = await handleMessage(payload.record);
        break;
      case "assignment":
        messages = await handleAssignment(payload.record, payload.old_record);
        break;
      case "post":
        messages = await handlePost(payload.record);
        break;
      case "alert":
        messages = await handleAlert(payload.record);
        break;
    }

    const sent = await sendToExpo(messages, payload.request_id, payload.type === "message" ? payload.record : undefined);

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    console.error("[push notification] Delivery failed", { category: "delivery_failed" });
    return new Response(JSON.stringify({ error: "push_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
