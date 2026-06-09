// Admin-only CSV export of every BetaSignup row, newest first. Useful for
// founder spreadsheets / cohort analysis ahead of the September launch.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(value: string | null | undefined): string {
  const s = value ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const rows = await prisma.betaSignup.findMany({ orderBy: { createdAt: "desc" } });

  const header = [
    "email",
    "source",
    "medium",
    "campaign",
    "term",
    "content",
    "landingPage",
    "referrer",
    "userId",
    "createdAt",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.email),
        csvCell(r.source),
        csvCell(r.medium),
        csvCell(r.campaign),
        csvCell(r.term),
        csvCell(r.content),
        csvCell(r.landingPage),
        csvCell(r.referrer),
        csvCell(r.userId),
        r.createdAt.toISOString(),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="swapl-beta-signups-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
