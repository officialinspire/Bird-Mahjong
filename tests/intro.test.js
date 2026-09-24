import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createIntro, GUARD_MS, MAX_MS, STALL_MS } from "../js/ui/intro.js";

class FakeVideo extends EventTarget {
  constructor(playResult = () => Promise.resolve()) {
    super();
    this.paused = true;
    this.muted = false;
    this.volume = 1;
    this.currentTime = 0;
    this.attrs = {};
    this.plays = [];
    this.playResult = playResult;
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  play() { this.plays.push(this.muted); this.paused = false; return this.playResult(this); }
  pause() { this.paused = true; }
}

function setup({ playResult, store = new Map() } = {}) {
  let clock = 1000;
  const pending = new Map();
  let id = 0;
  const timers = {
    setTimeout: (fn, ms) => { pending.set(++id, { fn, at: clock + ms }); return id; },
    clearTimeout: (t) => pending.delete(t),
  };
  const advance = (ms) => {
    clock += ms;
    for (const [t, { fn, at }] of [...pending]) if (at <= clock) { pending.delete(t); fn(); }
  };
  const video = new FakeVideo(playResult);
  const skipButton = new EventTarget();
  const done = [];
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const intro = createIntro({ video, skipButton, src: "inspiresoftwareintro.mp4", onDone: (r) => done.push(r), now: () => clock, timers, store: storage });
  return { intro, video, skipButton, done, advance, store };
}

const flush = () => new Promise((r) => setImmediate(r));

describe("intro", () => {
  test("plays once per session: the flag is set as soon as it starts", () => {
    const store = new Map();
    const a = setup({ store });
    assert.equal(a.intro.pending(), true);
    assert.equal(a.intro.play(), true);
    assert.equal(a.video.getAttribute("src"), "inspiresoftwareintro.mp4", "relative src, set only when played");
    const b = setup({ store }); // e.g. after a reload, same session
    assert.equal(b.intro.pending(), false);
    assert.equal(b.intro.play(), false);
  });

  test("ends exactly once, whatever happens after", () => {
    const { intro, video, done, advance } = setup();
    intro.play();
    video.dispatchEvent(new Event("ended"));
    video.dispatchEvent(new Event("error"));
    advance(MAX_MS);
    assert.deepEqual(done, ["ended"]);
    assert.equal(video.paused, true);
  });

  test("Skip is ignored right after the start tap, then works", () => {
    const { intro, skipButton, done, advance } = setup();
    intro.play();
    skipButton.dispatchEvent(new Event("click"));
    assert.equal(intro.skip(), false);
    assert.deepEqual(done, []);
    advance(GUARD_MS);
    skipButton.dispatchEvent(new Event("click"));
    assert.deepEqual(done, ["skipped"]);
  });

  test("a playback error or a stall never traps the player", () => {
    let s = setup();
    s.intro.play();
    s.video.dispatchEvent(new Event("error"));
    assert.deepEqual(s.done, ["error"]);

    s = setup({ playResult: () => new Promise(() => {}) }); // never starts
    s.intro.play();
    s.video.paused = true;
    s.advance(STALL_MS);
    assert.deepEqual(s.done, ["stalled"]);

    s = setup(); // plays, but somehow never ends
    s.intro.play();
    s.video.currentTime = 1;
    s.advance(STALL_MS);
    assert.deepEqual(s.done, []);
    s.advance(MAX_MS);
    assert.deepEqual(s.done, ["timeout"]);
  });

  test("autoplay with sound refused: retries muted; refused again: ends", async () => {
    const refuse = () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    let s = setup({ playResult: (v) => (v.muted ? Promise.resolve() : refuse()) });
    s.intro.play({ muted: false });
    await flush();
    assert.deepEqual(s.video.plays, [false, true], "tried with sound, then muted");
    assert.deepEqual(s.done, []);

    s = setup({ playResult: refuse });
    s.intro.play({ muted: false });
    await flush();
    assert.deepEqual(s.done, ["failed"]);
  });

  test("Music off: plays muted; volume follows the Music volume", () => {
    const { intro, video } = setup();
    intro.play({ muted: true, volume: 0.3 });
    assert.equal(video.muted, true);
    assert.equal(video.volume, 0.3);
  });

  test("finish() (tab hidden) ends it; harmless when not playing", () => {
    const { intro, done } = setup();
    assert.equal(intro.finish("hidden"), false);
    intro.play();
    assert.equal(intro.finish("hidden"), true);
    assert.deepEqual(done, ["hidden"]);
  });

  test("blocked sessionStorage: still plays once on this page", () => {
    const video = new FakeVideo();
    const done = [];
    const intro = createIntro({ video, skipButton: new EventTarget(), src: "x.mp4", onDone: (r) => done.push(r), store: null });
    assert.equal(intro.play(), true);
    intro.finish();
    assert.equal(intro.pending(), false);
    assert.equal(intro.play(), false);
  });
});
