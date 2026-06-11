# Servizi esterni monetizzabili — strategia di integrazione

> Stato: bozza operativa — 2026-06-11. Ricerca partner verificata via web (giugno 2026);
> le cifre di commissioni/fee vanno riconfermate per iscritto in fase di onboarding con ogni partner.
> Documento companion: [`OUTREACH-PARTNER.md`](./OUTREACH-PARTNER.md) (chi contattare + messaggi pronti).

## Obiettivo

Passare dal modello attuale **affiliate link** (l'utente esce da Swapl, paga sul sito del partner,
noi riscuotiamo una commissione mensile dal dashboard partner) al modello **vendita nativa**:

- l'utente compra il servizio (es. un tour GetYourGuide) **dentro Swapl**;
- **il pagamento avviene su Swapl** (Stripe, già integrato) — Swapl è merchant of record o agente;
- la **commissione è già applicata** nel prezzo (revenue share del partner o markup su prezzo netto);
- il partner viene chiamato via API per emettere la prenotazione/voucher.

## I tre modelli di integrazione

| Modello | Chi incassa | Margine | Effort | Stato in Swapl |
|---|---|---|---|---|
| **A. Affiliate link** | Partner | commissione post-hoc (manuale) | basso | ✅ live (`app/lib/affiliates/links.ts`, GetYourGuide/Skyscanner/Airalo/Battleface) |
| **B. Booking API (agency/MoR)** | **Swapl** | revenue share sul prezzo di vendita | medio | ❌ da costruire — è l'obiettivo di questo documento |
| **C. Reseller wholesale** | **Swapl** | markup libero su prezzo netto | medio | ❌ da costruire (eSIM, voli) |

Il modello B/C riusa l'infrastruttura già esistente: `AddOn`/`OrderAddOn` con
`stripePaymentIntentId` (checkout concierge, `/api/concierge/checkout`) e la riconciliazione
webhook Stripe (DOK-119).

## Matrice riassuntiva per categoria

| Categoria | Partner raccomandato | Modello | Margine atteso | Accesso startup pre-launch | Priorità |
|---|---|---|---|---|---|
| Esperienze & tour | _TODO: in ricerca (GetYourGuide vs Viator vs Tiqets)_ | B | _TODO_ | _TODO_ | **P1** |
| Assicurazione viaggio/swap | _TODO: in ricerca (battleface / Cover Genius)_ | B (embedded) | _TODO_ | _TODO_ | **P1** (sostituisce il mock `lib/insurance/mock.ts`) |
| eSIM | Maya (pilota) + eSIM Go / Airalo (quote) | C | wholesale non pubblico, da quotare | ✅ facile (Maya $0 ingresso) | **P2** |
| Voli | Duffel | B/C (markup esplicito) | markup libero; fee ~$3 + 1%/ordine | ✅ self-serve | **P3** (margini sottili su tratte EU) |
| Transfer aeroportuali | _TODO: in ricerca_ | B | _TODO_ | _TODO_ | P3 |
| Noleggio auto | _TODO: in ricerca_ | A→B | _TODO_ | _TODO_ | P3 |
| Deposito bagagli | _TODO: in ricerca_ | B | _TODO_ | _TODO_ | P3 |
| Key exchange / pulizie | _TODO: in ricerca (KeyNest)_ | B | _TODO_ | _TODO_ | P2 (core per lo swap) |

Priorità guidate dal funnel Swapl: lo swap è gratuito, la monetizzazione avviene **dopo
l'accettazione dell'agreement** (pagina `/swaps/[id]`, sezione "Make it seamless") e nella
sezione **Discover** del dettaglio listing (DOK-124).

---

## Categorie e provider

### 1. Esperienze & tour (GetYourGuide, Viator, Tiqets, Klook, Musement)

_TODO: ricerca in corso — sarà completata in questo documento con: modello Distribution/Merchant
API, possibilità merchant-of-record, range commissioni, requisiti di accesso, contatti._

### 2. Assicurazione viaggio / copertura swap (battleface, Cover Genius, Wakam)

_TODO: ricerca in corso. Nota interna: oggi l'assicurazione è un mock
(`app/lib/insurance/mock.ts`, provider `swapl-cover`, premio €1.4/m²/notte cap €120, quota
piattaforma 20%, copertura €1.500). Il partner reale deve supportare il modello embedded:
polizza emessa via API all'accettazione dell'agreement, pagamento riscosso da Swapl._

### 3. eSIM (Airalo, eSIM Go, Maya) — modello reseller wholesale

Tutti e tre supportano il requisito chiave: **Swapl incassa il pagamento**, compra a prezzo
netto via API e tiene il margine. Nessuno pubblica gli sconti wholesale: vanno quotati.

| | Modello | Costo d'ingresso | Vincoli | Docs API pubbliche |
|---|---|---|---|---|
| **Airalo** | Reseller no-code + Partner API white-label | non pubblico (prepaid credits o postpaid) | **MSP**: prezzo minimo di vendita imposto | ✅ developers.partners.airalo.com |
| **eSIM Go** | Wholesale API puro (nessun brand consumer concorrente) | ~$1.000 top-up iniziale (tier Standard) | fee per attivazione; supporto minimo al tier base | ✅ docs.esim-go.com |
| **Maya** | Connectivity API, wholesale per-MB a consuntivo | **$0** — pay-as-you-go mensile posticipato | docs e prezzi sotto NDA; margine variabile col consumo | ❌ (NDA) |

**Sequenza pragmatica:** aprire account business Maya (rischio zero) + candidarsi a eSIM Go
Standard in parallelo per confrontare i prezzi reali; mandare il form Airalo Partners per una
quote (brand più forte, ma MSP e onboarding sales-gated). Alternativa low-barrier da tenere
d'occhio: eSIM Access (docs pubbliche, ingresso economico).

Contatti e messaggi: vedi [`OUTREACH-PARTNER.md`](./OUTREACH-PARTNER.md).

### 4. Voli (Duffel — raccomandato; Kiwi Tequila chiuso; Amadeus piano B)

- **Duffel** (https://duffel.com) — l'unica opzione realmente self-serve:
  - API bookable completa (search → offer → order → biglietto); con *Managed Content* è Duffel
    l'agente accreditato → **niente licenza IATA/ARC** per Swapl.
  - Pagamento: **Duffel Payments** (il nome Swapl appare sull'estratto conto, fee ~2,9%) oppure
    **Duffel Balance** (incassiamo noi con Stripe e paghiamo Duffel da un saldo prepagato).
  - **Markup esplicitamente supportato** (docs "Margin and Markups"; tipico 2–6%).
  - Costi: ~$3 + 1% per ordine confermato + ~$2 per ancillary; tier gratuito ~50 ordini/mese.
  - Accesso: signup self-serve https://app.duffel.com/join, sandbox immediata.
  - ⚠️ Da verificare in onboarding: copertura point-of-sale EU (NL/IT) e listino 2026.
- **Kiwi.com Tequila** — ❌ dal 2024 le nuove partnership sono solo su invito: non percorribile.
- **Amadeus Self-Service** — piano B: API GDS bookable ma serve un contratto con un
  consolidatore per l'emissione biglietti + payment stack proprio. Settimane di setup vs giorni.

**Attenzione unit economics:** su voli intra-EU economici, $3 + 1% + fee carta ~2,9% mangiano
quasi tutto il markup → P3, da modellare prima di investirci.

### 5. Transfer aeroportuali

_TODO: ricerca in corso (Welcome Pickups, Jayride, HolidayTaxis/Booking Taxi)._

### 6. Noleggio auto

_TODO: ricerca in corso (Discover Cars, Rentalcars Connect)._

### 7. Deposito bagagli

_TODO: ricerca in corso (Radical Storage, Bounce, Stasher)._

### 8. Key exchange & pulizie (core dell'esperienza swap)

_TODO: ricerca in corso (KeyNest, Keycafe; marketplace pulizie EU). Nota: l'add-on `keynest`
esiste già nel seed `AddOn` come flat-fee._

---

## Architettura tecnica di riferimento (per la sessione di sviluppo)

Indicazioni vincolanti per chi implementa — le issue Linear di dettaglio sono linkate nel
progetto **Swapl Product — Pre-launch engineering**.

### Flusso d'acquisto nativo (modello B/C)

```
utente → GET quote/disponibilità (API partner, cache breve)
       → checkout Swapl: PaymentIntent Stripe (prezzo lordo = netto partner + commissione)
       → pagamento ok (webhook payment_intent.succeeded, riconciliazione idempotente — DOK-119)
       → chiamata booking API partner
            ├─ ok → salva conferma/voucher, email al cliente, stato PAID_CONFIRMED
            └─ KO → retry breve; se fallisce: refund automatico Stripe + stato FAILED_REFUNDED + alert admin
```

Regola d'oro: **mai** confermare al cliente prima della risposta del partner; **mai** tenere
soldi se il booking fallisce (refund automatico, non manuale).

### Modello dati

Estendere lo schema esistente, non duplicarlo:

- Generalizzare `OrderAddOn` → `Order` di marketplace **oppure** nuova tabella
  `ExternalBooking` collegata a `OrderAddOn`:
  `partnerSlug`, `externalBookingId`, `productId`, `productSnapshot` (JSON), `travelDate`,
  `grossAmountCents`, `netAmountCents`, `commissionCents`, `currency`,
  `status` (quote|pending_payment|paid|confirmed|failed|refunded|cancelled),
  `voucherUrl`, `rawPartnerResponse`.
- `AffiliatePartner.commissionModel` accetta già `percent_booking`: aggiungere il valore
  e i metadata API (endpoint, env key) in `metadata`.
- L'assicurazione reale sostituisce `lib/insurance/mock.ts` mantenendo l'interfaccia
  (`InsurancePolicy` ha già `premiumCents`/`platformShareCents`/`externalId`).

### Punti d'integrazione UI esistenti

- `/swaps/[id]` — sezione "Make it seamless" (concierge): qui vanno gli acquisti post-agreement
  (esperienze a destinazione, eSIM, transfer, assicurazione upgrade).
- Dettaglio listing — sezione "Discover {city}" (DOK-124): oggi link affiliati GetYourGuide →
  diventa carosello prodotti bookable con prezzo e CTA d'acquisto nativa.

### Requisiti trasversali

- **Env-gated come gli altri servizi**: ogni partner dietro feature flag + env vars
  (`PARTNER_GYG_API_KEY`, ecc.); senza chiavi si degrada al link affiliato attuale.
- **Idempotenza**: chiavi di idempotenza su Stripe e sulle chiamate booking partner.
- **VAT/fiscalità**: la vendita nativa rende Swapl venditore (Dokuz AI FZCO — coordinarsi con
  il progetto Linear "UAE Tax & Compliance" per trattamento IVA/OSS UE prima del go-live).
- **Tracking**: ogni vendita nativa registra anche la conversione (sostituisce la
  riconciliazione manuale mensile di `AffiliateClick`).
- **Contratto API**: nuovi endpoint spec-ati in `packages/api-spec/openapi.yaml` (DOK-130).

### Cosa NON fare ora

- Niente integrazione di più partner per la stessa categoria in parallelo: uno per categoria.
- Niente inventory caching aggressivo: prezzi/disponibilità sempre rivalidati al checkout.
- Niente voli al lancio (P3): margini sottili, complessità rimborsi/cambi alta.
