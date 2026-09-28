// Which layout the next board of each difficulty uses. Every difficulty has
// several layouts (js/config.js); boards draw them from a shuffled "bag", so
// each layout comes up once before any repeats, and the next board never uses
// the same layout as the one before it (not even across a refill).
//
// Stored shape: { [difficultyId]: { bag: [layoutId, ...], last: layoutId } }
//   bag   layouts still to come this cycle, next first
//   last  the layout of the most recent board
//
// Storage is injectable for tests; a missing, blocked or junk entry just
// starts a fresh cycle.

import { openStorage, readJson } from "./storage.js";
import { shuffled } from "./game/rng.js";

export const ROTATION_KEY = "inspireBirdMahjong:v1:layouts";

/** `storage` may be a raw Storage (it is wrapped) or one from openStorage(). */
export function createLayoutRotation(storage, { rng = Math.random } = {}) {
  const store = openStorage(storage).storage;

  function readAll() {
    const data = readJson(store, ROTATION_KEY);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  }

  /** The layout for the next board of `difficulty`, advancing the rotation. */
  function next(difficulty) {
    const pool = difficulty.layouts;
    if (pool.length === 1) return pool[0];
    const all = readAll();
    const entry = all[difficulty.id] && typeof all[difficulty.id] === "object" ? all[difficulty.id] : {};
    const last = pool.includes(entry.last) ? entry.last : null;
    // Only layouts this difficulty still has, each at most once.
    let bag = Array.isArray(entry.bag) ? [...new Set(entry.bag.filter((id) => pool.includes(id) && id !== last))] : [];
    if (bag.length === 0) {
      bag = shuffled(pool, rng);
      // Never the same layout twice in a row across a refill.
      if (bag[0] === last) bag.push(bag.shift());
    }
    const layoutId = bag.shift();
    all[difficulty.id] = { bag, last: layoutId };
    store.setItem(ROTATION_KEY, JSON.stringify(all)); // failure = rotation just isn't remembered
    return layoutId;
  }

  /**
   * Note a board that didn't come from next() (a `?seed=` replay or a
   * continued save), so the following board still differs from it.
   */
  function played(difficulty, layoutId) {
    if (!difficulty.layouts.includes(layoutId)) return;
    const all = readAll();
    const entry = all[difficulty.id] && typeof all[difficulty.id] === "object" ? all[difficulty.id] : {};
    const bag = Array.isArray(entry.bag) ? entry.bag.filter((id) => id !== layoutId) : [];
    all[difficulty.id] = { bag, last: layoutId };
    store.setItem(ROTATION_KEY, JSON.stringify(all));
  }

  return { next, played };
}
