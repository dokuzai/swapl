# Broken Access Control / IDOR — Server-Side Authorization Review

**Target:** swapl web app (`app/`), running at `http://localhost:3000` with seeded data
**Scope:** OWASP A01:2021 — Broken Access Control / IDOR. Verify every owned/sensitive resource
enforces ownership/role authorization **server-side** on read AND write.
**Method:** Full route-handler code review + live cross-user exploitation (User A `sim-b1-u-00000`
acting against User B `sim-b1-u-00002`'s resources), via both the web cookie session and the mobile
bearer-token flow. Mass-assignment probing on writes.
**Date:** 2026-06-16

## Verdict

**No Broken Access Control / IDOR vulnerabilities found.** Authorization is enforced server-side on
every resource probed — reads and writes alike. The client-hides-UI anti-pattern the founder warned
about is **not** present: every owned resource re-checks ownership/role in the route handler against
the session-derived `userId`, independent of any client state. Mass-assignment is structurally
prevented. Confirmed counts: **Critical 0, High 0, Medium 0, Low 0.**

The remainder of this document records what was tested and the evidence, so the result is auditable.

---

## How authorization is implemented (root cause of the clean result)

- **Identity is always session-derived.** Handlers call `getSessionFromRequest(req)` (cookie *or*
  `Authorization: Bearer` — `lib/auth/session.ts`) and use `session.userId` as the actor. The body
  is never trusted for identity.
- **Ownership is re-checked per request.** Owned resources are loaded by id, then compared:
  `existing.userId !== session.userId → 403`. Participation-based resources (proposals, agreements,
  conversations, disputes) check membership of both sides.
- **Writes hardcode the owner.** Creates set `userId: session.userId` literally; updates pass only
  zod-parsed `data`, so unknown/privileged body keys are stripped by Zod before reaching Prisma.
- **Admin role is verified against the DB**, not the session token (`lib/auth/abilities.ts`
  `requireAdmin` / `requireAdminFromRequest` re-read `role` and require `swapl_admin`).

---

## Confirmed tests (CONFIRMED = reproduced live against the running server)

All cross-user attempts below were run as **A** against **B**'s resources.

### Listings
| Attack | Endpoint | Result |
|---|---|---|
| Edit B's listing | `PUT /api/listings/sim-b1-l-00002` | **403** `{"error":"FORBIDDEN"}` |
| Read B's home guide | `GET /api/listings/sim-b1-l-00002/home-guide` | **403** |
| Read B's host blocks | `GET /api/listings/sim-b1-l-00002/blocked-ranges` | **403** |
| Read B's property verification | `GET /api/listings/sim-b1-l-00002/property-verification` | **403** |
| Read B's listing detail | `GET /api/listings/sim-b1-l-00002` | **200**, but `address: null` and `nightlyKeysBase` (valuation internals) omitted — owner-only fields correctly withheld; only public fields returned. Not a leak. |

Guard locations: `app/api/listings/[id]/route.ts:97-99` (PUT ownership), `.../home-guide/route.ts`
(owner-or-active-counterparty + reveal gate), `.../blocked-ranges/route.ts` (`ownedListing` helper on
every verb), `.../property-verification/route.ts:87,120`. Owner-only field masking via
`toDTO(listing, { includeAddress: isOwner, includeValuation: isOwner })`.

### Proposals / conversations
| Attack | Endpoint | Result |
|---|---|---|
| Read B's proposal thread | `GET /api/proposals/sim-b1-p-00002` | **403** |
| Read B's messages | `GET /api/proposals/sim-b1-p-00002/messages` | **403** |
| Accept B's proposal (create an agreement on B's behalf) | `POST /api/proposals/sim-b1-p-00002` `{"action":"accept"}` | **403** |
| **Add self to B's conversation** | `POST /api/proposals/sim-b1-p-00002/participants` `{"byUserId":"sim-b1-u-00000"}` | **403** `Only swap principals can invite.` |

Guards: `app/api/proposals/[id]/route.ts:262-266` (GET) and `:359-363` (POST actions);
`.../messages/route.ts` via `canAccessConversation`; `.../participants/route.ts:915`
(`isPrincipal`), with `[participantId]` removal and `suggestions` both principal-gated.

### Agreements / trips
| Attack | Endpoint | Result |
|---|---|---|
| Read B's trip cockpit (other address, key codes) | `GET /api/agreements/sim-b1-a-00002/trip` | **403** |
| Check in to B's swap | `POST /api/agreements/sim-b1-a-00002/check-in` | **403** |
| Cancel B's swap | `POST /api/agreements/sim-b1-a-00002/cancel` | **403** |
| **Post a review on B's swap** (sabotage / impersonation) | `POST /api/agreements/sim-b1-a-00002/review` | **403** `Only the swap parties can review.` |
| Open a dispute on B's swap | `POST /api/agreements/sim-b1-a-00002/dispute` | **403** |
| Read B's dispute thread | `GET /api/agreements/sim-b1-a-00002/dispute` | **403** |

Guards: `lib/trip/check-event.ts` (party-only for check-in/out); `app/api/agreements/[id]/cancel`,
`/review:148-149`, `/dispute:270-272`, `/trip` (`resolveParty`). Review subject is always derived as
"the other party"; one-review-per-author is DB-enforced (`@@unique(agreementId, authorId)`).

### Profile / account / feedback / reports
| Attack | Endpoint | Result |
|---|---|---|
| Spoof identity in profile update (`id`, `userId`, `role`, `verified` in body) | `PATCH /api/profile` | **200**, but only A's own allowed fields changed; `role` stayed `member`, `verified` unchanged, B untouched. Privileged keys ignored. |
| Spoof `reporterId` to file a report "as B" | `POST /api/reports` `{"reporterId":"sim-b1-u-00002",...}` | **200**, DB row stored `reporterId = sim-b1-u-00000` (A's session) — spoof ignored. |
| Spoof `userId` in app feedback | `POST /api/app-feedback` | userId is taken from session, never the body (`route.ts:369-391`). |
| Member hits admin APIs | `GET /api/admin/users`, `/admin/reviews`, `POST /api/admin/disputes` | **404 / 405** to non-admins; `requireAdmin*` re-checks `role === swapl_admin` from the DB. |

`PUT/DELETE /api/saved-searches/[id]` and `/api/travel-windows/[id]` both load by id and require
`row.userId === session.userId` (404 otherwise). `/api/devices` and `/api/keys` are scoped to
`session.userId` only — no id is accepted from the caller, so there is nothing to enumerate.
`/api/favorites/[listingId]` writes are keyed on `(session.userId, listingId)`.

### Mass-assignment (writes)
- **Create listing** (`app/api/listings/route.ts`): handler sets `userId: session.userId` literally and
  spreads only zod-parsed `data`. Injected `userId`, `ownerVerified`, `isVerified`, `nightlyKeys`,
  `keysBalance`, `role` are all dropped by Zod. (Runtime create is additionally blocked for the seed
  users by the `emailVerifiedAt` publish gate — confirmed code-only for create.)
- **Update listing** (`PUT /api/listings/[id]`): **CONFIRMED live.** Sent
  `{userId, ownerVerified:true, isVerified:true, nightlyKeys:9999, nightlyKeysBase:9999, ...}` against
  A's own listing. Result: legit fields updated (`city`), but `userId` stayed `sim-b1-u-00000`,
  `ownerVerified=0`, `isVerified=0`, and `nightlyKeys` was **server-recomputed** (6), not the injected
  9999. Privileged fields are never read from the body.

### Mobile bearer flow
`POST /api/auth/token` issues an opaque token (hashed in `AuthToken`). Used as
`Authorization: Bearer <token>`, it resolves to the same `session.userId` and is subject to the
**identical** ownership checks — A's bearer token still gets **403** editing B's listing. No bypass.

---

## Non-destructive note
One proof-write per endpoint, as instructed. The two mutations made during testing were reverted:
A's display name (restored to `Anna Tanaka`) and A's own listing `sim-b1-l-00000` `nightlyKeys`
(restored to 9). The benign report and feedback rows created as A were left in place (they only prove
the actor was correctly attributed to A).

## Coverage gaps (low risk, not exploited)
- Some tables (SavedSearch, TravelWindow, Device, ConversationParticipant, SwapReview-by-B) had **no
  seed rows for B**, so those endpoints were validated by code review of the ownership predicate plus
  the same-pattern live tests on adjacent endpoints — not by a B-owned-row live fetch. The predicate is
  identical (`row.userId === session.userId`) and is the same one proven live elsewhere.
