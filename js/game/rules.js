// Core Mahjong solitaire rules. Pure functions over a layout's precomputed
// links and a `removed` array (removed[i] === true once tile i is gone).

const present = (removed) => (j) => !removed[j];

/** Some tile still on the board sits on top of tile i. */
export function isCovered(links, removed, i) {
  return links.coveredBy[i].some(present(removed));
}

/** Tile i has a tile touching its left edge AND one touching its right edge. */
export function isSideBlocked(links, removed, i) {
  return links.left[i].some(present(removed)) && links.right[i].some(present(removed));
}

/**
 * A tile is selectable only when it is still on the board, no higher tile
 * covers it, and at least one of its left or right sides is open.
 */
export function isFree(links, removed, i) {
  return !removed[i] && !isCovered(links, removed, i) && !isSideBlocked(links, removed, i);
}

/** Indices of every free tile. */
export function freeTiles(links, removed) {
  const out = [];
  for (let i = 0; i < removed.length; i++) if (isFree(links, removed, i)) out.push(i);
  return out;
}

/** Matching means the exact same bird ID — look-alikes (crow/raven) don't match. */
export function birdsMatch(a, b) {
  return typeof a === "string" && a.length > 0 && a === b;
}

/** Two distinct, free tiles showing the same bird. */
export function canRemovePair(links, removed, birds, a, b) {
  return (
    a !== b &&
    isFree(links, removed, a) &&
    isFree(links, removed, b) &&
    birdsMatch(birds[a], birds[b])
  );
}

/** Every removable pair right now, as [a, b] with a < b. */
export function availableMatches(links, removed, birds) {
  const free = freeTiles(links, removed);
  const pairs = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (birdsMatch(birds[free[i]], birds[free[j]])) pairs.push([free[i], free[j]]);
    }
  }
  return pairs;
}
