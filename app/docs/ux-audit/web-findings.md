# Web client — UX audit findings (rendered, IT locale)

Audited live against the seeded marketplace (1,021 listings) at http://localhost:3000,
logged in as a proposer-cohort user (`sim+b1-00000@sim.swapl`). First-hand, rendered.

Method: real browser walk — login → /listings → /swaps inbox → open PENDING proposal
(as host) → expand swap details → inspect accept/counter/decline actions and chat.

## Findings

| # | Flow | Severity | Category | Finding | Where | Suggested fix |
|---|------|----------|----------|---------|-------|---------------|
| W1 | Swap inbox + negotiation | **major** | MISSING (i18n) | The single most-important flow (negotiate → accept) is **half-untranslated** in the IT-locale app: `Swap inbox`, `waiting on you / on them`, `active`, tabs `ALL/HOSTING/TRAVELING/ARCHIVED`, `Search conversations`, `1 unread`, `PENDING · HOSTING`, `ACTIVE SWAP · TRAVELING`, `← ALL SWAPS`, `SWAP DETAILS`, `ORIGINAL PROPOSAL`, `PROPOSAL`, `with`, `VIEW`, `Your home`. Italy is the launch market. | `app/` swaps inbox + conversation views | Wire every literal through the i18n dictionary; add IT strings. |
| W2 | Accept proposal | **major** | COUNTERINTUITIVE | Primary CTA reads `Accept & insure` and the fine print says insurance is *"Auto-issued on acceptance"* — accepting a swap silently commits the user to an insurance policy with no separate confirmation or opt-out shown at the decision point. | conversation action bar | Split the decision: `Accetta lo scambio`, then surface insurance as a clearly-labelled, acknowledged step (even if free), or at minimum an inline explainer + link before commit. |
| W3 | Accept/Counter/Decline actions | **minor** | CLUNKY | The accept/counter/decline action bar sits **below** the chat and below a collapsible `SWAP DETAILS` accordion; for a proposal "waiting on you" the decision controls are not above the fold. | conversation view layout | For host-actionable proposals, pin the action bar to the top (or sticky) so the decision is immediately reachable. |
| W4 | Dates everywhere | **minor** | CONFUSING | Dates render as English-format `Aug 23 – Sep 8`, `Jun 6 – Aug 13` in an Italian app instead of `23 ago – 8 set`. | listing cards + swap header | Localise date formatting via the active locale. |
| W5 | Mixed-language chips on listing cards | **minor** | CONFUSING | Listing browse cards show English amenity chips `ROOFTOP / COURTYARD / BIKE INCL. / WFH 2 DESKS / DISHWASHER / ELEVATOR` and `Townhouse/Loft/House` while surrounding copy is Italian. | listings grid card | Localise amenity + property-type labels. |
| W6 | Rate the app experience | **blocker (for the ask)** | MISSING | There is **no way for a user to rate the app/product experience** anywhere — `SwapReview` is strictly traveller→traveller (rating + text about the *other person*). The user explicitly wanted members to rate "anche l'esperienza sulle app". No model, endpoint, or UI exists. | `prisma/schema.prisma` SwapReview (user-to-user only); no app-feedback route under `app/api` | Add a lightweight in-app feedback/rating mechanism (CSAT or 1–5 + comment + client tag web/ios/android), persisted, surfaced after key flows (post check-out, post-swap). |
| W7 | Empty/quiet states | **minor** | BORING | Reviews & profile surfaces are sparse; nothing nudges the user toward the next action after browsing. (Observed thin states; confirm against profile view.) | profile / reviews views | Add gentle next-step prompts + richer empty states. |

## Cross-client note (for synthesis)
W1/W4/W5 (i18n leakage) and W6 (no app-experience rating) are very likely to recur on
iOS and Android since all three share the same backend + product surface — flagged for the
mobile critics to confirm, and for the CX specialist to treat as a **cross-platform theme**.
