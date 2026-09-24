#!/usr/bin/env node
// INSPIRE branding and the Start → intro → Main Menu flow, in real Chromium.
//
//   node tools/verify-intro.mjs
//
// Playwright's Chromium can't decode H.264, so for the "it plays" checks the
// intro MP4 is served as tools/fixtures/intro-test.webm (a 2.5s VP9/Opus cut
// of the same video). Unrouted, the real MP4 exercises the playback-failure
// path. Checks:
//   * the flow: Start → intro → Main Menu when the video ends; no music under
//     the video, Gentle Canopy after it; the start tap can't also skip it
//   * Skip (button and keys), ignored for a moment after the start tap
//   * once per browser session: a reload goes straight to the menu, a new
//     session plays it again
//   * never trapped: unsupported file, missing file (404), a load that never
//     answers, and a hidden tab all reach the menu
//   * the Music switch mutes the intro
//   * logo on Start and in the game footer; the board, toolbar and footer fit
//     on narrow phones
//   * offline: logo and video are precached, and startup works offline

import fs from "node:fs";
import path from "node:path";
import { ROOT, launchBrowser, serve } from "./lib/serve.mjs";
import { SEED } from "./lib/play.mjs";

const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";
const FIXTURE = fs.readFileSync(path.join(ROOT, "tools/fixtures/intro-test.webm"));
const CANOPY = "Bird Mahjong - Gentle Canopy.mp3";
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

/** Track <audio> elements (music) the page creates. */
function instrument() {
  window.__els = [];
  const Real = window.Audio;
  window.Audio = function (...a) { const el = new Real(...a); window.__els.push(el); return el; };
  window.Audio.prototype = Real.prototype;
}

const serveFixture = (route) => route.fulfill({ status: 200, contentType: "video/webm", body: FIXTURE });

async function newContext(browser, { viewport = { width: 1280, height: 800 }, touch = false, settings = {}, video = "fixture", serviceWorkers = "block" } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, serviceWorkers });
  await context.addInitScript(instrument);
  await context.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, [SETTINGS_KEY, JSON.stringify({ music: true, sfx: false, ...settings })]);
  if (video === "fixture") await context.route("**/inspiresoftwareintro.mp4", serveFixture);
  else if (video === "missing") await context.route("**/inspiresoftwareintro.mp4", (r) => r.fulfill({ status: 404, body: "" }));
  else if (video === "hang") await context.route("**/inspiresoftwareintro.mp4", () => { /* never answers */ });
  return context;
}

async function openPage(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  return { page, errors };
}

const screenNow = (page) => page.evaluate(() => document.body.dataset.screen);
const introState = (page) => page.evaluate(() => {
  const v = document.getElementById("intro-video");
  return { t: v.currentTime, paused: v.paused, muted: v.muted, volume: v.volume, src: v.getAttribute("src") };
});
const musicPlaying = (page) => page.evaluate(() => (window.__els || []).filter((e) => !e.paused).map((e) => decodeURIComponent(e.src.split("/").pop())));

async function flow(browser, url) {
  console.log("intro: Start → intro → Main Menu");
  const context = await newContext(browser);
  const { page, errors } = await openPage(context, url);
  await page.click("#screen-start");
  check(await screenNow(page) === "intro", "the start tap opens the intro");
  await page.waitForFunction(() => document.getElementById("intro-video").currentTime > 0.3);
  const s = await introState(page);
  check(!s.paused && !s.muted && s.src === "inspiresoftwareintro.mp4", "the intro video plays, with sound, from a relative path");
  check(Math.abs(s.volume - 0.4) < 0.01, `at the Music volume (${s.volume})`);
  const skip = await page.locator("#btn-skip-intro").boundingBox();
  const vp = page.viewportSize();
  check(skip && skip.x >= 0 && skip.y >= 0 && skip.x + skip.width <= vp.width && skip.y + skip.height <= vp.height && skip.height >= 44,
    "Skip is visible on screen, with a 44px+ target");
  check((await musicPlaying(page)).length === 0, "no background music under the video");
  await page.waitForFunction(() => document.body.dataset.screen === "menu", null, { timeout: 6000 });
  check(true, "when the video ends, the menu follows");
  await page.waitForTimeout(1500);
  const music = await musicPlaying(page);
  check(music.length === 1 && music[0] === CANOPY, `then Gentle Canopy starts (${music.join("+")})`);
  check(errors.length === 0, "no page errors", errors.join("; "));

  console.log("intro: once per browser session");
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#screen-start");
  check(await screenNow(page) === "menu", "after a reload, Start goes straight to the menu");
  const other = await openPage(context, url); // a new tab is a new session
  await other.page.click("#screen-start");
  check(await screenNow(other.page) === "intro", "a new tab (new session) plays it again");
  await context.close();
}

async function skipping(browser, url) {
  console.log("intro: Skip, and no double advance from the start tap");
  const context = await newContext(browser);
  let { page, errors } = await openPage(context, url);
  // A double tap on Start: the second tap lands on the intro, and must not skip it.
  await page.dblclick("#screen-start");
  await page.mouse.click(10, 10);
  await page.keyboard.press("Enter");
  check(await screenNow(page) === "intro", "a double tap / extra key press right after Start doesn't skip the intro");
  await page.waitForTimeout(500);
  await page.click("#btn-skip-intro");
  check(await screenNow(page) === "menu", "Skip goes to the menu");
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.getElementById("intro-video").paused), "and the video stops");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();

  for (const key of ["Escape", "Space", "Enter"]) {
    const ctx = await newContext(browser);
    ({ page, errors } = await openPage(ctx, url));
    await page.keyboard.press("Enter"); // start by keyboard
    check(await screenNow(page) === "intro", `keyboard start opens the intro (${key} test)`);
    await page.keyboard.down(key); // held: repeats must not count…
    await page.waitForTimeout(40);
    await page.keyboard.up(key);
    await page.waitForTimeout(500);
    await page.keyboard.press(key); // …a real press does
    check(await screenNow(page) === "menu", `${key} skips the intro`);
    await ctx.close();
  }
}

async function neverTrapped(browser, url) {
  for (const [video, label, within] of [
    ["real", "the MP4 can't play here (unsupported codec)", 3000],
    ["missing", "the file is missing (404)", 3000],
    ["hang", "the file never loads", 6000],
  ]) {
    console.log(`intro: ${label}`);
    const context = await newContext(browser, { video: video === "real" ? null : video });
    const { page, errors } = await openPage(context, url);
    const t0 = Date.now();
    await page.click("#screen-start");
    await page.waitForFunction(() => document.body.dataset.screen === "menu", null, { timeout: within });
    check(true, `→ the menu anyway, after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.waitForTimeout(1500);
    check((await musicPlaying(page)).join() === CANOPY, "and the menu music plays");
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }

  console.log("intro: tab hidden during the intro");
  const context = await newContext(browser);
  const { page } = await openPage(context, url);
  await page.click("#screen-start");
  await page.waitForFunction(() => document.getElementById("intro-video").currentTime > 0.2);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  check(await screenNow(page) === "menu" && (await introState(page)).paused, "hiding the tab ends the intro (menu, video stopped)");
  await context.close();
}

async function musicSetting(browser, url) {
  console.log("intro: Music off");
  const context = await newContext(browser, { settings: { music: false } });
  const { page } = await openPage(context, url);
  await page.click("#screen-start");
  await page.waitForFunction(() => document.getElementById("intro-video").currentTime > 0.2);
  check((await introState(page)).muted, "with Music off the intro plays muted");
  await context.close();
}

async function layout(browser, url) {
  for (const [name, viewport] of [["small Android 360×640", { width: 360, height: 640 }], ["narrow 320×568", { width: 320, height: 568 }], ["landscape phone 740×360", { width: 740, height: 360 }]]) {
    console.log(`branding layout: ${name}`);
    const context = await newContext(browser, { viewport, touch: true });
    const { page, errors } = await openPage(context, url);
    const start = await page.evaluate(() => {
      const img = document.querySelector("#screen-start .brand-logo");
      const r = img.getBoundingClientRect();
      return { loaded: img.naturalWidth > 0, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: r.height,
        scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check(start.loaded && start.inView && start.h >= 24, `start screen: logo shown in view (${Math.round(start.h)}px tall)`);
    check(!start.scroll, "start screen: no page scroll");
    await page.tap("#screen-start");
    await page.waitForTimeout(500);
    await page.tap("#btn-skip-intro");
    await page.tap("#screen-menu [data-go=difficulty]");
    await page.tap("[data-difficulty=hard]");
    await page.waitForSelector("#board .tile");
    await page.waitForTimeout(500); // let the screen's 8px slide-in settle
    const game = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      const inView = (r) => r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5;
      const buttons = [...document.querySelectorAll(".game-tools .btn:not([hidden]), #btn-game-menu")].filter((b) => b.offsetParent);
      const footer = box(".game-footer");
      const board = box("#board-viewport");
      const logo = document.querySelector(".game-footer .brand-logo");
      return {
        buttons: buttons.every((b) => inView(b.getBoundingClientRect())),
        footer: inView(footer) && footer.height <= 24,
        logo: logo.naturalWidth > 0 && logo.getBoundingClientRect().height >= 14,
        overlap: footer.top < board.bottom - 0.5,
        board: board.height,
        tile: document.querySelector("#board .tile").getBoundingClientRect().width,
        scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    check(game.buttons, "game: every control is on screen");
    check(game.footer && game.logo && !game.overlap, "game: the compact footer and logo sit below the board without covering it");
    check(game.board >= 150 && game.tile >= 40, `game: the board keeps its room (${Math.round(game.board)}px tall, ${Math.round(game.tile)}px tiles)`);
    check(!game.scroll, "game: no page scroll");
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }
}

async function offline(browser, url) {
  console.log("offline startup");
  const context = await newContext(browser, { serviceWorkers: "allow", video: null });
  const { page, errors } = await openPage(context, url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller || (location.reload(), false), null, { timeout: 10000 }).catch(() => {});
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith("bird-mahjong-") && !k.endsWith("runtime")));
    const urls = (await cache.keys()).map((r) => decodeURIComponent(new URL(r.url).pathname.split("/").pop()));
    return ["logo.png", "inspiresoftwareintro.mp4"].filter((f) => urls.includes(f));
  });
  check(cached.length === 2, `logo.png and inspiresoftwareintro.mp4 are precached (${cached.join(", ")})`);
  await context.setOffline(true);
  const fresh = await context.newPage(); // a new tab offline: a new session, so the intro plays
  const offlineErrors = [];
  fresh.on("pageerror", (e) => offlineErrors.push(e.message));
  await fresh.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
  const logo = await fresh.evaluate(() => document.querySelector("#screen-start .brand-logo").naturalWidth);
  check(logo > 0, "offline: the start screen and its logo load");
  // The video comes from the cache (via a range request). This Chromium can't
  // decode H.264, so from the cache it reaches the failure path: the check is
  // that it was served offline (not a network error) and the menu follows.
  const videoResponses = [];
  fresh.on("response", (r) => { if (r.url().includes("inspiresoftwareintro.mp4")) videoResponses.push(r.status()); });
  await fresh.click("#screen-start");
  await fresh.waitForFunction(() => document.body.dataset.screen === "menu", null, { timeout: 6000 });
  check(videoResponses.length > 0 && videoResponses.every((s) => s === 200 || s === 206), `offline: the intro video is served from the cache (${videoResponses.join(", ")})`);
  check(true, "offline: Start → intro → menu");
  await fresh.click("#screen-menu [data-go=difficulty]");
  await fresh.click("[data-difficulty=easy]");
  await fresh.waitForSelector("#board .tile");
  check(await fresh.evaluate(() => document.querySelector(".game-footer .brand-logo").naturalWidth > 0), "offline: the game footer logo loads");
  check(errors.length + offlineErrors.length === 0, "no page errors", [...errors, ...offlineErrors].join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser({ intro: true }); // this suite is about the intro
  await flow(browser, url);
  await skipping(browser, url);
  await neverTrapped(browser, url);
  await musicSetting(browser, url);
  await layout(browser, url);
  await offline(browser, url);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll intro checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
