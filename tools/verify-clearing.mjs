#!/usr/bin/env node
// Pair-clearing polish: the lift/fade and woodland sparkle, and that no effect
// outlives what it belongs to.
//
//   node tools/verify-clearing.mjs
//
// Checks, in real Chromium:
//   * a match lifts and fades the pair, shows a sparkle per tile, and then
//     leaves nothing behind (no ghost tile, no stray sparkle or score tag)
//   * fast repeated taps and double taps remove a pair exactly once
//   * a tile uncovered by the match can't be tapped until the old tile is gone
//   * Undo, Restart (pause menu and stuck panel), Shuffle and leaving the
//     screen mid-animation settle every effect at once
//   * the board-clear moment can't be interrupted, and leaves nothing behind
//   * reduced motion: no movement or sparkle, and play isn't delayed

import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, afterMatch, findStuckLine, playPairs, solutionFor, startDifficulty, tile } from "./lib/play.mjs";
import { createGame, removePair, tileIsFree } from "../js/game/game.js";
import { isCovered } from "../js/game/rules.js";
import { getLayout } from "../js/game/geometry.js";
import { DIFFICULTIES } from "../js/config.js";

const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

async function open(browser, url, { motion = "full", seed = SEED } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
  });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v),
    [SETTINGS_KEY, JSON.stringify({ motion, music: false, sfx: false })]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}?seed=${seed}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

/** Everything decorative or mid-animation still in the document. */
const leftovers = (page) => page.evaluate(() => ({
  removing: document.querySelectorAll(".tile.is-removing").length,
  sparkles: document.querySelectorAll(".match-sparkle").length,
  floats: document.querySelectorAll(".score-float").length,
  celebrations: document.querySelectorAll(".celebration").length,
}));
const clean = (l) => l.removing + l.sparkles + l.floats + l.celebrations === 0;

/** Tiles on screen vs tiles the game still has: a "ghost" is shown but removed. */
const ghosts = (page) => page.evaluate(() => {
  const shown = [...document.querySelectorAll("#board .tile:not([hidden])")].map((t) => Number(t.dataset.index));
  return shown;
});

const stats = (page) => page.evaluate(() => ({
  pairs: document.getElementById("stat-pairs").textContent,
  score: document.getElementById("stat-score").textContent,
}));

/** Click both tiles of a pair without waiting for the animation. */
async function quickMatch(page, a, b) {
  await page.locator(tile(a)).click();
  await page.locator(tile(b)).click();
}

async function animation(browser, url) {
  console.log("clearing: the lift, fade and sparkle");
  const [[a, b], [c, d]] = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await quickMatch(page, a, b);
  const during = await page.evaluate(([x, y]) => {
    const els = [x, y].map((i) => document.querySelector(`#board .tile[data-index="${i}"]`));
    const style = getComputedStyle(els[0]);
    return {
      removing: els.every((e) => e.classList.contains("is-removing") && !e.hidden),
      animation: style.animationName,
      duration: parseFloat(style.animationDuration),
      sparkles: document.querySelectorAll(".match-sparkle").length,
      specks: document.querySelectorAll(".match-sparkle .spark").length,
      feathers: document.querySelectorAll(".match-sparkle .match-feather").length,
      sparkleBlocks: [...document.querySelectorAll(".match-sparkle")].some((s) => getComputedStyle(s).pointerEvents !== "none"),
      hidden: [...document.querySelectorAll(".match-sparkle")].every((s) => s.getAttribute("aria-hidden") === "true"),
      locked: document.getElementById("board").dataset.locked === "true",
    };
  }, [a, b]);
  check(during.removing && during.animation === "tile-lift", "the matched pair lifts and fades (tile-lift)");
  check(during.duration >= 0.2 && during.duration <= 0.35, `quick: ${during.duration * 1000}ms`);
  check(during.sparkles === 2 && during.specks === 8 && during.feathers === 2, "a small sparkle and one feather over each tile");
  check(!during.sparkleBlocks && during.hidden, "the accent takes no input and is hidden from screen readers");
  check(during.locked, "the board ignores taps while the pair is on its way out");
  await afterMatch(page, a, b);
  const gone = await page.evaluate(([x, y]) => [x, y].every((i) => {
    const e = document.querySelector(`#board .tile[data-index="${i}"]`);
    return e.hidden && !e.classList.contains("is-removing") && e.classList.contains("is-removed");
  }), [a, b]);
  check(gone, "then the pair is hidden for good");
  await page.waitForTimeout(950);
  check(clean(await leftovers(page)), "after a moment nothing is left: no sparkle, no score tag");
  // Board stays usable straight after.
  await quickMatch(page, c, d);
  await afterMatch(page, c, d);
  check((await stats(page)).pairs === "10", "the next pair plays normally", (await stats(page)).pairs);
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function fastTaps(browser, url) {
  console.log("clearing: fast repeated taps");
  const solution = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  const before = await stats(page);
  const [a, b] = solution[0];
  // A burst of taps in one go: a, a, a, b, b, b, then a and b again.
  await page.evaluate(([x, y]) => {
    const t = (i) => document.querySelector(`#board .tile[data-index="${i}"]`);
    for (const i of [x, x, x, y, y, y, x, y]) t(i).click();
  }, [a, b]);
  await afterMatch(page, a, b);
  const after = await stats(page);
  check(after.pairs === "11 left" || after.pairs.startsWith("11"), `one pair removed, once (${before.pairs} → ${after.pairs})`);
  check(Number(after.score.replace(/\D/g, "")) === 100, `scored once (+${after.score})`);
  // Real mouse double-clicks on the next pair.
  const [c, d] = solution[1];
  await page.locator(tile(c)).dblclick();
  await page.locator(tile(d)).dblclick();
  await afterMatch(page, c, d);
  await page.waitForTimeout(400);
  const s = await stats(page);
  check(s.pairs.startsWith("10"), `double-clicking removes exactly one pair (${s.pairs})`);
  // Hammer through the rest of the board as fast as input allows.
  for (const [x, y] of solution.slice(2)) {
    await page.locator(tile(x)).click({ clickCount: 2, delay: 0 });
    await page.locator(tile(y)).click();
    await afterMatch(page, x, y);
  }
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 5000 });
  check((await ghosts(page)).length === 0, "the whole board cleared with no ghost tiles");
  check(clean(await leftovers(page)), "results arrive with every effect gone");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

/** The first pair in the Easy solution whose removal uncovers a covered tile. */
function uncoveringStep() {
  const d = DIFFICULTIES.find((x) => x.id === "easy");
  let state = createGame(d.layout, { seed: SEED, birdPool: d.birdPool ?? undefined });
  const layout = getLayout(state.layoutId);
  for (const [k, [a, b]] of state.solution.entries()) {
    const next = removePair(state, a, b);
    const uncovered = next.birds.map((_, i) => i).filter((i) =>
      !next.removed[i] && isCovered(layout.links, state.removed, i) && tileIsFree(next, i));
    if (uncovered.length) return { k, pair: [a, b], uncovered: uncovered[0], solution: state.solution };
    state = next;
  }
  throw new Error("no uncovering step");
}

async function uncoveredTaps(browser, url) {
  console.log("clearing: a tile uncovered by the match waits for the old one to go");
  const { k, pair: [a, b], uncovered, solution } = uncoveringStep();
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await playPairs(page, solution.slice(0, k));
  await quickMatch(page, a, b);
  // Straight away, as a quick second tap would.
  await page.evaluate((u) => document.querySelector(`#board .tile[data-index="${u}"]`).click(), uncovered);
  const early = await page.evaluate((u) => document.querySelector(`#board .tile[data-index="${u}"]`).classList.contains("is-selected"), uncovered);
  check(!early, `tile ${uncovered}, uncovered by the match, ignores a tap while the pair is still fading over it`);
  await afterMatch(page, a, b);
  await page.locator(tile(uncovered)).click();
  const later = await page.evaluate((u) => document.querySelector(`#board .tile[data-index="${u}"]`).classList.contains("is-selected"), uncovered);
  check(later, "once the pair is gone, it selects normally");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function undoMidAnimation(browser, url) {
  console.log("clearing: Undo mid-animation");
  const [[a, b]] = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await quickMatch(page, a, b);
  await page.click("#btn-undo");
  let l = await leftovers(page);
  check(clean(l), "Undo settles the lift, sparkle and score tag at once", JSON.stringify(l));
  const back = () => page.evaluate(([x, y]) => [x, y].every((i) => {
    const e = document.querySelector(`#board .tile[data-index="${i}"]`);
    return !e.hidden && !e.classList.contains("is-removed") && getComputedStyle(e).opacity === "1";
  }), [a, b]);
  check(await back(), "the pair is back, fully visible");
  await page.waitForTimeout(600);
  check(await back(), "and no leftover timer hides it later");
  check((await stats(page)).score.replace(/\D/g, "") === "0", "score back to 0");
  // Matching the same pair again works normally.
  await quickMatch(page, a, b);
  await afterMatch(page, a, b);
  check((await stats(page)).pairs.startsWith("11"), "the same pair can be matched again");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function restartMidAnimation(browser, url) {
  console.log("clearing: Restart mid-animation (pause menu)");
  const solution = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await playPairs(page, solution.slice(0, 2));
  const [a, b] = solution[2];
  await quickMatch(page, a, b);
  await page.click("#btn-pause");
  await page.click("#btn-pause-restart");
  await page.waitForTimeout(50);
  const l = await leftovers(page);
  check(clean(l), "Restart settles every effect", JSON.stringify(l));
  const shown = await ghosts(page);
  check(shown.length === 24, `all 24 tiles are back (${shown.length})`);
  await page.waitForTimeout(600);
  check((await ghosts(page)).length === 24, "and none disappears afterwards");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function stuckMidAnimation(browser, url, kind, difficulty = "easy") {
  console.log(`clearing: ${kind === "shuffle" ? "Shuffle" : "Restart Board"} mid-animation (stuck panel)`);
  const { seed, moves } = findStuckLine(difficulty, kind);
  const tiles = DIFFICULTIES.find((x) => x.id === difficulty).tiles;
  const { context, page, errors } = await open(browser, url, { seed });
  await startDifficulty(page, difficulty);
  await playPairs(page, moves.slice(0, -1));
  const [a, b] = moves.at(-1);
  await quickMatch(page, a, b); // this match leaves the board stuck
  const button = kind === "shuffle" ? "#btn-stuck-shuffle" : "#btn-stuck-restart";
  await page.waitForSelector(`${button}:not([hidden])`);
  const fading = await page.evaluate(([x]) => document.querySelector(`#board .tile[data-index="${x}"]`).classList.contains("is-removing"), [a]);
  await page.click(button);
  const l = await leftovers(page);
  check(clean(l), `${kind} while the last pair is still fading${fading ? "" : " (it had just finished)"} settles every effect`, JSON.stringify(l));
  const hiddenPair = await page.evaluate(([x, y]) => [x, y].map((i) => document.querySelector(`#board .tile[data-index="${i}"]`).hidden), [a, b]);
  if (kind === "shuffle") check(hiddenPair.every(Boolean), "the matched pair is gone for good, not a ghost with a new bird");
  else check(hiddenPair.every((h) => !h) && (await ghosts(page)).length === tiles, `Restart brings all ${tiles} tiles back`);
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function screenChange(browser, url) {
  console.log("clearing: leaving the screen mid-animation");
  const solution = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await playPairs(page, solution.slice(0, 1));
  const [a, b] = solution[1];
  await quickMatch(page, a, b);
  await page.click("#btn-pause");
  await page.click("#btn-pause-menu");
  const l = await leftovers(page);
  check(clean(l), "going to the menu settles every effect", JSON.stringify(l));
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile");
  const shown = await ghosts(page);
  const expected = 24 - 4;
  check(shown.length === expected && ![...solution[0], a, b].some((i) => shown.includes(i)), `Continue shows exactly the ${expected} tiles left, no ghosts`);
  check(clean(await leftovers(page)), "and nothing decorative");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function celebration(browser, url) {
  console.log("clearing: the board-clear moment");
  const solution = solutionFor("easy");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  await playPairs(page, solution.slice(0, -1));
  const [a, b] = solution.at(-1);
  await quickMatch(page, a, b);
  await page.waitForSelector(".celebration");
  await page.keyboard.press("Escape");
  await page.click("#btn-pause", { force: true }).catch(() => {});
  await page.click("#btn-game-new", { force: true }).catch(() => {});
  const dialogs = await page.evaluate(() => document.getElementById("pause-dialog").open || document.getElementById("new-game-dialog").open);
  check(!dialogs, "Pause and New Game wait during the short celebration");
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 4000 });
  check(clean(await leftovers(page)), "results arrive with the celebration and sparkles gone");
  // Play again straight away: a fresh board with nothing left over.
  await page.click("#screen-results [data-go=difficulty], #btn-play-again").catch(() => {});
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function reducedMotion(browser, url) {
  console.log("clearing: reduced motion");
  const solution = solutionFor("easy");
  const { context, page, errors } = await open(browser, url, { motion: "reduce" });
  await startDifficulty(page, "easy");
  const [a, b] = solution[0];
  await quickMatch(page, a, b);
  const now = await page.evaluate(([x, y]) => ({
    hidden: [x, y].every((i) => document.querySelector(`#board .tile[data-index="${i}"]`).hidden),
    sparkles: document.querySelectorAll(".match-sparkle").length,
    floats: document.querySelectorAll(".score-float").length,
  }), [a, b]);
  check(now.hidden, "the pair goes at once, with no movement");
  check(now.sparkles === 0 && now.floats === 0, "no sparkle and no floating score");
  // Play the rest at a quick human pace: 150ms after each match is enough.
  const started = Date.now();
  for (const [x, y] of solution.slice(1)) {
    await page.waitForTimeout(150);
    await quickMatch(page, x, y);
  }
  const quick = await page.evaluate(() => document.querySelectorAll("#board .tile:not([hidden])").length);
  check(quick === 0, `no tap was lost to an animation wait (${solution.length} pairs in ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 3000 });
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  await animation(browser, url);
  await fastTaps(browser, url);
  await uncoveredTaps(browser, url);
  await undoMidAnimation(browser, url);
  await restartMidAnimation(browser, url);
  await stuckMidAnimation(browser, url, "shuffle");
  await stuckMidAnimation(browser, url, "restart", "hard"); // only Hard boards can end up past shuffling
  await screenChange(browser, url);
  await celebration(browser, url);
  await reducedMotion(browser, url);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll clearing checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
