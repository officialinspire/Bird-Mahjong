// Static configuration shared by the app shell.

import { EASY_BIRDS } from "./game/birds.js";

// Difficulty levels. `layout` is a preset in js/game/geometry.js; tiles and
// birds are shown on the difficulty picker and must equal that layout's tile
// count and tiles / 4 (four copies of each bird) — tests/config.test.js checks.
// `birdPool` limits which birds a difficulty draws from (null = all 20).

export const DIFFICULTIES = [
  { id: "easy",   name: "Easy",   habitat: "Meadow",      layout: "meadow",      tiles: 24, birds: 6,  birdPool: EASY_BIRDS, icon: "11-american-robin" },
  { id: "medium", name: "Medium", habitat: "Twin Groves", layout: "twin-groves", tiles: 40, birds: 10, birdPool: null,       icon: "09-blue-jay" },
  { id: "hard",   name: "Hard",   habitat: "Old Growth",  layout: "old-growth",  tiles: 60, birds: 15, birdPool: null,       icon: "06-great-horned-owl" },
];

export const SMALL_TILE_DIR = "assets/tiles-sm/";

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

/**
 * Optional recorded audio (relative URLs). Leave empty to use only the
 * built-in synthesized sounds. Anything listed here that is missing or fails
 * to decode falls back to the synthesized version, so a partial set is fine.
 * Put files in assets/audio/ so the service worker precaches them for offline
 * play (tools/build-sw.mjs picks them up), e.g.
 *   sfx:   { match: "assets/audio/match.mp3" }
 *   music: { menu: "assets/audio/menu.mp3", game: "assets/audio/game.mp3" }
 */
export const AUDIO_FILES = Object.freeze({
  sfx: Object.freeze({}),
  music: Object.freeze({}),
});
