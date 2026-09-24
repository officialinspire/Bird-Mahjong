# Bird Mahjong

A woodland tile-matching game in vanilla HTML/CSS/JS — no framework, no build
step, no runtime CDN — hosted on GitHub Pages.

**Play it:** <https://officialinspire.github.io/Bird-Mahjong/>. It installs as
an app and works offline after the first visit.

**Status:** released. There are three difficulties (Easy 24 tiles, Medium 40,
Hard 60). The game has hint, undo, shuffle and restart, autosave with
Continue, optional sound and animation, keyboard play, and offline install.
Every generated board has a verified solution.

## Controls

| Action | Touch / mouse | Keyboard |
|--------|---------------|----------|
| Start | Tap or click anywhere on the start screen | Any key |
| Select a tile | Tap or click a **free** tile (bright, not striped) | Tab to the board, then arrows to move, then Enter or Space |
| Take a pair | Select its twin (exactly the same bird) | Same |
| Deselect | Tap the selected tile again | Enter or Space on it again |
| Hint | **Hint** button | H |
| Undo | **Undo** button (also offered when you're stuck) | U or Ctrl/⌘+Z |
| Pause | **Pause** or ☰ | Esc |
| New board | **New Game** (asks first if you've made progress) | Tab to it, then Enter |
| Look around a big board | Swipe or drag inside the board | Arrow keys (the view follows focus) |
| Zoom | − / Fit / + (shown when a board can't fit at a readable size) | Tab to them |
| Out of pairs | **Shuffle tiles**, or **Restart Board** if no shuffle can help | Focus moves to the offer |
| Resume later | Close the tab or app; **Continue** on the menu | — |

A tile is **free** when nothing sits on top of it and its left or right side
is open. Blocked tiles are faded and striped; the selected tile has a ring and
a ✓; hinted tiles have a dashed ring and a "?".

## Known limits

- **Offline needs one online visit.** The first load must succeed online. After
  that the whole game (and the tile gallery, once opened) works offline.
- **Big boards pan on phones.** Tiles never shrink below 40px, so on narrow
  phones Medium and Hard open zoomed in, and you swipe to see the rest (Fit
  shows the whole board, smaller). Easy fits on every phone tested.
- **Tile labels are short.** With *Show bird names on tiles* on and the
  smallest tiles, longer names can be cut off ("Woodpe…"). Screen readers
  always get the full name and a description.
- **Undo can forgive a mismatch.** Undoing right after a mismatch restores the
  streak from before the last pair. There are no penalties, so it's left that
  way.
- **Local only.** Saves, settings and best scores live in this browser on this
  device. There are no accounts or sync, and clearing site data removes them.
  In private browsing or with blocked storage the game still plays, but
  nothing is kept after the tab closes (Settings says so).
- **Updates wait for a refresh.** A new version downloads in the background and
  is offered with a *Refresh* banner. If you pick *Later*, it applies the next
  time the app is opened fresh.
- **iOS has no install prompt.** On iPhone and iPad, use Share → *Add to Home
  Screen*.
- **No intro video or logo.** The Sudoku / Deja Vu intro video and INSPIRE logo
  aren't part of this repo, so they aren't shown.
- **One game per tab.** Playing in two tabs at once saves over the same slot;
  the most recent change wins.

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
js/ui/bird-names.js        display names, short on-tile labels, spoken visual cues
js/ui/sound.js             optional sound effects + music (Web Audio, synthesized fallback)
js/ui/music.js             recorded music: crossfades, seamless loops, refusals
js/config.js               difficulty levels, audio files
js/settings.js             settings persisted in localStorage
js/storage.js              one safe wrapper around localStorage (memory fallback)
js/saved-game.js           the autosaved board (Continue)
js/best-scores.js          best score, fastest time and clears per difficulty
js/game/save-format.js     game state <-> JSON, with strict validation
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
tools/verify-save.mjs      autosave / Continue checks with real reloads (Playwright)
tools/verify-polish.mjs    keyboard, labels, sound, animation, contrast checks (Playwright)
tools/verify-offline.mjs   offline, install and update checks (Playwright)
tools/verify-music.mjs     recorded music transitions with the real MP3s (Playwright)
tools/make_bird_calls.py   rebuilds the bird-call clips in assets/audio/ (see CREDITS.md)
tools/build-sw.mjs         writes sw.js's precache list + content-hash VERSION
tools/make_icons.py        builds icons/ from the cropped tiles
manifest.webmanifest       install metadata (relative start_url / scope)
sw.js                      service worker: offline cache + safe updates
js/pwa.js                  registers sw.js, update banner, Install button
icons/                     app icons (generated)
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

- **Game** has a header (☰ menu and difficulty), stats (pairs left, score,
  streak), a status line, the board and a **Hint · Undo · Pause · New Game**
  toolbar. The ☰ button pauses rather than leaving, so a stray tap can't end a
  game. No clock is shown during play. See *Help and recovery* below.
- **Results** shows the score, your best score for that difficulty (★ when
  it's a new best), pairs, best streak, and your time and fastest time as
  personal stats.
- **Escape** pauses in-game and goes back to the menu from any other screen.
- **Settings** (saved in `localStorage`): Animations (Match device / Minimal /
  Full), Music and Sound effects (each on/off + volume), floating background birds, short bird-name
  labels on tiles, and the streak bonus.
- **Continue** resumes the autosaved board; see *Saving* below.
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

## Calm polish: sound, animation and access

**Animations** (Settings → Animations: Match device / Minimal / Full):

- On a match, the two tiles lift and fade (~0.3 s), and a small "+points" tag
  floats up from them.
- Clearing a board brings a restrained ~1.5 s moment: a soft glow and a dozen
  feathers in the palette colours drift up, a gentle chime plays, and then the
  results appear.
- *Match device* follows `prefers-reduced-motion`. *Minimal* (or the OS
  preference) removes all movement: no floats, no feathers, no drifting
  background, no screen fades, and results appear about 0.25 s after the last
  match. *Full* overrides the OS preference.

**Music and Sound effects** each have their own switch and volume in
Settings. Sound effects are synthesized with Web Audio in `js/ui/sound.js`.
Music uses the two recorded tracks in the repo root, played by
`js/ui/music.js`, with a synthesized ambience as the fallback.

- **Sound effects:** short two-note chirps for matches (pitched slightly
  differently per bird), a soft tick to select, a low tap for a blocked or
  mismatched tile, rising notes for a hint, a flutter for a shuffle, and a
  four-note chime with a chirp for a clear. Turning effects on, or moving
  their volume, plays a sample.
- **Music:** *Bird Mahjong - Gentle Canopy.mp3* plays on the start screen,
  menus and pause. *Bird Mahjong - Forest Breeze.mp3* plays during a game.
  - **Crossfades:** changing tracks crossfades over 1 second. Changing screens
    quickly never stacks tracks. Each new fade starts from the current level
    and cancels the old one, so only one track is ever heading up.
  - **No restarts:** returning to a track that is still playing or fading out
    turns it around. Pausing and resuming a game continues Forest Breeze from
    the same place.
  - **Looping:** each track has two `<audio>` voices. Just before one ends,
    its twin starts from the top with a 0.35 s overlap, so the loop has no gap.
  - **Streaming:** the tracks stream from `<audio>` elements routed through
    Web Audio, so the Music switch, its volume and instant mute all apply.
    Nothing is decoded into memory.
  - **If `play()` is refused:** when the browser says there was no gesture
    yet, the next tap or key press retries. Any other failure (unsupported
    format, missing file) switches that scene to the synthesized ambience,
    which is a slow pentatonic woodland pad with the odd distant bird call.
- **Two channels:** effects and music run on separate audio channels under
  one master volume, so their volumes are independent.
- **When audio starts:** nothing is created until the first tap or key press,
  and only if Music or Sound effects is on. With both off, no `AudioContext`
  exists at all. A hidden tab pauses the music and silences effects, and both
  resume from the same place when you return.
- **Muting is immediate:** switching either off drops that channel to zero at
  the current audio time, cancels any fade, and stops every sound still
  playing on it. For music, the tracks pause (and the synthesized scheduler
  stops). Volume sliders
  act live while you drag them.
- **Older saves:** they had one *Sound* switch and volume, which carry over to
  Sound effects. Music starts on at 40%.
- **Changing the audio files:** list them in `AUDIO_FILES` in
  `js/config.js`. Music goes under `music: { menu, game }`, and recorded
  effects under `sfx`, e.g. `sfx: { match: "assets/audio/match.mp3" }`. Then
  run `npm run build:sw`. It precaches every `.mp3` in the repo root and
  everything in `assets/audio/` for offline play.

  Files are fetched only after the first gesture. Any that are missing or fail
  to play keep the synthesized sound, so the synthesized sounds are always the
  fallback.
- **Bird calls:** `assets/audio/` holds five short real calls, named by tile
  ID: `american-crow`, `common-raven`, `bald-eagle`, `northern-cardinal` and
  `wood-duck` (1–2.5 s each, 8–18 KB). They come from Wikimedia Commons and
  are public domain, except the Wood Duck, which is CC BY-SA 3.0. The game
  doesn't play them yet.
  - `assets/audio/CREDITS.md` lists each clip's source page, creator, license
    and edits.
  - `python3 tools/make_bird_calls.py` rebuilds them from the sources. It
    needs `pip install numpy imageio-ffmpeg`.

**The game is identical without any of it.** With Music and Sound effects off
and Animations on Minimal, every rule, score and control is unchanged; the
tests play a full game that way.

**Keyboard**

- The board is a single Tab stop (roving tabindex). The arrow keys move
  between free tiles by what's on screen, and Home and End jump to the first
  and last free tile.
- Enter or Space selects; H is Hint; U or Ctrl/⌘+Z is Undo; Esc is Pause.
- After a match, focus moves to the nearest free tile. On a zoomed board the
  focused tile scrolls into view.
- The focused tile gets a thick cardinal ring, and is always drawn above its
  neighbours.

**Labels.** Each tile's accessible name gives its bird and state ("Common
Raven, free", or "…, covered" / "blocked" / "selected" / "hint"). Its
`aria-description` adds a short visual cue ("heavy hooked bill and shaggy
throat, spruce trees") and the layer, so look-alike birds can be told apart
without sight.

**Touch targets and contrast**

- Buttons, switches and the volume slider are at least 44px tall.
- Tiles are at least 40px wide and about 51px tall, and a board zooms rather
  than shrinking below that.
- `tests/contrast.test.js` reads the palette from `css/app.css` and requires
  AA (4.5:1) for every text pairing. That includes text over the sky-tinted
  top of the page, which is why eyebrow labels use the darker leaf green.
- The browser check measures the rendered contrast of every piece of text on
  every screen.

## Help and recovery

None of these punish the player.

| Control | What it does |
|---------|--------------|
| **Hint** | Highlights one pair you can legally take right now (dashed ring and "?"). Score and streak are unchanged. While the board's verified route is intact, the hint is the next pair on it, so following hints always finishes the board. Once you've left the route, it suggests a legal pair that doesn't immediately leave the board stuck. |
| **Undo** | Puts the last removed pair back, along with exactly the score, streak and best streak from before it. You can undo all the way back, even after a shuffle, because removed tiles keep their birds. |
| **Pause** | Opens the pause dialog: Resume, Restart Board, New Game or Main Menu. The ☰ button and Escape do the same, and the game pauses when the tab is hidden. |
| **New Game** | Deals a fresh board of the same difficulty. If you've matched anything, it asks first, with *Keep playing* focused. |

**Stuck boards.** After every change the game checks whether any legal
matching pair is left. If none is, a friendly panel slides up over the board
(a bottom sheet on phones), and keyboard focus moves to its main button.

- **Shuffle tiles:** shown when a re-deal can help. It reassigns bird IDs on
  the remaining positions only; the same birds stay in play. It first searches
  for an order that clears those positions, then deals the birds along that
  order, then replays the whole route through the rules before accepting it
  (`shuffleRemaining` + `verifyRoute` in `js/game/game.js`). Score, streak,
  pairs left and undo history are kept.
- **Restart Board:** shown instead when no deal of the remaining positions can
  be cleared, for example one tile stacked on its only twin. It returns to this
  board's original deal and route, with a fresh score.
- **Undo pair** is offered in both cases.

`recoveryFor(state)` decides which offer to show: `"none"`, `"shuffle"` or
`"restart"`.

## Saving

Everything is stored locally in the browser. There are no accounts and no
server.

| Key (`localStorage`) | What |
|----------------------|------|
| `inspireBirdMahjong:v1:save` | The board in progress: difficulty, every tile's bird, removed tiles, selected tile, score, streak, undo history (with each pair's points), hint/shuffle/restart counts, the verified route, the original deal, and elapsed time |
| `inspireBirdMahjong:v1:bests` | Per difficulty: best score, fastest time, and boards cleared |
| `inspireBirdMahjong:v1:settings` | Motion, background birds, tile labels, streak bonus |

- **Autosave** happens after every change on the board (match, mismatch,
  selection, undo, hint, shuffle, restart), on pause, when leaving the game
  screen, and when the page is hidden or closed (`pagehide`). The saved time
  includes the play time so far.
- **Continue** on the menu is enabled only for a valid save, and shows what it
  resumes, e.g. "Hard · 26 pairs left · 460 pts". It restores the exact
  playable state: the same tiles and birds, the selection, score and streak,
  the undo history (you can keep undoing), a stuck board's recovery offer, and
  the clock picks up where it left off.
- A **win** clears the save and adds to that difficulty's clears and bests.
  Starting a new board replaces the save; the difficulty picker warns you when
  one exists.

**Bad or missing storage is handled quietly.**

- `js/storage.js` probes `localStorage` once. If it's missing, throws on
  access (blocked site data), or rejects writes (private mode, quota), an
  in-memory store takes over. The game still runs, Continue works for the
  session, and Settings shows a note that nothing will be kept after the tab
  closes.
- Every read and write is guarded. A write that starts failing mid-session is
  simply skipped.
- A saved board is only accepted if it could really have happened
  (`js/game/save-format.js`):
  - the layout exists and every array has the right length
  - every bird is known and appears exactly four times, and the birds match
    the original deal
  - the removed tiles are exactly the undo history, and each history pair
    shows one bird
  - the score equals the sum of the recorded points, and the counters are
    sane
  - the selection is a free tile, and the original route really clears the
    original deal

  Anything else, including JSON that doesn't parse, an unknown version, or an
  absurd time, is deleted rather than half-loaded.
- Corrupt settings fall back field by field; corrupt best-score entries are
  ignored.

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
- recovery (`tests/recovery.test.js`): random play on 400 seeds per difficulty
  finds real stuck boards. Every rescuable one shuffles to a verified route
  that keeps the birds, score and streak, and then finishes by following hints.
  Dead ends (which occur naturally on Hard, plus a hand-built Easy one) refuse
  to shuffle and restart to the original deal. The tests also check that hints
  are always legal and free, that hints alone clear 300 fresh boards, and that
  undo restores exact prior score, streak and best streak, including after a
  mismatch or a shuffle.
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
npm test                         # every check, including the release sweep
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
- **Help controls:** Undo returns the exact prior score (210 → 100), Hint is
  legal and free, Pause opens and resumes, and New Game asks before discarding
  progress (and doesn't ask when there's none).
- **Recovery:** seeded lines leave Easy (touch), Hard (touch, 320px) and
  Medium (mouse) boards stuck. Each time, the Shuffle offer appears with focus
  and its buttons fully on screen and uncovered. Undo from the offer returns
  the exact points, and re-matching restores them. Shuffle keeps score and
  pairs, and then following Hint wins. A Hard dead end offers Restart Board,
  which brings back all 60 tiles, and the original solution then wins.
- **Bests and time:** no clock is shown during play. A first clear sets the
  best, and the picker shows it only for that difficulty. Medium keeps its own
  best, and a higher Easy score replaces the Easy best. Time is labelled as
  personal only.

```sh
npm run test:play -- shots/      # optional dir for screenshots
```

## Checking saves

`tests/save.test.js` covers the save format:

- Several hundred reachable states survive a JSON round trip exactly: fresh,
  mid-play with a selection, after undo, stuck (both kinds), after shuffle and
  after restart, on all difficulties.
- Each restored state then plays on identically: hints to the end, then undo
  all the way back.
- 22 deliberately broken saves are rejected, one for each invariant above,
  plus envelope problems.
- Storage that throws on every call, fills up mid-session, or holds junk
  settings and bests is handled.

`tools/verify-save.mjs` does real page reloads in Chromium:

- **During play** (touch): board, birds, score, streak, selection and elapsed
  time come back. The restored selection completes a match, and the board then
  plays to a win.
- **After undo** (mouse): the undone state is restored, and you can keep
  undoing after the reload.
- **After a win:** nothing is left to continue, and the clears and best show
  per difficulty.
- **Stuck board:** it restores with its Shuffle offer, and the shuffled deal is
  what gets saved.
- **Without a reload:** Pause → Main Menu → Continue resumes the board.
- **Corrupt data:** corrupt save, settings and bests are discarded without
  errors.
- **Blocked storage:** with `localStorage` blocked, the game plays to a win and
  says it can't save.

```sh
npm run test:save
```

## Checking polish and accessibility

`tools/verify-polish.mjs` (`npm run test:polish`) covers:

- **Keyboard only:** from the start screen, through the menu and difficulty,
  to a cleared board using only Tab, the arrows, Enter, H and U. At every step
  every free tile is reachable with the arrows, and focus stays visible and on
  top. On a zoomed Hard board, the focused tile always scrolls into view.
- **Labels:** every tile has a name, a state and a cue, and the crow and raven
  are described differently.
- **Sound:**
  - There is no `AudioContext` before the first gesture, even after waiting.
  - With Sound effects on, matches chirp; switched off, they're silent.
  - With Music on, Gentle Canopy starts after the first tap.
  - Switching Music off stops it at once, and nothing new plays. Switched back
    on, Forest Breeze plays in a game.
  - The two switches are saved separately, and an old saved "Sound off"
    carries over to Sound effects.

  `tests/sound.test.js` checks the engine against a fake Web Audio:
  - gesture gating, the separate channels and volumes, and immediate mute
    (volume set to 0 at the current time, fades cancelled, sounds cut, the
    scheduler cleared)
  - the audio context suspending when both are off, the scenes, and a hidden
    tab
  - recorded effects with synthesized fallback, and music handed to the
    music controller

  `tests/music.test.js` checks the music controller with fake timers and
  audio elements:
  - crossfade length, no restart of a playing track, and each fade holding
    the current level before ramping
  - rapid screen changes, resuming from the same place, the seamless loop
    and its `ended` safety net
  - refused `play()` (retried on a gesture, fallback on other errors, an
    AbortError ignored), Music off, and a hidden tab

  `tests/settings.test.js` covers defaults, independence, clamping, per-field
  fallback, migration of old saves, broken storage, and that every saved
  setting has a control.
- **Animations:** the score floats and the celebration appear with Full (and
  with Full over an OS reduce-motion preference). They don't appear with
  Minimal or with the OS preference, where results follow right away.
- **Quiet game:** a full touch game with Music and Sound effects off and Animations Minimal has
  no audio, no animation elements, and the same score.
- **Contrast:** the rendered contrast of all text is checked on the start,
  menu, difficulty, game, pause, New Game, How to Play, Settings and results
  screens.

## Checking offline, install and updates

`tools/verify-offline.mjs` (`npm run test:offline`) serves the repo from
`/Bird-Mahjong/`, the same path GitHub Pages uses, and checks:

- **First load:** the worker takes control, and one versioned cache holds all
  77 precached files. There's no reload or update banner on first install.
- **Install:** in a regular Chromium profile, the manifest parses without
  errors, `start_url` and `scope` resolve to `/Bird-Mahjong/`, and Chromium
  reports **no installability errors**. Chromium offers installation itself,
  so *Install app* shows on the menu and hands off to the browser's prompt.
- **Offline:** the app reloads with the network off. `?seed=` and
  `index.html` deep links open, and all 74 bird images load, including the
  full-resolution ones on a zoomed Hard board. Continue restores the board
  after an offline reload, and a whole game plays to the results screen.
- **Update:** a "v2" (new worker and changed CSS) is published mid-test.
  - The page keeps using v1, even across a plain reload, while a Refresh
    banner appears. *Later* hides it.
  - *Refresh* switches to v2 with exactly one reload, and deletes the v1
    cache. The board in progress survives, and v2 then works offline.
- **Paths:** every request stays under `/Bird-Mahjong/` and finds its file.

`tests/pwa.test.js` also checks:

- the manifest's fields and relative URLs
- that icon files match their declared sizes
- that `sw.js` is up to date
- that every module reachable from `js/app.js`, every file `index.html` loads,
  and every tile are precached
- that there are no absolute root paths anywhere

## Checking music transitions

`tools/verify-music.mjs` (`npm run test:music`) plays the real MP3s in
Chromium and records every `<audio>` element and `play()` call. It checks:

- **Screen flow:** no music before the first gesture. Gentle Canopy then
  plays on the start screen and menus, and Forest Breeze in a game. The two
  overlap for about a second while they crossfade.
- **No stacking:** never more than two voices sound at once.
- **Pause:** pausing brings back Gentle Canopy without restarting it.
  Resuming brings back Forest Breeze from where it was.
- **Rapid changes:** quick pause/resume toggling never stacks or restarts a
  track.
- **Hidden tab:** the music pauses and resumes in place.
- **Music settings:** switching Music off and on works, and its volume is
  applied through Web Audio.
- **Loop point:** music keeps sounding across the loop, with about 0.35 s of
  overlap.
- **Refusals:** a `NotAllowedError` is retried on the next tap. A
  `NotSupportedError` falls back to the synthesized ambience.
- **Offline:** both tracks are cached. They play offline and can seek, since
  the service worker answers range requests from the cache.

## Release sweep

`tools/verify-release.mjs` (`npm run test:release`) plays **every difficulty
to completion** on 10 devices:

| Phones (touch) | Tablets (touch) | Desktop (mouse) |
|----------------|-----------------|-----------------|
| Android 360×640, 393×851, 412×915 | 800×1280 | 1024×640 |
| Android landscape 640×360, 851×393 | 1280×800 | 1366×768, 1920×1080 |

On every device and difficulty, the sweep checks the start, menu, difficulty,
game and results screens. It fails on:

- page scroll on the game screen
- a clipped or covered control, or one shorter than 44px
- text smaller than 12px
- tiles narrower than 40px
- a board that overflows without zoom controls
- a board area that is too short
- a board scrolled out of bounds
- any console error, warning or failed request

It also checks:

- **Zoom:** zooming in and back out returns to the same view, and Fit shows
  the whole board.
- **Rotation (touch devices):** rotating mid-game with a tile selected keeps
  the selection and the tile in view. The board stays readable and in bounds,
  nothing gets clipped, and the same holds after rotating back.

Fixed in this pass:

- **Small text:** stat and label text was 9.9–11.5px on phones; it is now 12px
  everywhere.
- **Landscape clipping:** on landscape phones, New Game and the zoom buttons
  were clipped. The side column now uses a compact two-column tool grid.
- **Rotation shrinking tiles:** rotating from a fitted board to one that needs
  zoom could shrink tiles to 32px. It now goes to the readable size, keeps
  your own zoom, and holds your place.
- **Stray score tag:** a "+points" tag from the last match could briefly
  scroll the board during a resize.
- **Pull-to-refresh:** Android's pull-to-refresh is now off during play.

## Deploying to GitHub Pages

The site is plain static files; there is no build server. Only the service
worker's file list and version are generated, and that is committed.

**Before every deploy** (whenever anything the game loads has changed):

```sh
npm run build:sw        # refresh sw.js: precache list + content-hash VERSION
npm test                # includes a check that sw.js is up to date
git add -A && git commit -m "…" && git push
```

`npm test` fails with *"sw.js is out of date"* if you forget `build:sw`, so
a release can't ship stale offline files.

**First-time setup**

1. In the repository go to **Settings → Pages → Build and deployment**. Choose
   Source *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. The game is served at `https://<user>.github.io/Bird-Mahjong/`, which here is
   `https://officialinspire.github.io/Bird-Mahjong/`. Pages serves over HTTPS,
   which service workers require.
3. A `.nojekyll` file is included so Pages serves the files as-is.

Every path is relative: the manifest's `start_url` and `scope` are `./`, and
the worker is registered as `./sw.js` with scope `./`. The same files work at
a domain root, under `/Bird-Mahjong/`, or on a custom domain, with nothing to
change.

## Install and offline play

**Offline needs one successful online load.** That first visit registers
`sw.js`, which precaches the whole game into one versioned cache: HTML, CSS,
every JS module, the manifest, the icons, and all 40 cropped bird tiles (the
120px and full-resolution WebP), the two music tracks and the five bird calls, about 6.8 MB in all
(the tracks are about 5.6 MB). From then on the game loads and
plays fully offline, including deep links like `?seed=123`, autosave and
Continue.

The tile gallery (`tiles.html`) isn't needed to play. It's cached the first
time you open it.

**Installing**

- **Chrome, Edge (desktop), Chrome (Android):** use *Install app* on the main
  menu, which appears when the browser offers it. You can also use the
  install icon in the address bar, or ⋮ → *Install Bird Mahjong* / *Add to
  Home screen*.
- **Safari (iOS/iPadOS):** Share → *Add to Home Screen*. Safari has no install
  prompt, so the button doesn't appear there.
- **Safari (macOS):** File → *Add to Dock*.

The installed app opens standalone with the woodland icon.

**How updates reach players** (so no one is stuck on old files):

1. `VERSION` in `sw.js` is a hash of every precached file, so any change
   produces a new worker.
2. The page checks for a new worker on every load and whenever it returns to
   the foreground (`updateViaCache: "none"`, so `sw.js` is never served stale
   by the HTTP cache or CDN).
3. The new worker downloads the new version into a *separate* cache, with
   `cache: "reload"` to skip stale HTTP copies. If any file fails, the update
   is abandoned and the current version keeps working.
4. Meanwhile the open page keeps using only the old version's files. Old HTML
   never meets new scripts.
5. A small banner says *A new version of Bird Mahjong is ready*.
   - **Refresh** autosaves the board, switches to the new version, and
     reloads once. The board is still there under Continue.
   - **Later** hides the banner. The new version starts the next time the app
     is opened fresh (all tabs or windows closed).
6. When the new version takes over, the old version's cache is deleted.

**Troubleshooting**

- A stuck or odd install can be reset in the browser's site settings (clear
  site data), or in DevTools → Application → Service workers → *Unregister*
  and Storage → *Clear site data*. The next online load reinstalls.
- Clearing site data also clears saved games and best scores, because they live
  in the same browser storage.
- Opening `index.html` straight from disk (`file://`) can't register a service
  worker. Serve the folder over HTTP (`npm run serve`) or use the Pages URL.

**Icons** are generated from the cropped tiles by `npm run build:icons`
(`tools/make_icons.py`):

- 192px and 512px "any" icons
- a 512px maskable icon with the artwork inside the 80% safe zone
- a 180px Apple touch icon
- a 32px favicon
