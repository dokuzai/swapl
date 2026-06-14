// Trip nudges sweep (DOK-152). Two best-effort, once-each reminders for ACTIVE
// agreements:
//   1. T-7d "complete your home guide" — to a party whose OWN guide is still
//      incomplete. Stamped via guideReminderSentAt so it never repeats.
//   2. Day-of check-in nudge — on the dateFrom day, if NO party has checked in
//      yet, nudge both. Stamped via checkInNudgeSentAt (once per agreement).
// Both are independent of preTripReminderSentAt so they never collide.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { homeGuideComplete } from "@/lib/trip/phase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const log = createLogger("cron:trip-nudges");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const now = new Date();
  let guideReminders = 0;
  let checkInNudges = 0;

  // ---- 1. Home-guide reminders (T-7d, incomplete guide) ----
  const guideHorizon = new Date(now.getTime() + SEVEN_DAYS_MS);
  const guideDue = await prisma.swapAgreement.findMany({
    where: {
      status: "ACTIVE",
      guideReminderSentAt: null,
      dateFrom: { gte: now, lte: guideHorizon },
    },
    include: {
      listing1: { include: { user: { select: { id: true, email: true } }, homeGuide: true } },
      listing2: { include: { user: { select: { id: true, email: true } }, homeGuide: true } },
    },
    take: 200,
  });

  for (const a of guideDue) {
    // Each side hosts in its OWN listing — remind the owner whose guide is
    // incomplete. The "guestCity" copy is the host's own city (where the guest
    // is arriving).
    const sides = [
      { user: a.listing1.user, guide: a.listing1.homeGuide, city: a.listing1.city },
      { user: a.listing2.user, guide: a.listing2.homeGuide, city: a.listing2.city },
    ];
    for (const s of sides) {
      if (homeGuideComplete(s.guide)) continue;
      if (s.user.email) {
        sendEmail(emailTemplates.homeGuideReminder(s.user.email, s.city)).catch((err) =>
          log.error("guide reminder email failed", err, { agreementId: a.id, userId: s.user.id }),
        );
      }
      sendPush(s.user.id, pushTemplates.homeGuideReminder(a.proposalId, s.city)).catch((err) =>
        log.error("guide reminder push failed", err, { agreementId: a.id, userId: s.user.id }),
      );
      guideReminders++;
    }
    await prisma.swapAgreement.update({
      where: { id: a.id },
      data: { guideReminderSentAt: new Date() },
    });
  }

  // ---- 2. Day-of check-in nudge (no check-in yet) ----
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const nudgeDue = await prisma.swapAgreement.findMany({
    where: {
      status: "ACTIVE",
      checkInNudgeSentAt: null,
      dateFrom: { gte: dayStart, lt: dayEnd },
    },
    include: {
      listing1: { select: { city: true, user: { select: { id: true, email: true } } } },
      listing2: { select: { city: true, user: { select: { id: true, email: true } } } },
      checkEvents: { where: { type: "checkin" }, select: { id: true } },
    },
    take: 200,
  });

  for (const a of nudgeDue) {
    if (a.checkEvents.length > 0) {
      // Someone already checked in — stamp so we don't reconsider it.
      await prisma.swapAgreement.update({
        where: { id: a.id },
        data: { checkInNudgeSentAt: new Date() },
      });
      continue;
    }
    // Each party travels to the OTHER listing's city.
    const recipients = [
      { user: a.listing1.user, destinationCity: a.listing2.city },
      { user: a.listing2.user, destinationCity: a.listing1.city },
    ];
    for (const r of recipients) {
      if (r.user.email) {
        sendEmail(emailTemplates.checkInNudge(r.user.email, r.destinationCity)).catch((err) =>
          log.error("check-in nudge email failed", err, { agreementId: a.id, userId: r.user.id }),
        );
      }
      sendPush(r.user.id, pushTemplates.checkInNudge(a.proposalId, r.destinationCity)).catch((err) =>
        log.error("check-in nudge push failed", err, { agreementId: a.id, userId: r.user.id }),
      );
      checkInNudges++;
    }
    await prisma.swapAgreement.update({
      where: { id: a.id },
      data: { checkInNudgeSentAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, guideReminders, checkInNudges });
}
