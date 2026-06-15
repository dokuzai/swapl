// GET /api/admin/property-verifications — the owner-verification review queue
// (DOK-162), optionally filtered by status. Web session + swapl_admin gate.
// Internal admin surface; backs the back-office review UI and tooling.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/auth/abilities";

const STATUSES = ["pending", "approved", "rejected"] as const;

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: msg === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const rows = await prisma.propertyVerification.findMany({
    where: status && (STATUSES as readonly string[]).includes(status) ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      listing: { select: { id: true, title: true, city: true, country: true, ownerVerified: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const items = rows.map((r) => {
    let documents: unknown = [];
    try {
      documents = JSON.parse(r.documents);
    } catch {
      documents = [];
    }
    return {
      id: r.id,
      status: r.status,
      documents,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      listing: r.listing,
      user: r.user,
    };
  });

  return NextResponse.json({ items });
}
