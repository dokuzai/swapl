// POST /api/admin/signups/invite — admin-only batch invite for the beta
// waitlist. Picks the oldest signups that are neither registered (userId)
// nor already invited (invitedAt), sends the betaInvite email to each
// (best-effort, like every other transactional send) and stamps invitedAt.
//
// Body: { limit?: number }  — default 50, capped at 200.
// Reply: { ok: true, invited: n, remaining: n }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";
import { sendEmail, emailTemplates } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawLimit = (body as { limit?: unknown } | null)?.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  // Oldest first — first on the waitlist gets invited first.
  const batch = await prisma.betaSignup.findMany({
    where: { userId: null, invitedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const signup of batch) {
    // Best-effort send (same pattern as the welcome email) — the stamp goes
    // in regardless so a flaky transport can't cause duplicate invites.
    sendEmail(emailTemplates.betaInvite(signup.email)).catch((err) =>
      console.error("[admin:beta-invite]", signup.email, err)
    );
  }

  if (batch.length > 0) {
    await prisma.betaSignup.updateMany({
      where: { id: { in: batch.map((s) => s.id) } },
      data: { invitedAt: new Date() },
    });
  }

  const remaining = await prisma.betaSignup.count({
    where: { userId: null, invitedAt: null },
  });

  return NextResponse.json({ ok: true, invited: batch.length, remaining });
}
