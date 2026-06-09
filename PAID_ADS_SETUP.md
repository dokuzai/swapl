# Swapl — Paid Ads Setup (ready to implement)

_The complete plan to stand up paid acquisition. You execute it in Meta Ads
Manager / Google Ads — this doc is the blueprint, audiences, budgets, creative and
tracking. Companion to [VIDEO_STORYBOARDS.md](VIDEO_STORYBOARDS.md) and
[MARKETING_PLAN.md](MARKETING_PLAN.md)._

> **I won't create ad accounts, enter payment details, or spend money** — those
> are yours to do. Everything below is configured and ready to paste in.
> Replace `swapl.app` with your live domain.

---

## 0. The golden rule of sequencing
**Do not run demand (traveller) ads into an empty marketplace.** Spend on supply
first; flip to demand only once a corridor has density. Two phases:

| Phase | When | Goal | Who you target | Budget |
|---|---|---|---|---|
| **Supply** | Now → Aug | Founding-host listings | Homeowners in launch cities | Small, ~$20–40/day/active city |
| **Demand** | September | Travellers + waitlist | People who want to travel to your corridors | Scale once matches exist |

---

## 1. Tracking foundation (do this BEFORE spending a dollar)

You already capture attribution: `BetaSignup` stores `source/medium/campaign/term`,
and `marketing-tracker` fires `page_view`, `subscriber_signup`,
`listing_intent_click`, `subscriber_intent_click`. Wire ads to it:

1. **Meta Pixel + Conversions API** on the site; map events:
   - `subscriber_signup` → **Lead**
   - `listing_intent_click` → **custom: ListingIntent** (your north-star supply event)
2. **Google Ads conversion** import the same two events (via GA4 or gtag).
3. **UTMs on every ad URL** (so your own `BetaSignup` attribution agrees with the
   ad platforms — trust your first-party data over their reported numbers):
   `?utm_source={meta|google}&utm_medium=cpc&utm_campaign={supply|demand}_{city}&utm_content={creative}&utm_term={adset}`
4. **Consent:** keep the cookie banner privacy-first; gate the pixel on consent.

**Primary optimisation event = `listing_intent_click` (supply) / `subscriber_signup` (demand).** Never optimise to clicks or reach.

---

## 2. Phase 1 — Supply campaigns (Meta, now → August)

**Objective:** Leads / Conversions (optimise to ListingIntent), NOT traffic.

**Structure (one campaign, city ad sets — keep corridors dense):**
```
Campaign: SUPPLY — Founding Hosts (Conversions: ListingIntent)
  Ad set: Amsterdam   — homeowners, 28–60, AMS metro
  Ad set: Istanbul    — homeowners, 28–60, IST metro
  Ad set: Lisbon      — homeowners, 28–60, LIS metro
  Ad set: CDMX, Brooklyn, Tokyo (turn on as you focus)
```

**Audiences per city ad set:**
- Geo: that city metro only. Age 28–60. 
- Interests (broad, let the algo learn): travel, frequent international travel,
  HomeExchange / home exchange, expat, digital nomad, second home, Airbnb hosting.
- **Lookalike** 1–3% of your waitlist (`BetaSignup` emails → custom audience) once you have ~500+.
- Exclude: existing listers (upload your host emails).

**Budget:** $20–40/day per active city. Start 2 cities (your priority corridors),
not 6. Let each ad set get ~50 ListingIntent events/week before judging.

**Creative (from the storyboards — UGC beats polished):**
- Primary: **Storyboard 3** (cost comparison) + **Storyboard 1** (swap reveal).
- Secondary: **Storyboard 4** (trust) for people who clicked but didn't list.
- 3–4 hook variants per concept (price number / "POV $0" / "a stranger in my home?").

**Ad copy (primary text variants):**
> "List your [City] home before September and become a founding host — keys for keys, no fees, every swap insured. First homes get featured + verified, free."
>
> "Your [City] home could be a free month in Lisbon, Istanbul, or Mexico City. Home swapping, no money, fully insured. Founding hosts list now 👇"
>
> "Tired of Airbnb fees eating your trips? Swap homes instead — €0 for the stay, every swap insured. Opening in [City] this September."

**Headlines:** "Become a founding host" · "Keys for keys, no fees" · "List before September"
**CTA button:** Sign Up. **Destination:** the city/corridor landing page (UTM'd).

---

## 3. Phase 2 — Demand campaigns (September launch)

Turn on only for corridors that pass the readiness gate (a new user sees ≥5
plausible matches). Three layers, in priority order:

**A. Retarget your warmest audience (highest ROAS):**
- Custom audiences: waitlist (`BetaSignup`), site visitors (Pixel 180d), video
  viewers (75%+), `subscriber_intent_click` non-converters.
- Message: "Swaps are live in [City]. Your match is waiting." → register.

**B. Google Search (high intent, capture existing demand):**
```
Campaign: DEMAND — Search
  Ad group: home swap [city]      → kw: "[city] home swap", "[city] home exchange"
  Ad group: homeexchange alt      → kw: "homeexchange alternative", "home swap no subscription"
  Ad group: corridor              → kw: "home swap from [A] to [B]"
```
- Landing pages: the matching **corridor pages** you already built (`/swap/...`)
  and the **comparison blog post** for "alternative" terms — they're built for
  exactly these queries.
- Start with **phrase/exact match**, tight negative list (jobs, sale, buy a house).

**C. Meta prospecting to travellers:**
- Geo: demand cities for each live corridor (from your `demandFrom` data).
- Interests: slow travel, digital nomad, sabbatical, the destination city.
- Creative: Storyboard 2 (whose place?) + 3 (cost). CTA → corridor page.

---

## 4. Budgets & ramp (illustrative — scale to your means)

| Stage | Monthly | Split |
|---|---|---|
| Supply test (now) | $1,500–2,500 | 2 cities, Meta only |
| Supply scale (pre-launch) | grow winners only | add cities that hit cost-per-listing target |
| Launch (Sept) | step up | 50% retarget · 30% Search · 20% prospecting |

**Kill/scale rules (review weekly by `utm_*`):**
- Pause any ad set above your target **cost-per-ListingIntent** after ~50 events.
- Scale winners +20–30%/week max (don't spike — it resets learning).
- Refresh creative when frequency > 2.5 or CTR drops 30% from peak.

---

## 5. Targets to hold yourself to
- **Supply phase:** cost per founding-host listing (set a ceiling, e.g. $8–15) and
  **listings per corridor** (the real number).
- **Demand phase:** cost per registration, then **register → first-proposal rate**.
- **Always:** judge by your `BetaSignup`/event data, not the platform's inflated
  attribution. If Meta claims 40 leads and `BetaSignup` shows 12 from that UTM,
  believe 12.

---

## 6. Pre-flight checklist
- [ ] Pixel + Conversions API live, events firing (test in Events Manager)
- [ ] `listing_intent_click` + `subscriber_signup` mapped as conversions (Meta + Google)
- [ ] UTM template saved and applied to every ad
- [ ] Waitlist uploaded as a custom audience (for lookalikes + exclusions)
- [ ] Cookie/consent gating the pixel
- [ ] 2 priority corridors chosen; ad sets built for those cities only
- [ ] 2 creative concepts × 3 hooks each, vertical 9:16 (Storyboards 3 + 1)
- [ ] Landing pages = corridor/city pages with UTMs (already built)
- [ ] Daily budget caps set; weekly review on the calendar
- [ ] **Demand campaigns paused** until each corridor passes the ≥5-match readiness gate
