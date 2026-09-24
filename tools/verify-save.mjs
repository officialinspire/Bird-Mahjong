#!/usr/bin/env node
// Autosave / Continue checks in real Chromium, with real page reloads.
//
//   * during play: pairs, score, streak, the selected tile and elapsed time
//     come back after a reload; the saved selection completes a match; the
//     game then plays to a win
//   * after undo: the undone state is what's restored, and the undo history
//     survives (you can keep undoing after the reload)
//   * after a win: nothing to continue; games completed and best score are
//     tracked per difficulty
//   * a stuck board restores with its recovery offer
//   * Pause → Main Menu → Continue without a reload
//   * corrupt saved data (save, settings, bests) is discarded quietly
//   * blocked localStorage (throws on access): the game still runs, says it
//     can't save, and Continue works for the session
//
// Usage: node tools/verify-save.mjs [screenshot-dir]

import fs from "node:fs";
import path from "node:path";
import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, afterMatch, findStuckLine, playPairs, solutionFor, startDifficulty, tile } from "./lib/play.mjs";

const SAVE_KEY = "inspireBirdMahjong:v1:save";
const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 720 } };

async function newPage(browser, options, { initScript } = {}) {
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

const readGame = (page) =>
  page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#board .tile")];
    return {
      removed: tiles.filter((t) => t.hidden).map((t) => Number(t.dataset.index)).sort((a, b) => a - b),
      birds: tiles.map((t) => t.dataset.bird).join(),
      selected: tiles.filter((t) => t.classList.contains("is-selected")).map((t) => Number(t.dataset.index)),
      pairs: document.getElementById("stat-pairs").textContent,
      score: document.getElementById("stat-score").textContent,
      streak: document.getElementById("stat-streak").textContent,
      undoEnabled: !document.getElementById("btn-undo").disabled,
      difficulty: document.getElementById("game-difficulty").textContent,
    };
  });

const savedEnvelope = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), SAVE_KEY);

/** Reload and go to the menu; returns the Continue button's state. */
async function reloadToMenu(page) {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#screen-start");
  return page.evaluate(() => ({
    enabled: !document.getElementById("btn-continue").disabled,
    detail: document.getElementById("continue-detail").textContent,
  }));
}

async function duringPlay(browser, url) {
  console.log("save and restore during play (phone, touch, Medium)");
  const { context, page, errors } = await newPage(browser, PHONE);
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  const fresh = await page.evaluate(() => document.getElementById("btn-continue").disabled);
  check(fresh, "Continue is disabled with nothing saved");
  await startDifficulty(page, "medium");
  const solution = solutionFor("medium");
  await playPairs(page, solution.slice(0, 3), { input: "touch" });
  const [x, y] = solution[3];
  await page.locator(tile(x)).tap();
  await page.waitForTimeout(1500); // let some play time accrue
  const before = await readGame(page);
  const menu = await reloadToMenu(page);
  const envelope = await savedEnvelope(page);
  check(menu.enabled && /Medium · 17 pairs left · 330 pts/.test(menu.detail), "after reload, Continue offers the saved board", menu.detail);
  check(envelope && envelope.elapsedMs >= 1000, `elapsed time was saved (${envelope && envelope.elapsedMs} ms)`);

  await page.locator("#btn-continue").tap();
  await page.waitForSelector("#board .tile:not([hidden])");
  const after = await readGame(page);
  check(JSON.stringify(after) === JSON.stringify(before), "board, birds, score, streak, selection and difficulty are identical",
    `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  await page.locator(tile(y)).tap();
  await afterMatch(page, x, y);
  const matched = await readGame(page);
  check(matched.pairs === "16" && matched.score === "460", "the restored selection completes a match (+130 streak ×4)", `${matched.pairs}, ${matched.score}`);

  await playPairs(page, solution.slice(4), { input: "touch" });
  await page.waitForSelector("#screen-results:not([hidden])");
  const time = await page.textContent("#result-time");
  const [m, s] = time.split(":").map(Number);
  check(m * 60 + s >= Math.floor(envelope.elapsedMs / 1000), `the clock carried on from the saved time (${time})`);
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function afterUndo(browser, url) {
  console.log("save and restore after undo (desktop, mouse, Easy)");
  const { context, page, errors } = await newPage(browser, DESKTOP);
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");
  const solution = solutionFor("easy");
  await playPairs(page, solution.slice(0, 3));
  await page.click("#btn-undo");
  const before = await readGame(page);
  check(before.score === "210" && before.pairs === "10", "undo took back the third pair (210 points, 10 pairs left)");
  await reloadToMenu(page);
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile:not([hidden])");
  const after = await readGame(page);
  check(JSON.stringify(after) === JSON.stringify(before), "the undone state is what comes back");
  check(after.undoEnabled, "undo history survived the reload");
  await page.click("#btn-undo");
  const again = await readGame(page);
  check(again.score === "100" && again.pairs === "11", "undoing again after the reload works (100 points, 11 pairs)");
  await playPairs(page, solution.slice(1));
  await page.waitForSelector("#screen-results:not([hidden])");
  check(errors.length === 0, "then the board plays through to a win", errors.join("; "));
  await context.close();
}

async function afterWin(browser, url) {
  console.log("after a win (desktop, Easy)");
  const { context, page, errors } = await newPage(browser, DESKTOP);
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");
  await playPairs(page, solutionFor("easy"));
  await page.waitForSelector("#screen-results:not([hidden])");
  check(/Easy boards cleared: 1/.test(await page.textContent("#result-cleared")), "results count the first Easy clear");
  const menu = await reloadToMenu(page);
  check(!menu.enabled && (await savedEnvelope(page)) === null, "after a win there is nothing to continue");

  await page.click("#screen-menu [data-go=difficulty]");
  const picker = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll(".difficulty-option")].map((b) => [b.dataset.difficulty, b.querySelector(".difficulty-best").textContent])));
  check(/^Best score 1,650 · 1 cleared$/.test(picker.easy) && picker.medium === "Not cleared yet" && picker.hard === "Not cleared yet",
    "the picker shows Easy's best and games completed, separately from the others", JSON.stringify(picker));

  // A second Easy clear bumps the count.
  await page.click("[data-difficulty=easy]");
  await page.waitForSelector("#board .tile:not([hidden])");
  await solveByHints(page);
  await page.waitForSelector("#screen-results:not([hidden])");
  check(/Easy boards cleared: 2/.test(await page.textContent("#result-cleared")), "a second clear counts as 2");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

// Regression: the win used to be recorded only when the results screen
// appeared, after the short board-clear moment, so closing or reloading the
// page during it lost the win.
async function reloadDuringCelebration(browser, url) {
  console.log("reload during the board-clear moment (desktop, Easy, animations Full)");
  const { context, page, errors } = await newPage(browser, DESKTOP, {
    initScript: () => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem("inspireBirdMahjong:v1:settings", JSON.stringify({ motion: "full", music: false, sfx: false }));
      sessionStorage.setItem("seeded", "1");
    },
  });
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");
  const solution = solutionFor("easy");
  await playPairs(page, solution.slice(0, -1));
  const [a, b] = solution.at(-1);
  await page.locator(tile(a)).click();
  await page.locator(tile(b)).click();
  await page.waitForSelector(".celebration");
  const menu = await reloadToMenu(page);
  check(!menu.enabled, "nothing to continue after reloading mid-celebration");
  await page.click("#screen-menu [data-go=difficulty]");
  const best = await page.textContent('[data-difficulty=easy] .difficulty-best');
  check(/^Best score 1,650 · 1 cleared$/.test(best), `the win is recorded even though results never showed (${best})`);
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

/** Clear whatever board is on screen by taking the app's own hints. */
async function solveByHints(page) {
  for (let i = 0; i < 40; i++) {
    const left = await page.$$eval("#board .tile:not([hidden])", (els) => els.length);
    if (left === 0) return;
    await page.click("#btn-hint");
    const pair = await page.$$eval("#board .tile.is-hint", (els) => els.map((e) => Number(e.dataset.index)));
    await page.click(tile(pair[0]));
    await page.click(tile(pair[1]));
    await afterMatch(page, pair[0], pair[1]);
  }
}

async function stuckRestore(browser, url) {
  console.log("a stuck board restores with its offer (phone, Easy)");
  const line = findStuckLine("easy", "shuffle");
  const { context, page, errors } = await newPage(browser, PHONE);
  await page.goto(`${url}?seed=${line.seed}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");
  await playPairs(page, line.moves, { input: "touch" });
  const before = await readGame(page);
  await reloadToMenu(page);
  await page.locator("#btn-continue").tap();
  await page.waitForSelector("#board .tile:not([hidden])");
  const after = await readGame(page);
  const panel = await page.evaluate(() => !document.getElementById("stuck-panel").hidden && !document.getElementById("btn-stuck-shuffle").hidden);
  check(JSON.stringify(after) === JSON.stringify(before) && panel, "the stuck board comes back with the Shuffle offer");
  await page.locator("#btn-stuck-shuffle").tap();
  const shuffled = await readGame(page);
  await reloadToMenu(page);
  await page.locator("#btn-continue").tap();
  await page.waitForSelector("#board .tile:not([hidden])");
  const again = await readGame(page);
  check(shuffled.birds === again.birds && shuffled.score === again.score, "the shuffled deal is what gets saved and restored");
  check(errors.length === 0, "no page errors", errors.join("; "));
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "save-stuck-restored.png") });
  await context.close();
}

async function pauseToMenu(browser, url) {
  console.log("Pause → Main Menu → Continue (no reload)");
  const { context, page, errors } = await newPage(browser, DESKTOP);
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "hard");
  await playPairs(page, solutionFor("hard").slice(0, 4));
  const before = await readGame(page);
  await page.click("#btn-pause");
  await page.click("#btn-pause-menu");
  const menu = await page.evaluate(() => ({ enabled: !document.getElementById("btn-continue").disabled, detail: document.getElementById("continue-detail").textContent }));
  check(menu.enabled && /Hard · 26 pairs left/.test(menu.detail), "the menu offers Continue straight away", menu.detail);
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "save-menu-continue.png") });
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile:not([hidden])");
  check(JSON.stringify(await readGame(page)) === JSON.stringify(before), "Continue resumes the same board");
  await page.click("#screen-game #btn-game-menu");
  await page.click("#btn-pause-menu");
  await page.click("#screen-menu [data-go=difficulty]");
  check(await page.isVisible("#difficulty-replace-note"), "the picker warns that a new board replaces the saved one");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function corruptStorage(browser, url) {
  console.log("corrupt saved data");
  const junk = {
    [SAVE_KEY]: '{"version":1,"difficultyId":"easy","elapsedMs":5,"game":{"layoutId":"meadow","birds":["dodo"]}}',
    "inspireBirdMahjong:v1:settings": "{not json",
    "inspireBirdMahjong:v1:bests": '["nope"]',
  };
  const { context, page, errors } = await newPage(browser, PHONE);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, junk);
  const menu = await reloadToMenu(page);
  const left = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  check(!menu.enabled && left === null, "a corrupt save isn't offered and is deleted");
  await page.click("#screen-menu [data-go=settings]");
  const motion = await page.evaluate(() => document.querySelector("input[name=motion]:checked").value);
  check(motion === "system", "corrupt settings fall back to defaults");
  await page.click("#screen-settings [data-go=menu]");
  await page.click("#screen-menu [data-go=difficulty]");
  const picker = await page.$$eval(".difficulty-best", (els) => els.map((e) => e.textContent));
  check(picker.every((t) => t === "Not cleared yet"), "corrupt bests are ignored");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function blockedStorage(browser, url) {
  console.log("localStorage blocked (throws on access)");
  const { context, page, errors } = await newPage(browser, PHONE, {
    initScript: () => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("The operation is insecure.", "SecurityError"); },
      });
    },
  });
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await page.click("#screen-start");
  await page.click("#screen-menu [data-go=settings]");
  check(await page.isVisible("#storage-note"), "Settings explains that saving isn't available");
  await page.click("#screen-settings [data-go=menu]");
  await page.click("#screen-menu [data-go=difficulty]");
  await page.click("[data-difficulty=easy]");
  await page.waitForSelector("#board .tile:not([hidden])");
  const solution = solutionFor("easy");
  await playPairs(page, solution.slice(0, 2), { input: "touch" });
  await page.locator("#btn-pause").tap();
  await page.locator("#btn-pause-menu").tap();
  const menu = await page.evaluate(() => !document.getElementById("btn-continue").disabled);
  check(menu, "Continue still works within the session");
  await page.locator("#btn-continue").tap();
  await playPairs(page, solution.slice(2), { input: "touch" });
  await page.waitForSelector("#screen-results:not([hidden])");
  check(errors.length === 0, "the whole game plays without errors", errors.join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
  await duringPlay(browser, url);
  await afterUndo(browser, url);
  await afterWin(browser, url);
  await reloadDuringCelebration(browser, url);
  await stuckRestore(browser, url);
  await pauseToMenu(browser, url);
  await corruptStorage(browser, url);
  await blockedStorage(browser, url);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll save checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
