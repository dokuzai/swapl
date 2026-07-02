# Release Candidate — 2026-07-02

**Branch:** `release/candidate-2026-07-02` (branched from `main` via `fix/test-harness`).
**Status:** PM-reviewed twice → **SHIP** (main-ready). NOT yet merged to `main`.
**Gate:** `pnpm run typecheck` clean · `pnpm run test` **942/942 green**.

This RC bundles Wave 1 of [AUDIT-2026-07-02.md](AUDIT-2026-07-02.md) — the Keys-economy security cluster plus the enabling test-harness repair and one web-design token fix. Priorities and the full backlog are in [BACKLOG-2026-07-02.md](BACKLOG-2026-07-02.md).

## What's in it (one branch per feature)

| Branch | Backlog | Summary |
|---|---|---|
| `fix/test-harness` | SWAPL-P0-2 | Repaired 37 stale test doubles (atomic operators, DOK-221 upserts, tx wrap, gift validate). Product code untouched. |
| `fix/keys-stay-toctou` | SWAPL-P0-1 · **critical** | Conditional `updateMany` status gate + eventKeys close the confirm/release double-mint TOCTOU. |
| `fix/keys-gift-welcome-concurrency` | SWAPL-P1-1 | `gift()` Serializable; `grantWelcomeBonus` deterministic eventKey + P2002 no-op. |
| `fix/keys-stay-suspended-guard` | SWAPL-P1-2 | Suspended users blocked from Keys-stay/couch requests. |
| `fix/auth-otp-durable-ratelimit` | SEC-AUTH-01 | OTP-verify + passkey login use the durable (Upstash) limiter. |
| `fix/privacy-participant-email-mask` | SEC-PRIV-02 | Pending co-traveler email masked for non-principals. |
| `chore/json-parse-robustness` | SEC-INPUT-01 | photos/destinations reads routed through `parseJSON()`. |
| `feat/keys-stay-completion-cron` | SWAPL-P1-4 | Confirmed Keys stays flip to `completed` (exactly-once host push) so hosting history fills. |
| `fix/web-error-color-token` | DS-WEB-04 | 57 hardcoded `#dc2626` → `var(--destructive)` (dark-mode-correct). |

## Verification performed
- Per-branch typecheck + targeted tests during development.
- Full suite (942) + typecheck on the assembled RC.
- Real-user smoke test: guest browse, login, authenticated dashboard, all Keys APIs 200, zero console errors; login error color confirmed rendering from the `--destructive` token.
- Two independent PM reviews → SHIP.

## Deferred (non-blocking, tracked in the backlog)
- Test hardening: gift P2034→422 mapping; behavioral assertion that the durable limiter is invoked.
- Larger epics: Keys-stay lifecycle parity (home guide + disputes + reviews for Keys stays), iOS Dynamic Type, Dark Mode, iOS theme adoption, web token-pipeline consumption, at-rest secret encryption, session revocation.

## To merge to main
Open a PR from `release/candidate-2026-07-02` → `main`. The nine feature branches are also on `origin` if per-feature PRs are preferred.
