import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES } from "../js/config.js";
import { BIRD_IDS, COPIES_PER_BIRD, EASY_BIRDS, LOOKALIKE_GROUPS } from "../js/game/birds.js";
import { createGame } from "../js/game/game.js";
import { getLayout, LAYOUT_IDS } from "../js/game/geometry.js";
import { canRemovePair } from "../js/game/rules.js";

const SEEDS = 300;

describe("difficulties", () => {
  test("Easy 24/6, Medium 40/10, Hard 60/15", () => {
    const summary = DIFFICULTIES.map((d) => [d.id, d.tiles, d.birds]);
    assert.deepEqual(summary, [["easy", 24, 6], ["medium", 40, 10], ["hard", 60, 15]]);
    for (const d of DIFFICULTIES) {
      assert.equal(getLayout(d.layout).positions.length, d.tiles, d.id);
      assert.equal(d.tiles, d.birds * COPIES_PER_BIRD, `${d.id}: four copies of each bird`);
    }
  });

  test("each difficulty has its own layout, and every layout is used", () => {
    const used = DIFFICULTIES.map((d) => d.layout);
    assert.equal(new Set(used).size, used.length);
    assert.deepEqual([...used].sort(), [...LAYOUT_IDS].sort());
  });

  test("the layouts are genuinely different shapes", () => {
    const shape = (id) => {
      const { positions } = getLayout(id);
      const layers = Math.max(...positions.map((p) => p.z)) + 1;
      const perLayer = Array.from({ length: layers }, (_, z) => positions.filter((p) => p.z === z).length);
      const base = positions.filter((p) => p.z === 0);
      const width = (Math.max(...base.map((p) => p.x)) - Math.min(...base.map((p) => p.x))) / 2 + 1;
      // Full grid rows only; Hard's wing tiles sit half a row down (y = 3).
      const rows = new Set(base.filter((p) => p.y % 2 === 0).map((p) => p.y)).size;
      const peaks = positions.filter((p) => p.z === layers - 1).length;
      return { layers, perLayer: perLayer.join("/"), width, rows, peaks };
    };
    const shapes = DIFFICULTIES.map((d) => shape(d.layout));
    // Easy: 3-layer diamond; Medium: two separate 3-layer peaks on a wide
    // strip; Hard: a 5-layer tower with wings.
    assert.deepEqual(shapes.map((s) => s.layers), [3, 3, 5]);
    assert.deepEqual(shapes.map((s) => s.rows), [5, 3, 4]);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        assert.notEqual(shapes[i].perLayer, shapes[j].perLayer);
      }
    }
    // Twin Groves really has two peaks, far apart.
    const tops = getLayout("twin-groves").positions.filter((p) => p.z === 2);
    assert.equal(tops.length, 2);
    assert.ok(Math.abs(tops[0].x - tops[1].x) >= 12);
  });

  for (const d of DIFFICULTIES) {
    test(`${d.name}: ${SEEDS} boards, each with a valid known solution`, () => {
      const { links } = getLayout(d.layout);
      for (let seed = 1; seed <= SEEDS; seed++) {
        const game = createGame(d.layout, { seed, birdPool: d.birdPool ?? undefined });
        const counts = {};
        game.birds.forEach((b) => { counts[b] = (counts[b] || 0) + 1; });
        assert.equal(Object.keys(counts).length, d.birds, `seed ${seed}`);
        assert.ok(Object.values(counts).every((n) => n === COPIES_PER_BIRD), `seed ${seed}: four copies`);

        const removed = game.birds.map(() => false);
        for (const [a, b] of game.solution) {
          assert.ok(canRemovePair(links, removed, game.birds, a, b), `seed ${seed}: illegal step ${a},${b}`);
          removed[a] = removed[b] = true;
        }
        assert.ok(removed.every(Boolean), `seed ${seed}: board not cleared`);
      }
    });
  }
});

describe("Easy birds", () => {
  const groupOf = (bird) => LOOKALIKE_GROUPS.findIndex((g) => g.includes(bird));

  test("the Easy pool has no crow or raven and at most one bird per look-alike group", () => {
    assert.ok(!EASY_BIRDS.includes("american-crow"));
    assert.ok(!EASY_BIRDS.includes("common-raven"));
    const groups = EASY_BIRDS.map(groupOf).filter((g) => g >= 0);
    assert.equal(new Set(groups).size, groups.length);
    assert.ok(EASY_BIRDS.every((b) => BIRD_IDS.includes(b)));
    assert.ok(EASY_BIRDS.length >= 6);
  });

  test(`${SEEDS} Easy boards never deal look-alikes`, () => {
    const easy = DIFFICULTIES.find((d) => d.id === "easy");
    const seen = new Set();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const birds = [...new Set(createGame(easy.layout, { seed, birdPool: easy.birdPool }).birds)];
      birds.forEach((b) => seen.add(b));
      assert.ok(!birds.includes("american-crow") && !birds.includes("common-raven"), `seed ${seed}`);
      const groups = birds.map(groupOf).filter((g) => g >= 0);
      assert.equal(new Set(groups).size, groups.length, `seed ${seed}: look-alikes ${birds}`);
    }
    assert.equal(seen.size, EASY_BIRDS.length, "every pool bird shows up across boards");
  });

  test("Medium and Hard can use any bird", () => {
    const seen = new Set();
    for (let seed = 1; seed <= 50; seed++) createGame("old-growth", { seed }).birds.forEach((b) => seen.add(b));
    assert.equal(seen.size, BIRD_IDS.length);
  });
});
