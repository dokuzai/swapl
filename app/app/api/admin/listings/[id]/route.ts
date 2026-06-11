import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/abilities";

const schema = z.object({ action: z.enum(["deactivate", "reactivate"]) });

// POST /api/admin/listings/[id] — toggle a listing's visibility.
// Browse (lib/listing-query) already filters on `isActive: true`, so a
// deactivated listing disappears from search the moment this lands.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/listings/[id]">) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantActive = parsed.data.action === "reactivate";
  if (listing.isActive === wantActive) {
    return NextResponse.json(
      { error: wantActive ? "Already active" : "Already inactive" },
      { status: 409 }
    );
  }

  await prisma.listing.update({ where: { id }, data: { isActive: wantActive } });
  return NextResponse.json({ ok: true });
}
