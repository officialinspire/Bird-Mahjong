// Bird IDs, in sheet order. Must match data/tiles.json (checked by tests).

export const BIRD_IDS = Object.freeze([
  "bald-eagle", "osprey", "red-tailed-hawk", "peregrine-falcon", "barred-owl",
  "great-horned-owl", "american-crow", "common-raven", "blue-jay", "northern-cardinal",
  "american-robin", "black-capped-chickadee", "tufted-titmouse", "pileated-woodpecker", "belted-kingfisher",
  "great-blue-heron", "wood-duck", "wild-turkey", "canada-goose", "ruby-throated-hummingbird",
]);

/** Every bird appears exactly this many times on a board. */
export const COPIES_PER_BIRD = 4;
