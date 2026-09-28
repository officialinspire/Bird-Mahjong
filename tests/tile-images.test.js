import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { BIRD_IDS } from "../js/game/birds.js";
import { likelyVariant, tileFile, tileUrl, variantFor } from "../js/ui/tile-images.js";

test("tile file names follow the sheet order and exist in both sizes", () => {
  assert.equal(tileFile("bald-eagle"), "01-bald-eagle");
  assert.equal(tileFile("ruby-throated-hummingbird"), "20-ruby-throated-hummingbird");
  for (const bird of BIRD_IDS) {
    for (const v of ["sm", "md"]) assert.ok(fs.existsSync(new URL(`../${tileUrl(tileFile(bird), v)}`, import.meta.url)), `${bird} ${v}`);
  }
});

test("small tiles while they're sharp, medium once a tile needs more than ~120 device pixels", () => {
  assert.equal(variantFor(92, 1), "sm");   // biggest desktop tile on a 1× screen
  assert.equal(variantFor(110, 1), "sm");  // fully zoomed in on 1×
  assert.equal(variantFor(40, 3), "sm");   // 120 device px: exactly the small image
  assert.equal(variantFor(53, 3), "md");
  assert.equal(variantFor(60, 2), "sm");   // 120 device px
  assert.equal(variantFor(92, 2), "md");
  assert.equal(variantFor(40, 1.5), "sm");
  assert.equal(variantFor(92, 1.5), "md");
});

test("the warm-up adds medium tiles from 1.5× screens up", () => {
  assert.equal(likelyVariant(1), "sm");
  assert.equal(likelyVariant(1.25), "sm");
  assert.equal(likelyVariant(1.5), "md");
  assert.equal(likelyVariant(2), "md");
  assert.equal(likelyVariant(3), "md");
});
