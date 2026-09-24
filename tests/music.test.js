import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createMusicController, CROSSFADE, LOOP_OVERLAP } from "../js/ui/music.js";

// ---------- Fakes: a manual clock, Web Audio gains, and <audio> elements ----------

function world({ refuse = {} } = {}) {
  let now = 0; // ms
  const queue = [];
  let id = 0;
  const timers = {
    setTimeout: (fn, ms) => { queue.push({ id: ++id, at: now + ms, fn }); return id; },
    clearTimeout: (t) => { const i = queue.findIndex((q) => q.id === t); if (i >= 0) queue.splice(i, 1); },
    setInterval: (fn, ms) => { const q = { id: ++id, at: now + ms, fn, every: ms }; queue.push(q); return q.id; },
    clearInterval: (t) => timers.clearTimeout(t),
  };
  const ctx = {
    get currentTime() { return now / 1000; },
    gains: [],
    createGain() {
      const events = [];
      const gain = {
        value: 1,
        events,
        cancelAndHoldAtTime(t) { events.push(["hold", t]); },
        cancelScheduledValues(t) { events.push(["cancel", t]); },
        setValueAtTime(v, t) { gain.value = v; events.push(["set", v, t]); },
        linearRampToValueAtTime(v, t) { gain.value = v; events.push(["ramp", v, t]); },
      };
      const node = { gain, connect() {} };
      ctx.gains.push(node);
      return node;
    },
    createMediaElementSource(el) { return { el, connect() {} }; },
  };
  const elements = [];
  const createAudio = (url) => {
    const listeners = {};
    const el = {
      url, preload: "", loop: null, paused: true, currentTime: 0, duration: 360, volume: 1, plays: 0, seeks: 0,
      play() {
        const why = refuse[url]?.shift?.() ?? null;
        if (why) { const e = new Error(why); e.name = why; return Promise.reject(e); }
        el.paused = false; el.plays++; return Promise.resolve();
      },
      pause() { el.paused = true; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      emit(type) { (listeners[type] || []).forEach((fn) => fn()); },
    };
    let t = 0;
    Object.defineProperty(el, "currentTime", { get: () => t, set: (v) => { t = v; el.seeks++; } });
    elements.push(el);
    return el;
  };
  /** Advance the clock, firing timers; playing elements advance too. */
  const advance = async (ms, step = 10) => {
    for (let done = 0; done < ms; done += step) {
      now += step;
      for (const el of elements) if (!el.paused) { const was = el.seeks; el.currentTime += step / 1000; el.seeks = was; }
      for (const q of queue.filter((x) => x.at <= now)) {
        if (q.every) q.at += q.every; else queue.splice(queue.indexOf(q), 1);
        q.fn();
      }
    }
    await new Promise((r) => setImmediate(r));
  };
  const fallbacks = [];
  const music = createMusicController({
    tracks: { menu: "canopy.mp3", game: "breeze.mp3" },
    ctx, bus: {}, timers, createAudio,
    onFallback: (scene) => fallbacks.push(scene),
  });
  const playing = () => elements.filter((e) => !e.paused);
  const of = (url) => elements.filter((e) => e.url === url);
  return { music, elements, advance, playing, of, fallbacks, ctx };
}

/** The "ramp" events in a gain's automation log. */
const ramps = (events) => events.filter((e) => e[0] === "ramp");

// ---------- Tests ----------

describe("music controller", () => {
  test("the crossfade length is within 0.8–1.2 s", () => {
    assert.ok(CROSSFADE >= 0.8 && CROSSFADE <= 1.2);
  });

  test("nothing is created until a scene is played", () => {
    const { elements, music } = world();
    assert.equal(elements.length, 0);
    assert.equal(music.state.elements, 0);
  });

  test("first scene: one track plays, fading in over the crossfade", async () => {
    const { music, of, playing } = world();
    music.play("menu");
    await Promise.resolve();
    assert.equal(of("canopy.mp3").length, 2, "two voices for looping");
    assert.equal(of("breeze.mp3").length, 0, "the other track isn't loaded");
    assert.equal(playing().length, 1);
    assert.equal(playing()[0].loop, false, "looping is handled by the twin voice");
  });

  test("the same scene again doesn't restart or re-fade", async () => {
    const { music, of } = world();
    music.play("menu");
    await Promise.resolve();
    const el = of("canopy.mp3")[0];
    const plays = el.plays;
    const seeks = el.seeks;
    for (let i = 0; i < 5; i++) music.play("menu");
    assert.equal(el.plays, plays);
    assert.equal(el.seeks, seeks);
  });

  test("switching scenes crossfades: new up, old down, over the same time; old pauses after", async () => {
    const { music, of, playing, advance } = world();
    music.play("menu");
    await advance(1500);
    music.play("game");
    await advance(500);
    assert.equal(playing().length, 2, "both audible mid-fade");
    await advance(700);
    assert.deepEqual(playing().map((e) => e.url), ["breeze.mp3"], "only the new track after the fade");
    assert.ok(of("canopy.mp3")[0].paused);
    const s = music.state;
    assert.deepEqual(s.heading, ["breeze.mp3#0"]);
  });

  test("every fade holds the current level first, then ramps for exactly CROSSFADE", async () => {
    const { music, advance, ctx } = world();
    music.play("menu");
    await advance(1500);
    music.play("game");
    await advance(300);
    music.play("menu"); // interrupt mid-fade
    await advance(10);
    // Voices are created in order: menu#0, menu#1, game#0, game#1.
    const [menu0, , game0] = ctx.gains.map((g) => g.gain);
    for (const [name, g] of [["menu", menu0], ["game", game0]]) {
      const ev = g.events;
      ev.forEach((e, i) => {
        if (e[0] !== "ramp") return;
        const prev = ev[i - 1];
        assert.equal(prev[0], "hold", `${name}: each ramp follows a hold of the current value`);
        const len = +(e[2] - prev[1]).toFixed(3);
        assert.equal(len, CROSSFADE, `${name}: ramp lasts ${len}s`);
      });
    }
    // The interruption turned both around: menu back up to 1, game back down.
    assert.equal(ramps(menu0.events).at(-1)[1], 1);
    assert.ok(ramps(game0.events).at(-1)[1] < 0.001);
    assert.equal(ramps(menu0.events).length, 3, "menu: in, out, in (no stacked ramps)");
    assert.equal(ramps(game0.events).length, 2, "game: in, out");
  });

  test("rapid screen changes never stack tracks or restart them", async () => {
    const { music, of, playing, advance } = world();
    music.play("menu");
    await advance(2000);
    const canopy = of("canopy.mp3")[0];
    const posBefore = canopy.currentTime;
    let maxPlaying = 0;
    for (const scene of ["game", "menu", "game", "menu", "game", "menu", "game"]) {
      music.play(scene);
      for (let i = 0; i < 12; i++) { await advance(10); maxPlaying = Math.max(maxPlaying, playing().length); }
    }
    assert.ok(maxPlaying <= 2, `at most two voices audible at once (saw ${maxPlaying})`);
    await advance(1300);
    assert.deepEqual(playing().map((e) => e.url), ["breeze.mp3"], "settles on the last scene only");
    assert.equal(canopy.plays, 1, "the menu track was turned around, never restarted");
    assert.ok(canopy.currentTime > posBefore, "and it kept its place");
    assert.equal(of("breeze.mp3")[0].plays, 1, "the game track started once");
    assert.equal(of("breeze.mp3")[1].plays, 0, "its twin was never needed");
  });

  test("coming back to a paused track resumes where it left off", async () => {
    const { music, of, advance } = world();
    music.play("menu");
    await advance(1000);
    const canopy = of("canopy.mp3")[0];
    canopy.currentTime = 42;
    const seeks = canopy.seeks;
    music.play("game");
    await advance(1500);
    assert.ok(canopy.paused);
    music.play("menu");
    await advance(100);
    assert.ok(!canopy.paused);
    assert.ok(canopy.currentTime >= 42 && canopy.currentTime < 44, `resumed at ${canopy.currentTime.toFixed(2)}`);
    assert.equal(canopy.seeks, seeks, "no seek back to the start");
  });

  test("seamless loop: the twin starts from 0 before the end, overlapping, never silent", async () => {
    const { music, of, playing, advance } = world();
    music.play("game");
    await advance(1200);
    const [a, b] = of("breeze.mp3");
    a.currentTime = a.duration - 1;
    let silentFrames = 0;
    let overlap = 0;
    for (let i = 0; i < 150; i++) {
      await advance(10);
      if (playing().length === 0) silentFrames++;
      if (!a.paused && !b.paused) overlap += 10;
    }
    assert.equal(silentFrames, 0, "no gap");
    assert.ok(!b.paused && b.currentTime < 1.5, "the twin carried on from the top");
    assert.ok(a.paused, "the old voice stopped after the overlap");
    assert.ok(overlap >= LOOP_OVERLAP * 1000 - 20 && overlap <= (LOOP_OVERLAP + 0.2) * 1000, `overlap ${overlap}ms`);
    // And the next loop goes back to the first voice.
    b.currentTime = b.duration - 1;
    await advance(1200);
    assert.ok(!a.paused && a.currentTime < 1.5 && b.paused);
    assert.equal(of("breeze.mp3").length, 2, "still just two elements");
  });

  test("if a voice reaches its end anyway, the twin takes over at once", async () => {
    const { music, of, playing, advance } = world();
    music.play("menu");
    await advance(1200);
    const [a, b] = of("canopy.mp3");
    a.paused = true;          // the browser stopped it at the end…
    a.emit("ended");          // …without the watcher having seen it coming
    await advance(20);
    assert.ok(!b.paused && b.currentTime < 0.2, "twin playing from the top");
    assert.equal(playing().length, 1);
  });

  test("play() refused for lack of a gesture: retried on the next gesture", async () => {
    const { music, of, advance } = world({ refuse: { "canopy.mp3": ["NotAllowedError"] } });
    music.play("menu");
    await advance(20);
    assert.equal(music.state.blocked, true);
    assert.equal(music.state.failed.length, 0, "not a failure");
    assert.ok(of("canopy.mp3")[0].paused);
    music.retry();
    await advance(20);
    assert.ok(!of("canopy.mp3")[0].paused);
    assert.equal(music.state.blocked, false);
  });

  test("play() rejected for another reason: the track fails and the scene falls back", async () => {
    const { music, advance, fallbacks } = world({ refuse: { "breeze.mp3": ["NotSupportedError"] } });
    music.play("game");
    await advance(20);
    assert.deepEqual(fallbacks, ["game"]);
    assert.equal(music.has("game"), false);
    assert.equal(music.has("menu"), true, "the other track is unaffected");
  });

  test("a load error on the element also falls back", async () => {
    const { music, of, advance, fallbacks } = world();
    music.play("menu");
    await advance(20);
    of("canopy.mp3")[0].emit("error");
    assert.deepEqual(fallbacks, ["menu"]);
    assert.ok(of("canopy.mp3").every((e) => e.paused));
  });

  test("an interrupted play (AbortError) is harmless", async () => {
    const { music, advance, fallbacks } = world({ refuse: { "canopy.mp3": ["AbortError"] } });
    music.play("menu");
    await advance(20);
    assert.equal(fallbacks.length, 0);
    assert.equal(music.has("menu"), true);
  });

  test("stop (Music off) silences and pauses everything immediately, keeping places", async () => {
    const { music, of, playing, advance } = world();
    music.play("menu");
    await advance(1500);
    music.play("game"); // mid-crossfade
    await advance(300);
    const canopy = of("canopy.mp3")[0];
    const breeze = of("breeze.mp3")[0];
    const pos = breeze.currentTime;
    music.stop();
    assert.equal(playing().length, 0, "nothing plays after stop");
    await advance(1500);
    assert.equal(playing().length, 0, "and no pending fade restarts anything");
    music.play("game");
    await advance(50);
    assert.ok(!breeze.paused && breeze.currentTime >= pos && breeze.currentTime < pos + 0.2, "resumes from the same place");
    assert.ok(canopy.paused);
  });

  test("hidden tab: pause now, resume the same place on return; changes while hidden wait", async () => {
    const { music, of, playing, advance } = world();
    music.play("menu");
    await advance(1500);
    const canopy = of("canopy.mp3")[0];
    music.suspend();
    assert.equal(playing().length, 0);
    const pos = canopy.currentTime;
    music.play("game"); // screen changed while hidden
    await advance(500);
    assert.equal(playing().length, 0, "nothing starts while hidden");
    music.resume();
    await advance(20);
    assert.ok(playing().some((e) => e.url === "breeze.mp3"), "the game track starts on return");
    assert.ok(Math.abs(canopy.currentTime - pos) < 0.05, "the menu track kept its place");
  });
});
