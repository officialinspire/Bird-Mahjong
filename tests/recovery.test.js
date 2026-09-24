import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES } from "../js/config.js";
import {
  canRescue, createGame, findMatches, isStuck, isWon, recoveryFor, removePair, restartBoard,
  routeRemaining, selectTile, shuffleRemaining, tileIsFree, tilesLeft, undo, useHint, verifyRoute,
} from "../js/game/game.js";
import { getLayout } from "../js/game/geometry.js";
import { canRemovePair } from "../js/game/rules.js";
import { createRng } from "../js/game/rng.js";

const SEEDS = 400;

const newGame = (d, seed) => createGame(d.layout, { seed, birdPool: d.birdPool ?? undefined });

/** Play random legal matches until the board is won or stuck. */
function randomPlayout(state, rng) {
  for (;;) {
    const matches = findMatches(state);
    if (!matches.length) return state;
    const [a, b] = matches[Math.floor(rng() * matches.length)];
    state = removePair(state, a, b);
  }
}

/** Follow hints only; returns the final state (throws if a hint is illegal). */
function followHints(state) {
  for (let guard = 0; guard < 200 && !isWon(state); guard++) {
    const { state: next, pair } = useHint(state);
    if (!pair) return next;
    assert.ok(canRemovePair(getLayout(state.layoutId).links, state.removed, state.birds, ...pair), "hint is legal");
    state = removePair(next, ...pair);
  }
  return state;
}

const birdsLeft = (s) => s.birds.filter((_, i) => !s.removed[i]).sort();

/** Stuck positions from random play, grouped by recovery kind, per difficulty. */
const stuck = Object.fromEntries(DIFFICULTIES.map((d) => {
  const found = { shuffle: [], restart: [] };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const end = randomPlayout(newGame(d, seed), createRng(seed * 7));
    if (!isWon(end)) found[recoveryFor(end)].push(end);
  }
  return [d.id, found];
}));

describe("stuck detection", () => {
  test("random play reaches stuck boards on every difficulty", () => {
    for (const d of DIFFICULTIES) assert.ok(stuck[d.id].shuffle.length > 20, `${d.id}: ${stuck[d.id].shuffle.length}`);
    assert.ok(stuck.hard.restart.length > 0, "some Hard positions can't be rescued");
  });

  test("a stuck board has tiles left and no legal pair; a fresh board is never stuck", () => {
    for (const d of DIFFICULTIES) {
      for (const s of [...stuck[d.id].shuffle, ...stuck[d.id].restart]) {
        assert.ok(tilesLeft(s) > 0);
        assert.deepEqual(findMatches(s), []);
        assert.equal(isStuck(s), true);
        assert.notEqual(recoveryFor(s), "none");
        assert.equal(useHint(s).pair, null, "no hint when nothing is legal");
      }
      for (let seed = 1; seed <= 50; seed++) assert.equal(recoveryFor(newGame(d, seed)), "none");
    }
  });

  test("a won board is not stuck", () => {
    let s = createGame("meadow", { seed: 4 });
    for (const [a, b] of s.solution) s = removePair(s, a, b);
    assert.equal(isStuck(s), false);
    assert.equal(recoveryFor(s), "none");
  });
});

describe("Shuffle rescues", () => {
  for (const d of DIFFICULTIES) {
    test(`${d.name}: every rescuable stuck board gets a verified route and can be finished`, () => {
      for (const [k, s] of stuck[d.id].shuffle.entries()) {
        const shuffled = shuffleRemaining(s, 1000 + k);
        assert.notEqual(shuffled, s, "shuffle happened");
        assert.equal(isStuck(shuffled), false, "a legal pair exists after shuffling");
        assert.ok(verifyRoute(shuffled, shuffled.solution), "route verified");
        assert.ok(routeRemaining(shuffled), "route is intact");

        // Only the remaining positions' birds change; nothing is taken away.
        assert.deepEqual(shuffled.removed, s.removed);
        assert.deepEqual(birdsLeft(shuffled), birdsLeft(s));
        s.birds.forEach((b, i) => { if (s.removed[i]) assert.equal(shuffled.birds[i], b); });
        for (const key of ["score", "streak", "bestStreak", "moves", "mismatches"]) assert.equal(shuffled[key], s[key], key);
        assert.equal(shuffled.shuffles, s.shuffles + 1);

        // Following hints from here always finishes the board.
        const end = followHints(shuffled);
        assert.equal(isWon(end), true, `${d.id} #${k}: hints led to a clear board`);
      }
    });
  }
});

describe("Restart Board", () => {
  test("natural unrescuable Hard positions: Shuffle can't help, Restart can", () => {
    for (const s of stuck.hard.restart) {
      assert.equal(canRescue(s), false);
      assert.equal(shuffleRemaining(s, 1), s, "shuffle leaves an unrescuable board alone");

      const fresh = restartBoard(s);
      assert.equal(fresh.removed.every((r) => !r), true);
      assert.deepEqual(fresh.birds, s.initialBirds);
      assert.equal(fresh.score, 0);
      assert.equal(fresh.history.length, 0);
      assert.equal(fresh.restarts, s.restarts + 1);
      assert.equal(recoveryFor(fresh), "none");
      assert.equal(isWon(followHints(fresh)), true, "the restarted board can be finished");
    }
  });

  test("a hand-built dead end on Easy: one tile stacked on its twin", () => {
    let s = createGame("meadow", { seed: 12 });
    const { positions, links } = getLayout("meadow");
    const top = positions.find((p) => p.z === 2).index;
    const below = links.coveredBy.findIndex((list, i) => positions[i].z === 1 && list.includes(top));
    const removed = positions.map((_, i) => i !== top && i !== below);
    const birds = s.birds.map((b, i) => (i === top || i === below ? "osprey" : b));
    s = Object.freeze({ ...s, removed: Object.freeze(removed), birds: Object.freeze(birds) });

    assert.equal(recoveryFor(s), "restart");
    const fresh = restartBoard(s);
    assert.deepEqual(fresh.birds, s.initialBirds, "restores the original deal, not the edited birds");
    assert.equal(verifyRoute(fresh, fresh.solution), true);
  });

  test("restart after a shuffle returns to the original deal", () => {
    const s = stuck.medium.shuffle[0];
    const shuffled = shuffleRemaining(s, 5);
    const fresh = restartBoard(shuffled);
    assert.deepEqual(fresh.birds, s.initialBirds);
    assert.deepEqual(fresh.solution, s.initialSolution);
    assert.equal(fresh.shuffles, 0);
  });
});

describe("Hint", () => {
  test("following hints alone clears every fresh board", () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 100; seed++) {
        assert.equal(isWon(followHints(newGame(d, seed))), true, `${d.id} seed ${seed}`);
      }
    }
  });

  test("after the player leaves the route, hints are still legal pairs", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let s = newGame(DIFFICULTIES[2], seed);
      const rng = createRng(seed);
      for (let i = 0; i < 5; i++) {
        const m = findMatches(s);
        if (!m.length) break;
        s = removePair(s, ...m[Math.floor(rng() * m.length)]);
      }
      const { pair } = useHint(s);
      if (findMatches(s).length) {
        assert.ok(pair && canRemovePair(getLayout(s.layoutId).links, s.removed, s.birds, ...pair), `seed ${seed}`);
      }
    }
  });

  test("a hint costs nothing", () => {
    let s = createGame("twin-groves", { seed: 3 });
    s = removePair(s, ...s.solution[0]);
    s = removePair(s, ...s.solution[1]);
    const { state } = useHint(s);
    for (const key of ["score", "streak", "bestStreak", "moves", "removed", "birds", "selected"]) {
      assert.deepEqual(state[key], s[key], key);
    }
    assert.equal(state.hintsUsed, 1);
  });
});

describe("Undo", () => {
  test("restores the last pair and exactly the score, streak and best streak before it", () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 60; seed++) {
        let s = newGame(d, seed);
        const rng = createRng(seed * 3);
        const before = [];
        for (let i = 0; i < 8; i++) {
          const m = findMatches(s);
          if (!m.length) break;
          // Sprinkle in mismatches so streaks break and rebuild.
          if (rng() < 0.3) {
            const free = s.birds.map((_, j) => j).filter((j) => tileIsFree(s, j));
            const x = free[0];
            const y = free.find((j) => s.birds[j] !== s.birds[x]);
            if (y !== undefined) s = selectTile(selectTile(s, x).state, y).state;
          }
          before.push(s);
          s = removePair(s, ...m[Math.floor(rng() * m.length)]);
        }
        while (before.length) {
          const prior = before.pop();
          s = undo(s);
          for (const key of ["removed", "score", "streak", "bestStreak", "moves"]) {
            assert.deepEqual(s[key], prior[key], `${d.id} seed ${seed}: ${key}`);
          }
        }
        assert.equal(undo(s), s, "nothing left to undo");
      }
    }
  });

  test("undo gets you out of a stuck board without any cost", () => {
    const s = stuck.easy.shuffle[0];
    const undone = undo(s);
    assert.equal(tilesLeft(undone), tilesLeft(s) + 2);
    assert.equal(undone.score, s.score - s.gains.at(-1).points);
    assert.ok(undone.score >= 0);
  });

  test("undo still works after a shuffle and restores the removed pair's own birds", () => {
    const s = stuck.hard.shuffle[0];
    const [a, b] = s.history.at(-1);
    const shuffled = shuffleRemaining(s, 9);
    const undone = undo(shuffled);
    assert.equal(undone.removed[a], false);
    assert.equal(undone.removed[b], false);
    assert.equal(undone.birds[a], undone.birds[b], "the restored pair still matches");
    assert.equal(undone.score, s.score - s.gains.at(-1).points);
  });
});
