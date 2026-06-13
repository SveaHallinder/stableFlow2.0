import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// GDPR account erasure. User-invoked (Authorization = the caller's session JWT, NOT
// the service-role key like the trigger-invoked functions). Verifies the caller,
// blocks deletion if they are the sole owner of a stable that still has other members
// (would lock that stable out of administration), then deletes the auth user.
//
// On delete, FKs cascade: profiles (from auth.users), stable_members, likes, comments.
// Authored content with set-null FKs (posts.author_id, assignments, care, etc.) is kept
// with attribution removed — stable operational data is preserved, personal link removed.
//
// Note: the sole-owner guard and the delete are not transactional. A concurrent
// membership change between them is a low-probability race; acceptable for now since
// member mutations are admin-initiated and rare.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
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

  // Block if the caller is the sole owner of any stable that still has other members.
  const { data: ownerRows, error: ownerErr } = await admin
    .from("stable_members")
    .select("stable_id")
    .eq("user_id", uid)
    .eq("role", "admin")
    .eq("access", "owner");
  if (ownerErr) {
    return json({ error: "lookup_failed" }, 500);
  }
  for (const row of ownerRows ?? []) {
    const { count: ownerCount, error: ownerCountErr } = await admin
      .from("stable_members")
      .select("*", { count: "exact", head: true })
      .eq("stable_id", row.stable_id)
      .eq("role", "admin")
      .eq("access", "owner");
    const { count: memberCount, error: memberCountErr } = await admin
      .from("stable_members")
      .select("*", { count: "exact", head: true })
      .eq("stable_id", row.stable_id);
    // Fail closed: never delete on an unverified guard read.
    if (ownerCountErr || memberCountErr) {
      return json({ error: "lookup_failed" }, 500);
    }
    if ((ownerCount ?? 0) <= 1 && (memberCount ?? 0) > 1) {
      return json({ error: "sole_owner", stable_id: row.stable_id }, 409);
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error("delete-account failed", delErr);
    return json({ error: "delete_failed" }, 500);
  }

  return json({ deleted: true }, 200);
});
