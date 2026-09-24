// Board geometry for Mahjong solitaire.
//
// Coordinates are in half-tile units: a tile at (x, y) occupies the 2×2 cell
// block [x, x+2) × [y, y+2) on layer z. Half units let upper layers and side
// "wing" tiles sit offset by half a tile, as in classic layouts.
//
// Two tiles' footprints overlap when |dx| < 2 and |dy| < 2.
//   * A tile is covered by any tile on a higher layer whose footprint overlaps.
//   * Its left neighbours are tiles on the same layer with x exactly 2 less
//     and |dy| < 2 (touching its left edge); right neighbours likewise.

/** Tiles in a cols × rows block starting at (x, y) on layer z. */
function block(x, y, cols, rows, z) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push({ x: x + c * 2, y: y + r * 2, z });
  }
  return out;
}

const RAW_LAYOUTS = {
  // 48 tiles: 8×4 base, 6×2 middle, 2×2 cap.
  meadow: {
    name: "Meadow",
    tiles: [
      ...block(0, 0, 8, 4, 0),
      ...block(2, 2, 6, 2, 1),
      ...block(6, 2, 2, 2, 2),
    ],
  },
  // 64 tiles: 8×5 base, 6×3 middle, 3×2 top set half a tile off the grid.
  "forest-edge": {
    name: "Forest Edge",
    tiles: [
      ...block(0, 0, 8, 5, 0),
      ...block(2, 2, 6, 3, 1),
      ...block(5, 3, 3, 2, 2),
    ],
  },
  // 72 tiles: turtle-style — 12×4 base with a wing tile on each side
  // straddling the two middle rows, then 8×2, 4×1 and 2×1 layers.
  "deep-woods": {
    name: "Deep Woods",
    tiles: [
      ...block(0, 0, 12, 4, 0),
      { x: -2, y: 3, z: 0 },
      { x: 24, y: 3, z: 0 },
      ...block(4, 2, 8, 2, 1),
      ...block(8, 3, 4, 1, 2),
      ...block(10, 3, 2, 1, 3),
    ],
  },
  // 80 tiles: tall stack — 10×4 base, 9×3 offset by half a tile, 6×2, and a
  // single capstone straddling four tiles.
  "old-growth": {
    name: "Old Growth",
    tiles: [
      ...block(0, 0, 10, 4, 0),
      ...block(1, 1, 9, 3, 1),
      ...block(4, 2, 6, 2, 2),
      { x: 9, y: 3, z: 3 },
    ],
  },
};

const overlaps = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/**
 * Precompute, for every tile index, which tiles cover it and which touch its
 * left and right edges. Rules only need these lists, never raw coordinates.
 */
export function buildLinks(positions) {
  const coveredBy = positions.map(() => []);
  const left = positions.map(() => []);
  const right = positions.map(() => []);
  positions.forEach((a, i) => {
    positions.forEach((b, j) => {
      if (i === j) return;
      if (b.z > a.z && overlaps(a, b)) coveredBy[i].push(j);
      if (b.z === a.z && Math.abs(a.y - b.y) < 2) {
        if (b.x === a.x - 2) left[i].push(j);
        if (b.x === a.x + 2) right[i].push(j);
      }
    });
  });
  return { coveredBy, left, right };
}

/** Sort positions into a stable order (bottom layer first, then rows) and index them. */
export function normalizePositions(tiles) {
  return tiles
    .slice()
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    .map(({ x, y, z }, index) => Object.freeze({ index, x, y, z }));
}

/**
 * Structural problems with a layout: tiles on one layer overlapping, or an
 * upper tile not fully resting on tiles below.
 */
export function validatePositions(positions) {
  const problems = [];
  positions.forEach((a, i) => {
    positions.forEach((b, j) => {
      if (j > i && a.z === b.z && overlaps(a, b)) {
        problems.push(`tiles ${i} and ${j} overlap on layer ${a.z}`);
      }
    });
    if (a.z > 0) {
      // Each of the four half-cells under the tile must be on a tile one layer down.
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const px = a.x + cx;
        const py = a.y + cy;
        const supported = positions.some(
          (b) => b.z === a.z - 1 && px >= b.x && px < b.x + 2 && py >= b.y && py < b.y + 2
        );
        if (!supported) problems.push(`tile ${i} (layer ${a.z}) is not supported at (${px}, ${py})`);
      }
    }
  });
  return problems;
}

const cache = new Map();

/** A frozen layout `{ id, name, positions, links }` for a preset id. */
export function getLayout(id) {
  if (cache.has(id)) return cache.get(id);
  const raw = RAW_LAYOUTS[id];
  if (!raw) throw new Error(`Unknown layout "${id}"`);
  const positions = Object.freeze(normalizePositions(raw.tiles));
  const layout = Object.freeze({ id, name: raw.name, positions, links: buildLinks(positions) });
  cache.set(id, layout);
  return layout;
}

/** Build a layout from arbitrary tiles (used by tests for small hand-made boards). */
export function customLayout(tiles, id = "custom") {
  const positions = Object.freeze(normalizePositions(tiles));
  return Object.freeze({ id, name: id, positions, links: buildLinks(positions) });
}

export const LAYOUT_IDS = Object.freeze(Object.keys(RAW_LAYOUTS));
