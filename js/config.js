// Static configuration shared by the app shell.
// Difficulty levels. `layout` is a preset in js/game/geometry.js; tiles and
// birds are shown on the difficulty picker and must equal that layout's tile
// count and tiles / 4 (four copies of each bird) — tests/config.test.js checks.

export const DIFFICULTIES = [
  { id: "easy",         name: "Easy",         habitat: "Meadow",      layout: "meadow",      tiles: 48, birds: 12, icon: "11-american-robin" },
  { id: "intermediate", name: "Intermediate", habitat: "Forest Edge", layout: "forest-edge", tiles: 64, birds: 16, icon: "09-blue-jay" },
  { id: "advanced",     name: "Advanced",     habitat: "Deep Woods",  layout: "deep-woods",  tiles: 72, birds: 18, icon: "06-great-horned-owl" },
  { id: "insane",       name: "Insane",       habitat: "Old Growth",  layout: "old-growth",  tiles: 80, birds: 20, icon: "08-common-raven" },
];

export const SMALL_TILE_DIR = "assets/tiles-sm/";

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}
