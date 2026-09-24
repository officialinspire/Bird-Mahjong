# Bird Mahjong

A woodland tile-matching game in vanilla HTML/CSS/JS — no framework, no build
step, no runtime CDN — hosted on GitHub Pages.

**Status:** the app shell is in place (every screen and the menu flow); tile
gameplay is not implemented yet.

`bird-mahjong-tiles.jpg` is the original 5 × 4 tile sheet. It is kept as-is and
is only ever **read** by the tooling; every other image is derived from it.

## Layout

```
bird-mahjong-tiles.jpg     original sheet (source of truth, never modified)
index.html                 the game (app shell)
css/app.css                palette, layout, floating-tile background
js/app.js                  screen flow, settings, keyboard handling
js/config.js               difficulty levels
js/settings.js             settings persisted in localStorage
js/background.js           slowly drifting bird tiles behind the UI
tiles.html                 tile reference gallery (css/gallery.css, js/gallery.js)
data/tiles.json            tile ID ↔ name mapping (hand-maintained)
data/crops.json            measured crop boxes (generated)
assets/tiles/NN-<id>.png   20 individual tiles, RGBA (generated)
assets/tiles-sm/NN-<id>.webp  120px-wide copies for the UI (generated)
assets/contact-sheet.png   labelled overview of all crops (generated)
tools/crop_tiles.py        cropping script
tools/verify_crops.py      crop sanity checks
tools/requirements.txt     Python deps for the tools only
tools/verify-layout.mjs    responsive layout checks (Playwright)
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
**Difficulty** (Easy · Meadow, Intermediate · Forest Edge, Advanced · Deep
Woods, Insane · Old Growth) → **Game** → **Results**. **How to Play** and
**Settings** open from the menu; each has a ← Menu button.

- **Game** has the header (menu, difficulty, pause), stats (tiles left, moves,
  time), the board area and a Hint / Shuffle / Undo toolbar. The board is a
  placeholder for now; its *Preview results screen* button opens Results.
- **Escape** pauses in-game and goes back to the menu from any other screen.
- **Settings** (saved in `localStorage`): Motion (Match device / Reduced /
  Full), floating background birds on/off, and bird-name labels on tiles
  (saved now, used once gameplay exists).
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
npm test                         # crop checks + layout checks
```

## Deploying to GitHub Pages

1. Push to GitHub.
2. Repository **Settings → Pages → Build and deployment**: Source *Deploy from a
   branch*, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

A `.nojekyll` file is included so Pages serves the files as-is.
