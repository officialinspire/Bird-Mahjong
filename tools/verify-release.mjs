#!/usr/bin/env node
// Release sweep: every difficulty, played to completion, on Android-sized
// phones (portrait and landscape), tablets and desktops, with orientation
// changes mid-game and board zoom/pan.
//
// For each device × difficulty:
//   * the game screen fits: no page scroll, no control clipped or covered,
//     every control >= 44px tall, no visible text smaller than 12px
//   * tiles are >= MIN_TILE wide; boards that can't fit show zoom controls
//   * (touch devices) rotate mid-game: the selected tile survives, the board
//     re-fits, stays readable and in bounds, the board doesn't jump off
//     the player's place, and nothing is clipped in the new orientation
//   * zoom in/out and pan keep the board in bounds and centred where it was
//   * the rest of the game is played by touch or mouse to the results screen
//   * no console errors or failed requests anywhere
//
// Usage: node tools/verify-release.mjs [screenshot-dir]

import fs from "node:fs";
import path from "node:path";
import { launchBrowser, serve, isBenignFailure } from "./lib/serve.mjs";
import { SEED, afterMatch, playPairs, solutionFor, tile } from "./lib/play.mjs";
import { DIFFICULTIES } from "../js/config.js";
import { MIN_TILE } from "../js/ui/board-view.js";

const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
const MIN_FONT = 12;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const DEVICES = [
  { name: "android-small 360x640", width: 360, height: 640, touch: true, dpr: 3 },
  { name: "android 393x851", width: 393, height: 851, touch: true, dpr: 2.75 },
  { name: "android-tall 412x915", width: 412, height: 915, touch: true, dpr: 2.6 },
  { name: "android-land 640x360", width: 640, height: 360, touch: true, dpr: 3 },
  { name: "android-land 851x393", width: 851, height: 393, touch: true, dpr: 2.75 },
  { name: "tablet 800x1280", width: 800, height: 1280, touch: true, dpr: 2 },
  { name: "tablet-land 1280x800", width: 1280, height: 800, touch: true, dpr: 2 },
  { name: "desktop 1024x640", width: 1024, height: 640, touch: false, dpr: 1 },
  { name: "desktop 1366x768", width: 1366, height: 768, touch: false, dpr: 1 },
  { name: "desktop 1920x1080", width: 1920, height: 1080, touch: false, dpr: 1 },
];

/** Layout audit of whatever screen is showing. */
const audit = (page, minTile) =>
  page.evaluate(({ minTile, minFont }) => {
    const problems = [];
    const vw = innerWidth;
    const vh = innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    const active = document.querySelector(".screen:not([hidden])");
    if (active?.id === "screen-game" && document.documentElement.scrollHeight > vh + 1) {
      problems.push(`game screen scrolls (${document.documentElement.scrollHeight - vh}px)`);
    }
    const root = document.querySelector("dialog[open]") || active;
    // Controls: on screen, uncovered, big enough.
    for (const el of root.querySelectorAll("button:not(.tile), a[href], input")) {
      if (!el.getClientRects().length || el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      const label = (el.textContent || el.getAttribute("aria-label") || el.id).trim().slice(0, 24);
      if (active?.id === "screen-game" || root.tagName === "DIALOG") {
        if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) problems.push(`"${label}" clipped`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && !el.contains(hit) && !hit.contains(el) && !el.closest("label")?.contains(hit)) problems.push(`"${label}" covered`);
      }
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      const isSwitch = el.matches("input[role=switch], input[type=radio]");
      if (!inline && !isSwitch && r.height < 43.5) problems.push(`"${label}" only ${Math.round(r.height)}px tall`);
    }
    // Text size.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const small = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || el.closest("[hidden], [aria-hidden=true]") || !el.getClientRects().length) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < minFont - 0.01) small.add(`"${walker.currentNode.textContent.trim().slice(0, 18)}" ${size.toFixed(1)}px`);
    }
    if (small.size) problems.push(`small text: ${[...small].slice(0, 3).join(", ")}`);
    // Board.
    let board = null;
    if (active?.id === "screen-game") {
      const vp = document.getElementById("board-viewport");
      const tiles = [...document.querySelectorAll("#board .tile:not([hidden])")];
      const minW = Math.min(...tiles.map((t) => t.getBoundingClientRect().width));
      const zoom = !document.getElementById("zoom-controls").hidden;
      const overflow = vp.scrollWidth > vp.clientWidth + 1 || vp.scrollHeight > vp.clientHeight + 1;
      if (tiles.length && minW < minTile - 0.5) problems.push(`tiles only ${Math.round(minW)}px wide`);
      if (overflow && !zoom) problems.push("board overflows with no zoom controls");
      const maxL = vp.scrollWidth - vp.clientWidth;
      const maxT = vp.scrollHeight - vp.clientHeight;
      if (vp.scrollLeft < -1 || vp.scrollLeft > maxL + 1 || vp.scrollTop < -1 || vp.scrollTop > maxT + 1) problems.push("board scrolled out of bounds");
      if (vp.clientHeight < 120) problems.push(`board area only ${vp.clientHeight}px tall`);
      board = { tile: Math.round(minW), zoom, vpw: vp.clientWidth, vph: vp.clientHeight };
    }
    return { problems, board };
  }, { minTile, minFont: MIN_FONT });

/** Screen position of a tile's centre, relative to the board viewport. */
const tileSpot = (page, i) =>
  page.evaluate((i) => {
    const t = document.querySelector(`#board .tile[data-index="${i}"]`).getBoundingClientRect();
    const v = document.getElementById("board-viewport").getBoundingClientRect();
    return { x: (t.left + t.width / 2 - v.left) / v.width, y: (t.top + t.height / 2 - v.top) / v.height, visible: t.right > v.left && t.left < v.right && t.bottom > v.top && t.top < v.bottom };
  }, i);

async function sweep(browser, url, device, difficulty) {
  const label = `${device.name} · ${difficulty.name}`;
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    hasTouch: device.touch,
    isMobile: device.touch && device.width < 1000,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`${m.type()}: ${m.text()}`));
  page.on("requestfailed", (r) => !isBenignFailure(r) && errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  const input = device.touch ? "touch" : "mouse";
  const press = (sel) => (device.touch ? page.locator(sel).tap() : page.locator(sel).click());

  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  const problems = [];
  for (const screen of ["start", "menu", "difficulty"]) {
    if (screen === "menu") await press("#screen-start");
    if (screen === "difficulty") await press("#screen-menu [data-go=difficulty]");
    await page.waitForTimeout(350);
    problems.push(...(await audit(page, MIN_TILE)).problems.map((p) => `${screen}: ${p}`));
  }
  await press(`[data-difficulty=${difficulty.id}]`);
  await page.waitForSelector("#board .tile:not([hidden])");
  await page.waitForTimeout(350);
  let a = await audit(page, MIN_TILE);
  problems.push(...a.problems.map((p) => `game: ${p}`));
  const first = a.board;

  const solution = solutionFor(difficulty.id);
  const half = Math.floor(solution.length / 2);
  await playPairs(page, solution.slice(0, half), { input });

  // Zoom + pan, when the board offers it: stay in bounds, keep the centre.
  if (a.board.zoom) {
    const before = await page.evaluate(() => { const v = document.getElementById("board-viewport"); return { sl: v.scrollLeft, st: v.scrollTop }; });
    await press("#btn-zoom-in");
    await press("#btn-zoom-out");
    const after = await page.evaluate(() => { const v = document.getElementById("board-viewport"); return { sl: v.scrollLeft, st: v.scrollTop }; });
    if (Math.abs(after.sl - before.sl) > 40 || Math.abs(after.st - before.st) > 40) problems.push(`zoom in+out moved the view by ${Math.round(after.sl - before.sl)},${Math.round(after.st - before.st)}px`);
    await page.evaluate(() => { const v = document.getElementById("board-viewport"); v.scrollLeft = 99999; v.scrollTop = 99999; });
    await press("#btn-zoom-fit");
    problems.push(...(await audit(page, 0)).problems.map((p) => `after Fit: ${p}`));
    // Back to a readable size (Fit is the player choosing small tiles).
    for (let i = 0; i < 6 && (await page.evaluate((m) => parseFloat(getComputedStyle(document.getElementById("board")).getPropertyValue("--tile-w")) < m, MIN_TILE)); i++) {
      await press("#btn-zoom-in");
    }
  }

  // Rotate mid-game with a tile selected.
  let rotated = null;
  if (device.touch) {
    const [x] = solution[half];
    await page.locator(tile(x)).scrollIntoViewIfNeeded();
    await press(tile(x));
    const spotBefore = await tileSpot(page, x);
    await page.setViewportSize({ width: device.height, height: device.width });
    await page.waitForTimeout(450);
    a = await audit(page, MIN_TILE);
    problems.push(...a.problems.map((p) => `rotated: ${p}`));
    const selected = await page.$$eval("#board .tile.is-selected", (els) => els.map((e) => Number(e.dataset.index)));
    if (selected.length !== 1 || selected[0] !== x) problems.push("rotation lost the selected tile");
    const spotAfter = await tileSpot(page, x);
    if (spotBefore.visible && !spotAfter.visible) problems.push("rotation scrolled the selected tile out of view");
    rotated = a.board;
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${device.name.replace(/\W+/g, "_")}-${difficulty.id}-rotated.png`) });
    // And back again.
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.waitForTimeout(450);
    problems.push(...(await audit(page, MIN_TILE)).problems.map((p) => `rotated back: ${p}`));
    await press(tile(x)); // deselect before continuing the known solution
    await page.waitForTimeout(400);
  }

  await playPairs(page, solution.slice(half), { input });
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 8000 });
  await page.waitForTimeout(350);
  problems.push(...(await audit(page, MIN_TILE)).problems.map((p) => `results: ${p}`));
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${device.name.replace(/\W+/g, "_")}-${difficulty.id}-results.png`) });
  problems.push(...errors);

  const detail = `tiles ${first.tile}px${first.zoom ? " zoom" : ""}${rotated ? `, rotated ${rotated.tile}px${rotated.zoom ? " zoom" : ""}` : ""}`;
  check(problems.length === 0, `${label}: won (${detail})`, problems.slice(0, 6).join(" | "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const only = process.env.DEVICE;
  for (const device of DEVICES.filter((d) => !only || d.name.includes(only))) {
    console.log(device.name);
    for (const difficulty of DIFFICULTIES) await sweep(browser, url, device, difficulty);
  }
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nRelease sweep passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
