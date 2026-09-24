# Bird Mahjong

A woodland tile-matching game in vanilla HTML/CSS/JS — no framework, no build
step, no runtime CDN — hosted on GitHub Pages.

**Status:** playable. All four boards, hint / shuffle / undo, scoring and
results work.

`bird-mahjong-tiles.jpg` is the original 5 × 4 tile sheet. It is kept as-is and
is only ever **read** by the tooling; every other image is derived from it.

## Layout

```
bird-mahjong-tiles.jpg     original sheet (source of truth, never modified)
index.html                 the game (app shell)
css/app.css                palette, layout, floating-tile background
js/app.js                  screen flow, settings, keyboard handling
js/ui/board-view.js        DOM board: tile placement, states, zoom/pan, input
js/ui/game-controller.js   connects js/game logic to the board, timer, messages
js/ui/bird-names.js        display names and short on-tile labels
js/config.js               difficulty levels
js/settings.js             settings persisted in localStorage
js/background.js           slowly drifting bird tiles behind the UI
tiles.html                 tile reference gallery (css/gallery.css, js/gallery.js)
data/tiles.json            tile ID ↔ name mapping (hand-maintained)
data/crops.json            measured crop boxes (generated)
assets/tiles/NN-<id>.png   20 individual tiles, RGBA (generated)
assets/tiles-sm/NN-<id>.webp  120px-wide copies for the UI (generated)
assets/tiles-md/NN-<id>.webp  full-resolution WebP for zoomed boards (generated)
assets/contact-sheet.png   labelled overview of all crops (generated)
tools/crop_tiles.py        cropping script
tools/verify_crops.py      crop sanity checks
tools/requirements.txt     Python deps for the tools only
js/game/                   pure game logic (no DOM): geometry, rules, generator, game
tests/                     unit tests for the game logic (node --test)
tools/verify-layout.mjs    responsive layout checks (Playwright)
tools/verify-play.mjs      touch and mouse play checks (Playwright)
package.json               dev-only scripts; the site itself needs no npm
```

All paths in the site are relative, so it works both at a user/org root and
under a project sub-path like `https://<user>.github.io/Bird-Mahjong/`.

## Tile IDs

Tiles are numbered row-major from the top-left of the sheet. File names are
`NN-<id>.png`; the `id` is the stable key used in code.

| #  | ID | Name | # | ID | Name |
|----|----|------|---|----|------|
| 01 | `bald-eagle` | Bald Eagle | 11 | `american-robin` | American Robin |
| 02 | `osprey` | Osprey | 12 | `black-capped-chickadee` | Black-capped Chickadee |
| 03 | `red-tailed-hawk` | Red-tailed Hawk | 13 | `tufted-titmouse` | Tufted Titmouse |
| 04 | `peregrine-falcon` | Peregrine Falcon | 14 | `pileated-woodpecker` | Pileated Woodpecker |
| 05 | `barred-owl` | Barred Owl | 15 | `belted-kingfisher` | Belted Kingfisher |
| 06 | `great-horned-owl` | Great Horned Owl | 16 | `great-blue-heron` | Great Blue Heron |
| 07 | `american-crow` | American Crow | 17 | `wood-duck` | Wood Duck |
| 08 | `common-raven` | Common Raven | 18 | `wild-turkey` | Wild Turkey |
| 09 | `blue-jay` | Blue Jay | 19 | `canada-goose` | Canada Goose |
| 10 | `northern-cardinal` | Northern Cardinal | 20 | `ruby-throated-hummingbird` | Ruby-throated Hummingbird |

**Telling the two dark birds apart** (row 2, columns 2 and 3):

- **07 American Crow** – slimmer, shorter bill; smooth throat; framed by pine
  boughs on both sides, no conifer trees in the background.
- **08 Common Raven** – heavier, deeper, more hooked bill; shaggy throat
  feathers; bulkier body; spruce trees on both sides.

`data/tiles.json` also carries a short `notes` field with visual cues for every
tile, and the contact sheet labels each crop with its number, name and ID.

![Contact sheet](assets/contact-sheet.png)

## App shell

The flow is the same as our Sudoku and Deja Vu games:

**Start** (touch, click or any key) → **Main menu** → **New Game** →
**Difficulty** (Easy · Meadow, Medium · Twin Groves, Hard · Old Growth) →
**Game** → **Results**. **How to Play** and
**Settings** open from the menu; each has a ← Menu button.

- **Game** has a header (☰ menu, difficulty, pause), stats (pairs left, score,
  streak), a status line, the board and a Hint / Shuffle / Undo toolbar. The ☰
  button pauses rather than leaving, so a stray tap can't end a game. No clock
  is shown during play.
- **Results** shows the score, your best score for that difficulty (★ when
  it's a new best), pairs, best streak, and your time and fastest time as
  personal stats.
- **Escape** pauses in-game and goes back to the menu from any other screen.
- **Settings** (saved in `localStorage`): Motion (Match device / Reduced /
  Full), floating background birds on/off, short bird-name labels on tiles,
  and the streak bonus on/off.
- **Continue** stays disabled until there is a saved game to resume.
- The Sudoku and Deja Vu intro video and INSPIRE logo aren't used here, because
  this repo doesn't include them. Add the files to reuse the intro step.

**Palette:** warm ivory `#fbf6e8` backgrounds, leaf green `#3d7a35` for primary
actions, sky blue `#4f97c7` / `#235f87` for secondary accents, and cardinal red
`#b3312b` kept for the brand word, focus rings and destructive links. Every
text pair meets WCAG AA contrast.

**Layout** is mobile first, with breakpoints at 700px (tablet: side-by-side
panel headers, two-column difficulty grid) and 1024px (desktop: two-column
menu, stats sidebar beside the board). Safe-area insets are respected.

**Floating tiles:** 8–14 small tiles (more on wider screens) rise slowly
(70–110 s per pass) at low opacity behind every screen, dimmed further during a
game. When reduced motion is on, from the OS or from Settings, they stay still
in a static scatter and screen fades are turned off. *Full* in Settings
overrides the OS preference.

## Playing on the board

Tap or click a free tile, then its matching free tile, to remove both.

**Tile states**, each shown by more than colour:

| State | How it looks | ARIA |
|-------|--------------|------|
| Free | Full colour and raised; lifts under a mouse | focusable button |
| Selected | Lifted, with a thick double ring and a ✓ badge | `aria-pressed="true"` |
| Blocked / covered | Desaturated, with a diagonal stripe pattern and a not-allowed cursor | `aria-disabled="true"`, label ends "blocked" or "covered" |
| Hint | Dashed ring and a "?" badge | label ends "hint" |

**Feedback.** The status line (`role="status"`) names what happened, e.g.
"Blue Jay selected — tap its twin", "That Osprey is covered by another tile",
or "Matched a pair of Canada Geese". Matched tiles float up and fade, and a
blocked tap gives the tile a small wiggle. With reduced motion there's no
movement, only the status text and an instant removal. The line is a fixed
two lines tall, so messages never move the board.

**Accidental input guards**

- A second tap on the same tile within 350 ms is ignored, so a double tap
  doesn't select and then deselect.
- After a match, taps are ignored for the length of the removal animation, so
  a quick extra tap can't land on the tile that was underneath.
- Taps on the board background, stats or other empty space do nothing.
- Dragging with a mouse or swiping with a finger pans the board and never
  selects a tile.
- Long-press menus, text selection and double-tap zoom are turned off on the
  board.
- ☰ and pause both open the pause dialog; the game also pauses when the tab
  or app is hidden.

**Fit, zoom and pan.** The board is sized to fit its frame. If a layout would
need tiles narrower than 40px (`MIN_TILE` in `js/ui/board-view.js`), it opens
at 40px and becomes pannable, and − / Fit / + zoom controls appear. Zoom steps
are 1.25× from "whole board" up to 110px tiles, and each step keeps the centre
of the view in place. Panning is native scrolling inside the board frame
(touch or wheel) or a mouse drag; the page itself never scrolls or zooms. The
board is laid out at the zoomed size rather than CSS-scaled, so tap targets
and images stay exact. Zoomed tiles load the full-resolution WebP through
`srcset`.

`?seed=123` in the URL replays a specific first board, which is handy for
sharing a deal or reproducing a bug.

## Game logic

`js/game/` is plain ES modules with no DOM access, so it runs unchanged in the
browser and in Node tests.

| Module | What it does |
|--------|--------------|
| `geometry.js` | Preset board layouts and the precomputed cover/left/right links between tiles |
| `rules.js` | `isFree`, `isCovered`, `isSideBlocked`, `birdsMatch`, `canRemovePair`, `availableMatches` |
| `generator.js` | Solvable board generation (`generateBoard`) and re-dealing for Shuffle |
| `game.js` | Immutable game state plus actions: `createGame`, `selectTile`, `removePair`, `undo`, `useHint`, `shuffleRemaining`, `isWon`, `isStuck` |
| `birds.js`, `rng.js` | Bird IDs (in sheet order) and a seeded PRNG |

**Rules**

- Positions use half-tile units: a tile at `(x, y, z)` covers a 2×2 block of
  cells, so upper layers and wing tiles can sit half a tile off the grid.
- A tile is **covered** when any tile on a higher layer overlaps its footprint.
- A tile is **side-blocked** when tiles on its own layer touch *both* its left
  and right edges. A tile offset by half a row still touches.
- A tile is **selectable (free)** only when it is not covered and not
  side-blocked.
- Two tiles **match** only when they have exactly the same bird ID. Look-alikes
  like the crow and raven never match.

**Layouts**

| Difficulty | Layout | Tiles | Birds | Layers (tiles per layer) | Shape |
|------------|--------|-------|-------|--------------------------|-------|
| Easy | `meadow` | 24 | 6 | 3 (18/4/2) | a low diamond (rows of 2-4-6-4-2) with a small raised centre |
| Medium | `twin-groves` | 40 | 10 | 3 (30/8/2) | two 3-layer peaks at opposite ends of a flat 4×3 clearing |
| Hard | `old-growth` | 60 | 15 | 5 (34/12/8/4/2) | a tall tower: 8×4 base with side wings, then 6×2, 4×2, 2×2 and a 2-tile crown |

Every bird appears exactly four times.

**Easy uses visually distinct birds.** Easy draws its 6 birds from
`EASY_BIRDS`, a pool of 8 with clearly different colours and silhouettes:
cardinal, blue jay, robin, wood duck, hummingbird, Canada goose, bald eagle and
great blue heron. `LOOKALIKE_GROUPS` in `js/game/birds.js` lists birds that are
easy to confuse: the dark crow, raven and turkey; the two owls; the small grey
songbirds; the brown-and-white raptors; the blue crests; and the red crests. The
Easy pool has at most one bird from each group and never the crow or raven.
Medium and Hard draw from all 20.

**Scoring** (`js/game/score.js`) has no countdown, no lives, no failure screen
and no time penalty.

- Every pair is worth **+100**.
- **Streak bonus** (optional; on by default, switch it off in Settings):
  matching pairs in a row without a mismatch adds +10 for the second pair, +20
  for the third, and so on, up to +50 a pair. A mismatch resets the streak but
  never subtracts points.
- Hints and shuffles are free. Undo takes back exactly the points and streak
  from that pair.
- Elapsed time is measured (pausing stops it) but is shown only on the results
  screen, as a personal stat.

A clean clear therefore scores 1,650 on Easy, 2,850 on Medium and 4,350 on
Hard; with the streak bonus off, it's a flat 100 per pair.

**Personal bests** (`js/best-scores.js`) are kept in `localStorage` separately
for each difficulty: the best score, the fastest time and the number of
clears. The difficulty picker shows each difficulty's best score, and results
show whether you beat it. If storage is blocked, bests last for the session.

**Solvable by construction.** `generateBoard` never deals birds at random and
hopes. Instead it:

1. Searches for a legal order to clear the *empty* geometry two free tiles at
   a time. This is a randomized depth-first search that tries higher layers
   first and backtracks out of dead ends, with a node budget and restarts.
2. Gives each pair in that order a bird. Every bird gets exactly two pairs,
   which makes four copies.

Replaying those pairs in order always clears the board, so each new board
carries its `solution`. Boards are reproducible from a `seed`. Shuffle uses the
same method on the remaining tiles, so a shuffled board is always solvable too.

Run `npm run test:logic`, or `node --test "tests/*.test.js"`, to run the tests.
They need no dependencies. The tests cover:

- blocked, covered and free tiles, including half-tile offsets, and matching
- 200 seeds per layout, plus 300 per difficulty: exactly four copies per bird,
  and the solution replayed independently through the rules
- difficulty sizes (24/6, 40/10, 60/15), and that the three layouts really
  differ in shape
- Easy never deals the crow or raven, or two look-alikes
- scoring: +100 per pair, the capped streak bonus and the switch that turns it
  off, no time or help penalties, and undo taking back exact points
- personal bests per difficulty, including corrupt and blocked storage
- dead-end backtracking, and provably unsolvable geometries
- select, deselect, mismatch, match, undo, hint, stuck and shuffle

## Running locally

Serve the folder over HTTP rather than opening `index.html` from disk. The app
uses ES modules and `fetch`, and browsers block both on `file://`:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

(Any static server works, e.g. `npx serve`.)

## Regenerating the tile assets

The tiles on the sheet are not on an exact grid — positions drift by several
pixels and sizes vary (roughly 191–213 × 265–272 px). `tools/crop_tiles.py`
therefore measures each tile instead of cutting equal cells:

1. thresholds the sheet (bright tile vs. near-black background),
2. finds the gutters between rows, then between columns within each row,
3. takes the tight bounding box of the tile inside each cell (+2 px padding),
4. flood-fills the background from the crop edges to make the rounded corners
   transparent.

```sh
python3 -m venv .venv && . .venv/bin/activate   # optional
pip install -r tools/requirements.txt
python3 tools/crop_tiles.py     # writes assets/tiles(-sm), contact sheet, data/crops.json
python3 tools/verify_crops.py   # exits non-zero if any crop looks wrong
```

Output is deterministic: re-running the script produces byte-identical files.
`verify_crops.py` checks that no tile pixels lie just outside any box (no
clipping), crop edges are background (no neighbour bleed), boxes don't overlap,
corners are transparent and the tile face is fully opaque. To rename a bird,
edit `data/tiles.json` and re-run the script.

## Checking the layout

`tools/verify-layout.mjs` serves the repo under a Pages-style sub-path
(`/Bird-Mahjong/`) and walks every screen in Chromium. It uses eight
viewports: 320×568, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1280×720
and 1920×1080. It fails if it finds:

- horizontal overflow
- a control that is off-screen, covered, or shorter than 44px
- a start screen that doesn't fit without scrolling
- any failed or external request, or a console error

It also checks that the background animates by default and stays still under
OS or in-app reduced motion, that settings survive a reload, and the keyboard
flow (any key to start, Escape to pause and to go back).

```sh
npm install                      # installs Playwright (dev only)
npx playwright install chromium  # or set CHROMIUM_PATH=/path/to/chrome
npm run test:layout -- shots/    # optional dir for per-screen screenshots
npm test                         # logic, crops, layout and play checks
```

## Checking play

`tools/verify-play.mjs` plays real seeded games in Chromium, working out each
board's solution from the same pure logic. It checks:

- **Readability:** on six viewports × three difficulties, tiles are at least
  40px wide, zoom appears only when a board can't fit, the page never
  scrolls, and every free tile can actually be hit (not hidden under another
  tile).
- **Touch (390px phone) and mouse (desktop):** blocked taps don't select and
  show the stripe pattern and ARIA state; selection shows the ✓ badge; the
  double-tap guard works; background taps are ignored. Also mismatch, match
  (+100 and the pairs-left counter), undo (points returned), hint and
  shuffle.
- **Zoom and pan (320px phone, Hard):** Fit, +, −, a zoom maximum, a real
  touch swipe that pans without selecting, and a mouse drag that pans without
  selecting.
- **Full games:** Hard won by touch taps on a 320px phone, and Medium won by
  mouse clicks on desktop. Both end on the results screen with the maximum
  clean-clear score.
- **Bests and time:** no clock is shown during play. A first clear sets the
  best, and the picker shows it only for that difficulty. Medium keeps its own
  best, and a higher Easy score replaces the Easy best. Time is labelled as
  personal only.

```sh
npm run test:play -- shots/      # optional dir for screenshots
```

## Deploying to GitHub Pages

1. Push to GitHub.
2. Repository **Settings → Pages → Build and deployment**: Source *Deploy from a
   branch*, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

A `.nojekyll` file is included so Pages serves the files as-is.
