// Growth engine tunables (DOK-157). The single place where referral economics
// live so endpoints, tests, and any future admin UI agree on the numbers.
//
// BINDING PRINCIPLES (DOK-157):
//   - Referrals earn KEYS, never money.
//   - Referrals OPEN THE GATE: more qualified referrals = faster waitlist
//     access and a higher leaderboard spot (acceleration, not a paywall).
//   - ANTI-FARM: a referral reward only credits once the invitee VERIFIES their
//     identity (the qualifying action), idempotently, under daily/monthly caps.

// Keys credited to BOTH sides when a referral qualifies (invitee verifies).
// Two-sided: the owner (referrer) and the referee (the newly-verified invitee)
// each receive this amount, exactly once per Referral.
export const REFERRAL_REWARD_KEYS = 20; // referrer side (kind: referral_bonus)
export const REFERRAL_REFEREE_KEYS = 10; // invitee side (kind: invite_bonus)

// Anti-farm caps on the REFERRER. A user can only collect referral rewards for
// this many qualified referrals per rolling window — beyond it the referral is
// still marked qualified (waitlist/leaderboard still move) but no further Keys
// are credited, so farming verified throwaways can't mint unlimited Keys.
export const REFERRAL_DAILY_CAP = 5; // qualified referrals rewarded per 24h
export const REFERRAL_MONTHLY_CAP = 30; // qualified referrals rewarded per 30d

// Waitlist tiers: cumulative thresholds of QUALIFIED referrals unlock a tier
// with bonus Keys (granted once when first reached) and a shareable perk/badge.
// Ordered ascending; the highest threshold met is the user's current tier.
export type GrowthTier = {
  threshold: number; // qualified referrals required
  key: string; // stable id for the badge/perk
  label: string;
  bonusKeys: number; // one-time bonus when the tier is first reached
  perk: string; // human-readable perk copy
};

export const GROWTH_TIERS: readonly GrowthTier[] = [
  { threshold: 1, key: "connector", label: "Connector", bonusKeys: 5, perk: "Early-access lane" },
  { threshold: 3, key: "insider", label: "Insider", bonusKeys: 15, perk: "Skip-the-line access" },
  { threshold: 5, key: "founder", label: "Founder", bonusKeys: 40, perk: "Founder badge + priority placement" },
];

// Referral source vocabulary (closed set). `link` = a generic ?ref=CODE share;
// `invite_to_stay` = a host-issued invitation tied to one of their listings.
export const REFERRAL_SOURCES = ["link", "invite_to_stay"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

// Referral lifecycle. pending -> qualified (invitee verified) -> rewarded
// (Keys credited; may be skipped to "qualified" if a cap was hit).
export const REFERRAL_STATUSES = ["pending", "qualified", "rewarded"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

// Cosmetic floor so the waitlist feels alive (FOMO) even early on. The user's
// displayed position is `WAITLIST_BASE - qualifiedReferrals * WAITLIST_STEP`,
// clamped to >= 1: more people you bring, the higher you climb.
export const WAITLIST_BASE = 5000;
export const WAITLIST_STEP = 50;

/** The highest tier whose threshold is met by `qualifiedCount`, or null. */
export function currentTier(qualifiedCount: number): GrowthTier | null {
  let tier: GrowthTier | null = null;
  for (const t of GROWTH_TIERS) {
    if (qualifiedCount >= t.threshold) tier = t;
  }
  return tier;
}

/** The next tier to aim for, or null when the top tier is reached. */
export function nextTier(qualifiedCount: number): GrowthTier | null {
  for (const t of GROWTH_TIERS) {
    if (qualifiedCount < t.threshold) return t;
  }
  return null;
}

/** Cosmetic waitlist position: climbs as qualified referrals grow. */
export function waitlistPosition(qualifiedCount: number): number {
  return Math.max(1, WAITLIST_BASE - qualifiedCount * WAITLIST_STEP);
}
