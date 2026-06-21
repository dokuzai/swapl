# Didit identity verification (KYC) integration guide

Swapl already ships with a Didit integration. The code is in `app/lib/verification/didit.ts` and the public API surface is:

- `POST /api/verification/session` — start/resume a hosted KYC flow
- `GET /api/verification/status` — current identity verification state
- `POST /api/webhooks/didit` — Didit server-to-server status updates

This guide explains how to **configure** the integration so it talks to your Didit account.

---

## 1. What you need from Didit

1. Go to [business.didit.me](https://business.didit.me) and sign up.
2. Create an **Organization**.
3. Open **Workflows → Create New**.
   - Choose the **KYC** template (or Adaptive Age Verification / Biometric Authentication if that matches your use case).
   - Enable the blocks you want, e.g. ID scan, passive liveness, face match.
   - Copy the **Workflow ID**.
4. Open **API & Webhooks**.
   - Copy the **API Key**.
   - Copy the **Webhook Secret**.
   - Set the **Webhook URL** to:
     - Production: `https://app.swapl.fun/api/webhooks/didit`
     - Marketing/staging domain: use the product app domain that serves `/api/*`
     - Local development: use an `ngrok`/`cloudflared` tunnel, e.g. `https://<your-tunnel>.ngrok.io/api/webhooks/didit`

> Keep the API key and webhook secret server-side only. They are never sent to the browser or mobile clients.

---

## 2. Configure environment variables

### Local development

Edit `app/.env.local` (create it from `app/.env.example` if you haven't yet):

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Didit KYC
DIDIT_API_KEY="your-didit-api-key"
DIDIT_WORKFLOW_ID="your-didit-workflow-id"
DIDIT_WEBHOOK_SECRET="your-didit-webhook-secret"
```

### Production (Vercel)

Add the same three variables in the `swapl` project (the one whose Root Directory is `app`):

| Variable | Value |
|---|---|
| `DIDIT_API_KEY` | your Didit API key |
| `DIDIT_WORKFLOW_ID` | your Didit workflow ID |
| `DIDIT_WEBHOOK_SECRET` | your Didit webhook secret |

Make sure `NEXT_PUBLIC_APP_URL` is set to `https://app.swapl.fun` so the post-verification callback URL is correct.

---

## 3. Database

The `IdentityVerification` model already exists in both Prisma schemas:

- `app/prisma/schema.prisma` (SQLite, dev)
- `app/prisma/schema.postgres.prisma` (PostgreSQL, prod)

If you are setting up a fresh dev database, run:

```bash
pnpm --filter app db:migrate
```

If the model is missing for any reason, the migration file is at `app/prisma/migrations/20260611223146_identity_verification/migration.sql`.

---

## 4. How the flow works

1. The user clicks **Verify identity** on `/dashboard` (or in the iOS/Android app).
2. The UI calls `POST /api/verification/session`.
   - If `DIDIT_API_KEY` or `DIDIT_WORKFLOW_ID` is missing, the endpoint returns `503 VERIFICATION_NOT_CONFIGURED` and the card stays hidden.
   - The backend calls Didit's `POST /v3/session/` with `vendor_data=<our-user-id>` and `callback=<NEXT_PUBLIC_APP_URL>/dashboard?verification=done`.
   - It persists a row in `IdentityVerification` and returns the hosted Didit URL.
3. The user is redirected to the hosted Didit flow and completes it.
4. Didit sends the result to `POST /api/webhooks/didit`.
   - The route verifies the `X-Signature` HMAC and `X-Timestamp`.
   - On `Approved`, it sets `User.verified = true`, stamps `verifiedAt`, grants the welcome Keys bonus, and qualifies referrals.
   - On `Declined`/`Expired`/`Abandoned`, it records the terminal state.
5. The user lands back on `/dashboard?verification=done`; the dashboard polls `GET /api/verification/status` and updates the badge.

If `DIDIT_WEBHOOK_SECRET` is unset, the webhook route returns `503` and the status endpoint falls back to polling Didit's `GET /v3/session/{id}/decision/` directly. This is fine for local development, but **webhooks are recommended in production**.

---

## 5. Mobile clients

iOS and Android already consume the same endpoints:

- iOS: `ios/Swapl/Core/Repositories/VerificationRepository.swift` + `IdentityVerificationCard.swift`
- Android: `android/swapl/app/src/main/java/app/swapl/core/repository/VerificationRepository.kt` + `IdentityVerificationCard.kt`

No native SDK is required; the apps open the hosted `url` in `ASWebAuthenticationSession` / Chrome Custom Tab and re-poll `GET /api/verification/status` on return.

---

## 6. Testing

### Unit tests

```bash
cd app
./node_modules/.bin/vitest run test/didit.test.ts test/verification-session-route.test.ts test/verification-webhook.test.ts
```

All three test files cover env gating, session creation, status mapping, HMAC verification, idempotent state transitions, and route behavior.

### End-to-end with Didit

1. Start the dev server:
   ```bash
   pnpm run dev:web
   ```
2. Sign in with a seed account.
3. Open the dashboard and click **Verify identity**.
4. Complete the Didit flow (you can use Didit's sandbox/test IDs).
5. Check the database:
   ```sql
   SELECT verified, verifiedAt FROM User WHERE email = 'your@email.com';
   SELECT status, completedAt FROM IdentityVerification WHERE userId = '<id>';
   ```

### Testing webhooks locally

Because Didit needs a public HTTPS URL, use a tunnel:

```bash
ngrok http 3000
```

Then in the Didit console set the webhook URL to `https://<ngrok-id>.ngrok.io/api/webhooks/didit` and trigger a test event from **API & Webhooks → Test webhook**.

---

## 7. Security checklist

- Never commit `DIDIT_API_KEY` or `DIDIT_WEBHOOK_SECRET`.
- The webhook handler rejects requests older than 5 minutes (`X-Timestamp` replay protection) and validates the HMAC with a constant-time comparison.
- State transitions are idempotent: terminal states never regress, so Didit retries are safe.
- The API key is only used in server-side fetch calls; mobile and web clients receive only the hosted session URL.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Identity verification is not available yet" | `DIDIT_API_KEY` or `DIDIT_WORKFLOW_ID` missing | Set both env vars and restart the dev server |
| Webhook returns `503 DIDIT_WEBHOOK_SECRET not set` | `DIDIT_WEBHOOK_SECRET` unset | Set it, or rely on polling fallback (dev only) |
| Dashboard badge stays pending after approval | Webhook not delivered | Check webhook URL in Didit console; verify tunnel/firewall |
| `Invalid signature` on webhook | Wrong secret or body re-serialized | Ensure `req.text()` is used before JSON parsing |
| Mobile card does nothing | `NEXT_PUBLIC_APP_URL` missing or wrong | Set it to the app origin |

---

## 9. Files involved

- `app/lib/verification/didit.ts` — Didit adapter, HMAC, state machine
- `app/app/api/verification/session/route.ts` — start/resume session
- `app/app/api/verification/status/route.ts` — status endpoint (with polling fallback)
- `app/app/api/webhooks/didit/route.ts` — Didit webhook receiver
- `app/components/account/identity-verification-card.tsx` — web dashboard card
- `app/app/dashboard/page.tsx` — dashboard that triggers/renders the card
- `packages/api-spec/openapi.yaml` — public API spec for `/api/verification/*`
