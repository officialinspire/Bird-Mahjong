import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES } from "../js/config.js";
import { createRng } from "../js/game/rng.js";
import { createLayoutRotation, ROTATION_KEY } from "../js/layout-rotation.js";
import { memoryStorage } from "../js/storage.js";

const [EASY, MEDIUM] = DIFFICULTIES;

describe("layout rotation", () => {
  test("every layout comes up once per cycle, and never twice in a row", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rotation = createLayoutRotation(memoryStorage(), { rng: createRng(seed) });
      for (const d of DIFFICULTIES) {
        const boards = Array.from({ length: d.layouts.length * 6 }, () => rotation.next(d));
        for (let i = 1; i < boards.length; i++) assert.notEqual(boards[i], boards[i - 1], `seed ${seed}: ${boards}`);
        for (let c = 0; c < boards.length; c += d.layouts.length) {
          assert.deepEqual(boards.slice(c, c + d.layouts.length).sort(), [...d.layouts].sort(), `seed ${seed} cycle ${c}`);
        }
      }
    }
  });

  test("the rotation is remembered across page loads, per difficulty", () => {
    const storage = memoryStorage();
    const first = createLayoutRotation(storage, { rng: createRng(1) });
    const easy1 = first.next(EASY);
    const medium1 = first.next(MEDIUM);
    const second = createLayoutRotation(storage, { rng: createRng(2) });
    const easy2 = second.next(EASY);
    assert.notEqual(easy2, easy1);
    assert.notEqual(second.next(MEDIUM), medium1);
    // The third Easy board is the one layout not yet seen this cycle.
    assert.deepEqual([easy1, easy2, second.next(EASY)].sort(), [...EASY.layouts].sort());
  });

  test("played() (a seeded replay or a continued save) keeps the next board different", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rotation = createLayoutRotation(memoryStorage(), { rng: createRng(seed) });
      for (const layoutId of EASY.layouts) {
        rotation.played(EASY, layoutId);
        assert.notEqual(rotation.next(EASY), layoutId);
      }
    }
  });

  test("junk, stale layouts and hostile storage all fall back to a fresh cycle", () => {
    for (const junk of ["{oops", "null", "[]", '{"easy":5}', '{"easy":{"bag":"x","last":7}}', '{"easy":{"bag":["swamp","swamp"],"last":"swamp"}}']) {
      const storage = memoryStorage();
      storage.setItem(ROTATION_KEY, junk);
      const layoutId = createLayoutRotation(storage).next(EASY);
      assert.ok(EASY.layouts.includes(layoutId), junk);
    }
    // Another difficulty's layout in the bag is ignored.
    const storage = memoryStorage();
    storage.setItem(ROTATION_KEY, JSON.stringify({ easy: { bag: ["old-growth", "old-growth"], last: "meadow" } }));
    const rotation = createLayoutRotation(storage);
    const boards = [rotation.next(EASY), rotation.next(EASY)];
    // Only Easy layouts; the next board avoids the last one, and the one after differs again.
    assert.ok(boards.every((id) => EASY.layouts.includes(id)) && boards[0] !== "meadow" && boards[1] !== boards[0], `${boards}`);

    const hostile = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
      removeItem() { throw new Error("SecurityError"); },
    };
    const fallback = createLayoutRotation(hostile);
    const a = fallback.next(MEDIUM);
    assert.ok(MEDIUM.layouts.includes(a));
    // In-memory stand-in still keeps boards varied for the session.
    assert.notEqual(fallback.next(MEDIUM), a);
  });
});
