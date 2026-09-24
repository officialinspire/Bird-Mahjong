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

/** A row of `cols` tiles starting at (x, y) on layer z. */
const row = (x, y, cols, z) => block(x, y, cols, 1, z);

const RAW_LAYOUTS = {
  // Easy · 24 tiles. A low diamond (rows of 2-4-6-4-2) with a small raised
  // centre: 2×2 on layer 1 and a pair straddling it on layer 2.
  meadow: {
    name: "Meadow",
    tiles: [
      ...row(4, 0, 2, 0),
      ...row(2, 2, 4, 0),
      ...row(0, 4, 6, 0),
      ...row(2, 6, 4, 0),
      ...row(4, 8, 2, 0),
      ...block(4, 3, 2, 2, 1),
      { x: 5, y: 3, z: 2 },
      { x: 5, y: 5, z: 2 },
    ],
  },
  // Medium · 40 tiles. Twin groves: a 3-layer peak at each end (3×3, 2×2
  // offset by half a tile, single top) joined by a flat 4×3 clearing.
  "twin-groves": {
    name: "Twin Groves",
    tiles: [
      ...block(0, 0, 3, 3, 0),
      ...block(1, 1, 2, 2, 1),
      { x: 2, y: 2, z: 2 },
      ...block(6, 0, 4, 3, 0),
      ...block(14, 0, 3, 3, 0),
      ...block(15, 1, 2, 2, 1),
      { x: 16, y: 2, z: 2 },
    ],
  },
  // Hard · 60 tiles. A five-layer tower: 8×4 base with a wing tile on each
  // side straddling the middle rows, then 6×2, 4×2, 2×2 and a 2-tile crown.
  "old-growth": {
    name: "Old Growth",
    tiles: [
      ...block(0, 0, 8, 4, 0),
      { x: -2, y: 3, z: 0 },
      { x: 16, y: 3, z: 0 },
      ...block(2, 2, 6, 2, 1),
      ...block(4, 2, 4, 2, 2),
      ...block(6, 2, 2, 2, 3),
      { x: 6, y: 3, z: 4 },
      { x: 8, y: 3, z: 4 },
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
