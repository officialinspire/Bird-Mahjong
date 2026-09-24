// Lightweight, optional audio: soft birdlike chirps and quiet UI ticks
// (Sound effects), and a calm woodland ambience (Music), all synthesized with
// Web Audio. Recorded music and bird calls are optional extras (below).
//
// Autoplay rules and courtesy both say: no sound before the player does
// something. The AudioContext is created only inside a user gesture (see
// unlock()), and only if Music or Sound effects is on. With both off, nothing
// is created at all and every call is a no-op, so the game is identical
// without audio.
//
// Two buses: effects and music each have their own gain under a master gain,
// so they have independent switches and volumes. Muting a bus is immediate:
// its gain drops to zero at the current audio time and any sound still
// playing on it is stopped, so nothing tails off after "off".
//
// Recorded audio: pass `files` ({ sfx: { match: "…" }, music: { menu: "…",
// game: "…" } }, relative URLs), all used only after unlock.
//   * Music tracks are played by the music controller (js/ui/music.js):
//     streamed <audio> elements routed into the music bus, seamless loops,
//     1s crossfades between scenes.
//   * Short effects are fetched and decoded in the background.
//   * Bird calls (`files.calls`, keyed by bird ID) are decoded the same way.
//     A cleared pair of that bird plays its call, quietly, instead of the
//     match chirp: one sound per pair, never both. Only one call sounds at a
//     time (a new one fades the last out quickly, so fast matches can't pile
//     up into a chorus), and the music dips gently under it. Calls play on
//     the effects bus, so Sound effects and its volume apply to them.
// Anything missing, unsupported or refused falls back to the synthesized
// version, which is always available.

import { createMusicController } from "./music.js";

const SOUND_NAMES = ["select", "match", "mismatch", "blocked", "hint", "undo", "shuffle", "win"];
export const MUSIC_SCENES = ["menu", "game"];

const SFX_LEVEL = 0.5;    // bus gain at 100% effects volume
const MUSIC_LEVEL = 0.35; // bus gain at 100% music volume (music sits under effects)
const CALL_LEVEL = 0.6;   // bird calls, relative to the effects bus (quiet)
const CALL_HANDOFF = 0.08; // s: a new call fades the previous one out this fast
const DUCK_LEVEL = 0.5;   // music dips to this (about -6 dB) under a call
const DUCK_IN = 0.15;     // s
const DUCK_OUT = 0.8;     // s, after the call ends
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/**
 * `enabled` / `volume` are the Sound effects switch and volume (kept under
 * their original names so existing callers work unchanged).
 */
export function createSound({
  enabled,
  volume,
  musicEnabled = () => false,
  musicVolume = () => 0,
  files = {},
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetchFile = globalThis.fetch?.bind(globalThis),
  timers = {
    setInterval: globalThis.setInterval?.bind(globalThis),
    clearInterval: globalThis.clearInterval?.bind(globalThis),
    setTimeout: globalThis.setTimeout?.bind(globalThis),
    clearTimeout: globalThis.clearTimeout?.bind(globalThis),
  },
  createMusic = createMusicController,
}) {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let duck = null;               // music bus -> duck -> master (dips under calls)
  let call = null;               // the bird call sounding now: { src, gain }
  const liveSfx = new Set();     // effect sources still sounding
  const liveMusic = new Set();   // music sources still sounding
  const buffers = { sfx: {}, calls: {} };
  let loadStarted = false;
  const tracks = files.music || {};
  let recorded = null;           // music controller, created on the first gesture

  let scene = null;              // the screen's music scene ("menu" | "game")
  let playingScene = null;       // what's actually playing
  let scheduler = null;          // interval id for the synthesized ambience
  let nextNoteAt = 0;
  let step = 0;

  const anyOn = () => !!enabled() || !!musicEnabled();

  // ---------- Setup ----------

  /** Call from a user gesture (pointerdown / keydown / click / change). */
  function unlock() {
    if (!anyOn() || !AudioContextClass) return false;
    try {
      if (!ctx) {
        ctx = new AudioContextClass();
        master = ctx.createGain();
        master.connect(ctx.destination);
        sfxBus = ctx.createGain();
        musicBus = ctx.createGain();
        duck = ctx.createGain();
        sfxBus.connect(master);
        musicBus.connect(duck);
        duck.connect(master);
        master.gain.value = 1;
        if (Object.keys(tracks).length) {
          recorded = createMusic({
            tracks,
            ctx,
            bus: musicBus,
            timers,
            // A track that can't play: use the synthesized ambience instead.
            onFallback: (which) => {
              if (which === scene && musicEnabled()) startSynth(which);
            },
          });
        }
      }
      if (ctx.state === "suspended") ctx.resume();
      recorded?.retry(); // a new gesture: retry a play() the browser refused
      apply();
      loadFiles();
      return true;
    } catch {
      ctx = null; // audio unavailable: stay silent
      return false;
    }
  }

  /** Set a bus's gain right now (cancelling any fade), so mute is instant. */
  function setBus(bus, value) {
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(value, now);
  }

  function stopAll(set) {
    for (const node of set) {
      try { node.stop(0); } catch { /* already stopped */ }
      try { node.disconnect(); } catch { /* fine */ }
    }
    set.clear();
  }

  /**
   * Bring the audio graph in line with the current settings. Safe to call at
   * any time; it never creates the AudioContext (only unlock() does, inside a
   * gesture).
   */
  function apply() {
    if (!ctx) return;
    const sfxOn = !!enabled();
    const musicOn = !!musicEnabled();
    setBus(sfxBus, sfxOn ? SFX_LEVEL * clamp01(volume()) : 0);
    setBus(musicBus, musicOn ? MUSIC_LEVEL * clamp01(musicVolume()) : 0);
    if (!sfxOn) { stopAll(liveSfx); endCall(); }
    if (!musicOn) stopMusic();
    else if (scene && playingScene !== scene) startMusic(scene);
    if (!sfxOn && !musicOn) {
      if (ctx.state === "running") ctx.suspend().catch(() => {});
    } else if (ctx.state === "suspended" && !globalThis.document?.hidden) {
      ctx.resume().catch?.(() => {});
    }
  }

  // ---------- Optional recorded audio ----------

  /** Short recorded effects are small: fetch and decode them whole. */
  function loadFiles() {
    if (loadStarted || !fetchFile) return;
    loadStarted = true;
    for (const kind of ["sfx", "calls"]) {
      for (const [name, url] of Object.entries(files[kind] || {})) {
        let pending;
        try {
          pending = fetchFile(url)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
            .then((data) => ctx.decodeAudioData(data))
            .then((buffer) => { if (buffer) buffers[kind][name] = buffer; });
        } catch {
          continue; // fetch itself threw: keep the synthesized fallback
        }
        pending.catch(() => { /* missing or undecodable: keep the synthesized fallback */ });
      }
    }
  }

  // ---------- Bird calls ----------

  /** Ramp a gain param from its current value, dropping anything scheduled. */
  function rampFromNow(param, to, seconds, at = ctx.currentTime) {
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(at);
    else { const v = param.value; param.cancelScheduledValues(at); param.setValueAtTime(v, at); }
    param.linearRampToValueAtTime(to, at + seconds);
  }

  /** Play a bird's call; false if there's no decoded clip (caller chirps). */
  function playCall(bird) {
    const buffer = bird && buffers.calls[bird];
    if (!buffer) return false;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = CALL_LEVEL;
    src.connect(gain);
    gain.connect(sfxBus);
    src.start(now); // if this throws, nothing sounded and the chirp is used
    // Only one call at a time: fade the previous one out quickly.
    if (call) {
      const old = call;
      rampFromNow(old.gain.gain, 0.0001, CALL_HANDOFF, now);
      try { old.src.stop(now + CALL_HANDOFF + 0.02); } catch { /* already stopped */ }
    }
    const current = { src, gain };
    call = current;
    liveSfx.add(src);
    src.onended = () => {
      liveSfx.delete(src);
      if (call === current) call = null;
    };
    // Dip the music under the call, then bring it back.
    const length = Number(buffer.duration) || 1.5;
    rampFromNow(duck.gain, DUCK_LEVEL, DUCK_IN, now);
    duck.gain.setValueAtTime(DUCK_LEVEL, now + Math.max(DUCK_IN, length));
    duck.gain.linearRampToValueAtTime(1, now + Math.max(DUCK_IN, length) + DUCK_OUT);
    return true;
  }

  /** Sound effects off: no call, and the music is not left dipped. */
  function endCall() {
    call = null;
    if (!duck) return;
    const now = ctx.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(1, now);
  }

  // ---------- Sound effects (synthesized) ----------

  /**
   * One soft tone: frequency glides from f0 to f1 with a quick attack and a
   * gentle exponential release, so nothing clicks or blares.
   */
  function tone({ at = 0, f0, f1 = f0, dur = 0.08, type = "sine", peak = 0.12, bus = sfxBus, live = liveSfx, attack }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + (attack ?? Math.min(0.015, dur / 3)));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(bus);
    live.add(osc);
    osc.onended = () => live.delete(osc);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A two-note chirp; `pitch` shifts it slightly so different birds vary. */
  const chirp = (at, pitch = 1, bus, live, peak = 0.1) => {
    tone({ at, f0: 2300 * pitch, f1: 3300 * pitch, dur: 0.07, peak, bus, live });
    tone({ at: at + 0.09, f0: 2600 * pitch, f1: 3700 * pitch, dur: 0.08, peak: peak * 0.8, bus, live });
  };

  const SOUNDS = {
    select: () => tone({ f0: 1250, dur: 0.045, peak: 0.05 }),
    match: (opts) => chirp(0, opts.pitch),
    mismatch: () => tone({ f0: 330, f1: 280, dur: 0.09, type: "triangle", peak: 0.08 }),
    blocked: () => tone({ f0: 240, dur: 0.06, type: "triangle", peak: 0.06 }),
    hint: () => { tone({ f0: 880, dur: 0.09, peak: 0.06 }); tone({ at: 0.1, f0: 1320, dur: 0.12, peak: 0.06 }); },
    undo: () => tone({ f0: 1500, f1: 900, dur: 0.12, peak: 0.06 }),
    shuffle: () => { for (let i = 0; i < 4; i++) tone({ at: i * 0.06, f0: 1800 + i * 300, f1: 2400 + i * 300, dur: 0.05, peak: 0.05 }); },
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone({ at: i * 0.13, f0: f, dur: 0.22, type: "triangle", peak: 0.09 }));
      chirp(0.62, 1.05);
    },
  };

  function playBuffer(buffer, bus, live, { loop = false, rate = 1 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = rate;
    src.connect(bus);
    live.add(src);
    src.onended = () => live.delete(src);
    src.start(ctx.currentTime);
    return src;
  }

  /** Play a named effect if Sound effects is on and audio has been unlocked. */
  function play(name, opts = {}) {
    if (!enabled() || !ctx || !SOUNDS[name]) return false;
    try {
      if (ctx.state === "suspended") ctx.resume();
      if (name === "match" && opts.bird) {
        let called = false;
        try { called = playCall(opts.bird); } catch { called = false; }
        if (called) return true; // the call replaces the chirp: never both
      }
      const clip = buffers.sfx[name];
      if (clip) playBuffer(clip, sfxBus, liveSfx, { rate: opts.pitch || 1 });
      else SOUNDS[name](opts);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Music ----------

  // A slow, sparse pentatonic ambience: a soft low drone note every bar, a
  // few gentle "leaf" notes, and now and then a distant bird call. Menus sit
  // a little brighter and slower than play.
  const SCENES = {
    menu: { beat: 0.9, root: 196.0, scale: [0, 2, 4, 7, 9, 12, 14], density: 0.45 },  // G major pentatonic
    game: { beat: 1.1, root: 174.6, scale: [0, 2, 5, 7, 9, 12, 14], density: 0.35 },  // F, quieter
  };
  const LOOKAHEAD = 1.5;   // seconds of notes scheduled ahead
  const TICK_MS = 400;
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function scheduleAmbience() {
    const s = SCENES[playingScene] || SCENES.menu;
    while (nextNoteAt < ctx.currentTime + LOOKAHEAD) {
      const at = Math.max(0, nextNoteAt - ctx.currentTime);
      const bar = step % 4 === 0;
      if (bar) {
        // Soft low note that swells in and fades.
        tone({ at, f0: s.root / 2, dur: s.beat * 3.6, type: "sine", peak: 0.09, attack: 0.8, bus: musicBus, live: liveMusic });
      }
      if (rand() < s.density) {
        const degree = s.scale[Math.floor(rand() * s.scale.length)];
        const f = s.root * 2 ** (degree / 12) * (rand() < 0.3 ? 2 : 1);
        tone({ at, f0: f, dur: s.beat * 1.6, type: "triangle", peak: 0.045, attack: 0.08, bus: musicBus, live: liveMusic });
      }
      if (step % 16 === 11 && rand() < 0.6) chirp(at + 0.2, 0.8 + rand() * 0.3, musicBus, liveMusic, 0.025);
      nextNoteAt += s.beat;
      step++;
    }
  }

  /**
   * Go to a scene's music. Recorded tracks crossfade (the controller handles
   * fades, loops and repeated calls); otherwise the synthesized ambience.
   */
  function startMusic(which) {
    if (!ctx || !musicEnabled() || !which) return;
    playingScene = which;
    if (recorded?.has(which)) {
      stopSynth();
      recorded.play(which);
      return;
    }
    recorded?.play(which); // fades any recorded track out
    startSynth(which);
  }

  function startSynth(which) {
    stopSynth();
    playingScene = which;
    seed = which === "game" ? 7 : 3;
    step = 0;
    nextNoteAt = ctx.currentTime + 0.1;
    scheduleAmbience();
    scheduler = timers.setInterval?.(() => {
      if (ctx && ctx.state === "running") scheduleAmbience();
    }, TICK_MS);
  }

  function stopSynth() {
    if (scheduler !== null) timers.clearInterval?.(scheduler);
    scheduler = null;
    if (ctx) stopAll(liveMusic);
  }

  /** Music off: everything on the music bus stops now. */
  function stopMusic() {
    stopSynth();
    recorded?.stop();
    playingScene = null;
  }

  /** The screen changed: menus and play have slightly different music. */
  function setScene(next) {
    const which = MUSIC_SCENES.includes(next) ? next : null;
    scene = which;
    if (!ctx) return; // starts after the first gesture, via unlock() → apply()
    if (!which || !musicEnabled()) stopMusic();
    else if (playingScene !== which) startMusic(which);
  }

  // ---------- Page lifecycle ----------

  /** Tab hidden / app backgrounded: silence everything until resume(). */
  function suspend() {
    recorded?.suspend();
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }

  /** Back in view: resume only if something is switched on. */
  function resume() {
    if (ctx && anyOn() && ctx.state === "suspended") ctx.resume().catch?.(() => {});
    if (musicEnabled()) recorded?.resume();
  }

  /** Legacy name: stop what's sounding now (used when Sound is switched off). */
  function silence() {
    if (!ctx) return;
    apply();
  }

  return {
    unlock,
    play,
    apply,
    setScene,
    suspend,
    resume,
    silence,
    names: SOUND_NAMES,
    get started() { return !!ctx; },
    get musicPlaying() { return playingScene; },
    /** Recorded-music state (null if no tracks are configured). */
    get recorded() { return recorded ? recorded.state : null; },
    /** For tests: how many sources are sounding on each bus. */
    get live() { return { sfx: liveSfx.size, music: liveMusic.size }; },
    /** For tests: which bird calls are decoded and ready. */
    get calls() { return Object.keys(buffers.calls); },
  };
}
