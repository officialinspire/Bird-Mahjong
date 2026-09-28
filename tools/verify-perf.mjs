#!/usr/bin/env node
// Loading and smoothness checks in real Chromium (graphics/asset optimisation).
//
// Covers:
//   * modules: on a slow connection every game module is requested up front
//     (modulepreload), not discovered one import level at a time
//   * the service worker registers only after the page has loaded, so its
//     precache download doesn't compete with the first load
//   * tile warm-up: after load, every bird tile is fetched and decoded in the
//     size boards use, and every board on every difficulty draws all its
//     tiles on its very first frame (no blank tiles popping in), on a 3×
//     phone and a 1× desktop, including the next board after a win
//   * tile sizes: each board uses the small or medium images to suit tile
//     width × pixel ratio, and zooming in upgrades them to sharp ones
//   * the drifting background is one filter-free image per tile, and an idle
//     game screen needs no main-thread painting
//   * taps stay responsive: tap → next frame on an Expert board
//
// Usage: node tools/verify-perf.mjs

import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, playPairs, solutionFor, startDifficulty } from "./lib/play.mjs";
import { DIFFICULTIES } from "../js/config.js";
import { variantFor } from "../js/ui/tile-images.js";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const SLOW = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };

async function coldLoad(browser, url) {
  console.log("cold load on a slow connection");
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  const t0 = Date.now();
  const started = new Map();
  page.on("request", (r) => { const u = r.url().replace(url, ""); if (!started.has(u)) started.set(u, Date.now() - t0); });
  let loadAt = null;
  page.on("load", () => { loadAt = Date.now() - t0; });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const modules = [...started].filter(([u]) => /^js\/.+\.js$/.test(u) && u !== "js/app.js");
  const spread = Math.max(...modules.map(([, t]) => t)) - Math.min(...modules.map(([, t]) => t));
  // Without preloading, the deepest modules start 3+ round trips (450ms+) after the first.
  check(modules.length >= 20 && spread < SLOW.latency, `all ${modules.length} modules requested together (spread ${spread}ms)`);
  const sw = started.get("sw.js");
  check(sw === undefined || sw >= loadAt, `service worker registers after load (load ${loadAt}ms, sw.js ${sw ?? "later"}ms)`);
  await context.close();
}

/** Start a board and report, at the first frame it is on screen, how many tile images weren't ready. */
async function firstFrame(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const board = document.getElementById("board");
    const report = () => {
      const imgs = [...board.querySelectorAll(".tile img")];
      resolve({
        tiles: imgs.length,
        missing: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).length,
        variants: [...new Set(imgs.map((i) => i.src.match(/tiles-(\w+)\//)?.[1]))],
        tileW: parseFloat(getComputedStyle(board).getPropertyValue("--tile-w")),
      });
    };
    const obs = new MutationObserver(() => {
      if (!board.querySelector(".tile")) return;
      obs.disconnect();
      requestAnimationFrame(report); // what the first painted frame shows
    });
    obs.observe(board, { childList: true });
  }));
}

async function warmBoards(browser, url) {
  console.log("tile warm-up: every board complete on its first frame");
  for (const [name, options] of [["phone 3×", PHONE], ["desktop 1×", DESKTOP]]) {
    const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
    await page.click("#screen-start");
    const dpr = options.deviceScaleFactor;
    const expected = dpr >= 2 ? 40 : 20; // small tiles, plus medium on 2× and up
    // First visit: the service worker takes control after load, and the
    // tiles are warmed again under it (see js/ui/tile-images.js).
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
    let status = null;
    for (let t = 0; t < 100; t++) {
      status = await page.evaluate(async () => (await import("./js/ui/tile-images.js")).warmStatus());
      if (status.generation >= 2 && status.finished === status.generation && status.ready >= expected) break;
      await page.waitForTimeout(200);
    }
    if (!(status.finished >= 2 && status.ready >= expected)) throw new Error(`tiles never warmed: ${JSON.stringify(status)}`);
    check(true, `${name}: ${expected} tile images warmed and decoded in idle time (and again under the service worker)`);
    for (const d of DIFFICULTIES) {
      await page.click("#screen-menu [data-go=difficulty]");
      const frame = firstFrame(page);
      await page.click(`[data-difficulty=${d.id}]`);
      const r = await frame;
      const want = variantFor(r.tileW, dpr);
      check(r.tiles === d.tiles && r.missing === 0 && r.variants.length === 1 && r.variants[0] === want,
        `${name} ${d.id}: all ${r.tiles} tiles drawn on the first frame (${r.variants} tiles at ${r.tileW}px)`, JSON.stringify(r));
      await page.click("#btn-pause");
      await page.click("#btn-pause-menu");
    }
    // The next board after a win (a new layout) is just as immediate.
    await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
    await startDifficulty(page, "easy");
    await playPairs(page, solutionFor("easy"));
    await page.waitForSelector("#screen-results:not([hidden])");
    const frame = firstFrame(page);
    await page.click("#btn-play-again");
    const r = await frame;
    check(r.missing === 0, `${name}: Play Again's board is complete on its first frame`, JSON.stringify(r));

    // A returning visit: the worker controls the page from the start, so one warm-up pass does it.
    await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
    await page.click("#screen-start");
    for (let t = 0; t < 100; t++) {
      const st = await page.evaluate(async () => (await import("./js/ui/tile-images.js")).warmStatus());
      if (st.finished >= 1 && st.ready >= expected) break;
      await page.waitForTimeout(200);
    }
    await page.click("#screen-menu [data-go=difficulty]");
    const again = firstFrame(page);
    await page.click("[data-difficulty=expert]");
    const rv = await again;
    check(rv.missing === 0 && rv.tiles === 80, `${name}: returning visit, Expert board complete on its first frame`, JSON.stringify(rv));
    check(!errors.length, `${name}: no errors`, errors.join("; "));
    await context.close();
  }
}

async function zoomUpgrade(browser, url) {
  console.log("tile sizes follow zoom");
  // A 1.5× phone: a readable 40px tile is 60 device pixels (small images are
  // sharp); zoomed in past ~88px it needs the medium ones.
  const DPR = 1.5;
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
  await startDifficulty(page, "hard");
  const read = () => page.evaluate(() => ({
    tileW: parseFloat(getComputedStyle(document.getElementById("board")).getPropertyValue("--tile-w")),
    variants: [...new Set([...document.querySelectorAll("#board .tile img")].map((i) => i.src.match(/tiles-(\w+)\//)?.[1]))],
  }));
  const before = await read();
  check(before.variants.join() === "sm" && variantFor(before.tileW, DPR) === "sm", `${DPR}× phone board starts with small tiles at ${before.tileW}px`);
  await page.evaluate(() => { for (let i = 0; i < 6; i++) document.getElementById("btn-zoom-in")?.click(); });
  await page.waitForTimeout(200);
  const zoomed = await read();
  const sharp = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#board .tile img")];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return imgs.every((i) => i.naturalWidth >= 180);
  });
  check(zoomed.tileW * DPR > 132 && zoomed.variants.join() === "md" && sharp, `zoomed to ${zoomed.tileW}px, tiles switch to the sharp medium images`, JSON.stringify(zoomed));
  await page.evaluate(() => document.getElementById("btn-zoom-fit")?.click());
  await page.waitForTimeout(200);
  check((await read()).variants.join() === "md", "zooming back out keeps the sharp images (no reload)");
  await context.close();
}

async function smooth(browser, url) {
  console.log("background and responsiveness");
  const context = await browser.newContext({ ...PHONE, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("inspireBirdMahjong:v1:settings", JSON.stringify({ motion: "full" })));
  await page.reload({ waitUntil: "load" });
  const bg = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#sky-tiles > *")];
    return {
      count: tiles.length,
      allImg: tiles.every((t) => t.tagName === "IMG" && t.classList.contains("float-tile")),
      filters: tiles.filter((t) => getComputedStyle(t).filter !== "none").length,
      anims: getComputedStyle(tiles[0]).animationName,
    };
  });
  check(bg.count >= 6 && bg.allImg && bg.filters === 0 && bg.anims === "float-up, sway", `background: ${bg.count} filter-free images, animated by ${bg.anims}`, JSON.stringify(bg));

  await startDifficulty(page, "expert");
  await page.waitForTimeout(800);
  await browser.startTracing(page, { categories: ["devtools.timeline"] });
  await page.waitForTimeout(2000);
  const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const paints = events.filter((e) => e.name === "Paint").length;
  check(paints === 0, `an idle game screen with drifting birds needs no main-thread paints (${paints})`);

  const times = await page.evaluate(async (pairs) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    for (const [a, b] of pairs) {
      for (const i of [a, b]) {
        const t = performance.now();
        document.querySelector(`#board .tile[data-index="${i}"]`).click();
        await frame();
        out.push(performance.now() - t);
        await sleep(i === a ? 50 : 400);
      }
    }
    return out.sort((x, y) => x - y);
  }, solutionFor("expert").slice(0, 8));
  const p90 = Math.round(times[Math.floor(times.length * 0.9)]);
  check(p90 < 50, `Expert taps reach the next frame quickly (p90 ${p90}ms, median ${Math.round(times[times.length >> 1])}ms)`);
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  try {
    await coldLoad(browser, url);
    await warmBoards(browser, url);
    await zoomUpgrade(browser, url);
    await smooth(browser, url);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll performance checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
