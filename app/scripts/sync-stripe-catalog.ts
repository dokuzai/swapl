// Idempotently provisions Stripe Products + Prices for swapl monetization v1.
//
// Run after STRIPE_SECRET_KEY is set:
//   tsx scripts/sync-stripe-catalog.ts
//
// Output is a list of `STRIPE_PRICE_* = price_…` lines you paste into Vercel
// or your local .env. Re-running is safe — products and prices are looked up
// by metadata.swapl_key first, only created when missing.

import "dotenv/config";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing. Aborting.");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });

type SwaplKey =
  | "plus_monthly" | "plus_yearly"
  | "pro_monthly"  | "pro_yearly"
  | "verify_listing" | "feature_14d" | "feature_30d"
  | "insurance_plus" | "insurance_pro"
  | "corporate_seat";

type CatalogEntry = {
  key: SwaplKey;
  productName: string;
  productDescription: string;
  unitAmount: number;          // cents (EUR)
  currency: string;            // "eur"
  recurring?: Stripe.PriceCreateParams.Recurring;
  envVar: string;              // env-var name to print
};

// All amounts in EUR (R2 reconciliation).
const CATALOG: CatalogEntry[] = [
  // Subscriptions
  { key: "plus_monthly", productName: "swapl Plus", productDescription: "Plus membership — monthly", unitAmount: 1200, currency: "eur", recurring: { interval: "month" }, envVar: "STRIPE_PRICE_PLUS_MONTHLY" },
  { key: "plus_yearly",  productName: "swapl Plus", productDescription: "Plus membership — yearly",  unitAmount: 9900, currency: "eur", recurring: { interval: "year" },  envVar: "STRIPE_PRICE_PLUS_YEARLY" },
  { key: "pro_monthly",  productName: "swapl Pro",  productDescription: "Pro membership — monthly",  unitAmount: 2900, currency: "eur", recurring: { interval: "month" }, envVar: "STRIPE_PRICE_PRO_MONTHLY" },
  { key: "pro_yearly",   productName: "swapl Pro",  productDescription: "Pro membership — yearly",   unitAmount: 24900, currency: "eur", recurring: { interval: "year" },  envVar: "STRIPE_PRICE_PRO_YEARLY" },

  // One-time
  { key: "verify_listing", productName: "Listing Verification", productDescription: "Manual review + verified badge", unitAmount: 3900, currency: "eur", envVar: "STRIPE_PRICE_VERIFY_LISTING" },
  { key: "feature_14d",    productName: "Featured Listing — 14 days", productDescription: "14-day featured placement", unitAmount: 1900, currency: "eur", envVar: "STRIPE_PRICE_FEATURED_14D" },
  { key: "feature_30d",    productName: "Featured Listing — 30 days", productDescription: "30-day featured placement", unitAmount: 2900, currency: "eur", envVar: "STRIPE_PRICE_FEATURED_30D" },

  // Insurance upgrades (per swap)
  { key: "insurance_plus", productName: "Insurance Upgrade — Plus", productDescription: "€300k cover + valuables rider", unitAmount: 1900, currency: "eur", envVar: "STRIPE_PRICE_INSURANCE_PLUS" },
  { key: "insurance_pro",  productName: "Insurance Upgrade — Pro",  productDescription: "€500k cover + pets + business",  unitAmount: 3900, currency: "eur", envVar: "STRIPE_PRICE_INSURANCE_PRO" },

  // Corporate
  { key: "corporate_seat", productName: "swapl Corporate (per seat)", productDescription: "Per-seat annual subscription", unitAmount: 19900, currency: "eur", recurring: { interval: "year" }, envVar: "STRIPE_PRICE_CORPORATE_SEAT" },
];

async function findOrCreateProduct(entry: CatalogEntry): Promise<Stripe.Product> {
  // metadata.swapl_key is our idempotency key.
  const search = await stripe.products.search({ query: `metadata['swapl_key']:'${entry.key}'`, limit: 1 });
  if (search.data[0]) return search.data[0];
  return stripe.products.create({
    name: entry.productName,
    description: entry.productDescription,
    metadata: { swapl_key: entry.key },
  });
}

async function findOrCreatePrice(product: Stripe.Product, entry: CatalogEntry): Promise<Stripe.Price> {
  const search = await stripe.prices.search({
    query: `product:'${product.id}' AND metadata['swapl_key']:'${entry.key}' AND active:'true'`,
    limit: 1,
  });
  if (search.data[0]) return search.data[0];
  return stripe.prices.create({
    product: product.id,
    unit_amount: entry.unitAmount,
    currency: entry.currency,
    recurring: entry.recurring,
    tax_behavior: "exclusive",
    metadata: { swapl_key: entry.key },
  });
}

async function main() {
  console.log("Syncing swapl catalog to Stripe (EUR)…\n");
  const lines: string[] = [];
  for (const entry of CATALOG) {
    const product = await findOrCreateProduct(entry);
    const price = await findOrCreatePrice(product, entry);
    console.log(`  ✓ ${entry.key.padEnd(20)} → product ${product.id}  price ${price.id}`);
    lines.push(`${entry.envVar}=${price.id}`);
  }
  console.log("\nPaste these into your env (Vercel + local .env):\n");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
