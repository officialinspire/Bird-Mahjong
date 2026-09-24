import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSound } from "../js/ui/sound.js";
import { AUDIO_FILES } from "../js/config.js";
import { BIRD_IDS } from "../js/game/birds.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------- A small fake Web Audio (buffers carry a duration) ----------

class Param {
  constructor(value) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(["set", v, t]); }
  linearRampToValueAtTime(v, t) { this.events.push(["linear", v, t]); }
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
  static last = null;
  constructor() {
    FakeContext.last = this;
    this.state = "running";
    this.currentTime = 10;
    this.destination = new Node(this, "destination");
    this.sources = [];
    this.gains = [];
  }
  createGain() { const g = new Node(this, "gain"); g.gain = new Param(1); this.gains.push(g); return g; }
  createOscillator() { const o = new Source(this, "osc"); o.frequency = new Param(440); return o; }
  createBufferSource() { const b = new Source(this, "buffer"); b.playbackRate = new Param(1); return b; }
  decodeAudioData(data) {
    return data === "bad" ? Promise.reject(new Error("decode")) : Promise.resolve({ clip: data, duration: 2 });
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

/** A sound engine with the real call mapping; every clip decodes unless told otherwise. */
async function setup({ cfg: over = {}, bodies = {}, calls = AUDIO_FILES.calls } = {}) {
  const cfg = { sfx: true, sfxVolume: 0.6, music: true, musicVolume: 0.4, ...over };
  const fetchFile = (url) => {
    if (url in bodies) {
      const body = bodies[url];
      if (body === null) return Promise.resolve({ ok: false, status: 404 });
      if (body instanceof Error) return Promise.reject(body);
      if (body === "throw") throw new Error("fetch threw");
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(url) });
  };
  const sound = createSound({
    enabled: () => cfg.sfx,
    volume: () => cfg.sfxVolume,
    musicEnabled: () => cfg.music,
    musicVolume: () => cfg.musicVolume,
    files: { calls },
    AudioContextClass: FakeContext,
    fetchFile,
    timers: { setInterval: () => 1, clearInterval: () => {} },
  });
  sound.unlock();
  await flush();
  const ctx = FakeContext.last;
  const [, sfxBus, musicBus, duck] = ctx.gains;
  ctx.sources.length = 0; // ignore the ambience notes scheduled on unlock
  const isCall = (s) => s.kind === "buffer";
  const oscillators = () => ctx.sources.filter((s) => s.kind === "osc" && reaches(s, sfxBus));
  return { sound, cfg, ctx, sfxBus, musicBus, duck, calls: () => ctx.sources.filter(isCall), oscillators };
}

function reaches(node, target) {
  for (let n = node; n; n = n.out) if (n === target) return true;
  return false;
}

// ---------- The mapping ----------

describe("bird-call mapping", () => {
  const credits = fs.readFileSync(path.join(ROOT, "assets/audio/CREDITS.md"), "utf8");

  test("every bird but Peregrine Falcon and Wild Turkey has an approved clip, keyed by its exact ID", () => {
    assert.deepEqual(Object.keys(AUDIO_FILES.calls).sort(),
      BIRD_IDS.filter((b) => b !== "peregrine-falcon" && b !== "wild-turkey").sort());
    for (const id of Object.keys(AUDIO_FILES.calls)) assert.ok(BIRD_IDS.includes(id), `${id} is a real bird ID`);
  });

  test("each maps to its own local file, which exists and is small", () => {
    for (const [id, url] of Object.entries(AUDIO_FILES.calls)) {
      assert.equal(url, `assets/audio/${id}.mp3`, "the file is named after its bird");
      const file = path.join(ROOT, url);
      assert.ok(fs.existsSync(file), `${url} exists`);
      assert.ok(fs.statSync(file).size < 40 * 1024, `${url} is small`);
    }
  });

  test("every mapped clip is credited in assets/audio/CREDITS.md", () => {
    for (const id of Object.keys(AUDIO_FILES.calls)) {
      assert.match(credits, new RegExp(`## ${id}\\.mp3`), `${id} has a credits entry`);
    }
  });

  test("the offline precache includes every clip", () => {
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    for (const url of Object.values(AUDIO_FILES.calls)) assert.ok(sw.includes(`"./${url}"`) || sw.includes(`"${url}"`), url);
  });
});

// ---------- Playing them ----------

describe("a cleared pair plays one sound", () => {
  test("a bird with a clip plays its call, and no chirp", async () => {
    const { sound, calls, oscillators, sfxBus } = await setup();
    assert.deepEqual(sound.calls.sort(), Object.keys(AUDIO_FILES.calls).sort());
    assert.equal(sound.play("match", { bird: "american-crow", pitch: 1 }), true);
    assert.equal(calls().length, 1);
    assert.equal(calls()[0].buffer.clip, "assets/audio/american-crow.mp3", "the crow's own clip");
    assert.ok(reaches(calls()[0], sfxBus), "on the effects bus");
    assert.equal(oscillators().length, 0, "no chirp as well");
  });

  test("each approved bird gets exactly its own clip", async () => {
    for (const [bird, url] of Object.entries(AUDIO_FILES.calls)) {
      const { sound, calls, oscillators } = await setup();
      sound.play("match", { bird });
      assert.deepEqual(calls().map((c) => c.buffer.clip), [url], bird);
      assert.equal(oscillators().length, 0, bird);
    }
  });

  test("a bird without a clip keeps the synthesized chirp, and no call", async () => {
    const { sound, calls, oscillators } = await setup();
    for (const bird of BIRD_IDS.filter((b) => !(b in AUDIO_FILES.calls))) {
      sound.play("match", { bird, pitch: 1 });
    }
    assert.equal(calls().length, 0);
    assert.equal(oscillators().length, 2 * (BIRD_IDS.length - Object.keys(AUDIO_FILES.calls).length), "one two-note chirp per pair");
  });

  test("the call is quiet and sits under a separate gain", async () => {
    const { sound, calls, sfxBus } = await setup();
    sound.play("match", { bird: "wood-duck" });
    const gain = calls()[0].out;
    assert.equal(gain.out, sfxBus);
    assert.ok(gain.gain.value > 0 && gain.gain.value < 1, `call level ${gain.gain.value}`);
  });

  test("a match with no bird (the settings sample) chirps", async () => {
    const { sound, calls, oscillators } = await setup();
    sound.play("match");
    assert.equal(calls().length, 0);
    assert.equal(oscillators().length, 2);
  });
});

describe("no chorus", () => {
  test("rapid matches: a new call fades the last out quickly, so at most one carries on", async () => {
    const { sound, ctx, calls } = await setup();
    sound.play("match", { bird: "american-crow" });
    ctx.currentTime += 0.2;
    sound.play("match", { bird: "common-raven" });
    ctx.currentTime += 0.2;
    sound.play("match", { bird: "bald-eagle" });
    const [crow, raven, eagle] = calls();
    for (const [old, at] of [[crow, 10.2], [raven, 10.4]]) {
      assert.ok(old.stoppedAt > at && old.stoppedAt <= at + 0.15, `stopped within a short handoff (${old.stoppedAt})`);
      const fade = old.out.gain.events.find((e) => e[0] === "linear");
      assert.ok(fade && fade[1] < 0.01 && fade[2] <= at + 0.1, "faded out");
    }
    assert.equal(eagle.stoppedAt, undefined, "the newest call plays on");
  });

  test("the same bird matched twice quickly doesn't double up either", async () => {
    const { sound, ctx, calls } = await setup();
    sound.play("match", { bird: "northern-cardinal" });
    ctx.currentTime += 0.05;
    sound.play("match", { bird: "northern-cardinal" });
    assert.equal(calls().filter((c) => c.stoppedAt === undefined).length, 1);
  });
});

describe("music ducking", () => {
  test("music dips during a call and comes back; the music volume itself is untouched", async () => {
    const { sound, duck, musicBus } = await setup();
    const musicLevel = musicBus.gain.value;
    sound.play("match", { bird: "american-crow" });
    const ramps = duck.gain.events.filter((e) => e[0] === "linear");
    assert.equal(ramps.length, 2);
    const [down, up] = ramps;
    assert.ok(down[1] >= 0.3 && down[1] <= 0.7, `gentle dip to ${down[1]}`);
    assert.ok(down[2] - 10 >= 0.1 && down[2] - 10 <= 0.3, "dips smoothly");
    assert.equal(up[1], 1, "back to full");
    assert.ok(up[2] >= 10 + 2, "only after the 2 s call ends");
    assert.equal(musicBus.gain.value, musicLevel, "the Music volume setting isn't changed");
  });

  test("a chirp doesn't duck the music", async () => {
    const { sound, duck } = await setup();
    sound.play("match", { bird: "peregrine-falcon" }); // no clip: chirps
    assert.equal(duck.gain.events.length, 0);
  });
});

describe("Sound effects switch and volume", () => {
  test("with Sound effects off, a match plays nothing at all", async () => {
    const { sound, cfg, ctx } = await setup({ cfg: { sfx: false } });
    assert.equal(sound.play("match", { bird: "american-crow" }), false);
    assert.equal(ctx.sources.length, 0);
  });

  test("switching Sound effects off stops a call at once and releases the music dip", async () => {
    const { sound, cfg, ctx, calls, duck, sfxBus } = await setup();
    sound.play("match", { bird: "common-raven" });
    cfg.sfx = false;
    sound.apply();
    assert.equal(calls()[0].stoppedAt, 0, "cut immediately");
    assert.equal(sfxBus.gain.value, 0, "effects bus silent");
    assert.equal(duck.gain.value, 1, "music not left dipped");
    assert.equal(sound.live.sfx, 0);
    assert.equal(sound.play("match", { bird: "common-raven" }), false);
    assert.equal(calls().length, 1);
  });

  test("the Sound effects volume sets the calls' level", async () => {
    const { sound, cfg, sfxBus } = await setup({ cfg: { sfxVolume: 0.2 } });
    const low = sfxBus.gain.value;
    cfg.sfxVolume = 1;
    sound.apply();
    assert.ok(sfxBus.gain.value > low && low > 0);
  });

  test("music off doesn't stop calls; effects still play", async () => {
    const { sound, calls } = await setup({ cfg: { music: false } });
    sound.play("match", { bird: "bald-eagle" });
    assert.equal(calls().length, 1);
  });
});

describe("missing or broken clips fall back safely", () => {
  test("404, network error, undecodable data or a throwing fetch: chirp, no errors", async () => {
    const { sound, calls, oscillators } = await setup({
      bodies: {
        "assets/audio/american-crow.mp3": null,
        "assets/audio/common-raven.mp3": new Error("offline"),
        "assets/audio/bald-eagle.mp3": "bad",
        "assets/audio/wood-duck.mp3": "throw",
      },
    });
    const broken = ["american-crow", "common-raven", "bald-eagle", "wood-duck"];
    assert.deepEqual(sound.calls.sort(), Object.keys(AUDIO_FILES.calls).filter((b) => !broken.includes(b)).sort(),
      "every other clip still decodes");
    for (const bird of ["american-crow", "common-raven", "bald-eagle", "wood-duck"]) {
      assert.equal(sound.play("match", { bird }), true, bird);
    }
    assert.equal(calls().length, 0, "no call sources");
    assert.equal(oscillators().length, 8, "four chirps instead");
    sound.play("match", { bird: "northern-cardinal" });
    assert.equal(calls().length, 1, "the working clip still plays");
  });

  test("a match before the clips finish decoding chirps (once)", async () => {
    FakeContext.last = null;
    let release;
    const gate = new Promise((r) => { release = r; });
    const sound = createSound({
      enabled: () => true, volume: () => 1, musicEnabled: () => false, musicVolume: () => 0,
      files: { calls: { "american-crow": "c.mp3" } },
      AudioContextClass: FakeContext,
      fetchFile: () => gate.then(() => ({ ok: true, arrayBuffer: () => Promise.resolve("c") })),
      timers: { setInterval: () => 1, clearInterval: () => {} },
    });
    sound.unlock();
    sound.play("match", { bird: "american-crow" });
    const ctx = FakeContext.last;
    assert.deepEqual(ctx.sources.map((s) => s.kind), ["osc", "osc"]);
    release();
    await flush();
    sound.play("match", { bird: "american-crow" });
    assert.deepEqual(ctx.sources.map((s) => s.kind), ["osc", "osc", "buffer"]);
  });

  test("if starting the call throws, the chirp plays instead (still one sound)", async () => {
    const { sound, ctx, oscillators } = await setup();
    const orig = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => { const s = orig(); s.start = () => { throw new Error("nope"); }; return s; };
    assert.equal(sound.play("match", { bird: "american-crow" }), true);
    assert.equal(oscillators().length, 2);
    assert.equal(ctx.sources.filter((s) => s.kind === "buffer").length, 0);
  });
});
