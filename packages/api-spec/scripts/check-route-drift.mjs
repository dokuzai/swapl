#!/usr/bin/env node
// Contract drift check: every Next.js API route under app/app/api must either
// be documented in packages/api-spec/openapi.yaml or be explicitly allowlisted
// below. Fails CI when a route is added without updating the spec (and when
// the spec or the allowlist goes stale), so the OpenAPI contract stays the
// single source of truth for the iOS/Android/web clients.
//
// Usage: node scripts/check-route-drift.mjs   (from packages/api-spec)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const apiDir = join(repoRoot, "app", "app", "api");
const specFile = join(here, "..", "openapi.yaml");

// Internal surface — never part of the public client contract.
const INTERNAL_PREFIXES = [
  "/api/admin/", // back-office, web session + role gate
  "/api/cron/", // Vercel cron, secret-gated
  "/api/billing/webhook", // Stripe webhook, signature-gated
  "/api/uploadthing", // uploadthing SDK callback transport
];

// Existing routes not yet covered by the spec. Shrink this list — never grow
// it: new routes must land together with their OpenAPI entry. Remove an entry
// once the route gets spec'd (a stale entry fails the check).
const PENDING_SPEC = [
  "/api/affiliate/{partnerSlug}",
  "/api/agreements/{id}/cancel",
  "/api/ai/affiliate-suggestions",
  "/api/ai/city-illustration",
  "/api/ai/listing-content",
  "/api/ai/settings",
  "/api/ai/suggestions",
  "/api/auth/login", // web cookie session
  "/api/auth/logout", // web cookie session
  "/api/auth/verify-email/{token}", // email-link redirect, not a JSON API
  "/api/billing/cancel",
  "/api/billing/checkout/subscription",
  "/api/billing/portal",
  "/api/concierge/checkout",
  "/api/corporate/checkout",
  "/api/corporate/leads",
  "/api/i18n/locale",
  "/api/insurance",
  "/api/insurance/documents/{policyNumber}",
  "/api/insurance/quote",
  "/api/insurance/retry",
  "/api/listings/featured",
  "/api/listings/verify",
  "/api/marketing/events",
  "/api/uploads/listing-photo",
  "/api/webhooks/didit", // server-to-server (Didit), HMAC-authenticated, not a client API
];

/** Recursively collect route.ts files and map them to URL paths. */
function collectRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      const rel = relative(apiDir, dirname(full)).split(sep).join("/");
      // Next.js dynamic segments [id] -> OpenAPI {id}
      const urlPath =
        "/api" + (rel ? "/" + rel.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, "{$1}") : "");
      out.push(urlPath);
    }
  }
  return out;
}

/** Extract the path keys of the `paths:` section without a YAML dependency. */
function collectSpecPaths(yamlText) {
  const lines = yamlText.split("\n");
  const paths = [];
  let inPaths = false;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      if (/^\S/.test(line)) break; // left the paths: block
      const m = line.match(/^ {2}(\/[^\s:]+):\s*$/);
      if (m) paths.push(m[1]);
    }
  }
  return paths;
}

const routes = collectRoutes(apiDir).sort();
const specPaths = collectSpecPaths(readFileSync(specFile, "utf8")).sort();

const isInternal = (p) =>
  INTERNAL_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix || p.startsWith(prefix + "/")
  );

const errors = [];

// 1. Route exists but is neither spec'd nor allowlisted -> drift.
for (const route of routes) {
  if (isInternal(route)) continue;
  if (specPaths.includes(route)) continue;
  if (PENDING_SPEC.includes(route)) continue;
  errors.push(
    `Route ${route} (app/app/api) is missing from packages/api-spec/openapi.yaml. ` +
      `Add it to the spec (and run \`pnpm --filter @swapl/api-spec generate\`).`
  );
}

// 2. Spec path with no implementation -> stale spec.
for (const specPath of specPaths) {
  if (!routes.includes(specPath)) {
    errors.push(`Spec path ${specPath} has no matching route.ts under app/app/api.`);
  }
}

// 3. Stale allowlist entries: spec'd, internal, or deleted routes.
for (const pending of PENDING_SPEC) {
  if (specPaths.includes(pending)) {
    errors.push(`Allowlist entry ${pending} is now in the spec — remove it from PENDING_SPEC.`);
  } else if (!routes.includes(pending)) {
    errors.push(`Allowlist entry ${pending} has no route on disk — remove it from PENDING_SPEC.`);
  }
}

if (errors.length > 0) {
  console.error("API contract drift detected:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}

console.log(
  `OK: ${specPaths.length} spec paths, ${routes.length} routes, ` +
    `${PENDING_SPEC.length} pending spec coverage, no drift.`
);
