// Shared loaders + gating helpers for the trip cockpit (DOK-152). Keeps the
// reveal-gating logic in ONE place so /trip, check-in/out, the home-guide
// endpoint and the proposals payload can never disagree about who may see what.

import { prisma } from "@/lib/db";
import {
  getTripPhase,
  guideUnlocked,
  homeGuideComplete,
  homeGuideCompleteness,
  revealUnlocksAt,
  type TripPhase,
} from "./phase";
import { decryptSecret } from "@/lib/crypto";

// A SwapAgreement loaded with everything the cockpit needs, incl. both
// listings (with owner + home guide) and all check events.
export type LoadedAgreement = NonNullable<Awaited<ReturnType<typeof loadAgreement>>>;

export function loadAgreement(id: string) {
  return prisma.swapAgreement.findUnique({
    where: { id },
    include: {
      listing1: { include: { user: { select: { id: true, name: true, email: true } }, homeGuide: true } },
      listing2: { include: { user: { select: { id: true, name: true, email: true } }, homeGuide: true } },
      insurancePolicy: true,
      checkEvents: { orderBy: { createdAt: "asc" } },
    },
  });
}

export type PartySide = "1" | "2";

/**
 * Resolve which side of the agreement a user is, plus the convenient
 * "mine"/"other" listing split. Returns null when the user is not a party.
 */
export function resolveParty(agreement: LoadedAgreement, userId: string) {
  const onSide1 = agreement.listing1.userId === userId;
  const onSide2 = agreement.listing2.userId === userId;
  if (!onSide1 && !onSide2) return null;

  const side: PartySide = onSide1 ? "1" : "2";
  const myListing = onSide1 ? agreement.listing1 : agreement.listing2;
  const otherListing = onSide1 ? agreement.listing2 : agreement.listing1;
  // The traveller's own key code is the one for the home they are going TO.
  // keyCode1 unlocks listing1, keyCode2 unlocks listing2 — a party travels to
  // the *other* listing, so they need the other side's code.
  // Key codes are encrypted at rest (SWP-007) — decrypt the traveller's own.
  const myKeyCode = decryptSecret(onSide1 ? agreement.keyCode2 : agreement.keyCode1);
  return { side, onSide1, myListing, otherListing, myKeyCode };
}

/**
 * Compute the full reveal-gating picture for an agreement at `now`: whether the
 * gate is open, when it opens, and both guides' completeness. Centralised so
 * every caller derives the same answer.
 */
export function computeGating(agreement: LoadedAgreement, now: Date) {
  const guide1Complete = homeGuideComplete(agreement.listing1.homeGuide);
  const guide2Complete = homeGuideComplete(agreement.listing2.homeGuide);
  const bothComplete = guide1Complete && guide2Complete;
  const unlocked = guideUnlocked(agreement, now, bothComplete);
  return {
    unlocked,
    unlocksAt: revealUnlocksAt(agreement),
    guide1Complete,
    guide2Complete,
    bothComplete,
    completeness1: homeGuideCompleteness(agreement.listing1.homeGuide),
    completeness2: homeGuideCompleteness(agreement.listing2.homeGuide),
  };
}

export function phaseOf(agreement: LoadedAgreement, now: Date): TripPhase {
  return getTripPhase(agreement, agreement.checkEvents, now);
}

export { getTripPhase, guideUnlocked };
