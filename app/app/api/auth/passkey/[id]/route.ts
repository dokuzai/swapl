// DELETE /api/auth/passkey/{id} — remove one of the caller's passkeys.
//
// AUTHENTICATED; the WHERE clause is scoped to the session user so nobody
// can delete someone else's credential by guessing ids.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated, notFound } from "@/lib/api/errors";

export async function DELETE(req: Request, { params }: RouteContext<"/api/auth/passkey/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const deleted = await prisma.webAuthnCredential.deleteMany({
    where: { id, userId: session.userId },
  });
  if (deleted.count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
