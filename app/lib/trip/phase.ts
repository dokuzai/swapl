// Trip phase derivation (DOK-152). The agreement's persisted `status`
// (ACTIVE | COMPLETED | INTERRUPTED) is the coarse lifecycle; the *phase* is a
// finer, fully-derived view layered on top of the dates + check-in events. It
// is never stored — always computed from (agreement, checkEvents, now) so the
// web/native cockpits and the GET payloads agree without a migration.

export type TripPhase =
  | "AGREED"
  | "PREPARING"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "INTERRUPTED";

// The reveal gate / "ready" window: home guide + exact address unlock this far
// before the stay starts.
export const REVEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

// Just-accepted grace window — within this the swap is still "AGREED" rather
// than "PREPARING". Purely cosmetic; both are pre-ready states.
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

type PhaseAgreement = {
  status: string;
  dateFrom: Date;
  createdAt?: Date;
};

type PhaseCheckEvent = {
  type: string; // "checkin" | "checkout"
  userId: string;
};

/**
 * Derive the trip phase.
 *
 * Rules (in order):
 *  - INTERRUPTED  → status INTERRUPTED
 *  - COMPLETED    → status COMPLETED
 *  - IN_PROGRESS  → now >= dateFrom AND a party has checked in
 *  - READY        → now >= dateFrom - 48h (reveal gate open)
 *  - AGREED       → accepted < 24h ago (fresh)
 *  - PREPARING    → otherwise
 */
export function getTripPhase(
  agreement: PhaseAgreement,
  checkEvents: PhaseCheckEvent[] | null | undefined,
  now: Date = new Date(),
): TripPhase {
  if (agreement.status === "INTERRUPTED") return "INTERRUPTED";
  if (agreement.status === "COMPLETED") return "COMPLETED";

  const start = agreement.dateFrom.getTime();
  const t = now.getTime();

  const hasCheckIn = (checkEvents ?? []).some((e) => e.type === "checkin");
  if (t >= start && hasCheckIn) return "IN_PROGRESS";

  if (t >= start - REVEAL_WINDOW_MS) return "READY";

  if (agreement.createdAt && t - agreement.createdAt.getTime() < FRESH_WINDOW_MS) {
    return "AGREED";
  }
  return "PREPARING";
}

/**
 * Whether the reveal gate (exact address + the other party's home guide) is
 * open. Opens at dateFrom - 48h, or early once *both* guides are complete so a
 * keen pair can prep ahead of time.
 */
export function guideUnlocked(
  agreement: { dateFrom: Date; status: string },
  now: Date,
  bothGuidesComplete: boolean,
): boolean {
  // A cancelled swap never reveals.
  if (agreement.status === "INTERRUPTED") return false;
  if (bothGuidesComplete) return true;
  return now.getTime() >= agreement.dateFrom.getTime() - REVEAL_WINDOW_MS;
}

/** Instant at which the reveal gate opens (for "unlocksAt" hints to clients). */
export function revealUnlocksAt(agreement: { dateFrom: Date }): Date {
  return new Date(agreement.dateFrom.getTime() - REVEAL_WINDOW_MS);
}

// ---------- home guide completeness ----------

// The "core" fields that define a usable guide. emergencyContact, neighbourhood
// and house rules are nice-to-have but excluded from the denominator so a
// practical guide can read 100% without every optional flourish.
export const HOME_GUIDE_CORE_FIELDS = [
  "accessInstructions",
  "keyPickup",
  "wifiName",
  "wifiPassword",
  "heatingCooling",
  "kitchen",
  "bins",
  "petsPlants",
] as const;

type HomeGuideLike = Partial<Record<(typeof HOME_GUIDE_CORE_FIELDS)[number], string | null>>;

/** Count of core fields that hold a non-empty value. */
export function homeGuideFilledCount(guide: HomeGuideLike | null | undefined): number {
  if (!guide) return 0;
  return HOME_GUIDE_CORE_FIELDS.reduce(
    (n, f) => (guide[f] != null && String(guide[f]).trim() !== "" ? n + 1 : n),
    0,
  );
}

/** Completeness as a 0..100 integer percentage over the core field set. */
export function homeGuideCompleteness(guide: HomeGuideLike | null | undefined): number {
  return Math.round((homeGuideFilledCount(guide) / HOME_GUIDE_CORE_FIELDS.length) * 100);
}

/** A guide counts as "complete" once every core field is filled. */
export function homeGuideComplete(guide: HomeGuideLike | null | undefined): boolean {
  return homeGuideFilledCount(guide) === HOME_GUIDE_CORE_FIELDS.length;
}
