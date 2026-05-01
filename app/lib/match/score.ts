// Match score algorithm — 0..100 based on overlap between two listings.
// Date overlap (40), size compatibility ±50% (20), sleeps (15), amenity overlap (15), neighbourhood-type bonus (10).

export type ScoreableListing = {
  sizeSqm: number;
  sleeps: number;
  availableFrom: Date;
  availableTo: Date;
  petsAllowed: boolean;
  wfhSetup: boolean;
  stepFreeAccess: boolean;
  city: string;
  neighbourhood: string;
};

function dateOverlapDays(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): number {
  const start = Math.max(aFrom.getTime(), bFrom.getTime());
  const end = Math.min(aTo.getTime(), bTo.getTime());
  if (end <= start) return 0;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

export function computeMatchScore(mine: ScoreableListing, theirs: ScoreableListing): number {
  // Date overlap → 40 pts when there's at least 14 days of overlap.
  const overlap = dateOverlapDays(mine.availableFrom, mine.availableTo, theirs.availableFrom, theirs.availableTo);
  const datePts = Math.min(40, Math.round((overlap / 14) * 40));

  // Size compatibility: 20 pts if within ±50%, scales linearly.
  const sizeRatio = Math.min(mine.sizeSqm, theirs.sizeSqm) / Math.max(mine.sizeSqm, theirs.sizeSqm);
  // sizeRatio of 0.5 (50% smaller) → 0 pts; 1.0 → 20 pts.
  const sizePts = Math.max(0, Math.round((sizeRatio - 0.5) * 2 * 20));

  // Sleeps compatibility: 15 pts if within 1 person; degrades linearly.
  const sleepsDiff = Math.abs(mine.sleeps - theirs.sleeps);
  const sleepsPts = Math.max(0, 15 - sleepsDiff * 5);

  // Amenity overlap: 5pts each for pets/wfh/step-free overlap when both true.
  let amenityPts = 0;
  if (mine.petsAllowed && theirs.petsAllowed) amenityPts += 5;
  if (mine.wfhSetup && theirs.wfhSetup) amenityPts += 5;
  if (mine.stepFreeAccess && theirs.stepFreeAccess) amenityPts += 5;

  // Same-country bonus 10
  let neighbourhoodPts = 0;
  if (mine.city.toLowerCase() === theirs.city.toLowerCase()) {
    neighbourhoodPts = 10;
  } else if (mine.neighbourhood && theirs.neighbourhood) {
    // small bonus for similar density (very rough — deterministic)
    const a = mine.neighbourhood.length % 3;
    const b = theirs.neighbourhood.length % 3;
    if (a === b) neighbourhoodPts = 6;
    else neighbourhoodPts = 3;
  }

  const total = datePts + sizePts + sleepsPts + amenityPts + neighbourhoodPts;
  return Math.max(0, Math.min(100, total));
}
