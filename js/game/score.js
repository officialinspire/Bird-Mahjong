// Scoring. There is no time limit, no lives and no penalty: every pair is
// worth the same, and matching several pairs in a row without a mismatch
// earns a small, optional streak bonus (Settings → Streak bonus).

export const SCORING = Object.freeze({
  perPair: 100,
  streakStep: 10,   // bonus grows by this much per consecutive match…
  streakCap: 50,    // …up to this much per pair
});

/**
 * Points for a match. `streak` counts consecutive matches including this one
 * (1 for the first match after a mismatch or at the start).
 */
export function pointsForMatch(streak, streakBonus = true) {
  const bonus = streakBonus ? Math.min(SCORING.streakCap, SCORING.streakStep * Math.max(0, streak - 1)) : 0;
  return SCORING.perPair + bonus;
}

/** Highest score a board can yield: every pair in one unbroken streak. */
export function maxScore(pairs, streakBonus = true) {
  let total = 0;
  for (let s = 1; s <= pairs; s++) total += pointsForMatch(s, streakBonus);
  return total;
}
