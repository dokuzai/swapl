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

  // Select first so we know which stays transitioned (updateMany only reports a
  // count) — the host notification goes to those ids only.
  const due = await prisma.keysStay.findMany({
    where: { status: "confirmed", dateTo: { lt: new Date() } },
    select: { id: true, hostId: true },
    take: 200,
  });

  if (due.length === 0) return NextResponse.json({ ok: true, completed: 0 });

  // Status guard keeps the transition idempotent even if another sweep ran
  // between the select and this update.
  const result = await prisma.keysStay.updateMany({
    where: { id: { in: due.map((s) => s.id) }, status: "confirmed" },
    data: { status: "completed" },
  });

  for (const s of due) {
    sendPush(s.hostId, pushTemplates.keysStayCompleted(s.id)).catch((err) =>
      log.error("completion push failed", err, { stayId: s.id, hostId: s.hostId })
    );
  }

  return NextResponse.json({ ok: true, completed: result.count });
}
