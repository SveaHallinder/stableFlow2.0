import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sends a stable invite by email (via Resend). Invoked by the `notify_invite`
// trigger on insert into public.stable_invites. Safe to deploy before RESEND_API_KEY
// is configured: it logs and returns 200 (skipped) so invite creation never fails.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL =
  Deno.env.get("INVITE_FROM_EMAIL") ?? "StableFlow <no-reply@stableflow.se>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.stableflow.se";

interface InviteRecord {
  id: string;
  stable_id: string | null;
  email: string;
  code: string | null;
  role: string | null;
  expires_at: string | null;
}

interface InvitePayload {
  type: "invite";
  record: InviteRecord;
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(expectedKey) && authHeader === `Bearer ${expectedKey}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!isAuthorized(req)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: InvitePayload;
  try {
    payload = (await req.json()) as InvitePayload;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const invite = payload?.record;
  const email = invite?.email?.trim();
  if (!email) {
    return json({ skipped: "no_email" }, 200);
  }

  // Resolve the stable name for the email body.
  let stableName = "ett stall";
  if (invite.stable_id) {
    const { data } = await supabase
      .from("stables")
      .select("name")
      .eq("id", invite.stable_id)
      .single();
    if (data?.name) {
      stableName = data.name;
    }
  }

  // No provider configured yet — don't fail invite creation, just log.
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured — invite email not sent", {
      invite_id: invite.id,
    });
    return json({ skipped: "resend_not_configured" }, 200);
  }

  // Acceptance is email-based: accept_pending_invites matches the invitee's address
  // on signup/login, so the invite is claimed automatically — no manual code entry.
  const safeStable = escapeHtml(stableName);
  const safeEmail = escapeHtml(email);
  const subject = `Du är inbjuden till ${stableName} på StableFlow`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto">
      <h2>Du är inbjuden till ${safeStable}</h2>
      <p>Du har bjudits in till stallet <strong>${safeStable}</strong> på StableFlow.</p>
      <p>Skapa ett konto – eller logga in – med den här e-postadressen så kopplas du automatiskt till stallet:</p>
      <p style="font-size:16px;font-weight:600;background:#f1f5f9;padding:12px 16px;border-radius:10px;text-align:center">${safeEmail}</p>
      <p><a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Öppna StableFlow</a></p>
      <p style="color:#64748b;font-size:13px">Inbjudan slutar gälla efter 14 dagar.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: INVITE_FROM_EMAIL, to: email, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend send failed", res.status, text);
    return json({ error: "send_failed", status: res.status }, 502);
  }

  return json({ sent: true }, 200);
});
