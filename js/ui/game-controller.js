// Connects the pure game logic (js/game) to the DOM board and game screen:
// taps → selectTile, state → board classes, stats, messages, timer, win.

import { BIRD_IDS } from "../game/birds.js";
import {
  createGame, findMatches, isStuck, isWon, selectTile, shuffleRemaining, tileIsFree,
  tilesLeft, undo, useHint,
} from "../game/game.js";
import { getLayout } from "../game/geometry.js";
import { isCovered } from "../game/rules.js";
import { computeScore } from "../game/score.js";
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

export function createGameController({ elements, reducedMotion, onWin }) {
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

  // Timer: accumulated ms plus the running segment, so pausing is exact.
  let elapsedMs = 0;
  let runningSince = null;
  let tick = null;

  const seconds = () => (elapsedMs + (runningSince ? performance.now() - runningSince : 0)) / 1000;

  function startClock() {
    if (runningSince || finished || !state) return;
    runningSince = performance.now();
    tick = setInterval(renderStats, 1000);
  }

  function stopClock() {
    if (!runningSince) return;
    elapsedMs += performance.now() - runningSince;
    runningSince = null;
    clearInterval(tick);
    renderStats();
  }

  // ---------- Rendering ----------

  function info(i) {
    const removed = state.removed[i];
    return { removed, free: !removed && tileIsFree(state, i), covered: isCovered(layout.links, state.removed, i) };
  }

  function sync() {
    view.sync(state, info, { hint });
    renderStats();
    elements.undo.disabled = state.history.length === 0 || finished;
    elements.hint.disabled = finished;
    elements.shuffle.disabled = finished;
    elements.shuffle.classList.toggle("btn--primary", !finished && isStuck(state));
  }

  function renderStats() {
    if (!state) return;
    elements.pairs.textContent = String(tilesLeft(state) / 2);
    elements.moves.textContent = String(state.moves);
    elements.time.textContent = formatTime(seconds());
  }

  function say(text, tone = "info") {
    elements.message.textContent = text;
    elements.message.dataset.tone = tone;
  }

  // ---------- Game flow ----------

  function start(difficulty, { seed } = {}) {
    layout = getLayout(difficulty.layout);
    state = createGame(difficulty.layout, seed === undefined ? {} : { seed });
    hint = null;
    finished = false;
    lockedUntil = 0;
    delete elements.board.dataset.locked;
    last = { index: -1, at: 0 };
    elapsedMs = 0;
    runningSince = null;
    clearInterval(tick);
    view.render(layout);
    sync();
    say("Tap a free bird, then its twin. Striped tiles are blocked.");
    startClock();
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
        break;
      case "matched":
        state = next;
        hint = null;
        lockInput(reducedMotion() ? 120 : REMOVE_MS);
        view.animateRemoval([previous, index], reducedMotion() ? 0 : REMOVE_MS);
        say(`Matched a pair of ${pluralName(name)}.`, "good");
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
    } else if (isStuck(state)) {
      say("No free pairs left — tap Shuffle to re-deal.", "warn");
    }
  }

  function pluralName(name) {
    if (name.endsWith("Goose")) return name.replace(/Goose$/, "Geese");
    if (name.endsWith("mouse")) return name.replace(/mouse$/, "mice");
    return `${name}s`;
  }

  function summary() {
    const secs = Math.floor(seconds());
    const pairs = layout.positions.length / 2;
    return {
      seconds: secs,
      time: formatTime(secs),
      moves: state.moves,
      hintsUsed: state.hintsUsed,
      shuffles: state.shuffles,
      mismatches: state.mismatches,
      score: computeScore({ pairs, seconds: secs, hintsUsed: state.hintsUsed, shuffles: state.shuffles, mismatches: state.mismatches }),
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
    } else {
      say("No free pairs — tap Shuffle to re-deal.", "warn");
    }
    sync();
  }

  function shuffle() {
    if (!state || finished) return;
    const next = shuffleRemaining(state);
    hint = null;
    if (next.shuffles === state.shuffles) {
      // No deal can clear what's left (e.g. two tiles stacked on each other).
      say("No re-deal can clear these tiles — use Undo or start a new board.", "warn");
    } else {
      state = next;
      say("Re-dealt the remaining tiles — still solvable.");
    }
    sync();
  }

  function undoMove() {
    if (!state || finished || state.history.length === 0) return;
    state = undo(state);
    hint = null;
    say("Took back the last pair.");
    sync();
  }

  elements.hint.addEventListener("click", showHint);
  elements.shuffle.addEventListener("click", shuffle);
  elements.undo.addEventListener("click", undoMove);

  return {
    start,
    pause: stopClock,
    resume: startClock,
    refresh: () => state && sync(),
    get state() { return state; },
    get view() { return view; },
    availableMatches: () => (state ? findMatches(state) : []),
  };
}
