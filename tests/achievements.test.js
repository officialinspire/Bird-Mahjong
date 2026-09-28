import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ACHIEVEMENTS, BURST_PAIRS, BURST_WINDOW, CATEGORIES, SPEED_GOALS, achievementById, earnedIds, progressOf,
} from "../js/achievements.js";
import {
  ACHIEVEMENTS_KEY, STATS_KEY, applyBoard, applyWin, createBoardTracker, createPlayerStats, emptyStats,
  sanitizeStats, statsFromBests,
} from "../js/player-stats.js";
import { createBestScores } from "../js/best-scores.js";
import { DIFFICULTIES } from "../js/config.js";
import { BIRD_IDS } from "../js/game/birds.js";
import { createGame, removePair } from "../js/game/game.js";
import { LAYOUT_IDS } from "../js/game/geometry.js";
import { memoryStorage } from "../js/storage.js";

const TIERS = ["bronze", "silver", "gold", "leaf", "sky", "cardinal"];
const SHAPES = ["medal", "trophy", "rosette"];

/** A plain, unremarkable win: mid-afternoon, a hint used, nothing special. */
const win = (extra = {}) => ({
  difficultyId: "easy", layoutId: "meadow", seconds: 300, pairs: 12, bestStreak: 3, hintsUsed: 1,
  shuffles: 0, mismatches: 2, restarts: 0, undos: 0, continued: false,
  birds: ["northern-cardinal"], lastBird: "black-capped-chickadee", hour: 14, ...extra,
});

/** Stats that satisfy every achievement: all counts huge, every set full, all times fast. */
function maxedStats() {
  const s = emptyStats();
  for (const [k, v] of Object.entries(s)) if (typeof v === "number") s[k] = 100000;
  for (const d of DIFFICULTIES) {
    s.clears[d.id] = 100; s.fastest[d.id] = 1; s.noHintBy[d.id] = 10; s.flawlessBy[d.id] = 10;
  }
  for (const b of BIRD_IDS) s.birdPairs[b] = 1000;
  s.layouts = [...LAYOUT_IDS];
  s.species = [...BIRD_IDS];
  s.finishBirds = [...BIRD_IDS];
  s.weekdays = [0, 1, 2, 3, 4, 5, 6];
  return s;
}

const earned = (stats) => new Set(earnedIds(stats));

describe("achievement definitions", () => {
  test("ids are unique; every field is valid; every category is used", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    const cats = CATEGORIES.map((c) => c.id);
    for (const a of ACHIEVEMENTS) {
      assert.ok(cats.includes(a.category), a.id);
      assert.ok(a.name && a.text && a.quip, a.id);
      assert.ok(SHAPES.includes(a.badge.shape) && TIERS.includes(a.badge.tier), a.id);
      assert.ok(BIRD_IDS.includes(a.badge.bird), `${a.id}: ${a.badge.bird}`);
      assert.equal(achievementById(a.id), a);
    }
    for (const c of cats) assert.ok(ACHIEVEMENTS.some((a) => a.category === c), c);
    assert.ok(ACHIEVEMENTS.length >= 30);
  });

  test("the requested kinds are all there", () => {
    const has = (id) => assert.ok(achievementById(id), id);
    ["clears-1", "clears-10", "clears-25", "clears-50", "clears-100"].forEach(has);        // boards cleared
    DIFFICULTIES.forEach((d) => has(`first-${d.id}`)); has("first-all");                 // first time beating each / all
    ["life-list", "habitats", "pairs-250", "pairs-1000", "streak-12"].forEach(has);        // progressive
    DIFFICULTIES.forEach((d) => has(`speed-${d.id}`)); has("quick-wings");               // speed
    ["crow-raven", "birdbrain", "woodpecker", "gobble", "night-owl"].forEach(has);        // humour
    assert.ok(ACHIEVEMENTS.filter((a) => a.category === "firsts").every((a) => a.badge.shape === "trophy"));
  });

  test("fresh stats earn nothing; progress starts at zero and is bounded", () => {
    const s = emptyStats();
    assert.deepEqual(earnedIds(s), []);
    for (const a of ACHIEVEMENTS) {
      const p = progressOf(a, s);
      if (p) assert.deepEqual(p, [0, p[1]], a.id);
    }
  });

  test("every achievement is reachable, and progress reads full when earned", () => {
    const s = maxedStats();
    assert.deepEqual(earnedIds(s).sort(), ACHIEVEMENTS.map((a) => a.id).sort());
    for (const a of ACHIEVEMENTS) {
      const p = progressOf(a, s);
      if (p) assert.equal(p[0], p[1], a.id);
    }
  });

  test("every progress bar is [have, need] with 0 ≤ have ≤ need", () => {
    for (const s of [emptyStats(), maxedStats()]) {
      for (const a of ACHIEVEMENTS) {
        const p = progressOf(a, s);
        if (!p) continue;
        assert.ok(Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] <= p[1] && p[1] > 0, `${a.id}: ${p}`);
      }
    }
  });
});

describe("recording wins", () => {
  test("board-count milestones unlock at exactly 1, 10, 25, 50 and 100", () => {
    let s = emptyStats();
    for (let n = 1; n <= 100; n++) {
      s = applyWin(s, win());
      const e = earned(s);
      for (const goal of [1, 10, 25, 50, 100]) assert.equal(e.has(`clears-${goal}`), n >= goal, `${n} boards, clears-${goal}`);
    }
    assert.deepEqual(progressOf(achievementById("clears-25"), s), [25, 25]);
  });

  test("a first clear on each difficulty earns its trophy; all four earn Full Migration", () => {
    let s = emptyStats();
    DIFFICULTIES.forEach((d, i) => {
      s = applyWin(s, win({ difficultyId: d.id, layoutId: d.layout }));
      const e = earned(s);
      assert.ok(e.has(`first-${d.id}`));
      assert.equal(e.has("first-all"), i === DIFFICULTIES.length - 1);
      assert.deepEqual(progressOf(achievementById("first-all"), s), [i + 1, DIFFICULTIES.length]);
    });
  });

  test("speed trophies need strictly under the goal time, per difficulty", () => {
    for (const d of DIFFICULTIES) {
      const goal = SPEED_GOALS[d.id];
      assert.ok(!earned(applyWin(emptyStats(), win({ difficultyId: d.id, seconds: goal }))).has(`speed-${d.id}`), `${d.id} at ${goal}s`);
      const fast = applyWin(emptyStats(), win({ difficultyId: d.id, seconds: goal - 1 }));
      assert.ok(earned(fast).has(`speed-${d.id}`), `${d.id} at ${goal - 1}s`);
      // …and only that difficulty's.
      assert.equal(ACHIEVEMENTS.filter((a) => a.category === "speed" && earned(fast).has(a.id)).length, 1);
    }
    let s = applyWin(emptyStats(), win({ seconds: 90 }));
    s = applyWin(s, win({ seconds: 45 }));
    s = applyWin(s, win({ seconds: 70 }));
    assert.equal(s.fastest.easy, 45, "fastest keeps the best time");
  });

  test("time of day: Night Owl 00:00–04:59, Early Bird 05:00–07:59, nothing otherwise", () => {
    for (let hour = 0; hour < 24; hour++) {
      const e = earned(applyWin(emptyStats(), win({ hour })));
      assert.equal(e.has("night-owl"), hour < 5, `hour ${hour}`);
      assert.equal(e.has("early-bird"), hour >= 5 && hour < 8, `hour ${hour}`);
    }
  });

  test("flawless needs one sitting with no mismatch, hint, undo, shuffle or restart", () => {
    const clean = { hintsUsed: 0, mismatches: 0, undos: 0, shuffles: 0, restarts: 0, continued: false };
    assert.ok(earned(applyWin(emptyStats(), win(clean))).has("flawless"));
    for (const [k, v] of [["hintsUsed", 1], ["mismatches", 1], ["undos", 1], ["shuffles", 1], ["restarts", 1], ["continued", true]]) {
      assert.ok(!earned(applyWin(emptyStats(), win({ ...clean, [k]: v }))).has("flawless"), k);
    }
    assert.ok(!earned(applyWin(emptyStats(), win(clean))).has("flawless-expert"), "Easy doesn't count for Eagle Eye");
    for (const id of ["hard", "expert"]) assert.ok(earned(applyWin(emptyStats(), win({ ...clean, difficultyId: id }))).has("flawless-expert"), id);
    assert.ok(!earned(applyWin(emptyStats(), win({ ...clean, difficultyId: "medium" }))).has("flawless-expert"));
  });

  test("Sharp Eyes counts hint-free clears; Nest Egg a continued clear; Gobble a turkey finish", () => {
    let s = emptyStats();
    for (let i = 0; i < 9; i++) s = applyWin(s, win({ hintsUsed: 0 }));
    s = applyWin(s, win({ hintsUsed: 3 }));
    assert.ok(!earned(s).has("no-hints-10"));
    s = applyWin(s, win({ hintsUsed: 0 }));
    assert.ok(earned(s).has("no-hints-10"));
    assert.ok(earned(applyWin(emptyStats(), win({ continued: true }))).has("nest-egg"));
    assert.ok(earned(applyWin(emptyStats(), win({ lastBird: "wild-turkey" }))).has("gobble"));
    assert.ok(!earned(applyWin(emptyStats(), win({ lastBird: "canada-goose" }))).has("gobble"));
  });

  test("playing real boards: Life List and Habitat Hopper fill up from the birds and layouts cleared", () => {
    let s = emptyStats();
    let seed = 1;
    for (const d of DIFFICULTIES) {
      for (const layoutId of d.layouts) {
        let g = createGame(layoutId, { seed: seed++, birdPool: d.birdPool ?? undefined });
        const birds = [...new Set(g.birds)];
        let last = null;
        for (const [a, b] of g.solution) { last = g.birds[a]; g = removePair(g, a, b); }
        const before = s.layouts.length;
        s = applyWin(s, win({ difficultyId: d.id, layoutId, pairs: g.birds.length / 2, birds, lastBird: last }));
        assert.equal(s.layouts.length, before + 1);
        assert.equal(earned(s).has("habitats"), s.layouts.length === LAYOUT_IDS.length);
      }
    }
    assert.deepEqual([...s.layouts].sort(), [...LAYOUT_IDS].sort());
    assert.ok(earned(s).has("habitats") && earned(s).has("life-list"), "Expert boards use all 20 birds");
    assert.equal(s.pairsCleared, DIFFICULTIES.reduce((n, d) => n + d.layouts.length * d.tiles / 2, 0));
  });

  test("junk in a win never corrupts the stats", () => {
    const s = applyWin(emptyStats(), { difficultyId: "insane", layoutId: "swamp", seconds: -5, pairs: "lots", birds: ["dodo", "osprey", "osprey"], hour: 99 });
    assert.equal(s.boardsCleared, 1);
    assert.equal(s.pairsCleared, 0);
    assert.deepEqual(s.layouts, []);
    assert.deepEqual(s.species, ["osprey"]);
    assert.ok(Object.values(s.clears).every((n) => n === 0));
    assert.equal(s.nightOwlClears + s.earlyBirdClears, 0);
  });
});

describe("board tracker", () => {
  test("mismatches, blocked taps, undos and hints are per-board counts, kept as maxima", () => {
    const t = createBoardTracker();
    let s = emptyStats();
    for (let i = 0; i < 9; i++) t.on("mismatch", { a: "osprey", b: "bald-eagle" });
    s = applyBoard(s, t.counters());
    assert.ok(!earned(s).has("birdbrain"));
    t.on("mismatch", { a: "osprey", b: "bald-eagle" });
    s = applyBoard(s, t.counters());
    assert.ok(earned(s).has("birdbrain"));
    // A new board starts from zero, and the all-time best stays.
    t.reset();
    t.on("mismatch", {});
    s = applyBoard(s, t.counters());
    assert.equal(s.maxMismatches, 10);

    for (let i = 0; i < 15; i++) t.on("blocked");
    for (let i = 0; i < 10; i++) t.on("undo");
    for (let i = 0; i < 10; i++) t.on("hint");
    s = applyBoard(s, t.counters());
    for (const id of ["woodpecker", "second-thoughts", "binoculars"]) assert.ok(earned(s).has(id), id);
  });

  test("a continued board starts from its saved mismatch and hint counts", () => {
    const t = createBoardTracker();
    t.reset({ mismatches: 8, hints: 9 });
    t.on("mismatch", {}); t.on("mismatch", {}); t.on("hint");
    const s = applyBoard(emptyStats(), t.counters());
    assert.ok(earned(s).has("birdbrain") && earned(s).has("binoculars"));
  });

  test("Crow or Raven? is only a crow tried against a raven (either way round)", () => {
    const t = createBoardTracker();
    t.on("mismatch", { a: "american-crow", b: "wild-turkey" });
    t.on("mismatch", { a: "common-raven", b: "great-horned-owl" });
    assert.ok(!earned(applyBoard(emptyStats(), t.counters())).has("crow-raven"));
    t.on("mismatch", { a: "common-raven", b: "american-crow" });
    assert.ok(earned(applyBoard(emptyStats(), t.counters())).has("crow-raven"));
  });

  test(`Quick Wings: ${BURST_PAIRS} pairs within ${BURST_WINDOW}s of board time`, () => {
    const run = (times, between = () => {}) => {
      const t = createBoardTracker();
      times.forEach((sec, i) => { t.on("match", { seconds: sec, streak: i + 1 }); between(t, i); });
      return applyBoard(emptyStats(), t.counters());
    };
    assert.ok(earned(run([0, 2, 4, 6, 10])).has("quick-wings"), "exactly 10s apart counts");
    assert.ok(!earned(run([0, 2, 4, 6, 10.5])).has("quick-wings"), "10.5s is too slow");
    assert.ok(earned(run([0, 30, 31, 32, 33, 34])).has("quick-wings"), "a later burst counts");
    assert.equal(run([0, 1, 2]).bestBurst, 3);
    // Undoing a pair takes it out of the burst.
    const undone = run([0, 1, 2, 3, 4], (t, i) => { if (i === 3) t.on("undo"); });
    assert.equal(undone.bestBurst, 4);
    assert.equal(run([0, 1, 2, 3, 4, 5, 6]).bestStreak, 7, "streak comes along with matches");
  });

  test("shuffles and restarts are handed over once, not every time counters are read", () => {
    const t = createBoardTracker();
    t.on("shuffle"); t.on("restart");
    let s = applyBoard(emptyStats(), t.counters());
    s = applyBoard(s, t.counters());
    assert.equal(s.shufflesUsed, 1);
    assert.equal(s.restartsUsed, 1);
    assert.ok(earned(s).has("ruffled") && earned(s).has("back-to-nest"));
  });
});

describe("the store", () => {
  test("stats and earned achievements persist, each earned once with its first time", () => {
    const storage = memoryStorage();
    let clock = 1000;
    const a = createPlayerStats(storage, { now: () => clock });
    const first = a.recordWin(win());
    assert.deepEqual(first.map((x) => x.id), ["clears-1", "first-easy"]);
    clock = 5000;
    assert.deepEqual(a.recordWin(win()).map((x) => x.id), [], "nothing new the second time");
    const b = createPlayerStats(storage, { now: () => 9999 });
    assert.equal(b.stats().boardsCleared, 2);
    assert.deepEqual(b.unlocked(), { "clears-1": 1000, "first-easy": 1000 });
  });

  test("recordBoard unlocks mid-game achievements as they happen", () => {
    const store = createPlayerStats(memoryStorage());
    const t = createBoardTracker();
    t.on("mismatch", { a: "american-crow", b: "common-raven" });
    assert.deepEqual(store.recordBoard(t.counters()).map((x) => x.id), ["crow-raven"]);
    assert.deepEqual(store.recordBoard(t.counters()).map((x) => x.id), []);
  });

  test("earlier clears (best scores) are credited once, the first time", () => {
    const storage = memoryStorage();
    const bests = createBestScores(storage);
    bests.record("easy", { score: 1000, seconds: 50 });
    bests.record("easy", { score: 900, seconds: 80 });
    bests.record("hard", { score: 3000, seconds: 400 });
    const store = createPlayerStats(storage, { bests });
    const s = store.stats();
    assert.equal(s.boardsCleared, 3);
    assert.deepEqual([s.clears.easy, s.clears.hard, s.fastest.easy, s.fastest.hard], [2, 1, 50, 400]);
    const ids = store.sync().map((x) => x.id).sort();
    assert.deepEqual(ids, ["clears-1", "first-easy", "first-hard", "speed-easy"]);
    // Seeding never happens again (a new record isn't re-seeded from bests).
    bests.record("medium", { score: 10, seconds: 999 });
    assert.equal(createPlayerStats(storage, { bests }).stats().clears.medium, 0);
    assert.deepEqual(statsFromBests({ easy: { games: 0, bestTime: 12 } }).fastest.easy, null);
  });

  test("junk and hostile storage never break anything", () => {
    for (const junk of ["{oops", "null", "[]", "42", '{"boardsCleared":-3,"clears":{"easy":"x"},"species":["dodo"],"layouts":5}']) {
      const storage = memoryStorage();
      storage.setItem(STATS_KEY, junk);
      storage.setItem(ACHIEVEMENTS_KEY, '{"clears-1":"yesterday","nope":5}');
      const store = createPlayerStats(storage);
      assert.deepEqual(store.stats(), emptyStats(), junk);
      assert.deepEqual(store.unlocked(), {});
      assert.deepEqual(store.recordWin(win()).map((x) => x.id), ["clears-1", "first-easy"], junk);
    }
    const hostile = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
      removeItem() { throw new Error("SecurityError"); },
    };
    const store = createPlayerStats(hostile);
    assert.equal(store.recordWin(win()).length, 2);
    assert.equal(store.stats().boardsCleared, 1, "kept for the session");
  });

  test("earned achievements survive the stats being lost", () => {
    const storage = memoryStorage();
    createPlayerStats(storage, { now: () => 7 }).recordWin(win());
    storage.setItem(STATS_KEY, "{broken");
    const store = createPlayerStats(storage);
    assert.equal(store.stats().boardsCleared, 0);
    assert.deepEqual(store.unlocked(), { "clears-1": 7, "first-easy": 7 });
  });

  test("sanitizeStats keeps only known layouts and birds, once each", () => {
    const s = sanitizeStats({ layouts: ["pond", "pond", "swamp"], species: ["osprey", 3, "osprey"], fastest: { easy: 12.9 } });
    assert.deepEqual(s.layouts, ["pond"]);
    assert.deepEqual(s.species, ["osprey"]);
    assert.equal(s.fastest.easy, 12);
  });
});

test("texts read naturally: 'an Easy', 'a Medium', 'an Expert'", () => {
  assert.equal(achievementById("first-easy").text, "Clear an Easy board.");
  assert.equal(achievementById("first-medium").text, "Clear a Medium board.");
  assert.equal(achievementById("speed-expert").text, "Clear an Expert board in under 5:00.");
  assert.equal(achievementById("speed-hard").text, "Clear a Hard board in under 3:30.");
});
