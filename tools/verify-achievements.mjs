#!/usr/bin/env node
// Achievements and the Stats screen, in real Chromium, by really playing.
//
// Covers:
//   * a new player: Stats & Achievements opens from the menu, shows zeros and
//     every achievement locked (with progress bars), and Escape/← Menu return
//   * a clean first Easy win earns exactly what the rules say (First Flight,
//     the Easy trophy, Flawless Flight, In the Groove, the Easy speed medal,
//     Quick Wings, plus Night Owl / Early Bird by the clock), mid-game ones
//     arrive as a toast, and the results screen lists them all
//   * the Stats screen then shows the totals, the Easy record and each earned
//     card with its date; a reload keeps everything and re-announces nothing
//   * the humorous ones in real play: Crow or Raven?, Birdbrain (10
//     mismatches), Woodpecker Technique (15 blocked taps), Second Thoughts (10
//     undos), Borrowed Binoculars (10 hints), and Nest Egg via Continue —
//     which is never Flawless
//   * a player from before achievements gets credit from their best scores
//   * corrupt or blocked storage: the game still plays and Stats still opens
//   * layout: the menu and Stats fit a 320px phone with no sideways scroll
//
// Usage: node tools/verify-achievements.mjs [screenshot-dir]

import path from "node:path";
import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, playPairs, solutionFor, startDifficulty, tile } from "./lib/play.mjs";
import { ACHIEVEMENTS, achievementById, earnedIds } from "../js/achievements.js";
import { applyWin, emptyStats } from "../js/player-stats.js";
import { DIFFICULTIES } from "../js/config.js";
import { createGame, removePair, tileIsFree } from "../js/game/game.js";

const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const names = (ids) => ids.map((id) => achievementById(id).name);

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

async function open(browser, url, { options = DESKTOP, query = `?seed=${SEED}`, init = null, initArg, motion = "reduce" } = {}) {
  const context = await browser.newContext({ ...options, reducedMotion: motion });
  if (init) await context.addInitScript(init, initArg);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}${query}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

const readStats = (page) => page.evaluate(() => ({
  summary: Object.fromEntries([...document.querySelectorAll(".stats-summary div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])),
  earned: [...document.querySelectorAll(".achievement.is-earned")].map((li) => li.dataset.achievement),
  locked: [...document.querySelectorAll(".achievement.is-locked")].map((li) => li.dataset.achievement),
  dates: [...document.querySelectorAll(".achievement.is-earned .achievement-date")].map((d) => d.textContent),
  bars: document.querySelectorAll(".achievement.is-locked [role=progressbar]").length,
  badges: document.querySelectorAll(".achievement .badge > .badge-frame").length,
  rows: Object.fromEntries([...document.querySelectorAll(".stats-table tbody tr")].map((tr) => [tr.querySelector("th").textContent, [...tr.querySelectorAll("td")].map((td) => td.textContent)])),
}));

const openStats = async (page) => {
  if (!(await page.isVisible("#screen-menu"))) {
    if (await page.isVisible("#screen-start")) await page.click("#screen-start");
    else await page.click("[data-go=menu] >> visible=true");
  }
  await page.click("#screen-menu [data-go=stats]");
  await page.waitForSelector("#screen-stats:not([hidden]) .achievement");
  return readStats(page);
};

const resultsEarned = (page) => page.$$eval("#result-earned .earned-item", (els) => els.map((e) => e.dataset.achievement));

async function newPlayer(browser, url) {
  console.log("a new player");
  const { context, page, errors } = await open(browser, url, { options: PHONE });
  const s = await openStats(page);
  check(s.summary["Boards cleared"] === "0" && s.summary.Achievements === `0 / ${ACHIEVEMENTS.length}`, "Stats opens from the menu with zero totals", JSON.stringify(s.summary));
  check(s.earned.length === 0 && s.locked.length === ACHIEVEMENTS.length && s.badges === ACHIEVEMENTS.length, `all ${ACHIEVEMENTS.length} achievements shown locked, each with its badge`);
  check(s.bars === ACHIEVEMENTS.filter((a) => a.progress).length, `${s.bars} progress bars on the progressive ones`);
  check(Object.keys(s.rows).join() === DIFFICULTIES.map((d) => d.name).join(), "a records row for every difficulty");
  await page.keyboard.press("Escape");
  check(await page.isVisible("#screen-menu"), "Escape returns to the menu");
  await page.click("#screen-menu [data-go=stats]");
  await page.click("#screen-stats [data-go=menu]");
  check(await page.isVisible("#screen-menu"), "← Menu returns to the menu");
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

async function firstWin(browser, url) {
  console.log("a clean first Easy win");
  const { context, page, errors } = await open(browser, url, { options: PHONE });
  const when = await page.evaluate(() => {
    const d = new Date();
    return { hour: d.getHours(), weekday: d.getDay(), date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
  });
  await startDifficulty(page, "easy");
  // Watch for toasts during play.
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      const card = document.querySelector("#achievement-toast .toast-card");
      if (card && !window.__toasts.includes(card.dataset.achievement)) window.__toasts.push(card.dataset.achievement);
    }).observe(document.getElementById("achievement-toast"), { childList: true, subtree: true });
  });
  await playPairs(page, solutionFor("easy"));
  await page.waitForSelector("#screen-results:not([hidden])");
  // What the rules say this exact win earns, worked out independently from
  // the board (solution, birds, last pair) and the page's clock.
  const game = createGame("meadow", { seed: SEED, birdPool: DIFFICULTIES[0].birdPool });
  const sol = solutionFor("easy");
  const secs = await page.evaluate(() => {
    const [m, s] = document.getElementById("result-time").textContent.split(":").map(Number);
    return m * 60 + s;
  });
  const modelled = applyWin(emptyStats(), {
    difficultyId: "easy", layoutId: "meadow", seconds: secs, pairs: 12, score: 1650, bestStreak: 12, hintsUsed: 0,
    shuffles: 0, mismatches: 0, restarts: 0, undos: 0, continued: false, crowRavenMixups: 0,
    birds: [...new Set(game.birds)], lastBird: game.birds[sol.at(-1)[0]], ...when, at: Date.now(),
  });
  modelled.bestBurst = 12; // all twelve pairs were taken within a few seconds
  const expected = earnedIds(modelled);
  for (const id of ["clears-1", "first-easy", "flawless", "streak-12", "speed-easy", "speed-easy-elite", "quick-wings", "hummingbird-hands"]) {
    check(expected.includes(id), `the rules award ${achievementById(id).name} for this win`);
  }
  const got = await resultsEarned(page);
  check(same(got, expected), `results list: ${names(got).join(", ")}`, `expected ${names(expected).join(", ")}`);
  const toasts = await page.evaluate(() => window.__toasts);
  check(toasts.includes("quick-wings") && !toasts.includes("clears-1"), `mid-game achievements toasted during play (${names(toasts).join(", ")}); end-of-board ones wait for results`);
  check(await page.isHidden("#achievement-toast"), "no toast lingers over the results");
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "achievements-results.png") });

  await page.click("#result-earned [data-go=stats]");
  await page.waitForSelector("#screen-stats:not([hidden]) .achievement");
  const s = await readStats(page);
  check(same(s.earned, expected), "Stats shows the same achievements earned", JSON.stringify(s.earned));
  check(s.summary["Boards cleared"] === "1" && s.summary["Pairs cleared"] === "12" && s.summary["Layouts cleared"] === "1 / 12" && s.summary["Birds seen"] === "6 / 20",
    "totals: 1 board, 12 pairs, 1 layout, 6 birds", JSON.stringify(s.summary));
  check(s.summary["Day streak"] === "1 day" && s.summary["Days played"] === "1" && /^\d+ s$/.test(s.summary["Time birding"]),
    `daily totals: streak ${s.summary["Day streak"]}, days ${s.summary["Days played"]}, time ${s.summary["Time birding"]}`);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:stats")));
  check(stored.lastDay === when.date && stored.weekdays.join() === String(when.weekday) && stored.recentClears.length === 1 && stored.finishBirds.length === 1,
    "the win was stored with today's date, weekday, time and finishing bird", JSON.stringify({ lastDay: stored.lastDay, weekdays: stored.weekdays }));
  // Jump links go to each group.
  const chips = await page.$$eval(".achievement-chip", (els) => els.map((e) => e.dataset.jump));
  check(chips.length === 9, `${chips.length} group jump links`);
  await page.click('.achievement-chip[data-jump="birds"]');
  await page.waitForTimeout(200);
  const jumped = await page.evaluate(() => {
    const r = document.querySelector('.achievement-group[data-category="birds"]').getBoundingClientRect();
    return r.top >= -2 && r.top < innerHeight / 2 && document.activeElement?.textContent.startsWith("Bird specialist");
  });
  check(jumped, "a jump link scrolls to its group and moves focus there");
  check(s.rows.Easy[0] === "1" && s.rows.Easy[1] === "1,650" && /^0:\d\d$/.test(s.rows.Easy[2]), `Easy record: ${s.rows.Easy.join(" · ")}`);
  check(s.dates.length === expected.length && s.dates.every((d) => /^Earned /.test(d)), "each earned card shows the date");
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "achievements-stats.png"), fullPage: true });

  // A reload keeps everything, and announces nothing again.
  await page.reload({ waitUntil: "networkidle" });
  const again = await openStats(page);
  check(same(again.earned, expected) && again.summary["Boards cleared"] === "1", "a reload keeps stats and achievements");
  check(await page.isHidden("#achievement-toast"), "nothing is re-announced after a reload");
  // A second win adds to the totals without re-earning anything.
  await page.click("[data-go=menu] >> visible=true");
  await page.click("#screen-menu [data-go=difficulty]");
  await page.click("[data-difficulty=easy]");
  await page.waitForSelector("#board .tile");
  const hints = [];
  for (let i = 0; i < 12; i++) {
    await page.click("#btn-hint");
    const pair = await page.$$eval("#board .tile.is-hint", (els) => els.map((e) => Number(e.dataset.index)));
    hints.push(pair);
    await playPairs(page, [pair]);
  }
  await page.waitForSelector("#screen-results:not([hidden])");
  const second = await resultsEarned(page);
  check(!second.some((id) => expected.includes(id)) && !second.includes("flawless"), `a second (hinted) win re-earns nothing (${names(second).join(", ") || "none new"})`);
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

/** Seed + solution prefix after which a crow and a raven are both free. */
function crowRavenLine() {
  for (const d of DIFFICULTIES) {
    const g0 = createGame(d.layout, { seed: SEED, birdPool: d.birdPool ?? undefined });
    let g = g0;
    for (let k = 0; k < g0.solution.length; k++) {
      const free = g.birds.map((b, i) => [b, i]).filter(([, i]) => !g.removed[i] && tileIsFree(g, i));
      const crow = free.find(([b]) => b === "american-crow");
      const raven = free.find(([b]) => b === "common-raven");
      if (crow && raven) return { difficulty: d.id, prefix: g0.solution.slice(0, k), crow: crow[1], raven: raven[1] };
      g = removePair(g, ...g0.solution[k]);
    }
  }
  throw new Error("no crow/raven line");
}

async function forFun(browser, url) {
  console.log("just for fun, in real play");
  const line = crowRavenLine();
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, line.difficulty);
  await playPairs(page, line.prefix);
  const toast = () => page.$eval("#achievement-toast", (el) => (el.hidden ? null : el.querySelector(".toast-card")?.dataset.achievement ?? null));
  const toasted = new Set();
  const note = async () => { const t = await toast(); if (t) toasted.add(t); };

  await page.click(tile(line.crow));
  await page.click(tile(line.raven));
  await note();
  check(toasted.has("crow-raven"), `pairing the crow with the raven earns "Crow or Raven?" (${line.difficulty})`);

  // Nine more mismatches between the same two birds (taps alternate).
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(380); // past the double-tap guard
    await page.click(tile(i % 2 === 0 ? line.crow : line.raven));
    await note();
  }
  await page.waitForTimeout(200);
  await note();
  const mismatches = await page.evaluate(() => JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:stats")).maxMismatches);
  check(mismatches === 10, `10 mismatches counted (${mismatches})`);

  // 15 taps on a visible blocked tile.
  const blocked = await page.evaluate(() => {
    for (const t of document.querySelectorAll("#board .tile.is-blocked")) {
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit?.closest(".tile") === t) return Number(t.dataset.index);
    }
    return null;
  });
  // A deliberate pace: quicker repeats of one tile are ignored as double taps.
  for (let i = 0; i < 15; i++) {
    await page.click(tile(blocked), { force: true });
    await page.waitForTimeout(370);
  }
  // Ten hints, then take-and-undo ten times.
  for (let i = 0; i < 10; i++) await page.click("#btn-hint");
  for (let i = 0; i < 10; i++) {
    await page.click("#btn-hint");
    const pair = await page.$$eval("#board .tile.is-hint", (els) => els.map((e) => Number(e.dataset.index)));
    await playPairs(page, [pair]);
    await page.click("#btn-undo");
  }
  const earned = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:achievements"))));
  for (const id of ["crow-raven", "birdbrain", "woodpecker", "binoculars", "second-thoughts"]) {
    check(earned.includes(id), `earned "${achievementById(id).name}"`);
  }
  check(!earned.includes("clears-1"), "…and nothing about clearing, since no board was cleared");

  // Change of Heart: select and deselect the same free tile, at a human pace.
  for (let i = 0; i < 20; i++) {
    await page.click(tile(line.crow));
    await page.waitForTimeout(370);
  }
  const hearts = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:achievements"))));
  check(hearts.includes("change-of-heart"), 'ten deselects earn "Change of Heart"');
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "achievements-toast.png") });
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

async function nestEgg(browser, url) {
  console.log("Nest Egg: continue a saved board, and clear it");
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "easy");
  const solution = solutionFor("easy");
  await playPairs(page, solution.slice(0, 4));
  await page.click("#btn-pause");
  await page.click("#btn-pause-menu");
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#screen-start");
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile");
  await playPairs(page, solution.slice(4));
  await page.waitForSelector("#screen-results:not([hidden])");
  const got = await resultsEarned(page);
  check(got.includes("nest-egg") && got.includes("clears-1"), `a continued clear earns Nest Egg (${names(got).join(", ")})`);
  check(!got.includes("flawless"), "a continued board is never counted as Flawless");
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

async function veterans(browser, url) {
  console.log("players from before achievements");
  const bests = { easy: { score: 1650, bestTime: 55, games: 12 }, medium: { score: 2850, bestTime: 400, games: 3 } };
  // Only best scores in storage, as an older version of the game left them.
  const { context, page, errors } = await open(browser, url, {
    init: (b) => { if (!localStorage.getItem("inspireBirdMahjong:v1:stats")) localStorage.setItem("inspireBirdMahjong:v1:bests", b); },
    initArg: JSON.stringify(bests),
    query: "",
  });
  const s = await openStats(page);
  const expected = ["clears-1", "clears-10", "first-easy", "first-medium", "speed-easy"];
  check(same(s.earned, expected), `earlier clears are credited: ${names(s.earned).join(", ")}`, JSON.stringify(s.earned));
  check(s.summary["Boards cleared"] === "15" && s.rows.Easy.join() === "12,1,650,0:55" && s.rows.Medium[0] === "3", "totals and records carry over", JSON.stringify(s.rows));
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

async function hostileStorage(browser, url) {
  console.log("corrupt and blocked storage");
  {
    const { context, page, errors } = await open(browser, url);
    await page.evaluate(() => {
      localStorage.setItem("inspireBirdMahjong:v1:stats", "{not json");
      localStorage.setItem("inspireBirdMahjong:v1:achievements", "[1,2,3]");
    });
    await page.reload({ waitUntil: "networkidle" });
    const s = await openStats(page);
    check(s.earned.length === 0 && s.summary["Boards cleared"] === "0", "corrupt stats read as a fresh start");
    await page.click("#screen-stats [data-go=menu]");
    await page.click("#screen-menu [data-go=difficulty]");
    await page.click("[data-difficulty=easy]");
    await page.waitForSelector("#board .tile");
    await playPairs(page, solutionFor("easy"));
    await page.waitForSelector("#screen-results:not([hidden])");
    check((await resultsEarned(page)).includes("clears-1"), "…and play still earns and records achievements");
    check(!errors.length, "no errors", errors.join("; "));
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, url, {
      init: () => { Object.defineProperty(window, "localStorage", { get() { throw new Error("SecurityError"); } }); },
    });
    await startDifficulty(page, "easy");
    await playPairs(page, solutionFor("easy"));
    await page.waitForSelector("#screen-results:not([hidden])");
    check((await resultsEarned(page)).includes("first-easy"), "blocked storage: achievements still work for the session");
    await page.click("#result-earned [data-go=stats]");
    await page.waitForSelector("#screen-stats:not([hidden]) .achievement");
    check((await readStats(page)).summary["Boards cleared"] === "1", "…and Stats shows the session's clear");
    check(!errors.length, "no errors", errors.join("; "));
    await context.close();
  }
}

async function layout(browser, url) {
  console.log("layout on small screens");
  for (const [name, options] of [["320x568", { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }], ["844x390", { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }]]) {
    const { context, page, errors } = await open(browser, url, { options });
    await page.click("#screen-start");
    const menu = await page.evaluate(() => {
      const b = document.querySelector("#screen-menu [data-go=stats]").getBoundingClientRect();
      return { w: b.width, h: b.height, sideways: document.documentElement.scrollWidth > innerWidth };
    });
    check(menu.h >= 44 && !menu.sideways, `${name}: menu Stats button is a full-size target, no sideways scroll`);
    await page.click("#screen-menu [data-go=stats]");
    await page.waitForSelector("#screen-stats:not([hidden]) .achievement");
    const r = await page.evaluate(() => ({
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
      clipped: [...document.querySelectorAll(".achievement")].filter((li) => li.getBoundingClientRect().right > innerWidth + 1).length,
    }));
    check(!r.sideways && r.clipped === 0, `${name}: Stats fits the width (no card cut off)`, JSON.stringify(r));
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `achievements-${name}.png`) });
    check(!errors.length, `${name}: no errors`, errors.join("; "));
    await context.close();
  }
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  try {
    await newPlayer(browser, url);
    await firstWin(browser, url);
    await forFun(browser, url);
    await nestEgg(browser, url);
    await veterans(browser, url);
    await hostileStorage(browser, url);
    await layout(browser, url);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll achievement checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
