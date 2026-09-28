// Static configuration shared by the app shell.

import { EASY_BIRDS } from "./game/birds.js";

// Difficulty levels. `layouts` are presets in js/game/geometry.js that a
// difficulty rotates through (js/layout-rotation.js): each new board takes a
// different one. They all have the same tile count, so tiles and birds (shown
// on the difficulty picker) hold for every board: tiles is each layout's tile
// count and birds is tiles / 4 (four copies of each bird) —
// tests/config.test.js checks. `layout` is the signature layout (the first in
// `layouts`), used for `?seed=` replays and tests.
// `birdPool` limits which birds a difficulty draws from (null = all 20).

const difficulty = (d) => Object.freeze({ ...d, layout: d.layouts[0], layouts: Object.freeze(d.layouts) });

export const DIFFICULTIES = Object.freeze([
  difficulty({ id: "easy",   name: "Easy",   habitat: "Meadowlands", layouts: ["meadow", "pond", "hedgerow"],            tiles: 24, birds: 6,  birdPool: EASY_BIRDS, icon: "11-american-robin" }),
  difficulty({ id: "medium", name: "Medium", habitat: "Woodland",    layouts: ["twin-groves", "hilltop", "crossroads"],  tiles: 40, birds: 10, birdPool: null,       icon: "09-blue-jay" }),
  difficulty({ id: "hard",   name: "Hard",   habitat: "Old Growth",  layouts: ["old-growth", "canopy", "summit"],        tiles: 60, birds: 15, birdPool: null,       icon: "06-great-horned-owl" }),
  difficulty({ id: "expert", name: "Expert", habitat: "Wilderness",  layouts: ["wildwood", "twin-towers", "fortress"],   tiles: 80, birds: 20, birdPool: null,       icon: "01-bald-eagle" }),
]);

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
 * birds plays its call instead of the synthesized match chirp. Peregrine Falcon
 * and Wild Turkey have no approved clip and keep the chirp.
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
    "osprey": "assets/audio/osprey.mp3",
    "red-tailed-hawk": "assets/audio/red-tailed-hawk.mp3",
    "barred-owl": "assets/audio/barred-owl.mp3",
    "great-horned-owl": "assets/audio/great-horned-owl.mp3",
    "blue-jay": "assets/audio/blue-jay.mp3",
    "american-robin": "assets/audio/american-robin.mp3",
    "black-capped-chickadee": "assets/audio/black-capped-chickadee.mp3",
    "tufted-titmouse": "assets/audio/tufted-titmouse.mp3",
    "pileated-woodpecker": "assets/audio/pileated-woodpecker.mp3",
    "belted-kingfisher": "assets/audio/belted-kingfisher.mp3",
    "great-blue-heron": "assets/audio/great-blue-heron.mp3",
    "canada-goose": "assets/audio/canada-goose.mp3",
    "ruby-throated-hummingbird": "assets/audio/ruby-throated-hummingbird.mp3",
  }),
  music: Object.freeze({
    menu: "Bird Mahjong - Gentle Canopy.mp3",
    game: "Bird Mahjong - Forest Breeze.mp3",
  }),
});
