// PATCH /api/assistant/inspire/{id}/items — toggle items of a DRAFT package
// on/off before confirming. Accepts a single { itemId, selected } or
// { items: [{ itemId, selected }, …] }. Confirm/checkout/charge all read the
// selections that are current at their time, so this is the single edit point.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { invalidInput, notFound, unauthenticated, unprocessable } from "@/lib/api/errors";
import { payableSummary, type InspirePayload } from "@/lib/ai/inspire";

const toggle = z.object({ itemId: z.string().min(1), selected: z.boolean() });
const schema = z.union([toggle, z.object({ items: z.array(toggle).min(1).max(50) })]);

export async function PATCH(req: Request, { params }: RouteContext<"/api/assistant/inspire/[id]/items">) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const { id } = await params;
  const pkg = await prisma.inspirationPackage.findUnique({ where: { id } });
  if (!pkg || pkg.userId !== session.userId) return notFound("Package not found");
  if (pkg.status !== "draft") {
    return unprocessable("PACKAGE_NOT_DRAFT", { message: `This package is already ${pkg.status}.` });
  }
  // Lock item edits once a payment selection exists. Treat a null/unset
  // paymentStatus as "none" so drafts predating the field (and fresh drafts
  // before any checkout) stay editable — only a started checkout locks them.
  if (pkg.setupIntentId || (pkg.paymentStatus ?? "none") !== "none") {
    return unprocessable("PAYMENT_SELECTION_LOCKED", {
      message: "Payable items are locked after checkout starts.",
    });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });
  const toggles = "items" in parsed.data ? parsed.data.items : [parsed.data];

  let payload: InspirePayload;
  try {
    payload = JSON.parse(pkg.payload);
  } catch {
    return unprocessable("PACKAGE_CORRUPT");
  }

  const byId = new Map<string, { selected: boolean }>();
  for (const list of [payload.experiences ?? [], payload.services ?? [], payload.addOns ?? []]) {
    for (const item of list) byId.set(item.id, item);
  }
  for (const t of toggles) {
    const item = byId.get(t.itemId);
    if (!item) return invalidInput(`Unknown itemId: ${t.itemId}`);
    item.selected = t.selected;
  }

  await prisma.inspirationPackage.update({
    where: { id: pkg.id },
    data: { payload: JSON.stringify(payload) },
  });

  const { totalCents, currency } = payableSummary(payload);
  return NextResponse.json({
    ok: true,
    items: {
      experiences: (payload.experiences ?? []).map(({ id, selected }) => ({ id, selected })),
      services: (payload.services ?? []).map(({ id, selected }) => ({ id, selected })),
      addOns: (payload.addOns ?? []).map(({ id, selected }) => ({ id, selected })),
    },
    payable: { totalCents, currency },
  });
}
