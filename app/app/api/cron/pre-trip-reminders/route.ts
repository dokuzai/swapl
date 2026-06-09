// Pre-trip reminder sweep: for ACTIVE agreements starting within the next
// 48 hours that haven't been reminded yet, email + push both parties their
// 48h heads-up, then stamp preTripReminderSentAt so reruns never double-send.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const now = new Date();
  const horizon = new Date(now.getTime() + WINDOW_MS);

  const due = await prisma.swapAgreement.findMany({
    where: {
      status: "ACTIVE",
      preTripReminderSentAt: null,
      dateFrom: { gte: now, lte: horizon },
    },
    include: {
      listing1: { select: { city: true, userId: true, user: { select: { email: true } } } },
      listing2: { select: { city: true, userId: true, user: { select: { email: true } } } },
    },
    take: 200,
  });

  let sent = 0;
  for (const a of due) {
    // Party 1 owns listing1 and travels to listing2's city, and vice versa.
    const recipients = [
      { email: a.listing1.user.email, userId: a.listing1.userId, destinationCity: a.listing2.city },
      { email: a.listing2.user.email, userId: a.listing2.userId, destinationCity: a.listing1.city },
    ];
    for (const r of recipients) {
      if (r.email) {
        sendEmail(emailTemplates.preTripReminder(r.email, r.destinationCity, a.dateFrom)).catch(
          (err) => console.error("[pre-trip:email]", err)
        );
      }
      sendPush(r.userId, pushTemplates.preTripReminder(a.proposalId, r.destinationCity)).catch(
        (err) => console.error("[pre-trip:push]", err)
      );
    }
    await prisma.swapAgreement.update({
      where: { id: a.id },
      data: { preTripReminderSentAt: new Date() },
    });
    sent++;
  }

  return NextResponse.json({ ok: true, due: due.length, sent });
}
