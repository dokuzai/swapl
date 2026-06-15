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
