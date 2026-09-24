// Score for a finished board. Pure so it can be unit-tested and shown on the
// How to Play screen consistently.

export const SCORING = Object.freeze({
  perPair: 100,
  perSecond: 2,
  perHint: 150,
  perShuffle: 250,
  perMismatch: 20,
});

export function computeScore({ pairs, seconds, hintsUsed = 0, shuffles = 0, mismatches = 0 }) {
  const raw =
    pairs * SCORING.perPair -
    Math.floor(seconds) * SCORING.perSecond -
    hintsUsed * SCORING.perHint -
    shuffles * SCORING.perShuffle -
    mismatches * SCORING.perMismatch;
  return Math.max(0, raw);
}
