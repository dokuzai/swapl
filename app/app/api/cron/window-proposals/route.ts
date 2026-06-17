// Travel-window proposals digest (DOK-161). Walks every FUTURE TravelWindow
// not notified in the last 23h, recomputes its AI proposals (real, available,
// date-compatible homes), and — when a home that became listable SINCE the
// last notification matches — emails + pushes "we found a swap for your
// {month} trip". Stamps lastNotifiedAt on every processed window so reruns are
// no-ops (throttled + idempotent), mirroring the saved-searches digest.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { composeWindowProposals, WindowProposalError } from "@/lib/ai/window-proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THROTTLE_MS = 23 * 60 * 60 * 1000;
const log = createLogger("cron:window-proposals");

/** "June" — the month the trip falls in, for the notification copy. */
function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const now = new Date();
  const throttleCutoff = new Date(now.getTime() - THROTTLE_MS);

  // Future windows only (the trip hasn't started), past the throttle window.
  const due = await prisma.travelWindow.findMany({
    where: {
      dateFrom: { gte: now },
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: throttleCutoff } }],
    },
    include: { user: { select: { id: true, email: true } } },
    take: 200,
  });

  let sent = 0;
  for (const w of due) {
    // "New since last notified" baseline: first run looks back 24h so a fresh
    // window doesn't immediately fire on the whole back-catalogue.
    const since = w.lastNotifiedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let result;
    try {
      result = await composeWindowProposals(w);
    } catch (err) {
      if (err instanceof WindowProposalError) {
        // No active listing yet — nothing to propose; stamp and move on.
        await prisma.travelWindow.update({ where: { id: w.id }, data: { lastNotifiedAt: now } });
        continue;
      }
      log.error("compose failed", err, { windowId: w.id });
      continue;
    }

    // Only notify when at least one proposed home became listable SINCE the
    // last digest — otherwise the member already saw it. This is what makes
    // the digest "new homes available", not a daily re-ping.
    const freshListingIds = (
      await prisma.listing.findMany({
        where: { id: { in: result.proposals.map((p) => p.listingId) }, createdAt: { gte: since } },
        select: { id: true },
      })
    ).map((l) => l.id);
    const fresh = result.proposals.filter((p) => freshListingIds.includes(p.listingId));

    if (fresh.length === 0) {
      await prisma.travelWindow.update({ where: { id: w.id }, data: { lastNotifiedAt: now } });
      continue;
    }

    const month = monthLabel(w.dateFrom);
    const topCity = fresh[0].city;
    if (w.user.email) {
      sendEmail(emailTemplates.windowProposals(w.user.email, month, fresh.length, topCity), {
        kind: "windowProposals",
      }).catch((err) =>
        log.error("digest email failed", err, { windowId: w.id }),
      );
    }
    sendPush(w.user.id, pushTemplates.windowProposals(month, fresh.length, topCity)).catch((err) =>
      log.error("digest push failed", err, { windowId: w.id }),
    );

    await prisma.travelWindow.update({ where: { id: w.id }, data: { lastNotifiedAt: now } });
    sent++;
  }

  return NextResponse.json({ ok: true, processed: due.length, sent });
}
