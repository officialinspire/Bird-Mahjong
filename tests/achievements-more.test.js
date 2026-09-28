// The second wave of achievements: daily habits, skill, timing, birds.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ACHIEVEMENTS, BIG_BURST_PAIRS, ELITE_SPEED_GOALS, FAMILIES, FRENZY_MS, achievementById, earnedIds, familyPairs, progressOf,
} from "../js/achievements.js";
import {
  STATS_KEY, applyBoard, applyWin, createBoardTracker, createPlayerStats, currentDayStreak, emptyStats, localDay,
  previousDay, sanitizeStats,
} from "../js/player-stats.js";
import { DIFFICULTIES } from "../js/config.js";
import { BIRD_IDS } from "../js/game/birds.js";
import { createGame, removePair } from "../js/game/game.js";
import { maxScore } from "../js/game/score.js";
import { memoryStorage } from "../js/storage.js";

const win = (extra = {}) => ({
  difficultyId: "easy", layoutId: "meadow", seconds: 300, pairs: 12, score: 1200, bestStreak: 3, hintsUsed: 1,
  shuffles: 0, mismatches: 2, restarts: 0, undos: 1, continued: false,
  birds: ["northern-cardinal"], lastBird: "black-capped-chickadee", hour: 15, ...extra,
});
const has = (stats, id) => earnedIds(stats).includes(id);
const wins = (list, start = emptyStats()) => list.reduce((s, w) => applyWin(s, win(w)), start);

/** Consecutive calendar days from `start` ("YYYY-MM-DD"), n of them. */
function days(start, n) {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

test("48 new achievements, in four new groups plus the existing ones", () => {
  assert.equal(ACHIEVEMENTS.length, 83);
  for (const id of ["daily", "skill", "timing", "birds"]) assert.ok(ACHIEVEMENTS.filter((a) => a.category === id).length >= 7, id);
});

describe("calendar helpers", () => {
  test("previousDay crosses months, years, leap days and DST changes", () => {
    const cases = {
      "2026-03-01": "2026-02-28", "2028-03-01": "2028-02-29", "2027-01-01": "2026-12-31", "2026-05-01": "2026-04-30",
      "2026-03-09": "2026-03-08", "2026-11-02": "2026-11-01", "2026-03-30": "2026-03-29", "2026-10-26": "2026-10-25",
    };
    for (const [day, before] of Object.entries(cases)) assert.equal(previousDay(day), before, day);
  });

  test("localDay pads months and days", () => {
    assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(localDay(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
  });
});

describe("daily habits", () => {
  test("streaks count consecutive days, across month and year ends", () => {
    let s = emptyStats();
    const run = days("2026-12-20", 30); // crosses into 2027
    run.forEach((date, i) => {
      s = applyWin(s, win({ date }));
      assert.equal(s.dayStreak, i + 1, date);
      for (const [id, goal] of [["streak-3", 3], ["streak-7", 7], ["streak-14", 14], ["streak-30", 30]]) {
        assert.equal(has(s, id), i + 1 >= goal, `${id} on day ${i + 1}`);
      }
    });
    assert.equal(s.daysPlayed, 30);
    assert.ok(has(s, "days-30") && has(s, "days-2"));
  });

  test("more clears on the same day don't extend the streak; a missed day restarts it; the best is kept", () => {
    let s = wins([{ date: "2026-05-01" }, { date: "2026-05-01" }, { date: "2026-05-02" }, { date: "2026-05-03" }]);
    assert.deepEqual([s.dayStreak, s.daysPlayed, s.bestDayStreak], [3, 3, 3]);
    s = applyWin(s, win({ date: "2026-05-05" })); // skipped the 4th
    assert.deepEqual([s.dayStreak, s.bestDayStreak, s.daysPlayed], [1, 3, 4]);
    assert.deepEqual(progressOf(achievementById("streak-7"), s), [3, 7], "progress shows the best run");
  });

  test("the current streak is alive today and yesterday, broken after that", () => {
    const s = wins([{ date: "2026-06-10" }, { date: "2026-06-11" }]);
    assert.equal(currentDayStreak(s, "2026-06-11"), 2);
    assert.equal(currentDayStreak(s, "2026-06-12"), 2);
    assert.equal(currentDayStreak(s, "2026-06-13"), 0);
    assert.equal(currentDayStreak(emptyStats(), "2026-06-13"), 0);
  });

  test("Big Day and Twitchathon count clears in one calendar day", () => {
    let s = emptyStats();
    for (let i = 1; i <= 10; i++) {
      s = applyWin(s, win({ date: "2026-07-04" }));
      assert.equal(has(s, "big-day"), i >= 5, `${i} clears`);
      assert.equal(has(s, "twitchathon"), i >= 10, `${i} clears`);
    }
    s = applyWin(s, win({ date: "2026-07-05" }));
    assert.deepEqual([s.dayClears, s.bestDayClears], [1, 10]);
  });

  test("Seven Songs needs every weekday; Weekend Birder only Saturday or Sunday", () => {
    let s = emptyStats();
    for (const weekday of [1, 2, 3, 4, 5]) s = applyWin(s, win({ weekday }));
    assert.ok(!has(s, "weekend") && !has(s, "week-all"));
    s = applyWin(s, win({ weekday: 6 }));
    assert.ok(has(s, "weekend") && !has(s, "week-all"));
    s = applyWin(s, win({ weekday: 0 }));
    assert.ok(has(s, "week-all"));
    assert.ok(has(applyWin(emptyStats(), win({ weekday: 0 })), "weekend"));
  });

  test(`Feeding Frenzy: 3 boards within ${FRENZY_MS / 60000} minutes, exactly`, () => {
    const at = (ms) => ({ at: 1_700_000_000_000 + ms });
    assert.ok(has(wins([at(0), at(7 * 60000), at(FRENZY_MS)]), "frenzy"), "15:00 counts");
    assert.ok(!has(wins([at(0), at(7 * 60000), at(FRENZY_MS + 1)]), "frenzy"), "15:00.001 doesn't");
    assert.ok(has(wins([at(0), at(40 * 60000), at(45 * 60000), at(50 * 60000)]), "frenzy"), "a later window counts");
    const s = wins([at(0), at(1), at(2), at(3), at(4)]);
    assert.equal(s.frenzies, 1, "a frenzy needs three fresh boards after the last one");
  });

  test("junk dates and weekdays are ignored", () => {
    const s = wins([{ date: "2026-13-45", weekday: 9 }, { date: "yesterday", weekday: -1 }, { date: 20260101, weekday: 2.5 }]);
    assert.deepEqual([s.daysPlayed, s.dayStreak, s.lastDay, s.weekdays.length], [0, 0, "", 0]);
    assert.equal(s.boardsCleared, 3);
  });
});

describe("skillful play", () => {
  test("streak thresholds ×20 and ×40", () => {
    assert.ok(!has(wins([{ bestStreak: 19 }]), "streak-20"));
    assert.ok(has(wins([{ bestStreak: 20 }]), "streak-20"));
    assert.ok(!has(wins([{ bestStreak: 39 }]), "streak-40"));
    assert.ok(has(wins([{ bestStreak: 40 }]), "streak-40"));
  });

  test("a real flawless Expert board earns Perfect Forty, High Flyer and Field Guide Free", () => {
    const d = DIFFICULTIES.find((x) => x.id === "expert");
    let g = createGame(d.layout, { seed: 7 });
    let last = null;
    for (const [a, b] of g.solution) { last = g.birds[a]; g = removePair(g, a, b); }
    assert.equal(g.bestStreak, 40);
    assert.equal(g.score, maxScore(40));
    const s = applyWin(emptyStats(), win({
      difficultyId: "expert", layoutId: d.layout, pairs: 40, score: g.score, bestStreak: g.bestStreak,
      hintsUsed: 0, mismatches: 0, undos: 0, birds: [...new Set(g.birds)], lastBird: last,
    }));
    for (const id of ["streak-40", "streak-20", "high-flyer", "no-hint-expert", "flawless-expert", "flawless"]) assert.ok(has(s, id), id);
    // Hard's best possible score can't reach High Flyer: it's an Expert feat.
    assert.ok(maxScore(30) < 5000);
  });

  test("Field Guide Free only counts Expert; No Regrets and Steady Hands need 10 clean clears", () => {
    assert.ok(!has(wins([{ difficultyId: "hard", hintsUsed: 0 }]), "no-hint-expert"));
    let s = emptyStats();
    for (let i = 0; i < 9; i++) s = applyWin(s, win({ undos: 0, mismatches: 0 }));
    s = applyWin(s, win({ undos: 1, mismatches: 1 }));
    assert.ok(!has(s, "no-regrets") && !has(s, "steady-hands"));
    s = applyWin(s, win({ undos: 0, mismatches: 0 }));
    assert.ok(has(s, "no-regrets") && has(s, "steady-hands"));
  });

  test("Five Clean Flights and Immaculate Migration (a flawless clear on every difficulty)", () => {
    const clean = { hintsUsed: 0, mismatches: 0, undos: 0 };
    let s = emptyStats();
    DIFFICULTIES.forEach((d, i) => {
      s = applyWin(s, win({ ...clean, difficultyId: d.id }));
      assert.equal(has(s, "flawless-all"), i === DIFFICULTIES.length - 1, d.id);
    });
    assert.ok(!has(s, "flawless-5"));
    s = applyWin(s, win(clean));
    assert.ok(has(s, "flawless-5"));
    // A hinted Expert clear doesn't fill the Expert slot.
    const partial = wins(["easy", "medium", "hard"].map((difficultyId) => ({ ...clean, difficultyId })).concat([{ difficultyId: "expert", hintsUsed: 1 }]));
    assert.ok(!has(partial, "flawless-all"));
  });

  test("High Flyer at 5,000 exactly; Point Collector at 50,000 in total", () => {
    assert.ok(!has(wins([{ score: 4999 }]), "high-flyer"));
    assert.ok(has(wins([{ score: 5000 }]), "high-flyer"));
    const s = wins(Array.from({ length: 10 }, () => ({ score: 5000 })));
    assert.ok(has(s, "points-50k"));
    assert.ok(!has(wins(Array.from({ length: 10 }, () => ({ score: 4999 }))), "points-50k"));
  });

  test("Comeback Kid needs a shuffle on the cleared board; Back from the Brink a restart", () => {
    assert.ok(!has(wins([{}]), "comeback") && !has(wins([{}]), "brink"));
    assert.ok(has(wins([{ shuffles: 2 }]), "comeback"));
    assert.ok(has(wins([{ restarts: 1 }]), "brink"));
  });
});

describe("speed and timing", () => {
  test("the faster speed tier, strictly under each goal", () => {
    for (const d of DIFFICULTIES) {
      const goal = ELITE_SPEED_GOALS[d.id];
      assert.ok(!has(wins([{ difficultyId: d.id, seconds: goal }]), `speed-${d.id}-elite`), `${d.id} at ${goal}`);
      const s = wins([{ difficultyId: d.id, seconds: goal - 1 }]);
      assert.ok(has(s, `speed-${d.id}-elite`) && has(s, `speed-${d.id}`), `${d.id} at ${goal - 1} earns both tiers`);
    }
  });

  test(`Hummingbird Hands: ${BIG_BURST_PAIRS} pairs within 10 seconds`, () => {
    const burst = (times) => {
      const t = createBoardTracker();
      times.forEach((sec) => t.on("match", { seconds: sec }));
      return applyBoard(emptyStats(), t.counters());
    };
    assert.ok(has(burst([0, 1, 2, 3, 4, 5, 6, 10]), "hummingbird-hands"));
    assert.ok(!has(burst([0, 1, 2, 3, 4, 5, 6, 10.5]), "hummingbird-hands"));
    assert.ok(has(burst([0, 1, 2, 3, 4, 5, 6, 10.5]), "quick-wings"));
  });

  test("Personal Best needs an earlier time to beat; Photo Finish is beating it by exactly one second", () => {
    let s = wins([{ seconds: 100 }]);
    assert.equal(s.personalBests, 0, "a first time isn't a personal best");
    s = applyWin(s, win({ seconds: 120 }));
    assert.equal(s.personalBests, 0, "slower isn't");
    s = applyWin(s, win({ seconds: 100 }));
    assert.equal(s.personalBests, 0, "equal isn't");
    s = applyWin(s, win({ seconds: 98 }));
    assert.ok(has(s, "personal-best") && !has(s, "photo-finish"), "2s faster: PB, not photo finish");
    s = applyWin(s, win({ seconds: 97 }));
    assert.ok(has(s, "photo-finish"));
    // Times are per difficulty.
    s = applyWin(s, win({ difficultyId: "hard", seconds: 50 }));
    assert.equal(s.personalBests, 2);
    let t = emptyStats();
    for (let secs = 200; secs >= 189; secs--) t = applyWin(t, win({ seconds: secs }));
    assert.equal(t.personalBests, 11);
    assert.ok(has(t, "pb-10"));
  });

  test("Slow and Steady at 20 minutes; Marathon Migration at 2 hours in total", () => {
    assert.ok(!has(wins([{ seconds: 1199 }]), "slow-steady"));
    assert.ok(has(wins([{ seconds: 1200 }]), "slow-steady"));
    const s = wins(Array.from({ length: 24 }, () => ({ seconds: 300 })));
    assert.ok(has(s, "marathon"));
    const almost = wins([...Array.from({ length: 23 }, () => ({ seconds: 300 })), { seconds: 299 }]);
    assert.ok(!has(almost, "marathon"));
    assert.deepEqual(progressOf(achievementById("marathon"), almost), [119, 120]);
  });

  test("every hour of the day lands in at most one time-of-day achievement", () => {
    const slots = { "night-owl": [0, 1, 2, 3, 4], "early-bird": [5, 6, 7], lunch: [12, 13], evening: [18, 19] };
    for (let hour = 0; hour < 24; hour++) {
      const e = earnedIds(wins([{ hour }]));
      for (const [id, hours] of Object.entries(slots)) assert.equal(e.includes(id), hours.includes(hour), `${id} at ${hour}:00`);
    }
  });
});

describe("bird specialist", () => {
  test("families use real birds, none in two families", () => {
    const all = Object.values(FAMILIES).flat();
    assert.ok(all.every((b) => BIRD_IDS.includes(b)));
    assert.equal(new Set(all).size, all.length);
  });

  test("finishing on each special bird earns its achievement, and only that one", () => {
    const finishes = {
      "bald-eagle": "finish-eagle", "barred-owl": "finish-owl", "great-horned-owl": "finish-owl", "canada-goose": "finish-goose",
      "ruby-throated-hummingbird": "finish-hummingbird", "northern-cardinal": "finish-cardinal", "wood-duck": "finish-duck",
      "wild-turkey": "gobble",
    };
    const finishIds = [...new Set(Object.values(finishes))];
    for (const bird of BIRD_IDS) {
      const e = earnedIds(wins([{ lastBird: bird }]));
      const want = finishes[bird];
      for (const id of finishIds) assert.equal(e.includes(id), id === want, `${bird} → ${id}`);
    }
  });

  test("Grand Finale Collector needs 10 different finishing birds", () => {
    let s = emptyStats();
    BIRD_IDS.slice(0, 10).forEach((lastBird, i) => {
      s = applyWin(s, win({ lastBird }));
      s = applyWin(s, win({ lastBird })); // repeats don't count twice
      assert.equal(has(s, "finale-10"), i === 9);
    });
  });

  test("family pairs: two pairs per species per cleared board", () => {
    let s = emptyStats();
    for (let i = 1; i <= 25; i++) {
      s = applyWin(s, win({ birds: ["barred-owl", "osprey"] }));
      assert.equal(familyPairs(s, "owls"), i * 2);
      assert.equal(has(s, "owl-prowl"), i * 2 >= 50, `${i} boards`);
    }
    s = wins(Array.from({ length: 13 }, () => ({ birds: FAMILIES.raptors })));
    assert.equal(familyPairs(s, "raptors"), 104);
    assert.ok(has(s, "raptors") && !has(s, "songbirds"));
  });

  test("real boards: family pairs match the birds actually cleared", () => {
    let s = emptyStats();
    let expected = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGame("old-growth", { seed });
      const birds = [...new Set(g.birds)];
      expected += g.birds.filter((b) => FAMILIES.songbirds.includes(b)).length / 2;
      s = applyWin(s, win({ difficultyId: "hard", birds }));
    }
    assert.equal(familyPairs(s, "songbirds"), expected);
  });

  test("Know Your Corvids: both on the board, never mixed up", () => {
    const both = ["american-crow", "common-raven", "osprey"];
    assert.ok(has(wins([{ birds: both, crowRavenMixups: 0 }]), "corvids"));
    assert.ok(!has(wins([{ birds: both, crowRavenMixups: 1 }]), "corvids"));
    assert.ok(!has(wins([{ birds: ["american-crow", "osprey"], crowRavenMixups: 0 }]), "corvids"));
    // The tracker counts mix-ups per board, and a new board starts at zero.
    const t = createBoardTracker();
    t.on("mismatch", { a: "common-raven", b: "american-crow" });
    t.on("mismatch", { a: "osprey", b: "american-crow" });
    assert.equal(t.crowRavenMixups, 1);
    t.reset();
    assert.equal(t.crowRavenMixups, 0);
  });
});

describe("just for fun", () => {
  test("Change of Heart: 10 deselects on one board", () => {
    const t = createBoardTracker();
    for (let i = 0; i < 9; i++) t.on("deselect");
    let s = applyBoard(emptyStats(), t.counters());
    assert.ok(!has(s, "change-of-heart"));
    t.on("deselect");
    s = applyBoard(s, t.counters());
    assert.ok(has(s, "change-of-heart"));
    t.reset();
    t.on("deselect");
    assert.equal(applyBoard(s, t.counters()).maxDeselects, 10, "the record is kept");
  });
});

describe("storage", () => {
  test("stats saved by the previous version load unchanged, with the new fields at zero", () => {
    const storage = memoryStorage();
    const old = {
      boardsCleared: 14, pairsCleared: 310, bestStreak: 9, noHintClears: 4, maxMismatches: 10, crowRaven: 1,
      clears: { easy: 9, medium: 4, hard: 1, expert: 0 }, fastest: { easy: 52, medium: 180, hard: 420, expert: null },
      layouts: ["meadow", "pond"], species: ["osprey"],
    };
    storage.setItem(STATS_KEY, JSON.stringify(old));
    storage.setItem("inspireBirdMahjong:v1:achievements", JSON.stringify({ "clears-10": 5, "crow-raven": 6 }));
    const store = createPlayerStats(storage);
    const s = store.stats();
    for (const [k, v] of Object.entries(old)) assert.deepEqual(s[k], v, k);
    assert.deepEqual([s.daysPlayed, s.dayStreak, s.lastDay, s.finishBirds.length, s.birdPairs.osprey], [0, 0, "", 0, 0]);
    assert.deepEqual(store.sync().map((a) => a.id).sort(), ["birdbrain", "clears-1", "first-easy", "first-hard", "first-medium", "pairs-250", "speed-easy"]);
    assert.equal(store.unlocked()["clears-10"], 5, "earlier unlocks keep their dates");
  });

  test("junk in the new fields is cleaned up", () => {
    const s = sanitizeStats({
      lastDay: "2026-02-30x", weekdays: [1, 1, 8, "2"], finishBirds: ["dodo", "osprey"], recentClears: [5, -1, "x", 6, 7, 8],
      birdPairs: { osprey: 4, dodo: 9, "wild-turkey": -2 }, noHintBy: { expert: "3" }, flawlessBy: { hard: 2 },
      totalSeconds: 1e12, dayStreak: 3.5,
    });
    assert.equal(s.lastDay, "");
    assert.deepEqual(s.weekdays, [1]);
    assert.deepEqual(s.finishBirds, ["osprey"]);
    assert.deepEqual(s.recentClears, [6, 7, 8]);
    assert.equal(s.birdPairs.osprey, 4);
    assert.equal(s.birdPairs["wild-turkey"], 0);
    assert.ok(!("dodo" in s.birdPairs));
    assert.deepEqual([s.noHintBy.expert, s.flawlessBy.hard, s.totalSeconds, s.dayStreak], [0, 2, 0, 0]);
  });

  test("a whole month of daily play through the store", () => {
    const storage = memoryStorage();
    let clock = 0;
    const store = createPlayerStats(storage, { now: () => clock });
    const got = [];
    days("2027-02-01", 30).forEach((date, i) => {
      clock = i + 1;
      got.push(...store.recordWin(win({ date, weekday: (i + 1) % 7 })).map((a) => [a.id, i + 1]));
    });
    const on = Object.fromEntries(got);
    assert.deepEqual([on["days-2"], on["streak-3"], on["streak-7"], on["week-all"], on["streak-14"], on["streak-30"], on["days-30"]], [2, 3, 7, 7, 14, 30, 30]);
    assert.equal(store.unlocked()["streak-30"], 30);
  });
});
