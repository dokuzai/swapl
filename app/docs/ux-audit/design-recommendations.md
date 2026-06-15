# Swapl — Design Recommendations (P0 web)

**Author:** UI/UX design
**Date:** 2026-06-15
**Scope:** The four P0 web items from `cx-report.md` / `web-findings.md`, specified for direct implementation against the existing web components.
**Locale:** IT is the default end-user experience. All copy below is the production Italian; the English column is the `dict-en.ts` fallback string.

## Design system anchors (reuse, do not reinvent)

These already exist and every recommendation below is built from them — no new primitives.

- **i18n:** namespaced dictionary `lib/i18n/dict-en.ts` + `dict-it.ts`, keyed `"section.key"`, consumed via the client `t()` / server `en`/`it` lookups. Missing IT keys fall through to English — which is exactly the W1 leak. **Every literal below ships as a new dictionary key in both files.**
- **Buttons:** `.pill-primary` (filled, rose/pink CTA), `.pill-ghost` (outline secondary).
- **Cards / surfaces:** `.surface-card`, panel insets `p-4`/`p-5`, divider `var(--line)`, inset background `var(--cream-2)` / `var(--card-bg)`.
- **Type:** `font-display` (serif) for headings; `font-mono text-[10px]/[11px] uppercase tracking-[.08em]` for the editorial kicker labels (the "SWAP DETAILS / ORIGINAL PROPOSAL" caps style).
- **Palette tokens:** `--navy` / `--navy-2` / `--navy-3` (text ramp), `--pink` + `--pink-light` (rose accent), `--cream-2` / `--sand` (warm fills), `#dc2626` (error).
- **Status:** `StatusPill` + `statusDotColor` in `app/swaps/status-pill.tsx`.
- **Dates:** `formatDateRange` in `lib/listing-utils.ts` — currently hardcodes `"en-US"`; the localization item fixes this at the source.

---

## 1. App-experience feedback widget (T2 / W6)

The only review surface today is traveller→traveller (`SwapReview`). We need a separate **product/app** feedback capture. Keep it light, warm, and non-blocking — it is a vent valve and a CSAT instrument, not a gate.

### 1.1 Placement (three entry points, one shared sheet)

1. **Persistent, low-key:** a "Com'è la tua esperienza su Swapl?" row in the account/help area (the avatar menu → same group as `menu.help`). Always reachable, never nags.
2. **Post-positive-moment prompt (primary signal):** auto-open the sheet **once** after a genuinely good moment — immediately after a user submits a `LeaveReview` (post-completed swap), or on first load of an `ACCEPTED` swap thread. Gate with a client flag so it appears at most once per ~30 days and never twice in a session. This is the moment delighted users will also seed a store rating.
3. **Contextual escape hatch:** a quiet "Invia un feedback" link in the thread Actions panel footer, so a frustrated user mid-negotiation has an in-app outlet instead of going to public reviews.

It renders as a centered modal sheet on desktop and a bottom sheet on mobile — reuse the existing modal/`surface-card` shell, not a new component family.

### 1.2 Interaction model

A single short form, all on one screen (no multi-step):

- **Score — 1–5 with emoji faces.** Five tappable faces left→right, each a rose-tinted pill that fills (`--pink`) on select. Map: 1 = 😣 *Pessima*, 2 = 🙁 *Così così*, 3 = 😐 *Nella media*, 4 = 🙂 *Buona*, 5 = 😍 *Ottima*. The numeric 1–5 is the stored value; the emoji + word is the label. Required.
- **Flow context — auto-captured, shown read-only.** Stamp the originating surface so feedback is segmentable. Display a small mono chip "Da: {contesto}" the user can see but not have to fill. Contexts and their IT labels:
  - `negotiation` → "Trattativa scambio"
  - `inbox` → "Posta scambi"
  - `browse` → "Esplora case"
  - `publish` → "Pubblica casa"
  - `trip` → "Viaggio in corso"
  - `account` → "Account"
  - `other` → "Generale"
- **Comment — optional free text.** `textarea`, placeholder "Raccontaci cosa ha funzionato o cosa no (facoltativo)", soft cap 600 chars with a live counter that only appears past 500. Never block submit on the comment.
- **Conditional nudge.** If score ≥ 4 **and** the entry point was a post-positive prompt, after submit show a secondary "Ti va di lasciare una recensione anche sullo store?" with a store deep-link (web: link out to the relevant store / "Consiglia Swapl"). If score ≤ 2, suppress the store ask entirely and instead surface "Vuoi che ti ricontattiamo?" → support link. Never send an unhappy user to a public store rating.

Persist to a **new app-feedback model/endpoint** (score 1–5, optional comment, `context` enum, `client="web"`, locale, timestamp), separate from `SwapReview`. This is the same backend piece the iOS/Android clients consume — build once.

### 1.3 States

- **Empty / default:** heading `font-display` "Com'è la tua esperienza su Swapl?", sub-line in `--navy-2`, the five faces, optional comment collapsed until a face is chosen (reduces visual weight). Submit `.pill-primary` disabled until a face is selected, label "Invia".
- **Submitting:** button label → "Invio…", disabled (mirror the `swap-actions.tsx` `pending` pattern).
- **Success / confirm:** swap sheet body for a centered confirmation — a rose check, `font-display` "Grazie, ci aiuta tantissimo." and `--navy-2` "Il tuo feedback va dritto al team che costruisce Swapl." Auto-dismiss after ~2.5s or on "Chiudi". (For score ≥4 post-positive path, the store-rating nudge replaces auto-dismiss.)
- **Error:** inline `#dc2626` line above the button "Non siamo riusciti a inviare. Riprova." — keep the form populated, never lose the comment (the current `swap-actions` error pattern drops nothing).

### 1.4 Exact Italian copy

| Element | IT | EN fallback |
|---|---|---|
| Entry row / title | Com'è la tua esperienza su Swapl? | How's your Swapl experience? |
| Subtitle | Valuta l'app, non il tuo partner di scambio. | Rate the app, not your swap partner. |
| Face 1 | Pessima | Terrible |
| Face 2 | Così così | Not great |
| Face 3 | Nella media | Okay |
| Face 4 | Buona | Good |
| Face 5 | Ottima | Great |
| Context chip prefix | Da: | From: |
| Comment placeholder | Raccontaci cosa ha funzionato o cosa no (facoltativo) | Tell us what worked or didn't (optional) |
| Submit | Invia | Send |
| Submitting | Invio… | Sending… |
| Success title | Grazie, ci aiuta tantissimo. | Thank you, this really helps. |
| Success body | Il tuo feedback va dritto al team che costruisce Swapl. | Your feedback goes straight to the team building Swapl. |
| Store nudge (score ≥4) | Ti va di lasciare una recensione anche sullo store? | Mind leaving a store review too? |
| Store nudge CTA | Consiglia Swapl | Recommend Swapl |
| Low-score follow-up (≤2) | Vuoi che ti ricontattiamo? | Want us to follow up? |
| Low-score CTA | Contatta il supporto | Contact support |
| Error | Non siamo riusciti a inviare. Riprova. | We couldn't send that. Try again. |
| Dismiss | Chiudi | Close |
| Thread footer link | Invia un feedback | Send feedback |

Suggested keys: `appFeedback.title`, `.subtitle`, `.face.1…5`, `.contextFrom`, `.commentPlaceholder`, `.submit`, `.submitting`, `.successTitle`, `.successBody`, `.storeNudge`, `.storeCta`, `.lowFollowUp`, `.lowCta`, `.error`, `.dismiss`, `.threadLink`, plus `appFeedback.context.{negotiation|inbox|browse|publish|trip|account|other}`.

---

## 2. Localizing the swap inbox + conversation (T1 / W1, W4)

These literals are hardcoded English in `app/swaps/page.tsx`, `app/swaps/[id]/page.tsx`, `swap-actions.tsx`, `swap-context-panel.tsx`, and `status-pill.tsx`. Route every one through the dictionary and add the IT strings below. **No layout change — string swap only**, except date format (see 2.2).

### 2.1 Exact IT strings

| Surface | English (current literal) | Italian | Suggested key |
|---|---|---|---|
| Inbox H1 | Swap inbox | Posta scambi | `swaps.inbox.title` |
| Summary — waiting on you | {n} waiting on you | {n} in attesa di te | `swaps.inbox.waitingOnYou` |
| Summary — waiting on them | {n} waiting on them | {n} in attesa di loro | `swaps.inbox.waitingOnThem` |
| Summary — active | {n} active | {n} attivi | `swaps.inbox.active` |
| Search field | Search conversations | Cerca conversazioni | `swaps.inbox.search` |
| Unread badge | {n} unread | {n} da leggere | `swaps.inbox.unread` |
| Tab | ALL | TUTTI | `swaps.tab.all` |
| Tab | HOSTING | OSPITO | `swaps.tab.hosting` |
| Tab | TRAVELING | VIAGGIO | `swaps.tab.traveling` |
| Tab | ARCHIVED | ARCHIVIATI | `swaps.tab.archived` |
| Row meta (host) | PENDING · HOSTING | IN ATTESA · OSPITO | (compose from status + role keys) |
| Row meta (active) | ACTIVE SWAP · TRAVELING | SCAMBIO ATTIVO · VIAGGIO | (compose) |
| Back link | ← ALL SWAPS | ← TUTTI GLI SCAMBI | `swaps.backToAll` |
| Panel section | SWAP DETAILS | DETTAGLI SCAMBIO | `swaps.panel.details` |
| Panel section | ORIGINAL PROPOSAL | PROPOSTA ORIGINALE | `swaps.panel.original` |
| Panel label | PROPOSAL | PROPOSTA | `swaps.panel.proposal` |
| Panel label | with | con | `swaps.panel.with` |
| Their place (no name) | Their place | La loro casa | `swaps.panel.theirPlace` |
| Their place (named) | {name}'s place | Casa di {name} | `swaps.panel.theirPlaceNamed` |
| Your home row | Your home: {n} · {c} | Casa tua: {n} · {c} | `swaps.panel.yourHome` |
| View link | View → | Apri → | `swaps.panel.view` |
| Listing meta | {n}m² · sleeps {x} | {n} m² · posti letto {x} | `swaps.panel.sleeps` |
| Actions section | Actions | Azioni | `swaps.panel.actions` |
| Empty (no convos) | No conversations yet | Ancora nessuna conversazione | `swaps.empty.title` |
| Empty body | Propose a swap from any listing and it will show up here. | Proponi uno scambio da una casa e comparirà qui. | `swaps.empty.body` |
| Select prompt | Select a conversation | Seleziona una conversazione | `swaps.select.title` |
| Select body | Pick a thread on the left to see messages and swap details. | Scegli una conversazione a sinistra per vedere messaggi e dettagli. | `swaps.select.body` |

### 2.2 Status pill labels (`status-pill.tsx`)

| Status | EN | IT | Key |
|---|---|---|---|
| PENDING | Pending | In attesa | `swaps.status.pending` |
| COUNTERED | Countered | Controproposta | `swaps.status.countered` |
| ACCEPTED | Active swap | Scambio attivo | `swaps.status.accepted` |
| DECLINED | Declined | Rifiutato | `swaps.status.declined` |
| WITHDRAWN | Withdrawn | Ritirato | `swaps.status.withdrawn` |

### 2.3 Action-bar labels (`swap-actions.tsx`) — see also §3

| EN | IT | Key |
|---|---|---|
| Accept & insure | Accetta lo scambio | `swaps.action.accept` (relabelled in §3) |
| Decline | Rifiuta | `swaps.action.decline` |
| Counter offer | Fai una controproposta | `swaps.action.counter` |
| Cancel counter | Annulla controproposta | `swaps.action.counterCancel` |
| Withdraw | Ritira proposta | `swaps.action.withdraw` |
| Send counter | Invia controproposta | `swaps.action.counterSend` |
| Sending… | Invio… | `swaps.action.sending` |
| Counter from / to | Dal / Al | `swaps.action.counterFrom` / `.counterTo` |
| Message | Messaggio | `swaps.action.message` |
| Swap is active… Contact support | Lo scambio è attivo. Hai un problema? Contatta il supporto. | `swaps.action.activeNote` |
| This proposal is closed. | Questa proposta è chiusa. | `swaps.action.closed` |
| Action failed | Operazione non riuscita | `swaps.action.failed` |

### 2.4 "IN DIRETTA" / LIVE (chat presence)

For the realtime/presence indicator: **IN DIRETTA**, key `swaps.chat.live`. Render as a small mono caps label with a pulsing `--pink` dot (reuse `statusDotColor` rose). EN fallback "LIVE".

### 2.5 Date format

`formatDateRange` currently calls `toLocaleDateString("en-US", …)`. Pass the active locale and use the IT short month form so `Aug 23 – Sep 8` becomes **`23 ago – 8 set`**:
- Format: `{day} {monthShort}` per side, joined by ` – `. IT short months are lowercase, no period: `gen feb mar apr mag giu lug ago set ott nov dic`.
- Same-month range may collapse to `23 – 30 ago` (optional polish).
- Apply the same locale fix to the chat day-divider (`chat-thread.tsx` line 437) and times.

---

## 3. Restructure "Accept & insure" so insurance consent is clear (T4 / W2)

**Problem:** the primary CTA `Accept & insure` + "Auto-issued on acceptance" silently binds the user to an insurance policy in one tap, with no acknowledged step — a consent/transparency issue in an EU market.

**Design:** decouple the two ideas. The button accepts the *swap*; insurance is a clearly-disclosed, acknowledged consequence shown **before** the commit, not baked into the verb.

### 3.1 New flow

1. CTA relabels to **"Accetta lo scambio"** (`.pill-primary`). It no longer says "insure" — accepting is about the swap.
2. Tapping it opens a small **confirm step** (reuse the modal/`surface-card` shell — this also satisfies T3, the missing accept confirmation) containing:
   - Title `font-display`: "Confermi lo scambio?"
   - A short recap line: partner name + dates (reuse `formatDateRange`).
   - An **insurance disclosure block** in a `--cream-2` inset with the rose shield/`ProofOfCoverBadge` styling: heading "Assicurazione inclusa", body "Accettando, entrambe le case vengono assicurate automaticamente — danni, responsabilità civile e interruzione del viaggio, in entrambe le direzioni. Nessun costo, nessun upsell." plus a `.pill-ghost`-styled inline link "Leggi la copertura →" to the policy summary.
   - An explicit acknowledgement **checkbox** (unchecked by default): "Ho capito che accettando attivo la polizza assicurativa per questo scambio." The confirm button stays disabled until it is checked. This is the consent artifact.
   - Confirm button: **"Conferma e assicura"** (`.pill-primary`, disabled→enabled on checkbox), and a `.pill-ghost` "Annulla".
3. On confirm, fire the existing `{ action: "accept" }`. On success show the success/cover state already handled by the trip cockpit + `InsurancePanel`.

This keeps a single network action but moves the insurance acknowledgement to an explicit, logged user gesture. Also update the pre-accept teaser copy in `InsurancePanel` ("Auto-issued on acceptance") to the IT "Inclusa all'accettazione" so the static panel and the confirm step agree.

### 3.2 Exact Italian copy

| Element | IT | EN fallback | Key |
|---|---|---|---|
| Accept CTA | Accetta lo scambio | Accept swap | `swaps.action.accept` |
| Confirm title | Confermi lo scambio? | Confirm the swap? | `swaps.accept.confirmTitle` |
| Recap | Con {name} · {dateRange} | With {name} · {dateRange} | `swaps.accept.recap` |
| Insurance heading | Assicurazione inclusa | Insurance included | `swaps.accept.insTitle` |
| Insurance body | Accettando, entrambe le case vengono assicurate automaticamente — danni, responsabilità civile e interruzione del viaggio, in entrambe le direzioni. Nessun costo, nessun upsell. | On acceptance both homes are automatically insured — damage, liability and trip interruption, both directions. No cost, no upsell. | `swaps.accept.insBody` |
| Policy link | Leggi la copertura → | Read the coverage → | `swaps.accept.insLink` |
| Acknowledgement | Ho capito che accettando attivo la polizza assicurativa per questo scambio. | I understand that accepting activates the insurance policy for this swap. | `swaps.accept.ack` |
| Confirm button | Conferma e assicura | Confirm & insure | `swaps.accept.confirm` |
| Cancel | Annulla | Cancel | `swaps.accept.cancel` |
| Static teaser title | Inclusa all'accettazione | Included on acceptance | `swaps.ins.teaserTitle` |

---

## 4. Host-actionable proposals — decision controls above the fold (T12 / W3)

**Problem:** for a proposal "in attesa di te," the accept/counter/decline bar sits at the **bottom** of the right-hand `SwapContextPanel` (after the listing card, your-home row, and insurance teaser), and on mobile it lives below the chat and below a collapsed `<details>`. The user has to hunt for the decision the screen is asking them to make.

**Design:** when the viewer is the host and the proposal is `PENDING` or `COUNTERED` (`canRespondAsTarget` true), promote the decision to the top.

### 4.1 Desktop (three-pane)

- In `SwapContextPanel`, render a compact **"Decisione" action card at the top of the right column** (above the listing image) for host-actionable proposals only. It contains: a one-line "In attesa della tua risposta" header, the dates, and the three primary controls (`Accetta lo scambio` / `Rifiuta` / `Fai una controproposta`). The existing full Actions block lower down collapses to a thin secondary affordance (or is removed to avoid duplication — single source of the buttons).
- Make this top card **sticky** (`position: sticky; top: …`) within the panel so it stays reachable while the user scrolls the chat/details.

### 4.2 Mobile (stacked)

- The thread currently collapses the panel into a top `<details>` (per the `swap-context-panel` comment). For host-actionable proposals, **pin a slim sticky action bar to the bottom of the viewport** (thumb zone) with `Accetta lo scambio` (primary) + an overflow "⋯" exposing `Rifiuta` / `Controproposta`. This guarantees the decision is reachable without scrolling past the chat.
- Keep `SWAP DETAILS` (`DETTAGLI SCAMBIO`) as the collapsible — details can stay below the fold; the *decision* cannot.

### 4.3 Hierarchy rules

- Exactly **one** primary `.pill-primary` per thread (Accept). Decline/Counter are `.pill-ghost`. Never two filled buttons competing.
- Only elevate for `canRespondAsTarget`. For the proposer's own pending proposal, the top slot instead shows a quiet status line ("In attesa di {name}", `--navy-2`) + the `Ritira proposta` ghost — no false urgency.
- For `ACCEPTED`/`DECLINED`/`WITHDRAWN`, no elevated bar — the status pill + active/closed note is enough.

### 4.4 Exact Italian copy

| Element | IT | EN fallback | Key |
|---|---|---|---|
| Decision card kicker | DECISIONE | DECISION | `swaps.decide.kicker` |
| Host prompt | In attesa della tua risposta | Waiting on your response | `swaps.decide.prompt` |
| Proposer status | In attesa di {name} | Waiting on {name} | `swaps.decide.waitingName` |
| Overflow label | Altre azioni | More actions | `swaps.decide.more` |

(Button labels reuse the §2.3 / §3 keys.)

---

## Implementation order (web P0)

1. **Localization (§2)** first — highest surface area, gates credibility, and centralizes the strings the other items reuse. Includes the `formatDateRange` locale fix.
2. **Accept/insurance restructure (§3)** — folds in the T3 accept-confirmation as the same modal; ship with the localized labels from §2.3.
3. **Above-the-fold decision controls (§4)** — pure layout/sticky work on `SwapContextPanel`, no new copy beyond §4.4.
4. **Feedback widget (§1)** — needs the new backend model/endpoint; build the web sheet against it and wire the post-`LeaveReview` / `ACCEPTED`-thread trigger.

All four stay within the existing `.pill-*` / `.surface-card` / palette-token / `StatusPill` / dictionary system — no new component families, no new color tokens.
