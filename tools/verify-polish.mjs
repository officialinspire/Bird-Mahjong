#!/usr/bin/env node
// Polish and accessibility checks in real Chromium.
//
//   * keyboard only: menu → difficulty → board, the board is one Tab stop,
//     arrow keys reach every tile needed to win, Enter selects, focus stays
//     visible and on top, H hints and U undoes
//   * descriptive labels: every tile says its bird, its state and a visual cue
//   * sound: no AudioContext before the first gesture; chirps on matches with
//     Sound effects on; menu/game music after the first tap with Music on;
//     switching either off cuts what's sounding at once; an old "Sound off"
//     setting carries over; silent (no AudioContext at all) with both off
//   * animation: score floats and the board-clear celebration with animations
//     on; none of it with Minimal or the OS reduce-motion preference
//   * a full touch game with sound off and animations Minimal
//   * rendered text contrast on every screen (WCAG AA)
//
// Usage: node tools/verify-polish.mjs [screenshot-dir]

import fs from "node:fs";
import path from "node:path";
import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, afterMatch, playPairs, solutionFor, startDifficulty, tile } from "./lib/play.mjs";

const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";
const SHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 720 } };

/** Counts AudioContexts and oscillator starts, and whether audio began before a gesture. */
function instrumentAudio() {
  const audio = { contexts: 0, tones: 0, cut: 0, beforeGesture: false, gestured: false };
  window.__audio = audio;
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => { audio.gestured = true; }, true);
  const Real = window.AudioContext;
  if (Real) {
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        audio.contexts++;
        if (!audio.gestured) audio.beforeGesture = true;
      }
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { audio.tones++; return start.apply(this, args); };
    // stop(0) = cut off immediately (what muting does to sounds still playing).
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (...args) { if (args[0] === 0) audio.cut++; return stop.apply(this, args); };
  }
}

/** Counts feedback elements as they're added (they're removed again quickly). */
function watchFeedback() {
  window.__feedback = { floats: 0, celebrations: 0 };
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n.classList?.contains("score-float")) window.__feedback.floats++;
      if (n.classList?.contains("celebration")) window.__feedback.celebrations++;
    }
  }).observe(document, { childList: true, subtree: true });
}

async function open(browser, options, { settings, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ ...options, reducedMotion });
  await context.addInitScript(instrumentAudio);
  await context.addInitScript(watchFeedback);
  if (settings) {
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [SETTINGS_KEY, JSON.stringify(settings)]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}
let url;

const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const style = getComputedStyle(el);
  return {
    index: el.classList.contains("tile") ? Number(el.dataset.index) : null,
    free: el.classList.contains("is-free"),
    ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
    onTop: !!hit && el.contains(hit),
    id: el.id,
  };
});

/**
 * Arrow-key to a target tile. The route is found by breadth-first search over
 * the app's own arrow-key moves (probed with synthetic key events, focus
 * restored afterwards), then pressed for real. Also reports whether every
 * free tile is reachable from the current one. Returns the number of key
 * presses, or -1 if the target can't be reached.
 */
async function arrowTo(page, target) {
  const plan = await page.evaluate((t) => {
    const start = document.activeElement;
    const idx = (el) => Number(el.dataset.index);
    const tileAt = (i) => document.querySelector(`#board .tile[data-index="${i}"]`);
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    const moves = (i) => keys.map((key) => {
      tileAt(i).focus();
      tileAt(i).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      return [key, idx(document.activeElement)];
    });
    const from = idx(start);
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const [key, next] of moves(cur)) if (!prev.has(next)) { prev.set(next, [cur, key]); queue.push(next); }
    }
    start.focus();
    const free = [...document.querySelectorAll("#board .tile.is-free")].filter((e) => !e.hidden).map(idx);
    const allReachable = free.every((i) => prev.has(i));
    if (!prev.has(t)) return { keys: null, allReachable };
    const path = [];
    for (let at = t; prev.get(at); at = prev.get(at)[0]) path.unshift(prev.get(at)[1]);
    return { keys: path, allReachable };
  }, target);
  if (!plan.allReachable) reachability.ok = false;
  if (!plan.keys) return -1;
  for (const key of plan.keys) await page.keyboard.press(key);
  const at = await page.evaluate(() => Number(document.activeElement.dataset.index));
  return at === target ? plan.keys.length : -1;
}
const reachability = { ok: true };

async function keyboardOnly(browser) {
  console.log("keyboard only (desktop, Easy)");
  const { context, page, errors } = await open(browser, DESKTOP);
  await page.keyboard.press("Enter"); // leave the start screen
  const tabTo = async (predicate, label, limit = 20) => {
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(predicate)) return true;
    }
    check(false, `reach ${label} with Tab`);
    return false;
  };
  await tabTo(() => document.activeElement.dataset.go === "difficulty", "New Game");
  await page.keyboard.press("Enter");
  await tabTo(() => document.activeElement.dataset.difficulty === "easy", "Easy");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#board .tile:not([hidden])");
  await tabTo(() => document.activeElement.classList.contains("tile"), "the board");
  const tabStops = await page.$$eval("#board .tile", (els) => els.filter((e) => e.tabIndex === 0).length);
  check(tabStops === 1, "the board is a single Tab stop (roving focus)", `${tabStops} tab stops`);
  let f = await focused(page);
  check(f.free && f.ring && f.onTop, "the focused tile is free, ringed and drawn on top");

  // H shows a hint without a mouse.
  await page.keyboard.press("h");
  check((await page.$$eval("#board .tile.is-hint", (e) => e.length)) === 2, "H shows a hint");

  // Win the whole board with arrows + Enter.
  let steps = 0;
  let reachedAll = true;
  let ringsOk = true;
  const solution = solutionFor("easy");
  for (const [k, [a, b]] of solution.entries()) {
    for (const t of [a, b]) {
      const n = await arrowTo(page, t);
      if (n < 0) { reachedAll = false; break; }
      steps += n;
      f = await focused(page);
      if (!(f.ring && f.onTop && f.free)) ringsOk = false;
      await page.keyboard.press("Enter");
    }
    if (!reachedAll) break;
    if (k < solution.length - 1) {
      await afterMatch(page, a, b);
      const after = await focused(page);
      if (after.index === null) { reachedAll = false; check(false, "focus stays on the board after a match", JSON.stringify(after)); break; }
    }
    if (k === 1) {
      // U undoes; then retake the pair.
      await page.keyboard.press("u");
      const pairs = await page.textContent("#stat-pairs");
      check(pairs === "11", "U undoes the last pair");
      for (const t of [a, b]) { await arrowTo(page, t); await page.keyboard.press("Enter"); }
      await afterMatch(page, a, b);
    }
  }
  check(reachedAll, `arrow keys reached every tile needed to win (${steps} key presses)`);
  check(reachability.ok, "at every step, every free tile was reachable with arrow keys");
  check(ringsOk, "focus was visible and on top at every step");
  await page.waitForSelector("#screen-results:not([hidden])", { timeout: 5000 }).catch(() => {});
  check(await page.isVisible("#screen-results"), "the board was cleared by keyboard alone");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function keyboardZoomed(browser) {
  console.log("keyboard on a zoomed board (360×640, Hard)");
  const { context, page, errors } = await open(browser, { viewport: { width: 360, height: 640 } });
  await startDifficulty(page, "hard");
  const zoomed = await page.isVisible("#zoom-controls");
  for (let i = 0; i < 25 && !(await page.evaluate(() => document.activeElement.classList.contains("tile"))); i++) await page.keyboard.press("Tab");
  let allVisible = true;
  for (const key of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowUp"]) {
    await page.keyboard.press(key);
    const inView = await page.evaluate(() => {
      const t = document.activeElement.getBoundingClientRect();
      const v = document.getElementById("board-viewport").getBoundingClientRect();
      return t.left >= v.left - 1 && t.right <= v.right + 1 && t.top >= v.top - 1 && t.bottom <= v.bottom + 1;
    });
    if (!inView) allVisible = false;
  }
  check(zoomed && allVisible, "moving focus scrolls the zoomed board so the focused tile is always in view");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function labels(browser) {
  console.log("descriptive tile labels");
  const { context, page } = await open(browser, PHONE);
  await startDifficulty(page, "hard");
  const tiles = await page.$$eval("#board .tile", (els) => els.map((e) => ({
    label: e.getAttribute("aria-label"), description: e.getAttribute("aria-description"), bird: e.dataset.bird,
  })));
  const bad = tiles.filter((t) => !/^[A-Z][\w\- ]+, (free|blocked|covered|selected)/.test(t.label) || !t.description || t.description.length < 10);
  check(bad.length === 0, `all ${tiles.length} tiles have a name, a state and a visual cue`, JSON.stringify(bad.slice(0, 2)));
  const { BIRD_NAMES } = await import("../js/ui/bird-names.js");
  check(BIRD_NAMES["american-crow"].cue !== BIRD_NAMES["common-raven"].cue && /slim bill/.test(BIRD_NAMES["american-crow"].cue) && /hooked bill/.test(BIRD_NAMES["common-raven"].cue),
    "the crow and raven are described differently");
  await context.close();
}

async function audio(browser) {
  console.log("sound: effects (music off)");
  {
    const { context, page, errors } = await open(browser, DESKTOP, { settings: { music: false } });
    await page.waitForTimeout(300);
    const idle = await page.evaluate(() => window.__audio);
    check(idle.contexts === 0, "no audio before any interaction");
    await startDifficulty(page, "easy");
    const [[a, b], [c, d]] = solutionFor("easy");
    const beforeMatch = await page.evaluate(() => window.__audio.tones);
    await page.click(tile(a));
    await page.click(tile(b));
    await afterMatch(page, a, b);
    const afterMatchAudio = await page.evaluate(() => window.__audio);
    check(afterMatchAudio.contexts === 1 && !afterMatchAudio.beforeGesture, "audio starts only after the first gesture, once");
    check(afterMatchAudio.tones > beforeMatch, `a match plays a chirp (${afterMatchAudio.tones - beforeMatch} tones)`);

    // Switch Sound effects off in Settings, come back, match again: silence.
    await page.click("#btn-pause");
    await page.click("#btn-pause-menu");
    await page.click("#screen-menu [data-go=settings]");
    await page.click("#screen-settings input[name=sfx]");
    await page.click("#screen-settings [data-go=menu]");
    await page.click("#btn-continue");
    const quiet = await page.evaluate(() => window.__audio.tones);
    await page.click(tile(c));
    await page.click(tile(d));
    await afterMatch(page, c, d);
    check((await page.evaluate(() => window.__audio.tones)) === quiet, "with Sound effects off, matches are silent");
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }

  console.log("sound: music (effects off)");
  {
    const { context, page, errors } = await open(browser, DESKTOP, { settings: { sfx: false } });
    await page.waitForTimeout(1500);
    check((await page.evaluate(() => window.__audio.contexts)) === 0, "no music before any interaction, even after waiting");
    await page.click("#screen-start");
    const t0 = await page.evaluate(() => window.__audio.tones);
    await page.waitForTimeout(2500);
    const menuAudio = await page.evaluate(() => window.__audio);
    check(menuAudio.contexts === 1 && !menuAudio.beforeGesture && menuAudio.tones > t0,
      `after the first tap, the menu music plays (${menuAudio.tones - t0} notes in 2.5s)`);

    // Music off in Settings: sounding notes are cut at once, and nothing new plays.
    await page.click("#screen-menu [data-go=settings]");
    const cutBefore = await page.evaluate(() => window.__audio.cut);
    await page.click("#screen-settings input[name=music]");
    const afterToggle = await page.evaluate(() => window.__audio);
    check(afterToggle.cut > cutBefore, `switching Music off cuts the notes still sounding (${afterToggle.cut - cutBefore} stopped)`);
    await page.waitForTimeout(2000);
    check((await page.evaluate(() => window.__audio.tones)) === afterToggle.tones, "…and no new notes play");

    // Back on: the music returns; the effects stay off during play.
    await page.click("#screen-settings input[name=music]");
    await page.click("#screen-settings [data-go=menu]");
    await page.click("#screen-menu [data-go=difficulty]");
    await page.click("[data-difficulty=easy]");
    const g0 = await page.evaluate(() => window.__audio.tones);
    await page.waitForTimeout(2500);
    check((await page.evaluate(() => window.__audio.tones)) > g0, "Music switched back on plays again, now the in-game mood");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("inspireBirdMahjong:v1:settings")));
    check(saved.music === true && saved.sfx === false && typeof saved.musicVolume === "number" && !("sound" in saved),
      "the two switches are saved separately", JSON.stringify(saved));
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }

  console.log("sound: an old saved 'Sound off' carries over");
  {
    const { context, page } = await open(browser, DESKTOP, { settings: { sound: false, soundVolume: 0.3 } });
    await page.click("#screen-start");
    await page.click("#screen-menu [data-go=settings]");
    const form = await page.evaluate(() => {
      const f = document.getElementById("settings-form").elements;
      return { sfx: f.sfx.checked, sfxVolume: f.sfxVolume.value, sfxDisabled: f.sfxVolume.disabled, music: f.music.checked };
    });
    check(!form.sfx && form.sfxVolume === "30" && form.sfxDisabled && form.music, "Sound effects start off at 30%, Music on", JSON.stringify(form));
    await context.close();
  }
}

async function animations(browser) {
  console.log("animation settings");
  const cases = [
    ["Full", { settings: { motion: "full" } }, true],
    ["Minimal", { settings: { motion: "reduce" } }, false],
    ["Match device + OS reduce-motion", { reducedMotion: "reduce" }, false],
    ["Full overrides OS reduce-motion", { reducedMotion: "reduce", settings: { motion: "full" } }, true],
  ];
  for (const [name, opts, animated] of cases) {
    const { context, page, errors } = await open(browser, DESKTOP, opts);
    await startDifficulty(page, "easy");
    await playPairs(page, solutionFor("easy"));
    const tCleared = Date.now();
    if (SHOT_DIR && name === "Full") {
      await page.waitForTimeout(350); // mid-celebration
      await page.screenshot({ path: path.join(SHOT_DIR, "polish-celebration.png") });
    }
    await page.waitForSelector("#screen-results:not([hidden])");
    const wait = Date.now() - tCleared;
    const fb = await page.evaluate(() => window.__feedback);
    if (animated) {
      check(fb.floats === 12 && fb.celebrations === 1 && wait >= 1000, `${name}: a score float per match and one board-clear celebration (${wait}ms)`, JSON.stringify(fb));
    } else {
      check(fb.floats === 0 && fb.celebrations === 0 && wait < 900, `${name}: no floats, no celebration, results right away (${wait}ms)`, JSON.stringify(fb));
    }
    check(errors.length === 0, `${name}: no page errors`, errors.join("; "));
    await context.close();
  }
}

async function quietGame(browser) {
  console.log("music and effects off + animations Minimal: full touch game");
  const { context, page, errors } = await open(browser, PHONE, { settings: { sfx: false, music: false, motion: "reduce" } });
  await startDifficulty(page, "medium");
  await playPairs(page, solutionFor("medium"), { input: "touch" });
  await page.waitForSelector("#screen-results:not([hidden])");
  const audio = await page.evaluate(() => window.__audio);
  const fb = await page.evaluate(() => window.__feedback);
  check(audio.contexts === 0 && audio.tones === 0, "no audio was ever created");
  check(fb.floats === 0 && fb.celebrations === 0, "no animation elements were added");
  check(/2,850/.test(await page.textContent("#result-score")) && errors.length === 0, "the game is fully playable and scores the same", errors.join("; "));
  await context.close();
}

/** WCAG contrast of all visible text on the current screen, compositing translucent backgrounds. */
const screenContrast = (page) =>
  page.evaluate(() => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lum = ({ r, g, b }) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const ratio = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
    // The page background is a gradient; test against its lightest and darkest stops.
    const pageBgs = [{ r: 244, g: 245, b: 234, a: 1 }, { r: 242, g: 232, b: 207, a: 1 }, { r: 220, g: 236, b: 246, a: 1 }];
    const results = [];
    const screen = document.querySelector(".screen:not([hidden])");
    const dialog = document.querySelector("dialog[open]");
    const root = dialog || screen;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (el.closest("[aria-hidden=true], .tile, [hidden], :disabled")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || !el.getClientRects().length) continue;
      const chain = [];
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const bg = parse(getComputedStyle(a).backgroundColor);
        if (bg.a > 0) chain.push(bg);
        if (a.tagName === "DIALOG") { chain.push({ r: 255, g: 253, b: 247, a: 1 }); break; }
      }
      const fg = parse(style.color);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const min = large ? 3 : 4.5;
      let worst = Infinity;
      for (const base of pageBgs) {
        let bg = base;
        for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg);
        worst = Math.min(worst, ratio(over(fg, bg), bg));
      }
      if (worst < min) results.push({ text: node.textContent.trim().slice(0, 40), ratio: worst.toFixed(2), min });
    }
    return results;
  });

async function contrast(browser) {
  console.log("rendered text contrast");
  const { context, page } = await open(browser, PHONE, { settings: { motion: "reduce" } });
  const screens = {
    start: async () => {},
    menu: async () => page.click("#screen-start"),
    difficulty: async () => page.click("#screen-menu [data-go=difficulty]"),
    game: async () => { await page.click("[data-difficulty=easy]"); await page.click("#btn-hint"); },
    pause: async () => page.click("#btn-pause"),
    "new game dialog": async () => { await page.click("#pause-dialog button[value=resume]"); const [a, b] = solutionFor("easy")[0]; await page.click(tile(a)); await page.click(tile(b)); await afterMatch(page, a, b); await page.click("#btn-game-new"); },
    help: async () => { await page.click("#btn-new-game-cancel"); await page.click("#btn-pause"); await page.click("#btn-pause-menu"); await page.click("#screen-menu [data-go=help]"); },
    settings: async () => { await page.click("#screen-help [data-go=menu]"); await page.click("#screen-menu [data-go=settings]"); },
    results: async () => { await page.click("#screen-settings [data-go=menu]"); await page.click("#btn-continue"); await playPairs(page, solutionFor("easy").slice(1)); await page.waitForSelector("#screen-results:not([hidden])"); },
  };
  for (const [name, go] of Object.entries(screens)) {
    await go();
    const low = await screenContrast(page);
    check(low.length === 0, `${name}: all text meets WCAG AA`, JSON.stringify(low.slice(0, 3)));
  }
  await context.close();
}

async function main() {
  const served = await serve();
  url = served.url;
  const browser = await launchBrowser();
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
  await keyboardOnly(browser);
  await keyboardZoomed(browser);
  await labels(browser);
  await audio(browser);
  await animations(browser);
  await quietGame(browser);
  await contrast(browser);
  await browser.close();
  served.server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll polish checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
