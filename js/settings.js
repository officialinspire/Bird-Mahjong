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
  // Audio never starts before a tap or key press (see js/ui/sound.js).
  music: true,             // calm woodland ambience
  musicVolume: 0.4,        // 0..1
  sfx: true,               // soft chirps and UI sounds
  sfxVolume: 0.6,          // 0..1
});

/**
 * Older saves had a single Sound switch and volume. They carry over to Sound
 * effects (what they controlled), unless the new keys are already present.
 */
const LEGACY = Object.freeze({ sound: "sfx", soundVolume: "sfxVolume" });

/** `storage` comes from openStorage() in js/storage.js. */
export function loadSettings(storage) {
  const saved = readJson(storage, SETTINGS_KEY);
  return sanitize(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {});
}

export function saveSettings(settings, storage) {
  // If this fails the in-memory settings still apply for this session.
  storage.setItem(SETTINGS_KEY, JSON.stringify(sanitize(settings)));
}

/**
 * Keep each valid field; anything missing or malformed takes its default.
 * Unknown keys are dropped, so only the current shape is ever written back.
 */
export function sanitize(input) {
  const s = { ...input };
  for (const [old, now] of Object.entries(LEGACY)) {
    if (!(now in s) && old in s) s[now] = s[old];
  }
  const bool = (key) => (typeof s[key] === "boolean" ? s[key] : DEFAULT_SETTINGS[key]);
  const volume = (key) =>
    typeof s[key] === "number" && Number.isFinite(s[key]) ? Math.min(1, Math.max(0, s[key])) : DEFAULT_SETTINGS[key];
  return {
    motion: ["system", "reduce", "full"].includes(s.motion) ? s.motion : DEFAULT_SETTINGS.motion,
    backgroundBirds: bool("backgroundBirds"),
    tileLabels: bool("tileLabels"),
    streakBonus: bool("streakBonus"),
    music: bool("music"),
    musicVolume: volume("musicVolume"),
    sfx: bool("sfx"),
    sfxVolume: volume("sfxVolume"),
  };
}
