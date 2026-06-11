// Didit identity verification (KYC) — Sessions API v3 adapter.
// https://docs.didit.me — base https://verification.didit.me
//
// Env-gated with graceful degradation:
//   DIDIT_API_KEY        — auth for the Sessions API (x-api-key header).
//   DIDIT_WORKFLOW_ID    — required by POST /v3/session/ (`workflow_id` is a
//                          mandatory body field), so the feature stays OFF
//                          until both are set.
//   DIDIT_WEBHOOK_SECRET — HMAC key for POST /api/webhooks/didit. When unset
//                          the webhook answers 503 and GET
//                          /api/verification/status falls back to polling
//                          Didit directly.
//
// All env reads happen at call time (not module load) so tests and serverless
// cold starts see the live environment.

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

const DIDIT_BASE_URL = "https://verification.didit.me";

// Reject webhooks whose X-Timestamp is further than this from now (docs:
// "Reject if abs(now - X-Timestamp) > 300").
const WEBHOOK_TOLERANCE_SECONDS = 300;

export type VerificationStatus = "pending" | "approved" | "declined" | "expired";

export function diditConfig() {
  const apiKey = process.env.DIDIT_API_KEY || null;
  const workflowId = process.env.DIDIT_WORKFLOW_ID || null;
  const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || null;
  return {
    apiKey,
    workflowId,
    webhookSecret,
    enabled: Boolean(apiKey && workflowId),
  };
}

export function diditEnabled(): boolean {
  return diditConfig().enabled;
}

// Collapse Didit's status vocabulary onto our 4-state model. Anything still
// in flight ("Not Started", "In Progress", "In Review", "Resubmitted",
// "Awaiting User") stays pending.
export function mapDiditStatus(diditStatus: string): VerificationStatus {
  switch (diditStatus) {
    case "Approved":
      return "approved";
    case "Declined":
      return "declined";
    case "Expired":
    case "KYC Expired":
    case "Kyc Expired":
    case "Abandoned":
      return "expired";
    default:
      return "pending";
  }
}

const TERMINAL: ReadonlySet<VerificationStatus> = new Set(["approved", "declined", "expired"]);

export function isTerminal(status: VerificationStatus): boolean {
  return TERMINAL.has(status);
}

// ---------- Sessions API ----------

export class DiditNotConfigured extends Error {
  constructor() {
    super("Didit verification is not configured (DIDIT_API_KEY / DIDIT_WORKFLOW_ID)");
  }
}

export type CreatedSession = { sessionId: string; url: string };

/**
 * POST /v3/session/ — start a hosted verification flow for `userId`, persist
 * the IdentityVerification row, and return the hosted URL to redirect to.
 * `vendor_data` carries our user id so webhooks can be cross-checked.
 */
export async function createSession(userId: string, callbackUrl: string): Promise<CreatedSession> {
  const { apiKey, workflowId, enabled } = diditConfig();
  if (!enabled) throw new DiditNotConfigured();

  const res = await fetch(`${DIDIT_BASE_URL}/v3/session/`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: userId,
      callback: callbackUrl,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Didit create session failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { session_id?: string; url?: string; status?: string };
  if (!json.session_id || !json.url) {
    throw new Error("Didit create session: unexpected response shape");
  }

  await prisma.identityVerification.create({
    data: {
      userId,
      provider: "didit",
      sessionId: json.session_id,
      status: json.status ? mapDiditStatus(json.status) : "pending",
    },
  });

  return { sessionId: json.session_id, url: json.url };
}

export type SessionSnapshot = {
  status: VerificationStatus;
  diditStatus: string;
  // Hosted flow URL (`session_url`) — used to re-send a user back into a
  // still-pending session instead of opening a new one.
  url: string | null;
  raw: Record<string, unknown>;
};

/**
 * GET /v3/session/{id}/decision/ — current state of a session. Polling
 * fallback for when no webhook secret is configured (or the webhook missed).
 */
export async function getSessionStatus(sessionId: string): Promise<SessionSnapshot> {
  const { apiKey, enabled } = diditConfig();
  if (!enabled) throw new DiditNotConfigured();

  const res = await fetch(`${DIDIT_BASE_URL}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    method: "GET",
    headers: { "x-api-key": apiKey! },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Didit get session failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const diditStatus = typeof json.status === "string" ? json.status : "";
  return {
    status: mapDiditStatus(diditStatus),
    diditStatus,
    url: typeof json.session_url === "string" ? json.session_url : null,
    raw: json,
  };
}

// ---------- Webhook signature (X-Signature: HMAC-SHA256 over raw bytes) ----------

/**
 * Verify a Didit webhook: HMAC-SHA256 of the exact raw body, hex-encoded,
 * sent in `X-Signature`; `X-Timestamp` (unix seconds) must be within 5
 * minutes of now (replay protection). Constant-time comparison.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!signature || !timestamp) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- State transitions ----------

export type AppliedUpdate = {
  id: string;
  userId: string;
  status: VerificationStatus;
  changed: boolean;
};

/**
 * Apply a provider status to the IdentityVerification row for `sessionId`
 * and derive User.verified/verifiedAt on approval. Idempotent: replays and
 * out-of-order deliveries after a terminal state are no-ops, so the webhook
 * can be retried freely.
 *
 * Returns null when the session is unknown (not ours / already pruned).
 */
export async function applyVerificationUpdate(
  sessionId: string,
  diditStatus: string,
  decision?: unknown
): Promise<AppliedUpdate | null> {
  const row = await prisma.identityVerification.findUnique({ where: { sessionId } });
  if (!row) return null;

  const next = mapDiditStatus(diditStatus);
  const current = row.status as VerificationStatus;

  // Terminal states never regress (a late "In Progress" replay must not
  // reopen an approved row), and identical replays are dropped.
  if (current === next || isTerminal(current)) {
    return { id: row.id, userId: row.userId, status: current, changed: false };
  }

  const completedAt = isTerminal(next) ? new Date() : null;
  await prisma.identityVerification.update({
    where: { id: row.id },
    data: {
      status: next,
      decision: decision === undefined ? undefined : JSON.stringify(decision),
      completedAt,
    },
  });

  if (next === "approved") {
    await prisma.user.update({
      where: { id: row.userId },
      data: { verified: true, verifiedAt: completedAt },
    });
  }

  return { id: row.id, userId: row.userId, status: next, changed: true };
}
