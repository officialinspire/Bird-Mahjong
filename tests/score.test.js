import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createGame, removePair, selectTile, shuffleRemaining, tileIsFree, undo, useHint } from "../js/game/game.js";
import { maxScore, pointsForMatch, SCORING } from "../js/game/score.js";

describe("points", () => {
  test("every pair is worth 100", () => {
    assert.equal(SCORING.perPair, 100);
    assert.equal(pointsForMatch(1), 100);
    assert.equal(pointsForMatch(1, false), 100);
  });

  test("the streak bonus is small, grows with the streak, and is capped", () => {
    assert.equal(pointsForMatch(2), 110);
    assert.equal(pointsForMatch(3), 120);
    assert.equal(pointsForMatch(6), 150);
    assert.equal(pointsForMatch(40), 150, "capped at +50");
  });

  test("the streak bonus is optional", () => {
    assert.equal(pointsForMatch(10, false), 100);
    assert.equal(maxScore(12, false), 1200);
  });
});

/** Play a game's known solution to the end, optionally with extras first. */
function playSolution(state) {
  for (const [a, b] of state.solution) state = removePair(state, a, b);
  return state;
}

describe("scoring during play", () => {
  test("a clean clear scores 100 per pair plus the full streak bonus", () => {
    for (const [layout, pairs] of [["meadow", 12], ["twin-groves", 20], ["old-growth", 30]]) {
      const won = playSolution(createGame(layout, { seed: 3 }));
      assert.equal(won.score, maxScore(pairs), layout);
      assert.equal(won.bestStreak, pairs);
    }
  });

  test("with the streak bonus off, score is exactly 100 per pair", () => {
    const won = playSolution(createGame("twin-groves", { seed: 3, streakBonus: false }));
    assert.equal(won.score, 2000);
  });

  test("time plays no part in the score", () => {
    // The state has no clock at all: two games played identically score the same.
    const a = playSolution(createGame("meadow", { seed: 8 }));
    const b = playSolution(createGame("meadow", { seed: 8 }));
    assert.equal(a.score, b.score);
    assert.ok(!("seconds" in a) && !("time" in a));
  });

  test("a mismatch resets the streak but never subtracts points", () => {
    let state = createGame("meadow", { seed: 5 });
    const [[a, b], [c, d]] = state.solution;
    state = removePair(state, a, b);
    state = removePair(state, c, d);
    assert.equal(state.streak, 2);
    const scoreBefore = state.score;
    // Pick two free tiles with different birds and tap them.
    const free = state.birds.map((_, i) => i).filter((i) => tileIsFree(state, i));
    const x = free[0];
    const y = free.find((i) => state.birds[i] !== state.birds[x]);
    state = selectTile(state, x).state;
    const step = selectTile(state, y);
    assert.equal(step.result, "mismatch");
    assert.equal(step.state.streak, 0);
    assert.equal(step.state.score, scoreBefore);
  });

  test("hints and shuffles never cost points", () => {
    let state = createGame("old-growth", { seed: 2 });
    for (const [a, b] of state.solution.slice(0, 5)) state = removePair(state, a, b);
    const score = state.score;
    state = useHint(state).state;
    state = shuffleRemaining(state, 7);
    assert.equal(state.score, score);
    assert.equal(playSolution(state).score > score, true);
  });

  test("undo takes back exactly that pair's points and streak", () => {
    let state = createGame("twin-groves", { seed: 6 });
    const [p1, p2, p3] = state.solution;
    state = removePair(state, ...p1);
    state = removePair(state, ...p2);
    const afterTwo = state;
    state = removePair(state, ...p3);
    assert.equal(state.score, 100 + 110 + 120);
    const undone = undo(state);
    assert.equal(undone.score, afterTwo.score);
    assert.equal(undone.streak, afterTwo.streak);
    assert.equal(undone.bestStreak, afterTwo.bestStreak);
    assert.equal(removePair(undone, ...p3).score, state.score, "re-matching earns the same points");
  });
});
