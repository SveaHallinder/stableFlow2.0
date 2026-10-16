// Deno resolves this HTTPS import in the Edge runtime.
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Browser callers submit saved IDs only. Legacy service-role webhooks may submit
// record.id; their recipient/body fields are deliberately ignored and re-read.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL")?.trim();
const APP_URL = Deno.env.get("APP_URL")?.trim();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const isUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

interface InviteRecord {
  id: string;
  stable_id: string;
  email: string;
  code: string | null;
  expires_at: string | null;
  accepted_at: string | null;
}

type EmailResult = { invite_id: string; accepted: boolean; reason?: string };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmail(invite: InviteRecord, stableName: string, signal: AbortSignal): Promise<EmailResult> {
  const unconfirmed = (reason: string, status?: number): EmailResult => {
    console.warn("[invite email] Utskicket är inte bekräftat", { reason, status });
    return { invite_id: invite.id, accepted: false, reason };
  };
  let appUrl: string | null = null;
  if (APP_URL) {
    try {
      const parsed = new URL(APP_URL);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid APP_URL");
      appUrl = parsed.href;
    } catch { return unconfirmed("app_url_not_configured"); }
  }
  if (!BREVO_API_KEY && !RESEND_API_KEY) return unconfirmed("provider_not_configured");
  const sender = INVITE_FROM_EMAIL?.match(/^(?:(.*?)\s*<([^<>\s]+@[^<>\s]+\.[^<>\s]+)>|([^<>\s]+@[^<>\s]+\.[^<>\s]+))$/);
  if (!sender || /[\r\n]/.test(INVITE_FROM_EMAIL ?? "")) return unconfirmed("sender_not_configured");
  if (!appUrl && !invite.code?.trim()) return unconfirmed("invite_code_missing");
  const safeStable = escapeHtml(stableName);
  const safeEmail = escapeHtml(invite.email);
  const expiresLabel = invite.expires_at
    ? `Inbjudan gäller till ${escapeHtml(new Date(invite.expires_at).toLocaleDateString("sv-SE"))}.`
    : "Be stallägaren om hjälp om du inte kan acceptera inbjudan.";
  const subject = `Du är inbjuden till ${stableName} på StableFlow`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto">
      <h2>Du är inbjuden till ${safeStable}</h2>
      <p>Skapa ett konto – eller logga in – med den här e-postadressen så kopplas du till stallet:</p>
      <p style="font-size:16px;font-weight:600">${safeEmail}</p>
      ${appUrl
        ? `<p>Är du ny? Välj <strong>Skapa konto → Har inbjudan</strong> och använd den inbjudna e-postadressen. Bekräfta sedan din e-post.</p><p><a href="${escapeHtml(appUrl)}">Öppna StableFlow</a></p>`
        : `<p>Öppna StableFlow i Expo Go via stallägarens QR-kod. Välj <strong>Skapa konto → Har inbjudan</strong>, använd denna e-post och kod, och bekräfta med koden från nästa mejl.</p>`}
      ${invite.code ? `<p>Din personliga inbjudningskod: <strong>${escapeHtml(invite.code)}</strong></p>` : ""}
      <p style="color:#64748b;font-size:13px">${expiresLabel}</p>
    </div>`;
  // Provider deduplication is time limited: Brevo 30 min, Resend 24 h.
  // No permanent once-only or inbox-delivery claim, and no automatic resend.
  try {
    signal.throwIfAborted();
    const res = await fetch(BREVO_API_KEY ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails", {
      method: "POST",
      headers: BREVO_API_KEY
        ? { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }
        : { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `stable-invite/${invite.id}` },
      body: JSON.stringify(BREVO_API_KEY ? {
        sender: { name: sender[1]?.trim() || "StableFlow", email: sender[2] ?? sender[3] },
        to: [{ email: invite.email }], subject, htmlContent: html, headers: { idempotencyKey: invite.id },
      } : { from: INVITE_FROM_EMAIL, to: invite.email, subject, html }),
      signal,
    });
    if (!res.ok) return unconfirmed("send_failed", res.status);
    const acknowledgement = await res.json();
    const id = BREVO_API_KEY ? acknowledgement?.messageId : acknowledgement?.id;
    if (typeof id !== "string" || !id.trim()) return unconfirmed("provider_ack_unverified");
    return { invite_id: invite.id, accepted: true };
  } catch { return unconfirmed("send_unconfirmed"); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "not_configured" }, 503);
  const isService = authorization === `Bearer ${SERVICE_ROLE_KEY}`;
  if (!isService && !ANON_KEY) return json({ error: "not_configured" }, 503);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      console.warn("[invite email] Tidsgräns; utskicket är inte bekräftat");
      resolve(json({ error: "send_unconfirmed" }, 504));
    }, 15_000);
  });
  const operation = async (): Promise<Response> => {
    const client = createClient(SUPABASE_URL, isService ? SERVICE_ROLE_KEY : ANON_KEY!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    let actorId: string | null = null;
    if (!isService) {
      const { data, error } = await client.auth.getUser(authorization.slice(7));
      if (error || !isUuid(data?.user?.id)) return json({ error: "unauthorized" }, 401);
      actorId = data.user.id;
      const { data: active, error: activeError } = await client.rpc("account_is_active").abortSignal(controller.signal);
      if (activeError || active !== true) return json({ error: "forbidden" }, 403);
    }
    let payload: Record<string, unknown>;
    try {
      const value = await req.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payload");
      payload = value;
    } catch { return json({ error: "bad_request" }, 400); }
    const legacy = isService && payload.type === "invite" && payload.record && typeof payload.record === "object";
    const ids = legacy ? [(payload.record as Record<string, unknown>).id] : payload.invite_ids;
    if ((!legacy && Object.keys(payload).some((key) => key !== "invite_ids")) || !Array.isArray(ids) ||
      ids.length < 1 || ids.length > 50 || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
      return json({ error: "bad_request" }, 400);
    }
    const { data: rows, error: inviteError } = await client.from("stable_invites")
      .select("id,stable_id,email,code,expires_at,accepted_at").in("id", ids).abortSignal(controller.signal);
    if (inviteError) throw new Error("Invite lookup failed");
    if (!Array.isArray(rows) || rows.length !== ids.length || ids.some((id) => !rows.some((row) => row.id === id))) {
      return json({ error: "invite_unavailable" }, 404);
    }
    const invites = rows as InviteRecord[];
    if (invites.some((invite) => !isUuid(invite.stable_id) || typeof invite.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email) || invite.accepted_at !== null ||
      (invite.expires_at !== null && (!Number.isFinite(Date.parse(invite.expires_at)) || Date.parse(invite.expires_at) <= Date.now())))) {
      return json({ error: "invite_unavailable" }, 409);
    }
    const stableIds = [...new Set(invites.map((invite) => invite.stable_id))];
    if (!isService) {
      for (const id of stableIds) {
        const { data: owner, error } = await client.rpc("is_stable_owner", { p_stable_id: id }).abortSignal(controller.signal);
        if (error || owner !== true) return json({ error: "forbidden" }, 403);
      }
    }
    const { data: stables, error: stableError } = await client.from("stables").select("id,name")
      .in("id", stableIds).abortSignal(controller.signal);
    if (stableError || !Array.isArray(stables) || stableIds.some((id) =>
      !stables.some((stable) => stable.id === id && typeof stable.name === "string" && stable.name.trim()))) {
      throw new Error("Stable lookup failed");
    }
    const results: EmailResult[] = [];
    for (const id of ids) {
      controller.signal.throwIfAborted();
      const invite = invites.find((row) => row.id === id)!;
      results.push(await sendEmail(invite, stables.find((stable) => stable.id === invite.stable_id)!.name, controller.signal));
    }
    const accepted = results.every((result) => result.accepted);
    if (legacy) {
      if (accepted) return json({ sent: true }, 200);
      const reason = results[0].reason!;
      return reason.endsWith("not_configured") ? json({ skipped: reason }, 200) : json({ error: "send_failed" }, 502);
    }
    return json({ actor_id: actorId, invite_ids: ids, accepted }, 200);
  };
  try { return await Promise.race([operation(), deadline]); }
  catch {
    console.error("[invite email] Inbjudningsutskicket kunde inte verifieras");
    return json({ error: "lookup_failed" }, 500);
  } finally { clearTimeout(timeout); }
});
