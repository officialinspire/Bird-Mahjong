#!/usr/bin/env node
// Board layouts and their rotation, in real Chromium.
//
// Covers:
//   * every layout of every difficulty (?seed=…&layout=…) on a small phone,
//     a phone in landscape and a desktop: readable tiles (>= MIN_TILE px, or
//     zoom/pan offered), every free tile hit-testable, no page scrolling,
//     and the header naming the difficulty and layout
//   * each layout played to the end by its known solution, with the results
//     naming the layout and the full score for its pairs
//   * rotation: Play Again deals a different layout each round, every layout
//     comes up within one cycle, and the rotation survives a reload
//   * Continue restores a board on an alternate layout, and the next board
//     after it is a different layout
//
// Usage: node tools/verify-layouts.mjs [screenshot-dir]

import path from "node:path";
import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, playPairs, solutionFor, startDifficulty } from "./lib/play.mjs";
import { DIFFICULTIES } from "../js/config.js";
import { getLayout } from "../js/game/geometry.js";
import { MIN_TILE } from "../js/ui/board-view.js";
import { maxScore } from "../js/game/score.js";

const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const VIEWPORTS = {
  "320x568": { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true },
  "844x390": { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  "1280x720": { viewport: { width: 1280, height: 720 } },
};

async function open(browser, url, options = VIEWPORTS["1280x720"], query = "") {
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}${query}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

const header = (page) => page.textContent("#game-difficulty");

async function fit(browser, url) {
  console.log("every layout: readable, hittable, labelled");
  for (const [vpName, options] of Object.entries(VIEWPORTS)) {
    for (const d of DIFFICULTIES) {
      for (const layoutId of d.layouts) {
        const { context, page, errors } = await open(browser, url, options, `?seed=${SEED}&layout=${layoutId}`);
        await startDifficulty(page, d.id);
        const r = await page.evaluate(() => {
          const vp = document.getElementById("board-viewport");
          const tiles = [...document.querySelectorAll("#board .tile")];
          const unhittable = [];
          for (const t of tiles.filter((x) => x.classList.contains("is-free"))) {
            t.scrollIntoView({ block: "center", inline: "center" });
            const b = t.getBoundingClientRect();
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            if (!hit || hit.closest(".tile") !== t) unhittable.push(t.dataset.index);
          }
          return {
            count: tiles.length,
            minW: Math.min(...tiles.map((t) => t.getBoundingClientRect().width)),
            overflow: vp.scrollWidth > vp.clientWidth + 1 || vp.scrollHeight > vp.clientHeight + 1,
            zoomShown: !document.getElementById("zoom-controls").hidden,
            pageScroll: document.documentElement.scrollHeight - innerHeight,
            unhittable,
          };
        });
        const name = getLayout(layoutId).name;
        const problems = [];
        if (r.count !== d.tiles) problems.push(`${r.count} tiles, expected ${d.tiles}`);
        if (r.minW < MIN_TILE - 0.5) problems.push(`tiles ${Math.round(r.minW)}px < ${MIN_TILE}px`);
        if (r.overflow && !r.zoomShown) problems.push("board overflows but zoom controls are hidden");
        if (r.pageScroll > 1) problems.push(`page scrolls by ${r.pageScroll}px`);
        if (r.unhittable.length) problems.push(`free tiles not hittable: ${r.unhittable.join(",")}`);
        const label = await header(page);
        if (label !== `${d.name} · ${name}`) problems.push(`header "${label}"`);
        if (errors.length) problems.push(errors.join("; "));
        check(!problems.length, `${vpName} ${d.id}/${layoutId}: ${Math.round(r.minW)}px${r.zoomShown ? ", zoom/pan" : ", fits"}`, problems.join("; "));
        if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `layout-${vpName}-${d.id}-${layoutId}.png`) });
        await context.close();
      }
    }
  }
}

async function playEvery(browser, url) {
  console.log("every layout played to the end");
  for (const d of DIFFICULTIES) {
    for (const layoutId of d.layouts) {
      const { context, page, errors } = await open(browser, url, VIEWPORTS["1280x720"], `?seed=${SEED}&layout=${layoutId}`);
      await startDifficulty(page, d.id);
      await playPairs(page, solutionFor(d.id, SEED, layoutId));
      await page.waitForSelector("#screen-results:not([hidden])", { timeout: 5000 });
      const r = await page.evaluate(() => ({
        label: document.getElementById("results-difficulty").textContent,
        score: document.getElementById("result-score").textContent,
        pairs: document.getElementById("result-pairs").textContent,
        next: document.getElementById("result-next").textContent,
      }));
      const expected = `${d.name} · ${getLayout(layoutId).name}`;
      check(r.label === expected && r.pairs === String(d.tiles / 2) && r.score === maxScore(d.tiles / 2).toLocaleString("en-US")
        && /new .* layout/.test(r.next) && !errors.length,
        `${d.id}/${layoutId}: cleared, ${r.score} pts`, JSON.stringify({ ...r, errors }));
      await context.close();
    }
  }
}

async function rotation(browser, url) {
  console.log("rotation between rounds");
  for (const d of DIFFICULTIES) {
    const { context, page, errors } = await open(browser, url);
    await startDifficulty(page, d.id);
    const seen = [await header(page)];
    // Win each board quickly by following the app's own hints.
    const clear = async () => {
      const layoutId = await page.evaluate(() => JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:save")).game.layoutId);
      check(d.layouts.includes(layoutId), `${d.id}: board on one of its layouts (${layoutId})`);
      for (;;) {
        if (await page.isVisible("#screen-results")) break;
        await page.click("#btn-hint");
        const pair = await page.$$eval("#board .tile.is-hint", (els) => els.map((e) => Number(e.dataset.index)));
        if (pair.length !== 2) throw new Error(`hint showed ${pair.length} tiles`);
        await playPairs(page, [pair]);
        if (!(await page.$$eval("#board .tile:not([hidden])", (els) => els.length))) {
          await page.waitForSelector("#screen-results:not([hidden])", { timeout: 5000 });
          break;
        }
      }
    };
    const rounds = d.id === "expert" ? 3 : 4;
    for (let i = 1; i < rounds; i++) {
      await clear();
      await page.click("#btn-play-again");
      await page.waitForSelector("#board .tile");
      seen.push(await header(page));
    }
    const repeats = seen.filter((h, i) => i > 0 && h === seen[i - 1]);
    check(!repeats.length, `${d.id}: consecutive rounds differ — ${seen.join(" → ")}`);
    check(new Set(seen.slice(0, d.layouts.length)).size === d.layouts.length, `${d.id}: every layout within one cycle`);

    // A reload keeps the rotation going: the next board still differs.
    const last = seen.at(-1);
    await page.goto(url, { waitUntil: "networkidle" });
    await startDifficulty(page, d.id);
    const afterReload = await header(page);
    check(afterReload !== last, `${d.id}: after a reload the next board differs (${last} → ${afterReload})`);
    check(!errors.length, `${d.id}: no errors`, errors.join("; "));
    await context.close();
  }
}

async function continueAlternate(browser, url) {
  console.log("Continue on an alternate layout");
  const d = DIFFICULTIES.find((x) => x.id === "medium");
  const layoutId = d.layouts[2];
  const { context, page, errors } = await open(browser, url, VIEWPORTS["1280x720"], `?seed=${SEED}&layout=${layoutId}`);
  await startDifficulty(page, d.id);
  await playPairs(page, solutionFor(d.id, SEED, layoutId).slice(0, 3));
  await page.click("#btn-pause");
  await page.click("#btn-pause-menu");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.click("#screen-start");
  const detail = await page.textContent("#continue-detail");
  check(detail.startsWith(`${d.name} · ${getLayout(layoutId).name} · 17 pairs left`), `menu offers Continue on ${layoutId}`, detail);
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile");
  const r = await page.evaluate(() => ({
    header: document.getElementById("game-difficulty").textContent,
    visible: document.querySelectorAll("#board .tile:not([hidden])").length,
  }));
  check(r.header === `${d.name} · ${getLayout(layoutId).name}` && r.visible === d.tiles - 6, "Continue restores the alternate layout exactly", JSON.stringify(r));
  await page.click("#btn-game-new");
  await page.click("#btn-new-game-confirm");
  await page.waitForFunction((h) => document.getElementById("game-difficulty").textContent !== h, r.header);
  check(true, `New Game after Continue moves on to ${await header(page)}`);
  check(!errors.length, "no errors", errors.join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  try {
    await fit(browser, url);
    await playEvery(browser, url);
    await rotation(browser, url);
    await continueAlternate(browser, url);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll layout rotation checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
