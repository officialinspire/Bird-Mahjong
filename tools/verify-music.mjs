#!/usr/bin/env node
// Recorded music in real Chromium with the real MP3s.
//
//   * no music element exists or plays before the first gesture
//   * start/menu → Gentle Canopy; gameplay → Forest Breeze; pause → Gentle
//     Canopy; resuming play → Forest Breeze again
//   * transitions crossfade: both tracks overlap for about a second, never
//     more than two voices play, and the old one then stops
//   * returning to a track resumes it where it was (no restart)
//   * rapid screen changes don't stack tracks or restart them
//   * hidden tab pauses the music; returning resumes it in place
//   * Music off stops it at once; the volume slider applies live
//   * play() refused before a gesture → plays after the next one;
//     play() failing outright → synthesized ambience instead
//   * the loop point is seamless (the twin voice overlaps; never silent)
//   * music plays offline, served from the service worker cache
//
// Usage: node tools/verify-music.mjs

import { launchBrowser, serve } from "./lib/serve.mjs";
import { SEED, startDifficulty } from "./lib/play.mjs";

const CANOPY = "Bird Mahjong - Gentle Canopy.mp3";
const BREEZE = "Bird Mahjong - Forest Breeze.mp3";
const SETTINGS_KEY = "inspireBirdMahjong:v1:settings";
let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

/** Track every Audio element the page makes, and count play() calls per element. */
function instrument(options) {
  window.__els = [];
  const Real = window.Audio;
  window.Audio = function (...args) { const el = new Real(...args); el.__plays = 0; window.__els.push(el); return el; };
  window.Audio.prototype = Real.prototype;
  const play = HTMLMediaElement.prototype.play;
  let refusals = options?.refuse ?? 0;
  HTMLMediaElement.prototype.play = function (...args) {
    this.__plays = (this.__plays || 0) + 1;
    if (refusals > 0) {
      refusals--;
      const e = new DOMException(options.reason || "refused", options.reason || "NotAllowedError");
      return Promise.reject(e);
    }
    return play.apply(this, args);
  };
  window.__tones = 0;
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { window.__tones++; return start.apply(this, a); };
}

const snapshot = (page) =>
  page.evaluate(() => (window.__els || []).map((e) => ({
    track: decodeURIComponent(e.src.split("/").pop()),
    playing: !e.paused,
    t: e.currentTime,
    plays: e.__plays,
    volume: e.volume,
  })));

const playingTracks = (snap) => snap.filter((s) => s.playing).map((s) => s.track);

/** Sample every `every` ms for `ms`, returning snapshots. */
async function sample(page, ms, every = 25) {
  const out = [];
  for (let t = 0; t < ms; t += every) {
    out.push(await snapshot(page));
    await page.waitForTimeout(every);
  }
  return out;
}

async function open(browser, url, { settings = { sfx: false }, refuse = 0, reason } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(instrument, { refuse, reason });
  await context.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [SETTINGS_KEY, JSON.stringify(settings)]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}?seed=${SEED}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function screenFlow(browser, url) {
  console.log("screen flow and crossfades");
  const { context, page, errors } = await open(browser, url);
  await page.waitForTimeout(800);
  check((await snapshot(page)).length === 0, "no music element before the first tap");

  await page.click("#screen-start");
  await page.waitForTimeout(1500);
  let snap = await snapshot(page);
  check(playingTracks(snap).join() === CANOPY && snap.find((s) => s.track === CANOPY).t > 0.5, "the menu plays Gentle Canopy", JSON.stringify(playingTracks(snap)));

  // Menu → game: crossfade.
  await page.click("#screen-menu [data-go=difficulty]");
  await page.waitForTimeout(300);
  check(playingTracks(await snapshot(page)).join() === CANOPY, "the difficulty picker keeps Gentle Canopy (no restart)");
  const canopyBefore = (await snapshot(page)).find((s) => s.track === CANOPY);
  await page.click("[data-difficulty=easy]");
  const frames = await sample(page, 2000);
  const both = frames.filter((f) => playingTracks(f).length === 2).length * 25;
  const maxPlaying = Math.max(...frames.map((f) => playingTracks(f).length));
  const last = frames.at(-1);
  check(both >= 750 && both <= 1400, `menu → game crossfades: both tracks overlap for ${both}ms`);
  check(maxPlaying <= 2, `never more than two voices (max ${maxPlaying})`);
  check(playingTracks(last).join() === BREEZE, "then only Forest Breeze plays", JSON.stringify(playingTracks(last)));
  const breezeT = last.find((s) => s.track === BREEZE).t;

  // Pause → Gentle Canopy (resumed, not restarted); Resume → Forest Breeze in place.
  await page.click("#btn-pause");
  await page.waitForTimeout(1500);
  snap = await snapshot(page);
  const canopyNow = snap.find((s) => s.track === CANOPY && s.playing);
  check(playingTracks(snap).join() === CANOPY, "pausing switches to Gentle Canopy");
  check(canopyNow && canopyNow.t > canopyBefore.t && canopyNow.plays === 2, `…continuing where it was (${canopyBefore.t.toFixed(1)}s → ${canopyNow?.t.toFixed(1)}s), not restarted`);
  await page.click("#pause-dialog button[value=resume]");
  await page.waitForTimeout(1500);
  snap = await snapshot(page);
  const breezeNow = snap.find((s) => s.track === BREEZE && s.playing);
  check(playingTracks(snap).join() === BREEZE && breezeNow.t > breezeT, `resuming play returns to Forest Breeze in place (${breezeT.toFixed(1)}s → ${breezeNow?.t.toFixed(1)}s)`);

  // Rapid changes: pause/resume five times in quick succession.
  const playsBefore = Object.fromEntries((await snapshot(page)).map((s, i) => [i, s.plays]));
  const rapid = [];
  for (let i = 0; i < 5; i++) {
    await page.click("#btn-pause");
    rapid.push(await snapshot(page));
    await page.waitForTimeout(60);
    await page.click("#pause-dialog button[value=resume]");
    rapid.push(await snapshot(page));
    await page.waitForTimeout(60);
  }
  rapid.push(...(await sample(page, 1600)));
  const rapidMax = Math.max(...rapid.map((f) => playingTracks(f).length));
  const after = await snapshot(page);
  const restarted = after.some((s, i) => s.playing && s.t < 0.5);
  check(rapidMax <= 2, `rapid pause/resume never stacks tracks (max ${rapidMax} playing)`);
  check(playingTracks(after).join() === BREEZE && !restarted, "it settles on Forest Breeze without restarting anything");
  const extraPlays = after.reduce((n, s, i) => n + (s.plays - (playsBefore[i] ?? 0)), 0);
  check(extraPlays <= 5, `play() isn't hammered (${extraPlays} calls for 10 changes)`);

  // Hidden tab.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(150);
  const hiddenSnap = await snapshot(page);
  check(playingTracks(hiddenSnap).length === 0, "a hidden tab pauses the music");
  const hiddenT = hiddenSnap.find((s) => s.track === BREEZE && s.t > 1).t;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Hiding also opened the pause dialog (Gentle Canopy); resume play.
  await page.click("#pause-dialog button[value=resume]");
  await page.waitForTimeout(1500);
  snap = await snapshot(page);
  const back = snap.find((s) => s.track === BREEZE && s.playing);
  check(back && back.t >= hiddenT && back.t < hiddenT + 3, `back in view, Forest Breeze continues from ${hiddenT.toFixed(1)}s`);

  // Music off → silent at once; on → back in place.
  await page.click("#btn-pause");
  await page.click("#btn-pause-menu");
  await page.click("#screen-menu [data-go=settings]");
  await page.waitForTimeout(1300);
  const canopyPos = (await snapshot(page)).find((s) => s.track === CANOPY && s.playing)?.t ?? 0;
  await page.click("#screen-settings input[name=music]");
  check(playingTracks(await snapshot(page)).length === 0, "switching Music off stops it immediately");
  await page.waitForTimeout(1200);
  check(playingTracks(await snapshot(page)).length === 0, "…and nothing starts again");
  await page.click("#screen-settings input[name=music]");
  await page.waitForTimeout(1300);
  snap = await snapshot(page);
  const on = snap.find((s) => s.track === CANOPY && s.playing);
  check(on && on.t >= canopyPos && on.t < canopyPos + 3, "switching it back on resumes Gentle Canopy in place");

  // Volume slider acts on the music bus (element volume stays at 1).
  await page.$eval("#screen-settings input[name=musicVolume]", (el) => { el.value = "10"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SETTINGS_KEY);
  check(saved.musicVolume === 0.1 && (await snapshot(page)).every((s) => s.volume === 1), "the Music volume is saved and applied through Web Audio");
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function loopPoint(browser, url) {
  console.log("seamless loop");
  const { context, page } = await open(browser, url);
  await page.click("#screen-start");
  await page.waitForTimeout(1500);
  await page.evaluate((track) => {
    const el = window.__els.find((e) => !e.paused && decodeURIComponent(e.src).endsWith(track));
    el.currentTime = el.duration - 1.2;
  }, CANOPY);
  const frames = await sample(page, 2200, 20);
  const silent = frames.filter((f) => playingTracks(f).length === 0).length;
  const overlap = frames.filter((f) => f.filter((s) => s.track === CANOPY && s.playing).length === 2).length * 20;
  const end = frames.at(-1).filter((s) => s.playing);
  check(silent === 0, "the music never stops at the loop point");
  check(overlap >= 200 && overlap <= 800, `the twin voice overlaps the end by ~${overlap}ms`);
  check(end.length === 1 && end[0].track === CANOPY && end[0].t < 2, `the track carries on from the top (${end[0]?.t.toFixed(2)}s)`);
  check((await snapshot(page)).filter((s) => s.track === CANOPY).length === 2, "still just two elements for the track");
  await context.close();
}

async function refusals(browser, url) {
  console.log("play() refused");
  {
    const { context, page, errors } = await open(browser, url, { refuse: 1, reason: "NotAllowedError" });
    await page.click("#screen-start");
    await page.waitForTimeout(600);
    check(playingTracks(await snapshot(page)).length === 0, "a refused play() leaves the music waiting (no error)");
    await page.click("#screen-menu [data-go=help]"); // the next gesture
    await page.waitForTimeout(1200);
    check(playingTracks(await snapshot(page)).join() === CANOPY, "the next gesture starts Gentle Canopy");
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, url, { refuse: 99, reason: "NotSupportedError" });
    await page.click("#screen-start");
    await page.waitForTimeout(2500);
    const tones = await page.evaluate(() => window.__tones);
    check(playingTracks(await snapshot(page)).length === 0 && tones > 0, `an unplayable track falls back to the synthesized ambience (${tones} notes)`);
    await startDifficulty(page, "easy").catch(() => {}); // already past start
    check(errors.length === 0, "no page errors", errors.join("; "));
    await context.close();
  }
}

async function offline(browser, url) {
  console.log("offline");
  const { context, page, errors } = await open(browser, url);
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 30000 });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => /^bird-mahjong-[0-9a-f]{12}$/.test(k)));
    return (await cache.keys()).map((r) => decodeURIComponent(new URL(r.url).pathname));
  });
  check(cached.includes(`/Bird-Mahjong/${CANOPY}`) && cached.includes(`/Bird-Mahjong/${BREEZE}`), "both MP3s are in the offline cache");
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.click("#screen-start");
  await page.waitForTimeout(2000);
  let snap = await snapshot(page);
  const t = snap.find((s) => s.track === CANOPY && s.playing)?.t ?? 0;
  check(t > 0.8, `Gentle Canopy plays offline (${t.toFixed(1)}s in)`);
  await startDifficulty(page, "easy").catch(async () => {
    await page.click("#screen-menu [data-go=difficulty]");
    await page.click("[data-difficulty=easy]");
  });
  await page.waitForTimeout(2000);
  snap = await snapshot(page);
  check(playingTracks(snap).join() === BREEZE, "Forest Breeze plays offline");
  // Seek far into the file: needs a byte-range answer from the cache.
  const target = await page.evaluate((track) => {
    const el = window.__els.find((e) => !e.paused && decodeURIComponent(e.src).endsWith(track));
    el.currentTime = Math.floor(el.duration * 0.6);
    return el.currentTime;
  }, BREEZE);
  await page.waitForTimeout(1200);
  snap = await snapshot(page);
  const seeked = snap.find((s) => s.track === BREEZE && s.playing);
  check(seeked && seeked.t >= target && seeked.t < target + 3, `seeking works offline (range requests from the cache: ${target}s → ${seeked?.t.toFixed(1)}s)`);
  check(errors.length === 0, "no page errors", errors.join("; "));
  await context.close();
}

async function main() {
  const { server, url } = await serve();
  const browser = await launchBrowser();
  await screenFlow(browser, url);
  await loopPoint(browser, url);
  await refusals(browser, url);
  await offline(browser, url);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} problem(s) found` : "\nAll music checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
