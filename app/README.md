# swapl

Home-swap marketplace where homeowners trade keys for keys — no money, fully insured.

## Stack

- **Next.js 16** (App Router, Turbopack, async params/searchParams) on **React 19**
- **Tailwind CSS v4** + **shadcn/ui** primitives layered with the swapl design tokens
- **Prisma 7** + **better-sqlite3 driver adapter** (SQLite for dev; flip the schema's
  `provider` to `postgresql` for prod)
- **Zod** validators on every API boundary
- **Fraunces / Inter / JetBrains Mono** via `next/font/google`
- Cookie-session auth (HMAC-signed) — slot-compatible with NextAuth

## Quick start

```bash
npm install
npm run db:migrate     # one-off; creates dev.db
npm run db:seed        # 21 listings across 10 cities + an active swap agreement
npm run dev            # http://localhost:3000
```

### Demo accounts

Any seed email plus password `swapl-demo`. Useful pairs:

| email                | role                                             |
| -------------------- | ------------------------------------------------ |
| `asli@demo.swapl`    | Istanbul — has an active swap with maartje      |
| `maartje@demo.swapl` | Amsterdam — counter-party of asli's swap        |
| `haruki@demo.swapl`  | Tokyo — has a pending proposal to inês (Lisbon) |
| `marcus@demo.swapl`  | Brooklyn — has a counter-offer in flight        |

Sign in at `/login`, view incoming proposals at `/swaps`, accept one to see
the auto-issued insurance policy + key-exchange codes.

## Routes

- `/` — marketing landing page (hero · how-it-works · live pairs · filter
  demo · insurance · waitlist)
- `/listings` — browse + filter sidebar (city, type, size, sleeps, dates,
  pet-friendly, WFH, step-free, mutual-swaps-only, sort by match score)
- `/listings/[id]` — public detail page with Propose Swap modal
- `/listings/new` — 8-step listing creation wizard
- `/listings/[id]/edit` — owner-only edit shell (re-uses the create form)
- `/swaps` — inbox bucketed by Waiting on you / Sent / Active / Archived
- `/swaps/[id]` — proposal thread; accept / decline / counter / withdraw +
  agreement key codes + insurance policy panel
- `/dashboard` — overview cards + your listings
- `/account` — profile, identity-verification status, sign out
- `/profile/[id]` — public host profile + their listings
- `/how-it-works`, `/insurance` — marketing chapters

## API

| route                          | what                                     |
| ------------------------------ | ---------------------------------------- |
| `POST /api/auth/login`         | password-credentials sign-in             |
| `POST /api/auth/register`      | new-account creation                     |
| `POST /api/auth/logout`        | clears session cookie                    |
| `POST /api/beta`               | waitlist (idempotent on email)           |
| `POST /api/listings`           | create listing (requires auth)           |
| `POST /api/proposals`          | new swap proposal (10/day rate-limited)  |
| `POST /api/proposals/[id]`     | `accept` / `decline` / `counter` / `withdraw` — accept auto-issues insurance |
| `POST /api/reports`            | report a listing or user                 |

## Production / not-yet-wired

For the local demo these are stubbed but isolated behind small adapters; swap
in a real provider by setting the env var:

- **Email:** `lib/email/index.ts` falls back to `console.log` until
  `RESEND_API_KEY` is set.
- **OAuth:** `lib/auth/session.ts` is a signed-cookie session compatible with
  NextAuth. Drop in `next-auth` (already installed) and replace
  `setSession` / `getSession` to use its server-side helpers.
- **Image upload:** the listing form takes URLs. Wire `uploadthing` (already
  installed) for an end-user uploader.
- **Maps:** the static SVG world-map in `components/marketing/hero.tsx` is a
  placeholder; render a Mapbox map by setting `MAPBOX_TOKEN` and importing
  `react-map-gl`.
- **Stripe:** the spec has Stripe as optional (premium tier). Not wired —
  there are no swap fees by design.

## Environment variables

```dotenv
DATABASE_URL="file:./dev.db"
SESSION_SECRET="change-me-in-prod"     # HMAC for the session cookie
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional, all gracefully fall back when blank:
RESEND_API_KEY=""
RESEND_FROM="swapl <hello@swapl.test>"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
UPLOADTHING_SECRET=""
UPLOADTHING_APP_ID=""
MAPBOX_TOKEN=""
```

## Layout

```
app/
  (marketing)/        landing page
  (auth)/             login + register
  listings/           browse, detail, new, edit
  swaps/              inbox, thread
  profile/[id]/       public host page
  dashboard/, account/
  how-it-works/, insurance/
  api/                auth, proposals, listings, beta, reports
components/
  illustrations/      CityIllust · HouseGlyph · SwapArrows · LogoMark · StepIllust · Pin
  marketing/          hero · how-it-works · live-pairs · filter-demo · insurance · cta
  layout/             navbar · footer
  filters/            filter-sidebar
  listing/            listing-card
  ui/                 shadcn primitives (button · input · label · ...)
lib/
  auth/               session + passwords
  db/                 prisma singleton + JSON helpers
  email/              adapter (Resend in prod, console.log in dev)
  match/              score algorithm
  cities.ts           city → palette/country lookup
  listing-utils.ts    DTO shape + amenity formatting
  listing-query.ts    server-side filter + match-ranked query
  listing-filters.ts  URL ↔ filter object
  rate-limit.ts       in-memory limiter (replace with Upstash in prod)
  validators.ts       Zod schemas
prisma/
  schema.prisma       User · Listing · SwapProposal · SwapAgreement · InsurancePolicy · BetaSignup · Report
  seed.ts             21 listings · 5 proposals · 1 active agreement · 2 beta signups
```

> Infrastructure overview: see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) at the repo root.

Production domains since 2026-06-10: app.swapl.fun (this app), swapl.fun (marketing/).
