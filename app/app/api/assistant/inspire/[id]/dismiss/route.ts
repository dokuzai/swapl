// POST /api/assistant/inspire/{id}/dismiss — the user passes on a draft
// package. Kept as a row (status "dismissed") so future composition can
// learn from in-app signals without any external data.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { notFound, unauthenticated, unprocessable } from "@/lib/api/errors";

export async function POST(req: Request, { params }: RouteContext<"/api/assistant/inspire/[id]/dismiss">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const pkg = await prisma.inspirationPackage.findUnique({ where: { id } });
  if (!pkg || pkg.userId !== session.userId) return notFound("Package not found");
  if (pkg.status !== "draft") {
    return unprocessable("PACKAGE_NOT_DRAFT", { message: `This package is already ${pkg.status}.` });
  }

  await prisma.inspirationPackage.update({ where: { id: pkg.id }, data: { status: "dismissed" } });
  return NextResponse.json({ ok: true });
}
