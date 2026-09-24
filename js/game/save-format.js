// Saved-game format: game state <-> plain JSON, with strict validation.
//
// A save is only accepted if it describes a board the game could really have
// reached. Anything else (hand-edited, truncated, from an older version, or
// from a layout that no longer exists) is rejected, and the caller discards
// it. A half-restored board that breaks mid-game is worse than no save at all.
//
// Invariants checked on load (they hold for every state the actions in
// game.js can produce):
//   * layout exists; every per-tile array has one entry per position
//   * every bird is a known ID, and each bird present appears exactly
//     COPIES_PER_BIRD times, both in `birds` and in `initialBirds`
//   * the removed tiles are exactly the tiles in the undo history, and each
//     history pair shows one bird (it was a legal match)
//   * score = sum of gains; gains line up one-to-one with history
//   * streak / bestStreak / counters are sane non-negative integers
//   * `selected` is null or a free tile
//   * `solution` and `initialSolution` are pair lists over valid tiles, and
//     the initial route really clears the initial deal

import { BIRD_IDS, COPIES_PER_BIRD } from "./birds.js";
import { getLayout, LAYOUT_IDS } from "./geometry.js";
import { canRemovePair, isFree } from "./rules.js";

export const SAVE_VERSION = 1;

const COUNTERS = ["moves", "mismatches", "hintsUsed", "shuffles", "score", "streak", "bestStreak", "restarts"];

/** Plain JSON-safe copy of a game state. */
export function serializeGame(state) {
  return {
    layoutId: state.layoutId,
    seed: state.seed,
    birds: [...state.birds],
    removed: [...state.removed],
    selected: state.selected,
    moves: state.moves,
    mismatches: state.mismatches,
    hintsUsed: state.hintsUsed,
    shuffles: state.shuffles,
    score: state.score,
    streak: state.streak,
    bestStreak: state.bestStreak,
    streakBonus: state.streakBonus,
    history: state.history.map(([a, b]) => [a, b]),
    gains: state.gains.map((g) => ({ points: g.points, streak: g.streak, bestStreak: g.bestStreak })),
    solution: state.solution.map(([a, b]) => [a, b]),
    initialBirds: [...state.initialBirds],
    initialSolution: state.initialSolution.map(([a, b]) => [a, b]),
    restarts: state.restarts,
  };
}

const isInt = (n) => Number.isInteger(n) && n >= 0;
const freezePairs = (pairs) => Object.freeze(pairs.map(([a, b]) => Object.freeze([a, b])));

function checkBirds(birds, n, label) {
  if (!Array.isArray(birds) || birds.length !== n) throw new Error(`${label}: wrong length`);
  const counts = new Map();
  for (const bird of birds) {
    if (!BIRD_IDS.includes(bird)) throw new Error(`${label}: unknown bird`);
    counts.set(bird, (counts.get(bird) || 0) + 1);
  }
  for (const count of counts.values()) {
    if (count !== COPIES_PER_BIRD) throw new Error(`${label}: bird count ${count}`);
  }
}

function checkPairs(pairs, n, label) {
  if (!Array.isArray(pairs)) throw new Error(`${label}: not a list`);
  const seen = new Set();
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`${label}: bad pair`);
    for (const i of pair) {
      if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) throw new Error(`${label}: bad tile ${i}`);
      seen.add(i);
    }
  }
}

/**
 * Rebuild a frozen game state from saved JSON. Throws a descriptive Error if
 * anything is inconsistent; use `tryDeserializeGame` for a null-on-failure form.
 */
export function deserializeGame(data) {
  if (!data || typeof data !== "object") throw new Error("not an object");
  if (!LAYOUT_IDS.includes(data.layoutId)) throw new Error("unknown layout");
  const { positions, links } = getLayout(data.layoutId);
  const n = positions.length;

  checkBirds(data.birds, n, "birds");
  checkBirds(data.initialBirds, n, "initialBirds");
  const sorted = (list) => [...list].sort().join();
  if (sorted(data.birds) !== sorted(data.initialBirds)) throw new Error("birds differ from the deal");

  if (!Array.isArray(data.removed) || data.removed.length !== n || !data.removed.every((r) => typeof r === "boolean")) {
    throw new Error("removed: bad");
  }
  for (const key of COUNTERS) if (!isInt(data[key])) throw new Error(`${key}: bad`);
  if (!Number.isFinite(data.seed)) throw new Error("seed: bad");
  if (typeof data.streakBonus !== "boolean") throw new Error("streakBonus: bad");

  // Undo history must account for exactly the removed tiles.
  checkPairs(data.history, n, "history");
  const inHistory = new Set(data.history.flat());
  data.removed.forEach((r, i) => {
    if (r !== inHistory.has(i)) throw new Error(`tile ${i} removed/history mismatch`);
  });
  for (const [a, b] of data.history) {
    if (data.birds[a] !== data.birds[b]) throw new Error("history pair doesn't match");
  }
  if (data.moves !== data.history.length) throw new Error("moves != history");

  if (!Array.isArray(data.gains) || data.gains.length !== data.history.length) throw new Error("gains: bad");
  let total = 0;
  for (const g of data.gains) {
    if (!g || !isInt(g.points) || !isInt(g.streak) || !isInt(g.bestStreak)) throw new Error("gain: bad");
    total += g.points;
  }
  if (total !== data.score) throw new Error("score != gains");
  if (data.bestStreak < data.streak) throw new Error("streak > bestStreak");

  if (data.selected !== null && !(Number.isInteger(data.selected) && isFree(links, data.removed, data.selected))) {
    throw new Error("selected: not a free tile");
  }

  checkPairs(data.solution, n, "solution");
  checkPairs(data.initialSolution, n, "initialSolution");
  if (data.initialSolution.length !== n / 2) throw new Error("initialSolution: incomplete");
  const cleared = data.initialBirds.map(() => false);
  for (const [a, b] of data.initialSolution) {
    if (!canRemovePair(links, cleared, data.initialBirds, a, b)) throw new Error("initialSolution: illegal");
    cleared[a] = cleared[b] = true;
  }

  return Object.freeze({
    layoutId: data.layoutId,
    seed: data.seed,
    birds: Object.freeze([...data.birds]),
    removed: Object.freeze([...data.removed]),
    selected: data.selected,
    moves: data.moves,
    mismatches: data.mismatches,
    hintsUsed: data.hintsUsed,
    shuffles: data.shuffles,
    score: data.score,
    streak: data.streak,
    bestStreak: data.bestStreak,
    streakBonus: data.streakBonus,
    history: freezePairs(data.history),
    gains: Object.freeze(data.gains.map((g) => Object.freeze({ points: g.points, streak: g.streak, bestStreak: g.bestStreak }))),
    solution: freezePairs(data.solution),
    initialBirds: Object.freeze([...data.initialBirds]),
    initialSolution: freezePairs(data.initialSolution),
    restarts: data.restarts,
  });
}

export function tryDeserializeGame(data) {
  try {
    return deserializeGame(data);
  } catch {
    return null;
  }
}
