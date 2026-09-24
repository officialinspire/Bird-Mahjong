import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSound, MUSIC_SCENES } from "../js/ui/sound.js";

// ---------- A minimal fake Web Audio, recording what the engine does ----------

class Param {
  constructor(value) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(["set", v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }
  cancelScheduledValues(t) { this.events.push(["cancel", t]); }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.out = null; }
  connect(n) { this.out = n; }
  disconnect() { this.out = null; }
}
class Source extends Node {
  start(t) { this.started = t; this.ctx.sources.push(this); }
  stop(t) { this.stoppedAt = t; if (t === 0) this.onended?.(); }
}
class FakeContext {
  static instances = [];
  constructor() {
    FakeContext.instances.push(this);
    this.state = "running";
    this.currentTime = 10;
    this.destination = new Node(this, "destination");
    this.sources = [];
  }
  createGain() { const g = new Node(this, "gain"); g.gain = new Param(1); (this.gains ||= []).push(g); return g; }
  createOscillator() { const o = new Source(this, "osc"); o.frequency = new Param(440); return o; }
  createBufferSource() { const b = new Source(this, "buffer"); b.playbackRate = new Param(1); return b; }
  decodeAudioData(data) { return data === "bad" ? Promise.reject(new Error("decode")) : Promise.resolve({ decoded: data }); }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}

function setup(overrides = {}) {
  FakeContext.instances = [];
  const cfg = { sfx: true, sfxVolume: 0.6, music: true, musicVolume: 0.4, ...overrides.cfg };
  const intervals = new Map();
  let nextId = 1;
  const timers = {
    setInterval: (fn) => { intervals.set(nextId, fn); return nextId++; },
    clearInterval: (id) => intervals.delete(id),
  };
  const fetched = [];
  const fetchFile = (url) => {
    fetched.push(url);
    const body = overrides.fileBodies?.[url];
    if (body === undefined) return Promise.resolve({ ok: false, status: 404 });
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(body) });
  };
  const sound = createSound({
    enabled: () => cfg.sfx,
    volume: () => cfg.sfxVolume,
    musicEnabled: () => cfg.music,
    musicVolume: () => cfg.musicVolume,
    files: overrides.files ?? {},
    AudioContextClass: FakeContext,
    fetchFile,
    timers,
  });
  const ctx = () => FakeContext.instances[0];
  return { sound, cfg, ctx, intervals, fetched };
}

/** Sources on a given bus, found by walking up to the gain whose level we know. */
function sourcesOn(ctx, busGain) {
  return ctx.sources.filter((s) => { for (let n = s; n; n = n.out) if (n === busGain) return true; return false; });
}

/**
 * The engine's buses. unlock() creates master, then effects, then music, so
 * the first three gains are those; both buses feed the master.
 */
function findBuses(ctx) {
  const [master, sfx, music] = ctx.gains;
  assert.equal(master.out, ctx.destination);
  assert.equal(sfx.out, master);
  assert.equal(music.out, master);
  return { master, sfx, music, feeders: [sfx, music] };
}

const flush = () => new Promise((r) => setImmediate(r));

// ---------- Tests ----------

describe("starting audio", () => {
  test("nothing is created before a user gesture", () => {
    const { sound } = setup();
    assert.equal(sound.play("match"), false);
    sound.setScene("menu");
    sound.apply();
    sound.resume();
    assert.equal(FakeContext.instances.length, 0);
    assert.equal(sound.started, false);
  });

  test("with music and effects both off, a gesture still creates nothing", () => {
    const { sound } = setup({ cfg: { sfx: false, music: false } });
    assert.equal(sound.unlock(), false);
    assert.equal(FakeContext.instances.length, 0);
  });

  test("one AudioContext, created on the first gesture and reused", () => {
    const { sound } = setup();
    assert.equal(sound.unlock(), true);
    sound.unlock();
    sound.unlock();
    assert.equal(FakeContext.instances.length, 1);
  });

  test("music waits for the gesture, then starts in the current scene", () => {
    const { sound, ctx } = setup({ cfg: { sfx: false } });
    sound.setScene("menu");
    assert.equal(sound.musicPlaying, null);
    sound.unlock();
    assert.equal(sound.musicPlaying, "menu");
    assert.ok(ctx().sources.length > 0, "ambience notes were scheduled");
  });
});

describe("separate buses and volumes", () => {
  test("effects and music play on different buses with their own volume", () => {
    const { sound, ctx } = setup();
    sound.setScene("game");
    sound.unlock();
    sound.play("match");
    const c = ctx();
    const { sfx, music } = findBuses(c);
    assert.equal(+sfx.gain.value.toFixed(3), 0.3, "effects 0.6 × 0.5");
    assert.equal(+music.gain.value.toFixed(3), 0.14, "music 0.4 × 0.35");
    assert.ok(sourcesOn(c, music).length > 0, "ambience is on the music bus");
    assert.equal(sourcesOn(c, sfx).length, 2, "the match chirp (2 tones) is on the effects bus");
  });

  test("volume changes apply to their own bus only", () => {
    const { sound, cfg, ctx } = setup();
    sound.setScene("menu");
    sound.unlock();
    sound.play("select");
    cfg.musicVolume = 1;
    cfg.sfxVolume = 0.2;
    sound.apply();
    const { sfx, music } = findBuses(ctx());
    assert.equal(+sfx.gain.value.toFixed(3), 0.1);
    assert.equal(+music.gain.value.toFixed(3), 0.35);
  });

  test("effects only: music bus is silent and no ambience plays", () => {
    const { sound, ctx } = setup({ cfg: { music: false } });
    sound.setScene("menu");
    sound.unlock();
    sound.play("hint");
    assert.equal(sound.musicPlaying, null);
    assert.ok(ctx().sources.every((s) => s.kind === "osc"));
    assert.equal(sound.live.music, 0);
    assert.ok(sound.live.sfx > 0);
  });

  test("music only: effects are silent", () => {
    const { sound } = setup({ cfg: { sfx: false } });
    sound.setScene("menu");
    sound.unlock();
    assert.equal(sound.play("match"), false);
    assert.equal(sound.live.sfx, 0);
    assert.ok(sound.live.music > 0);
  });
});

describe("muting is immediate", () => {
  test("switching effects off drops the bus to 0 now and stops sounds still playing", () => {
    const { sound, cfg, ctx } = setup({ cfg: { music: false } });
    sound.unlock();
    sound.play("win"); // a long chord + chirp, mostly scheduled in the future
    const c = ctx();
    const playing = c.sources.slice();
    assert.ok(playing.length >= 6);
    cfg.sfx = false;
    sound.apply();
    const sfxBus = findBuses(c).sfx;
    assert.equal(sfxBus.gain.value, 0);
    assert.deepEqual(sfxBus.gain.events.slice(-2), [["cancel", c.currentTime], ["set", 0, c.currentTime]], "cancel fades, set 0 at the current time");
    assert.ok(playing.every((s) => s.stoppedAt === 0), "every effect was stopped at once");
    assert.equal(sound.live.sfx, 0);
    assert.equal(sound.play("match"), false, "and nothing new plays");
  });

  test("switching music off stops the ambience and its scheduler at once", () => {
    const { sound, cfg, ctx, intervals } = setup({ cfg: { sfx: false } });
    sound.setScene("game");
    sound.unlock();
    const notes = ctx().sources.slice();
    assert.equal(intervals.size, 1, "the ambience scheduler is running");
    cfg.music = false;
    sound.apply();
    assert.equal(intervals.size, 0, "scheduler cleared");
    assert.ok(notes.every((s) => s.stoppedAt === 0), "every music note stopped");
    assert.equal(sound.musicPlaying, null);
    assert.equal(findBuses(ctx()).music.gain.value, 0);
  });

  test("with both off the audio context is suspended; switching one back on resumes it", () => {
    const { sound, cfg, ctx } = setup();
    sound.setScene("menu");
    sound.unlock();
    cfg.music = false;
    cfg.sfx = false;
    sound.apply();
    assert.equal(ctx().state, "suspended");
    cfg.sfx = true;
    sound.unlock(); // the settings change is a gesture
    assert.equal(ctx().state, "running");
    assert.equal(sound.play("select"), true);
    assert.equal(sound.musicPlaying, null, "music stays off");
  });

  test("music turned back on restarts in the current scene", () => {
    const { sound, cfg } = setup();
    sound.setScene("game");
    sound.unlock();
    cfg.music = false;
    sound.apply();
    cfg.music = true;
    sound.apply();
    assert.equal(sound.musicPlaying, "game");
  });
});

describe("scenes and page lifecycle", () => {
  test("menus and play have their own music; changing screens switches it", () => {
    const { sound, intervals } = setup({ cfg: { sfx: false } });
    assert.deepEqual(MUSIC_SCENES, ["menu", "game"]);
    sound.setScene("menu");
    sound.unlock();
    assert.equal(sound.musicPlaying, "menu");
    sound.setScene("game");
    assert.equal(sound.musicPlaying, "game");
    assert.equal(intervals.size, 1, "one scheduler at a time");
    sound.setScene("game");
    assert.equal(intervals.size, 1, "same scene: nothing restarts");
    sound.setScene("nowhere");
    assert.equal(sound.musicPlaying, null);
    assert.equal(intervals.size, 0);
  });

  test("the ambience keeps scheduling as time passes", () => {
    const { sound, ctx, intervals } = setup({ cfg: { sfx: false } });
    sound.setScene("menu");
    sound.unlock();
    const before = ctx().sources.length;
    ctx().currentTime += 8;
    for (const tick of intervals.values()) tick();
    assert.ok(ctx().sources.length > before);
  });

  test("a hidden tab is silenced; coming back resumes only if something is on", () => {
    const { sound, cfg, ctx } = setup();
    sound.setScene("menu");
    sound.unlock();
    sound.suspend();
    assert.equal(ctx().state, "suspended");
    sound.resume();
    assert.equal(ctx().state, "running");
    sound.suspend();
    cfg.music = false;
    cfg.sfx = false;
    sound.resume();
    assert.equal(ctx().state, "suspended");
  });

  test("the original API still works: effects only, no music arguments", () => {
    FakeContext.instances = [];
    let on = true;
    const sound = createSound({ enabled: () => on, volume: () => 0.5, AudioContextClass: FakeContext, timers: { setInterval: () => 1, clearInterval: () => {} } });
    sound.setScene("menu");
    assert.equal(sound.unlock(), true);
    assert.equal(sound.musicPlaying, null);
    assert.equal(sound.play("match"), true);
    on = false;
    sound.silence();
    assert.equal(sound.live.sfx, 0);
    assert.deepEqual(sound.names, ["select", "match", "mismatch", "blocked", "hint", "undo", "shuffle", "win"]);
  });
});

describe("recorded audio with synthesized fallback", () => {
  test("files are not fetched before the first gesture", async () => {
    const { sound, fetched } = setup({ files: { sfx: { match: "assets/audio/match.mp3" } } });
    sound.play("match");
    await flush();
    assert.equal(fetched.length, 0);
    sound.unlock();
    await flush();
    assert.deepEqual(fetched, ["assets/audio/match.mp3"]);
  });

  test("a recorded effect is used once decoded; others stay synthesized", async () => {
    const { sound, ctx } = setup({
      cfg: { music: false },
      files: { sfx: { match: "a/match.mp3" } },
      fileBodies: { "a/match.mp3": "MATCHDATA" },
    });
    sound.unlock();
    await flush(); await flush();
    sound.play("match");
    sound.play("select");
    const kinds = ctx().sources.map((s) => s.kind);
    assert.deepEqual(kinds, ["buffer", "osc"]);
    assert.deepEqual(ctx().sources[0].buffer, { decoded: "MATCHDATA" });
  });

  test("missing, failing or undecodable files fall back to the synthesized sound", async () => {
    const { sound, ctx } = setup({
      cfg: { music: false },
      files: { sfx: { match: "missing.mp3", hint: "offline.mp3", undo: "broken.mp3" } },
      fileBodies: { "offline.mp3": new Error("offline"), "broken.mp3": "bad" },
    });
    sound.unlock();
    await flush(); await flush();
    for (const name of ["match", "hint", "undo"]) sound.play(name);
    assert.ok(ctx().sources.every((s) => s.kind === "osc"), "all synthesized");
    assert.ok(ctx().sources.length >= 5);
  });

  test("a recorded music track loops in its scene, and mutes immediately", async () => {
    const { sound, cfg, ctx, intervals } = setup({
      cfg: { sfx: false },
      files: { music: { menu: "m/menu.mp3" } },
      fileBodies: { "m/menu.mp3": "MENU" },
    });
    sound.setScene("menu");
    sound.unlock(); // starts the synthesized ambience right away…
    await flush(); await flush(); // …then the decoded track takes over
    const track = ctx().sources.find((s) => s.kind === "buffer");
    assert.ok(track && track.loop === true);
    assert.equal(intervals.size, 0, "the synthesized scheduler stepped aside");
    sound.setScene("game"); // no recording for play: synthesized fallback
    assert.equal(track.stoppedAt, 0);
    assert.equal(intervals.size, 1);
    cfg.music = false;
    sound.apply();
    assert.equal(sound.live.music, 0);
  });
});
