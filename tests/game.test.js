import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  createGame, findMatches, isStuck, isWon, removePair, selectTile, shuffleRemaining,
  tileIsFree, tilesLeft, undo, useHint,
} from "../js/game/game.js";
import { getLayout } from "../js/game/geometry.js";

const freeIndex = (state) => state.birds.findIndex((_, i) => tileIsFree(state, i));
const blockedIndex = (state) => state.birds.findIndex((_, i) => !state.removed[i] && !tileIsFree(state, i));

describe("selectTile", () => {
  test("blocked and covered tiles can't be selected", () => {
    const game = createGame("meadow", { seed: 1 });
    const { links } = getLayout("meadow");
    const covered = links.coveredBy.findIndex((list) => list.length > 0);
    const { state, result } = selectTile(game, covered);
    assert.equal(result, "blocked");
    assert.equal(state, game, "state unchanged");

    const blocked = blockedIndex(game);
    assert.equal(selectTile(game, blocked).result, "blocked");
  });

  test("out-of-range and removed tiles are ignored", () => {
    const game = createGame("meadow", { seed: 1 });
    assert.equal(selectTile(game, -1).result, "ignored");
    assert.equal(selectTile(game, 999).result, "ignored");
    const [a, b] = game.solution[0];
    const after = removePair(game, a, b);
    assert.equal(selectTile(after, a).result, "ignored");
  });

  test("select, deselect, mismatch, match", () => {
    const game = createGame("meadow", { seed: 3 });
    const [a, b] = game.solution[0];

    let step = selectTile(game, a);
    assert.equal(step.result, "selected");
    assert.equal(step.state.selected, a);

    assert.equal(selectTile(step.state, a).result, "deselected");

    // Find a free tile with a different bird for the mismatch case.
    const other = step.state.birds.findIndex((bird, i) => bird !== game.birds[a] && tileIsFree(game, i));
    assert.ok(other >= 0);
    const mismatch = selectTile(step.state, other);
    assert.equal(mismatch.result, "mismatch");
    assert.equal(mismatch.state.selected, other, "selection moves to the new tile");
    assert.equal(mismatch.state.mismatches, 1);
    assert.equal(mismatch.state.moves, 0);

    step = selectTile(selectTile(game, a).state, b);
    assert.equal(step.result, "matched");
    assert.equal(step.state.removed[a], true);
    assert.equal(step.state.removed[b], true);
    assert.equal(step.state.selected, null);
    assert.equal(step.state.moves, 1);
    assert.equal(tilesLeft(step.state), game.birds.length - 2);
    assert.equal(game.removed[a], false, "original state is not mutated");
  });
});

describe("playing a game", () => {
  test("following the solution through selectTile wins", () => {
    let state = createGame("old-growth", { seed: 11 });
    for (const [a, b] of state.solution) {
      state = selectTile(state, a).state;
      const step = selectTile(state, b);
      assert.equal(step.result, "matched");
      state = step.state;
    }
    assert.equal(isWon(state), true);
    assert.equal(isStuck(state), false);
    assert.equal(state.moves, state.solution.length);
  });

  test("removePair rejects illegal pairs", () => {
    const game = createGame("meadow", { seed: 2 });
    const free = freeIndex(game);
    assert.throws(() => removePair(game, free, free), /not a removable pair/);
    assert.throws(() => removePair(game, free, blockedIndex(game)), /not a removable pair/);
  });

  test("undo puts the last pair back", () => {
    const game = createGame("forest-edge", { seed: 4 });
    const [a, b] = game.solution[0];
    const played = removePair(game, a, b);
    const undone = undo(played);
    assert.deepEqual(undone.removed, game.removed);
    assert.equal(undone.moves, 0);
    assert.equal(undone.history.length, 0);
    assert.equal(undo(game), game, "nothing to undo");
  });

  test("hints point at a removable pair", () => {
    const game = createGame("deep-woods", { seed: 9 });
    const { state, pair } = useHint(game);
    assert.equal(state.hintsUsed, 1);
    assert.ok(findMatches(game).some(([a, b]) => a === pair[0] && b === pair[1]));
  });

  test("a stuck board is detected", () => {
    // Give every tile a different bird, so no two free tiles can match.
    const game = createGame("meadow", { seed: 6 });
    const unique = Object.freeze(game.birds.map((_, i) => `bird-${i}`));
    assert.equal(isStuck({ ...game, birds: unique }), true);
  });

  test("shuffle keeps the remaining birds and stays solvable", () => {
    let state = createGame("old-growth", { seed: 21 });
    // Play part of the known solution, then shuffle.
    for (const [a, b] of state.solution.slice(0, 15)) state = removePair(state, a, b);
    const before = state.birds.filter((_, i) => !state.removed[i]).sort();

    const shuffled = shuffleRemaining(state, 99);
    const after = shuffled.birds.filter((_, i) => !shuffled.removed[i]).sort();
    assert.deepEqual(after, before, "same multiset of birds");
    assert.deepEqual(shuffled.removed, state.removed, "same positions");
    assert.equal(shuffled.shuffles, 1);
    assert.equal(shuffled.history.length, 0);

    let replayed = shuffled;
    for (const [a, b] of shuffled.solution) replayed = removePair(replayed, a, b);
    assert.equal(isWon(replayed), true);
  });
});

describe("shuffle edge cases", () => {
  test("shuffle leaves the state unchanged when no deal can clear the remaining tiles", () => {
    // Clear meadow down to a single stacked pair: the 2×2 cap on layer 2 sits
    // over layer 1, which sits over layer 0. Keep just one cap tile and the
    // tile directly beneath it — no deal can clear that.
    let state = createGame("meadow", { seed: 12 });
    const { positions, links } = getLayout("meadow");
    const top = positions.find((p) => p.z === 2).index;
    const below = links.coveredBy.findIndex((list, i) => positions[i].z === 1 && list.includes(top));
    const removed = positions.map((_, i) => i !== top && i !== below);
    const birds = state.birds.map((b, i) => (i === top || i === below ? "osprey" : b));
    state = Object.freeze({ ...state, removed: Object.freeze(removed), birds: Object.freeze(birds) });
    assert.equal(isStuck(state), true);
    assert.equal(shuffleRemaining(state, 1), state);
  });
});
