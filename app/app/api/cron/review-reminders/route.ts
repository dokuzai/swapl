// Review reminder sweep: for agreements COMPLETED at least 7 days ago where
// at least one party hasn't left a review yet, email + push that party a
// one-time "don't forget to review" nudge. reviewReminderSentAt stamps the
// agreement so reruns never double-send (idempotent).
//
// "Completed >= 7 days" is measured from dateTo: the completion cron flips
// agreements right after their stay window passes, so dateTo is the stable
// proxy for completion time without an extra column.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const log = createLogger("cron:review-reminders");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const cutoff = new Date(Date.now() - GRACE_MS);

  const due = await prisma.swapAgreement.findMany({
    where: {
      status: "COMPLETED",
      reviewReminderSentAt: null,
      dateTo: { lt: cutoff },
    },
    select: {
      id: true,
      proposalId: true,
      listing1: { select: { city: true, userId: true, user: { select: { email: true } } } },
      listing2: { select: { city: true, userId: true, user: { select: { email: true } } } },
      reviews: { select: { authorId: true } },
    },
    take: 200,
  });

  let reminded = 0;
  for (const a of due) {
    const reviewed = new Set(a.reviews.map((r) => r.authorId));
    // Each party stayed in the *other* listing's city.
    const pending = [
      { email: a.listing1.user.email, userId: a.listing1.userId, otherCity: a.listing2.city },
      { email: a.listing2.user.email, userId: a.listing2.userId, otherCity: a.listing1.city },
    ].filter((r) => !reviewed.has(r.userId));

    for (const r of pending) {
      if (r.email) {
        sendEmail(emailTemplates.reviewReminder(r.email, r.otherCity)).catch((err) =>
          log.error("reminder email failed", err, { agreementId: a.id, userId: r.userId })
        );
      }
      sendPush(r.userId, pushTemplates.reviewReminder(a.proposalId)).catch((err) =>
        log.error("reminder push failed", err, { agreementId: a.id, userId: r.userId })
      );
      reminded++;
    }

    // Stamp even when both parties already reviewed, so the sweep stops
    // re-selecting the agreement.
    await prisma.swapAgreement.update({
      where: { id: a.id },
      data: { reviewReminderSentAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, due: due.length, reminded });
}
