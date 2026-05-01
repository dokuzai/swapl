// Idempotently provisions the monetization-v1 reference data in the
// configured Postgres database. Uses raw `pg` so it works regardless of
// which Prisma client the local install was generated against.
//
//   DATABASE_URL_TARGET="postgres://…" tsx scripts/bootstrap-monetization-prod.ts

import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const TARGET_URL = process.env.DATABASE_URL_TARGET ?? process.env.DATABASE_URL;
if (!TARGET_URL || !TARGET_URL.startsWith("postgres")) {
  console.error("Set DATABASE_URL_TARGET to your Postgres connection string.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: TARGET_URL });

// Mirror of the seed catalog. Keep in lockstep with prisma/seed.ts.
const PLANS = [
  { id: "free", label: "Free",       monthlyCents: 0,    yearlyCents: 0,     maxListings: 1, maxProposalsMonth: 3, prioritySearch: "standard", fullFilters: false, calendarSync: false, matchBreakdown: false, listingAnalytics: false, multiHomeTeams: false },
  { id: "plus", label: "swapl Plus", monthlyCents: 1200, yearlyCents: 9900,  maxListings: 3, maxProposalsMonth: 0, prioritySearch: "priority", fullFilters: true,  calendarSync: true,  matchBreakdown: true,  listingAnalytics: false, multiHomeTeams: false },
  { id: "pro",  label: "swapl Pro",  monthlyCents: 2900, yearlyCents: 24900, maxListings: 0, maxProposalsMonth: 0, prioritySearch: "top",      fullFilters: true,  calendarSync: true,  matchBreakdown: true,  listingAnalytics: true,  multiHomeTeams: true },
];

const PARTNERS = [
  { slug: "skyscanner",   name: "Skyscanner",   category: "flights",    baseUrl: "https://www.skyscanner.com/transport/flights/", trackingParam: "associateid", commissionModel: "cpa" },
  { slug: "airalo",       name: "Airalo",       category: "esim",       baseUrl: "https://www.airalo.com/",                       trackingParam: "ref",         commissionModel: "rev_share" },
  { slug: "getyourguide", name: "GetYourGuide", category: "activities", baseUrl: "https://www.getyourguide.com/s/",               trackingParam: "partner_id",  commissionModel: "percent_booking" },
  { slug: "battleface",   name: "Battleface",   category: "insurance",  baseUrl: "https://www.battleface.com/en-gb/",             trackingParam: "ref",         commissionModel: "percent_booking" },
];

const ADDONS = [
  { slug: "cleaning-mid", name: "Pre-stay cleaning",  description: "Mid-size home, 90-minute professional clean before arrival.", priceCents: 6900, type: "flat_fee",  provider: "swapl",        category: "cleaning" },
  { slug: "lockbox",      name: "Smart key lockbox",  description: "Pick up keys at a KeyNest store nearby — no in-person handover.", priceCents: 1900, type: "flat_fee", provider: "keynest",     category: "lockbox" },
  { slug: "transfer",     name: "Airport transfer",   description: "Pre-book a private transfer for your destination.",            priceCents: 0,    type: "affiliate", provider: "getyourguide", category: "transfer" },
  { slug: "esim",         name: "Travel eSIM",        description: "Stay connected the moment you land.",                           priceCents: 0,    type: "affiliate", provider: "airalo",       category: "esim" },
  { slug: "city-guide",   name: "Local city guide",   description: "Curated, neighbourhood-by-neighbourhood guide for your stay.",  priceCents: 900,  type: "flat_fee",  provider: "swapl",        category: "guide" },
];

async function main() {
  console.log("Bootstrapping monetization v1 on", TARGET_URL!.replace(/\/\/[^@]+@/, "//<redacted>@"));

  for (const p of PLANS) {
    await pool.query(
      `INSERT INTO "Plan" (id, label, "monthlyCents", "yearlyCents", "maxListings", "maxProposalsMonth", "prioritySearch", "fullFilters", "calendarSync", "matchBreakdown", "listingAnalytics", "multiHomeTeams")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         "monthlyCents" = EXCLUDED."monthlyCents",
         "yearlyCents"  = EXCLUDED."yearlyCents",
         "maxListings"  = EXCLUDED."maxListings",
         "maxProposalsMonth" = EXCLUDED."maxProposalsMonth",
         "prioritySearch"    = EXCLUDED."prioritySearch",
         "fullFilters"       = EXCLUDED."fullFilters",
         "calendarSync"      = EXCLUDED."calendarSync",
         "matchBreakdown"    = EXCLUDED."matchBreakdown",
         "listingAnalytics"  = EXCLUDED."listingAnalytics",
         "multiHomeTeams"    = EXCLUDED."multiHomeTeams"`,
      [p.id, p.label, p.monthlyCents, p.yearlyCents, p.maxListings, p.maxProposalsMonth, p.prioritySearch, p.fullFilters, p.calendarSync, p.matchBreakdown, p.listingAnalytics, p.multiHomeTeams],
    );
  }
  console.log("  ✓ plans");

  for (const partner of PARTNERS) {
    await pool.query(
      `INSERT INTO "AffiliatePartner" (id, slug, name, category, "baseUrl", "trackingParam", "commissionModel", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         "baseUrl" = EXCLUDED."baseUrl",
         "trackingParam" = EXCLUDED."trackingParam",
         "commissionModel" = EXCLUDED."commissionModel"`,
      [randomUUID(), partner.slug, partner.name, partner.category, partner.baseUrl, partner.trackingParam, partner.commissionModel],
    );
  }
  console.log("  ✓ affiliate partners");

  for (const a of ADDONS) {
    await pool.query(
      `INSERT INTO "AddOn" (id, slug, name, description, "priceCents", currency, type, provider, category, "isActive", "createdAt")
       VALUES ($1, $2, $3, $4, $5, 'EUR', $6, $7, $8, true, NOW())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         "priceCents" = EXCLUDED."priceCents",
         type = EXCLUDED.type,
         provider = EXCLUDED.provider,
         category = EXCLUDED.category`,
      [randomUUID(), a.slug, a.name, a.description, a.priceCents, a.type, a.provider, a.category],
    );
  }
  console.log("  ✓ add-ons");

  const adminEmail = "gert@dokuz.ai";
  const passwordHash = await bcrypt.hash("swapl-demo", 10);
  await pool.query(
    `INSERT INTO "User" (id, email, name, "passwordHash", verified, "createdAt", role, "proposalsThisMonthCount", "proposalsCounterResetAt", "hideSponsoredContent")
     VALUES ($1, $2, $3, $4, true, NOW(), 'swapl_admin', 0, NOW(), false)
     ON CONFLICT (email) DO UPDATE SET role = 'swapl_admin'`,
    [randomUUID(), adminEmail, "Gert (admin)", passwordHash],
  );
  console.log("  ✓ admin user (gert@dokuz.ai)");

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
