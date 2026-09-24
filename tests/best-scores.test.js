import { test } from "node:test";
import assert from "node:assert/strict";

import { BEST_KEY, createBestScores } from "../js/best-scores.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

test("bests are tracked separately per difficulty", () => {
  const storage = memoryStorage();
  const bests = createBestScores(storage);
  assert.equal(bests.get("easy"), null);

  const first = bests.record("easy", { score: 1500, seconds: 90 });
  assert.equal(first.isNewBest, true);
  assert.equal(first.previous, null);
  bests.record("hard", { score: 4000, seconds: 400 });

  assert.deepEqual(bests.get("easy"), { score: 1500, bestTime: 90, games: 1 });
  assert.deepEqual(bests.get("hard"), { score: 4000, bestTime: 400, games: 1 });
  assert.equal(bests.get("medium"), null);
});

test("only a higher score replaces the best; a faster time is tracked on its own", () => {
  const bests = createBestScores(memoryStorage());
  bests.record("medium", { score: 2300, seconds: 200 });

  const lower = bests.record("medium", { score: 2100, seconds: 150 });
  assert.equal(lower.isNewBest, false);
  assert.equal(lower.isNewBestTime, true);
  assert.deepEqual(bests.get("medium"), { score: 2300, bestTime: 150, games: 2 });

  const tie = bests.record("medium", { score: 2300, seconds: 300 });
  assert.equal(tie.isNewBest, false, "ties don't count as new");

  const higher = bests.record("medium", { score: 2500, seconds: 400 });
  assert.equal(higher.isNewBest, true);
  assert.equal(higher.previous.score, 2300);
  assert.deepEqual(bests.get("medium"), { score: 2500, bestTime: 150, games: 4 });
});

test("bests persist in storage under one key", () => {
  const storage = memoryStorage();
  createBestScores(storage).record("easy", { score: 1200, seconds: 60 });
  const reloaded = createBestScores(storage);
  assert.equal(reloaded.get("easy").score, 1200);
  assert.ok(JSON.parse(storage.dump()[BEST_KEY]).easy);
});

test("corrupt data is ignored", () => {
  const bests = createBestScores(memoryStorage({ [BEST_KEY]: "{not json" }));
  assert.equal(bests.get("easy"), null);
  assert.equal(bests.record("easy", { score: 100, seconds: 5 }).isNewBest, true);
});

test("unavailable storage falls back to memory", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  for (const storage of [broken, undefined]) {
    const bests = createBestScores(storage);
    bests.record("hard", { score: 3000, seconds: 100 });
    assert.equal(bests.get("hard").score, 3000);
  }
});

test("clear removes one difficulty only", () => {
  const bests = createBestScores(memoryStorage());
  bests.record("easy", { score: 1, seconds: 1 });
  bests.record("hard", { score: 2, seconds: 2 });
  bests.clear("easy");
  assert.equal(bests.get("easy"), null);
  assert.equal(bests.get("hard").score, 2);
});
