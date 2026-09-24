// Solvable board generation.
//
// Instead of dealing birds at random and hoping the board is winnable, we:
//   1. find a legal order to clear the *empty geometry* two free tiles at a
//      time (a randomized depth-first search with backtracking), then
//   2. give each of those pairs a bird, so every bird gets exactly two pairs
//      (four copies).
// Replaying the pairs in that order is a guaranteed solution: at each step
// both tiles are free (step 1) and show the same bird (step 2).

import { BIRD_IDS, COPIES_PER_BIRD } from "./birds.js";
import { getLayout } from "./geometry.js";
import { createRng, randomSeed, shuffled } from "./rng.js";
import { freeTiles } from "./rules.js";

const DEFAULT_SEARCH = Object.freeze({ maxNodes: 20000, restarts: 40 });

/**
 * Find a sequence of [a, b] pairs that removes every tile still present,
 * where both tiles of each pair are free at the moment they are removed.
 * Returns null when no such sequence exists (or none was found within the
 * search budget).
 */
export function findRemovalSequence(layout, rng, removed = null, options = {}) {
  const { maxNodes, restarts } = { ...DEFAULT_SEARCH, ...options };
  const start = removed ? removed.slice() : layout.positions.map(() => false);
  const remaining = start.filter((r) => !r).length;
  if (remaining % 2 !== 0) return null;

  for (let attempt = 0; attempt < restarts; attempt++) {
    const result = searchOnce(layout, rng, start.slice(), remaining, maxNodes);
    if (result.sequence) return result.sequence;
    if (!result.aborted) return null; // search space exhausted: provably unsolvable
  }
  return null;
}

function searchOnce(layout, rng, removed, remaining, maxNodes) {
  const { links, positions } = layout;
  const sequence = [];
  let nodes = 0;
  let aborted = false;

  function candidates() {
    // Random order, then higher layers first: clearing tall stacks early
    // avoids the classic dead end of two tiles stacked on each other.
    return shuffled(freeTiles(links, removed), rng).sort((a, b) => positions[b].z - positions[a].z);
  }

  function dfs(left) {
    if (left === 0) return true;
    if (++nodes > maxNodes) {
      aborted = true;
      return false;
    }
    const free = candidates();
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        removed[a] = removed[b] = true;
        sequence.push(a < b ? [a, b] : [b, a]);
        if (dfs(left - 2)) return true;
        sequence.pop();
        removed[a] = removed[b] = false;
        if (aborted) return false;
      }
    }
    return false;
  }

  return dfs(remaining) ? { sequence } : { sequence: null, aborted };
}

/**
 * Give each pair of a removal sequence a bird. `pairBirds` lists one bird per
 * pair (a bird with four copies appears twice); it is shuffled so the same
 * geometry order yields different boards.
 */
export function assignBirds(tileCount, sequence, pairBirds, rng) {
  if (pairBirds.length !== sequence.length) {
    throw new Error(`need ${sequence.length} bird pairs, got ${pairBirds.length}`);
  }
  const birds = new Array(tileCount).fill(null);
  shuffled(pairBirds, rng).forEach((bird, k) => {
    const [a, b] = sequence[k];
    birds[a] = bird;
    birds[b] = bird;
  });
  return birds;
}

/**
 * Generate a starting board for a preset layout. Birds are `birdIds` if
 * given, otherwise a random selection from `birdPool` (default: all birds).
 * Returns `{ layoutId, seed, birdIds, birds, solution }` where `birds[i]` is
 * the bird on tile i and `solution` is a known winning list of pairs.
 */
export function generateBoard(layoutId, { seed = randomSeed(), birdIds = null, birdPool = BIRD_IDS } = {}) {
  const layout = getLayout(layoutId);
  const tileCount = layout.positions.length;
  if (tileCount % COPIES_PER_BIRD !== 0) {
    throw new Error(`layout "${layoutId}" has ${tileCount} tiles, not a multiple of ${COPIES_PER_BIRD}`);
  }
  const birdCount = tileCount / COPIES_PER_BIRD;
  const rng = createRng(seed);
  if (!birdIds && birdPool.length < birdCount) {
    throw new Error(`layout "${layoutId}" needs ${birdCount} birds but the pool has ${birdPool.length}`);
  }
  const chosen = birdIds ? birdIds.slice() : shuffled(birdPool, rng).slice(0, birdCount);
  if (chosen.length !== birdCount || new Set(chosen).size !== birdCount) {
    throw new Error(`layout "${layoutId}" needs ${birdCount} distinct birds, got ${chosen.length}`);
  }

  const solution = findRemovalSequence(layout, rng);
  if (!solution) throw new Error(`could not find a removal sequence for "${layoutId}" (seed ${seed})`);

  const pairBirds = chosen.flatMap((bird) => new Array(COPIES_PER_BIRD / 2).fill(bird));
  const birds = assignBirds(tileCount, solution, pairBirds, rng);
  return Object.freeze({ layoutId, seed, birdIds: Object.freeze(chosen), birds: Object.freeze(birds), solution: Object.freeze(solution) });
}

/**
 * Re-deal the birds still on the board so the result is again guaranteed
 * solvable. Keeps the same multiset of remaining birds.
 * Returns `{ birds, solution }`, or null if the remaining geometry has no
 * legal clearing order.
 */
export function redealRemaining(layout, removed, birds, rng) {
  const solution = findRemovalSequence(layout, rng, removed);
  if (!solution) return null;
  const counts = new Map();
  birds.forEach((bird, i) => {
    if (!removed[i]) counts.set(bird, (counts.get(bird) || 0) + 1);
  });
  const pairBirds = [];
  for (const [bird, n] of counts) {
    for (let k = 0; k < n / 2; k++) pairBirds.push(bird);
  }
  const dealt = assignBirds(birds.length, solution, pairBirds, rng);
  // Removed tiles keep their original bird so undo history stays meaningful.
  const next = birds.map((bird, i) => (removed[i] ? bird : dealt[i]));
  return { birds: next, solution };
}
