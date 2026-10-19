import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { collectPushReceipts, MAX_RECEIPTS } from "../_shared/push-receipts.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedKey || req.headers.get("Authorization") !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }

  let limit = MAX_RECEIPTS;
  try {
    const text = await req.text();
    if (text.trim()) {
      const payload = JSON.parse(text);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)
        || Object.keys(payload).some(key => key !== "limit")
        || (payload.limit !== undefined && (!Number.isSafeInteger(payload.limit) || payload.limit < 1 || payload.limit > MAX_RECEIPTS))) {
        throw new Error("Invalid collector request");
      }
      limit = payload.limit ?? MAX_RECEIPTS;
    }
  } catch {
    console.error("[push receipts] Invalid collector request");
    return new Response(JSON.stringify({ error: "invalid_receipt_request" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Only database-claimed due tickets are read; no caller-supplied ticket/token IDs.
    const summary = await collectPushReceipts(supabase, crypto.randomUUID(), limit);
    return new Response(JSON.stringify(summary), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch {
    console.error("[push receipts] Collection failed", { category: "receipt_collection_failed" });
    return new Response(JSON.stringify({ error: "push_receipts_failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
