import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, SCORING } from "../js/game/score.js";

test("score rewards pairs and deducts time, hints, shuffles and mismatches", () => {
  assert.equal(computeScore({ pairs: 24, seconds: 0 }), 24 * SCORING.perPair);
  assert.equal(computeScore({ pairs: 24, seconds: 100.9 }), 2400 - 200, "whole seconds only");
  assert.equal(
    computeScore({ pairs: 24, seconds: 60, hintsUsed: 1, shuffles: 1, mismatches: 2 }),
    2400 - 120 - 150 - 250 - 40
  );
});

test("score never goes below zero", () => {
  assert.equal(computeScore({ pairs: 1, seconds: 9999 }), 0);
});
