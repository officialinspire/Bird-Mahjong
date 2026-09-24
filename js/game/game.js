// Game session: an immutable state object plus pure actions on it.
// The UI keeps the latest state and re-renders; nothing here touches the DOM.
//
// State shape (plain data, JSON-serialisable for autosave):
//   { layoutId, seed, birds[], removed[], selected, moves, mismatches,
//     hintsUsed, shuffles, score, streak, bestStreak, streakBonus,
//     history: [[a, b], ...], gains: [{ points, streak, bestStreak }, ...],
//     solution: [[a, b], ...], initialBirds[], initialSolution: [[a, b], ...],
//     restarts }
// `gains[k]` records what the k-th removal earned and the streak values
// before it, so undo can take the points back exactly.
// `solution` is a verified route: the pairs that clear the board from the
// deal (or from the last shuffle). If the player follows it, its unplayed
// pairs remain a route to completion; see routeRemaining().

import { findRemovalSequence, generateBoard, redealRemaining } from "./generator.js";
import { getLayout } from "./geometry.js";
import { createRng, randomSeed } from "./rng.js";
import { availableMatches, canRemovePair, isFree } from "./rules.js";
import { pointsForMatch } from "./score.js";

export function createGame(layoutId, { seed = randomSeed(), birdIds, birdPool, streakBonus = true } = {}) {
  const board = generateBoard(layoutId, { seed, birdIds, birdPool });
  return Object.freeze({
    layoutId,
    seed,
    birds: board.birds,
    removed: Object.freeze(board.birds.map(() => false)),
    selected: null,
    moves: 0,
    mismatches: 0,
    hintsUsed: 0,
    shuffles: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    streakBonus,
    history: Object.freeze([]),
    gains: Object.freeze([]),
    solution: board.solution,
    initialBirds: board.birds,
    initialSolution: board.solution,
    restarts: 0,
  });
}

const linksOf = (state) => getLayout(state.layoutId).links;

export function tileIsFree(state, i) {
  return isFree(linksOf(state), state.removed, i);
}

export function tilesLeft(state) {
  return state.removed.filter((r) => !r).length;
}

export function isWon(state) {
  return tilesLeft(state) === 0;
}

export function findMatches(state) {
  return availableMatches(linksOf(state), state.removed, state.birds);
}

/** No tiles can be matched but the board isn't clear. */
export function isStuck(state) {
  return !isWon(state) && findMatches(state).length === 0;
}

/** Remove a matching free pair. Throws on an illegal pair. */
export function removePair(state, a, b) {
  if (!canRemovePair(linksOf(state), state.removed, state.birds, a, b)) {
    throw new Error(`tiles ${a} and ${b} are not a removable pair`);
  }
  const removed = state.removed.slice();
  removed[a] = removed[b] = true;
  const streak = state.streak + 1;
  const points = pointsForMatch(streak, state.streakBonus);
  return Object.freeze({
    ...state,
    removed: Object.freeze(removed),
    selected: null,
    moves: state.moves + 1,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    history: Object.freeze([...state.history, [a, b]]),
    gains: Object.freeze([...state.gains, Object.freeze({ points, streak: state.streak, bestStreak: state.bestStreak })]),
  });
}

/**
 * Handle a tap/click on tile i. Returns `{ state, result }` where result is:
 *   "ignored"     tile index out of range or already removed
 *   "blocked"     tile is covered or both sides are blocked
 *   "selected"    tile is now selected
 *   "deselected"  the selected tile was tapped again
 *   "matched"     the pair was removed
 *   "mismatch"    different bird; the new tile becomes the selection
 */
export function selectTile(state, i) {
  if (!Number.isInteger(i) || i < 0 || i >= state.birds.length || state.removed[i]) {
    return { state, result: "ignored" };
  }
  if (!tileIsFree(state, i)) return { state, result: "blocked" };
  if (state.selected === null) {
    return { state: Object.freeze({ ...state, selected: i }), result: "selected" };
  }
  if (state.selected === i) {
    return { state: Object.freeze({ ...state, selected: null }), result: "deselected" };
  }
  if (state.birds[state.selected] === state.birds[i]) {
    return { state: removePair(state, state.selected, i), result: "matched" };
  }
  return {
    state: Object.freeze({ ...state, selected: i, mismatches: state.mismatches + 1, streak: 0 }),
    result: "mismatch",
  };
}

/** Put the last removed pair back, along with the points it earned. */
export function undo(state) {
  if (state.history.length === 0) return state;
  const [a, b] = state.history[state.history.length - 1];
  const gain = state.gains[state.gains.length - 1];
  const removed = state.removed.slice();
  removed[a] = removed[b] = false;
  return Object.freeze({
    ...state,
    removed: Object.freeze(removed),
    selected: null,
    moves: state.moves - 1,
    score: state.score - gain.points,
    streak: gain.streak,
    bestStreak: gain.bestStreak,
    history: Object.freeze(state.history.slice(0, -1)),
    gains: Object.freeze(state.gains.slice(0, -1)),
  });
}

/**
 * True if replaying `route` (skipping pairs already fully removed) clears the
 * board from the current position using only legal matches.
 */
export function verifyRoute(state, route) {
  const links = linksOf(state);
  const removed = state.removed.slice();
  for (const [a, b] of route) {
    if (removed[a] && removed[b]) continue;
    if (!canRemovePair(links, removed, state.birds, a, b)) return false;
    removed[a] = removed[b] = true;
  }
  return removed.every(Boolean);
}

/**
 * The unplayed part of the stored route, if it still leads to a clear board
 * from here (i.e. the player hasn't broken it up), else null.
 */
export function routeRemaining(state) {
  const rest = state.solution.filter(([a, b]) => !state.removed[a] || !state.removed[b]);
  const split = rest.some(([a, b]) => state.removed[a] !== state.removed[b]);
  if (split || !verifyRoute(state, rest)) return null;
  return rest;
}

/**
 * Pick a hint: the next pair on the verified route when it's intact (so
 * following hints always finishes the board), otherwise a legal pair whose
 * removal doesn't immediately leave the board stuck, otherwise any legal pair.
 */
function pickHint(state) {
  const route = routeRemaining(state);
  if (route && route.length) return route[0];
  const matches = findMatches(state);
  const safe = matches.find(([a, b]) => {
    const after = removePair(state, a, b);
    return isWon(after) || !isStuck(after);
  });
  return safe || matches[0] || null;
}

/**
 * A currently legal matching pair to highlight, or null. Hints are free: the
 * counter is only a stat and the score and streak are untouched.
 */
export function useHint(state) {
  const pair = pickHint(state);
  return { state: Object.freeze({ ...state, hintsUsed: state.hintsUsed + 1 }), pair };
}

/**
 * Whether the remaining positions can still be cleared by *some* deal of the
 * remaining birds — i.e. whether Shuffle can rescue a stuck board.
 */
export function canRescue(state) {
  if (isWon(state)) return true;
  const rng = createRng((state.seed ^ tilesLeft(state) * 2654435761) >>> 0);
  return findRemovalSequence(getLayout(state.layoutId), rng, state.removed) !== null;
}

/**
 * What the player can do when no legal pair remains:
 *   "none"     not stuck (or already won)
 *   "shuffle"  re-dealing the remaining birds can rescue the board
 *   "restart"  no deal of these positions can be cleared; restart the board
 */
export function recoveryFor(state) {
  if (!isStuck(state)) return "none";
  return canRescue(state) ? "shuffle" : "restart";
}

/** Back to this deal's starting layout and birds, with a fresh score. */
export function restartBoard(state) {
  return Object.freeze({
    ...state,
    birds: state.initialBirds,
    removed: Object.freeze(state.initialBirds.map(() => false)),
    selected: null,
    moves: 0,
    mismatches: 0,
    hintsUsed: 0,
    shuffles: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    history: Object.freeze([]),
    gains: Object.freeze([]),
    solution: state.initialSolution,
    restarts: state.restarts + 1,
  });
}

/**
 * Re-deal the remaining birds onto the remaining positions so the board can
 * be finished again. The new route is replayed through the rules before it
 * is accepted, so a shuffled board always has a verified way to completion.
 * Score, streak and undo history are kept (removed tiles keep their birds, so
 * undo stays consistent). Returns the state unchanged if the board is clear
 * or no deal of the remaining positions can be cleared.
 */
export function shuffleRemaining(state, seed = randomSeed()) {
  if (isWon(state)) return state;
  const dealt = redealRemaining(getLayout(state.layoutId), state.removed, state.birds, createRng(seed));
  if (!dealt) return state;
  const next = Object.freeze({
    ...state,
    birds: Object.freeze(dealt.birds),
    solution: Object.freeze(dealt.solution),
    selected: null,
    shuffles: state.shuffles + 1,
  });
  return verifyRoute(next, next.solution) ? next : state;
}
