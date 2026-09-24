// Display names for bird IDs. `short` is the on-tile label (Settings → Show
// bird names on tiles) and is chosen so look-alikes read differently.
// Must cover every ID in js/game/birds.js and match data/tiles.json names
// (tests/config.test.js checks).

export const BIRD_NAMES = Object.freeze({
  "bald-eagle": { name: "Bald Eagle", short: "Eagle" },
  "osprey": { name: "Osprey", short: "Osprey" },
  "red-tailed-hawk": { name: "Red-tailed Hawk", short: "Hawk" },
  "peregrine-falcon": { name: "Peregrine Falcon", short: "Falcon" },
  "barred-owl": { name: "Barred Owl", short: "Barred Owl" },
  "great-horned-owl": { name: "Great Horned Owl", short: "Horned Owl" },
  "american-crow": { name: "American Crow", short: "Crow" },
  "common-raven": { name: "Common Raven", short: "Raven" },
  "blue-jay": { name: "Blue Jay", short: "Blue Jay" },
  "northern-cardinal": { name: "Northern Cardinal", short: "Cardinal" },
  "american-robin": { name: "American Robin", short: "Robin" },
  "black-capped-chickadee": { name: "Black-capped Chickadee", short: "Chickadee" },
  "tufted-titmouse": { name: "Tufted Titmouse", short: "Titmouse" },
  "pileated-woodpecker": { name: "Pileated Woodpecker", short: "Woodpecker" },
  "belted-kingfisher": { name: "Belted Kingfisher", short: "Kingfisher" },
  "great-blue-heron": { name: "Great Blue Heron", short: "Heron" },
  "wood-duck": { name: "Wood Duck", short: "Wood Duck" },
  "wild-turkey": { name: "Wild Turkey", short: "Turkey" },
  "canada-goose": { name: "Canada Goose", short: "Goose" },
  "ruby-throated-hummingbird": { name: "Ruby-throated Hummingbird", short: "Hummingbird" },
});

export const birdName = (id) => BIRD_NAMES[id]?.name ?? id;
export const birdShort = (id) => BIRD_NAMES[id]?.short ?? id;
