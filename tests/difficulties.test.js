import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES } from "../js/config.js";
import { BIRD_IDS, COPIES_PER_BIRD, EASY_BIRDS, LOOKALIKE_GROUPS } from "../js/game/birds.js";
import { createGame } from "../js/game/game.js";
import { getLayout, LAYOUT_IDS, validatePositions } from "../js/game/geometry.js";
import { canRemovePair } from "../js/game/rules.js";

const SEEDS = 300;

describe("difficulties", () => {
  test("Easy 24/6, Medium 40/10, Hard 60/15, Expert 80/20", () => {
    const summary = DIFFICULTIES.map((d) => [d.id, d.tiles, d.birds]);
    assert.deepEqual(summary, [["easy", 24, 6], ["medium", 40, 10], ["hard", 60, 15], ["expert", 80, 20]]);
    for (const d of DIFFICULTIES) {
      assert.equal(d.tiles, d.birds * COPIES_PER_BIRD, `${d.id}: four copies of each bird`);
      for (const id of d.layouts) assert.equal(getLayout(id).positions.length, d.tiles, `${d.id}/${id}`);
    }
    // Expert uses every bird once over.
    assert.equal(DIFFICULTIES.at(-1).birds, BIRD_IDS.length);
  });

  test("each difficulty rotates through three layouts; every layout belongs to exactly one", () => {
    for (const d of DIFFICULTIES) {
      assert.equal(d.layouts.length, 3, d.id);
      assert.equal(new Set(d.layouts).size, d.layouts.length, d.id);
      assert.equal(d.layout, d.layouts[0], `${d.id}: signature layout comes first`);
    }
    const used = DIFFICULTIES.flatMap((d) => d.layouts);
    assert.equal(new Set(used).size, used.length);
    assert.deepEqual([...used].sort(), [...LAYOUT_IDS].sort());
  });

  test("every layout is structurally sound", () => {
    for (const id of LAYOUT_IDS) assert.deepEqual(validatePositions(getLayout(id).positions), [], id);
  });

  const shape = (id) => {
    const { positions } = getLayout(id);
    const layers = Math.max(...positions.map((p) => p.z)) + 1;
    const perLayer = Array.from({ length: layers }, (_, z) => positions.filter((p) => p.z === z).length);
    const cells = positions.map((p) => `${p.x},${p.y},${p.z}`).sort().join(" ");
    return { layers, perLayer: perLayer.join("/"), cells };
  };

  test("the layouts are genuinely different shapes", () => {
    const shapes = LAYOUT_IDS.map((id) => [id, shape(id)]);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const [a, sa] = shapes[i];
        const [b, sb] = shapes[j];
        assert.notEqual(sa.cells, sb.cells, `${a} vs ${b}`);
        // Within a difficulty, alternates differ in how the tiles are stacked too.
        const same = DIFFICULTIES.some((d) => d.layouts.includes(a) && d.layouts.includes(b));
        if (same) assert.notEqual(sa.perLayer, sb.perLayer, `${a} vs ${b} stack alike`);
      }
    }
  });

  test("signature layouts keep their classic shapes", () => {
    const layers = DIFFICULTIES.slice(0, 3).map((d) => shape(d.layout).layers);
    assert.deepEqual(layers, [3, 3, 5]);
    // Twin Groves really has two peaks, far apart.
    const tops = getLayout("twin-groves").positions.filter((p) => p.z === 2);
    assert.equal(tops.length, 2);
    assert.ok(Math.abs(tops[0].x - tops[1].x) >= 12);
  });

  for (const d of DIFFICULTIES) for (const layoutId of d.layouts) {
    test(`${d.name} · ${layoutId}: ${SEEDS} boards, each with a valid known solution`, () => {
      const { links } = getLayout(layoutId);
      for (let seed = 1; seed <= SEEDS; seed++) {
        const game = createGame(layoutId, { seed, birdPool: d.birdPool ?? undefined });
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
      const layoutId = easy.layouts[seed % easy.layouts.length];
      const birds = [...new Set(createGame(layoutId, { seed, birdPool: easy.birdPool }).birds)];
      birds.forEach((b) => seen.add(b));
      assert.ok(!birds.includes("american-crow") && !birds.includes("common-raven"), `seed ${seed}`);
      const groups = birds.map(groupOf).filter((g) => g >= 0);
      assert.equal(new Set(groups).size, groups.length, `seed ${seed}: look-alikes ${birds}`);
    }
    assert.equal(seen.size, EASY_BIRDS.length, "every pool bird shows up across boards");
  });

  test("Expert deals all 20 birds on every layout", () => {
    const expert = DIFFICULTIES.find((d) => d.id === "expert");
    for (const id of expert.layouts) {
      assert.equal(new Set(createGame(id, { seed: 5 }).birds).size, BIRD_IDS.length, id);
    }
  });

  test("Medium and Hard can use any bird", () => {
    const seen = new Set();
    for (let seed = 1; seed <= 50; seed++) createGame("old-growth", { seed }).birds.forEach((b) => seen.add(b));
    assert.equal(seen.size, BIRD_IDS.length);
  });
});
