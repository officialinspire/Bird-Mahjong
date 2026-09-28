// Bird tile images: which size to show, and warming them up ahead of time.
//
// Every tile exists in two sizes: assets/tiles-sm (120px wide) and
// assets/tiles-md (~200px wide). The board picks one size for all its tiles
// from the tile width on screen and the device pixel ratio (variantFor), so
// the size it needs is known before the board is drawn.
//
// warmTiles() fetches and decodes those images in idle time while the player
// is still on the menus. A board then draws every tile on its first frame,
// with no pop-in and no decoding hitch mid-game. Warmed images are kept
// referenced so the browser's memory cache holds on to them.
//
// One catch: when the service worker first takes control of the page (a few
// seconds into the very first visit), Chrome files everything loaded from
// then on under the worker, and images warmed earlier no longer count as
// ready. js/app.js therefore warms again, with { fresh: true }, on
// controllerchange; that second pass is served locally by the worker.

import { BIRD_IDS } from "../game/birds.js";

export const SMALL_WIDTH = 120;
/** A little headroom so a tile a few device pixels over 120 isn't upscaled blurrily. */
const SMALL_LIMIT = SMALL_WIDTH * 1.1;

/** "01-bald-eagle" style file stem for a bird ID. */
export const tileFile = (bird) => `${String(BIRD_IDS.indexOf(bird) + 1).padStart(2, "0")}-${bird}`;

export const tileUrl = (file, variant) => `assets/tiles-${variant}/${file}.webp`;

const pixelRatio = () => (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);

/** "sm" or "md": the smallest size that is still sharp at `cssWidth` px. */
export function variantFor(cssWidth, dpr = pixelRatio()) {
  return cssWidth * dpr > SMALL_LIMIT ? "md" : "sm";
}

/**
 * The largest size a board may need on this device, before it exists: boards
 * fit tiles up to 92px wide (MAX_TILE in board-view.js). On a 1× screen the
 * small tiles are sharp throughout; from about 1.5× up, medium may be needed.
 */
export const likelyVariant = (dpr = pixelRatio()) => variantFor(92, dpr);

const warmed = new Map(); // url -> Promise<boolean>
const keep = [];          // decoded images, kept alive for the memory cache
let generation = 0;       // warm-up passes started (a fresh pass restarts the set)
let finished = 0;         // …and completed

/** Fetch and decode one image. Resolves true when ready; never rejects. */
function warm(url) {
  if (warmed.has(url)) return warmed.get(url);
  const img = new Image();
  img.decoding = "async";
  const ready = new Promise((resolve) => {
    img.onload = () => {
      keep.push(img);
      // decode() makes sure the pixels are ready too; where it's missing or
      // refuses (e.g. an image that loaded but can't be decoded off-thread),
      // a loaded image is still good enough.
      (img.decode ? img.decode() : Promise.resolve()).then(() => resolve(true), () => resolve(true));
    };
    img.onerror = () => { warmed.delete(url); resolve(false); }; // a later warm may retry
  });
  img.src = url;
  warmed.set(url, ready);
  return ready;
}

const idle = (fn) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200);

/**
 * Warm every bird tile in `variants` (default: the likely board size, plus
 * the small size the menus use). Runs a few at a time in idle periods so it
 * never competes with anything the player is doing. Resolves to the number
 * of images ready.
 */
export function warmTiles(variants = [...new Set(["sm", likelyVariant()])], { batch = 8, fresh = false } = {}) {
  if (fresh) {
    warmed.clear();
    keep.length = 0;
  }
  const pass = ++generation;
  const urls = variants.flatMap((v) => BIRD_IDS.map((bird) => tileUrl(tileFile(bird), v)));
  return new Promise((resolve) => {
    let ok = 0;
    let i = 0;
    const step = () => {
      if (i >= urls.length) {
        finished = Math.max(finished, pass);
        resolve(ok);
        return;
      }
      const slice = urls.slice(i, i + batch);
      i += batch;
      Promise.all(slice.map(warm)).then((done) => {
        ok += done.filter(Boolean).length;
        idle(step);
      });
    };
    idle(step);
  });
}

/** For tests: how many tile images are warmed and decoded, and which pass is done. */
export async function warmStatus() {
  const results = await Promise.all(warmed.values());
  return { ready: results.filter(Boolean).length, generation, finished };
}
