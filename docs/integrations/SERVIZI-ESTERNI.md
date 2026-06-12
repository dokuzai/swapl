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
| Esperienze & tour | **Viator Merchant API** (subito) + GetYourGuide Distribution API (a volumi) | B (Viator: Swapl = MoR, markup o commissione) | commissione/markup da contratto; GYG affiliate ~8% min | ✅ Viator: no setup fee, solo deposito · ❌ GYG: soglie traffico alte | **P1** |
| Assicurazione viaggio | battleface (Partner API) | B (embedded, premio incassato da Swapl) | revenue share negoziata | ✅ buono (corteggiano partner piccoli) | **P1** |
| Copertura danni swap | Truvi (ex SUPERHOG) — waiver, non assicurazione | B (waiver embedded) | waiver ~7% del protetto; Truvi trattiene ~20% | ✅ buono (già usato da Swaphouse/ThirdHome) | **P1** (sostituisce il mock `lib/insurance/mock.ts`) |
| eSIM | Maya (pilota) + eSIM Go / Airalo (quote) | C | wholesale non pubblico, da quotare | ✅ facile (Maya $0 ingresso) | **P2** |
| Voli | Duffel | B/C (markup esplicito) | markup libero; fee ~$3 + 1%/ordine | ✅ self-serve | **P3** (margini sottili su tratte EU) |
| Transfer aeroportuali | Transferz (o Welcome Pickups) | B/C (net rate + markup) | markup libero (net rates) | ✅ buono (portal "in minutes"; API da negoziare) | P3 |
| Noleggio auto | Discover Cars (B4B) | A→B | 70% del profitto DC (affiliate); API book+pay nuova | media (widget/white-label → API) | P3 |
| Deposito bagagli | Stasher (B2B) — fallback affiliate 10% | A→B (deal negoziato) | affiliate 10%; deal maggiori ~50/50 rev share | media (affiliate subito, B2B da negoziare) | P3 |
| Key exchange | KeyNest (API v3) | B (host paga; billing piattaforma da negoziare) | €7,14/ritiro PAYG EU; margine da negoziare | ✅ buono (API usata dai PMS) | P2 (core per lo swap) |
| Pulizie | Turno (orchestrazione) o contratti locali | parziale (Turno incassa il cleaner) | n/d | media (API gated) | P3 |

Priorità guidate dal funnel Swapl: lo swap è gratuito, la monetizzazione avviene **dopo
l'accettazione dell'agreement** (pagina `/swaps/[id]`, sezione "Make it seamless") e nella
sezione **Discover** del dettaglio listing (DOK-124).

---

## Categorie e provider

### 1. Esperienze & tour (Viator subito; GetYourGuide a volumi; Tiqets in mezzo)

Il desiderio del founder ("comprare un tour GetYourGuide direttamente su Swapl") si scontra
con le soglie di accesso di GetYourGuide; la stessa cosa si ottiene **subito** con Viator
(catalogo Tripadvisor, in larga parte sovrapposto).

- **Viator (Tripadvisor) Merchant API — prima scelta per la vendita nativa:**
  - Il partner è **merchant of record**: il cliente prenota senza lasciare Swapl, il
    pagamento è nostro, supporto post-booking nostro.
  - Due modelli a scelta: **commission** (vendi al retail consigliato, prendi una %) o
    **markup** (Viator fattura il netto + booking fee, il ricarico lo decidi tu).
  - **Nessuna setup fee**; serve un deposito proporzionato alle vendite previste +
    certificazione tecnica dell'integrazione.
  - Candidatura: https://partnerresources.viator.com/travel-commerce/merchant/ · docs:
    https://docs.viator.com/partner-api/merchant/technical/
- **GetYourGuide — restare affiliate ora, Distribution API più avanti:**
  - Livelli API con soglie: Basic API ≥100k visite/mese; **Booking API ≥1M visite + 300
    booking/mese**; **Distribution API** (partner = merchant of record) solo via partner
    manager. Pre-launch non raggiungibili.
  - Percorso: tenere l'affiliate attuale (commissione min ~8%, già live in
    `links.ts`), costruire volume con Viator, ricandidarsi a GYG con i numeri.
  - Docs: https://code.getyourguide.com/partner-api-spec/ · programma:
    https://partner.getyourguide.com/
- **Tiqets — opzione ponte per musei/attrazioni:**
  - Distributor API gratuita (content+availability subito); **Booking API concessa a
    ~200 ordini/mese** dopo review delle performance. Modello: quota del gross margin.
  - Contatto diretto: **distributors@tiqets.com** · signup:
    https://www.tiqets.com/en/partner-program/sign-up-form/ · docs:
    https://portals.tiqets.com/distributorapi/docs
- Klook (focus APAC) e Musement (TUI): non prioritari per i corridoi attuali — rivalutare
  a volumi.

### 2. Assicurazione viaggio + copertura danni swap

Contesto interno: oggi l'assicurazione è un mock (`app/lib/insurance/mock.ts`, provider
`swapl-cover`, premio €1.4/m²/notte cap €120, quota piattaforma 20%, copertura €1.500).
Il bisogno è doppio: **(a)** travel insurance venduta al checkout, **(b)** copertura
danni/responsabilità sulla casa per ogni swap accettato.

**(a) Travel insurance → battleface (prima scelta)**
- Partner API embedded/white-label: quote → order → payment via API — **il cliente paga nel
  checkout di Swapl**. Docs: https://developers.battleface.com/
- Struttura EU regolata: battleface Underwriting/Insurance Services SRL (Belgio, FSMA,
  passporting EEA) — è battleface il distributore regolamentato, Swapl resta esente.
- Revenue share negoziata (non pubblica). Corteggiano attivamente partner piccoli.
- Alternative: **Qover** (Bruxelles, orchestratore regolato, anche linee property — partner
  medio/grandi), **Companjon** (Dublino, enterprise-leaning), **Cover Genius/XCover**
  (enterprise: Booking, Ryanair — long shot pre-launch, vale solo un form).

**(b) Copertura swap → Truvi (ex SUPERHOG) — il fit migliore trovato**
- È l'unico player che **già copre piattaforme di home-exchange**: Swaphouse ("Home Swap
  Damage Protection with Truvi") e ThirdHome. Screening ospiti + damage waiver fino a $5M,
  white-label via API.
- Punto chiave: è strutturato come **waiver/garanzia, non assicurazione** → evita del tutto
  la questione IDD per Swapl (stesso pattern di HomeExchange e Kindred, che usano garanzie
  di piattaforma, non polizze).
- Economics pubblici (da verificare): waiver base ~7% dell'importo protetto, Truvi trattiene
  ~20% di commissione.
- Lungo termine: prodotto assicurativo su misura su carta **Wakam** (carrier white-label B2B2C)
  via broker/MGA specializzato, quando i volumi lo giustificano.

**Nota regolatoria (IDD, UE)** — rilevante per il design del checkout:
- Vendere assicurazioni nel checkout con remunerazione = "distribuzione assicurativa" (IDD);
  l'esenzione **art. 1(3)** per intermediari accessori copre polizze ancillari al viaggio
  prenotato con premio ≤ €200/persona per servizi ≤ 3 mesi → la travel insurance per-trip
  rientra plausibilmente, **se** il distributore regolato dietro (battleface/Qover) adempie
  agli obblighi art. 1(4) (IPID, demands-and-needs).
- Una polizza standalone danni-casa rientra male nell'esenzione → ulteriore motivo per la via
  waiver (Truvi) pre-launch. Confermare con un legale nei mercati di lancio (NL/TR/PT/MX).

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
quote (brand più forte, ma MSP e onboarding sales-gated).

**Ingressi a barriera ancora più bassa** (reseller veri, MoR = Swapl, docs pubbliche):
- **eSIM Access** — self-serve, nessun MOQ né deposito minimo pubblicato; docs:
  https://docs.esimaccess.com/ · contatto deal: alliance@esimaccess.com
- **MobiMatter** — marketplace multi-vendor, wallet minimo **$250**; docs:
  https://docs.mobimatter.com/
- **zendit** (IDT) — white-label API completamente self-serve, wallet prepagato:
  https://zendit.io/esims/

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

### 5. Transfer aeroportuali (Transferz, Welcome Pickups; HolidayTaxis terza scelta)

- **Transferz** (https://www.transferz.com, Amsterdam) — miglior fit strutturale per il nostro
  modello: piattaforma B2B-only, API unica + white-label + portale no-code, 151 paesi.
  **Net rates espliciti: "partners set retail prices and keep the margin"** (modelli misti:
  net rate, commissione, transaction fee). Docs pubbliche: https://developers.transferz.com/.
  Tier portal a bassa barriera; tier API soggetto a review commerciale.
- **Welcome Pickups** (https://partner.welcomepickups.com) — esplicitamente aperto ai partner
  piccoli: widget, white-label gratuito, Travel API. "You set your own commission", nessuna
  fee/esclusiva/volume minimo dichiarati. Docs API fornite dopo candidatura. Da chiarire in
  call se sul tier API il merchant of record può essere Swapl.
- **HolidayTaxis** (HBX Group, *non* Booking) — modello trade/agent a commissione o net rate,
  docs pubbliche: https://developer.holidaytaxis.com. Terza opzione credibile.
- **Mozio** — aggregatore con API/SDK/white-label, rev share ~5–10%; affiliate come entry
  point e API enterprise negoziata. Contatto: partners@mozio.com · docs:
  https://mozio.docs.apiary.io/
- **Amadeus Self-Service Transfers API** — unica **API bookable self-serve** della categoria
  (Transfer Search/Booking/Management, quota test gratuita, pay-as-you-go):
  https://developers.amadeus.com/self-service/category/cars-and-transfers — utile come
  baseline tecnica senza negoziazione commerciale.
- ❌ **Jayride** — da evitare: sospesa dall'ASX, fornitori non pagati da mesi/anni → rischio
  di servizio inaccettabile per i nostri utenti.
- ❌ **Booking.com Taxi (Demand API)** — solo Managed Affiliate Partner ad alto volume; nel
  2025 Booking ha chiuso migliaia di piccoli affiliati. Non realistico pre-launch.

### 6. Noleggio auto (Discover Cars B4B; enterprise-only il resto)

- **Discover Cars** — unica via realistica per un partner piccolo:
  - Affiliate (fallback, già modello A): **70% del profitto DC** sul noleggio + 30% sul Full
    Coverage, cookie 365gg. https://www.discovercars.com/affiliate
  - **Programma B4B** (widget, white-label, API): da fine 2025 in rollout una API che porta
    **booking e pagamento nell'ambiente del partner** — da confermare se il partner può essere
    merchant of record. Landing: https://pages.discovercars.com/b4b · docs (su richiesta):
    https://api-partner.discovercars.com/help
  - Percorso suggerito: partire widget/white-label → graduare all'API book+pay.
- ❌ **Rentalcars Connect / Booking Cars, CarTrawler, Expedia Rapid** — enterprise-only
  (compagnie aeree, grandi OTA): non accessibili pre-launch.

### 7. Deposito bagagli (Stasher; Bounce/Radical solo affiliate)

Mercato in consolidamento (Bounce ha acquisito Nannybag a fine 2025). Nessuno pubblica una
API bookable self-serve: il modello "pagamento su Swapl" va negoziato.

- **Stasher** — fit migliore: ha già dato integrazioni in-checkout/white-label a
  Hotels.com, Expedia, Booking, Marriott (rev share ~50/50 sui deal maggiori, da fonti
  secondarie). Percorso: partire dall'affiliate self-serve (10%/booking,
  https://partners.stasher.com/) e negoziare il tier B2B → partnerships@stasher.com
- **Bounce** — solo affiliate (10%), nessuna API pubblica. **Radical Storage** — affiliate
  8% diretto / 15% via Travelpayouts; "API" di livello affiliate, non bookable.

### 8. Key exchange & pulizie (core dell'esperienza swap)

Nota: l'add-on `keynest` esiste già nel seed `AddOn` come flat-fee — questa è la categoria
più vicina al prodotto (consegna chiavi tra swapper).

**Key exchange → KeyNest (prima scelta)**
- Rete più grande d'Europa (5.000+ punti, shop/café); partner ufficiale Airbnb e Booking.
- **API v3 reale** già usata in produzione dai PMS (Guesty, Hostaway, Lodgify…): codice di
  ritiro a 6 cifre generato per prenotazione. Docs (Postman, datate — accesso concesso dal
  team): https://documenter.getpostman.com/view/5456795/TVmMhdvb
- Prezzi EU verificati: **€7,14 per ritiro** PAYG (o €29,94/chiave/mese illimitato). Il
  modello tipico è "l'host paga KeyNest": il billing di piattaforma (Swapl incassa nel
  checkout e gira a KeyNest, con markup) va negoziato — il precedente PMS rende plausibile
  la conversazione.
- Alternativa: **Keycafe** — API pubblica migliore (docs.keycafe.com) e white-label, ma
  modello hardware (SmartBox ~$2.399 + $99/mese/location): economics sbagliate per noi.

**Pulizie — nessuna API bookable in EU (constatazione, non TODO)**
- Nessun marketplace di pulizie EU offre un'API B2B dove un terzo incassa il pagamento.
- Opzione (a): partnership **Turno** (apidocs.turnoverbnb.com, accesso su richiesta) — Swapl
  orchestra le date dello swap come "projects", ma il pagamento del cleaner resta su Turno.
- Opzione (b) consigliata per il lancio: **contratti diretti con imprese di pulizie locali**
  nelle città dei corridoi prioritari, dietro il checkout Swapl (è già il modello flat-fee
  dell'add-on `cleaning` esistente).

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
