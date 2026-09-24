// Bird IDs, in sheet order. Must match data/tiles.json (checked by tests).

export const BIRD_IDS = Object.freeze([
  "bald-eagle", "osprey", "red-tailed-hawk", "peregrine-falcon", "barred-owl",
  "great-horned-owl", "american-crow", "common-raven", "blue-jay", "northern-cardinal",
  "american-robin", "black-capped-chickadee", "tufted-titmouse", "pileated-woodpecker", "belted-kingfisher",
  "great-blue-heron", "wood-duck", "wild-turkey", "canada-goose", "ruby-throated-hummingbird",
]);

/** Every bird appears exactly this many times on a board. */
export const COPIES_PER_BIRD = 4;

/**
 * Birds that are easy to confuse at a glance. Easy boards never include two
 * birds from the same group, and never the dark crow/raven pair at all.
 */
export const LOOKALIKE_GROUPS = Object.freeze([
  Object.freeze(["american-crow", "common-raven", "wild-turkey"]),          // dark, near-black
  Object.freeze(["barred-owl", "great-horned-owl"]),                        // owls
  Object.freeze(["black-capped-chickadee", "tufted-titmouse"]),             // small grey songbirds
  Object.freeze(["osprey", "red-tailed-hawk", "peregrine-falcon", "bald-eagle"]), // brown/white raptors
  Object.freeze(["blue-jay", "belted-kingfisher"]),                         // blue crests
  Object.freeze(["northern-cardinal", "pileated-woodpecker"]),              // red crests
]);

/**
 * Easy pool: each bird has a distinct dominant colour or silhouette, and at
 * most one comes from any look-alike group. Easy boards draw 6 of these 8.
 */
export const EASY_BIRDS = Object.freeze([
  "northern-cardinal",          // red
  "blue-jay",                   // bright blue
  "american-robin",             // orange breast
  "wood-duck",                  // green crest, chestnut
  "ruby-throated-hummingbird",  // hovering, red flowers
  "canada-goose",               // long black neck, lake
  "bald-eagle",                 // white head, yellow bill
  "great-blue-heron",           // long neck, dagger bill
]);
