// Client-safe valuation thresholds (DOK-163).
//
// Pure numeric constants with NO server imports (no @/lib/db, no @/lib/ai), so
// client components — e.g. the owner-facing "how your nightly Keys are
// calculated" explainer — can read them without dragging the Prisma/pg/AI layer
// into the browser bundle. The server-side valuation modules re-export these so
// there is a single source of truth.

/** Hard ± band the review-feedback multiplier is clamped to (±20%). */
export const FEEDBACK_BAND = 0.2;

/** Minimum number of reviews before feedback is applied at all. */
export const FEEDBACK_MIN_REVIEWS = 3;

/** Max move toward the feedback target per cron cycle (keeps it gradual). */
export const FEEDBACK_STEP_PER_CYCLE = 0.05;

/** Hard ± clamp on the AI feature bonus (Keys), so AI nudges but never swings. */
export const AI_FEATURE_BONUS_MAX = 3;
