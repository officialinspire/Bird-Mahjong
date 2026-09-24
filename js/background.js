// Slowly drifting bird tiles behind the UI. Purely decorative (aria-hidden).
// Each tile gets random CSS custom properties; css/app.css does the motion,
// and falls back to a static scatter when motion is reduced.

import { SMALL_TILE_DIR } from "./config.js";

const TILE_FILES = [
  "01-bald-eagle", "02-osprey", "03-red-tailed-hawk", "04-peregrine-falcon",
  "05-barred-owl", "06-great-horned-owl", "07-american-crow", "08-common-raven",
  "09-blue-jay", "10-northern-cardinal", "11-american-robin", "12-black-capped-chickadee",
  "13-tufted-titmouse", "14-pileated-woodpecker", "15-belted-kingfisher", "16-great-blue-heron",
  "17-wood-duck", "18-wild-turkey", "19-canada-goose", "20-ruby-throated-hummingbird",
];

const random = (min, max) => min + Math.random() * (max - min);

function tileCount() {
  const w = window.innerWidth;
  if (w >= 1024) return 14;
  if (w >= 700) return 11;
  return 8;
}

function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function renderBackground(container) {
  const count = tileCount();
  const files = shuffled(TILE_FILES).slice(0, count);
  const fragment = document.createDocumentFragment();

  files.forEach((file, i) => {
    const duration = random(70, 110);
    // Spread tiles evenly across the width in lanes, jittered, so they
    // never bunch up; negative delays start them mid-flight.
    const lane = (i + random(0.15, 0.85)) / count;
    const tile = document.createElement("div");
    tile.className = "float-tile";
    tile.style.setProperty("--x", `calc(${(lane * 100).toFixed(2)}% - 30px)`);
    tile.style.setProperty("--y", `${random(4, 86).toFixed(1)}%`);
    tile.style.setProperty("--size", `${Math.round(random(56, 92))}px`);
    tile.style.setProperty("--alpha", random(0.12, 0.2).toFixed(2));
    tile.style.setProperty("--rot", `${random(-14, 14).toFixed(1)}deg`);
    tile.style.setProperty("--drift", `${Math.round(random(-60, 60))}px`);
    tile.style.setProperty("--dur", `${duration.toFixed(1)}s`);
    tile.style.setProperty("--delay", `${(-random(0, duration)).toFixed(1)}s`);
    tile.style.setProperty("--sway-dur", `${random(7, 12).toFixed(1)}s`);

    const img = document.createElement("img");
    img.src = `${SMALL_TILE_DIR}${file}.webp`;
    img.alt = "";
    img.width = 120;
    img.height = 154;
    img.decoding = "async";
    tile.append(img);
    fragment.append(tile);
  });

  container.replaceChildren(fragment);
}
