// Connects the pure game logic (js/game) to the DOM board and game screen:
// taps → selectTile, state → board classes, stats, messages, win.
// Elapsed time is measured (paused while the game is paused) but never shown
// during play or used in scoring — it appears only as a personal stat on the
// results screen.

import { BIRD_IDS } from "../game/birds.js";
import {
  createGame, findMatches, isWon, recoveryFor, restartBoard, selectTile, shuffleRemaining,
  tileIsFree, tilesLeft, undo, useHint,
} from "../game/game.js";
import { getLayout } from "../game/geometry.js";
import { isCovered } from "../game/rules.js";
import { birdName } from "./bird-names.js";
import { createBoardView } from "./board-view.js";

const DOUBLE_TAP_MS = 350;     // same tile again this soon = accidental double tap
const REMOVE_MS = 280;         // match lift/fade length (CSS .is-removing)
const QUICK_GUARD_MS = 120;    // reduced motion: only a tap-through guard, no animation wait
const CELEBRATE_MS = 1500;     // restrained board-clear moment before results (animations on)
const QUIET_WIN_MS = 250;      // with animations off: just let the last pair go

const fileFor = (bird) => `${String(BIRD_IDS.indexOf(bird) + 1).padStart(2, "0")}-${bird}`;

const formatTime = (seconds) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * `onChange(snapshot)` runs after every change to the board (match, undo,
 * selection, hint, shuffle, restart) while a game is in progress, so the app
 * can autosave. `snapshot` is { state, elapsedMs }.
 */
export function createGameController({ elements, reducedMotion, onWin, onWon = () => {}, onChange = () => {}, sound = null }) {
  const play = (name, opts) => sound?.play(name, opts);
  const view = createBoardView({
    viewport: elements.viewport,
    surface: elements.board,
    zoomControls: elements.zoom,
    tileFile: fileFor,
    onActivate: activate,
  });

  let state = null;
  let layout = null;
  let hint = null;
  let lockedUntil = 0;
  let last = { index: -1, at: 0 };
  let finished = false;
  let winTimer = null;           // board-clear moment -> results

  // Clock: accumulated ms plus the running segment, so pausing is exact.
  let elapsedMs = 0;
  let runningSince = null;

  const seconds = () => (elapsedMs + (runningSince ? performance.now() - runningSince : 0)) / 1000;

  function startClock() {
    if (runningSince || finished || !state) return;
    runningSince = performance.now();
  }

  function stopClock() {
    if (!runningSince) return;
    elapsedMs += performance.now() - runningSince;
    runningSince = null;
  }

  // ---------- Rendering ----------

  function info(i) {
    const removed = state.removed[i];
    return { removed, free: !removed && tileIsFree(state, i), covered: isCovered(layout.links, state.removed, i) };
  }

  // Recovery is recomputed only when the state object changes (the rescue
  // check runs a search, so skip it on selection-only redraws of the same state).
  let recoveryCache = { state: null, value: "none" };
  function recovery() {
    if (finished || !state) return "none";
    if (recoveryCache.state !== state) recoveryCache = { state, value: recoveryFor(state) };
    return recoveryCache.value;
  }

  function sync() {
    if (!finished) onChange(snapshot());
    view.sync(state, info, { hint });
    renderStats();
    const noHistory = state.history.length === 0 || finished;
    elements.undo.disabled = noHistory;
    elements.hint.disabled = finished;
    renderStuck(recovery(), noHistory);
  }

  /** The friendly "no pairs left" panel: Shuffle when it can help, else Restart. */
  function renderStuck(kind, noHistory) {
    const { panel, title, text, shuffle, restart, undo: undoButton } = elements.stuck;
    const wasHidden = panel.hidden;
    panel.hidden = kind === "none";
    elements.boardArea.classList.toggle("is-stuck", kind !== "none");
    if (kind === "none") return;
    const canShuffle = kind === "shuffle";
    shuffle.hidden = !canShuffle;
    restart.hidden = canShuffle;
    undoButton.disabled = noHistory;
    title.textContent = canShuffle ? "No matching pairs left" : "These tiles can't all be cleared";
    text.textContent = canShuffle
      ? "Shuffle re-deals the remaining birds so there's always a way to finish. Your score stays."
      : "No shuffle can clear what's left. Restart this board from the beginning, or undo a pair or two.";
    say(canShuffle ? "No matching pairs left — try a shuffle." : "No shuffle can clear these tiles.", "warn");
    // Move focus to the offer when it first appears, for keyboard and screen-reader users.
    if (wasHidden) (canShuffle ? shuffle : restart).focus({ preventScroll: true });
  }

  function renderStats() {
    if (!state) return;
    elements.pairs.textContent = String(tilesLeft(state) / 2);
    elements.score.textContent = state.score.toLocaleString();
    elements.streak.textContent = state.streak > 1 ? `×${state.streak}` : "—";
  }

  function say(text, tone = "info") {
    elements.message.textContent = text;
    elements.message.dataset.tone = tone;
  }

  // ---------- Game flow ----------

  function start(difficulty, { seed, streakBonus = true } = {}) {
    const options = { streakBonus };
    if (seed !== undefined) options.seed = seed;
    if (difficulty.birdPool) options.birdPool = difficulty.birdPool;
    begin(createGame(difficulty.layout, options), 0);
    say("Tap a free bird, then its twin. Striped tiles are blocked.");
  }

  /** Pick up a saved board exactly where it was left (see js/saved-game.js). */
  function load(savedState, savedElapsedMs) {
    begin(savedState, savedElapsedMs);
    const pairs = tilesLeft(state) / 2;
    if (!elements.stuck.panel.hidden) return; // the stuck offer already explains
    say(`Welcome back — ${pairs} pair${pairs === 1 ? "" : "s"} to go.`);
  }

  function begin(nextState, startMs) {
    clearTimeout(winTimer); // an older board's win can't land on this one
    winTimer = null;
    view.clearEffects();
    state = nextState;
    layout = getLayout(state.layoutId);
    hint = null;
    finished = false;
    lockedUntil = 0;
    delete elements.board.dataset.locked;
    last = { index: -1, at: 0 };
    elapsedMs = startMs;
    runningSince = null;
    recoveryCache = { state: null, value: "none" };
    view.render(layout);
    sync();
    startClock();
  }

  function snapshot() {
    return { state, elapsedMs: Math.round(seconds() * 1000) };
  }

  function activate(index) {
    if (!state || finished) return;
    const now = performance.now();
    if (now < lockedUntil) return;
    // A quick second tap on the same tile is almost always a double tap, not
    // a deliberate deselect — ignore it.
    if (index === last.index && now - last.at < DOUBLE_TAP_MS) return;
    last = { index, at: now };

    const previous = state.selected;
    const { state: next, result } = selectTile(state, index);
    const name = birdName(state.birds[index]);

    switch (result) {
      case "blocked": {
        view.nudge(index);
        play("blocked");
        const covered = isCovered(layout.links, state.removed, index);
        say(covered ? `That ${name} is covered by another tile.` : `That ${name} is blocked on both sides.`, "warn");
        return;
      }
      case "selected":
        state = next;
        hint = null;
        say(`${name} selected — tap its twin.`);
        play("select");
        break;
      case "deselected":
        state = next;
        say(`${name} deselected.`);
        play("select");
        break;
      case "mismatch":
        state = next;
        hint = null;
        say(`${birdName(state.birds[previous])} and ${name} don't match. ${name} selected.`, "warn");
        // (selectTile resets the streak on a mismatch; nothing is deducted.)
        play("mismatch");
        break;
      case "matched":
        state = next;
        hint = null;
        // Taps wait until the lift/fade is over, so a tile it uncovers can't
        // be tapped while the old one is still on top of it. With reduced
        // motion the pair goes at once and only a brief tap-through guard
        // stays (a quick double tap mustn't land on the tile underneath).
        lockInput(reducedMotion() ? QUICK_GUARD_MS : REMOVE_MS);
        view.animateRemoval([previous, index], reducedMotion() ? 0 : REMOVE_MS);
        if (!reducedMotion()) view.floatScore(index, `+${state.gains.at(-1).points}`);
        say(matchMessage(name), "good");
        // The bird's own call if it has an approved clip, otherwise a chirp
        // pitched slightly per bird so repeated matches don't drone.
        play("match", { bird: state.birds[index], pitch: 0.9 + (BIRD_IDS.indexOf(state.birds[index]) % 5) * 0.05 });
        break;
      default:
        return;
    }
    sync();
    if (result === "matched") afterMatch();
  }

  // Briefly ignore taps after a match so a quick extra tap can't land on the
  // tile that was underneath. data-locked exposes this to CSS and tests.
  let unlockTimer = null;
  function lockInput(ms) {
    lockedUntil = performance.now() + ms;
    elements.board.dataset.locked = "true";
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => delete elements.board.dataset.locked, ms);
  }

  /** The fade was settled (Undo, Restart, Shuffle): taps are welcome again. */
  function unlockInput() {
    lockedUntil = 0;
    clearTimeout(unlockTimer);
    delete elements.board.dataset.locked;
  }

  function afterMatch() {
    if (isWon(state)) {
      finished = true;
      stopClock();
      sync();
      say("Board cleared! Well flown.", "good");
      play("win");
      // Record the win now: closing or reloading during the short board-clear
      // moment must not lose it. The results screen follows the celebration.
      const result = summary();
      onWon(result);
      const deliver = () => { winTimer = null; view.clearEffects(); onWin(result); };
      if (reducedMotion()) {
        winTimer = setTimeout(deliver, QUIET_WIN_MS);
      } else {
        view.celebrate(CELEBRATE_MS);
        winTimer = setTimeout(deliver, CELEBRATE_MS);
      }
    }
    // A stuck board is picked up by sync() → renderStuck().
  }

  function matchMessage(name) {
    const gain = state.gains[state.gains.length - 1];
    const streakNote = state.streakBonus && state.streak > 1 ? ` · streak ×${state.streak}` : "";
    return `Matched a pair of ${pluralName(name)} · +${gain.points}${streakNote}`;
  }

  function pluralName(name) {
    if (name.endsWith("Goose")) return name.replace(/Goose$/, "Geese");
    if (name.endsWith("mouse")) return name.replace(/mouse$/, "mice");
    return `${name}s`;
  }

  function summary() {
    const secs = Math.floor(seconds());
    return {
      seconds: secs,
      time: formatTime(secs),
      pairs: layout.positions.length / 2,
      moves: state.moves,
      score: state.score,
      bestStreak: state.bestStreak,
      streakBonus: state.streakBonus,
      hintsUsed: state.hintsUsed,
      shuffles: state.shuffles,
      mismatches: state.mismatches,
    };
  }

  function showHint() {
    if (!state || finished) return;
    const result = useHint(state);
    state = result.state;
    hint = result.pair;
    if (hint) {
      play("hint");
      say(`Hint: the two ${pluralName(birdName(state.birds[hint[0]]))} marked “?” match.`);
      view.tileElement(hint[0]).scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    // No pair at all: sync() shows the stuck panel and says so.
    sync();
  }

  function shuffle() {
    if (!state || finished) return;
    const next = shuffleRemaining(state);
    hint = null;
    view.clearEffects(); // a fading tile must not change bird mid-fade
    unlockInput();
    if (next !== state) {
      state = next;
      sync();
      play("shuffle");
      say("Shuffled! There's a way to finish from here — Hint will show it.", "good");
      focusBoard();
    } else {
      sync(); // shuffle couldn't help; the panel switches to Restart Board
    }
  }

  function restart() {
    if (!state || finished) return;
    state = restartBoard(state);
    hint = null;
    view.clearEffects();
    unlockInput();
    elapsedMs = 0;
    runningSince = null;
    startClock();
    sync();
    say("Back to the start of this board.");
    focusBoard();
  }

  function undoMove() {
    if (!state || finished || state.history.length === 0) return;
    const before = state.score;
    state = undo(state);
    hint = null;
    view.clearEffects(); // no "+120" or sparkle for a pair that's back
    unlockInput();       // …and the restored tiles can be tapped straight away
    sync();
    play("undo");
    const back = before - state.score;
    say(back ? `Put the last pair back (score ${state.score.toLocaleString()}).` : "Put the last pair back.");
  }

  /** After a recovery action the panel is gone; send focus back to the board. */
  function focusBoard() {
    view.focusBoard();
  }

  elements.hint.addEventListener("click", showHint);
  elements.undo.addEventListener("click", undoMove);
  elements.stuck.shuffle.addEventListener("click", shuffle);
  elements.stuck.restart.addEventListener("click", restart);
  elements.stuck.undo.addEventListener("click", undoMove);

  return {
    start,
    load,
    showHint,
    undo: undoMove,
    snapshot: () => (state && !finished ? snapshot() : null),
    restart,
    pause: stopClock,
    /** Leaving the game screen: settle every animation and decoration now. */
    settle: () => view.clearEffects(),
    /** The board-clear moment is playing (results follow by themselves). */
    get finishing() { return winTimer !== null; },
    resume: startClock,
    /** Matches made on the current, unfinished board (New Game asks first). */
    hasProgress: () => !!state && !finished && state.history.length > 0,
    refresh: () => state && sync(),
    get state() { return state; },
    get view() { return view; },
    availableMatches: () => (state ? findMatches(state) : []),
  };
}
