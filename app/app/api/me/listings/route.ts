// The caller's own listings (multi-property hosts). Returns every active
// listing they own, with exact coordinates (it's their own data).

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getViewerListings } from "@/lib/listing-query";
import { unauthenticated } from "@/lib/api/errors";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();
  const items = await getViewerListings(session.userId);
  return NextResponse.json({ items });
}
