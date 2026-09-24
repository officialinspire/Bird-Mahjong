// Game session: an immutable state object plus pure actions on it.
// The UI keeps the latest state and re-renders; nothing here touches the DOM.
//
// State shape (plain data, JSON-serialisable for autosave):
//   { layoutId, seed, birds[], removed[], selected, moves, mismatches,
//     hintsUsed, shuffles, history: [[a, b], ...], solution: [[a, b], ...] }

import { generateBoard, redealRemaining } from "./generator.js";
import { getLayout } from "./geometry.js";
import { createRng, randomSeed } from "./rng.js";
import { availableMatches, canRemovePair, isFree } from "./rules.js";

export function createGame(layoutId, { seed = randomSeed(), birdIds } = {}) {
  const board = generateBoard(layoutId, { seed, birdIds });
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
    history: Object.freeze([]),
    solution: board.solution,
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
  return Object.freeze({
    ...state,
    removed: Object.freeze(removed),
    selected: null,
    moves: state.moves + 1,
    history: Object.freeze([...state.history, [a, b]]),
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
    state: Object.freeze({ ...state, selected: i, mismatches: state.mismatches + 1 }),
    result: "mismatch",
  };
}

/** Put the last removed pair back. */
export function undo(state) {
  if (state.history.length === 0) return state;
  const [a, b] = state.history[state.history.length - 1];
  const removed = state.removed.slice();
  removed[a] = removed[b] = false;
  return Object.freeze({
    ...state,
    removed: Object.freeze(removed),
    selected: null,
    moves: state.moves - 1,
    history: Object.freeze(state.history.slice(0, -1)),
  });
}

/** A removable pair to highlight (the first found), or null. Counts as a hint. */
export function useHint(state) {
  const [pair = null] = findMatches(state);
  return { state: Object.freeze({ ...state, hintsUsed: state.hintsUsed + 1 }), pair };
}

/**
 * Re-deal the remaining birds onto the remaining positions so the board is
 * solvable again. Clears undo history (old pairs no longer mean the same
 * thing). Returns the state unchanged if the board is already clear.
 */
export function shuffleRemaining(state, seed = randomSeed()) {
  if (isWon(state)) return state;
  const dealt = redealRemaining(getLayout(state.layoutId), state.removed, state.birds, createRng(seed));
  if (!dealt) return state;
  return Object.freeze({
    ...state,
    birds: Object.freeze(dealt.birds),
    solution: Object.freeze(dealt.solution),
    selected: null,
    shuffles: state.shuffles + 1,
    history: Object.freeze([]),
  });
}
