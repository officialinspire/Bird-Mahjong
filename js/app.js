// Bird Mahjong app shell: screen flow, settings and background.
// Flow: Start → INSPIRE intro (once per browser session) → Main menu →
// Difficulty → Game → Results, plus How to Play and Settings off the menu. Gameplay lives in js/ui/game-controller.js on
// top of the pure logic in js/game/.

import { AUDIO_FILES, DIFFICULTIES, SMALL_TILE_DIR, difficultyById } from "./config.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { renderBackground } from "./background.js";
import { SCORING } from "./game/score.js";
import { createBestScores } from "./best-scores.js";
import { createSavedGame } from "./saved-game.js";
import { openStorage } from "./storage.js";
import { tilesLeft } from "./game/game.js";
import { createGameController } from "./ui/game-controller.js";
import { createSound } from "./ui/sound.js";
import { createIntro } from "./ui/intro.js";
import { setupPwa } from "./pwa.js";

const $ = (selector) => document.querySelector(selector);

// Settings, best scores and the autosaved board all share one storage. If
// localStorage is blocked or broken this is a session-only stand-in, and the
// Settings screen says so.
const { storage, persistent } = openStorage();
const bests = createBestScores(storage);
const saved = createSavedGame(storage);

const state = {
  screen: "start",
  difficulty: DIFFICULTIES[0].id,
  settings: loadSettings(storage),
};

// ---------- Screens ----------

function showScreen(name) {
  const next = document.getElementById(`screen-${name}`);
  if (!next) return;
  if (name === "difficulty") renderDifficulties(); // fresh best scores
  const leaving = state.screen;
  state.screen = name; // set first: closing the pause dialog checks it
  for (const dialog of ["#pause-dialog", "#new-game-dialog"]) if ($(dialog).open) $(dialog).close();
  if (leaving === "game" && name !== "game") {
    game.pause();
    game.settle(); // no animation or sparkle survives a screen change
    autosave(); // keep the paused clock
  }
  if (name === "menu") renderContinue();

  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen === next;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  document.body.dataset.screen = name;
  sound.setScene(musicSceneFor(name));
  window.scrollTo(0, 0);
  // Move focus to the new screen so keyboard and screen-reader users land
  // at its heading rather than on a now-hidden button.
  next.focus({ preventScroll: true });
}

// The intro starts from the Start tap/key, which is also the gesture that
// lets its video (and later the music) play. It ends by itself on end,
// Skip, failure, a stall or a hidden tab; see js/ui/intro.js.
const intro = createIntro({
  video: $("#intro-video"),
  skipButton: $("#btn-skip-intro"),
  src: "inspiresoftwareintro.mp4",
  onDone: () => { if (state.screen === "intro") showScreen("menu"); },
});

function leaveStart() {
  if (state.screen !== "start") return; // only the first tap/key counts
  if (!intro.pending()) {
    showScreen("menu");
    return;
  }
  showScreen("intro");
  intro.play({ muted: !state.settings.music, volume: state.settings.musicVolume });
}

// ---------- Difficulty ----------

function renderDifficulties() {
  const list = $("#difficulty-list");
  list.replaceChildren(
    ...DIFFICULTIES.map((d) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "difficulty-option";
      button.dataset.difficulty = d.id;

      const icon = document.createElement("img");
      icon.src = `${SMALL_TILE_DIR}${d.icon}.webp`;
      icon.alt = "";
      icon.width = 120;
      icon.height = 154;

      const title = document.createElement("strong");
      title.textContent = d.name;
      const habitat = document.createElement("small");
      habitat.textContent = d.habitat;
      title.append(habitat);

      const detail = document.createElement("span");
      detail.textContent = `${d.tiles} tiles · ${d.birds} birds`;

      const best = document.createElement("span");
      best.className = "difficulty-best";
      const record = bests.get(d.id);
      best.textContent = record
        ? `Best score ${record.score.toLocaleString()} · ${record.games} cleared`
        : "Not cleared yet";

      button.append(icon, title, detail, best);
      li.append(button);
      return li;
    })
  );
}

// ---------- Game ----------

const media = window.matchMedia("(prefers-reduced-motion: reduce)");

function reducedMotion() {
  const { motion } = state.settings;
  return motion === "reduce" || (motion === "system" && media.matches);
}

// Audio is created lazily inside the first user gesture (see the bottom of
// this file). Music and Sound effects have separate switches and volumes.
const sound = createSound({
  enabled: () => state.settings.sfx,
  volume: () => state.settings.sfxVolume,
  musicEnabled: () => state.settings.music,
  musicVolume: () => state.settings.musicVolume,
  files: AUDIO_FILES,
});

const game = createGameController({
  sound,
  elements: {
    viewport: $("#board-viewport"),
    board: $("#board"),
    message: $("#game-message"),
    pairs: $("#stat-pairs"),
    score: $("#stat-score"),
    streak: $("#stat-streak"),
    hint: $("#btn-hint"),
    undo: $("#btn-undo"),
    boardArea: $("#board-area"),
    stuck: {
      panel: $("#stuck-panel"),
      title: $("#stuck-title"),
      text: $("#stuck-text"),
      shuffle: $("#btn-stuck-shuffle"),
      restart: $("#btn-stuck-restart"),
      undo: $("#btn-stuck-undo"),
    },
    zoom: {
      root: $("#zoom-controls"),
      in: $("#btn-zoom-in"),
      out: $("#btn-zoom-out"),
      fit: $("#btn-zoom-fit"),
    },
  },
  reducedMotion,
  onWon: recordWin,
  onWin: showResults,
  onChange: (snap) => saved.save({ difficultyId: state.difficulty, ...snap }),
});

// `?seed=123` replays a specific first board (handy for sharing and tests).
let pendingSeed = (() => {
  const raw = new URLSearchParams(location.search).get("seed");
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
})();

function startGame(difficultyId) {
  const d = difficultyById(difficultyId);
  state.difficulty = d.id;
  $("#game-difficulty").textContent = `${d.name} · ${d.habitat}`;
  // Show the screen first so the board can measure its viewport.
  showScreen("game");
  game.start(d, { seed: pendingSeed, streakBonus: state.settings.streakBonus });
  pendingSeed = undefined;
}

// ---------- Autosave and Continue ----------

/** Save the board in progress right now (e.g. before the page goes away). */
function autosave() {
  const snap = game.snapshot();
  if (snap) saved.save({ difficultyId: state.difficulty, ...snap });
}

/** Enable Continue only for a valid save, and say what it will resume. */
function renderContinue() {
  const save = saved.load();
  const button = $("#btn-continue");
  button.disabled = !save;
  if (save) {
    const d = difficultyById(save.difficultyId);
    const pairs = tilesLeft(save.state) / 2;
    $("#continue-detail").textContent = `${d.name} · ${pairs} pair${pairs === 1 ? "" : "s"} left · ${save.state.score.toLocaleString()} pts`;
    button.removeAttribute("title");
  } else {
    $("#continue-detail").textContent = "";
    button.title = "No saved game yet";
  }
  $("#difficulty-replace-note").hidden = !save;
}

function continueGame() {
  const save = saved.load();
  if (!save) {
    renderContinue(); // the save vanished or was corrupt
    return;
  }
  const d = difficultyById(save.difficultyId);
  state.difficulty = d.id;
  $("#game-difficulty").textContent = `${d.name} · ${d.habitat}`;
  showScreen("game");
  game.load(save.state, save.elapsedMs);
}

/**
 * The board was just cleared: record it straight away (the results screen
 * follows the short celebration, and the page may be closed before then).
 */
let recorded = null;
function recordWin(summary) {
  saved.clear(); // a finished board isn't something to continue
  recorded = { summary, record: bests.record(state.difficulty, summary) };
}

function showResults(summary) {
  if (recorded?.summary !== summary) recordWin(summary);
  const d = difficultyById(state.difficulty);
  $("#results-difficulty").textContent = `${d.name} · ${d.habitat}`;
  const { isNewBest, isNewBestTime, previous, best } = recorded.record;
  recorded = null;
  $("#result-score").textContent = summary.score.toLocaleString();
  $("#result-best").textContent = !previous
    ? `First ${d.name} clear — that's your best score so far.`
    : isNewBest
      ? `New best score for ${d.name}! (was ${previous.score.toLocaleString()})`
      : `Your best on ${d.name}: ${best.score.toLocaleString()}`;
  $("#result-best").dataset.newBest = isNewBest ? "true" : "false";
  $("#result-pairs").textContent = String(summary.pairs);
  $("#result-streak").textContent = summary.bestStreak > 1 ? `×${summary.bestStreak}` : "—";
  $("#result-time").textContent = summary.time;
  $("#result-fastest").textContent = formatSeconds(best.bestTime);
  $("#results-note").textContent =
    `Time is just for you — it never affects your score.${isNewBestTime && previous ? " That's your fastest yet." : ""}`;
  $("#result-cleared").textContent = `${d.name} boards cleared: ${best.games}`;
  showScreen("results");
}

function formatSeconds(total) {
  if (total === null || total === undefined) return "—";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function anyDialogOpen() {
  return $("#pause-dialog").open || $("#new-game-dialog").open;
}

/**
 * Gentle Canopy everywhere except active play (so also while paused). No
 * music under the intro video, nor on Start when the intro comes next (so
 * the first tap doesn't start a track only to cut it).
 */
function musicSceneFor(screen) {
  if (screen === "intro" || (screen === "start" && intro.pending())) return null;
  return screen === "game" && !anyDialogOpen() ? "game" : "menu";
}

function openPause() {
  // Not during the board-clear moment: results follow by themselves.
  if (state.screen !== "game" || anyDialogOpen() || game.finishing) return;
  game.pause();
  autosave();
  sound.setScene("menu");
  $("#pause-dialog").showModal();
}

/** New Game from the toolbar: ask first if there's progress to lose. */
function requestNewGame() {
  if (state.screen !== "game" || anyDialogOpen() || game.finishing) return;
  if (!game.hasProgress()) {
    startGame(state.difficulty);
    return;
  }
  game.pause();
  $("#new-game-dialog").returnValue = "";
  $("#new-game-dialog").showModal();
  sound.setScene("menu");
  $("#btn-new-game-cancel").focus(); // the safe choice is the default
}

// ---------- Settings ----------

function applySettings() {
  const { motion, backgroundBirds, tileLabels } = state.settings;
  document.documentElement.dataset.motion = motion;
  document.documentElement.dataset.tileLabels = tileLabels ? "on" : "off";
  document.documentElement.classList.toggle("reduce-motion", reducedMotion());
  $("#sky-tiles").hidden = !backgroundBirds;
}

function syncSettingsForm() {
  const form = $("#settings-form");
  form.elements.motion.value = state.settings.motion;
  form.elements.backgroundBirds.checked = state.settings.backgroundBirds;
  form.elements.tileLabels.checked = state.settings.tileLabels;
  form.elements.streakBonus.checked = state.settings.streakBonus;
  form.elements.music.checked = state.settings.music;
  form.elements.musicVolume.value = String(Math.round(state.settings.musicVolume * 100));
  form.elements.musicVolume.disabled = !state.settings.music;
  form.elements.sfx.checked = state.settings.sfx;
  form.elements.sfxVolume.value = String(Math.round(state.settings.sfxVolume * 100));
  form.elements.sfxVolume.disabled = !state.settings.sfx;
}

/** Read the settings form (same shape as DEFAULT_SETTINGS). */
function readSettingsForm() {
  const form = $("#settings-form");
  return {
    motion: form.elements.motion.value,
    backgroundBirds: form.elements.backgroundBirds.checked,
    tileLabels: form.elements.tileLabels.checked,
    streakBonus: form.elements.streakBonus.checked,
    music: form.elements.music.checked,
    musicVolume: Number(form.elements.musicVolume.value) / 100,
    sfx: form.elements.sfx.checked,
    sfxVolume: Number(form.elements.sfxVolume.value) / 100,
  };
}

/** Volume sliders act live while dragging; the value is saved on "change". */
function onVolumeInput(event) {
  if (!["musicVolume", "sfxVolume"].includes(event.target.name)) return;
  state.settings = readSettingsForm();
  sound.apply();
}

function onSettingsChange(event) {
  const form = $("#settings-form");
  const wasSfx = state.settings.sfx;
  state.settings = readSettingsForm();
  form.elements.musicVolume.disabled = !state.settings.music;
  form.elements.sfxVolume.disabled = !state.settings.sfx;
  saveSettings(state.settings, storage);
  applySettings();
  game.refresh();
  // This change is itself a user gesture, so audio may start here. Muting
  // takes effect immediately inside apply().
  sound.unlock();
  sound.apply();
  // Turning effects on, or setting their volume, plays a sample chirp.
  if (state.settings.sfx && (!wasSfx || event?.target?.name === "sfxVolume")) sound.play("match");
}

function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  saveSettings(state.settings, storage);
  syncSettingsForm();
  applySettings();
  game.refresh();
  sound.unlock(); // a click: allowed to start audio
  sound.apply();
}

// ---------- Events ----------

/** H = hint, U or Ctrl/⌘+Z = undo while playing (not while typing in a field). */
function onGameShortcut(event) {
  if (event.target.closest?.("input, select, textarea")) return false;
  const key = event.key.toLowerCase();
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  if (plain && key === "h") {
    event.preventDefault();
    game.showHint();
    return true;
  }
  if ((plain && key === "u") || ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === "z")) {
    event.preventDefault();
    game.undo();
    return true;
  }
  return false;
}

function onKeydown(event) {
  if (state.screen === "intro") {
    // Skip with Escape, Enter or Space; a held key's repeats don't count.
    if (!event.repeat && ["Escape", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      intro.skip();
    }
    return;
  }
  if (state.screen === "start") {
    if (event.repeat) return;
    if (event.key === "Tab" || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    leaveStart();
    return;
  }
  if (state.screen === "game" && !anyDialogOpen() && onGameShortcut(event)) return;
  if (event.key !== "Escape") return;
  if (state.screen === "game") {
    // The open dialog handles its own Escape (closing = resume).
    if (!anyDialogOpen()) {
      event.preventDefault();
      openPause();
    }
  } else if (state.screen !== "menu") {
    showScreen("menu");
  }
}

function bindEvents() {
  $("#screen-start").addEventListener("click", leaveStart);
  document.addEventListener("keydown", onKeydown);

  document.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) showScreen(go.dataset.go);

    const option = event.target.closest("[data-difficulty]");
    if (option) startGame(option.dataset.difficulty);
  });

  $("#btn-pause").addEventListener("click", openPause);
  // The ☰ button pauses rather than leaving, so a stray tap can't end a game.
  $("#btn-game-menu").addEventListener("click", openPause);
  $("#pause-dialog").addEventListener("close", () => {
    if (state.screen === "game") game.resume();
    sound.setScene(musicSceneFor(state.screen));
  });
  $("#btn-pause-restart").addEventListener("click", () => {
    $("#pause-dialog").close();
    game.restart();
  });
  $("#btn-pause-new").addEventListener("click", () => {
    $("#pause-dialog").close();
    startGame(state.difficulty);
  });
  $("#btn-game-new").addEventListener("click", requestNewGame);
  $("#new-game-dialog").addEventListener("close", () => {
    sound.setScene(musicSceneFor(state.screen));
    if (state.screen !== "game") return;
    if ($("#new-game-dialog").returnValue === "new") startGame(state.difficulty);
    else game.resume();
  });
  $("#btn-pause-menu").addEventListener("click", () => showScreen("menu"));
  $("#btn-play-again").addEventListener("click", () => startGame(state.difficulty));

  // Leaving the tab or app pauses the game (and its clock) and saves it;
  // pagehide also covers closing the tab or reloading.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      intro.finish("hidden"); // no intro playing in a background tab
      openPause();
      autosave();
      sound.suspend(); // no audio from a background tab
    } else {
      sound.resume();
    }
  });
  $("#settings-form").addEventListener("input", onVolumeInput);
  window.addEventListener("pagehide", autosave);
  $("#btn-continue").addEventListener("click", continueGame);
  media.addEventListener("change", applySettings);

  $("#settings-form").addEventListener("change", onSettingsChange);
  $("#btn-reset-settings").addEventListener("click", resetSettings);

  // Re-lay the background when crossing a breakpoint so tile density fits.
  let lastWidthBand = widthBand();
  window.addEventListener("resize", () => {
    const band = widthBand();
    if (band !== lastWidthBand) {
      lastWidthBand = band;
      renderBackground($("#sky-tiles"));
    }
  });
}

function widthBand() {
  const w = window.innerWidth;
  return w >= 1024 ? "desktop" : w >= 700 ? "tablet" : "mobile";
}

// ---------- Boot ----------

function renderScoring() {
  const s = SCORING;
  $("#scoring-text").textContent =
    `${s.perPair} points for every pair. Match pairs in a row without a mismatch for a small streak bonus: ` +
    `+${s.streakStep} for the second in a row, +${s.streakStep * 2} for the third, up to +${s.streakCap} a pair ` +
    `(you can turn this off in Settings). Time, hints and shuffles never cost points; Undo just takes back ` +
    `that pair's points until you match it again.`;
}

renderDifficulties();
renderScoring();
renderContinue();
$("#storage-note").hidden = persistent;

// Offline + install. Before an update reloads the page, save the board.
setupPwa({
  banner: $("#update-banner"),
  refreshButton: $("#btn-update-refresh"),
  laterButton: $("#btn-update-later"),
  installButton: $("#btn-install"),
  beforeReload: autosave,
});

// Audio may only start after the player does something. Every tap or key
// press (re)unlocks it; with Music and Sound effects both off, unlock() does
// nothing at all.
for (const type of ["pointerdown", "keydown"]) {
  document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
syncSettingsForm();
applySettings();
renderBackground($("#sky-tiles"));
bindEvents();
