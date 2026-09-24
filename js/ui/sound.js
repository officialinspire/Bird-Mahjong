// Lightweight, optional audio: soft birdlike chirps and quiet UI ticks
// (Sound effects), and a calm woodland ambience (Music), all synthesized with
// Web Audio, so the game ships with no audio files.
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
// Optional recorded audio: pass `files` ({ sfx: { match: "…" }, music:
// { menu: "…", game: "…" } }, relative URLs). Files are fetched and decoded
// only after unlock, in the background; any that are missing or fail simply
// leave the synthesized version in place. The synthesized sounds are always
// the fallback.

const SOUND_NAMES = ["select", "match", "mismatch", "blocked", "hint", "undo", "shuffle", "win"];
export const MUSIC_SCENES = ["menu", "game"];

const SFX_LEVEL = 0.5;    // bus gain at 100% effects volume
const MUSIC_LEVEL = 0.35; // bus gain at 100% music volume (music sits under effects)
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
  timers = { setInterval: globalThis.setInterval?.bind(globalThis), clearInterval: globalThis.clearInterval?.bind(globalThis) },
}) {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  const liveSfx = new Set();     // effect sources still sounding
  const liveMusic = new Set();   // music sources still sounding
  const buffers = { sfx: {}, music: {} };
  let loadStarted = false;

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
        sfxBus.connect(master);
        musicBus.connect(master);
        master.gain.value = 1;
      }
      if (ctx.state === "suspended") ctx.resume();
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
    if (!sfxOn) stopAll(liveSfx);
    if (!musicOn) stopMusic();
    else if (scene && playingScene !== scene) startMusic(scene);
    if (!sfxOn && !musicOn) {
      if (ctx.state === "running") ctx.suspend().catch(() => {});
    } else if (ctx.state === "suspended" && !globalThis.document?.hidden) {
      ctx.resume().catch?.(() => {});
    }
  }

  // ---------- Optional recorded audio ----------

  function loadFiles() {
    if (loadStarted || !fetchFile) return;
    loadStarted = true;
    for (const kind of ["sfx", "music"]) {
      for (const [name, url] of Object.entries(files[kind] || {})) {
        fetchFile(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => {
            buffers[kind][name] = buffer;
            // A recorded track for the scene now playing takes over from the synth.
            if (kind === "music" && name === playingScene && musicEnabled()) {
              stopMusic();
              startMusic(scene);
            }
          })
          .catch(() => { /* keep the synthesized fallback */ });
      }
    }
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
      const recorded = buffers.sfx[name];
      if (recorded) playBuffer(recorded, sfxBus, liveSfx, { rate: opts.pitch || 1 });
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

  function startMusic(which) {
    if (!ctx || !musicEnabled() || !which) return;
    stopMusic();
    playingScene = which;
    const recorded = buffers.music[which];
    if (recorded) {
      playBuffer(recorded, musicBus, liveMusic, { loop: true });
      return;
    }
    seed = which === "game" ? 7 : 3;
    step = 0;
    nextNoteAt = ctx.currentTime + 0.1;
    scheduleAmbience();
    scheduler = timers.setInterval?.(() => {
      if (ctx && ctx.state === "running") scheduleAmbience();
    }, TICK_MS);
  }

  function stopMusic() {
    if (scheduler !== null) timers.clearInterval?.(scheduler);
    scheduler = null;
    playingScene = null;
    if (ctx) stopAll(liveMusic);
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
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }

  /** Back in view: resume only if something is switched on. */
  function resume() {
    if (ctx && anyOn() && ctx.state === "suspended") ctx.resume().catch?.(() => {});
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
    /** For tests: how many sources are sounding on each bus. */
    get live() { return { sfx: liveSfx.size, music: liveMusic.size }; },
  };
}
