// Settings persisted in localStorage. Storage can be unavailable (private
// mode, blocked site data) or hold junk, so reads fall back to defaults and
// each field is validated on its own.

import { readJson } from "./storage.js";

export const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";

export const DEFAULT_SETTINGS = Object.freeze({
  motion: "system",        // "system" | "reduce" | "full"
  backgroundBirds: true,
  tileLabels: false,
  streakBonus: true,
});

/** `storage` comes from openStorage() in js/storage.js. */
export function loadSettings(storage) {
  const saved = readJson(storage, SETTINGS_KEY);
  return sanitize(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {});
}

export function saveSettings(settings, storage) {
  // If this fails the in-memory settings still apply for this session.
  storage.setItem(SETTINGS_KEY, JSON.stringify(sanitize(settings)));
}

/** Keep each valid field; anything missing or malformed takes its default. */
export function sanitize(s) {
  const bool = (key) => (typeof s[key] === "boolean" ? s[key] : DEFAULT_SETTINGS[key]);
  return {
    motion: ["system", "reduce", "full"].includes(s.motion) ? s.motion : DEFAULT_SETTINGS.motion,
    backgroundBirds: bool("backgroundBirds"),
    tileLabels: bool("tileLabels"),
    streakBonus: bool("streakBonus"),
  };
}
