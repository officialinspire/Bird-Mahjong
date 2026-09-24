// Recorded music: one controller for the game's two tracks.
//
//   Gentle Canopy  start screen, menus, pause
//   Forest Breeze  gameplay
//
// Why media elements: each track is ~3 minutes. Decoding one into an
// AudioBuffer costs over 60 MB of memory; an <audio> element streams it. Each
// element is routed through Web Audio (MediaElementSource → its own gain →
// the shared music bus), so the Music switch, its volume and instant mute
// (all on the bus, in js/ui/sound.js) apply exactly as for synthesized music.
//
// Seamless looping: each track has two "voices" (elements). Shortly before
// the playing voice ends, its twin starts from 0 and they overlap briefly
// (LOOP_OVERLAP), so there's never a gap — including the silent padding MP3
// encoders add at the end of a file.
//
// Crossfades: switching tracks ramps the new voice up and every other voice
// down over CROSSFADE seconds. Every fade starts from the voice's current
// level and cancels whatever was scheduled before, so rapid screen changes
// never stack tracks: at any moment one voice is heading up, the rest are
// heading to silence (and are paused once they get there). Going back to a
// track that is still fading out just turns it around: no restart.
//
// play() can be refused: NotAllowedError (no user gesture yet) is retried on
// the next gesture via retry(); anything else (unsupported, missing file,
// network) marks the track failed and calls onFallback(scene) so the caller
// can use the synthesized ambience instead.

export const CROSSFADE = 1.0;       // seconds (0.8–1.2 by design)
export const LOOP_OVERLAP = 0.35;   // seconds of overlap at the loop point
const WATCH_MS = 100;               // loop-point check interval
const SILENT = 0.0001;

export function createMusicController({
  tracks,                           // { menu: url, game: url }
  ctx,                              // AudioContext (already unlocked)
  bus,                              // the music bus GainNode
  onFallback = () => {},
  createAudio = (url) => new Audio(url),
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
}) {
  const voices = new Map();         // track url -> [voice, voice]
  const failed = new Set();         // urls that can't play
  let active = null;                // the voice heading to full volume
  const lastVoice = new Map();      // track url -> the voice that last played it
  let wantScene = null;             // scene requested (even if blocked)
  let blocked = false;              // play() refused for lack of a gesture
  let hidden = false;
  let watcher = null;

  // ---------- Voices ----------

  function makeVoice(url, n) {
    const el = createAudio(url);
    el.preload = "auto";
    el.loop = false; // looping is done by the twin voice (see header)
    const gain = ctx.createGain();
    gain.gain.value = SILENT;
    try {
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(bus);
    } catch {
      // No MediaElementSource: fall back to the element's own volume.
      gain.fallback = true;
    }
    const voice = { url, n, el, gain, level: 0, token: 0, playing: false };
    el.addEventListener("error", () => fail(url));
    // Safety net: if a voice ever reaches its end before the loop watcher
    // caught it (a long seek, throttled timers), loop right away.
    el.addEventListener("ended", () => {
      voice.playing = false;
      if (active === voice && !hidden) loopFrom(voice);
    });
    return voice;
  }

  function voicesFor(url) {
    if (!voices.has(url)) voices.set(url, [makeVoice(url, 0), makeVoice(url, 1)]);
    return voices.get(url);
  }

  /** Ramp a voice from wherever it is now to `target` over `seconds`. */
  function fadeTo(voice, target, seconds) {
    const token = ++voice.token;
    voice.level = target;
    const p = voice.gain.gain;
    const t = ctx.currentTime;
    if (voice.gain.fallback) {
      voice.el.volume = target; // best effort without Web Audio
    } else {
      // Hold the current value, drop anything scheduled, then ramp.
      if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(t);
      else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
      p.linearRampToValueAtTime(Math.max(target, SILENT), t + seconds);
    }
    if (target === 0) {
      // Pause once silent, unless another fade has taken over meanwhile.
      timers.setTimeout(() => {
        if (voice.token === token) pauseVoice(voice);
      }, seconds * 1000 + 60);
    }
  }

  function pauseVoice(voice) {
    voice.playing = false;
    try { voice.el.pause(); } catch { /* ignore */ }
  }

  /** Start (or keep) a voice playing; returns false if it can't. */
  function playVoice(voice, { fromStart = false } = {}) {
    if (failed.has(voice.url)) return false;
    if (fromStart) {
      try { voice.el.currentTime = 0; } catch { /* not seekable yet */ }
    }
    voice.playing = true;
    let result;
    try {
      result = voice.el.play();
    } catch (error) {
      handleRefusal(voice, error);
      return false;
    }
    if (result && typeof result.catch === "function") result.catch((error) => handleRefusal(voice, error));
    return true;
  }

  function handleRefusal(voice, error) {
    voice.playing = false;
    if (error && error.name === "NotAllowedError") {
      blocked = true; // try again on the next gesture (retry())
      return;
    }
    if (error && error.name === "AbortError") return; // superseded by pause(): harmless
    fail(voice.url);
  }

  function fail(url) {
    if (failed.has(url)) return;
    failed.add(url);
    for (const v of voices.get(url) || []) pauseVoice(v);
    const scene = Object.keys(tracks).find((s) => tracks[s] === url);
    if (active && active.url === url) active = null;
    if (scene && scene === wantScene) onFallback(scene);
  }

  // ---------- Looping ----------

  function watch() {
    if (watcher !== null) return;
    watcher = timers.setInterval(() => {
      if (!active || hidden || !active.playing) return;
      const { el } = active;
      const d = el.duration;
      if (!Number.isFinite(d) || d <= LOOP_OVERLAP * 2) return;
      if (d - el.currentTime <= LOOP_OVERLAP + WATCH_MS / 1000) loopFrom(active);
    }, WATCH_MS);
  }

  /** Hand over from a voice near (or at) its end to its twin, from the top. */
  function loopFrom(outgoing) {
    const [a, b] = voicesFor(outgoing.url);
    const twin = outgoing === a ? b : a;
    active = twin;
    lastVoice.set(twin.url, twin);
    playVoice(twin, { fromStart: true });
    fadeTo(twin, 1, LOOP_OVERLAP);
    fadeTo(outgoing, 0, LOOP_OVERLAP);
  }

  // ---------- Public ----------

  /** Can this scene use a recorded track? (false → use the synthesized one) */
  function has(scene) {
    return !!tracks[scene] && !failed.has(tracks[scene]);
  }

  /**
   * Go to a scene's track with a crossfade. Same track already heading up:
   * nothing happens. A track still fading out is turned around, not restarted.
   */
  function play(scene) {
    wantScene = scene;
    const url = tracks[scene];
    if (!url || failed.has(url)) {
      fadeAllOut();
      return false;
    }
    if (active && active.url === url && active.level === 1 && active.playing) return true; // no restart
    const [a, b] = voicesFor(url);
    // Prefer a voice of this track that is still sounding (fading out), then
    // the one that last played it (so it carries on from the same place).
    const target = [a, b].find((v) => v.playing) || lastVoice.get(url) || a;
    for (const list of voices.values()) {
      for (const v of list) if (v !== target && (v.playing || v.level > 0)) fadeTo(v, 0, CROSSFADE);
    }
    active = target;
    lastVoice.set(url, target);
    fadeTo(target, 1, CROSSFADE);
    if (!hidden && !target.playing) playVoice(target); // hidden: starts on resume()
    watch();
    return true;
  }

  function fadeAllOut() {
    for (const list of voices.values()) for (const v of list) if (v.playing || v.level > 0) fadeTo(v, 0, CROSSFADE);
    active = null;
  }

  /** Music switched off: silent now (the bus is already at 0), keep positions. */
  function stop() {
    wantScene = null;
    for (const list of voices.values()) {
      for (const v of list) {
        v.token++;
        v.level = 0;
        if (!v.gain.fallback) {
          const p = v.gain.gain;
          p.cancelScheduledValues(ctx.currentTime);
          p.setValueAtTime(SILENT, ctx.currentTime);
        }
        pauseVoice(v);
      }
    }
    active = null;
  }

  /** Tab hidden: pause the elements (keeping their place). */
  function suspend() {
    hidden = true;
    for (const list of voices.values()) for (const v of list) {
      if (v.playing) { v.resumeOnShow = true; try { v.el.pause(); } catch { /* ignore */ } }
    }
  }

  /** Tab visible again: carry on from the same place. */
  function resume() {
    hidden = false;
    for (const list of voices.values()) for (const v of list) {
      if (v.resumeOnShow) { v.resumeOnShow = false; if (v.level > 0) playVoice(v); else v.playing = false; }
    }
    if (active && !active.playing && active.level > 0) playVoice(active);
  }

  /** A new user gesture: retry anything the browser refused to autoplay. */
  function retry() {
    if (!blocked) return;
    blocked = false;
    if (active && !hidden && !failed.has(active.url)) playVoice(active);
  }

  return {
    has,
    play,
    stop,
    suspend,
    resume,
    retry,
    /** For tests and debugging. */
    get state() {
      const all = [...voices.values()].flat();
      return {
        active: active ? `${active.url}#${active.n}` : null,
        playing: all.filter((v) => v.playing).map((v) => `${v.url}#${v.n}`),
        heading: all.filter((v) => v.level > 0).map((v) => `${v.url}#${v.n}`),
        failed: [...failed],
        blocked,
        elements: all.length,
      };
    },
  };
}
