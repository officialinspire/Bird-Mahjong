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
  { id: "daily", name: "Daily habits", blurb: "Come back to the woods: days played, streaks and busy days, on your own calendar." },
  { id: "progress", name: "Field progress", blurb: "Long-term goals that fill up as you play." },
  { id: "skill", name: "Skillful play", blurb: "Clean, confident clearing: long streaks, no help needed." },
  { id: "speed", name: "Swift wings", blurb: "Time is never scored, but it can be bragged about." },
  { id: "timing", name: "Timing & tempo", blurb: "When you play, how long you play, and beating your own times." },
  { id: "birds", name: "Bird specialist", blurb: "Favourite finishes and whole families of birds." },
  { id: "fun", name: "Just for fun", blurb: "Silly, surprising and occasionally embarrassing." },
]);

/** Clear times (seconds, pause excluded) for the speed trophies. */
export const SPEED_GOALS = Object.freeze({ easy: 60, medium: 120, hard: 210, expert: 300 });

/** The faster tier, for players who've already earned the first. */
export const ELITE_SPEED_GOALS = Object.freeze({ easy: 40, medium: 80, hard: 150, expert: 210 });

/** Quick Wings: this many pairs within BURST_WINDOW seconds of board time. */
export const BURST_PAIRS = 5;
export const BURST_WINDOW = 10;
/** Hummingbird Hands: the bigger burst. */
export const BIG_BURST_PAIRS = 8;

/** Feeding Frenzy: this many boards cleared within FRENZY_MS. */
export const FRENZY_BOARDS = 3;
export const FRENZY_MS = 15 * 60 * 1000;

/** Bird families for the specialist achievements. */
export const FAMILIES = Object.freeze({
  owls: Object.freeze(["barred-owl", "great-horned-owl"]),
  raptors: Object.freeze(["bald-eagle", "osprey", "red-tailed-hawk", "peregrine-falcon"]),
  songbirds: Object.freeze(["blue-jay", "northern-cardinal", "american-robin", "black-capped-chickadee", "tufted-titmouse"]),
  waterbirds: Object.freeze(["wood-duck", "canada-goose", "great-blue-heron", "belted-kingfisher"]),
  corvids: Object.freeze(["american-crow", "common-raven"]),
});

/** Pairs cleared across a family of birds. */
export const familyPairs = (stats, family) => FAMILIES[family].reduce((n, bird) => n + (stats.birdPairs[bird] || 0), 0);

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

const ELITE = {
  easy: { name: "Chickadee Dash", quip: "Zip, zip, done.", tier: "silver", bird: "black-capped-chickadee" },
  medium: { name: "Blue Jay Blitz", quip: "Loud, bold and very, very quick.", tier: "gold", bird: "blue-jay" },
  hard: { name: "Red-tail Rush", quip: "Circling high, then straight down on target.", tier: "gold", bird: "red-tailed-hawk" },
  expert: { name: "Falcon Flash", quip: "Over 200 mph in a dive. And now you.", tier: "gold", bird: "peregrine-falcon" },
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

  // ===== Added in the second wave =====

  // ----- Daily habits -----
  ...[
    ["days-2", "Return Visit", "Clear boards on 2 different days.", "The woods are glad to see you again.", "bronze", "american-robin", (s) => s.daysPlayed, 2],
    ["streak-3", "Regular Visitor", "Clear a board 3 days in a row.", "The chickadees know your face now.", "bronze", "black-capped-chickadee", (s) => s.bestDayStreak, 3],
    ["streak-7", "Weekly Warbler", "Clear a board 7 days in a row.", "A whole week of birding. Sing it!", "silver", "northern-cardinal", (s) => s.bestDayStreak, 7],
    ["streak-14", "Fortnight Flyer", "Clear a board 14 days in a row.", "Two weeks straight. That's commitment.", "silver", "blue-jay", (s) => s.bestDayStreak, 14],
    ["streak-30", "Resident Bird", "Clear a board 30 days in a row.", "You don't migrate. You live here.", "gold", "great-horned-owl", (s) => s.bestDayStreak, 30],
    ["days-30", "Seasoned Birder", "Clear boards on 30 different days.", "A month of mornings (or evenings) in the woods.", "silver", "great-blue-heron", (s) => s.daysPlayed, 30],
    ["days-100", "Hundred-Day Birder", "Clear boards on 100 different days.", "A hundred days. The forest keeps a bench for you.", "gold", "bald-eagle", (s) => s.daysPlayed, 100],
    ["week-all", "Seven Songs", "Clear a board on every day of the week.", "Monday to Sunday, never a quiet day.", "leaf", "tufted-titmouse", (s) => s.weekdays.length, 7],
    ["weekend", "Weekend Birder", "Clear a board on a Saturday or Sunday.", "Binoculars, coffee, no alarm clock.", "sky", "wood-duck", (s) => s.weekendClears, 1],
    ["big-day", "Big Day", "Clear 5 boards in one day.", "Birders call it a Big Day: as many as you can, dawn to dusk.", "silver", "canada-goose", (s) => s.bestDayClears, 5],
    ["twitchathon", "Twitchathon", "Clear 10 boards in one day.", "Ten in a day! Did you even blink?", "gold", "peregrine-falcon", (s) => s.bestDayClears, 10],
    ["frenzy", "Feeding Frenzy", "Clear 3 boards within 15 minutes.", "Like a feeder on a frosty morning.", "cardinal", "black-capped-chickadee", (s) => s.frenzies, 1],
  ].map(([id, name, text, quip, tier, bird, value, goal]) => ({
    id, category: "daily", name, text, quip,
    badge: { shape: id.startsWith("streak-") ? "rosette" : "medal", tier, bird },
    test: (s) => value(s) >= goal,
    progress: goal > 1 ? (s) => count(value(s), goal) : undefined,
  })),

  // ----- Skillful play -----
  {
    id: "streak-20", category: "skill", name: "Unbroken Chain",
    text: "Reach a ×20 streak on one board.", quip: "Twenty links, not one broken.",
    badge: { shape: "rosette", tier: "silver", bird: "belted-kingfisher" },
    test: (s) => s.bestStreak >= 20, progress: (s) => count(s.bestStreak, 20),
  },
  {
    id: "streak-40", category: "skill", name: "Perfect Forty",
    text: "Reach a ×40 streak: a whole Expert board without a single mismatch.", quip: "Forty for forty. Absolutely immaculate.",
    badge: { shape: "rosette", tier: "gold", bird: "peregrine-falcon" },
    test: (s) => s.bestStreak >= 40, progress: (s) => count(s.bestStreak, 40),
  },
  {
    id: "no-hint-expert", category: "skill", name: "Field Guide Free",
    text: "Clear an Expert board without using a hint.", quip: "All twenty birds, and you knew every one.",
    badge: { shape: "trophy", tier: "silver", bird: "great-horned-owl" },
    test: (s) => s.noHintBy.expert >= 1,
  },
  {
    id: "no-regrets", category: "skill", name: "No Regrets",
    text: "Clear 10 boards without using Undo.", quip: "Every choice, final. Every choice, right.",
    badge: { shape: "medal", tier: "sky", bird: "osprey" },
    test: (s) => s.noUndoClears >= 10, progress: (s) => count(s.noUndoClears, 10),
  },
  {
    id: "steady-hands", category: "skill", name: "Steady Hands",
    text: "Clear 10 boards without a single mismatch.", quip: "Calm, careful, and correct.",
    badge: { shape: "medal", tier: "leaf", bird: "great-blue-heron" },
    test: (s) => s.noMismatchClears >= 10, progress: (s) => count(s.noMismatchClears, 10),
  },
  {
    id: "flawless-5", category: "skill", name: "Five Clean Flights",
    text: "Clear 5 boards flawlessly.", quip: "Five for five. Not a feather ruffled.",
    badge: { shape: "rosette", tier: "silver", bird: "barred-owl" },
    test: (s) => s.flawlessClears >= 5, progress: (s) => count(s.flawlessClears, 5),
  },
  {
    id: "flawless-all", category: "skill", name: "Immaculate Migration",
    text: `Clear a board flawlessly on all ${DIFFICULTIES.length} difficulties.`, quip: "Meadow to wilderness without a single slip.",
    badge: { shape: "trophy", tier: "gold", bird: "barred-owl" },
    test: (s) => DIFFICULTIES.every((d) => s.flawlessBy[d.id] >= 1),
    progress: (s) => count(DIFFICULTIES.filter((d) => s.flawlessBy[d.id] >= 1).length, DIFFICULTIES.length),
  },
  {
    id: "high-flyer", category: "skill", name: "High Flyer",
    text: "Score 5,000 points on a single board.", quip: "Soaring above the canopy.",
    badge: { shape: "rosette", tier: "gold", bird: "red-tailed-hawk" },
    test: (s) => s.bestScore >= 5000, progress: (s) => count(s.bestScore, 5000),
  },
  {
    id: "points-50k", category: "skill", name: "Point Collector",
    text: "Score 50,000 points in total across cleared boards.", quip: "A nest egg of points. A big one.",
    badge: { shape: "medal", tier: "gold", bird: "wood-duck" },
    test: (s) => s.totalScore >= 50000, progress: (s) => count(s.totalScore, 50000),
  },
  {
    id: "comeback", category: "skill", name: "Comeback Kid",
    text: "Clear a board after using Shuffle on it.", quip: "Stuck is just a pause before the finish.",
    badge: { shape: "medal", tier: "bronze", bird: "wild-turkey" },
    test: (s) => s.shuffleWins >= 1,
  },
  {
    id: "brink", category: "skill", name: "Back from the Brink",
    text: "Restart a board and then clear it.", quip: "Second time's the charm.",
    badge: { shape: "medal", tier: "bronze", bird: "canada-goose" },
    test: (s) => s.restartWins >= 1,
  },

  // ----- Swift wings: the faster tier -----
  ...DIFFICULTIES.map((d) => ({
    id: `speed-${d.id}-elite`,
    category: "speed",
    name: ELITE[d.id].name,
    text: `Clear ${aOrAn(d.name)} board in under ${mmss(ELITE_SPEED_GOALS[d.id])}.`,
    quip: ELITE[d.id].quip,
    badge: { shape: "rosette", tier: ELITE[d.id].tier, bird: ELITE[d.id].bird },
    test: (s) => Number.isFinite(s.fastest[d.id]) && s.fastest[d.id] < ELITE_SPEED_GOALS[d.id],
  })),
  {
    id: "hummingbird-hands", category: "speed", name: "Hummingbird Hands",
    text: `Take ${BIG_BURST_PAIRS} pairs within ${BURST_WINDOW} seconds.`, quip: "A blur of wings. Were those even your fingers?",
    badge: { shape: "rosette", tier: "gold", bird: "ruby-throated-hummingbird" },
    test: (s) => s.bestBurst >= BIG_BURST_PAIRS, progress: (s) => count(s.bestBurst, BIG_BURST_PAIRS),
  },

  // ----- Timing & tempo -----
  {
    id: "personal-best", category: "timing", name: "Personal Best",
    text: "Beat your own fastest time on any difficulty.", quip: "Faster than yesterday's you.",
    badge: { shape: "medal", tier: "silver", bird: "belted-kingfisher" },
    test: (s) => s.personalBests >= 1,
  },
  {
    id: "pb-10", category: "timing", name: "Always Improving",
    text: "Set 10 new personal-best times.", quip: "Ten times faster than before. Well, ten times.",
    badge: { shape: "rosette", tier: "gold", bird: "osprey" },
    test: (s) => s.personalBests >= 10, progress: (s) => count(s.personalBests, 10),
  },
  {
    id: "photo-finish", category: "timing", name: "Photo Finish",
    text: "Beat your fastest time on a difficulty by just one second.", quip: "By a beak!",
    badge: { shape: "medal", tier: "cardinal", bird: "ruby-throated-hummingbird" },
    test: (s) => s.photoFinishes >= 1,
  },
  {
    id: "slow-steady", category: "timing", name: "Slow and Steady",
    text: "Take more than 20 minutes over a single board (pauses don't count).", quip: "The heron waits. The heron always gets there.",
    badge: { shape: "medal", tier: "sky", bird: "great-blue-heron" },
    test: (s) => s.longestClear >= 20 * 60,
  },
  {
    id: "marathon", category: "timing", name: "Marathon Migration",
    text: "Spend 2 hours in total clearing boards.", quip: "Geese fly thousands of miles. You're getting there.",
    badge: { shape: "rosette", tier: "silver", bird: "canada-goose" },
    test: (s) => s.totalSeconds >= 2 * 60 * 60, progress: (s) => count(Math.floor(s.totalSeconds / 60), 120),
  },
  {
    id: "lunch", category: "timing", name: "Lunch Break Birder",
    text: "Clear a board between noon and 2 p.m.", quip: "Sandwich in one hand, birds in the other.",
    badge: { shape: "medal", tier: "bronze", bird: "blue-jay" },
    test: (s) => s.lunchClears >= 1,
  },
  {
    id: "evening", category: "timing", name: "Evening Chorus",
    text: "Clear a board between 6 and 8 p.m.", quip: "The robins always sing last.",
    badge: { shape: "medal", tier: "sky", bird: "american-robin" },
    test: (s) => s.eveningClears >= 1,
  },

  // ----- Bird specialist -----
  ...[
    ["finish-eagle", "The Eagle Has Landed", ["bald-eagle"], "a pair of Bald Eagles", "One small step for birds.", "gold", "bald-eagle"],
    ["finish-owl", "Hoot Finale", FAMILIES.owls, "a pair of owls", "Who finished it? You did. Who? You!", "silver", "barred-owl"],
    ["finish-goose", "Honk If You're Done", ["canada-goose"], "a pair of Canada Geese", "HONK. (That means well done.)", "bronze", "canada-goose"],
    ["finish-hummingbird", "Tiny Triumph", ["ruby-throated-hummingbird"], "a pair of Hummingbirds", "The smallest bird, the biggest finish.", "cardinal", "ruby-throated-hummingbird"],
    ["finish-cardinal", "Cardinal Rule", ["northern-cardinal"], "a pair of Cardinals", "Rule one: always finish in style.", "cardinal", "northern-cardinal"],
    ["finish-duck", "Lucky Duck", ["wood-duck"], "a pair of Wood Ducks", "Just ducky.", "leaf", "wood-duck"],
  ].map(([id, name, birds, what, quip, tier, bird]) => ({
    id, category: "birds", name, quip,
    text: `Finish a board with ${what}.`,
    badge: { shape: "medal", tier, bird },
    test: (s) => birds.some((b) => s.finishBirds.includes(b)),
  })),
  {
    id: "finale-10", category: "birds", name: "Grand Finale Collector",
    text: "Finish boards on 10 different birds.", quip: "Ten different closing acts. Encore!",
    badge: { shape: "rosette", tier: "gold", bird: "pileated-woodpecker" },
    test: (s) => s.finishBirds.length >= 10, progress: (s) => count(s.finishBirds.length, 10),
  },
  ...[
    ["owl-prowl", "Owl Prowl", "owls", 50, "owl", "Night shift complete.", "silver", "great-horned-owl"],
    ["raptors", "Raptor Rapture", "raptors", 100, "raptor (eagle, osprey, hawk and falcon)", "Sharp eyes, sharper talons.", "gold", "red-tailed-hawk"],
    ["songbirds", "Songbird Serenade", "songbirds", 100, "songbird (jay, cardinal, robin, chickadee and titmouse)", "A hundred pairs, a thousand songs.", "gold", "northern-cardinal"],
    ["waterbirds", "Waterside Watcher", "waterbirds", 100, "waterbird (duck, goose, heron and kingfisher)", "Patient by the water's edge.", "gold", "belted-kingfisher"],
  ].map(([id, name, family, goal, what, quip, tier, bird]) => ({
    id, category: "birds", name, quip,
    text: `Clear ${goal} ${what} pairs on finished boards.`,
    badge: { shape: "rosette", tier, bird },
    test: (s) => familyPairs(s, family) >= goal,
    progress: (s) => count(familyPairs(s, family), goal),
  })),
  {
    id: "corvids", category: "birds", name: "Know Your Corvids",
    text: "Clear a board with both crows and ravens without ever mixing them up.", quip: "Wedge tail: raven. Fan tail: crow. You've got it.",
    badge: { shape: "medal", tier: "silver", bird: "american-crow" },
    test: (s) => s.corvidClears >= 1,
  },

  // ----- Just for fun -----
  {
    id: "change-of-heart", category: "fun", name: "Change of Heart",
    text: "Deselect a tile 10 times on a single board.", quip: "This one. No, that one. No, this one…",
    badge: { shape: "medal", tier: "cardinal", bird: "tufted-titmouse" },
    test: (s) => s.maxDeselects >= 10, progress: (s) => count(s.maxDeselects, 10),
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
