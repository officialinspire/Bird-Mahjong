#!/usr/bin/env node
// Bird calls on cleared pairs, in real Chromium with the real clips.
//
//   node tools/verify-calls.mjs
//
// Plays a whole Hard board (seeded, so every pair's bird is known) and checks,
// pair by pair, that birds with an approved clip play exactly their own call
// and no chirp, and every other bird plays the synthesized chirp and no call.
// Also: nothing is fetched before a gesture, rapid matches never stack calls,
// the music dips under each call, Sound effects off plays nothing (and cuts a
// call in progress), and missing or undecodable clips fall back to the chirp
// without errors.

import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, afterMatch, startDifficulty, tile } from "./lib/play.mjs";
import { createGame } from "../js/game/game.js";
import { AUDIO_FILES, DIFFICULTIES } from "../js/config.js";

const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";
const CALLS = AUDIO_FILES.calls;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

/**
 * Label decoded buffers with the URL they came from, and log every buffer
 * source started (with its URL), every oscillator (chirp notes), how many
 * buffer sources sound at once, and ramps of the music "duck" to 0.5.
 */
function instrument() {
  const log = { fetched: [], calls: [], tones: 0, live: 0, maxLive: 0, ducks: 0, cut: 0 };
  window.__calls = log;
  const origin = new WeakMap();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = decodeURIComponent(String(input?.url ?? input));
    log.fetched.push(url);
    const res = await realFetch(input, init);
    const ab = res.arrayBuffer.bind(res);
    res.arrayBuffer = async () => { const data = await ab(); origin.set(data, url); return data; };
    return res;
  };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (data, ...rest) {
    const url = origin.get(data);
    return decode.call(this, data, ...rest).then((buffer) => { buffer.__url = url; return buffer; });
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    log.calls.push(this.buffer?.__url?.split("/").pop() ?? "?");
    log.live++;
    log.maxLive = Math.max(log.maxLive, log.live);
    this.addEventListener("ended", () => { log.live--; });
    return start.apply(this, a);
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...a) { if (a[0] === 0) log.cut++; return stop.apply(this, a); };
  const osc = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { log.tones++; return osc.apply(this, a); };
  const ramp = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (v, t) { if (v === 0.5) log.ducks++; return ramp.call(this, v, t); };
}

const state = (page) => page.evaluate(() => ({ ...window.__calls, calls: [...window.__calls.calls] }));

async function open(browser, url, { settings = {}, block = false, routes = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: block ? "block" : "allow" });
  await context.addInitScript(instrument);
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [SETTINGS_KEY, JSON.stringify({ music: true, sfx: true, ...settings })]);
  for (const [path, handler] of Object.entries(routes)) await context.route(`**/${path}`, handler);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

/** The Hard board for SEED, as the app builds it: its solution and each tile's bird. */
function hardBoard() {
  const d = DIFFICULTIES.find((x) => x.id === "hard");
  return createGame(d.layout, { seed: SEED, birdPool: d.birdPool ?? undefined });
}

// Tapping the first tile of a pair plays the one-note "select" tick; the
// match sound comes on the second. So a pair is 1 tone + its call, or 1 + 2
// (the two-note chirp).
const SELECT_TONES = 1;
const CHIRP_TONES = 2;
const WIN_TONES = 6; // the board-clear fanfare after the last pair (4 notes + a chirp)

async function match(page, a, b) {
  await page.locator(tile(a)).click();
  await page.locator(tile(b)).click();
  await afterMatch(page, a, b);
}

/** Wait until every clip has been decoded (fetched, and a moment to decode). */
async function waitForClips(page) {
  await page.waitForFunction((n) => window.__calls.fetched.filter((u) => u.includes("assets/audio/")).length >= n, Object.keys(CALLS).length);
  await page.waitForTimeout(500);
}

async function wholeBoard(browser, url) {
  console.log("calls: a whole Hard board, pair by pair");
  const game = hardBoard();
  const birdsHere = new Set(game.birds);
  const withClip = Object.keys(CALLS).filter((b) => birdsHere.has(b));
  check(withClip.length >= 3, `the board has birds with clips (${withClip.join(", ")}) and without`);

  const { context, page, errors } = await open(browser, url);
  await page.waitForTimeout(800);
  let s = await state(page);
  check(!s.fetched.some((u) => u.includes("assets/audio/")), "no bird call is fetched before the first gesture");
  await startDifficulty(page, "hard");
  await waitForClips(page);
  s = await state(page);
  check(Object.values(CALLS).every((u) => s.fetched.some((f) => f.endsWith(u))), `after the first tap, all ${Object.keys(CALLS).length} clips are fetched`);

  const wrong = [];
  let calls = 0;
  for (const [n, [a, b]] of game.solution.entries()) {
    const before = await state(page);
    await match(page, a, b);
    if (n === game.solution.length - 1) await page.waitForTimeout(1000); // let the fanfare play
    const after = await state(page);
    const started = after.calls.slice(before.calls.length);
    const tones = after.tones - before.tones - SELECT_TONES - (n === game.solution.length - 1 ? WIN_TONES : 0);
    const bird = game.birds[a];
    if (CALLS[bird]) {
      calls++;
      if (started.join() !== CALLS[bird].split("/").pop() || tones !== 0) wrong.push(`${bird}: ${started.join("+") || "no call"}, ${tones} tones`);
    } else if (started.length !== 0 || tones !== CHIRP_TONES) {
      wrong.push(`${bird}: ${started.join("+") || "no call"}, ${tones} tones`);
    }
  }
  check(wrong.length === 0, `each of ${game.solution.length} pairs made exactly one sound: its own call (${calls}) or the chirp (${game.solution.length - calls})`, wrong.slice(0, 4).join("; "));
  s = await state(page);
  check(s.maxLive <= 2, `rapid matches never stack calls (at most ${s.maxLive} sounding, only during a quick handoff)`);
  check(s.ducks === calls, `the music dips under every call (${s.ducks} dips for ${calls} calls)`);
  await page.waitForSelector("#screen-results:not([hidden])");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function soundOff(browser, url) {
  console.log("calls: Sound effects off");
  const game = hardBoard();
  const { context, page, errors } = await open(browser, url, { settings: { sfx: false } });
  await startDifficulty(page, "hard");
  await page.waitForTimeout(1000);
  for (const [a, b] of game.solution.slice(0, 8)) await match(page, a, b);
  const s = await state(page);
  check(s.calls.length === 0 && s.tones === 0, "with Sound effects off, matches play no call and no chirp");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function muteMidCall(browser, url) {
  console.log("calls: switching Sound effects off during a call");
  const game = hardBoard();
  const first = game.solution.findIndex(([a]) => CALLS[game.birds[a]]);
  const { context, page, errors } = await open(browser, url);
  await startDifficulty(page, "hard");
  await waitForClips(page);
  for (const [a, b] of game.solution.slice(0, first)) await match(page, a, b);
  const [a, b] = game.solution[first];
  await page.locator(tile(a)).click();
  await page.locator(tile(b)).click();
  await page.waitForTimeout(150);
  let s = await state(page);
  check(s.live === 1, `${game.birds[a]}'s call is sounding`);
  // Pause → Settings isn't on the game screen; flip the saved setting the way the form does.
  await page.evaluate(() => {
    const input = document.querySelector("#screen-settings input[name=sfx]");
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(100);
  s = await state(page);
  check(s.cut >= 1 && s.live === 0, "switching Sound effects off cuts the call at once");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function brokenClips(browser, url) {
  console.log("calls: missing and undecodable clips fall back to the chirp");
  const game = hardBoard();
  const routes = {
    "assets/audio/american-crow.mp3": (r) => r.fulfill({ status: 404, body: "" }),
    "assets/audio/common-raven.mp3": (r) => r.fulfill({ status: 200, contentType: "audio/mpeg", body: "not audio at all" }),
    "assets/audio/bald-eagle.mp3": (r) => r.abort(),
  };
  const { context, page, errors } = await open(browser, url, { block: true, routes });
  await startDifficulty(page, "hard");
  await page.waitForTimeout(1500);
  const broken = new Set(["american-crow", "common-raven", "bald-eagle"]);
  const wrong = [];
  let tested = 0;
  for (const [a, b] of game.solution) {
    const before = await state(page);
    await match(page, a, b);
    const after = await state(page);
    if (!broken.has(game.birds[a])) continue;
    tested++;
    const started = after.calls.length - before.calls.length;
    if (started !== 0 || after.tones - before.tones - SELECT_TONES !== CHIRP_TONES) wrong.push(game.birds[a]);
  }
  check(tested > 0 && wrong.length === 0, `broken clips chirp instead, once per pair (${tested} pairs)`, wrong.join(", "));
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  await wholeBoard(browser, url);
  await soundOff(browser, url);
  await muteMidCall(browser, url);
  await brokenClips(browser, url);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll bird-call checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
