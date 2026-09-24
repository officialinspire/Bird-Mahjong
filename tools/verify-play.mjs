#!/usr/bin/env node
// Touch and mouse play checks in real Chromium.
//
// Boards are seeded (?seed=...) and the tests derive each board's solution
// from the same pure logic, so every run plays the same known games.
//
// Covers:
//   * readable tiles (>= MIN_TILE px) on every viewport × difficulty, zoom
//     controls only when the board can't fit, and no page scrolling
//   * every free tile is really hit-testable (not hidden under another)
//   * blocked / covered taps don't select; states are marked without colour
//     (hatch pattern, ✓ badge, ARIA state)
//   * select, double tap guard, background taps ignored, mismatch, match,
//     pairs-left counter, hint, undo, shuffle
//   * zoom in/out/fit, mouse-drag panning that doesn't select, touch swipe
//     panning that doesn't select
//   * a full game won by touch taps (zoomed phone) and one by mouse clicks,
//     ending on the results screen with the score (100 per pair plus streak
//     bonus); no clock is shown during play
//   * best scores are kept per difficulty and shown on the picker
//   * Hint (legal pair, free), Undo (exact prior score), Pause, New Game
//     (asks before discarding progress)
//   * recovery: seeded lines that leave the board stuck get a Shuffle offer
//     (Undo from the offer, Shuffle, then Hint to the finish), and a dead end
//     gets Restart Board, whose original solution then wins
//
// Usage: node tools/verify-play.mjs [screenshot-dir]

import fs from "node:fs";
import path from "node:path";
import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, afterMatch, findStuckLine, followHints, playPairs, solutionFor, startDifficulty, tile } from "./lib/play.mjs";
import { DIFFICULTIES } from "../js/config.js";
import { MIN_TILE } from "../js/ui/board-view.js";
import { maxScore } from "../js/game/score.js";

const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const SMALL_PHONE = { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 720 } };

async function openGame(browser, url, contextOptions, difficulty, { reduced = true } = {}) {
  const context = await browser.newContext({ ...contextOptions, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, difficulty);
  return { context, page, errors };
}

const boardState = (page) =>
  page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#board .tile")];
    return {
      selected: tiles.filter((t) => t.classList.contains("is-selected")).map((t) => Number(t.dataset.index)),
      visible: tiles.filter((t) => !t.hidden).length,
      pairs: document.getElementById("stat-pairs").textContent,
      score: document.getElementById("stat-score").textContent,
      streak: document.getElementById("stat-streak").textContent,
      message: document.getElementById("game-message").textContent,
    };
  });

/** A blocked tile whose centre is actually visible (not under another tile). */
const visibleBlockedTile = (page) =>
  page.evaluate(() => {
    for (const t of document.querySelectorAll("#board .tile.is-blocked")) {
      if (t.hidden) continue;
      t.scrollIntoView({ block: "center", inline: "center" });
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit.closest(".tile") === t) return { index: Number(t.dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });

/** Two free tiles with different birds. */
const mismatchPair = (page) =>
  page.evaluate(() => {
    const free = [...document.querySelectorAll("#board .tile.is-free")];
    for (const a of free) for (const b of free) if (a.dataset.bird !== b.dataset.bird) return [Number(a.dataset.index), Number(b.dataset.index)];
    return null;
  });

async function readability(browser, url) {
  console.log("readability, hit-testing and fit");
  const viewports = {
    "320x568": SMALL_PHONE, "390x844": PHONE, "844x390": { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    "768x1024": { viewport: { width: 768, height: 1024 }, hasTouch: true }, "1280x720": DESKTOP, "1920x1080": { viewport: { width: 1920, height: 1080 } },
  };
  for (const [vpName, options] of Object.entries(viewports)) {
    for (const d of DIFFICULTIES) {
      const { context, page, errors } = await openGame(browser, url, options, d.id);
      const r = await page.evaluate(() => {
        const vp = document.getElementById("board-viewport");
        const tiles = [...document.querySelectorAll("#board .tile")];
        const widths = tiles.map((t) => t.getBoundingClientRect().width);
        const unhittable = [];
        for (const t of tiles.filter((x) => x.classList.contains("is-free"))) {
          t.scrollIntoView({ block: "center", inline: "center" });
          const b = t.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!hit || hit.closest(".tile") !== t) unhittable.push(t.dataset.index);
        }
        return {
          minW: Math.min(...widths),
          overflow: vp.scrollWidth > vp.clientWidth + 1 || vp.scrollHeight > vp.clientHeight + 1,
          zoomShown: !document.getElementById("zoom-controls").hidden,
          pageScroll: document.documentElement.scrollHeight - innerHeight,
          unhittable,
        };
      });
      const label = `${vpName} ${d.id}: tiles ${Math.round(r.minW)}px${r.zoomShown ? ", zoom/pan" : ", fits"}`;
      const problems = [];
      if (r.minW < MIN_TILE - 0.5) problems.push(`tiles narrower than ${MIN_TILE}px`);
      if (r.overflow && !r.zoomShown) problems.push("board overflows but zoom controls are hidden");
      if (r.pageScroll > 1) problems.push(`page scrolls by ${r.pageScroll}px`);
      if (r.unhittable.length) problems.push(`free tiles not hittable: ${r.unhittable.join(",")}`);
      if (errors.length) problems.push(errors.join("; "));
      check(!problems.length, label, problems.join("; "));
      if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `play-${vpName}-${d.id}.png`) });
      await context.close();
    }
  }
}

async function interactions(browser, url, name, options, input) {
  console.log(`${name}: interactions (${input})`);
  const { context, page, errors } = await openGame(browser, url, options, "easy");
  const press = (selector) => (input === "touch" ? page.tap(selector) : page.click(selector));
  const pressAt = (x, y) => (input === "touch" ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

  // Blocked tile: tapping it must not select, and it must be marked without colour.
  const blocked = await visibleBlockedTile(page);
  check(!!blocked, "found a visible blocked tile");
  if (blocked) {
    await pressAt(blocked.x, blocked.y);
    const s = await boardState(page);
    check(s.selected.length === 0, "blocked tile can't be selected", `selected ${s.selected}`);
    check(/blocked|covered/.test(s.message), "blocked tap explains why", s.message);
    const marks = await page.evaluate((i) => {
      const t = document.querySelector(`#board .tile[data-index="${i}"]`);
      return { hatch: getComputedStyle(t, "::after").backgroundImage, disabled: t.getAttribute("aria-disabled"), label: t.getAttribute("aria-label") };
    }, blocked.index);
    check(marks.hatch.includes("repeating-linear-gradient"), "blocked tiles carry a stripe pattern, not just a colour");
    check(marks.disabled === "true" && /blocked|covered/.test(marks.label), "blocked state is exposed to assistive tech", marks.label);
  }
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll("#board .tile")].some((t) => /covered$/.test(t.getAttribute("aria-label")) && t.classList.contains("is-blocked")));
  check(covered, "covered tiles are marked blocked and labelled 'covered'");

  // Select a free tile.
  const [a, b] = solutionFor("easy")[0];
  await press(tile(a));
  let s = await boardState(page);
  check(s.selected.length === 1 && s.selected[0] === a, "free tile selects");
  const badge = await page.evaluate((i) => {
    const t = document.querySelector(`#board .tile[data-index="${i}"]`);
    return { content: getComputedStyle(t.querySelector(".tile-badge"), "::before").content, pressed: t.getAttribute("aria-pressed") };
  }, a);
  check(badge.content.includes("✓") && badge.pressed === "true", "selected tile shows a ✓ badge and aria-pressed");

  // Double tap on the selected tile: must stay selected (not toggle off).
  await (input === "touch" ? page.tap(tile(a)) : page.click(tile(a)));
  s = await boardState(page);
  check(s.selected[0] === a, "a quick second tap on the same tile is ignored (double-tap guard)");

  // Background taps: board felt and the stats area do nothing.
  const felt = await page.evaluate(() => {
    const vp = document.getElementById("board-viewport").getBoundingClientRect();
    for (const [fx, fy] of [[0.02, 0.02], [0.98, 0.98], [0.02, 0.98], [0.98, 0.02]]) {
      const x = vp.left + vp.width * fx, y = vp.top + vp.height * fy;
      if (!document.elementFromPoint(x, y)?.closest(".tile")) return { x, y };
    }
    return null;
  });
  if (felt) await pressAt(felt.x, felt.y);
  await press("#stat-score");
  s = await boardState(page);
  check(!!felt && s.selected[0] === a && s.score === "0", "background taps don't change the selection");

  // Mismatch moves the selection.
  const mm = await mismatchPair(page);
  await page.waitForTimeout(400); // clear the double-tap window
  await press(tile(mm[0]));
  await press(tile(mm[1]));
  s = await boardState(page);
  check(s.selected.length === 1 && s.selected[0] === mm[1] && /don't match/.test(s.message), "mismatch keeps one selection and explains", s.message);

  // Match: select a, tap b.
  await press(tile(a));
  await press(tile(b));
  await afterMatch(page, a, b);
  s = await boardState(page);
  check(s.pairs === "11" && s.score === "100" && /Matched.*\+100/.test(s.message), "matching removes both tiles, counts down pairs and scores +100", `${s.pairs} pairs, score ${s.score}, "${s.message}"`);

  // Undo restores the pair and exactly the score before it — also mid-streak.
  await press("#btn-undo");
  s = await boardState(page);
  check(s.pairs === "12" && s.visible === 24 && s.score === "0", "undo restores the pair and its points");
  const [p1, p2] = solutionFor("easy");
  for (const [x, y] of [p1, p2]) { await press(tile(x)); await press(tile(y)); await afterMatch(page, x, y); }
  const twoPairs = (await boardState(page)).score;
  await press("#btn-undo");
  s = await boardState(page);
  check(twoPairs === "210" && s.score === "100" && s.pairs === "11", `undo after a streak returns the prior score (${twoPairs} → ${s.score})`);

  // Hint: one legal matching pair, free of charge.
  const scoreBeforeHint = s.score;
  await press("#btn-hint");
  const hinted = await page.evaluate(() => {
    const h = [...document.querySelectorAll("#board .tile.is-hint")];
    return {
      n: h.length,
      same: h.length === 2 && h[0].dataset.bird === h[1].dataset.bird,
      free: h.every((t) => t.classList.contains("is-free")),
      badge: h[0] && getComputedStyle(h[0].querySelector(".tile-badge"), "::before").content,
      dashed: h[0] && getComputedStyle(h[0]).outlineStyle,
      score: document.getElementById("stat-score").textContent,
    };
  });
  check(hinted.n === 2 && hinted.same && hinted.free && hinted.badge.includes("?") && hinted.dashed === "dashed",
    "hint marks one legal matching pair with a dashed ring and ? badge");
  check(hinted.score === scoreBeforeHint, "hint costs no points");

  // Pause from the toolbar.
  await press("#btn-pause");
  check(await page.evaluate(() => document.getElementById("pause-dialog").open), "Pause opens the pause dialog");
  await press("#pause-dialog button[value=resume]");
  check(!(await page.evaluate(() => document.getElementById("pause-dialog").open)), "Resume closes it");

  // New Game with progress asks first; "Keep playing" changes nothing.
  const birdsBefore = await page.evaluate(() => [...document.querySelectorAll("#board .tile")].map((t) => t.dataset.bird).join());
  await press("#btn-game-new");
  check(await page.evaluate(() => document.getElementById("new-game-dialog").open), "New Game asks before discarding progress");
  check(await page.evaluate(() => document.activeElement.id === "btn-new-game-cancel"), "the safe choice (Keep playing) has focus");
  await press("#btn-new-game-cancel");
  s = await boardState(page);
  check(s.pairs === "11" && s.score === "100", "Keep playing leaves the board as it was");
  // Confirming deals a fresh board.
  await press("#btn-game-new");
  await press("#btn-new-game-confirm");
  await page.waitForFunction(() => document.getElementById("stat-pairs").textContent === "12");
  s = await boardState(page);
  const birdsAfter = await page.evaluate(() => [...document.querySelectorAll("#board .tile")].map((t) => t.dataset.bird).join());
  check(s.score === "0" && s.visible === 24 && birdsAfter !== birdsBefore, "New board starts fresh");
  // With no progress, New Game doesn't ask.
  await press("#btn-game-new");
  check(!(await page.evaluate(() => document.getElementById("new-game-dialog").open)), "with no progress, New Game starts right away");

  check(errors.length === 0, "no page errors", errors.join("; "));
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `play-${name}-interactions.png`) });
  await context.close();
}

async function zoomAndPan(browser, url) {
  console.log("zoom and pan (320px phone, Hard)");
  // Touch: zoom controls, swipe to pan without selecting.
  {
    const { context, page } = await openGame(browser, url, SMALL_PHONE, "hard");
    const vp = "#board-viewport";
    const read = () => page.evaluate(() => {
      const v = document.getElementById("board-viewport");
      return { w: parseFloat(getComputedStyle(document.getElementById("board")).getPropertyValue("--tile-w")), sw: v.scrollWidth, cw: v.clientWidth, sl: v.scrollLeft, st: v.scrollTop, fitDisabled: document.getElementById("btn-zoom-fit").disabled, inDisabled: document.getElementById("btn-zoom-in").disabled };
    });
    let z = await read();
    check(!(await page.isHidden("#zoom-controls")) && z.w >= MIN_TILE && z.sw > z.cw, `starts zoomed to readable ${z.w}px tiles with panning`);
    await page.tap("#btn-zoom-fit");
    const fit = await read();
    check(fit.sw <= fit.cw + 1 && fit.fitDisabled, `Fit shows the whole board (${fit.w}px tiles)`);
    await page.tap("#btn-zoom-in");
    await page.tap("#btn-zoom-in");
    await page.tap("#btn-zoom-in");
    const zin = await read();
    check(zin.w > fit.w * 1.8 && zin.sw > zin.cw, `+ zooms in (${zin.w}px tiles)`);
    for (let i = 0; i < 12; i++) if (!(await page.isDisabled("#btn-zoom-in"))) await page.tap("#btn-zoom-in");
    const max = await read();
    check(max.inDisabled && max.w <= 110.5, `zoom in stops at a maximum (${max.w}px)`);

    // Swipe with a real touch sequence over a tile: the board scrolls and nothing is selected.
    const box = await page.locator(vp).boundingBox();
    const cdp = await context.newCDPSession(page);
    const x0 = box.x + box.width * 0.7, y0 = box.y + box.height * 0.5;
    const sl0 = (await read()).sl;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let k = 1; k <= 10; k++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - k * 15, y: y0 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    const swiped = await read();
    const s = await boardState(page);
    check(swiped.sl > sl0 + 40 && s.selected.length === 0, `touch swipe pans the board (${Math.round(swiped.sl - sl0)}px) without selecting`);
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "play-zoomed.png") });
    await context.close();
  }
  // Mouse: drag to pan must not select the tile under the pointer.
  {
    const { context, page } = await openGame(browser, url, { viewport: { width: 320, height: 568 } }, "hard");
    const free = await page.evaluate(() => {
      const t = [...document.querySelectorAll("#board .tile.is-free")].find((x) => {
        const r = x.getBoundingClientRect();
        const v = document.getElementById("board-viewport").getBoundingClientRect();
        return r.left > v.left + 60 && r.right < v.right && r.top > v.top && r.bottom < v.bottom;
      });
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const sl0 = await page.evaluate(() => document.getElementById("board-viewport").scrollLeft);
    await page.mouse.move(free.x, free.y);
    await page.mouse.down();
    await page.mouse.move(free.x + 30, free.y, { steps: 3 });
    await page.mouse.move(free.x + 60, free.y, { steps: 3 });
    await page.mouse.up();
    const sl1 = await page.evaluate(() => document.getElementById("board-viewport").scrollLeft);
    const s = await boardState(page);
    check(sl1 < sl0 - 30 && s.selected.length === 0, `mouse drag pans (${Math.round(sl0 - sl1)}px) without selecting`);
    await context.close();
  }
}

async function fullGame(browser, url, name, options, difficulty, input) {
  const { context, page, errors } = await openGame(browser, url, options, difficulty, { reduced: false });
  const t0 = Date.now();
  await playPairs(page, solutionFor(difficulty), { input });
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 5000 });
  const r = await page.evaluate(() => ({
    title: document.getElementById("results-title").textContent,
    pairs: document.getElementById("result-pairs").textContent,
    streak: document.getElementById("result-streak").textContent,
    time: document.getElementById("result-time").textContent,
    score: document.getElementById("result-score").textContent,
    best: document.getElementById("result-best").textContent,
  }));
  const pairs = solutionFor(difficulty).length;
  // A clean clear: every pair in one streak → 100/pair + capped streak bonus.
  const expected = maxScore(pairs).toLocaleString("en-US");
  check(r.pairs === String(pairs) && r.score === expected && r.streak === `×${pairs}` && /\d:\d\d/.test(r.time) && errors.length === 0,
    `${name}: won ${difficulty} by ${input} in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${r.score} points (${r.pairs} pairs, streak ${r.streak}), time ${r.time}`,
    `expected ${expected}; ${errors.join("; ")}`);
  check(/best/i.test(r.best), `${name}: results show the ${difficulty} best score`, r.best);
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `play-${name}-results.png`) });
  await context.close();
}

/** Load a seeded board and play moves that leave it stuck. */
async function reachStuck(browser, url, options, difficulty, kind, input) {
  const line = findStuckLine(difficulty, kind);
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?seed=${line.seed}`, { waitUntil: "networkidle" });
  await startDifficulty(page, difficulty);
  await playPairs(page, line.moves, { input });
  return { context, page, errors, line };
}

/** The stuck panel's state, and whether its buttons are really usable. */
const panelState = (page) =>
  page.evaluate(() => {
    const panel = document.getElementById("stuck-panel");
    const vis = (id) => !document.getElementById(id).hidden;
    const usable = [...panel.querySelectorAll("button:not([hidden])")].every((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && hit && b.contains(hit) && r.height >= 44;
    });
    return {
      shown: !panel.hidden,
      shuffle: vis("btn-stuck-shuffle"),
      restart: vis("btn-stuck-restart"),
      title: document.getElementById("stuck-title").textContent,
      focus: document.activeElement?.id,
      usable,
      score: document.getElementById("stat-score").textContent,
      pairs: document.getElementById("stat-pairs").textContent,
      tiles: document.querySelectorAll("#board .tile:not([hidden])").length,
    };
  });

async function recovery(browser, url) {
  const cases = [
    ["phone", PHONE, "easy", "touch"],
    ["320px phone", SMALL_PHONE, "hard", "touch"],
    ["desktop", DESKTOP, "medium", "mouse"],
  ];
  for (const [name, options, difficulty, input] of cases) {
    console.log(`recovery: shuffle (${name}, ${difficulty}, ${input})`);
    const { context, page, errors, line } = await reachStuck(browser, url, options, difficulty, "shuffle", input);
    const press = (sel) => (input === "touch" ? page.locator(sel).tap() : page.locator(sel).click());
    let p = await panelState(page);
    check(p.shown && p.shuffle && !p.restart && p.focus === "btn-stuck-shuffle",
      `after ${line.moves.length} pairs with none left, a Shuffle offer appears and takes focus`, JSON.stringify(p));
    check(p.usable, "the offer's buttons are on screen, uncovered and full-size");
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `recovery-${difficulty}-shuffle.png`) });

    // Undo from the panel backs out with exact points; redoing it is stuck again.
    const stuckScore = p.score;
    await press("#btn-stuck-undo");
    const undone = await panelState(page);
    check(Number(undone.pairs) === Number(p.pairs) + 1 && Number(undone.score.replace(/,/g, "")) < Number(stuckScore.replace(/,/g, "")),
      `Undo in the offer puts the last pair back (${stuckScore} → ${undone.score})`);
    const [x, y] = line.moves.at(-1);
    await page.waitForTimeout(400);
    await press(tile(x));
    await press(tile(y));
    await afterMatch(page, x, y);
    p = await panelState(page);
    check(p.shown && p.score === stuckScore, "re-matching it restores the same score and the offer returns");

    // Shuffle: same pairs left and score, a legal pair exists, then hints finish the board.
    await press("#btn-stuck-shuffle");
    const after = await panelState(page);
    check(!after.shown && after.pairs === p.pairs && after.score === p.score, "Shuffle keeps pairs left and score, and closes the offer");
    const hints = await followHints(page, { input });
    const done = await page.isVisible("#screen-results");
    check(done && errors.length === 0, `following Hint after the shuffle clears the board (${hints} hints)`, errors.join("; "));
    await context.close();
  }

  console.log("recovery: restart (320px phone, hard, touch)");
  {
    const { context, page, errors, line } = await reachStuck(browser, url, SMALL_PHONE, "hard", "restart", "touch");
    const p = await panelState(page);
    check(p.shown && p.restart && !p.shuffle && p.focus === "btn-stuck-restart" && /can't all be cleared/.test(p.title),
      `a dead end (seed ${line.seed}) offers Restart Board instead of Shuffle`, JSON.stringify(p));
    check(p.usable, "Restart Board is on screen, uncovered and full-size");
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, "recovery-hard-restart.png") });
    await page.locator("#btn-stuck-restart").tap();
    const fresh = await panelState(page);
    check(!fresh.shown && fresh.tiles === 60 && fresh.pairs === "30" && fresh.score === "0", "Restart Board brings back the whole board");
    const d = DIFFICULTIES.find((x) => x.id === "hard");
    // The restarted deal is the original one, so its known solution still wins.
    const { createGame } = await import("../js/game/game.js");
    const original = createGame(d.layout, { seed: line.seed }).solution;
    await playPairs(page, original, { input: "touch" });
    await page.waitForSelector("#screen-results:not([hidden])");
    check(errors.length === 0, "the restarted board's original solution wins", errors.join("; "));
    await context.close();
  }
}

async function bestScores(browser, url) {
  console.log("best scores and time");
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");

  const clock = await page.evaluate(() => ({
    statTime: !!document.getElementById("stat-time"),
    text: document.querySelector("#screen-game .game-stats").textContent,
  }));
  check(!clock.statTime && !/\d:\d\d/.test(clock.text), "no clock is shown during play", clock.text);

  // Win Easy once with a mismatch mid-streak (streak broken → lower score)...
  const pairs = solutionFor("easy");
  await playPairs(page, pairs.slice(0, 3));
  const mm = await mismatchPair(page);
  await page.click(tile(mm[0]));
  await page.click(tile(mm[1]));           // mismatch: mm[1] is now selected
  await page.waitForTimeout(400);          // past the double-tap window
  await page.click(tile(mm[1]));           // deliberate deselect
  const selected = await page.evaluate(() => document.querySelectorAll("#board .tile.is-selected").length);
  check(selected === 0, "a deliberate second tap (after the double-tap window) deselects");
  await page.waitForTimeout(400);          // the next tap may be on that same tile
  await playPairs(page, pairs.slice(3));
  await page.waitForSelector("#screen-results:not([hidden])");
  const first = await page.evaluate(() => ({ score: document.getElementById("result-score").textContent, best: document.getElementById("result-best").textContent }));
  check(/First Easy clear/.test(first.best) && first.score !== maxScore(12).toLocaleString("en-US"),
    `first Easy clear becomes the best (${first.score}, below the ${maxScore(12)} maximum after a broken streak)`, first.best);

  // Picker shows Easy's best only.
  await page.click("#screen-results [data-go=menu]");
  await page.click("#screen-menu [data-go=difficulty]");
  const picker = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll(".difficulty-option")].map((b) => [b.dataset.difficulty, b.querySelector(".difficulty-best").textContent])));
  check(picker.easy === `Best score ${first.score} · 1 cleared` && picker.medium === "Not cleared yet" && picker.hard === "Not cleared yet",
    "the picker shows a separate best for each difficulty", JSON.stringify(picker));

  // Win Medium: its best is separate from Easy's.
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "medium");
  await playPairs(page, solutionFor("medium"));
  await page.waitForSelector("#screen-results:not([hidden])");
  const medium = await page.evaluate(() => document.getElementById("result-best").textContent);
  check(/First Medium clear/.test(medium), "Medium keeps its own best", medium);

  // Replay the same Easy board cleanly: higher score → new best.
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await startDifficulty(page, "easy");
  await playPairs(page, pairs);
  await page.waitForSelector("#screen-results:not([hidden])");
  const second = await page.evaluate(() => ({ best: document.getElementById("result-best").textContent, flag: document.getElementById("result-best").dataset.newBest, note: document.getElementById("results-note").textContent }));
  check(second.flag === "true" && /New best score for Easy/.test(second.best), "a higher Easy score replaces the Easy best", second.best);
  check(/never affects your score/.test(second.note), "time is presented as a personal stat only", second.note);
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

  await readability(browser, url);
  await interactions(browser, url, "phone", PHONE, "touch");
  await interactions(browser, url, "desktop", DESKTOP, "mouse");
  await zoomAndPan(browser, url);
  console.log("full games");
  await fullGame(browser, url, "phone-touch", SMALL_PHONE, "hard", "touch");
  await fullGame(browser, url, "desktop-mouse", DESKTOP, "medium", "mouse");
  await bestScores(browser, url);
  await recovery(browser, url);

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll play checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
