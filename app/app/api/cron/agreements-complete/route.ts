// Periodic sweep: mark ACTIVE swap agreements as COMPLETED once their stay
// window has fully passed, then nudge both parties to leave a review.
// Idempotent — select-then-update by id, and the update is still guarded on
// status ACTIVE so a concurrent sweep can never complete (or notify for) the
// same agreement twice.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("cron:agreements-complete");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Select first so we know exactly which agreements transitioned (updateMany
  // alone only reports a count) — notifications go to those ids only.
  const due = await prisma.swapAgreement.findMany({
    where: { status: "ACTIVE", dateTo: { lt: new Date() } },
    select: {
      id: true,
      proposalId: true,
      listing1: { select: { city: true, userId: true, user: { select: { email: true } } } },
      listing2: { select: { city: true, userId: true, user: { select: { email: true } } } },
    },
    take: 200,
  });

  if (due.length === 0) return NextResponse.json({ ok: true, completed: 0 });

  // Status guard keeps the transition idempotent even if another sweep ran
  // between the select and this update.
  const result = await prisma.swapAgreement.updateMany({
    where: { id: { in: due.map((a) => a.id) }, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });

  for (const a of due) {
    // Each party stayed in the *other* listing's city.
    const recipients = [
      { email: a.listing1.user.email, userId: a.listing1.userId, otherCity: a.listing2.city },
      { email: a.listing2.user.email, userId: a.listing2.userId, otherCity: a.listing1.city },
    ];
    for (const r of recipients) {
      if (r.email) {
        sendEmail(emailTemplates.swapCompleted(r.email, r.otherCity)).catch((err) =>
          log.error("completion email failed", err, { agreementId: a.id, userId: r.userId })
        );
      }
      sendPush(r.userId, pushTemplates.swapCompleted(a.proposalId)).catch((err) =>
        log.error("completion push failed", err, { agreementId: a.id, userId: r.userId })
      );
    }
  }

  return NextResponse.json({ ok: true, completed: result.count });
}
