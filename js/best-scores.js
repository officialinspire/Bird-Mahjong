// Personal bests and boards completed, kept separately for each difficulty in
// localStorage. Storage is injectable for tests; if it's unavailable (private
// mode, blocked site data) bests simply live for this session.
//
// Stored shape: { [difficultyId]: { score, bestTime, games } }
//   score     highest score on that difficulty
//   bestTime  fastest clear in whole seconds — a personal stat only; it never
//             affects the score
//   games     boards cleared on that difficulty

import { openStorage, readJson } from "./storage.js";

export const BEST_KEY = "inspireBirdMahjong:v1:bests";

/** `storage` may be a raw Storage (it is wrapped) or one from openStorage(). */
export function createBestScores(storage) {
  const store = openStorage(storage).storage;

  function readAll() {
    const data = readJson(store, BEST_KEY);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  }

  function writeAll(data) {
    // A failed write (quota, blocked) just means the best isn't kept.
    store.setItem(BEST_KEY, JSON.stringify(data));
  }

  function get(difficultyId) {
    const entry = readAll()[difficultyId];
    if (!entry) return null;
    if (!entry || typeof entry !== "object") return null;
    return {
      score: Number.isFinite(entry.score) ? entry.score : 0,
      bestTime: Number.isFinite(entry.bestTime) ? entry.bestTime : null,
      games: Number.isFinite(entry.games) ? entry.games : 0,
    };
  }

  /**
   * Record a cleared board. Returns { isNewBest, isNewBestTime, previous, best }.
   * A first clear always counts as a new best.
   */
  function record(difficultyId, { score, seconds }) {
    const all = readAll();
    const previous = get(difficultyId);
    const isNewBest = !previous || score > previous.score;
    const isNewBestTime = !previous || previous.bestTime === null || seconds < previous.bestTime;
    const best = {
      score: isNewBest ? score : previous.score,
      bestTime: isNewBestTime ? seconds : previous.bestTime,
      games: (previous?.games ?? 0) + 1,
    };
    all[difficultyId] = best;
    writeAll(all);
    return { isNewBest, isNewBestTime, previous, best };
  }

  function clear(difficultyId) {
    const all = readAll();
    delete all[difficultyId];
    writeAll(all);
  }

  return { get, record, clear };
}
