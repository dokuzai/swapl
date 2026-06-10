# Swapl — Database guide & control queries

Postgres in production (Neon, via the `swapl` Vercel project), SQLite locally. The two Prisma schemas in `app/prisma/` are identical apart from the provider — **every model change must land in both files**.

## How to connect

```bash
# production (grab DATABASE_URL from Vercel → swapl → Settings → Environment Variables)
psql "$DATABASE_URL"

# local dev DB (SQLite)
sqlite3 app/dev.db

# visual browser (works on either, follows app/.env)
cd app && pnpm exec prisma studio
```

> ⚠️ Prisma creates **PascalCase tables and camelCase columns** — in Postgres they must be double-quoted: `SELECT "emailVerifiedAt" FROM "User"`. The JSON-ish fields (`photos`, `tags`, `interests`, `petTypes`) are JSON **strings**, not jsonb.

## Schema map (what matters operationally)

| Table | Purpose | Key fields |
|---|---|---|
| `User` | account | `email`, `emailVerifiedAt` (null = not verified), `role` (`member`/`swapl_admin`), `createdAt` |
| `Listing` | a home offered for swap | `userId`, `city`, `country`, `isActive`, `availableFrom/To`, `verificationStatus`, `isVerified`, `isFeatured` |
| `SwapProposal` | swap negotiation | `status` (`PENDING`/`ACCEPTED`/`DECLINED`/`COUNTERED`/`WITHDRAWN`), `proposerListingId`, `targetListingId`, `dateFrom/To` |
| `SwapAgreement` | confirmed swap (1:1 with accepted proposal) | `status` (`ACTIVE`/`COMPLETED`/`INTERRUPTED`), `dateFrom/To`, `listing1Id`, `listing2Id` |
| `InsurancePolicy` | auto-issued cover per agreement | `policyNumber`, `status`, `premiumCents` |
| `BetaSignup` | waitlist | `email`, `source/medium/campaign` (UTM), `userId` (set when they register) |
| `MarketingEvent` | site analytics events | `eventName`, UTM fields |
| `Report` | abuse reports | `reporterId`, `targetUserId`, `listingId`, `reason` |
| `Subscription` + `Plan` | billing tier | `planId`, `status`, `currentPeriodEnd` |

Supporting tables: `EmailToken` (verify/reset), `AuthToken` (mobile sessions), `Device` (push), `SwapMessage` (thread per proposal), Stripe mirrors (`StripeCustomer`, `BillingEvent`, `BillingInvoice`), monetization stubs (`AddOn`, `OrderAddOn`, `Organization*`, `Affiliate*`).

Most of these numbers are also visible at **app.swapl.fun/admin** (signups, users, listings, reports, CSV export) — the queries below are for ad-hoc digging.

## Control queries

### Users

```sql
-- Active users: email verified, newest first, with their listing count
SELECT u.email, u.name, u."createdAt", u."emailVerifiedAt",
       COUNT(l.id) AS listings
FROM "User" u
LEFT JOIN "Listing" l ON l."userId" = u.id AND l."isActive"
WHERE u."emailVerifiedAt" IS NOT NULL
GROUP BY u.id
ORDER BY u."createdAt" DESC;

-- Signups per week (registration growth)
SELECT date_trunc('week', "createdAt") AS week, COUNT(*) AS signups
FROM "User" GROUP BY 1 ORDER BY 1 DESC;

-- Registered but never verified email (follow-up candidates)
SELECT email, "createdAt" FROM "User"
WHERE "emailVerifiedAt" IS NULL ORDER BY "createdAt" DESC;
```

### Listings (properties)

```sql
-- Available listings: active and bookable today or in the future
SELECT l.title, l.city, l.country, l.sleeps,
       l."availableFrom"::date, l."availableTo"::date,
       l."isVerified", u.email AS owner
FROM "Listing" l JOIN "User" u ON u.id = l."userId"
WHERE l."isActive" AND l."availableTo" >= now()
ORDER BY l."createdAt" DESC;

-- Supply per city (corridor liquidity — the launch KPI)
SELECT city, country, COUNT(*) AS listings,
       COUNT(*) FILTER (WHERE "isVerified") AS verified
FROM "Listing" WHERE "isActive"
GROUP BY city, country ORDER BY listings DESC;

-- Verification queue (waiting for admin review)
SELECT l.title, l.city, u.email, l."verificationSubmittedAt"
FROM "Listing" l JOIN "User" u ON u.id = l."userId"
WHERE l."verificationStatus" = 'pending'
ORDER BY l."verificationSubmittedAt";
```

### Swaps

```sql
-- Completed swaps (with both homes)
SELECT a.id, a."dateFrom"::date, a."dateTo"::date,
       l1.city AS home_1, l2.city AS home_2
FROM "SwapAgreement" a
JOIN "Listing" l1 ON l1.id = a."listing1Id"
JOIN "Listing" l2 ON l2.id = a."listing2Id"
WHERE a.status = 'COMPLETED'
ORDER BY a."dateTo" DESC;

-- Upcoming swaps (confirmed, not yet started)
SELECT a.id, a."dateFrom"::date, a."dateTo"::date,
       l1.city AS home_1, u1.email AS party_1,
       l2.city AS home_2, u2.email AS party_2
FROM "SwapAgreement" a
JOIN "Listing" l1 ON l1.id = a."listing1Id" JOIN "User" u1 ON u1.id = l1."userId"
JOIN "Listing" l2 ON l2.id = a."listing2Id" JOIN "User" u2 ON u2.id = l2."userId"
WHERE a.status = 'ACTIVE' AND a."dateFrom" > now()
ORDER BY a."dateFrom";

-- Swaps in progress right now
SELECT a.id, a."dateFrom"::date, a."dateTo"::date, l1.city, l2.city
FROM "SwapAgreement" a
JOIN "Listing" l1 ON l1.id = a."listing1Id"
JOIN "Listing" l2 ON l2.id = a."listing2Id"
WHERE a.status = 'ACTIVE' AND now() BETWEEN a."dateFrom" AND a."dateTo";

-- Proposal funnel (negotiation health)
SELECT status, COUNT(*) FROM "SwapProposal" GROUP BY status;

-- Most requested corridors (proposals between city pairs)
SELECT lp.city AS from_city, lt.city AS to_city, COUNT(*) AS proposals
FROM "SwapProposal" p
JOIN "Listing" lp ON lp.id = p."proposerListingId"
JOIN "Listing" lt ON lt.id = p."targetListingId"
GROUP BY 1, 2 ORDER BY proposals DESC LIMIT 20;
```

### Waitlist & funnel

```sql
-- Waitlist by acquisition source
SELECT COALESCE(source,'(direct)') AS source, COALESCE(campaign,'-') AS campaign,
       COUNT(*) AS signups
FROM "BetaSignup" GROUP BY 1, 2 ORDER BY signups DESC;

-- Waitlist → registered conversion
SELECT COUNT(*) AS waitlist,
       COUNT("userId") AS became_users,
       ROUND(100.0 * COUNT("userId") / NULLIF(COUNT(*),0), 1) AS pct
FROM "BetaSignup";

-- Full funnel snapshot
SELECT
  (SELECT COUNT(*) FROM "BetaSignup")                                        AS waitlist,
  (SELECT COUNT(*) FROM "User")                                              AS users,
  (SELECT COUNT(*) FROM "User" WHERE "emailVerifiedAt" IS NOT NULL)          AS verified_users,
  (SELECT COUNT(*) FROM "Listing" WHERE "isActive")                          AS active_listings,
  (SELECT COUNT(*) FROM "SwapProposal")                                      AS proposals,
  (SELECT COUNT(*) FROM "SwapAgreement" WHERE status IN ('ACTIVE','COMPLETED')) AS swaps;
```

### Safety & billing

```sql
-- Open reports with context
SELECT r.reason, r.detail, r."createdAt",
       rep.email AS reporter, tgt.email AS reported, l.title AS listing
FROM "Report" r
JOIN "User" rep ON rep.id = r."reporterId"
LEFT JOIN "User" tgt ON tgt.id = r."targetUserId"
LEFT JOIN "Listing" l ON l.id = r."listingId"
ORDER BY r."createdAt" DESC;

-- Paying subscribers by plan
SELECT p.name, COUNT(*) AS subscribers
FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
WHERE s.status = 'active'
GROUP BY p.name;

-- Insurance policies issued
SELECT "policyNumber", status, "premiumCents", "createdAt"
FROM "InsurancePolicy" ORDER BY "createdAt" DESC;
```

> SQLite note: for the local `dev.db` the same queries work with minor changes — drop the double quotes requirement (but keep them, they're valid), replace `now()` with `datetime('now')`, `date_trunc(...)` with `strftime('%Y-%W', ...)`, and `FILTER (WHERE ...)` with `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`.
