import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { BIRD_IDS, COPIES_PER_BIRD } from "../js/game/birds.js";
import { customLayout, getLayout, LAYOUT_IDS, validatePositions } from "../js/game/geometry.js";
import { assignBirds, findRemovalSequence, generateBoard } from "../js/game/generator.js";
import { createRng } from "../js/game/rng.js";
import { canRemovePair } from "../js/game/rules.js";

const SEEDS_PER_LAYOUT = 200;

/**
 * Independently replay a solution with the rules: every pair must be free and
 * matching at the moment it's removed, and the board must end empty.
 * Returns an error string, or null if the solution is valid.
 */
function replay(layout, birds, solution, removed = layout.positions.map(() => false)) {
  const state = removed.slice();
  for (const [step, [a, b]] of solution.entries()) {
    if (!canRemovePair(layout.links, state, birds, a, b)) {
      return `step ${step}: tiles ${a} (${birds[a]}) and ${b} (${birds[b]}) are not a legal pair`;
    }
    state[a] = state[b] = true;
  }
  const left = state.filter((r) => !r).length;
  return left === 0 ? null : `${left} tiles left after the solution`;
}

describe("preset layouts", () => {
  for (const id of LAYOUT_IDS) {
    test(`${id}: well-formed, tile count a multiple of ${COPIES_PER_BIRD}`, () => {
      const { positions } = getLayout(id);
      assert.deepEqual(validatePositions(positions), []);
      assert.equal(positions.length % COPIES_PER_BIRD, 0);
      assert.ok(positions.length / COPIES_PER_BIRD <= BIRD_IDS.length, "enough birds");
      const keys = new Set(positions.map((p) => `${p.x},${p.y},${p.z}`));
      assert.equal(keys.size, positions.length, "no duplicate positions");
    });
  }

  test("validatePositions catches overlap and unsupported tiles", () => {
    const bad = customLayout([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, // overlap on one layer
      { x: 6, y: 0, z: 1 },                     // floating
    ]);
    const problems = validatePositions(bad.positions);
    assert.ok(problems.some((p) => p.includes("overlap")));
    assert.ok(problems.some((p) => p.includes("not supported")));
  });

  test("the deep-woods wing tiles block the middle-row ends", () => {
    const { positions, links } = getLayout("deep-woods");
    const wing = positions.find((p) => p.x === -2).index;
    const rowEnds = positions.filter((p) => p.z === 0 && p.x === 0 && (p.y === 2 || p.y === 4));
    assert.equal(rowEnds.length, 2);
    for (const end of rowEnds) assert.ok(links.left[end.index].includes(wing));
  });
});

describe("generated boards", () => {
  for (const id of LAYOUT_IDS) {
    test(`${id}: ${SEEDS_PER_LAYOUT} seeds — four copies per bird and a replayable solution`, () => {
      const layout = getLayout(id);
      const birdCount = layout.positions.length / COPIES_PER_BIRD;
      for (let seed = 1; seed <= SEEDS_PER_LAYOUT; seed++) {
        const board = generateBoard(id, { seed });
        assert.equal(board.birds.length, layout.positions.length);
        assert.equal(board.birdIds.length, birdCount);

        const counts = new Map();
        for (const bird of board.birds) {
          assert.ok(BIRD_IDS.includes(bird), `seed ${seed}: unknown bird ${bird}`);
          counts.set(bird, (counts.get(bird) || 0) + 1);
        }
        assert.equal(counts.size, birdCount, `seed ${seed}: bird count`);
        for (const [bird, n] of counts) assert.equal(n, COPIES_PER_BIRD, `seed ${seed}: ${bird} ×${n}`);

        assert.equal(board.solution.length, layout.positions.length / 2);
        assert.equal(replay(layout, board.birds, board.solution), null, `seed ${seed}`);
      }
    });
  }

  test("the same seed gives the same board; different seeds differ", () => {
    const a = generateBoard("forest-edge", { seed: 42 });
    const b = generateBoard("forest-edge", { seed: 42 });
    const c = generateBoard("forest-edge", { seed: 43 });
    assert.deepEqual(a.birds, b.birds);
    assert.deepEqual(a.solution, b.solution);
    assert.notDeepEqual(a.birds, c.birds);
  });

  test("an explicit bird set is honoured", () => {
    const birdIds = BIRD_IDS.slice(0, 12);
    const board = generateBoard("meadow", { seed: 7, birdIds });
    assert.deepEqual([...new Set(board.birds)].sort(), birdIds.slice().sort());
  });

  test("the wrong number of birds is rejected", () => {
    assert.throws(() => generateBoard("meadow", { seed: 1, birdIds: BIRD_IDS.slice(0, 11) }), /needs 12/);
    assert.throws(() => generateBoard("meadow", { seed: 1, birdIds: [...BIRD_IDS.slice(0, 11), BIRD_IDS[0]] }), /distinct/);
  });

  test("unknown layouts are rejected", () => {
    assert.throws(() => generateBoard("swamp", { seed: 1 }), /Unknown layout/);
  });
});

describe("removal-sequence search", () => {
  test("two stacked tiles can never both be free: no sequence", () => {
    const layout = customLayout([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]);
    assert.equal(findRemovalSequence(layout, createRng(1)), null);
  });

  test("an odd number of tiles has no sequence", () => {
    const layout = customLayout([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }]);
    assert.equal(findRemovalSequence(layout, createRng(1)), null);
  });

  test("backtracks out of a dead end", () => {
    // A stack (top T over bottom B) plus loose tiles C and D. Free at start:
    // T, C, D. Removing C+D first strands T over B, so every valid sequence
    // must pair T with C or D first.
    const layout = customLayout([
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 4, y: 0, z: 0 }, { x: 8, y: 0, z: 0 },
    ]);
    const top = layout.positions.find((p) => p.z === 1).index;
    const neutral = layout.positions.map(() => "x");
    for (let seed = 1; seed <= 100; seed++) {
      const seq = findRemovalSequence(layout, createRng(seed));
      assert.ok(seq, `seed ${seed}: found`);
      assert.ok(seq[0].includes(top), `seed ${seed}: first pair takes the top tile`);
      assert.equal(replay(layout, neutral, seq), null);
    }
  });

  test("respects tiles already removed", () => {
    const layout = getLayout("meadow");
    const removed = layout.positions.map((p) => p.z === 2); // cap already gone
    const seq = findRemovalSequence(layout, createRng(5), removed);
    assert.equal(seq.length, (layout.positions.length - 4) / 2);
    assert.ok(seq.flat().every((i) => !removed[i]));
    assert.equal(replay(layout, layout.positions.map(() => "x"), seq, removed), null);
  });

  test("assignBirds puts one bird on both tiles of each pair", () => {
    const birds = assignBirds(4, [[0, 3], [1, 2]], ["osprey", "wood-duck"], createRng(3));
    assert.equal(birds[0], birds[3]);
    assert.equal(birds[1], birds[2]);
    assert.notEqual(birds[0], birds[1]);
    assert.throws(() => assignBirds(4, [[0, 3], [1, 2]], ["osprey"], createRng(3)), /need 2/);
  });
});
