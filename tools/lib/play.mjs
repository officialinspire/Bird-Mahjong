// Helpers for driving real games in the browser. Boards are generated from a
// seed with the same pure logic the app uses, so tests know the solution.

import { createGame } from "../../js/game/game.js";
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
