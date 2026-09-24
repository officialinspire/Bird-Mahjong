import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { customLayout } from "../js/game/geometry.js";
import {
  availableMatches, birdsMatch, canRemovePair, freeTiles, isCovered, isFree, isSideBlocked,
} from "../js/game/rules.js";

// Hand-made boards. Coordinates are half-tile units; a tile spans 2×2.
function board(tiles) {
  const layout = customLayout(tiles);
  const at = (x, y, z = 0) => {
    const p = layout.positions.find((t) => t.x === x && t.y === y && t.z === z);
    assert.ok(p, `no tile at ${x},${y},${z}`);
    return p.index;
  };
  const removed = layout.positions.map(() => false);
  return { layout, links: layout.links, at, removed };
}

describe("free tiles", () => {
  test("a lone tile is free", () => {
    const { links, removed, at } = board([{ x: 0, y: 0, z: 0 }]);
    assert.equal(isFree(links, removed, at(0, 0)), true);
  });

  test("row ends are free; a tile with neighbours on both sides is blocked", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
    ]);
    assert.equal(isFree(links, removed, at(0, 0)), true, "left end");
    assert.equal(isFree(links, removed, at(4, 0)), true, "right end");
    assert.equal(isSideBlocked(links, removed, at(2, 0)), true);
    assert.equal(isFree(links, removed, at(2, 0)), false, "middle");
  });

  test("removing one side neighbour frees a blocked tile", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
    ]);
    removed[at(0, 0)] = true;
    assert.equal(isFree(links, removed, at(2, 0)), true);
  });

  test("a gap wider than zero means the side is open", () => {
    // Tiles at x=0 and x=6 do not touch the tile at x=3 (edges at 2 and 5).
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 6, y: 0, z: 0 },
    ]);
    assert.equal(isFree(links, removed, at(3, 0)), true);
  });

  test("a neighbour offset by half a tile vertically still blocks", () => {
    const { links, removed, at } = board([
      { x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 1, z: 0 },
    ]);
    assert.equal(isFree(links, removed, at(2, 0)), false);
  });

  test("a tile a full row above or below does not block sideways", () => {
    const { links, removed, at } = board([
      { x: 0, y: 2, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 2, z: 0 },
    ]);
    assert.equal(isFree(links, removed, at(2, 0)), true);
  });

  test("tiles above and below (not beside) never side-block", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 4, z: 0 },
    ]);
    assert.equal(isFree(links, removed, at(0, 2)), true);
  });

  test("freeTiles lists exactly the free ones", () => {
    const { links, removed } = board([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 0, z: 1 },
    ]);
    // Indices sort by z, y, x: 0,1,2 on layer 0; 3 is the top tile.
    assert.deepEqual(freeTiles(links, removed), [0, 2, 3]);
  });
});

describe("covered tiles", () => {
  test("a tile directly underneath another is covered even with open sides", () => {
    const { links, removed, at } = board([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]);
    assert.equal(isCovered(links, removed, at(0, 0)), true);
    assert.equal(isSideBlocked(links, removed, at(0, 0)), false);
    assert.equal(isFree(links, removed, at(0, 0)), false);
    assert.equal(isFree(links, removed, at(0, 0, 1)), true, "top tile is free");
  });

  test("removing the covering tile uncovers it", () => {
    const { links, removed, at } = board([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]);
    removed[at(0, 0, 1)] = true;
    assert.equal(isFree(links, removed, at(0, 0)), true);
  });

  test("a tile offset by half a tile covers both tiles it straddles", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 1 },
    ]);
    assert.equal(isCovered(links, removed, at(0, 0)), true);
    assert.equal(isCovered(links, removed, at(2, 0)), true);
  });

  test("a quarter overlap (half a tile both ways) still covers", () => {
    const { links, removed, at } = board([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }]);
    assert.equal(isCovered(links, removed, at(0, 0)), true);
  });

  test("a higher tile that doesn't overlap does not cover", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 },
    ]);
    assert.equal(isCovered(links, removed, at(0, 0)), false);
    assert.equal(isFree(links, removed, at(0, 0)), true);
  });

  test("a tile two layers up still covers once the middle is gone", () => {
    const { links, removed, at } = board([
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 },
    ]);
    removed[at(0, 0, 1)] = true;
    assert.equal(isFree(links, removed, at(0, 0)), false);
  });

  test("tiles on a higher layer do not side-block lower tiles", () => {
    const { links, removed, at } = board([
      { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 4, y: 0, z: 1 },
    ]);
    // Layer-1 tiles at x=0 and x=4 would each overlap x=2 only by... nothing:
    // |dx| = 2, so they neither cover it nor count as its side neighbours.
    assert.equal(isSideBlocked(links, removed, at(2, 0)), false);
    assert.equal(isCovered(links, removed, at(2, 0)), false);
  });
});

describe("matching", () => {
  const tiles = [
    { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
    { x: 8, y: 0, z: 0 }, { x: 12, y: 0, z: 0 },
  ];

  test("only the exact same bird ID matches", () => {
    assert.equal(birdsMatch("american-crow", "american-crow"), true);
    assert.equal(birdsMatch("american-crow", "common-raven"), false, "look-alikes don't match");
    assert.equal(birdsMatch("barred-owl", "great-horned-owl"), false);
    assert.equal(birdsMatch("Blue-Jay", "blue-jay"), false, "IDs are exact, not case-folded");
    assert.equal(birdsMatch(null, null), false);
    assert.equal(birdsMatch("", ""), false);
  });

  test("two free tiles with the same bird can be removed", () => {
    const { links, removed } = board(tiles);
    // Tiles 0 and 2 are the two ends of the row [0,1,2], so both are free.
    const birds = ["osprey", "blue-jay", "osprey", "wood-duck", "wood-duck"];
    assert.equal(isFree(links, removed, 0), true);
    assert.equal(isFree(links, removed, 2), true);
    assert.equal(canRemovePair(links, removed, birds, 0, 2), true);
    assert.equal(canRemovePair(links, removed, birds, 2, 0), true, "order doesn't matter");
  });

  test("canRemovePair rules", () => {
    const { links, removed } = board(tiles);
    // Row [0,1,2] then isolated 3 and 4. Tile 1 is blocked.
    const birds = ["osprey", "osprey", "wood-duck", "wood-duck", "osprey"];
    assert.equal(canRemovePair(links, removed, birds, 2, 3), true, "free + free + same bird");
    assert.equal(canRemovePair(links, removed, birds, 0, 4), true);
    assert.equal(canRemovePair(links, removed, birds, 0, 1), false, "tile 1 is side-blocked");
    assert.equal(canRemovePair(links, removed, birds, 0, 0), false, "same tile twice");
    assert.equal(canRemovePair(links, removed, birds, 0, 2), false, "different birds");
    removed[4] = true;
    assert.equal(canRemovePair(links, removed, birds, 0, 4), false, "removed tile");
  });

  test("availableMatches finds every legal pair", () => {
    const { links, removed } = board(tiles);
    const birds = ["osprey", "osprey", "wood-duck", "wood-duck", "osprey"];
    assert.deepEqual(availableMatches(links, removed, birds), [[0, 4], [2, 3]]);
  });
});
