// Lifetime stats and earned achievements, kept in localStorage.
//
// Stored under two keys so a problem with one never costs the other:
//   STATS_KEY         the lifetime stats (shape: emptyStats() below)
//   ACHIEVEMENTS_KEY  { [achievementId]: timestamp first earned }
//
// Everything read back is sanitised field by field (junk falls back to 0 or
// empty), so hand-edited or half-written data can't break the game. Stats
// only ever grow. Earned achievements are kept even if the stats are later
// lost, and anything the stats have earned but isn't recorded yet (e.g. after
// seeding from older best scores) is recorded on the next update.
//
// Storage is injectable for tests; if it's unavailable, stats live for the
// session (see js/storage.js).

import { ACHIEVEMENTS, BURST_WINDOW, FRENZY_BOARDS, FRENZY_MS, earnedIds } from "./achievements.js";
import { DIFFICULTIES } from "./config.js";
import { BIRD_IDS } from "./game/birds.js";
import { LAYOUT_IDS } from "./game/geometry.js";
import { openStorage, readJson } from "./storage.js";

export const STATS_KEY = "inspireBirdMahjong:v1:stats";
export const ACHIEVEMENTS_KEY = "inspireBirdMahjong:v1:achievements";

const COUNTERS = [
  "boardsCleared", "pairsCleared", "bestStreak", "noHintClears", "flawlessClears", "flawlessBig",
  "continuedClears", "nightOwlClears", "earlyBirdClears", "turkeyFinishes",
  "shufflesUsed", "restartsUsed", "crowRaven",
  "maxMismatches", "maxBlockedTaps", "maxUndos", "maxHints", "bestBurst",
  // Daily habits
  "daysPlayed", "dayStreak", "bestDayStreak", "dayClears", "bestDayClears", "weekendClears", "frenzies",
  // Timing
  "totalSeconds", "longestClear", "lunchClears", "eveningClears", "personalBests", "photoFinishes",
  // Skill
  "noUndoClears", "noMismatchClears", "bestScore", "totalScore", "shuffleWins", "restartWins",
  // Birds and fun
  "corvidClears", "maxDeselects",
];
const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function emptyStats() {
  const stats = Object.fromEntries(COUNTERS.map((k) => [k, 0]));
  stats.clears = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, 0]));
  stats.fastest = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, null]));
  stats.noHintBy = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, 0]));
  stats.flawlessBy = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, 0]));
  stats.birdPairs = Object.fromEntries(BIRD_IDS.map((id) => [id, 0]));
  stats.layouts = [];
  stats.species = [];
  stats.finishBirds = [];  // birds that have taken a board's final pair
  stats.weekdays = [];     // 0 (Sunday) … 6 (Saturday) with a clear
  stats.recentClears = []; // timestamps of the last few clears (Feeding Frenzy)
  stats.lastDay = "";      // local date of the latest clear, "YYYY-MM-DD"
  return stats;
}

const count = (n) => (Number.isInteger(n) && n >= 0 && n < 1e9 ? n : 0);
const seconds = (n) => (Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.floor(n) : null);
const known = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((x) => allowed.includes(x)))] : []);
const counts = (src, keys) => Object.fromEntries(keys.map((k) => [k, count(src?.[k])]));
const validDay = (d) => typeof d === "string" && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** The calendar day before a "YYYY-MM-DD" date (UTC arithmetic, so no DST surprises). */
export function previousDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Local "YYYY-MM-DD" for a Date (the player's own calendar day). */
export function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The play streak as it stands on `today`: alive if the last clear was today
 * or yesterday, otherwise broken (0).
 */
export function currentDayStreak(stats, today) {
  if (!stats.lastDay || !validDay(today)) return 0;
  return stats.lastDay === today || stats.lastDay === previousDay(today) ? stats.dayStreak : 0;
}

/** A clean stats object from anything (unknown keys dropped, junk zeroed). */
export function sanitizeStats(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const stats = emptyStats();
  for (const k of COUNTERS) stats[k] = count(src[k]);
  for (const id of DIFFICULTY_IDS) {
    stats.clears[id] = count(src.clears?.[id]);
    stats.fastest[id] = seconds(src.fastest?.[id]);
  }
  stats.noHintBy = counts(src.noHintBy, DIFFICULTY_IDS);
  stats.flawlessBy = counts(src.flawlessBy, DIFFICULTY_IDS);
  stats.birdPairs = counts(src.birdPairs, BIRD_IDS);
  stats.layouts = known(src.layouts, LAYOUT_IDS);
  stats.species = known(src.species, BIRD_IDS);
  stats.finishBirds = known(src.finishBirds, BIRD_IDS);
  stats.weekdays = known(src.weekdays, [0, 1, 2, 3, 4, 5, 6]);
  stats.recentClears = Array.isArray(src.recentClears)
    ? src.recentClears.filter((t) => Number.isFinite(t) && t > 0).slice(-FRENZY_BOARDS)
    : [];
  stats.lastDay = validDay(src.lastDay) ? src.lastDay : "";
  return stats;
}

function sanitizeUnlocked(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const a of ACHIEVEMENTS) {
    const t = input[a.id];
    if (Number.isFinite(t) && t > 0) out[a.id] = t;
  }
  return out;
}

/**
 * Pure: fold one cleared board into the stats. `win` is
 *   { difficultyId, layoutId, seconds, pairs, score, bestStreak, hintsUsed,
 *     shuffles, mismatches, restarts, undos, continued, birds, lastBird,
 *     crowRavenMixups, hour, date, weekday, at }
 * where `birds` lists the species on the board, `lastBird` is the final
 * pair's bird, `crowRavenMixups` counts crow-vs-raven tries on this board,
 * and `hour` (0–23), `date` ("YYYY-MM-DD"), `weekday` (0 = Sunday) and `at`
 * (ms timestamp) say when it was cleared, in the player's local time.
 */
export function applyWin(stats, win) {
  const s = sanitizeStats(stats);
  const difficulty = DIFFICULTY_IDS.includes(win.difficultyId) ? win.difficultyId : null;
  const t = seconds(win.seconds);
  s.boardsCleared += 1;
  s.pairsCleared += count(win.pairs);
  s.bestStreak = Math.max(s.bestStreak, count(win.bestStreak));
  if (difficulty) {
    s.clears[difficulty] += 1;
    const previous = s.fastest[difficulty];
    if (t !== null && (previous === null || t < previous)) {
      s.fastest[difficulty] = t;
      if (previous !== null) {
        s.personalBests += 1;                        // beat an existing time
        if (previous - t <= 1) s.photoFinishes += 1; // …by a single second
      }
    }
  }
  if (t !== null) {
    s.totalSeconds += t;
    s.longestClear = Math.max(s.longestClear, t);
  }
  if (LAYOUT_IDS.includes(win.layoutId) && !s.layouts.includes(win.layoutId)) s.layouts.push(win.layoutId);
  const birds = known(win.birds, BIRD_IDS);
  for (const bird of birds) {
    if (!s.species.includes(bird)) s.species.push(bird);
    s.birdPairs[bird] += 2; // four copies of each bird: two pairs per board
  }
  if (BIRD_IDS.includes(win.lastBird) && !s.finishBirds.includes(win.lastBird)) s.finishBirds.push(win.lastBird);

  const hints = count(win.hintsUsed);
  const mismatches = count(win.mismatches);
  const undos = count(win.undos);
  if (hints === 0) {
    s.noHintClears += 1;
    if (difficulty) s.noHintBy[difficulty] += 1;
  }
  if (undos === 0) s.noUndoClears += 1;
  if (mismatches === 0) s.noMismatchClears += 1;
  const flawless = hints === 0 && mismatches === 0 && undos === 0
    && count(win.shuffles) === 0 && count(win.restarts) === 0 && !win.continued;
  if (flawless) {
    s.flawlessClears += 1;
    if (difficulty) s.flawlessBy[difficulty] += 1;
    if (difficulty === "hard" || difficulty === "expert") s.flawlessBig += 1;
  }
  if (count(win.shuffles) > 0) s.shuffleWins += 1;
  if (count(win.restarts) > 0) s.restartWins += 1;
  const score = count(win.score);
  s.bestScore = Math.max(s.bestScore, score);
  s.totalScore += score;
  if (win.continued) s.continuedClears += 1;
  if (Number.isInteger(win.hour)) {
    if (win.hour >= 0 && win.hour < 5) s.nightOwlClears += 1;
    else if (win.hour >= 5 && win.hour < 8) s.earlyBirdClears += 1;
    else if (win.hour >= 12 && win.hour < 14) s.lunchClears += 1;
    else if (win.hour >= 18 && win.hour < 20) s.eveningClears += 1;
  }
  if (win.lastBird === "wild-turkey") s.turkeyFinishes += 1;
  if (birds.includes("american-crow") && birds.includes("common-raven") && count(win.crowRavenMixups) === 0) s.corvidClears += 1;

  // Daily habits: days played, the run of consecutive days, clears per day.
  if (validDay(win.date)) {
    if (s.lastDay === win.date) {
      s.dayClears += 1;
    } else {
      s.daysPlayed += 1;
      s.dayStreak = s.lastDay && previousDay(win.date) === s.lastDay ? s.dayStreak + 1 : 1;
      s.dayClears = 1;
      s.lastDay = win.date;
    }
    s.bestDayStreak = Math.max(s.bestDayStreak, s.dayStreak);
    s.bestDayClears = Math.max(s.bestDayClears, s.dayClears);
  }
  if (Number.isInteger(win.weekday) && win.weekday >= 0 && win.weekday <= 6) {
    if (!s.weekdays.includes(win.weekday)) s.weekdays.push(win.weekday);
    if (win.weekday === 0 || win.weekday === 6) s.weekendClears += 1;
  }
  if (Number.isFinite(win.at) && win.at > 0) {
    s.recentClears = [...s.recentClears, win.at].slice(-FRENZY_BOARDS);
    if (s.recentClears.length === FRENZY_BOARDS && win.at - s.recentClears[0] <= FRENZY_MS) {
      s.frenzies += 1;
      s.recentClears = []; // the next frenzy needs three fresh boards
    }
  }
  return s;
}

/**
 * Pure: fold what has happened on the board in progress into the stats.
 * `board` comes from createBoardTracker().counters(): per-board counts are
 * kept as all-time maxima; one-off events add up.
 */
export function applyBoard(stats, board) {
  const s = sanitizeStats(stats);
  s.maxMismatches = Math.max(s.maxMismatches, count(board.mismatches));
  s.maxBlockedTaps = Math.max(s.maxBlockedTaps, count(board.blockedTaps));
  s.maxUndos = Math.max(s.maxUndos, count(board.undos));
  s.maxHints = Math.max(s.maxHints, count(board.hints));
  s.maxDeselects = Math.max(s.maxDeselects, count(board.deselects));
  s.bestBurst = Math.max(s.bestBurst, count(board.burst));
  s.bestStreak = Math.max(s.bestStreak, count(board.streak));
  s.crowRaven += count(board.crowRaven);
  s.shufflesUsed += count(board.shuffles);
  s.restartsUsed += count(board.restarts);
  return s;
}

/**
 * Pure: stats implied by the older best-score records ({ [difficultyId]:
 * { score, bestTime, games } }), so players who cleared boards before
 * achievements existed get credit for them.
 */
export function statsFromBests(bests) {
  const s = emptyStats();
  for (const id of DIFFICULTY_IDS) {
    const b = bests?.[id];
    if (!b) continue;
    s.clears[id] = count(b.games);
    s.fastest[id] = s.clears[id] > 0 ? seconds(b.bestTime) : null;
    s.boardsCleared += s.clears[id];
  }
  return s;
}

const isCrowRaven = (a, b) =>
  (a === "american-crow" && b === "common-raven") || (a === "common-raven" && b === "american-crow");

/**
 * Per-board counters for the achievements that watch how a board is played.
 * Feed it the game's events; `counters()` is what applyBoard() folds in.
 * Events carry board time (seconds, pauses excluded) where timing matters.
 */
export function createBoardTracker() {
  let c;
  let matchTimes;
  let pending; // one-off events not yet folded into the stats

  function reset({ mismatches = 0, hints = 0 } = {}) {
    // A continued board brings its saved mismatch and hint counts along.
    c = { mismatches, hints, blockedTaps: 0, undos: 0, deselects: 0, burst: 0, streak: 0, crowRavenMixups: 0 };
    matchTimes = [];
    pending = { crowRaven: 0, shuffles: 0, restarts: 0 };
  }
  reset();

  function on(type, detail = {}) {
    switch (type) {
      case "blocked": c.blockedTaps += 1; break;
      case "mismatch":
        c.mismatches += 1;
        if (isCrowRaven(detail.a, detail.b)) {
          pending.crowRaven += 1;
          c.crowRavenMixups += 1;
        }
        break;
      case "match": {
        c.streak = Math.max(c.streak, count(detail.streak));
        const t = Number(detail.seconds);
        if (Number.isFinite(t)) {
          matchTimes.push(t);
          while (matchTimes.length && t - matchTimes[0] > BURST_WINDOW) matchTimes.shift();
          c.burst = Math.max(c.burst, matchTimes.length); // most pairs in any window
        }
        break;
      }
      case "undo":
        c.undos += 1;
        matchTimes.pop(); // an undone pair doesn't count towards a burst
        break;
      case "hint": c.hints += 1; break;
      case "deselect": c.deselects += 1; break;
      case "shuffle": pending.shuffles += 1; break;
      case "restart":
        pending.restarts += 1;
        matchTimes = [];
        break;
      default: break;
    }
  }

  /** Counts so far; one-off events are handed over once. */
  function counters() {
    const out = { ...c, ...pending };
    pending = { crowRaven: 0, shuffles: 0, restarts: 0 };
    return out;
  }

  return {
    reset, on, counters,
    get undos() { return c.undos; },
    get crowRavenMixups() { return c.crowRavenMixups; },
  };
}

/**
 * The persistent store. `bests` (js/best-scores.js) seeds a first-time stats
 * record. `now` is injectable for tests.
 */
export function createPlayerStats(storage, { bests = null, now = () => Date.now() } = {}) {
  const store = openStorage(storage).storage;

  function read() {
    const raw = readJson(store, STATS_KEY);
    if (raw === null && store.getItem(STATS_KEY) === null && bests) {
      // First run with achievements: credit earlier clears.
      const seeded = statsFromBests(Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, bests.get(id)])));
      store.setItem(STATS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return sanitizeStats(raw);
  }

  const readUnlocked = () => sanitizeUnlocked(readJson(store, ACHIEVEMENTS_KEY));

  /** Save `stats` and record any newly earned achievements; returns their definitions. */
  function commit(stats) {
    const json = JSON.stringify(stats);
    if (store.getItem(STATS_KEY) !== json) store.setItem(STATS_KEY, json);
    const unlocked = readUnlocked();
    const fresh = earnedIds(stats).filter((id) => !unlocked[id]);
    if (!fresh.length) return [];
    const t = now();
    for (const id of fresh) unlocked[id] = t;
    store.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
    return ACHIEVEMENTS.filter((a) => fresh.includes(a.id));
  }

  return {
    stats: read,
    /** { [id]: timestamp } of everything earned. */
    unlocked: readUnlocked,
    recordWin: (win) => commit(applyWin(read(), win)),
    recordBoard: (board) => commit(applyBoard(read(), board)),
    /** Record anything the stats already earn (e.g. after seeding); returns new ones. */
    sync: () => commit(read()),
  };
}
