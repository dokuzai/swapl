// POST /api/webhooks/didit — Didit verification status updates.
//
// Same non-negotiables as the Stripe webhook:
//   1. Raw body — the HMAC (X-Signature, hex HMAC-SHA256 of the exact bytes)
//      breaks if the JSON is re-serialised, so we read `req.text()` first.
//   2. Replay safety — X-Timestamp older than 5 minutes is rejected, and
//      state transitions are idempotent (terminal states never regress), so
//      Didit can retry deliveries freely.
//
// Env-gated: without DIDIT_WEBHOOK_SECRET we cannot authenticate anything,
// so the endpoint answers 503 (and /api/verification/status polls instead).

import { NextResponse } from "next/server";
import { applyVerificationUpdate, diditConfig, verifyWebhookSignature } from "@/lib/verification/didit";
import { apiError, invalidInput } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { webhookSecret } = diditConfig();
  if (!webhookSecret) {
    return apiError(503, "DIDIT_WEBHOOK_SECRET not set");
  }

  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");
  if (!verifyWebhookSignature(raw, signature, timestamp, webhookSecret)) {
    return apiError(401, "Invalid signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return invalidInput("Invalid JSON");
  }

  const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  if (!sessionId || !status) return invalidInput("Missing session_id or status");

  try {
    const applied = await applyVerificationUpdate(sessionId, status, payload.decision ?? null);
    // Unknown session: acknowledge (200) so Didit doesn't retry forever —
    // it's simply not one of ours (e.g. another environment's workflow).
    if (!applied) return NextResponse.json({ ok: true, unknown: true });
    return NextResponse.json({ ok: true, status: applied.status, changed: applied.changed });
  } catch (err) {
    console.error("[didit:webhook] handler failed", err);
    // 500 → Didit retries. applyVerificationUpdate is idempotent, so that's safe.
    return apiError(500, "handler failed");
  }
}
