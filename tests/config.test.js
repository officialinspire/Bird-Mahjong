import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DIFFICULTIES } from "../js/config.js";
import { BIRD_IDS, COPIES_PER_BIRD } from "../js/game/birds.js";
import { getLayout } from "../js/game/geometry.js";

test("difficulty tile and bird counts match their layouts", () => {
  for (const d of DIFFICULTIES) {
    const tiles = getLayout(d.layout).positions.length;
    assert.equal(d.tiles, tiles, `${d.id} tiles`);
    assert.equal(d.birds, tiles / COPIES_PER_BIRD, `${d.id} birds`);
  }
});

test("BIRD_IDS matches data/tiles.json in sheet order", () => {
  const data = JSON.parse(readFileSync(new URL("../data/tiles.json", import.meta.url), "utf8"));
  const ids = data.tiles.slice().sort((a, b) => a.row - b.row || a.col - b.col).map((t) => t.id);
  assert.deepEqual([...BIRD_IDS], ids);
});
