// Builds affiliate URLs per partner from a small set of contextual inputs.
// Every URL gets UTM-tagged so we can reconcile click → conversion in the
// partner dashboards.

export type LinkContext = {
  partnerSlug: "skyscanner" | "airalo" | "getyourguide" | "battleface";
  destinationCity?: string;
  destinationCountry?: string;
  dateFrom?: string;
  dateTo?: string;
  campaign?: string;
  searchQuery?: string;
};

const AFF_IDS: Record<LinkContext["partnerSlug"], string | undefined> = {
  skyscanner: process.env.AFF_SKYSCANNER_ID,
  airalo: process.env.AFF_AIRALO_ID,
  getyourguide: process.env.AFF_GETYOURGUIDE_ID,
  battleface: process.env.AFF_BATTLEFACE_ID,
};

function withUtm(url: URL, ctx: LinkContext): string {
  url.searchParams.set("utm_source", "swapl");
  url.searchParams.set("utm_medium", "post_swap");
  if (ctx.campaign) url.searchParams.set("utm_campaign", ctx.campaign);
  if (ctx.destinationCity) url.searchParams.set("utm_content", ctx.destinationCity);
  return url.toString();
}

export function buildAffiliateUrl(ctx: LinkContext): string {
  switch (ctx.partnerSlug) {
    case "skyscanner": {
      // Generic flight search with destination prefilled where possible.
      const url = new URL(`https://www.skyscanner.com/transport/flights/`);
      if (ctx.destinationCity) url.searchParams.set("market", ctx.destinationCity);
      if (AFF_IDS.skyscanner) url.searchParams.set("associateid", AFF_IDS.skyscanner);
      return withUtm(url, ctx);
    }
    case "airalo": {
      const url = new URL(
        ctx.destinationCountry
          ? `https://www.airalo.com/${slug(ctx.destinationCountry)}-esim`
          : "https://www.airalo.com/"
      );
      if (AFF_IDS.airalo) url.searchParams.set("ref", AFF_IDS.airalo);
      return withUtm(url, ctx);
    }
    case "getyourguide": {
      // Search-aware link when we have a query (e.g. "Vinyl shops in Tokyo").
      const url = ctx.searchQuery
        ? new URL(`https://www.getyourguide.com/s/?q=${encodeURIComponent(ctx.searchQuery)}`)
        : new URL(`https://www.getyourguide.com/${ctx.destinationCity ? `${slug(ctx.destinationCity)}-l` : ""}`);
      if (AFF_IDS.getyourguide) url.searchParams.set("partner_id", AFF_IDS.getyourguide);
      return withUtm(url, ctx);
    }
    case "battleface": {
      const url = new URL("https://www.battleface.com/en-gb/");
      if (AFF_IDS.battleface) url.searchParams.set("ref", AFF_IDS.battleface);
      return withUtm(url, ctx);
    }
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
