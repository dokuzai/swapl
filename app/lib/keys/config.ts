// Keys economy tunables (DOK-155). Single place for the caps/guards so the
// endpoints, tests, and any future admin UI agree on the numbers.

// Welcome bonus granted once to a verified user (idempotent — lib/keys/ledger).
export const WELCOME_BONUS_KEYS = 30;

// Gift guardrails. Gifts are the ONLY peer transfer; keeping them small and
// rate-limited preserves the "travel points, not money" character (no resale
// market, no MiCA exposure).
export const GIFT_MIN = 1;
export const GIFT_MAX_PER_TRANSFER = 50;
export const GIFT_DAILY_CAP = 100; // total Keys a user may gift per rolling 24h
export const GIFT_MONTHLY_CAP = 500; // total Keys a user may gift per rolling 30d
// Rate limit: at most N gift calls per window (anti-spam, separate from caps).
export const GIFT_RATE_LIMIT = 5;
export const GIFT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Stay booking: hold rate limit so a guest can't spam pending stays.
export const STAY_RATE_LIMIT = 10;
export const STAY_RATE_WINDOW_MS = 60 * 60 * 1000;

// ---------- EARNING HOOKS (DOK-164) ----------
// Modest, founder-set bonuses that MINT Keys when a user takes an action that
// ADDS supply/trust to the marketplace (not pure consumption). Every bonus is:
//   - GATED on identity verification (User.verified) — anti-farm, same gate as
//     referrals (DOK-157). An unverified user earns none of these.
//   - IDEMPOTENT — one ledger row per real-world event (deterministic eventKey).
//   - CAPPED — a rolling-30d ceiling per kind so even a verified power-user
//     can't mint unbounded Keys by repeating an action across many listings.
//
// Identity (+30) is the welcome bonus (WELCOME_BONUS_KEYS) and already exists.
// Referral conversion (20/10) already exists (DOK-157) and is NOT duplicated here.

// Verified property ownership (PropertyVerification approved). One-time per
// (user, listing). Adds the strongest trust signal → the highest single bonus.
export const EARN_PROPERTY_VERIFIED_KEYS = 15;

// A review left after a COMPLETED stay/swap. One-time per review. Small — it
// feeds reputation (DOK-163) and keeps the trust flywheel turning.
export const EARN_REVIEW_KEYS = 5;

// A listing the user shared that was actually booked/swapped by the invitee.
// One-time per (listing, sharer). High — a converted share brings real demand.
export const EARN_SHARE_CONVERTED_KEYS = 15;

// A listing that is published (active) AND owner-verified AND has a complete
// home guide. One-time per listing. Small — it polishes existing supply.
export const EARN_LISTING_COMPLETE_KEYS = 5;

// Rolling-30d caps: the maximum NUMBER of each bonus a user may collect per
// window. Beyond the cap the action still succeeds (review posted, listing
// completed) but no further Keys are minted — anti-farm without blocking the UX.
export const EARN_PROPERTY_VERIFIED_CAP = 10;
export const EARN_REVIEW_CAP = 20;
export const EARN_SHARE_CONVERTED_CAP = 20;
export const EARN_LISTING_COMPLETE_CAP = 10;
