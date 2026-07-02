// POST /api/keys/stays/{id}/dispute — a Keys-stay party opens a dispute
//   ("report a problem" / resolution center). Mirrors the swap dispute route:
//   gated to the stay's guest/host, only while the stay is confirmed or
//   completed. Notifies the other party + the admin inbox.
// GET  /api/keys/stays/{id}/dispute — the party-facing case timeline.
//
// NOTE (follow-up): the dispute notification templates deep-link to a proposal
// (swapl://swaps/<id>). For a Keys stay there's no proposal, so we pass the stay
// id; the copy delivers fine but the deep link is proposal-shaped. This is
// harmless today (the iOS Keys-stay dispute screen isn't built yet) — add
// keys-aware templates / a keys deep link when that screen lands.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { forbidden, notFound, invalidInput, unauthenticated, unprocessable, rateLimited } from "@/lib/api/errors";
import { DISPUTE_CATEGORIES, isUrgentCategory, parsePhotos, disputeAdminRecipients } from "@/lib/disputes";

const createSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES),
  description: z.string().trim().min(1).max(4000),
  photos: z.array(z.string().url()).max(12).optional(),
});

async function loadStay(id: string) {
  return prisma.keysStay.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      guestId: true,
      hostId: true,
      guest: { select: { id: true, name: true, email: true } },
      host: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function POST(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/dispute">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  // Share the SAME per-user budget key as swap disputes so it can't be dodged
  // by mixing endpoints.
  const rl = checkRateLimit(`dispute-open:${session.userId}`, 5, 10 * 60 * 1000);
  if (!rl.ok)
    return rateLimited(
      "You've opened several cases in a short time. Please wait a few minutes, then try again — or call our 24/7 line if it's urgent.",
    );

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });

  const stay = await loadStay(id);
  if (!stay) return notFound("Stay not found");

  const isGuest = stay.guestId === session.userId;
  const isHost = stay.hostId === session.userId;
  if (!isGuest && !isHost) return forbidden();
  // A case can be opened during (confirmed) or after (completed) the stay.
  if (stay.status !== "confirmed" && stay.status !== "completed") {
    return unprocessable("You can open a case once the stay is confirmed.");
  }

  const dispute = await prisma.swapDispute.create({
    data: {
      keysStayId: id,
      openedById: session.userId,
      category: parsed.data.category,
      description: parsed.data.description,
      photos: JSON.stringify(parsed.data.photos ?? []),
    },
  });

  const urgent = isUrgentCategory(dispute.category);
  const other = isGuest ? stay.host : stay.guest;

  if (other.email) {
    sendEmail(emailTemplates.disputeOpened(other.email, stay.id, dispute.category, urgent)).catch((err) =>
      console.error("[keys-dispute:email:other]", err),
    );
  }
  sendPush(other.id, pushTemplates.disputeOpened(stay.id, dispute.category, urgent)).catch((err) =>
    console.error("[keys-dispute:push:other]", err),
  );

  disputeAdminRecipients()
    .then((recipients) => {
      for (const to of recipients) {
        sendEmail(emailTemplates.disputeOpenedAdmin(to, dispute.id, dispute.category, urgent)).catch((err) =>
          console.error("[keys-dispute:email:admin]", err),
        );
      }
    })
    .catch((err) => console.error("[keys-dispute:admin-recipients]", err));

  return NextResponse.json({
    ok: true,
    dispute: {
      id: dispute.id,
      category: dispute.category,
      urgent,
      status: dispute.status,
      description: dispute.description,
      photos: parsePhotos(dispute.photos),
      createdAt: dispute.createdAt.toISOString(),
    },
  });
}

export async function GET(req: Request, { params }: RouteContext<"/api/keys/stays/[id]/dispute">) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const stay = await loadStay(id);
  if (!stay) return notFound("Stay not found");
  if (stay.guestId !== session.userId && stay.hostId !== session.userId) return forbidden();

  const disputes = await prisma.swapDispute.findMany({
    where: { keysStayId: id },
    orderBy: { createdAt: "desc" },
    include: {
      openedBy: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    disputes: disputes.map((d) => ({
      id: d.id,
      category: d.category,
      urgent: isUrgentCategory(d.category),
      status: d.status,
      description: d.description,
      photos: parsePhotos(d.photos),
      resolution: d.resolution,
      openedBy: { id: d.openedBy.id, name: d.openedBy.name },
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      messages: d.messages.map((m) => ({
        id: m.id,
        authorId: m.authorId,
        authorName: m.author.name,
        body: m.body,
        photos: parsePhotos(m.photos),
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  });
}
