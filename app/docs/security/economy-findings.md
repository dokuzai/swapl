# Economy / Billing / Payments Integrity — Pentest Findings

**Scope:** Server-side enforcement of value-bearing operations — Keys ledger,
plan limits, billing/insurance/didit webhooks, listing valuation
(mass-assignment), agreements/insurance forgery, featured/verification payments.

**Target:** `swapl` web app (`app/`), running locally at `http://localhost:3000`
against the seeded `dev.db` (SQLite).

**Auth used:** cookie session for `sim+b1-00000@sim.swapl` (a member, free plan,
no `emailVerifiedAt`, balance 0, 7 seeded active listings) and
`asli@demo.swapl` (verified, 30 Keys) — both password `swapl-demo`.

**Verdict:** The economy core is **well-built**. Every high-value attack tested
was correctly rejected server-side. The Keys ledger is the source of truth, the
listing valuation is fully recomputed server-side (no mass-assignment), and both
webhooks verify signatures. **One real finding** (free Featured placement) and a
few **informational / pre-launch seams** are documented below.

---

## Summary table

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Featured placement granted with **no payment** via "pre_launch" path | Medium (pre-launch seam) | CONFIRMED |
| 2 | Paid verification submission accepted with no payment (pre_launch) | Low (pre-launch seam; no badge granted) | CONFIRMED |
| 3 | Keys gift abuse (self / negative / overdraw / field injection) | — | NOT VULNERABLE (verified secure) |
| 4 | Listing valuation mass-assignment (nightlyKeys / isVerified / tier / flags) | — | NOT VULNERABLE (verified secure) |
| 5 | Plan-limit bypass via direct API | — | NOT VULNERABLE (server-enforced) |
| 6 | Stripe webhook forgery (self-upgrade to Pro) | — | NOT VULNERABLE (signature-verified) |
| 7 | Didit KYC webhook forgery (self-approve identity) | — | NOT VULNERABLE (HMAC + timestamp) |
| 8 | Keys stay replay / double-spend / double-credit | — | NOT VULNERABLE (atomic ledger + state machine) |
| 9 | Featured/verify IDOR (act on another user's listing) | — | NOT VULNERABLE (ownership checked) |
| 10 | Rooms coefficient abuse (force whole-home value, out-of-range rooms) | — | NOT VULNERABLE (server clamps) |

---

## FINDING 1 — Featured placement granted with no payment (CONFIRMED)

**Severity:** Medium (currently a deliberate pre-launch seam, but it is the live
behaviour and grants a real value-bearing benefit — search rank boost — for free).
**Category:** OWASP A04 Insecure Design / Business-logic — missing payment
enforcement on a paid feature.

**Where:** `app/app/api/listings/featured/route.ts:60-80`

When Stripe is not configured (`isStripeConfigured()` false) **or** the duration
price env var is unset, the route falls through to a "pre_launch" branch that
**immediately** sets `isFeatured = true` + `featuredUntil = now + N days` and
writes a `ListingFeaturedPurchase` row with a synthetic
`stripePaymentIntentId = "pre_launch_<id>_<ts>"` — without charging anything.

**Reproduction:**

```bash
# logged-in owner of sim-b1-l-00000
curl -s -b jar -X POST http://localhost:3000/api/listings/featured \
  -H 'Content-Type: application/json' \
  -d '{"listingId":"sim-b1-l-00000","durationDays":30}'
# -> {"ok":true,"mode":"pre_launch","endsAt":"2026-07-16T..."}  [HTTP 200]

# DB confirms the listing is now featured for 30 days, no payment:
sqlite3 dev.db "SELECT isFeatured,date(featuredUntil) FROM Listing WHERE id='sim-b1-l-00000';"
# -> 1|2026-07-16
```

**Impact:** Any member can grant their own listing a 14/30-day Featured rank
boost for free as long as Stripe stays unconfigured. The per-city Featured cap is
"enforced at query time, not purchase time" (see route comment), so this also
lets a user stack unlimited free Featured purchases.

**Server-side fix:**
- Before launch, ensure `STRIPE_SECRET_KEY` + `STRIPE_PRICE_FEATURED_14D/30D`
  are set so the Stripe Checkout branch is taken and `isFeatured` is only
  flipped by the verified `payment_intent.succeeded` webhook.
- Make the pre_launch branch **non-default**: gate it behind an explicit
  `ALLOW_UNPAID_FEATURED=1` (or `NODE_ENV !== "production"`) flag so it can never
  fire in production. As written, a misconfigured/again-unset price env in prod
  silently re-enables free Featured.
- Same hardening applies symmetrically to `app/lib/billing/checkout.ts` callers.

---

## FINDING 2 — Paid verification submission accepted with no payment (CONFIRMED, Low)

**Severity:** Low. **Category:** OWASP A04 Insecure Design (pre-launch seam).

**Where:** `app/app/api/listings/verify/route.ts:60-78`

Same pattern: when Stripe/price is unset, the route records the submission
directly as `verificationStatus = "pending"` and writes a
`ListingVerificationPayment` with `stripePaymentIntentId = "pre_launch_<id>"`,
no charge.

**Reproduction:**

```bash
curl -s -b jar -X POST http://localhost:3000/api/listings/verify \
  -H 'Content-Type: application/json' \
  -d '{"listingId":"sim-b1-l-00000","videoUrl":"https://example.com/v.mp4"}'
# -> {"ok":true,"mode":"pre_launch"}  [HTTP 200]
sqlite3 dev.db "SELECT verificationStatus,isVerified,ownerVerified FROM Listing WHERE id='sim-b1-l-00000';"
# -> pending|0|0
```

**Why only Low:** this does **not** grant `isVerified` / `ownerVerified` — an
admin must still approve in the queue. So no trust badge or valuation bonus is
obtained for free; it only enqueues a free review request.

**Fix:** Same as Finding 1 — gate the pre_launch path behind an explicit dev
flag so production always requires the paid Checkout + webhook flip.

---

## FINDING 3 — Keys gift abuse: NOT VULNERABLE (verified secure)

**Where:** `app/app/api/keys/gift/route.ts`, `app/lib/keys/ledger.ts:243-265`

All vectors rejected:

```text
gift to self   {"toUserId":"<self>","amount":10}              -> 422 "Cannot gift Keys to yourself"
negative gift  {"amount":-100}                                 -> 400 zod too_small (min 1)
overdraw       balance 0, {"amount":50}                        -> 422 "Not enough Keys"
field inject   {"amount":1,"balanceAfter":99999,"delta":99999}-> 422 (extra fields ignored; still overdraw)
```

The request body is parsed by a strict zod schema (`{toUserId, amount}` only),
so `balanceAfter`/`delta` are dropped. The ledger primitive `applyWithinTx`
(`ledger.ts:121-156`) **reads the balance inside the transaction**, computes
`balanceAfter = user.keysBalance + delta` server-side, and throws
`NEGATIVE_BALANCE` if it would go below zero. `gift()` debits sender + credits
recipient atomically in one `$transaction`. Daily/monthly caps + rate limit are
enforced. Balance is a cached running sum of the append-only ledger — the client
can never set it.

---

## FINDING 4 — Listing valuation mass-assignment: NOT VULNERABLE (verified secure)

**Where:** `app/app/api/listings/route.ts:108-167` (create),
`app/app/api/listings/[id]/route.ts:140-209` (update),
`app/lib/keys/value.ts`, validator `app/lib/validators.ts:54-55`.

A `PUT` carrying
`nightlyKeys:20, nightlyKeysBase:20, nightlyKeysAdjustment:0.2, isVerified:true,
ownerVerified:true, isFeatured:true, locationTier:1, verificationStatus:"approved"`
for a tier-5 / 20 m² / sleeps-1 home was accepted (200) but the DB showed:

```text
nightlyKeys=4  nightlyKeysBase=4  nightlyKeysAdjustment=0.0
isVerified=0  ownerVerified=0  isFeatured=0  locationTier=5  verificationStatus=none
```

Every value/flag field was **ignored**. The route builds the Prisma `data`
object from an explicit allow-list of validated fields and **recomputes**
`nightlyKeysBase` via `nightlyKeysFor(...)` from `{sizeSqm, sleeps, city,
isVerified: existing/false, spaceType, roomsOffered, locationTier: existing}`.
There is no spread of the raw body, so unlisted attributes can't reach the DB.

---

## FINDING 10 (sub of 4) — Rooms coefficient (DOK-160): NOT VULNERABLE

`spaceType` is `z.enum(["entire_place","private_room"])`; `roomsOffered` is
`z.number().int().min(1).max(15)` — out-of-range (`9999`) is rejected with 400.
The coefficient is computed server-side in `value.ts:119-124` and capped at
`PRIVATE_ROOM_MAX_COEFFICIENT = 0.85`, so a `private_room` can never equal a
whole home. Observed: identical 300 m²/sleeps-6 Paris home valued **12** as
`private_room` (15 rooms) vs **14** as `entire_place`. A client-supplied
`roomsCoefficient` field is ignored.

---

## FINDING 5 — Plan-limit bypass via direct API: NOT VULNERABLE (server-enforced)

**Where:** `app/lib/billing/limits.ts`, enforced in
`app/app/api/listings/route.ts:55-62` (`ensureCanCreateListing`) and
`app/app/api/proposals/route.ts:100-107` (`ensureCanCreateProposal` +
`bumpProposalCounter`).

Listing create runs `ensureCanCreateListing` server-side (returns 402 with
`upgradeTo` once `count >= maxListings`) — it is **not** a client-only gate.
Proposal create enforces the Free 3/mo cap via a per-user `proposalsThisMonthCount`
counter with a 30-day rolling reset, bumped only after a successful create.

> Note: the test user could not be used to drive the listing cap to a clean
> repro because it has no `emailVerifiedAt`, so `POST /api/listings` returns
> `403 EMAIL_NOT_VERIFIED` *before* the plan check — itself a correct gate. The
> plan-limit code path is confirmed by reading the enforced call sites; both are
> server-side and unconditional.

---

## FINDING 6 — Stripe webhook forgery: NOT VULNERABLE (signature-verified)

**Where:** `app/app/api/billing/webhook/route.ts:43-60`

A forged `customer.subscription.created` with `metadata.userId = <self>` and an
`active` status (no signature, and with a bogus `stripe-signature`) was POSTed to
upgrade to Pro. Both returned **503 `STRIPE_WEBHOOK_SECRET not set`** in this dev
env — the handler refuses to process anything without the secret. No
`Subscription` row was created (`SELECT ... WHERE userId='sim-b1-u-00000'` empty).

In code, when the secret **is** set, the route reads the **raw body**
(`await req.text()`) and calls `stripe.webhooks.constructEvent(raw, sig,
secret)`; an invalid signature returns 400 before any handler runs. Event ids are
recorded in `BillingEvent` and replays are dropped (idempotent). Subscription
upserts are keyed by `userId`/`stripeSubscriptionId`. This is the correct design.

> Pre-launch action: ensure `STRIPE_WEBHOOK_SECRET` is set in production so the
> 503 short-circuit never masks a missing-verification config.

---

## FINDING 7 — Didit KYC webhook forgery: NOT VULNERABLE (HMAC + timestamp)

**Where:** `app/app/api/webhooks/didit/route.ts:45-67`,
`lib/verification/didit.verifyWebhookSignature`.

Forged `{"session_id":"x","status":"Approved"}` (no sig, and with bogus
`x-signature`/`x-timestamp`) both returned **503 `DIDIT_WEBHOOK_SECRET not set`**.
With the secret set, the route verifies an HMAC-SHA256 over the raw bytes plus a
5-minute timestamp window (replay protection), and state transitions are
idempotent / terminal-state-stable. No self-approval of identity is possible.

---

## FINDING 8 — Keys stay replay / double-spend / double-credit: NOT VULNERABLE

**Where:** `app/lib/keys/stay.ts`, `app/app/api/keys/stays/[id]/{confirm,cancel,decline}/route.ts`

Booked a 3-night stay as `asli` (cost 15): balance 30 → 15 (single `hold -15`).
Then:

```text
cancel #1  -> stay moves to "cancelled", hold released (+15)  balance 30
cancel #2 (replay)  -> 422 BAD_STATE "Cannot cancelled a cancelled stay"
confirm-after-cancel -> 403 "Only the host can confirm"
final balance        -> 30  (NOT inflated)
ledger for stay      -> hold -15 / release +15   (exactly two rows)
```

Each transition re-reads the stay status **inside** the `$transaction`
(`stay.ts:266-269, 318-321`) and only a `pending` stay may move, so concurrent /
replayed confirm/cancel/decline cannot double-release or double-spend. Confirm
composes `release + spend(guest) + earn(host)` atomically. The overdraw guard
also blocked a stay the guest couldn't afford ("Not enough Keys for this stay").

---

## FINDING 9 — Featured/verify IDOR: NOT VULNERABLE

Both routes load the listing and check `listing.userId !== session.userId`
returning 404. Attempting to feature another user's listing
(`cmqf8py2l000aan9krjtnfzmp`) returned **404 "Listing not found"**.

---

## Other surfaces reviewed (no issue found)

- **Agreement / insurance forgery:** There is no public endpoint to create a
  `SwapAgreement` or `InsurancePolicy` directly, nor to set agreement
  `status = COMPLETED`. Agreements are created only inside the proposal-accept
  transaction (`app/app/api/proposals/[id]/route.ts:280-312`), which verifies the
  caller is a party and the window is free. The `keyCode`s and policy fields are
  server-generated. Review creation (which mints the `earn_review` bonus) is
  gated on `agreement.status === "COMPLETED"` **and** caller-is-party
  (`agreements/[id]/review/route.ts:49-53`), so the bonus cannot be farmed
  without a genuine completed swap.
- **Insurance verify / quote endpoints** are read-only and party-scoped (403 for
  non-parties); they never mutate Keys or policy state.
- **Earn hooks (DOK-164)** (`app/lib/keys/earn.ts`) are idempotent via a unique
  `KeysTransaction.eventKey`, identity-gated (`User.verified`), and rolling-30d
  capped — replayed events no-op.
- **Keys transactions endpoint** (`/api/keys/transactions`) is read-only and
  scoped to the caller (`userId: session.userId`); `kind` is validated against a
  closed set.

---

## Recommended priorities

1. **Finding 1 (Featured):** Gate the unpaid pre_launch branch behind an explicit
   non-production flag and confirm Stripe price envs are set in prod — otherwise a
   real free value-bearing benefit ships.
2. **Finding 2 (Verify):** Same gating, lower urgency (no badge granted).
3. **Hardening:** Ensure `STRIPE_WEBHOOK_SECRET` and `DIDIT_WEBHOOK_SECRET` are
   set in production so webhooks never sit in the 503 short-circuit, and the
   verified-signature path is always the one in force.

*All tests were non-destructive (one proof each). The single mutated seed listing
`sim-b1-l-00000` had its economy-relevant flags restored (isFeatured/verification
cleared); its title/city/size still hold test values as a demo seed.*
