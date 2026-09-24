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
 * Recorded audio (relative URLs; spaces are fine). Music tracks are streamed
 * by js/ui/music.js with seamless loops and crossfades:
 *   menu  start screen, menus, pause and results
 *   game  gameplay
 * Effects listed under `sfx` are decoded whole (keep them short). Anything
 * missing, unsupported or refused falls back to the synthesized sounds.
 *
 * `calls` maps exact bird IDs (js/game/birds.js) to the approved, credited
 * bird-call clips (assets/audio/CREDITS.md). Clearing a pair of one of these
 * birds plays its call instead of the synthesized match chirp; every other
 * bird keeps the chirp.
 *
 * tools/build-sw.mjs precaches root *.mp3 files and assets/audio/ for offline
 * play (run `npm run build:sw` after changing them).
 */
export const AUDIO_FILES = Object.freeze({
  sfx: Object.freeze({}),
  calls: Object.freeze({
    "american-crow": "assets/audio/american-crow.mp3",
    "common-raven": "assets/audio/common-raven.mp3",
    "bald-eagle": "assets/audio/bald-eagle.mp3",
    "northern-cardinal": "assets/audio/northern-cardinal.mp3",
    "wood-duck": "assets/audio/wood-duck.mp3",
  }),
  music: Object.freeze({
    menu: "Bird Mahjong - Gentle Canopy.mp3",
    game: "Bird Mahjong - Forest Breeze.mp3",
  }),
});
