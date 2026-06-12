// Static metadata for the affiliate partner catalogue surfaced by
// GET /api/discover/services. One entry per seeded partner — the same four
// slugs lib/affiliates/links.ts and /api/affiliate/[partnerSlug] accept.
//
// Env-gated: a partner is "configured" only when its AFF_* id is set.
// process.env is read at call time (not module load) so the gate reacts to
// vi.stubEnv in tests and to per-environment config in prod.

export type PartnerSlug = "skyscanner" | "airalo" | "getyourguide" | "battleface";

export type PartnerCategory = "flights" | "esim" | "experiences" | "insurance";

export type PartnerMeta = {
  slug: PartnerSlug;
  name: string;
  category: PartnerCategory;
  tagline: string;
  /** Client-side icon selector — a hint, never a URL. */
  iconHint: string;
  /** Env var holding the affiliate id; unset → partner hidden everywhere. */
  envVar: string;
};

export const PARTNER_REGISTRY: readonly PartnerMeta[] = [
  {
    slug: "skyscanner",
    name: "Skyscanner",
    category: "flights",
    tagline: "Compare flights from anywhere to your swap city.",
    iconHint: "plane",
    envVar: "AFF_SKYSCANNER_ID",
  },
  {
    slug: "airalo",
    name: "Airalo",
    category: "esim",
    tagline: "Instant eSIM data for your destination — no roaming bills.",
    iconHint: "sim",
    envVar: "AFF_AIRALO_ID",
  },
  {
    slug: "getyourguide",
    name: "GetYourGuide",
    category: "experiences",
    tagline: "Museums, tours and experiences, hand-picked by GetYourGuide.",
    iconHint: "ticket",
    envVar: "AFF_GETYOURGUIDE_ID",
  },
  {
    slug: "battleface",
    name: "battleface",
    category: "insurance",
    tagline: "Travel insurance built for trips that aren't package holidays.",
    iconHint: "shield",
    envVar: "AFF_BATTLEFACE_ID",
  },
] as const;

export function isPartnerConfigured(partner: PartnerMeta): boolean {
  return Boolean(process.env[partner.envVar]);
}

/** The partners that may be shown to users right now (AFF_* id present). */
export function configuredPartners(): PartnerMeta[] {
  return PARTNER_REGISTRY.filter(isPartnerConfigured);
}
