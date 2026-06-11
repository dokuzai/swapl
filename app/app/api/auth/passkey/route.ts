// GET /api/auth/passkey — list the caller's passkeys.
//
// AUTHENTICATED. Returns the same PasskeySummary shape the register/verify
// endpoint emits, so native clients can render the same list the web
// account page shows (and feed ids into DELETE /api/auth/passkey/{id}).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { unauthenticated } from "@/lib/api/errors";
import { toPasskeySummary } from "@/lib/auth/passkeys";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ passkeys: credentials.map(toPasskeySummary) });
}
