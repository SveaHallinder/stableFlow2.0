// Deno resolves this HTTPS import in the Edge runtime.
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Account deletion. User-invoked (Authorization = the caller's session JWT, NOT
// the service-role key like the trigger-invoked functions). Verifies the caller,
// blocks deletion if they are the sole owner of any stable
// (would lock that stable out of administration), then deletes the auth user.
//
// Auth deletion follows the deployed foreign-key rules. Retained content and
// deletion scope require separate acceptance against the deployed schema.
//
// Preflight reads are not transactional with deletion. The approved database
// last-owner guard protects FK cascades if memberships change concurrently.

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Match the database guard: every existing stable must retain an owner.
    const { data: ownerRows, error: ownerErr } = await admin
      .from("stable_members")
      .select("stable_id")
      .eq("user_id", uid)
      .eq("role", "admin")
      .eq("access", "owner");
    if (ownerErr || !Array.isArray(ownerRows) || ownerRows.some(row => typeof row?.stable_id !== "string" || !row.stable_id)) {
      logFailure("owner lookup failed or unverified", ownerErr);
      return json({ error: "lookup_failed" }, 500);
    }
    for (const row of ownerRows) {
      const { count: ownerCount, error: ownerCountErr } = await admin
        .from("stable_members")
        .select("*", { count: "exact", head: true })
        .eq("stable_id", row.stable_id)
        .eq("role", "admin")
        .eq("access", "owner");
      // Fail closed: a missing or invalid exact count does not verify ownership.
      if (ownerCountErr || typeof ownerCount !== "number" || !Number.isInteger(ownerCount) || ownerCount < 0) {
        logFailure("owner count failed or unverified", ownerCountErr);
        return json({ error: "lookup_failed" }, 500);
      }
      if (ownerCount <= 1) {
        return json({ error: "sole_owner", stable_id: row.stable_id }, 409);
      }
    }

    const { data: deleteData, error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      logFailure("Auth deletion failed", delErr);
      return json({ error: "delete_failed" }, 500);
    }
    if (deleteData?.user?.id !== uid) {
      logFailure("Auth deletion acknowledgement unverified");
      return json({ error: "delete_unconfirmed" }, 500);
    }

    return json({ deleted: true }, 200);
  } catch (error) {
    logFailure("unexpected deletion failure", error);
    return json({ error: "delete_failed" }, 500);
  }
});
