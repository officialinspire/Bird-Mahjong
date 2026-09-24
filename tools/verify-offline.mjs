#!/usr/bin/env node
// Offline, install and update checks in real Chromium, served from a GitHub
// Pages-style sub-path (/Bird-Mahjong/).
//
//   * first load: the worker installs, takes control, and precaches every
//     file in sw.js's list; no update banner or reload on first install
//   * install: Chromium's own manifest parser and installability check
//     report no errors; icons and start_url resolve under /Bird-Mahjong/
//   * offline: reload, deep links (?seed=, index.html), every tile image
//     (including the full-resolution ones used when zoomed), a whole game
//     to the results screen, and autosave/Continue across an offline reload
//   * update: publish a "v2" (new sw.js + changed CSS) → the new worker
//     installs beside the old one, the page keeps using v1 consistently (even
//     across a plain reload), a banner offers Refresh; Refresh autosaves,
//     switches to v2 exactly once, deletes the v1 cache, and the saved board
//     is still there; v2 then works offline
//   * every request stayed under /Bird-Mahjong/
//
// Usage: node tools/verify-offline.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { launchBrowser, serve, ROOT, isBenignFailure } from "./lib/serve.mjs";
import { SEED, playPairs, solutionFor, startDifficulty } from "./lib/play.mjs";
import { precacheList } from "./build-sw.mjs";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const DESKTOP = { viewport: { width: 1280, height: 720 } };

/** Wait until the page is controlled by an activated worker. */
const controlled = (page) =>
  page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 15000 });

const cacheReport = (page) =>
  page.evaluate(async () => {
    const keys = await caches.keys();
    const report = {};
    for (const k of keys) report[k] = (await (await caches.open(k)).keys()).map((r) => decodeURIComponent(new URL(r.url).pathname));
    return report;
  });

async function firstLoad(browser, url) {
  console.log("first load");
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: "reduce" });
  const page = await context.newPage();
  let navigations = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations++; });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await controlled(page);
  const caches = await cacheReport(page);
  const versioned = Object.keys(caches).filter((k) => /^bird-mahjong-[0-9a-f]{12}$/.test(k));
  const expected = precacheList().map((f) => (f === "./" ? "/Bird-Mahjong/" : `/Bird-Mahjong/${f}`));
  const cached = new Set(versioned.length === 1 ? caches[versioned[0]] : []);
  const missing = expected.filter((p) => !cached.has(p));
  check(versioned.length === 1 && missing.length === 0, `one versioned cache holds all ${expected.length} precached files`, missing.slice(0, 5).join(", "));
  check(navigations === 1 && (await page.isHidden("#update-banner")), "first install: no reload, no update banner");

  const icons = JSON.parse(fs.readFileSync(`${ROOT}/manifest.webmanifest`, "utf8")).icons;
  const iconStatus = await Promise.all(icons.map((i) => page.request.get(new URL(i.src, url).href).then((r) => r.status())));
  check(iconStatus.every((s) => s === 200), "every manifest icon loads");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

/**
 * Chromium's own install checks. Playwright's ordinary contexts are incognito,
 * where installing is never allowed, so this uses a real (temporary) profile.
 */
async function installability(url) {
  console.log("installability (Chromium, regular profile)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bird-mahjong-profile-"));
  const context = await chromium.launchPersistentContext(dir, {
    ...DESKTOP,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: "networkidle" });
    await controlled(page);
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send("Page.getAppManifest");
    check(manifest.url.endsWith("/Bird-Mahjong/manifest.webmanifest") && manifest.errors.length === 0,
      "Chromium parses the manifest without errors", JSON.stringify(manifest.errors));
    const raw = JSON.parse(manifest.data);
    const startUrl = new URL(raw.start_url, manifest.url).pathname;
    const scope = new URL(manifest.parsed?.scope ?? raw.scope, manifest.url).pathname;
    check(startUrl === "/Bird-Mahjong/" && scope === "/Bird-Mahjong/", "start_url and scope resolve to /Bird-Mahjong/", `${startUrl} ${scope}`);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    check(installabilityErrors.length === 0, "Chromium reports no installability errors (the app can be installed)", JSON.stringify(installabilityErrors));

    // The Install button appears when the browser offers installation
    // (beforeinstallprompt) and hands off to the browser's own prompt.
    await page.click("#screen-start");
    const offeredByChromium = await page.isVisible("#btn-install");
    check(offeredByChromium, "Chromium itself offered installation, so Install app is showing on the menu");
    // Click through with a stand-in event so the test never opens a real
    // install dialog; it replaces the deferred prompt the button will use.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = () => { window.__installPrompted = true; };
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });
    await page.click("#btn-install");
    const prompted = await page.evaluate(() => window.__installPrompted === true);
    check(prompted && (await page.isHidden("#btn-install")), "Install app opens the browser's install prompt, then hides");
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function offlinePlay(browser, url) {
  console.log("offline play");
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: "reduce" });
  const page = await context.newPage();
  const failed = [];
  const errors = [];
  page.on("requestfailed", (r) => !isBenignFailure(r) && failed.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await controlled(page);
  await page.goto(`${url}tiles.html`, { waitUntil: "networkidle" }); // visited once online
  await page.goto(url, { waitUntil: "networkidle" });

  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  check(await page.isVisible("#screen-start"), "the app reloads with the network off");
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "load" });
  check(await page.isVisible("#screen-start"), "a deep link with a query (?seed=) opens offline");
  const viaIndex = await context.newPage();
  await viaIndex.goto(`${url}index.html`, { waitUntil: "load" });
  check(await viaIndex.isVisible("#screen-start"), "index.html opens offline");
  await viaIndex.close();

  await startDifficulty(page, "hard");
  // Zoom right in so the full-resolution tiles (srcset 200w) are used too.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById("btn-zoom-in")?.click(); });
  await page.waitForTimeout(300);
  const images = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#board img, #sky-tiles img")];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return { total: imgs.length, broken: imgs.filter((i) => !i.naturalWidth).length, full: imgs.filter((i) => i.currentSrc.includes("tiles-md")).length };
  });
  check(images.broken === 0 && images.total > 60, `all ${images.total} bird images load offline`);
  const fullRes = await page.evaluate(async () => {
    const r = await fetch("assets/tiles-md/08-common-raven.webp");
    return r.ok && (await r.blob()).size > 5000;
  });
  check(fullRes, "full-resolution tiles are available offline");

  // Autosave + Continue across an offline reload, then finish the game.
  const solution = solutionFor("hard");
  await playPairs(page, solution.slice(0, 5));
  await page.reload({ waitUntil: "load" });
  await page.click("#screen-start");
  await page.click("#btn-continue");
  await page.waitForSelector("#board .tile:not([hidden])");
  check((await page.textContent("#stat-pairs")) === "25", "Continue restores the board after an offline reload");
  await playPairs(page, solution.slice(5));
  await page.waitForSelector("#screen-results:not([hidden])");
  check(true, "a whole game plays to the results screen offline");

  const gallery = await context.newPage();
  await gallery.goto(`${url}tiles.html`, { waitUntil: "load" });
  check((await gallery.title()).includes("Tile Reference"), "the tile gallery (visited once online) also opens offline");
  const stray = failed.filter((u) => !u.includes("assets/tiles/")); // gallery PNGs aren't all cached
  check(stray.length === 0 && errors.length === 0, "no failed requests or errors in the game offline", [...stray, ...errors].slice(0, 3).join("; "));
  await context.close();
}

async function updatePath(browser, url, served) {
  console.log("updating to a new version");
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: "reduce" });
  const page = await context.newPage();
  let navigations = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations++; });
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  await controlled(page);
  const v1Caches = Object.keys(await cacheReport(page)).filter((k) => /^bird-mahjong-[0-9a-f]/.test(k));
  await startDifficulty(page, "medium");
  await playPairs(page, solutionFor("medium").slice(0, 3));

  // Publish v2: changed CSS (a visible marker) and a new worker version.
  const css = fs.readFileSync(`${ROOT}/css/app.css`, "utf8") + "\n:root { --build-marker: v2; }\n";
  const sw = fs.readFileSync(`${ROOT}/sw.js`, "utf8").replace(/const VERSION = "[^"]*";/, 'const VERSION = "fffffffff002";');
  served.overrides.set("css/app.css", css);
  served.overrides.set("sw.js", sw);
  const marker = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--build-marker").trim());

  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector("#update-banner:not([hidden])", { timeout: 15000 });
  check(true, "the new version downloads in the background and a Refresh banner appears");
  const v1css = await page.evaluate(() => fetch("css/app.css").then((r) => r.text()));
  check((await marker()) === "" && !v1css.includes("--build-marker"), "until then, the page keeps using v1 files only");

  // A plain reload must not mix versions or strand the player.
  await page.reload({ waitUntil: "load" });
  check((await marker()) === "", "a plain reload still serves v1 consistently");
  await page.waitForSelector("#update-banner:not([hidden])", { timeout: 15000 });
  check(true, "…and the Refresh banner is offered again");

  // "Later" hides it; then take the update.
  await page.click("#btn-update-later");
  check(await page.isHidden("#update-banner"), "Later hides the banner");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#update-banner:not([hidden])", { timeout: 15000 });
  const before = navigations;
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#btn-update-refresh")]);
  await controlled(page);
  await page.waitForTimeout(500);
  check((await marker()) === "v2", "Refresh switches the page to v2");
  check(navigations - before === 1, "the switch reloads exactly once");
  const after = Object.keys(await cacheReport(page)).filter((k) => /^bird-mahjong-[0-9a-f]/.test(k));
  check(after.length === 1 && after[0] === "bird-mahjong-fffffffff002" && !after.includes(v1Caches[0]), "the old version's cache is deleted", JSON.stringify(after));
  await page.click("#screen-start");
  check(/Medium · 17 pairs left/.test(await page.textContent("#continue-detail")), "the board in progress survived the update");

  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  check((await marker()) === "v2" && (await page.isVisible("#screen-start")), "v2 works offline");
  await context.close();
  served.overrides.clear();
}

async function main() {
  const served = await serve();
  const browser = await launchBrowser();
  await firstLoad(browser, served.url);
  await installability(served.url);
  await offlinePlay(browser, served.url);
  await updatePath(browser, served.url, served);
  const outside = served.log.filter((r) => !r.path.startsWith("/Bird-Mahjong/"));
  const missing = served.log.filter((r) => r.status === 404 && !r.path.endsWith("favicon.ico"));
  check(outside.length === 0 && missing.length === 0, "every request stayed under /Bird-Mahjong/ and found its file",
    JSON.stringify([...outside, ...missing].slice(0, 5)));
  await browser.close();
  served.server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll offline checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
