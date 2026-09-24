import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES } from "../js/config.js";
import {
  createGame, findMatches, isWon, recoveryFor, removePair, restartBoard, selectTile,
  shuffleRemaining, tileIsFree, undo, useHint,
} from "../js/game/game.js";
import { deserializeGame, serializeGame, tryDeserializeGame } from "../js/game/save-format.js";
import { createRng } from "../js/game/rng.js";
import { createSavedGame, SAVE_KEY } from "../js/saved-game.js";
import { BIRD_IDS } from "../js/game/birds.js";
import { createBestScores } from "../js/best-scores.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from "../js/settings.js";
import { memoryStorage, openStorage } from "../js/storage.js";

const [EASY, MEDIUM, HARD] = DIFFICULTIES;
const newGame = (d, seed, extra = {}) => createGame(d.layout, { seed, birdPool: d.birdPool ?? undefined, ...extra });

/** Save to JSON text and read it back, exactly as the browser would. */
const roundTrip = (state) => deserializeGame(JSON.parse(JSON.stringify(serializeGame(state))));

function playRandom(state, steps, rng) {
  for (let i = 0; i < steps; i++) {
    const m = findMatches(state);
    if (!m.length) break;
    state = removePair(state, ...m[Math.floor(rng() * m.length)]);
  }
  return state;
}

function mismatch(state) {
  const free = state.birds.map((_, i) => i).filter((i) => tileIsFree(state, i));
  const x = free[0];
  const y = free.find((i) => state.birds[i] !== state.birds[x]);
  return y === undefined ? state : selectTile(selectTile(state, x).state, y).state;
}

/** Finish by hints, then undo everything; returns a trace to compare runs. */
function trace(state) {
  const steps = [];
  let s = state;
  for (let guard = 0; guard < 100 && !isWon(s); guard++) {
    const { state: hinted, pair } = useHint(s);
    if (!pair) break;
    s = removePair(hinted, ...pair);
    steps.push([pair.join(), s.score, s.streak]);
  }
  while (s.history.length) {
    s = undo(s);
    steps.push(["undo", s.score, s.streak, s.bestStreak]);
  }
  return steps;
}

/** A variety of reachable states on every difficulty. */
function sampleStates() {
  const out = [];
  for (const d of DIFFICULTIES) {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = createRng(seed * 11);
      const fresh = newGame(d, seed, { streakBonus: seed % 2 === 0 });
      out.push(["fresh", fresh]);
      let s = playRandom(fresh, 4, rng);
      s = mismatch(s);
      out.push(["mid-play with a selection", s]);
      out.push(["after undo", undo(undo(s))]);
      const end = playRandom(s, 99, rng);
      if (!isWon(end)) {
        out.push([`stuck (${recoveryFor(end)})`, end]);
        const shuffled = shuffleRemaining(end, seed);
        if (shuffled !== end) out.push(["after shuffle", shuffled]);
        out.push(["after restart", restartBoard(end)]);
      }
    }
  }
  return out;
}

describe("save format", () => {
  const samples = sampleStates();

  test("covers the interesting states", () => {
    const kinds = new Set(samples.map(([k]) => k));
    for (const k of ["fresh", "mid-play with a selection", "after undo", "stuck (shuffle)", "stuck (restart)", "after shuffle", "after restart"]) {
      assert.ok(kinds.has(k), `missing ${k}`);
    }
  });

  test("every state survives a JSON round trip exactly", () => {
    for (const [kind, s] of samples) assert.deepEqual(roundTrip(s), s, kind);
  });

  test("a restored state plays on exactly like the original (hints to the end, then undo all)", () => {
    for (const [kind, s] of samples) {
      assert.deepEqual(trace(roundTrip(s)), trace(s), kind);
    }
  });

  test("restored selection and undo history work", () => {
    let s = newGame(MEDIUM, 4);
    s = removePair(s, ...s.solution[0]);
    s = removePair(s, ...s.solution[1]);
    const [a, b] = s.solution[2];
    s = selectTile(s, a).state;
    const restored = roundTrip(s);
    assert.equal(restored.selected, a);
    assert.equal(selectTile(restored, b).result, "matched", "the saved selection completes a match");
    const undone = undo(restored);
    assert.equal(undone.score, 100);
    assert.equal(undone.history.length, 1);
  });

  test("a won board round-trips too (the store just refuses to keep it)", () => {
    let s = newGame(EASY, 3);
    for (const p of s.solution) s = removePair(s, ...p);
    assert.equal(isWon(roundTrip(s)), true);
  });

  // Each tamper takes a valid saved game and breaks one invariant.
  const base = () => {
    let s = newGame(HARD, 9);
    for (const p of s.solution.slice(0, 6)) s = removePair(s, ...p);
    s = undo(s);
    return JSON.parse(JSON.stringify(serializeGame(s)));
  };
  const firstPresent = (d) => d.removed.indexOf(false);
  const tampers = {
    "unknown layout": (d) => { d.layoutId = "swamp"; },
    "short birds": (d) => { d.birds.pop(); },
    "unknown bird": (d) => { d.birds[0] = "dodo"; },
    "wrong bird count": (d) => { const i = d.birds.findIndex((b) => b !== d.birds[0]); d.birds[i] = d.birds[0]; },
    "birds differ from the deal": (d) => {
      // Swap one bird for another that isn't in play: counts stay at 4 each,
      // but the birds no longer match the deal.
      const unused = BIRD_IDS.find((b) => !d.birds.includes(b));
      const gone = d.birds[firstPresent(d)];
      d.birds = d.birds.map((b) => (b === gone ? unused : b));
    },
    "removed tile not in history": (d) => { d.removed[firstPresent(d)] = true; },
    "history tile not removed": (d) => { d.removed[d.history[0][0]] = false; },
    "history pair of different birds": (d) => { const [a] = d.history[0]; const j = d.birds.findIndex((b) => b !== d.birds[a]); [d.birds[a], d.birds[j]] = [d.birds[j], d.birds[a]]; },
    "score not the sum of gains": (d) => { d.score += 1; },
    "gains missing": (d) => { d.gains.pop(); },
    "negative counter": (d) => { d.hintsUsed = -1; },
    "fractional score": (d) => { d.score = 0.5; },
    "moves disagree with history": (d) => { d.moves += 1; },
    "streak above best streak": (d) => { d.streak = d.bestStreak + 1; },
    "selected a removed tile": (d) => { d.selected = d.history[0][0]; },
    "selected a blocked tile": (d) => {
      const s = deserializeGame(d);
      d.selected = s.birds.findIndex((_, i) => !s.removed[i] && !tileIsFree(s, i));
    },
    "streakBonus not boolean": (d) => { d.streakBonus = "yes"; },
    "seed missing": (d) => { delete d.seed; },
    "duplicate tile in history": (d) => { d.history[1][0] = d.history[0][0]; },
    "illegal initial solution": (d) => { d.initialSolution.reverse(); },
    "incomplete initial solution": (d) => { d.initialSolution.pop(); },
    "removed is not booleans": (d) => { d.removed = d.removed.map((r) => (r ? 1 : 0)); },
  };

  test("the untampered base is valid", () => {
    assert.ok(tryDeserializeGame(base()));
  });

  for (const [name, tamper] of Object.entries(tampers)) {
    test(`rejects a save with: ${name}`, () => {
      const data = base();
      tamper(data);
      assert.equal(tryDeserializeGame(data), null);
      assert.throws(() => deserializeGame(data));
    });
  }

  test("rejects non-objects", () => {
    for (const junk of [null, undefined, 42, "save", [], true]) assert.equal(tryDeserializeGame(junk), null);
  });
});

describe("saved game store", () => {
  const midGame = () => {
    let s = newGame(MEDIUM, 21);
    for (const p of s.solution.slice(0, 5)) s = removePair(s, ...p);
    return undo(s);
  };

  test("saves and restores board, difficulty and elapsed time", () => {
    const storage = memoryStorage();
    const store = createSavedGame(storage);
    const state = midGame();
    assert.equal(store.save({ difficultyId: "medium", state, elapsedMs: 123456.7, now: 1000 }), true);
    const loaded = createSavedGame(storage).load(); // a fresh page load
    assert.equal(loaded.difficultyId, "medium");
    assert.equal(loaded.elapsedMs, 123457);
    assert.equal(loaded.savedAt, 1000);
    assert.deepEqual(loaded.state, state);
  });

  test("a won board is never saved, and saving one clears the old save", () => {
    const storage = memoryStorage();
    const store = createSavedGame(storage);
    store.save({ difficultyId: "medium", state: midGame(), elapsedMs: 5 });
    let won = newGame(MEDIUM, 21);
    for (const p of won.solution) won = removePair(won, ...p);
    assert.equal(store.save({ difficultyId: "medium", state: won, elapsedMs: 9 }), false);
    assert.equal(storage.getItem(SAVE_KEY), null);
    assert.equal(store.load(), null);
  });

  const envelope = () => {
    const storage = memoryStorage();
    createSavedGame(storage).save({ difficultyId: "medium", state: midGame(), elapsedMs: 5000 });
    return JSON.parse(storage.getItem(SAVE_KEY));
  };
  const broken = {
    "not JSON": () => "{oops",
    "empty string": () => "",
    "JSON null": () => "null",
    "wrong version": () => JSON.stringify({ ...envelope(), version: 99 }),
    "unknown difficulty": () => JSON.stringify({ ...envelope(), difficultyId: "insane" }),
    "difficulty/layout mismatch": () => JSON.stringify({ ...envelope(), difficultyId: "easy" }),
    "negative elapsed time": () => JSON.stringify({ ...envelope(), elapsedMs: -1 }),
    "absurd elapsed time": () => JSON.stringify({ ...envelope(), elapsedMs: 1e15 }),
    "elapsed time not a number": () => JSON.stringify({ ...envelope(), elapsedMs: "5s" }),
    "corrupt game": () => { const e = envelope(); e.game.score += 100; return JSON.stringify(e); },
    "game missing": () => { const e = envelope(); delete e.game; return JSON.stringify(e); },
  };
  for (const [name, make] of Object.entries(broken)) {
    test(`a save that is ${name} is discarded`, () => {
      const storage = memoryStorage();
      storage.setItem(SAVE_KEY, make());
      assert.equal(createSavedGame(storage).load(), null);
      assert.equal(storage.getItem(SAVE_KEY), null, "removed so it isn't offered again");
    });
  }

  test("storage that throws on every call: nothing breaks", () => {
    const hostile = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
      removeItem() { throw new Error("SecurityError"); },
    };
    const { persistent } = openStorage(hostile);
    assert.equal(persistent, false);
    const store = createSavedGame(hostile);
    assert.equal(store.save({ difficultyId: "medium", state: midGame(), elapsedMs: 1 }), true, "falls back to memory");
    assert.ok(store.load(), "works for the session");
  });

  test("storage that reads fine but rejects writes (quota): save reports failure, no throw", () => {
    const quota = memoryStorage();
    quota.setItem = () => { throw new Error("QuotaExceededError"); };
    // The probe write fails, so this is treated as unavailable → memory.
    assert.equal(openStorage(quota).persistent, false);
    const store = createSavedGame(quota);
    store.save({ difficultyId: "medium", state: midGame(), elapsedMs: 1 });
    assert.ok(store.load());
  });

  test("writes that start failing later are swallowed", () => {
    const real = memoryStorage();
    const flaky = { ...real, setItem: (k, v) => real.setItem(k, v) };
    const store = createSavedGame(flaky);
    flaky.setItem = () => { throw new Error("QuotaExceededError"); }; // storage fills up mid-session
    assert.equal(store.save({ difficultyId: "medium", state: midGame(), elapsedMs: 1 }), false);
  });
});

describe("settings and bests with bad storage", () => {
  test("settings: missing, corrupt or partial data falls back field by field", () => {
    const { storage } = openStorage(memoryStorage());
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, "{broken");
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, JSON.stringify({ motion: "sideways", tileLabels: true, streakBonus: "no" }));
    assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS, tileLabels: true });
    storage.setItem(SETTINGS_KEY, "[1,2]");
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  });

  test("settings round-trip", () => {
    const { storage } = openStorage(memoryStorage());
    const custom = { motion: "reduce", backgroundBirds: false, tileLabels: true, streakBonus: false };
    saveSettings(custom, storage);
    assert.deepEqual(loadSettings(storage), custom);
  });

  test("bests count games completed per difficulty and ignore junk entries", () => {
    const raw = memoryStorage();
    raw.setItem("inspireBirdMahjong:v1:bests", JSON.stringify({ easy: "junk", hard: { score: 900, bestTime: 50, games: 2 } }));
    const bests = createBestScores(raw);
    assert.equal(bests.get("easy"), null);
    bests.record("easy", { score: 1200, seconds: 70 });
    bests.record("easy", { score: 1100, seconds: 60 });
    bests.record("hard", { score: 3000, seconds: 300 });
    assert.deepEqual(bests.get("easy"), { score: 1200, bestTime: 60, games: 2 });
    assert.deepEqual(bests.get("hard"), { score: 3000, bestTime: 50, games: 3 });
    assert.equal(bests.get("medium"), null);
  });
});
