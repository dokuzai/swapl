// Daily saved-search digest. Walks every saved search with alertEnabled=true
// older than 23 hours since last notification, runs the same filter pipeline
// as /listings, and emails any new matches added since lastNotifiedAt.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";
import { parseFiltersFromSearchParams } from "@/lib/listing-filters";
import { queryListings } from "@/lib/listing-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("cron:saved-searches");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const due = await prisma.savedSearch.findMany({
    where: {
      alertEnabled: true,
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: cutoff } }],
    },
    include: { user: { select: { email: true, name: true } } },
    take: 200,
  });

  let sent = 0;
  for (const s of due) {
    const params = Object.fromEntries(new URLSearchParams(s.query)) as Record<string, string>;
    const filters = parseFiltersFromSearchParams(params);
    const { items } = await queryListings(filters);
    const since = s.lastNotifiedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fresh = items.filter((it) => new Date(it.listing.availableFrom) >= since).slice(0, 5);
    if (fresh.length === 0) {
      await prisma.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: new Date() } });
      continue;
    }
    const lines = fresh.map(
      (it) => `• ${it.listing.neighbourhood} · ${it.listing.city} — ${it.listing.sizeSqm}m² sleeps ${it.listing.sleeps}`
    );
    sendEmail({
      to: s.user.email,
      subject: `${fresh.length} new homes match "${s.name}"`,
      text: `${fresh.length} new homes match your saved search "${s.name}":\n\n${lines.join("\n")}\n\nBrowse them: /listings?${s.query}`,
    }).catch((err) => log.error("digest email failed", err, { savedSearchId: s.id }));

    await prisma.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: new Date() } });
    sent++;
  }

  return NextResponse.json({ ok: true, processed: due.length, sent });
}
