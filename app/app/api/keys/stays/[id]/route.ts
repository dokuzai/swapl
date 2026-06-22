import { NextResponse } from "next/server";
import { prisma, parseJSON } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, notFound, unauthenticated } from "@/lib/api/errors";
import { publicContactChannels, ownContactChannels } from "@/lib/contact-channels";
import { publicCoord } from "@/lib/city-coords";

// GET /api/keys/stays/{id} — rich detail for one Stay-with-points, mirroring the
// swap trip view: the home's approximate area (fuzzed) + exact address, the
// counterpart's off-platform contacts, and the cover policy. Address + contacts
// unlock once the stay is CONFIRMED — the same reveal rule as an accepted swap.
// Only the stay's guest or host may read it.
export async function GET(req: Request, { params }: RouteContext<"/api/keys/stays/[id]">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const stay = await prisma.keysStay.findUnique({
    where: { id },
    include: {
      listing: {
        include: {
          user: { select: { id: true, name: true, avatar: true, contactChannels: true } },
          homeGuide: true,
        },
      },
      guest: { select: { id: true, name: true, avatar: true, contactChannels: true } },
      host: { select: { id: true, name: true, avatar: true, contactChannels: true } },
    },
  });
  if (!stay) return notFound("Stay not found");

  const isGuest = stay.guestId === session.userId;
  const isHost = stay.hostId === session.userId;
  if (!isGuest && !isHost) return forbidden();

  // Same gate as an accepted swap: the exact address + off-platform contacts are
  // hidden until the stay is confirmed, and re-lock if it's declined/cancelled.
  const unlocked = stay.status === "confirmed" || stay.status === "completed";

  const counterpart = isGuest ? stay.host : stay.guest;
  const photos = parseJSON<string[]>(stay.listing.photos, []);
  const area =
    stay.listing.lat != null && stay.listing.lng != null
      ? publicCoord(stay.listing.lat, stay.listing.lng, stay.listing.id)
      : null;

  return NextResponse.json({
    id: stay.id,
    role: isGuest ? "guest" : "host",
    kind: stay.kind,
    status: stay.status,
    dateFrom: stay.dateFrom.toISOString(),
    dateTo: stay.dateTo.toISOString(),
    nights: stay.nights,
    keysCost: stay.keysCost,
    insurancePolicyId: stay.insurancePolicyId,
    listing: {
      id: stay.listing.id,
      title: stay.listing.title,
      city: stay.listing.city,
      neighbourhood: stay.listing.neighbourhood,
      photo: photos[0] ?? null,
      // Fuzzed area coords (never the exact pin) — safe to show the map always.
      lat: area?.lat ?? null,
      lng: area?.lng ?? null,
      // Exact address only once confirmed.
      address: unlocked ? stay.listing.address ?? null : null,
    },
    counterpart: {
      name: counterpart?.name ?? null,
      avatar: counterpart?.avatar ?? null,
      contactChannels: publicContactChannels(counterpart?.contactChannels, { unlocked }),
      hasContactChannels: Object.keys(ownContactChannels(counterpart?.contactChannels)).length > 0,
    },
  });
}
