#!/usr/bin/env node
// Responsive layout check for the app shell.
//
// Serves the repo under a GitHub Pages-style sub-path (/Bird-Mahjong/), walks
// every screen at phone, tablet and desktop sizes in Chromium, and checks:
//   * no horizontal overflow
//   * every visible button/link/input is inside the viewport width, can be
//     scrolled into view, is not covered by another element, and meets a
//     44px minimum touch height
//   * no failed requests, console errors, or requests leaving the origin
//   * floating tiles animate normally, and stop under reduced motion (both
//     the OS preference and the in-app setting)
// Screenshots go to the directory given as the first argument (optional).
//
// Usage:  node tools/verify-layout.mjs [screenshot-dir]
// Needs:  the `playwright` package and a Chromium build. Set CHROMIUM_PATH to
//         use an existing binary instead of Playwright's download.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "/Bird-Mahjong/";
const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;

const VIEWPORTS = [
  { name: "phone-se", width: 320, height: 568, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "phone-lg", width: 430, height: 932, touch: true },
  { name: "phone-landscape", width: 844, height: 390, touch: true },
  { name: "tablet", width: 768, height: 1024, touch: true },
  { name: "tablet-landscape", width: 1024, height: 768, touch: true },
  { name: "desktop", width: 1280, height: 720, touch: false },
  { name: "desktop-lg", width: 1920, height: 1080, touch: false },
];

// How to reach each screen from a fresh load.
const SCREENS = [
  { name: "start", steps: [], fits: true },
  { name: "menu", steps: ["#screen-start"] },
  { name: "difficulty", steps: ["#screen-start", "[data-go=difficulty]"] },
  { name: "game", steps: ["#screen-start", "[data-go=difficulty]", "[data-difficulty=advanced]"] },
  { name: "pause", screen: "game", steps: ["#screen-start", "[data-go=difficulty]", "[data-difficulty=easy]", "#btn-pause"], root: "#pause-dialog" },
  { name: "help", steps: ["#screen-start", "#screen-menu [data-go=help]"] },
  { name: "settings", steps: ["#screen-start", "#screen-menu [data-go=settings]"] },
  { name: "results", steps: ["#screen-start", "[data-go=difficulty]", "[data-difficulty=easy]", "#btn-preview-results"] },
];

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (!url.pathname.startsWith(BASE)) { res.writeHead(404).end(); return; }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function auditScreen(page, rootSelector) {
  return page.evaluate(async (rootSelector) => {
    const problems = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) {
      problems.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    }
    const root = document.querySelector(rootSelector);
    const controls = [...root.querySelectorAll("button, a[href], input, .segmented span")]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
      .filter((el) => !(el.matches("input") && el.closest(".segmented")));
    for (const el of controls) {
      const label = (el.textContent || el.getAttribute("aria-label") || el.name || el.tagName).trim().slice(0, 30);
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) problems.push(`"${label}" outside viewport width (${Math.round(r.left)}–${Math.round(r.right)})`);
      if (r.top < -1 || r.bottom > innerHeight + 1) problems.push(`"${label}" cannot be scrolled fully into view`);
      const isInline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!isInline && r.height < 44 && !el.matches("input[role=switch]")) problems.push(`"${label}" only ${Math.round(r.height)}px tall`);
      if (el.matches("input[role=switch]") && r.height < 28) problems.push(`switch "${label}" too small`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const target = el.closest("label") || el;
      if (hit && !target.contains(hit) && !hit.contains(el)) {
        problems.push(`"${label}" covered by <${hit.tagName.toLowerCase()} class="${hit.className}">`);
      }
    }
    window.scrollTo(0, 0);
    return { problems, controls: controls.length };
  }, rootSelector);
}

async function main() {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}${BASE}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

  let failures = 0;
  const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

  for (const vp of VIEWPORTS) {
    console.log(`${vp.name} ${vp.width}x${vp.height}`);
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.touch, isMobile: vp.touch && vp.width < 700, deviceScaleFactor: 1,
        reducedMotion: "reduce", // stable screenshots; motion is checked separately
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
      page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
      page.on("request", (r) => !r.url().startsWith(origin) && !r.url().startsWith("data:") && errors.push(`external request: ${r.url()}`));

      await page.goto(url, { waitUntil: "networkidle" });
      for (const step of screen.steps) await page.click(step);
      const expected = screen.screen || screen.name;
      const active = await page.evaluate(() => document.body.dataset.screen);
      if (active !== expected) fail(`${screen.name}: expected screen "${expected}", got "${active}"`);

      const { problems, controls } = await auditScreen(page, screen.root || `#screen-${expected}`);
      if (screen.fits) {
        const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        if (over > 1) problems.push(`must fit the viewport but scrolls by ${over}px`);
      }
      problems.forEach((p) => fail(`${screen.name}: ${p}`));
      errors.forEach((e) => fail(`${screen.name}: ${e}`));
      if (!problems.length && !errors.length) console.log(`  ok   ${screen.name} (${controls} controls)`);

      if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}-${screen.name}.png`), fullPage: true });
      await context.close();
    }
  }

  // Motion: animated by default, static under OS reduce and the in-app setting.
  console.log("motion");
  const motionCases = [
    { label: "default", reducedMotion: "no-preference", setting: null, expect: "float-up" },
    { label: "OS reduce", reducedMotion: "reduce", setting: null, expect: "none" },
    { label: "setting: Reduced", reducedMotion: "no-preference", setting: "reduce", expect: "none" },
    { label: "setting: Full overrides OS", reducedMotion: "reduce", setting: "full", expect: "float-up" },
  ];
  for (const c of motionCases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: c.reducedMotion });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    if (c.setting) {
      await page.click("#screen-start");
      await page.click("#screen-menu [data-go=settings]");
      await page.click(`.segmented input[value=${c.setting}] + span`);
    }
    const info = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".float-tile")];
      return { count: tiles.length, anims: [...new Set(tiles.map((t) => getComputedStyle(t).animationName))] };
    });
    if (info.count < 6) fail(`motion ${c.label}: only ${info.count} background tiles`);
    else if (info.anims.length !== 1 || info.anims[0] !== c.expect) fail(`motion ${c.label}: animation ${info.anims} (want ${c.expect})`);
    else console.log(`  ok   ${c.label}: ${info.count} tiles, animation ${c.expect}`);
    await context.close();
  }

  // Settings persist across reloads.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.click("#screen-start");
    await page.click("#screen-menu [data-go=settings]");
    await page.click("input[name=backgroundBirds]");
    await page.reload({ waitUntil: "networkidle" });
    const hidden = await page.evaluate(() => document.getElementById("sky-tiles").hidden);
    if (!hidden) fail("settings: background toggle did not persist across reload");
    else console.log("  ok   settings persist across reload");
    await context.close();
  }

  // Keyboard flow: any key starts, Escape pauses in game / goes back elsewhere.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const screenName = () => page.evaluate(() => document.body.dataset.screen);
    const steps = [];
    await page.keyboard.press("Enter"); steps.push(["any key → menu", await screenName(), "menu"]);
    await page.click("#screen-menu [data-go=help]");
    await page.keyboard.press("Escape"); steps.push(["Escape on help → menu", await screenName(), "menu"]);
    await page.click("[data-go=difficulty]");
    await page.click("[data-difficulty=intermediate]");
    await page.keyboard.press("Escape");
    steps.push(["Escape in game → paused", String(await page.evaluate(() => document.getElementById("pause-dialog").open)), "true"]);
    await page.keyboard.press("Escape");
    steps.push(["Escape again → resumed", String(await page.evaluate(() => document.getElementById("pause-dialog").open)), "false"]);
    steps.push(["still in game", await screenName(), "game"]);
    const focused = await page.evaluate(() => document.activeElement.id);
    for (const [label, got, want] of steps) {
      if (got !== want) fail(`keyboard: ${label} (got ${got})`);
      else console.log(`  ok   keyboard: ${label}`);
    }
    if (!focused) fail("keyboard: focus lost after closing pause dialog");
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll layout checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
