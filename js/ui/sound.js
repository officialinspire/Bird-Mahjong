// Lightweight, optional sounds: soft birdlike chirps and quiet UI ticks,
// synthesized with Web Audio. There are no audio files to download.
//
// Autoplay rules and courtesy both say: no sound before the player does
// something. The AudioContext is created only inside a user gesture (see
// unlock()), and only if Sound is on. With Sound off, nothing is created at
// all and every play() is a no-op, so the game is identical without it.

const SOUND_NAMES = ["select", "match", "mismatch", "blocked", "hint", "undo", "shuffle", "win"];

export function createSound({ enabled, volume }) {
  let ctx = null;
  let master = null;

  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;

  /** Call from a user gesture (pointerdown / keydown / click). */
  function unlock() {
    if (!enabled() || !AudioContextClass) return false;
    try {
      if (!ctx) {
        ctx = new AudioContextClass();
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      master.gain.value = masterLevel();
      return true;
    } catch {
      ctx = null; // audio unavailable: stay silent
      return false;
    }
  }

  const masterLevel = () => 0.5 * Math.max(0, Math.min(1, volume()));

  /**
   * One soft tone: frequency glides from f0 to f1 with a quick attack and a
   * gentle exponential release, so nothing clicks or blares.
   */
  function tone({ at = 0, f0, f1 = f0, dur = 0.08, type = "sine", peak = 0.12 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.015, dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A two-note chirp; `pitch` shifts it slightly so different birds vary. */
  const chirp = (at, pitch = 1) => {
    tone({ at, f0: 2300 * pitch, f1: 3300 * pitch, dur: 0.07, peak: 0.1 });
    tone({ at: at + 0.09, f0: 2600 * pitch, f1: 3700 * pitch, dur: 0.08, peak: 0.08 });
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

  /** Play a named sound if Sound is on and audio has been unlocked. */
  function play(name, opts = {}) {
    if (!enabled() || !ctx || !SOUNDS[name]) return false;
    try {
      if (ctx.state === "suspended") ctx.resume();
      master.gain.value = masterLevel();
      SOUNDS[name](opts);
      return true;
    } catch {
      return false;
    }
  }

  /** Stop everything quickly (e.g. when Sound is switched off). */
  function silence() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }

  return { unlock, play, silence, names: SOUND_NAMES, get started() { return !!ctx; } };
}
