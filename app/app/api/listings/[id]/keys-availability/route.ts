import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { notFound, unauthenticated } from "@/lib/api/errors";
import { keysAvailability, KeysStayError } from "@/lib/keys/stay";

// GET /api/listings/{id}/keys-availability — bookable dates + nightly Keys for
// a Stay-with-Keys (non-simultaneous) on this listing. Public to signed-in
// members so they can plan a stay before requesting it.
export async function GET(req: Request, { params }: RouteContext<"/api/listings/[id]/keys-availability">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  try {
    const result = await keysAvailability(id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof KeysStayError && err.code === "LISTING_NOT_FOUND") {
      return notFound("Listing not found");
    }
    throw err;
  }
}
