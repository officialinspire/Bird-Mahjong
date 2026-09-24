// Helpers for driving real games in the browser. Boards are generated from a
// seed with the same pure logic the app uses, so tests know the solution.

import { createGame, findMatches, isWon, recoveryFor, removePair } from "../../js/game/game.js";
import { createRng } from "../../js/game/rng.js";
import { DIFFICULTIES } from "../../js/config.js";

export const SEED = 20260924;

export function solutionFor(difficultyId, seed = SEED) {
  const d = DIFFICULTIES.find((x) => x.id === difficultyId);
  // Must build the board exactly as the app does (same bird pool), or the
  // seeded random stream diverges and the solution won't match the screen.
  return createGame(d.layout, { seed, birdPool: d.birdPool ?? undefined }).solution;
}

export const tile = (i) => `#board .tile[data-index="${i}"]`;

/** Wait until both tiles are gone and the post-match input lock has passed. */
export async function afterMatch(page, a, b) {
  await page.waitForFunction(
    ([x, y]) =>
      [x, y].every((i) => document.querySelector(`#board .tile[data-index="${i}"]`).hidden) &&
      !document.getElementById("board").dataset.locked,
    [a, b]
  );
}

/** Play pairs by tapping (touch) or clicking (mouse). */
export async function playPairs(page, pairs, { input = "mouse" } = {}) {
  for (const [a, b] of pairs) {
    for (const i of [a, b]) {
      const locator = page.locator(tile(i));
      if (input === "touch") await locator.tap();
      else await locator.click();
    }
    await afterMatch(page, a, b);
  }
}

/** Start a difficulty from the start screen. */
export async function startDifficulty(page, difficultyId) {
  await page.click("#screen-start");
  await page.click("#screen-menu [data-go=difficulty]");
  await page.click(`[data-difficulty=${difficultyId}]`);
  await page.waitForSelector("#board .tile");
}

/**
 * Find a seed and a list of legal matches that leaves the board stuck with
 * the given recovery ("shuffle" or "restart"), by seeded random play on the
 * same boards the app builds from ?seed=.
 */
export function findStuckLine(difficultyId, kind, maxSeed = 2000) {
  const d = DIFFICULTIES.find((x) => x.id === difficultyId);
  for (let seed = 1; seed <= maxSeed; seed++) {
    let state = createGame(d.layout, { seed, birdPool: d.birdPool ?? undefined });
    const rng = createRng(seed * 7);
    const moves = [];
    for (;;) {
      const matches = findMatches(state);
      if (!matches.length) break;
      const pair = matches[Math.floor(rng() * matches.length)];
      moves.push(pair);
      state = removePair(state, ...pair);
    }
    if (!isWon(state) && recoveryFor(state) === kind) return { seed, moves, state };
  }
  throw new Error(`no ${kind} line found for ${difficultyId}`);
}

/** Tap Hint and take the highlighted pair, repeatedly, until the board is won. */
export async function followHints(page, { input = "mouse", limit = 60 } = {}) {
  const press = (sel) => (input === "touch" ? page.locator(sel).tap() : page.locator(sel).click());
  for (let i = 0; i < limit; i++) {
    if (await page.isVisible("#screen-results")) return i;
    await press("#btn-hint");
    const pair = await page.$$eval("#board .tile.is-hint", (els) => els.map((e) => Number(e.dataset.index)));
    if (pair.length !== 2) throw new Error(`hint showed ${pair.length} tiles`);
    await press(tile(pair[0]));
    await press(tile(pair[1]));
    await afterMatch(page, pair[0], pair[1]);
    const left = await page.$$eval("#board .tile:not([hidden])", (els) => els.length);
    if (left === 0) {
      // The results screen follows the last match after a short pause.
      await page.waitForSelector("#screen-results:not([hidden])", { timeout: 3000 });
      return i + 1;
    }
  }
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 3000 });
  return limit;
}
