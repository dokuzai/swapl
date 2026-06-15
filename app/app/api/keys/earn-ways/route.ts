import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import { earnWaysFor } from "@/lib/keys/earn-ways";

// GET /api/keys/earn-ways — the catalogue of ways to earn Keys (DOK-164) with
// per-user done/to-do state and the identity-gate status. Powers the "modi per
// guadagnare Keys" UI. The amounts/caps/gating live in lib/keys/config.ts so
// this list can never drift from the actual ledger hooks.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const payload = await earnWaysFor(session.userId);
  return NextResponse.json(payload);
}
