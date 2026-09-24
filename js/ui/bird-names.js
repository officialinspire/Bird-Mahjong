// Display names for bird IDs. `short` is the on-tile label (Settings → Show
// bird names on tiles) and is chosen so look-alikes read differently. `cue`
// is a short visual description read to screen-reader users with each tile.
// Must cover every ID in js/game/birds.js and match data/tiles.json names
// (tests/config.test.js checks).

export const BIRD_NAMES = Object.freeze({
  "bald-eagle": { name: "Bald Eagle", short: "Eagle", cue: "white head, yellow hooked bill, dark body" },
  "osprey": { name: "Osprey", short: "Osprey", cue: "white face with a dark eye stripe, lake behind" },
  "red-tailed-hawk": { name: "Red-tailed Hawk", short: "Hawk", cue: "rusty brown head, streaked cream breast, red leaves" },
  "peregrine-falcon": { name: "Peregrine Falcon", short: "Falcon", cue: "slate-grey hood and moustache, barred breast" },
  "barred-owl": { name: "Barred Owl", short: "Barred Owl", cue: "round grey-brown face, dark eyes, no ear tufts" },
  "great-horned-owl": { name: "Great Horned Owl", short: "Horned Owl", cue: "ear tufts, yellow eyes, mottled brown" },
  "american-crow": { name: "American Crow", short: "Crow", cue: "dark bird with a slim bill and smooth throat, pine boughs" },
  "common-raven": { name: "Common Raven", short: "Raven", cue: "dark bird with a heavy hooked bill and shaggy throat, spruce trees" },
  "blue-jay": { name: "Blue Jay", short: "Blue Jay", cue: "blue crest, black necklace, orange leaves" },
  "northern-cardinal": { name: "Northern Cardinal", short: "Cardinal", cue: "all red with a black face mask, holly" },
  "american-robin": { name: "American Robin", short: "Robin", cue: "orange breast, dark head, white blossoms" },
  "black-capped-chickadee": { name: "Black-capped Chickadee", short: "Chickadee", cue: "black cap and bib, white cheek, pinecone" },
  "tufted-titmouse": { name: "Tufted Titmouse", short: "Titmouse", cue: "grey crest, pale face, red berries" },
  "pileated-woodpecker": { name: "Pileated Woodpecker", short: "Woodpecker", cue: "red crest, black and white face, on a tree trunk" },
  "belted-kingfisher": { name: "Belted Kingfisher", short: "Kingfisher", cue: "shaggy blue crest, blue and rust breast band" },
  "great-blue-heron": { name: "Great Blue Heron", short: "Heron", cue: "long neck, dagger bill, marsh water" },
  "wood-duck": { name: "Wood Duck", short: "Wood Duck", cue: "green crested head, red eye, chestnut breast" },
  "wild-turkey": { name: "Wild Turkey", short: "Turkey", cue: "fanned tail, blue and red bare head" },
  "canada-goose": { name: "Canada Goose", short: "Goose", cue: "long black neck, white chinstrap, lake" },
  "ruby-throated-hummingbird": { name: "Ruby-throated Hummingbird", short: "Hummingbird", cue: "hovering, ruby throat, red flowers" },
});

export const birdName = (id) => BIRD_NAMES[id]?.name ?? id;
export const birdShort = (id) => BIRD_NAMES[id]?.short ?? id;
export const birdCue = (id) => BIRD_NAMES[id]?.cue ?? "";
