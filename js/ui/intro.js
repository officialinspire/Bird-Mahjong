// The INSPIRE intro: Start → intro video → Main Menu, at most once per
// browser session.
//
// It must never trap the player. The intro ends (exactly once) on whichever
// comes first:
//   * the video ends
//   * Skip (the button, or Escape / Enter / Space)
//   * a playback error (missing file, unsupported format, network)
//   * play() being refused, even muted
//   * nothing playing within STALL_MS (a slow or stuck load)
//   * MAX_MS in total, whatever happens
//   * the tab being hidden
//
// The start tap that opens the intro can't also skip it: Skip is ignored for
// the first GUARD_MS, and held-key repeats are ignored.

export const GUARD_MS = 450;
export const STALL_MS = 4000;
export const MAX_MS = 15000;
const SESSION_KEY = "inspireBirdMahjong:introSeen";

function sessionStore() {
  try {
    const s = globalThis.sessionStorage;
    s.setItem(`${SESSION_KEY}:probe`, "1");
    s.removeItem(`${SESSION_KEY}:probe`);
    return s;
  } catch {
    return null; // blocked: remember in memory for this page only
  }
}

export function createIntro({
  video,
  skipButton,
  src,
  onDone,
  now = () => performance.now(),
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
  store = sessionStore(),
}) {
  let seen = false;       // memory fallback when sessionStorage is unavailable
  let active = false;
  let startedAt = 0;
  let stallTimer = null;
  let maxTimer = null;

  const alreadySeen = () => {
    if (seen) return true;
    try { return store?.getItem(SESSION_KEY) === "1"; } catch { return false; }
  };
  function markSeen() {
    seen = true;
    try { store?.setItem(SESSION_KEY, "1"); } catch { /* memory only */ }
  }

  function finish(reason) {
    if (!active) return false;
    active = false;
    timers.clearTimeout(stallTimer);
    timers.clearTimeout(maxTimer);
    try { video.pause(); } catch { /* ignore */ }
    onDone(reason);
    return true;
  }

  function attempt({ muted }) {
    video.muted = muted;
    let result;
    try {
      result = video.play();
    } catch (error) {
      refused(error, muted);
      return;
    }
    result?.catch?.((error) => refused(error, muted));
  }

  function refused(error, muted) {
    if (!active) return;
    if (error?.name === "AbortError") return; // superseded (e.g. by pause on finish)
    // Autoplay with sound refused: the brand moment still works silently.
    if (error?.name === "NotAllowedError" && !muted) attempt({ muted: true });
    else finish("failed");
  }

  video.addEventListener("ended", () => finish("ended"));
  video.addEventListener("error", () => finish("error"));
  skipButton.addEventListener("click", () => skip());

  /** Should Start go through the intro? */
  function pending() {
    return !alreadySeen();
  }

  /**
   * Begin the intro (call right after showing its screen). `muted` / `volume`
   * follow the Music setting. Returns false if it was already seen.
   */
  function play({ muted = false, volume = 1 } = {}) {
    if (active || alreadySeen()) return false;
    markSeen(); // counted as soon as it starts: a reload never replays it
    active = true;
    startedAt = now();
    try { video.volume = Math.max(0, Math.min(1, volume)); } catch { /* ignore */ }
    if (!video.getAttribute("src")) video.setAttribute("src", src); // fetched only when needed
    try { video.currentTime = 0; } catch { /* not seekable yet */ }
    stallTimer = timers.setTimeout(() => {
      if (video.paused || !(video.currentTime > 0)) finish("stalled");
    }, STALL_MS);
    maxTimer = timers.setTimeout(() => finish("timeout"), MAX_MS);
    attempt({ muted });
    return true;
  }

  /** Skip (button or key). Ignored right after the start tap that opened it. */
  function skip() {
    if (!active || now() - startedAt < GUARD_MS) return false;
    return finish("skipped");
  }

  return {
    pending,
    play,
    skip,
    /** End now, e.g. the tab was hidden. */
    finish: (reason = "interrupted") => finish(reason),
    get active() { return active; },
  };
}
