// Periodic sweep: mark confirmed Keys stays as COMPLETED once their stay window
// has fully passed, then notify the host. Mirrors agreements-complete for swaps.
// Idempotent — select-then-update by id, and the update is still guarded on
// status "confirmed" so a concurrent sweep can never complete (or notify for)
// the same stay twice. Keys already moved at confirm time, so completion is a
// pure status transition + notification (no ledger writes). Flipping to
// "completed" is what surfaces the stay in the host's story (see lib/story.ts).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPush, pushTemplates } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { createLogger } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("cron:keys-stays-complete");

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const due = await prisma.keysStay.findMany({
    where: { status: "confirmed", dateTo: { lt: new Date() } },
    select: { id: true, hostId: true },
    take: 200,
  });

  if (due.length === 0) return NextResponse.json({ ok: true, completed: 0 });

  // Claim each stay individually with a status-guarded updateMany and notify the
  // host ONLY when THIS invocation flipped it (count === 1). A concurrent sweep
  // (or a manual re-run) that lost the race gets count 0 and sends no push, so
  // the host is notified exactly once even under overlapping runs.
  let completed = 0;
  for (const s of due) {
    const claimed = await prisma.keysStay.updateMany({
      where: { id: s.id, status: "confirmed" },
      data: { status: "completed" },
    });
    if (claimed.count !== 1) continue;
    completed++;
    sendPush(s.hostId, pushTemplates.keysStayCompleted(s.id)).catch((err) =>
      log.error("completion push failed", err, { stayId: s.id, hostId: s.hostId })
    );
  }

  return NextResponse.json({ ok: true, completed });
}
