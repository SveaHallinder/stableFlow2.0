// Deno resolves this HTTPS import in the Edge runtime.
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Account deletion proposal. Retains the supported Auth admin.deleteUser API.
// The service-only prepare RPC binds the selected owner; a reviewed profile
// cascade trigger atomically transfers creators and removes only authored UGC.
// Owned/unknown media fails closed. An issued JWT is not revoked by local cleanup.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Browser-invoked (unlike the trigger-invoked functions), so the JS client's
// Authorization header triggers a CORS preflight. Without these headers + an
// OPTIONS handler the preflight fails and account deletion is blocked on web.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logFailure(stage: string, error?: unknown): void {
  const detail = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  console.error(`[delete account] ${stage}`, {
    code: typeof detail.code === "string" ? detail.code : "unknown",
    status: typeof detail.status === "number" ? detail.status : undefined,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      logFailure("server configuration missing");
      return json({ error: "not_configured" }, 500);
    }

    // Identify the caller from their own JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "unauthorized" }, 401);
    }
    const uid = userData.user.id;
    let body: { expected_user_id?: unknown; replacement_user_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (typeof body?.expected_user_id !== "string" || !body.expected_user_id) {
      return json({ error: "invalid_request" }, 400);
    }
    if (body.expected_user_id !== uid) {
      logFailure("caller changed before deletion");
      return json({ error: "account_changed" }, 409);
    }

    const replacementId = body.replacement_user_id ?? null;
    if (replacementId !== null && (typeof replacementId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(replacementId))) {
      return json({ error: "invalid_request" }, 400);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: prepared, error: prepareErr } = await admin.rpc("prepare_account_deletion", {
      p_user_id: uid, p_replacement_user_id: replacementId,
    });
    if (prepareErr) {
      logFailure("deletion preparation failed", prepareErr);
      const message = typeof prepareErr.message === "string" ? prepareErr.message : "";
      const reason = ["owner_required", "owner_invalid", "storage_blocked", "deletion_in_progress", "account_changed"]
        .find(code => message === `[account delete] ${code}`);
      return json({ error: reason ?? "lookup_failed" }, reason ? 409 : 500);
    }
    if (prepared?.prepared !== true || prepared?.user_id !== uid || prepared?.replacement_user_id !== replacementId) {
      logFailure("deletion preparation acknowledgement unverified");
      return json({ error: "lookup_failed" }, 500);
    }

    let mismatchedDeletion = false;
    try {
      const { data: deleteData, error: delErr } = await admin.auth.admin.deleteUser(uid);
      if (delErr) logFailure("Auth deletion acknowledgement failed", delErr);
      if (deleteData?.user?.id && deleteData.user.id !== uid) {
        mismatchedDeletion = true;
        logFailure("Auth deletion acknowledgement UID mismatched");
      }
    } catch (error) {
      // A transport/SDK failure can arrive after Auth committed. Read fresh
      // receipts for the previously getUser-verified UID before claiming success.
      logFailure("Auth deletion acknowledgement unavailable", error);
    }
    const [authReceipt, profileReceipt] = await Promise.all([
      admin.auth.admin.getUserById(uid),
      admin.from("profiles").select("id").eq("id", uid).maybeSingle(),
    ]);
    const authGone = authReceipt.data?.user === null &&
      authReceipt.error?.status === 404 && authReceipt.error?.code === "user_not_found";
    if (mismatchedDeletion || !authGone || profileReceipt.error || profileReceipt.data !== null) {
      logFailure("fresh deletion receipt unconfirmed", authReceipt.error ?? profileReceipt.error);
      return json({ error: "delete_unconfirmed" }, 500);
    }

    return json({ deleted: true, user_id: uid }, 200);
  } catch (error) {
    logFailure("unexpected deletion failure", error);
    return json({ error: "delete_failed" }, 500);
  }
});
