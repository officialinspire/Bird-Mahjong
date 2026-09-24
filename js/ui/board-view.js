// DOM board renderer. Tiles are real <button>s absolutely positioned from the
// layout's half-tile coordinates; upper layers shift up-left so stacks read
// as 3D. The board sits in a scroll container: when a layout can't fit at a
// readable tile size, the board is rendered larger (not CSS-transformed, so
// hit-testing and image sharpness stay exact) and the player pans by
// scrolling — touch scroll, wheel, or mouse drag.
//
// State is conveyed without relying on colour alone:
//   free      full colour, raised, pointer cursor
//   blocked   desaturated AND a diagonal hatch overlay, lowered
//   selected  lifted, thick double ring AND a ✓ badge
//   hint      dashed ring AND a "?" badge

import { birdCue, birdName, birdShort } from "./bird-names.js";

const TILE_RATIO = 1.28;      // tile height / width (cropped art is ~210×268)
const DEPTH = 0.085;          // per-layer up-left shift, in tile widths
const EDGE = 0.06;            // visible tile thickness, in tile widths
const PAD = 10;               // px around the board inside the surface
export const MIN_TILE = 40;   // narrowest tile we consider readable (px)
const MAX_TILE = 92;          // don't let tiles grow huge on big screens
const ZOOM_STEP = 1.25;
const MAX_ZOOM_TILE = 110;
const DRAG_THRESHOLD = 8;     // px of movement that turns a press into a pan

const SMALL = (bird) => `assets/tiles-sm/${bird}.webp`;
const FULL = (bird) => `assets/tiles-md/${bird}.webp`;

export function createBoardView({ viewport, surface, zoomControls, onActivate, tileFile }) {
  let layout = null;
  let tiles = [];            // button per tile index
  let tileW = MIN_TILE;
  let fitW = MIN_TILE;
  let extents = null;
  let suppressClickUntil = 0;
  let roving = -1;           // the one free tile in the Tab order (roving tabindex)

  // ---------- Geometry ----------

  function computeExtents(positions) {
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x + 2));
    const maxY = Math.max(...positions.map((p) => p.y + 2));
    const maxZ = Math.max(...positions.map((p) => p.z));
    return { minX, minY, spanX: maxX - minX, spanY: maxY - minY, maxZ };
  }

  /** Board size in px for a given tile width. */
  function boardSize(w) {
    const h = w * TILE_RATIO;
    const lift = extents.maxZ * DEPTH * w;
    const edge = EDGE * w;
    return {
      width: (extents.spanX / 2) * w + lift + edge + PAD * 2,
      height: (extents.spanY / 2) * h + lift + edge + PAD * 2,
    };
  }

  /** Largest tile width at which the whole board fits the viewport. */
  function computeFit() {
    const availW = viewport.clientWidth;
    const availH = viewport.clientHeight;
    const perW = extents.spanX / 2 + extents.maxZ * DEPTH + EDGE;
    const perH = (extents.spanY / 2) * TILE_RATIO + extents.maxZ * DEPTH + EDGE;
    const w = Math.min((availW - PAD * 2) / perW, (availH - PAD * 2) / perH);
    return Math.max(16, Math.min(MAX_TILE, Math.floor(w)));
  }

  function place() {
    const w = tileW;
    const h = w * TILE_RATIO;
    const lift = extents.maxZ * DEPTH * w;
    const size = boardSize(w);
    surface.style.width = `${Math.round(size.width)}px`;
    surface.style.height = `${Math.round(size.height)}px`;
    surface.style.setProperty("--tile-w", `${w}px`);
    const sizes = `${Math.round(w)}px`;
    layout.positions.forEach((p, i) => {
      const el = tiles[i];
      const shift = p.z * DEPTH * w;
      el.style.left = `${PAD + lift + ((p.x - extents.minX) / 2) * w - shift}px`;
      el.style.top = `${PAD + lift + ((p.y - extents.minY) / 2) * h - shift}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.firstChild.sizes = sizes;
    });
    updateZoomControls();
  }

  // ---------- Zoom ----------

  const canZoom = () => fitW < MIN_TILE;
  const maxTile = () => Math.max(MAX_ZOOM_TILE, fitW);

  function updateZoomControls() {
    if (!zoomControls) return;
    zoomControls.root.hidden = !canZoom();
    zoomControls.out.disabled = tileW <= fitW + 0.5;
    zoomControls.fit.disabled = tileW <= fitW + 0.5;
    zoomControls.in.disabled = tileW >= maxTile() - 0.5;
    zoomControls.root.dataset.zoom = String(Math.round((tileW / fitW) * 100));
    viewport.classList.toggle("is-pannable", tileW > fitW + 0.5);
  }

  /** Change tile width, keeping the point at the viewport centre in place. */
  function setTileWidth(next) {
    const clamped = Math.max(fitW, Math.min(maxTile(), next));
    const before = boardSize(tileW);
    const cx = (viewport.scrollLeft + viewport.clientWidth / 2) / before.width;
    const cy = (viewport.scrollTop + viewport.clientHeight / 2) / before.height;
    tileW = clamped;
    place();
    const after = boardSize(tileW);
    viewport.scrollLeft = cx * after.width - viewport.clientWidth / 2;
    viewport.scrollTop = cy * after.height - viewport.clientHeight / 2;
  }

  function zoom(direction) {
    if (direction === "in") setTileWidth(tileW * ZOOM_STEP);
    else if (direction === "out") setTileWidth(tileW / ZOOM_STEP);
    else setTileWidth(fitW);
  }

  /**
   * Recompute the fit for the current viewport. If the board fits at a
   * readable size it is shown whole; otherwise it starts at MIN_TILE (or
   * keeps the player's zoom ratio on resize) and becomes pannable.
   */
  function relayout({ resetZoom = false } = {}) {
    if (!layout || viewport.clientWidth === 0) return; // hidden screen
    const ratio = tileW / fitW;
    fitW = computeFit();
    if (!canZoom()) tileW = fitW;
    else if (resetZoom) tileW = MIN_TILE;
    else tileW = Math.max(fitW, Math.min(maxTile(), fitW * ratio));
    place();
    if (resetZoom) centerOnTopLayer();
  }

  /** Start zoomed boards centred on the tallest stack, where play begins. */
  function centerOnTopLayer() {
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
  }

  // ---------- Rendering ----------

  function makeTile(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    button.dataset.index = String(index);
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    const label = document.createElement("span");
    label.className = "tile-label";
    label.setAttribute("aria-hidden", "true");
    const badge = document.createElement("span");
    badge.className = "tile-badge";
    badge.setAttribute("aria-hidden", "true");
    button.append(img, label, badge);
    return button;
  }

  function setBird(el, bird) {
    if (el.dataset.bird === bird) return;
    el.dataset.bird = bird;
    const file = tileFile(bird);
    const img = el.firstChild;
    img.src = SMALL(file);
    img.srcset = `${SMALL(file)} 120w, ${FULL(file)} 200w`;
    el.querySelector(".tile-label").textContent = birdShort(bird);
  }

  function render(nextLayout) {
    layout = nextLayout;
    extents = computeExtents(layout.positions);
    tiles = layout.positions.map((p, i) => {
      const el = makeTile(i);
      // Paint order: lower layers first, then top-to-bottom, left-to-right so
      // each tile's visible thickness (bottom-right) sits under its neighbour.
      el.style.zIndex = String(p.z * 1000 + (p.y - extents.minY) * 20 + (p.x - extents.minX) + 10);
      return el;
    });
    surface.replaceChildren(...tiles);
    relayout({ resetZoom: true });
  }

  /**
   * Sync every tile's classes and accessible name with the game state.
   * `info(i)` returns { removed, free, covered }.
   */
  function sync(state, info, { hint = null } = {}) {
    tiles.forEach((el, i) => {
      const { removed, free, covered } = info(i);
      setBird(el, state.birds[i]);
      const selected = state.selected === i;
      const hinted = !!hint && (hint[0] === i || hint[1] === i);
      if (!removed) el.classList.remove("is-removing"); // e.g. undo mid-animation
      el.classList.toggle("is-removed", removed && !el.classList.contains("is-removing"));
      el.classList.toggle("is-free", !removed && free);
      el.classList.toggle("is-blocked", !removed && !free);
      el.classList.toggle("is-selected", selected);
      el.classList.toggle("is-hint", hinted);
      el.hidden = removed && !el.classList.contains("is-removing");
      const status = selected ? "selected" : free ? "free" : covered ? "covered" : "blocked";
      el.setAttribute("aria-label", `${birdName(state.birds[i])}, ${status}${hinted ? ", hint" : ""}`);
      // A short visual cue ("slim bill, pine boughs") and the layer, for
      // screen-reader users telling similar birds apart.
      const layer = layout.positions[i].z;
      el.setAttribute("aria-description", `${birdCue(state.birds[i])}${layer ? `; layer ${layer + 1}` : ""}`);
      el.setAttribute("aria-pressed", selected ? "true" : "false");
      el.setAttribute("aria-disabled", free ? "false" : "true");
    });
    updateRoving();
  }

  // ---------- Keyboard: one Tab stop, arrow keys between free tiles ----------

  const isFreeTile = (el) => el.classList.contains("is-free") && !el.hidden && !el.classList.contains("is-removing");
  const freeTiles = () => tiles.filter(isFreeTile);
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /** Keep exactly one free tile tabbable, and don't lose keyboard focus. */
  function updateRoving() {
    const free = freeTiles();
    const current = tiles[roving];
    const hadFocus = !!current && current === document.activeElement;
    if (!current || !isFreeTile(current)) {
      // Nearest free tile to where the player was, else the first one.
      let next = free[0];
      if (current && free.length) {
        const from = layout.positions[roving];
        const dist = (el) => {
          const p = layout.positions[Number(el.dataset.index)];
          return Math.hypot(p.x - from.x, p.y - from.y);
        };
        next = free.reduce((best, el) => (dist(el) < dist(best) ? el : best));
      }
      roving = next ? Number(next.dataset.index) : -1;
    }
    tiles.forEach((el, i) => { el.tabIndex = i === roving ? 0 : -1; });
    if (hadFocus && tiles[roving] && tiles[roving] !== current) tiles[roving].focus();
  }

  /** Move focus to the nearest free tile in a direction (by what's on screen). */
  function moveFocus(from, dx, dy) {
    const a = centre(from);
    let best = null;
    let bestScore = Infinity;
    for (const el of freeTiles()) {
      if (el === from) continue;
      const b = centre(el);
      const along = (b.x - a.x) * dx + (b.y - a.y) * dy;   // distance in the direction
      const across = Math.abs((b.x - a.x) * dy) + Math.abs((b.y - a.y) * dx);
      if (along <= 4) continue;
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) best.focus();
    return best;
  }

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  surface.addEventListener("keydown", (event) => {
    const from = event.target.closest(".tile");
    if (!from) return;
    if (ARROWS[event.key]) {
      event.preventDefault();
      moveFocus(from, ...ARROWS[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const free = freeTiles();
      (event.key === "Home" ? free[0] : free[free.length - 1])?.focus();
    }
  });

  surface.addEventListener("focusin", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile) return;
    roving = Number(tile.dataset.index);
    tiles.forEach((el) => { el.tabIndex = el === tile ? 0 : -1; });
  });

  /** Focus the board's current tile (e.g. after closing the stuck offer). */
  function focusBoard() {
    tiles[roving]?.focus({ preventScroll: false });
  }

  // ---------- Gentle feedback ----------

  /** A small "+120" that floats up from a matched tile, then disappears. */
  function floatScore(index, text) {
    const el = tiles[index];
    const tag = document.createElement("span");
    tag.className = "score-float";
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = text;
    tag.style.left = `${parseFloat(el.style.left) + parseFloat(el.style.width) / 2}px`;
    tag.style.top = `${parseFloat(el.style.top)}px`;
    surface.append(tag);
    setTimeout(() => tag.remove(), 900);
  }

  /** Restrained board-clear moment: a soft glow and a few drifting feathers. */
  function celebrate(duration) {
    const host = viewport.parentElement;
    const layer = document.createElement("div");
    layer.className = "celebration";
    layer.setAttribute("aria-hidden", "true");
    const colours = ["var(--leaf)", "var(--sky)", "var(--cardinal)", "var(--rim)", "var(--leaf-dark)"];
    for (let i = 0; i < 12; i++) {
      const feather = document.createElement("span");
      feather.className = "feather";
      feather.style.setProperty("--x", `${6 + ((i * 37) % 88)}%`);
      feather.style.setProperty("--delay", `${(i % 6) * 70}ms`);
      feather.style.setProperty("--drift", `${(i % 2 ? 1 : -1) * (10 + (i * 7) % 30)}px`);
      feather.style.setProperty("--turn", `${(i % 2 ? 1 : -1) * (20 + (i * 13) % 50)}deg`);
      feather.style.background = colours[i % colours.length];
      layer.append(feather);
    }
    host.append(layer);
    setTimeout(() => layer.remove(), duration);
  }

  /** Play the gentle removal animation, then hide the tiles. */
  function animateRemoval(indices, duration) {
    for (const i of indices) {
      const el = tiles[i];
      el.classList.remove("is-selected", "is-hint");
      el.classList.add("is-removing");
      el.tabIndex = -1;
    }
    setTimeout(() => {
      for (const i of indices) {
        const el = tiles[i];
        if (!el.classList.contains("is-removing")) continue; // restored meanwhile
        el.classList.remove("is-removing");
        el.classList.add("is-removed");
        el.hidden = true;
      }
    }, duration);
  }

  function nudge(i) {
    const el = tiles[i];
    el.classList.remove("is-nudge");
    void el.offsetWidth; // restart the animation
    el.classList.add("is-nudge");
  }

  function tileElement(i) {
    return tiles[i];
  }

  // ---------- Input ----------

  // Clicks cover mouse, touch taps and keyboard Enter/Space on the buttons.
  // Background clicks (the felt between tiles) are ignored on purpose.
  surface.addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile || !surface.contains(tile)) return;
    if (performance.now() < suppressClickUntil) return;
    onActivate(Number(tile.dataset.index), event);
  });

  // Long-press / right-click menus would interrupt play.
  surface.addEventListener("contextmenu", (event) => event.preventDefault());

  // Mouse drag pans a zoomed board. Touch panning is native scrolling (the
  // browser cancels the pointer and no click fires, so a swipe never selects).
  let drag = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false, id: event.pointerId };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-dragging");
    }
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) suppressClickUntil = performance.now() + 50;
    viewport.classList.remove("is-dragging");
    drag = null;
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  if (zoomControls) {
    zoomControls.in.addEventListener("click", () => zoom("in"));
    zoomControls.out.addEventListener("click", () => zoom("out"));
    zoomControls.fit.addEventListener("click", () => zoom("fit"));
  }

  let lastSize = "";
  new ResizeObserver(() => {
    const size = `${viewport.clientWidth}x${viewport.clientHeight}`;
    if (size === lastSize || !layout || viewport.clientWidth === 0) return;
    const first = lastSize === "";
    lastSize = size;
    relayout({ resetZoom: first });
  }).observe(viewport);

  return {
    render,
    sync,
    animateRemoval,
    nudge,
    floatScore,
    celebrate,
    focusBoard,
    zoom,
    tileElement,
    relayout: () => relayout({ resetZoom: true }),
    get tileWidth() { return tileW; },
    get fitWidth() { return fitW; },
  };
}
