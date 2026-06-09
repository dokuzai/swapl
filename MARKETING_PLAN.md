# Swapl — Go-To-Market & Growth Playbook

_Last updated: 2026-06-09 · Launch target: September 2026 (~12 weeks out)_

Swapl is a **reciprocal home-swap marketplace** — keys for keys, no money, every
accepted swap auto-insured. Web (Next.js 16) + iOS + Android. Pre-launch,
collecting supply. Launch corridors: Istanbul · Amsterdam · Lisbon · Brooklyn ·
Tokyo · CDMX.

The core challenge is a **two-sided reciprocal cold-start**: a swap needs two
homeowners who both want to travel to roughly where the other lives, on
overlapping dates. Liquidity is per-corridor × date-window, not national. The
entire pre-launch job is concentrating supply into a few dense corridors so that
matches actually exist on launch day.

---

## 1. Positioning — lead with trust + no-money

| Wedge | Headline line | Why |
|---|---|---|
| No money, ever | "Keys for keys. No nightly rates, no swap fees." | Removes the #1 cost objection; rides Airbnb fatigue |
| Every stay insured | "Every accepted swap is insured the moment it's agreed." | Kills the #1 swap objection ("what if they trash it?") — this is the moat |
| Corridor curation | "We open city by city so real matches exist on day one." | Turns cold-start into scarcity/exclusivity |

Action: make insurance auto-issuance the hero headline, not a footnote.

## 2. Website + SEO fixes (found in code)

CRITICAL (this week):
- [ ] Add `app/opengraph-image.tsx` (+ per-city variants). Twitter card declares
  `summary_large_image` but NO image file exists → every shared link is blank.
- [ ] Add favicon / `icon` / `apple-icon`.
- [ ] Add `app/manifest.ts` (PWA "Add to Home Screen" + ranking signal).

SEO (close the 30% gap):
- [ ] Programmatic **corridor pages** from `city-launch.ts` `demandFrom` pairs
  (~24 near-zero-competition intent pages, e.g. "istanbul home swap from amsterdam").
- [ ] Add `FAQPage` + `HowTo` JSON-LD (you already have Org/Service/WebSite).
- [ ] Deepen city guides: "what it's like to *live* in [neighborhood]" (swapper intent).
- [ ] Every guide/corridor page gets a waitlist CTA with pre-filled `utm_campaign`.

## 3. 12-week pre-launch workflow (supply engine)

Goal: ~150–250 quality listings concentrated in **3 corridors** (don't spread
across all 6). Suggested: Istanbul↔Amsterdam, Lisbon↔CDMX, + Brooklyn (long-haul anchor).

Weekly loop (June → September):
- Mon: 1 corridor blog + 1 city-guide deep-dive
- Tue: 3 short-form videos (TikTok/Reels/Shorts)
- Wed: hand-DM 20 target-city hosts
- Thu: waitlist email "X homes now listed in [city]" (Resend already wired)
- Fri: review BetaSignup UTM attribution → double down on winners

Manual supply outreach (recruit first 100 listings by hand):
- Expat Facebook groups, r/digitalnomad, r/expats, remote Slacks, sabbatical/
  academic communities, frustrated HomeExchange users (pitch "no fees").
- Offer: "Founding host" — list before launch → first batch shown to demand side,
  verified badge + featured placement (admin modules already exist).

Referral loop (native to a reciprocal product): "Invite the friend you'd actually
swap with" — both get founding-host status. Bake into onboarding.

## 4. Video & social engine

Hero format = **the swap reveal** (split-screen my place ↔ swap place). Your
`HeroSplitVisual` component is already the template — turn it into video.

Five repeatable formats:
1. "I paid $0 to stay here" — walk the swap home, reveal the trade
2. Corridor matchups — "Istanbul ⇄ Amsterdam, whose place?" (comment bait)
3. "Airbnb wanted $2,400. We swapped free." (cost contrast — most shareable)
4. Trust explainer — "what if they wreck it?" → insurance reveal
5. Build-in-public — "Lisbon opens next, waitlist count is X"

Distribution: 1–3/day across TikTok+Reels+Shorts (same vertical asset).
Creator seeding (10k–100k travel/expat creators in the 6 cities) > paid:
they list AND post the reveal = supply + reach in one move.

Blog (SEO + LLM-answer surface), weekly, mapped to corridor pages:
- "How home swapping works (and how it's insured)"
- "Home swap vs Airbnb: real cost of a month in Lisbon"
- "8 best Amsterdam neighborhoods to swap into"

## 5. Paid ads — only after supply exists

- Now → Aug (supply): small budget, target homeowners in 6 cities + waitlist
  lookalikes, interest=travel/HomeExchange/expat. Objective: listings. ~$20–40/day/city.
- September (demand): scale. Retarget waitlist, Google Search on corridor keywords,
  broad Meta to travelers now that homes exist.
- Always UTM-tagged (attribution already built); cut losers weekly.

## 6. Metrics (plumbing already exists)

- Listings per corridor (the only pre-launch number that matters)
- Corridor match-density (≥1 plausible swap per listing?)
- Waitlist→listing conversion by UTM
- Referral coefficient (invites/host, % accepted)

Launch-readiness gate: don't open a corridor until a new user sees **≥5 plausible
matches on first search**. "No matches" on day one = dead on arrival.

## First moves
1. Fix OG image + favicon + manifest (§2)
2. Pick 2 priority corridors → generate demand-pair SEO pages
3. Turn HeroSplitVisual into the daily video template
