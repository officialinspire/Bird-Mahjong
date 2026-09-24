// Static configuration shared by the app shell.
// Tile counts are the planned board sizes; gameplay will read them from here.

export const DIFFICULTIES = [
  { id: "easy",         name: "Easy",         habitat: "Meadow",      tiles: 48,  birds: 12, icon: "11-american-robin" },
  { id: "intermediate", name: "Intermediate", habitat: "Forest Edge", tiles: 64,  birds: 16, icon: "09-blue-jay" },
  { id: "advanced",     name: "Advanced",     habitat: "Deep Woods",  tiles: 80,  birds: 20, icon: "06-great-horned-owl" },
  { id: "insane",       name: "Insane",       habitat: "Old Growth",  tiles: 120, birds: 20, icon: "08-common-raven" },
];

export const SMALL_TILE_DIR = "assets/tiles-sm/";

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}
