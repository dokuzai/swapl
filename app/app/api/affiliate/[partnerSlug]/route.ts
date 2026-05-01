// Server-side affiliate redirector. Logs the click BEFORE the redirect so
// blockers can't drop our analytics. Redirect URL is never echoed to the
// client; the user just gets a 302 to the partner.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { buildAffiliateUrl, type LinkContext } from "@/lib/affiliates/links";

const ALLOWED = new Set(["skyscanner", "airalo", "getyourguide", "battleface"]);

export async function GET(req: Request, { params }: RouteContext<"/api/affiliate/[partnerSlug]">) {
  const { partnerSlug } = await params;
  if (!ALLOWED.has(partnerSlug)) {
    return NextResponse.json({ error: "Unknown partner" }, { status: 404 });
  }

  const url = new URL(req.url);
  const destinationCity = url.searchParams.get("city") ?? undefined;
  const destinationCountry = url.searchParams.get("country") ?? undefined;
  const agreementId = url.searchParams.get("agreement") ?? undefined;
  const campaign = url.searchParams.get("utm_campaign") ?? undefined;

  const session = await getSession();
  const ctx: LinkContext = {
    partnerSlug: partnerSlug as LinkContext["partnerSlug"],
    destinationCity,
    destinationCountry,
    campaign,
  };
  const target = buildAffiliateUrl(ctx);

  // Best-effort logging — failures here must NEVER stop the redirect.
  prisma.affiliateClick
    .create({
      data: {
        userId: session?.userId ?? null,
        agreementId,
        partnerSlug,
        destinationCity,
        utmCampaign: campaign,
      },
    })
    .catch((err) => console.error("[affiliate:click]", err));

  return NextResponse.redirect(target, { status: 302 });
}
