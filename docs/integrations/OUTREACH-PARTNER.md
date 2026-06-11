# Outreach partner — chi contattare e messaggi pronti

> Companion di [`SERVIZI-ESTERNI.md`](./SERVIZI-ESTERNI.md). Stato: bozza operativa 2026-06-11.
> Mittente suggerito: Gert Meleqi, founder — gert@basilinq.com (o casella dedicata
> partnerships@swapl.fun appena configurata su Resend).

## Pitch boilerplate (da riusare in ogni messaggio)

> Swapl (swapl.fun) is a reciprocal home-swap marketplace launching in September 2026 —
> members exchange homes key-for-key, every accepted swap is insured automatically. Our users
> are travelers by definition: every confirmed swap generates a trip with a known destination
> city and exact dates, which we already use to recommend in-destination services. We are
> pre-launch with a six-corridor go-to-market (including Istanbul⇄Amsterdam and
> Lisbon⇄Mexico City) and native checkout already live on Stripe.

Punto di forza da sottolineare sempre: **intento d'acquisto perfetto** — conosciamo
destinazione, date e profilo del viaggiatore *prima* del viaggio; il servizio del partner viene
proposto nel momento esatto in cui serve (post-conferma swap).

## Template email generale (EN)

```text
Subject: Partnership inquiry — native [CATEGORY] booking on Swapl (home-swap marketplace)

Hi [NAME/TEAM],

[PITCH BOILERPLATE — vedi sopra]

We currently send our members to [PARTNER] via affiliate links, and we'd like to upgrade to a
deeper integration: selling [PARTNER]'s inventory natively inside Swapl, with checkout and
payment handled on our platform (Stripe) and bookings created through your API.

Specifically, we'd like to understand:
1. Access requirements for your [API PROGRAM NAME] for an early-stage platform (we are
   pre-launch, with committed corridor-based growth targets for 2026–2027);
2. The commercial model — revenue share / net rates, and whether we can act as
   merchant of record;
3. Technical certification steps and expected timeline.

Would you be available for a short call in the next two weeks? We can share our launch plan
and integration mockups.

Best regards,
Gert Meleqi — Founder, Swapl (Dokuz AI FZCO)
swapl.fun · gert@basilinq.com
```

Varianti per partner sotto. Dove il canale è un form, incollare il corpo del template nel
campo messaggio; tenere traccia nello stato outreach in fondo.

---

## 1. Esperienze & tour

_TODO: ricerca contatti in corso (GetYourGuide Partner/Distribution API, Viator Merchant API,
Tiqets, Klook, Musement) — sarà completata con form/email esatti e variante messaggio._

## 2. Assicurazione

| Partner | Canale | Note |
|---|---|---|
| **battleface** (travel insurance) | Form onboarding: https://partner.battleface.com/partner-onboarding-form/ · call: https://www.battleface.com/en-us/partners/schedule-a-call/ · email: partner@battleface.com (da riverificare) · docs: https://developers.battleface.com/ | Prima scelta. Chiedere: revenue share, mercati EEA coperti (NL/IT/PT/TR), adempimenti IDD art. 1(4) a loro carico. |
| **Truvi** (copertura danni swap, ex SUPERHOG) | https://truvi.com/ (form) · FAQ piattaforme: https://truvi.com/faqs/platform/ | Citare i precedenti **Swaphouse** e **ThirdHome** (home exchange). Chiedere: waiver white-label via API, copertura liability oltre ai danni, economics (~7% del protetto, loro ~20%). |
| Qover (alternativa) | https://www.qover.com/api (demo form) · docs: https://docs.qover.com/ | Orchestratore regolato BE; partner medio/grandi. |
| Cover Genius (long shot) | https://covergenius.com/about-us/ (form) | Enterprise (Booking, Ryanair); solo form, zero effort extra. |

**Variante messaggio (battleface):** template generale con `[CATEGORY] = travel insurance`, più:

```text
Today we auto-issue a basic stay-coverage at swap acceptance through an internal placeholder;
we want to replace it with a regulated embedded product: quote and policy issuance via your
Partner API at our checkout, premium collected by us. Volumes scale with accepted swaps
(every swap = two travelling parties). Please outline the revenue-share model, EEA market
coverage (Netherlands, Italy, Portugal, Turkey), and how IDD art. 1(4) duties are handled
on your side.
```

**Variante messaggio (Truvi):**

```text
We're building what Swaphouse and ThirdHome built with you: damage protection embedded in a
home-swap flow. Every accepted swap on Swapl should trigger guest screening + a damage
waiver, white-label via API, fee collected in our checkout. Could you share platform
economics, what's covered (property damage vs liability), and API integration steps?
```

## 3. eSIM

| Partner | Canale | Note |
|---|---|---|
| **Maya** | Form business: https://maya.net/business (account gratuito, approvazione 1–2 gg) | Nessun deposito; NDA per docs/prezzi API. Partire da qui. |
| **eSIM Go** | Form su https://esimgo.com (no email pubblica verificata) · docs: https://docs.esim-go.com | Tier Standard ~$1.000 top-up; registrazione quasi self-serve. |
| **Airalo** | Form: https://partners.airalo.com/ · API: https://www.airalo.com/partner-with-us/api-partners · supporto partner: partner.support@airalo.com | Chiedere esplicitamente quote wholesale e soglia MSP. Docs: https://developers.partners.airalo.com/ |

**Variante messaggio (eSIM):** usare il template generale con
`[CATEGORY] = travel eSIM`, e aggiungere:

```text
Our use case: every confirmed home swap has a destination country and exact travel dates —
we want to offer a pre-configured eSIM for the destination at checkout, sold under our brand
at a price we set, provisioned through your API. Please include your wholesale/net pricing
tiers (and any minimum selling price constraints) in your reply.
```

## 4. Voli — Duffel (nessun outreach necessario)

Self-serve: signup https://app.duffel.com/join → sandbox immediata. Unica domanda da fare al
supporto (help.duffel.com) prima di investire sviluppo:

```text
Subject: EU point-of-sale coverage for Managed Content

Hi — we're an EU-based travel platform (Netherlands/Italy customers) evaluating Duffel with
Managed Content. Can you confirm current point-of-sale coverage for EU markets, and current
per-order pricing? We'd start on the free tier (<50 orders/month).
```

## 5. Transfer aeroportuali

| Partner | Canale | Note |
|---|---|---|
| **Transferz** | Form: https://www.transferz.com/partner-signup · https://www.transferz.com/become-a-partner/ · docs: https://developers.transferz.com/ | Chiedere modello net-rate + conferma merchant of record. Sede Amsterdam (comodo per call EU). |
| **Welcome Pickups** | Form API: https://partner.welcomepickups.com/travel-api/ · signup agency: https://go.partner.welcomepickups.com/en/travel-agencies/signup/ · supporto: partners_support@welcomepickups.com | Commissione la definisce il partner; chiedere se sul tier API il MoR può essere Swapl. |
| **HolidayTaxis** (HBX Group) | info@holidaytaxis.com · +44 1273 828 200 · docs: https://developer.holidaytaxis.com | Terza scelta; chiedere net rates per agenti. |

**Variante messaggio (transfer):** template generale con `[CATEGORY] = airport transfers`, più:

```text
Typical use case: a confirmed home swap generates two known airport-to-home legs (both
directions, exact dates). We want to sell pre-booked transfers in our checkout at retail
prices we set on top of your net rates. Please outline your net-rate model, whether we can
act as merchant of record, and API access requirements for an early-stage platform.
```

⚠️ Non contattare **Jayride** (società sospesa dall'ASX, fornitori non pagati — vedi
`SERVIZI-ESTERNI.md` §5).

## 6. Noleggio auto

| Partner | Canale | Note |
|---|---|---|
| **Discover Cars (B4B)** | Form: https://pages.discovercars.com/b4b · richieste: https://help.discovercars.com/hc/en-us/requests/new · affiliate: https://www.discovercars.com/affiliate | Chiedere della nuova API book+pay (rollout fine 2025) e se il partner può incassare. Partire da widget/white-label. |

**Variante messaggio (noleggio):** template generale con `[CATEGORY] = car rental`; chiedere
esplicitamente: requisiti per la B4B API "booking and pay endpoints in the partner
environment", commissioni rispetto al programma affiliate (70% profit share), volumi minimi.

## 7. Deposito bagagli

| Partner | Canale | Note |
|---|---|---|
| **Stasher** | partnerships@stasher.com · affiliate self-serve: https://partners.stasher.com/ | Unico con storico di integrazioni in-checkout concesse ai partner (Hotels.com, Expedia…). Partire affiliate, negoziare B2B. |
| Bounce (fallback affiliate) | partners@usebounce.com · affiliate@usebounce.com · https://bounce.com/ls/affiliates | Solo affiliate 10%; ha acquisito Nannybag. |

## 8. Key exchange & pulizie

| Partner | Canale | Note |
|---|---|---|
| **KeyNest** | support@keynest.com (routing al team partner) · https://keynest.com/partners | Chiedere accesso API v3 (precedente PMS: Guesty/Hostaway) e billing di piattaforma con markup. Prezzi EU: €7,14/ritiro PAYG. |
| Turno (pulizie, orchestrazione) | https://turno.com/integrations/ · docs: https://apidocs.turnoverbnb.com/ | API gated su richiesta; il pagamento cleaner resta su Turno. |
| Pulizie locali (lancio) | imprese locali nelle città corridoio | Contratto diretto dietro checkout Swapl — è già il modello dell'add-on `cleaning`. |

**Variante messaggio (KeyNest):** template generale con `[CATEGORY] = key exchange`, più:

```text
Our product is literally key-for-key home swapping: every accepted swap requires two key
handovers in two cities. We'd like API access (v3) to auto-create drop-off/collection codes
per swap, plus a platform billing arrangement where the fee is collected in our checkout.
Your PMS integrations (Guesty, Hostaway) are the model we have in mind.
```

---

## Stato outreach

| Partner | Categoria | Canale usato | Data invio | Risposta | Prossimo passo |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

Aggiornare questa tabella a ogni invio/risposta. Le candidature inviate vanno anche annotate
nella issue Linear di outreach (vedi progetto "Swapl Product — Pre-launch engineering").
