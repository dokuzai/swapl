# Swapl — Stato dell'arte delle tre applicazioni (11 giugno 2026)

Analisi approfondita di web app, iOS, Android e contratto API condiviso, condotta da 5 agenti
(4 di analisi + 1 critico di completezza incrociata) sull'intero monorepo.
Riferimento architettura: [ARCHITECTURE.md](ARCHITECTURE.md). Progetto Linear:
**Swapl Product — Pre-launch engineering** (target: lancio settembre 2026).

## Sintesi esecutiva

Il prodotto è funzionalmente maturo sul core: flusso swap completo (proposta → negoziazione →
agreement → assicurazione auto-emessa → key codes), listing CRUD con foto, wishlist, messaggi
nel thread, AI draft delle proposte su tutte e tre le piattaforme, admin dashboard, cron lifecycle.
I blocchi reali per il lancio sono: **credenziali di produzione assenti** (DOK-116, non codeable),
**riconciliazione Stripe one-time stubbata** (DOK-119), **store-readiness mobile**
(icone/privacy manifest iOS, versioning/policy Android) e **parità Android incompleta**
(Wishlists e Trips sono placeholder).

## Web app + backend (`app/`)

**Stato:** Next.js 16 / React 19 su Vercel, Prisma + Postgres, auth dual-path (cookie HMAC per web,
bearer token per mobile), Stripe (subscription Free/Plus/Pro funzionanti, webhook idempotenti),
Resend, FCM, Turnstile, rate limiting (in-memory + Upstash), admin panel completo in lettura
(signups con export/invite, verifications, users, reports, listings, featured, insurance).
Cron: featured expiry, saved-searches digest (funzionante), agreements-complete, pre-trip reminders.
Tutto degrada con grazia quando mancano le credenziali. 16 file di test.

**Gap principali:**
- `payment_intent.succeeded` nel webhook ([route.ts:195-204](../app/app/api/billing/webhook/route.ts))
  logga soltanto: verifica listing €39, featured placement e add-on concierge non vengono mai
  riconciliati. Anche `refund.created` è ignorato. → **DOK-119**
- Admin moderazione assente: users/listings read-only, nessun endpoint suspend/deactivate,
  i report restano in coda senza esito. → **DOK-121**
- Sicurezza/robustezza: nessun security header (CSP/HSTS) in `next.config.ts`,
  `JSON.parse(FCM_SERVICE_ACCOUNT_JSON)` senza try/catch, fallback `RESEND_FROM`
  con dominio invalido (`hello@swapl.test`), error responses non uniformi tra le route.
- Nessuna observability (Sentry/alerting): i fallimenti dei cron finiscono solo in console.
- Test integration mancanti su billing (ciclo webhook completo, transizioni subscription).

**Falsi allarmi verificati dal critico:** il digest saved-searches È implementato (filtra, cerca
nuovi listing, manda email top-5, aggiorna `lastNotifiedAt`); la validazione autore sui messaggi
di swap È presente e testata (`partyOf()` + `authorId: session.userId`).

## iOS (`ios/`)

**Stato:** SwiftUI moderno (Observable, async/await), copertura quasi completa dei flussi:
auth, browse con filtri e type-ahead città, dettaglio con galleria zoomabile, wishlist,
inbox proposte con AI draft (Apple Intelligence on-device + fallback backend), profilo,
creazione/edit listing, push APNs, App Shortcuts Siri, design tokens, dark mode,
UI test con screenshot, buona accessibilità.

**Gap principali:**
- **App Store readiness:** manca `PrivacyInfo.xcprivacy`, manca l'asset catalog con AppIcon,
  mancano le usage description in `Info.plist` (photo library, Siri, location) — build non
  accettabile dallo store così com'è.
- **Deep linking:** `PushService` estrae il deep link dal payload ma `RootView` non naviga;
  manca `onOpenURL` per `swapl://` e la configurazione AASA per universal links.
- Error handling: `APIError` mostra status/body HTTP grezzi; il retry su 401 non ha timeout.
- Offline: nessuna cache locale.
- OAuth assente. → **DOK-123**

## Android (`android/`)

**Stato:** l'allineamento a iOS del commit `4a63dab` è sostanzialmente reale (~90% di parità):
Compose + Material 3, Ktor + Hilt, auth completa, browse con filtri bottom-sheet, dettaglio,
wizard create/edit a 8 step con geocoding, swap inbox + thread con accept/decline/counter,
AI draft, FCM con deep link parsing, design tokens, dark mode.

**Gap principali:**
- **Wishlists e Trips sono placeholder** (`PlaceholderScreens.kt`): mancano repository,
  endpoints wiring e UI — rottura di parità visibile all'utente (i tab esistono ma sono vuoti).
- Notifiche: il token FCM si registra ma `onMessageReceived` non gestisce payload/navigazione,
  e la registrazione non ha retry.
- **Play Store readiness:** `versionCode=1` hardcoded, minification disattivata, nessun link
  privacy policy/terms in-app, signing config assente.
- SavedSearches screen stub; error handling generico (toast) senza Snackbar/retry; offline assente.
- OAuth assente. → **DOK-123**

## Contratto API e pacchetti condivisi (`packages/`)

**Stato:** `packages/api-spec/openapi.yaml` (v0.1.0) è la source-of-truth dichiarata, con
generazione TypeScript per il web e Swift package (`swapl-api-client`) per iOS.

**Gap principali:**
- **Spec non sincronizzata:** 19 endpoint documentati contro 50+ implementati. Usati dai nativi
  ma non spec-ati: `/api/saved-searches[/{id}]`, `/api/profile/interests`, `/api/profiles/{id}`,
  `/api/reports`, `/api/proposals/{id}/messages`.
- Il package Swift generato non è integrato nel target Xcode; il client TS generato non è usato
  dalla web app (fetch diretto).
- Nessuna validazione CI spec ↔ implementazione; nessun versionamento API formale.

## Gap trasversali (dal critico)

- **i18n:** il web ha 8 lingue; iOS e Android zero infrastruttura di localizzazione.
- **Observability/analytics:** nessun error tracking né event tracking su nessuna piattaforma.
- **Offline:** assente ovunque.
- Backup/DR del database non documentati; nessun performance budget in CI.

## Rischi principali per il lancio

1. `SESSION_SECRET` vuoto in produzione → cookie di sessione forgiabili (DOK-116, **urgente, ops**).
2. `CRON_SECRET` assente → endpoint `/api/cron/*` invocabili da chiunque (DOK-116).
3. Pagamenti one-time mai riconciliati → revenue tracking rotto e acquisti "in sospeso" (DOK-119).
4. Build mobile non submittabili agli store (icone/privacy manifest iOS, versioning/policy Android).
5. Nessuna moderazione operativa con volume reale di utenti (DOK-121).
6. Drift del contratto API in entrambe le direzioni, senza guardrail CI.

## Piano d'azione

Le issue Linear corrispondenti (esistenti e nuove) sono nel progetto
[Swapl Product — Pre-launch engineering](https://linear.app/dokuzai/project/swapl-product-pre-launch-engineering-d26ebf5cfed2).
Le attività chiudibili via codice vengono eseguite in sequenza da agenti dedicati con verifica
build/test e revisione finale di un agente Product Manager; le attività ops (credenziali,
domini, store account) restano in carico al founder.

## Esiti dell'esecuzione (11 giugno 2026, sera)

10 issue eseguite in sequenza da agenti dedicati, più 1 follow-up richiesto dal PM.
Il PM ha verificato di persona commit, test e build, dichiarandosi soddisfatto dopo un round.
Stato finale della suite: **22 file / 201 test passati**, typecheck pulito, drift check API verde,
`compileDebugKotlin` e `assembleRelease` Android OK, build iOS + UI test build OK.

| Issue | Esito | Commit |
|---|---|---|
| DOK-119 Stripe reconciliation (parte codice) | riconciliazione `payment_intent.succeeded` + `refund.created`, 16 test | `96147c2` |
| DOK-121 Admin moderazione + enforcement | suspend/deactivate/report-resolution + esclusione da browse/profili/thread | `7eb9210`, `413281f` |
| DOK-125 iOS store readiness | AppIcon placeholder, PrivacyInfo.xcprivacy, usage descriptions, entitlements | `c987140` |
| DOK-126 iOS deep linking | DeepLinkRouter, onOpenURL, cold start, universal links predisposti | `1cb6fb8` |
| DOK-127 Android Wishlists | parità iOS completa, toggle ottimistico, tab funzionante | `f028b03` |
| DOK-128 Android Trips | TripsScreen/Detail con key codes e assicurazione | `0bd208a` |
| DOK-129 Android push + Play readiness | notifiche con deep link, retry token, R8, versioning, signing config | `745bf6d` |
| DOK-130 Contratto API | 6 gruppi di endpoint spec-ati, drift check in CI | `f340790` |
| DOK-131 Web hardening | security headers, guardie env, helper errori API | `191b401` |
| DOK-132 Observability | Sentry env-gated, logger strutturato, cron per-job | `2c7479d` |

### Ops rimanenti in carico al founder

1. **Stripe:** prodotti/prezzi live, env `STRIPE_*`, webhook registrato con `refund.created`
2. **Database:** `prisma migrate deploy` sul Postgres di produzione (migration `featured_purchase_refunded` e `admin_moderation`)
3. **Apple:** AASA su app.swapl.fun, team Developer con associated domains e signing, chiave APNs, artwork icona definitivo
4. **Android/Play:** upload keystore + `keystore.properties`, `google-services.json` + plugin google-services, test push reale su device
5. **Vercel env:** `SESSION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`/`RESEND_FROM` verificato, `TURNSTILE_SECRET_KEY`, `SENTRY_DSN` (DOK-116)

Issue rimaste aperte deliberatamente: DOK-116 (solo ops), DOK-119 (solo ops),
DOK-123 OAuth (Low, decisione di prodotto), DOK-133 i18n mobile (Low).
