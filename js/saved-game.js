// The one autosaved board, kept in local storage.
//
// Envelope: { version, difficultyId, elapsedMs, savedAt, game }
//   game       serializeGame(state) from js/game/save-format.js
//   elapsedMs  play time so far (time is a personal stat, never scored)
//
// load() validates everything and, if anything is off, deletes the save and
// returns null — the menu then simply shows no Continue.

import { DIFFICULTIES } from "./config.js";
import { isWon } from "./game/game.js";
import { SAVE_VERSION, serializeGame, tryDeserializeGame } from "./game/save-format.js";
import { openStorage, readJson } from "./storage.js";

export const SAVE_KEY = "inspireBirdMahjong:v1:save";
const MAX_ELAPSED_MS = 1000 * 60 * 60 * 24 * 30; // anything beyond 30 days is junk

/** `storage` may be a raw Storage (it is wrapped) or one from openStorage(). */
export function createSavedGame(storage) {
  const store = openStorage(storage).storage;

  /** Save the board in progress. A finished board clears the save instead. */
  function save({ difficultyId, state, elapsedMs, now = Date.now() }) {
    if (!state || isWon(state)) {
      clear();
      return false;
    }
    const envelope = {
      version: SAVE_VERSION,
      difficultyId,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      savedAt: now,
      game: serializeGame(state),
    };
    return store.setItem(SAVE_KEY, JSON.stringify(envelope));
  }

  /** The saved board as { difficultyId, state, elapsedMs, savedAt }, or null. */
  function load() {
    const raw = store.getItem(SAVE_KEY);
    if (raw === null) return null;
    const data = readJson(store, SAVE_KEY);
    const restored = validate(data);
    if (!restored) clear(); // corrupt or stale: don't offer it again
    return restored;
  }

  function validate(data) {
    if (!data || typeof data !== "object" || data.version !== SAVE_VERSION) return null;
    const difficulty = DIFFICULTIES.find((d) => d.id === data.difficultyId);
    if (!difficulty) return null;
    if (!Number.isFinite(data.elapsedMs) || data.elapsedMs < 0 || data.elapsedMs > MAX_ELAPSED_MS) return null;
    const state = tryDeserializeGame(data.game);
    if (!state || state.layoutId !== difficulty.layout || isWon(state)) return null;
    return { difficultyId: difficulty.id, state, elapsedMs: data.elapsedMs, savedAt: Number(data.savedAt) || 0 };
  }

  function clear() {
    store.removeItem(SAVE_KEY);
  }

  return { save, load, clear };
}
