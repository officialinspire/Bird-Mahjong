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

import { ACHIEVEMENTS, BURST_PAIRS, BURST_WINDOW, earnedIds } from "./achievements.js";
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
];
const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id);

export function emptyStats() {
  const stats = Object.fromEntries(COUNTERS.map((k) => [k, 0]));
  stats.clears = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, 0]));
  stats.fastest = Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, null]));
  stats.layouts = [];
  stats.species = [];
  return stats;
}

const count = (n) => (Number.isInteger(n) && n >= 0 && n < 1e9 ? n : 0);
const seconds = (n) => (Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.floor(n) : null);
const known = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((x) => allowed.includes(x)))] : []);

/** A clean stats object from anything (unknown keys dropped, junk zeroed). */
export function sanitizeStats(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const stats = emptyStats();
  for (const k of COUNTERS) stats[k] = count(src[k]);
  for (const id of DIFFICULTY_IDS) {
    stats.clears[id] = count(src.clears?.[id]);
    stats.fastest[id] = seconds(src.fastest?.[id]);
  }
  stats.layouts = known(src.layouts, LAYOUT_IDS);
  stats.species = known(src.species, BIRD_IDS);
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
 *   { difficultyId, layoutId, seconds, pairs, bestStreak, hintsUsed,
 *     shuffles, mismatches, restarts, undos, continued, birds, lastBird, hour }
 * where `birds` lists the species on the board, `lastBird` is the final
 * pair's bird and `hour` is the local hour (0–23) it was cleared.
 */
export function applyWin(stats, win) {
  const s = sanitizeStats(stats);
  const difficulty = DIFFICULTY_IDS.includes(win.difficultyId) ? win.difficultyId : null;
  s.boardsCleared += 1;
  s.pairsCleared += count(win.pairs);
  s.bestStreak = Math.max(s.bestStreak, count(win.bestStreak));
  if (difficulty) {
    s.clears[difficulty] += 1;
    const t = seconds(win.seconds);
    if (t !== null && (s.fastest[difficulty] === null || t < s.fastest[difficulty])) s.fastest[difficulty] = t;
  }
  if (LAYOUT_IDS.includes(win.layoutId) && !s.layouts.includes(win.layoutId)) s.layouts.push(win.layoutId);
  for (const bird of known(win.birds, BIRD_IDS)) if (!s.species.includes(bird)) s.species.push(bird);

  const hints = count(win.hintsUsed);
  if (hints === 0) s.noHintClears += 1;
  const flawless = hints === 0 && count(win.mismatches) === 0 && count(win.undos) === 0
    && count(win.shuffles) === 0 && count(win.restarts) === 0 && !win.continued;
  if (flawless) {
    s.flawlessClears += 1;
    if (difficulty === "hard" || difficulty === "expert") s.flawlessBig += 1;
  }
  if (win.continued) s.continuedClears += 1;
  if (Number.isInteger(win.hour)) {
    if (win.hour >= 0 && win.hour < 5) s.nightOwlClears += 1;
    else if (win.hour >= 5 && win.hour < 8) s.earlyBirdClears += 1;
  }
  if (win.lastBird === "wild-turkey") s.turkeyFinishes += 1;
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
    c = { mismatches, hints, blockedTaps: 0, undos: 0, burst: 0, streak: 0 };
    matchTimes = [];
    pending = { crowRaven: 0, shuffles: 0, restarts: 0 };
  }
  reset();

  function on(type, detail = {}) {
    switch (type) {
      case "blocked": c.blockedTaps += 1; break;
      case "mismatch":
        c.mismatches += 1;
        if (isCrowRaven(detail.a, detail.b)) pending.crowRaven += 1;
        break;
      case "match": {
        c.streak = Math.max(c.streak, count(detail.streak));
        const t = Number(detail.seconds);
        if (Number.isFinite(t)) {
          matchTimes.push(t);
          while (matchTimes.length && t - matchTimes[0] > BURST_WINDOW) matchTimes.shift();
          c.burst = Math.max(c.burst, Math.min(matchTimes.length, BURST_PAIRS));
        }
        break;
      }
      case "undo":
        c.undos += 1;
        matchTimes.pop(); // an undone pair doesn't count towards a burst
        break;
      case "hint": c.hints += 1; break;
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

  return { reset, on, counters, get undos() { return c.undos; } };
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
