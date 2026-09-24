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
const REMOVE_MS = 320;         // match animation length (CSS .is-removing)
const WIN_DELAY_MS = 700;      // let the last pair finish before the win screen

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
export function createGameController({ elements, reducedMotion, onWin, onChange = () => {} }) {
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
        const covered = isCovered(layout.links, state.removed, index);
        say(covered ? `That ${name} is covered by another tile.` : `That ${name} is blocked on both sides.`, "warn");
        return;
      }
      case "selected":
        state = next;
        hint = null;
        say(`${name} selected — tap its twin.`);
        break;
      case "deselected":
        state = next;
        say(`${name} deselected.`);
        break;
      case "mismatch":
        state = next;
        hint = null;
        say(`${birdName(state.birds[previous])} and ${name} don't match. ${name} selected.`, "warn");
        // (selectTile resets the streak on a mismatch; nothing is deducted.)
        break;
      case "matched":
        state = next;
        hint = null;
        lockInput(reducedMotion() ? 120 : REMOVE_MS);
        view.animateRemoval([previous, index], reducedMotion() ? 0 : REMOVE_MS);
        say(matchMessage(name), "good");
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

  function afterMatch() {
    if (isWon(state)) {
      finished = true;
      stopClock();
      sync();
      say("Board cleared!", "good");
      setTimeout(() => onWin(summary()), reducedMotion() ? 150 : WIN_DELAY_MS);
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
    if (next !== state) {
      state = next;
      sync();
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
    sync();
    const back = before - state.score;
    say(back ? `Put the last pair back (score ${state.score.toLocaleString()}).` : "Put the last pair back.");
  }

  /** After a recovery action the panel is gone; send focus to the first free tile. */
  function focusBoard() {
    const first = elements.board.querySelector(".tile.is-free");
    if (first) first.focus({ preventScroll: true });
  }

  elements.hint.addEventListener("click", showHint);
  elements.undo.addEventListener("click", undoMove);
  elements.stuck.shuffle.addEventListener("click", shuffle);
  elements.stuck.restart.addEventListener("click", restart);
  elements.stuck.undo.addEventListener("click", undoMove);

  return {
    start,
    load,
    snapshot: () => (state && !finished ? snapshot() : null),
    restart,
    pause: stopClock,
    resume: startClock,
    /** Matches made on the current, unfinished board (New Game asks first). */
    hasProgress: () => !!state && !finished && state.history.length > 0,
    refresh: () => state && sync(),
    get state() { return state; },
    get view() { return view; },
    availableMatches: () => (state ? findMatches(state) : []),
  };
}
