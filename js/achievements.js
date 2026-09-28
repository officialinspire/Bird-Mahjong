// Achievements: pure definitions over the lifetime stats in js/player-stats.js.
//
// Every achievement is a test of the stats (never of the DOM or the clock),
// so unlocking is deterministic, can be re-checked at any time, and is fully
// covered by tests/achievements.test.js. Stats only ever grow, so once an
// achievement's test passes it stays passed; the store also remembers when
// each one was first earned.
//
// Each definition:
//   id        stable key (stored; never rename)
//   category  one of CATEGORIES
//   name      short title shown on the badge card
//   text      how to earn it (shown even while locked)
//   quip      a line shown once it's earned
//   badge     { shape: "medal" | "trophy" | "rosette", tier, bird }
//             tier: "bronze" | "silver" | "gold" | "leaf" | "sky" | "cardinal"
//             bird: a bird ID whose tile art sits inside the badge
//   test(s)   true once earned
//   progress(s) (optional) [have, need] for a progress bar

import { BIRD_IDS } from "./game/birds.js";
import { DIFFICULTIES } from "./config.js";
import { LAYOUT_IDS } from "./game/geometry.js";

export const CATEGORIES = Object.freeze([
  { id: "clears", name: "Boards cleared", blurb: "Every board you finish counts, on any difficulty." },
  { id: "firsts", name: "Woodland firsts", blurb: "Your first clear on each difficulty earns its trophy." },
  { id: "progress", name: "Field progress", blurb: "Long-term goals that fill up as you play." },
  { id: "speed", name: "Swift wings", blurb: "Time is never scored, but it can be bragged about." },
  { id: "fun", name: "Just for fun", blurb: "Silly, surprising and occasionally embarrassing." },
]);

/** Clear times (seconds, pause excluded) for the speed trophies. */
export const SPEED_GOALS = Object.freeze({ easy: 60, medium: 120, hard: 210, expert: 300 });

/** Quick Wings: this many pairs within BURST_WINDOW seconds of board time. */
export const BURST_PAIRS = 5;
export const BURST_WINDOW = 10;

const count = (n, goal) => [Math.min(n, goal), goal];
const clears = (s, id) => s.clears[id] || 0;
const mmss = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

function milestone(id, goal, name, quip, tier, bird) {
  return {
    id, category: "clears", name, quip,
    text: goal === 1 ? "Clear your first board." : `Clear ${goal} boards.`,
    badge: { shape: "medal", tier, bird },
    test: (s) => s.boardsCleared >= goal,
    progress: goal > 1 ? (s) => count(s.boardsCleared, goal) : undefined,
  };
}

const FIRSTS = {
  easy: { name: "Meadowlands Mastered", quip: "The robins approve.", tier: "bronze", bird: "american-robin" },
  medium: { name: "Woodland Wanderer", quip: "Deeper into the trees you go.", tier: "silver", bird: "blue-jay" },
  hard: { name: "Old Growth Ranger", quip: "The owls have noticed you.", tier: "gold", bird: "great-horned-owl" },
  expert: { name: "Into the Wilderness", quip: "All twenty birds, and not one got away.", tier: "gold", bird: "bald-eagle" },
};

const SPEED = {
  easy: { name: "Swift", quip: "Named for the bird, earned by you.", tier: "bronze", bird: "ruby-throated-hummingbird" },
  medium: { name: "Kingfisher Dive", quip: "In and out before the ripples settle.", tier: "silver", bird: "belted-kingfisher" },
  hard: { name: "Osprey Strike", quip: "Talons first, questions later.", tier: "gold", bird: "osprey" },
  expert: { name: "Peregrine Stoop", quip: "The fastest bird there is. Now the fastest player, too.", tier: "gold", bird: "peregrine-falcon" },
};

const difficultyName = (id) => DIFFICULTIES.find((d) => d.id === id)?.name ?? id;
/** "an Easy", "a Medium". */
const aOrAn = (word) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

export const ACHIEVEMENTS = Object.freeze([
  // ----- Boards cleared -----
  milestone("clears-1", 1, "First Flight", "Every birder remembers their first.", "bronze", "american-robin"),
  milestone("clears-10", 10, "Fledgling", "Out of the nest and flapping.", "bronze", "black-capped-chickadee"),
  milestone("clears-25", 25, "Birder", "You own binoculars now. Probably.", "silver", "tufted-titmouse"),
  milestone("clears-50", 50, "Flock Leader", "The others follow your lead.", "silver", "canada-goose"),
  milestone("clears-100", 100, "Century Flyer", "A hundred boards. Legendary migration.", "gold", "great-blue-heron"),

  // ----- Woodland firsts (trophies) -----
  ...DIFFICULTIES.map((d) => ({
    id: `first-${d.id}`,
    category: "firsts",
    name: FIRSTS[d.id].name,
    text: `Clear ${aOrAn(d.name)} board.`,
    quip: FIRSTS[d.id].quip,
    badge: { shape: "trophy", tier: FIRSTS[d.id].tier, bird: FIRSTS[d.id].bird },
    test: (s) => clears(s, d.id) >= 1,
  })),
  {
    id: "first-all",
    category: "firsts",
    name: "Full Migration",
    text: `Clear at least one board on all ${DIFFICULTIES.length} difficulties.`,
    quip: "Meadow to wilderness, every habitat conquered.",
    badge: { shape: "trophy", tier: "leaf", bird: "wood-duck" },
    test: (s) => DIFFICULTIES.every((d) => clears(s, d.id) >= 1),
    progress: (s) => count(DIFFICULTIES.filter((d) => clears(s, d.id) >= 1).length, DIFFICULTIES.length),
  },

  // ----- Field progress -----
  {
    id: "life-list",
    category: "progress",
    name: "Life List",
    text: `Clear boards featuring all ${BIRD_IDS.length} birds.`,
    quip: "Every species ticked off. A true life list.",
    badge: { shape: "rosette", tier: "gold", bird: "pileated-woodpecker" },
    test: (s) => BIRD_IDS.every((b) => s.species.includes(b)),
    progress: (s) => count(BIRD_IDS.filter((b) => s.species.includes(b)).length, BIRD_IDS.length),
  },
  {
    id: "habitats",
    category: "progress",
    name: "Habitat Hopper",
    text: `Clear every one of the ${LAYOUT_IDS.length} board layouts.`,
    quip: "From Pond to Fortress, you've perched on them all.",
    badge: { shape: "rosette", tier: "leaf", bird: "wood-duck" },
    test: (s) => LAYOUT_IDS.every((id) => s.layouts.includes(id)),
    progress: (s) => count(LAYOUT_IDS.filter((id) => s.layouts.includes(id)).length, LAYOUT_IDS.length),
  },
  {
    id: "pairs-250",
    category: "progress",
    name: "Pair Bonding",
    text: "Clear 250 pairs, counted on finished boards.",
    quip: "Birds of a feather, matched together.",
    badge: { shape: "medal", tier: "silver", bird: "northern-cardinal" },
    test: (s) => s.pairsCleared >= 250,
    progress: (s) => count(s.pairsCleared, 250),
  },
  {
    id: "pairs-1000",
    category: "progress",
    name: "Mates for Life",
    text: "Clear 1,000 pairs, counted on finished boards.",
    quip: "Like swans. Or geese. Mostly geese.",
    badge: { shape: "medal", tier: "gold", bird: "canada-goose" },
    test: (s) => s.pairsCleared >= 1000,
    progress: (s) => count(s.pairsCleared, 1000),
  },
  {
    id: "streak-12",
    category: "progress",
    name: "In the Groove",
    text: "Reach a ×12 streak (12 pairs in a row, no mismatch) on one board.",
    quip: "Twelve in a row. The chickadees are applauding.",
    badge: { shape: "rosette", tier: "sky", bird: "black-capped-chickadee" },
    test: (s) => s.bestStreak >= 12,
    progress: (s) => count(s.bestStreak, 12),
  },
  {
    id: "no-hints-10",
    category: "progress",
    name: "Sharp Eyes",
    text: "Clear 10 boards without using a hint.",
    quip: "Who needs binoculars?",
    badge: { shape: "medal", tier: "sky", bird: "red-tailed-hawk" },
    test: (s) => s.noHintClears >= 10,
    progress: (s) => count(s.noHintClears, 10),
  },
  {
    id: "flawless",
    category: "progress",
    name: "Flawless Flight",
    text: "Clear a board in one sitting with no mismatch, hint, undo, shuffle or restart.",
    quip: "Not a feather out of place.",
    badge: { shape: "rosette", tier: "gold", bird: "barred-owl" },
    test: (s) => s.flawlessClears >= 1,
  },
  {
    id: "flawless-expert",
    category: "progress",
    name: "Eagle Eye",
    text: "Clear a Hard or Expert board flawlessly.",
    quip: "Sixty tiles or more, and not one slip.",
    badge: { shape: "rosette", tier: "gold", bird: "bald-eagle" },
    test: (s) => s.flawlessBig >= 1,
  },
  {
    id: "expert-5",
    category: "progress",
    name: "Wilderness Veteran",
    text: "Clear 5 Expert boards.",
    quip: "The wilderness feels like home now.",
    badge: { shape: "trophy", tier: "silver", bird: "common-raven" },
    test: (s) => clears(s, "expert") >= 5,
    progress: (s) => count(clears(s, "expert"), 5),
  },

  // ----- Swift wings -----
  ...DIFFICULTIES.map((d) => ({
    id: `speed-${d.id}`,
    category: "speed",
    name: SPEED[d.id].name,
    text: `Clear ${aOrAn(difficultyName(d.id))} board in under ${mmss(SPEED_GOALS[d.id])}.`,
    quip: SPEED[d.id].quip,
    badge: { shape: "medal", tier: SPEED[d.id].tier, bird: SPEED[d.id].bird },
    test: (s) => Number.isFinite(s.fastest[d.id]) && s.fastest[d.id] < SPEED_GOALS[d.id],
  })),
  {
    id: "quick-wings",
    category: "speed",
    name: "Quick Wings",
    text: `Take ${BURST_PAIRS} pairs within ${BURST_WINDOW} seconds.`,
    quip: "Hummingbird reflexes: ~50 wingbeats a second.",
    badge: { shape: "rosette", tier: "cardinal", bird: "ruby-throated-hummingbird" },
    test: (s) => s.bestBurst >= BURST_PAIRS,
    progress: (s) => count(s.bestBurst, BURST_PAIRS),
  },

  // ----- Just for fun -----
  {
    id: "crow-raven",
    category: "fun",
    name: "Crow or Raven?",
    text: "Try to pair an American Crow with a Common Raven.",
    quip: "Ravens are bigger and croak. Crows caw. Easy mistake!",
    badge: { shape: "medal", tier: "cardinal", bird: "american-crow" },
    test: (s) => s.crowRaven >= 1,
  },
  {
    id: "birdbrain",
    category: "fun",
    name: "Birdbrain",
    text: "Make 10 mismatches on a single board.",
    quip: "Corvids are actually very clever. So there's hope.",
    badge: { shape: "medal", tier: "cardinal", bird: "common-raven" },
    test: (s) => s.maxMismatches >= 10,
    progress: (s) => count(s.maxMismatches, 10),
  },
  {
    id: "woodpecker",
    category: "fun",
    name: "Woodpecker Technique",
    text: "Tap blocked tiles 15 times on a single board.",
    quip: "Tap, tap, tap. Persistence is a virtue. Mostly.",
    badge: { shape: "medal", tier: "cardinal", bird: "pileated-woodpecker" },
    test: (s) => s.maxBlockedTaps >= 15,
    progress: (s) => count(s.maxBlockedTaps, 15),
  },
  {
    id: "second-thoughts",
    category: "fun",
    name: "Second Thoughts",
    text: "Undo 10 times on a single board.",
    quip: "Measure twice, peck once.",
    badge: { shape: "medal", tier: "sky", bird: "tufted-titmouse" },
    test: (s) => s.maxUndos >= 10,
    progress: (s) => count(s.maxUndos, 10),
  },
  {
    id: "binoculars",
    category: "fun",
    name: "Borrowed Binoculars",
    text: "Use 10 hints on a single board.",
    quip: "No shame. Birders share their scopes all the time.",
    badge: { shape: "medal", tier: "sky", bird: "great-blue-heron" },
    test: (s) => s.maxHints >= 10,
    progress: (s) => count(s.maxHints, 10),
  },
  {
    id: "ruffled",
    category: "fun",
    name: "Ruffled Feathers",
    text: "Get stuck and Shuffle your way out.",
    quip: "A quick shake and everything settles.",
    badge: { shape: "medal", tier: "leaf", bird: "wild-turkey" },
    test: (s) => s.shufflesUsed >= 1,
  },
  {
    id: "back-to-nest",
    category: "fun",
    name: "Back to the Nest",
    text: "Restart a board from the beginning.",
    quip: "Sometimes you have to fly home and try again.",
    badge: { shape: "medal", tier: "leaf", bird: "wood-duck" },
    test: (s) => s.restartsUsed >= 1,
  },
  {
    id: "nest-egg",
    category: "fun",
    name: "Nest Egg",
    text: "Continue a saved board later, and clear it.",
    quip: "Patience hatches results.",
    badge: { shape: "medal", tier: "bronze", bird: "canada-goose" },
    test: (s) => s.continuedClears >= 1,
  },
  {
    id: "night-owl",
    category: "fun",
    name: "Night Owl",
    text: "Clear a board between midnight and 5 a.m.",
    quip: "Who's still up? Who? Who?",
    badge: { shape: "medal", tier: "sky", bird: "great-horned-owl" },
    test: (s) => s.nightOwlClears >= 1,
  },
  {
    id: "early-bird",
    category: "fun",
    name: "Early Bird",
    text: "Clear a board between 5 and 8 a.m.",
    quip: "…gets the worm. And the high score.",
    badge: { shape: "medal", tier: "bronze", bird: "american-robin" },
    test: (s) => s.earlyBirdClears >= 1,
  },
  {
    id: "gobble",
    category: "fun",
    name: "Gobble Gobble",
    text: "Finish a board with a pair of Wild Turkeys.",
    quip: "Saved the best (and loudest) for last.",
    badge: { shape: "medal", tier: "bronze", bird: "wild-turkey" },
    test: (s) => s.turkeyFinishes >= 1,
  },
]);

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

/** IDs of every achievement the stats have earned. */
export function earnedIds(stats) {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

/** [have, need] for a progress bar, or null for a one-off achievement. */
export function progressOf(achievement, stats) {
  return achievement.progress ? achievement.progress(stats) : null;
}
