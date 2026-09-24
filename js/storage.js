// One place to decide whether local storage actually works.
//
// `localStorage` can be missing, throw on access (blocked site data), throw on
// write (Safari private mode, quota), or hold junk. Everything that persists
// (settings, best scores, the saved game) goes through the storage returned
// here. If the real thing doesn't work, a session-only in-memory store stands
// in, so the game always runs; `persistent` says which one you got.

const PROBE_KEY = "inspireBirdMahjong:probe";

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** The browser's localStorage, or undefined if even reading the property throws. */
export function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Wrap a candidate storage. Returns { storage, persistent }; `storage` never
 * throws: failed writes are swallowed (the caller's data just isn't kept) and
 * failed reads return null.
 */
export function openStorage(candidate = browserStorage()) {
  let works = false;
  try {
    candidate.setItem(PROBE_KEY, "1");
    works = candidate.getItem(PROBE_KEY) === "1";
    candidate.removeItem(PROBE_KEY);
  } catch {
    works = false;
  }
  const backing = works ? candidate : memoryStorage();
  return {
    persistent: works,
    storage: {
      getItem(key) {
        try { return backing.getItem(key); } catch { return null; }
      },
      setItem(key, value) {
        try { backing.setItem(key, value); return true; } catch { return false; }
      },
      removeItem(key) {
        try { backing.removeItem(key); } catch { /* nothing to do */ }
      },
    },
  };
}

/** Parse JSON stored under `key`, or null if it's missing or unreadable. */
export function readJson(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
