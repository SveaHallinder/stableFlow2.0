import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type NotificationType = "message" | "assignment" | "post";

interface WebhookPayload {
  type: NotificationType;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  channelId?: string;
}

// Fetch push tokens for a list of user IDs, filtered by their notification preferences
async function getEligibleTokens(
  userIds: string[],
  prefKey: keyof { messages: boolean; assignments: boolean; feed: boolean; reminders: boolean },
): Promise<string[]> {
  if (!userIds.length) return [];

  // Get tokens
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", userIds);

  if (!tokens?.length) return [];

  // Check preferences — users without a row default to all enabled
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, " + prefKey)
    .in("user_id", userIds);

  const disabledUsers = new Set(
    (prefs ?? [])
      .filter((p: Record<string, unknown>) => p[prefKey] === false)
      .map((p: Record<string, unknown>) => p.user_id as string),
  );

  return tokens
    .filter((t) => !disabledUsers.has(t.user_id))
    .map((t) => t.token);
}

// Get display name for a user
async function getUserName(userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("id", userId)
    .single();
  return data?.full_name || data?.username || "Någon";
}

// Handle new chat message
async function handleMessage(record: Record<string, unknown>): Promise<ExpoPushMessage[]> {
  const conversationId = record.conversation_id as string;
  const authorId = record.author_id as string;
  const text = record.text as string;

  // Get all members of this conversation except the author
  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", authorId);

  // Also check if this is a stable group conversation
  const { data: convo } = await supabase
    .from("conversations")
    .select("stable_id, is_group")
    .eq("id", conversationId)
    .single();

  let recipientIds: string[] = (members ?? []).map((m) => m.user_id);

  // For stable group chats, all stable members are recipients
  if (convo?.is_group && convo?.stable_id) {
    const { data: stableMembers } = await supabase
      .from("stable_members")
      .select("user_id")
      .eq("stable_id", convo.stable_id)
      .neq("user_id", authorId);
    const smIds = (stableMembers ?? []).map((m) => m.user_id);
    recipientIds = [...new Set([...recipientIds, ...smIds])];
  }

  const tokens = await getEligibleTokens(recipientIds, "messages");
  if (!tokens.length) return [];

  const authorName = await getUserName(authorId);
  const preview = text.length > 80 ? text.slice(0, 77) + "..." : text;

  return tokens.map((to) => ({
    to,
    title: authorName,
    body: preview,
    data: { screen: "chat", chatId: conversationId },
    sound: "default" as const,
    channelId: "default",
  }));
}

// Handle assignment change (new assignee)
async function handleAssignment(
  record: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
): Promise<ExpoPushMessage[]> {
  const newAssignee = record.assignee_id as string | null;
  const oldAssignee = oldRecord?.assignee_id as string | null;

  // Only notify if the assignee actually changed to someone new
  if (!newAssignee || newAssignee === oldAssignee) return [];

  const tokens = await getEligibleTokens([newAssignee], "assignments");
  if (!tokens.length) return [];

  const label = record.label as string;
  const date = record.date as string;
  const time = record.time as string;

  return tokens.map((to) => ({
    to,
    title: "Nytt pass tilldelat",
    body: `${label} · ${date} kl ${time}`,
    data: { screen: "calendar" },
    sound: "default" as const,
    channelId: "default",
  }));
}

// Handle new feed post
async function handlePost(record: Record<string, unknown>): Promise<ExpoPushMessage[]> {
  const stableId = record.stable_id as string | null;
  const authorId = record.user_id as string;

  if (!stableId) return [];

  // Get all stable members except the author
  const { data: members } = await supabase
    .from("stable_members")
    .select("user_id")
    .eq("stable_id", stableId)
    .neq("user_id", authorId);

  const recipientIds = (members ?? []).map((m) => m.user_id);
  const tokens = await getEligibleTokens(recipientIds, "feed");
  if (!tokens.length) return [];

  const authorName = await getUserName(authorId);
  const content = record.content as string | null;
  const body = content
    ? content.length > 80
      ? content.slice(0, 77) + "..."
      : content
    : "Nytt inlägg i flödet";

  return tokens.map((to) => ({
    to,
    title: `${authorName} publicerade`,
    body,
    data: { screen: "feed" },
    sound: "default" as const,
    channelId: "default",
  }));
}

// Send messages to Expo Push API in chunks of 100
async function sendToExpo(messages: ExpoPushMessage[]): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("Expo push error:", res.status, await res.text());
    }
  }
}

Deno.serve(async (req) => {
  // Verify the request is from our own Supabase instance
  const authHeader = req.headers.get("Authorization");
  const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (authHeader !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload: WebhookPayload = await req.json();
    let messages: ExpoPushMessage[] = [];

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
    }

    if (messages.length) {
      await sendToExpo(messages);
    }

    return new Response(JSON.stringify({ sent: messages.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Push notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
