// Bird Mahjong app shell: screen flow, settings and background.
// Flow: Start → Main menu → Difficulty → Game → Results, plus How to Play
// and Settings off the menu. Gameplay lives in js/ui/game-controller.js on
// top of the pure logic in js/game/.

import { DIFFICULTIES, SMALL_TILE_DIR, difficultyById } from "./config.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { renderBackground } from "./background.js";
import { SCORING } from "./game/score.js";
import { createBestScores } from "./best-scores.js";
import { createGameController } from "./ui/game-controller.js";

const $ = (selector) => document.querySelector(selector);

const state = {
  screen: "start",
  difficulty: DIFFICULTIES[0].id,
  settings: loadSettings(),
};

// ---------- Screens ----------

function showScreen(name) {
  const next = document.getElementById(`screen-${name}`);
  if (!next) return;
  if (name === "difficulty") renderDifficulties(); // fresh best scores
  const leaving = state.screen;
  state.screen = name; // set first: closing the pause dialog checks it
  if ($("#pause-dialog").open) $("#pause-dialog").close();
  if (leaving === "game" && name !== "game") game.pause();

  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen === next;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  // Move focus to the new screen so keyboard and screen-reader users land
  // at its heading rather than on a now-hidden button.
  next.focus({ preventScroll: true });
}

function leaveStart() {
  if (state.screen === "start") showScreen("menu");
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
      best.textContent = record ? `Best score ${record.score.toLocaleString()}` : "Not cleared yet";

      button.append(icon, title, detail, best);
      li.append(button);
      return li;
    })
  );
}

// ---------- Game ----------

// Reading `localStorage` itself can throw when site data is blocked.
const bests = createBestScores((() => {
  try { return window.localStorage; } catch { return undefined; }
})());

const media = window.matchMedia("(prefers-reduced-motion: reduce)");

function reducedMotion() {
  const { motion } = state.settings;
  return motion === "reduce" || (motion === "system" && media.matches);
}

const game = createGameController({
  elements: {
    viewport: $("#board-viewport"),
    board: $("#board"),
    message: $("#game-message"),
    pairs: $("#stat-pairs"),
    score: $("#stat-score"),
    streak: $("#stat-streak"),
    hint: $("#btn-hint"),
    shuffle: $("#btn-shuffle"),
    undo: $("#btn-undo"),
    zoom: {
      root: $("#zoom-controls"),
      in: $("#btn-zoom-in"),
      out: $("#btn-zoom-out"),
      fit: $("#btn-zoom-fit"),
    },
  },
  reducedMotion,
  onWin: showResults,
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

function showResults(summary) {
  const d = difficultyById(state.difficulty);
  $("#results-difficulty").textContent = `${d.name} · ${d.habitat}`;
  const { isNewBest, isNewBestTime, previous, best } = bests.record(d.id, summary);
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
  showScreen("results");
}

function formatSeconds(total) {
  if (total === null || total === undefined) return "—";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function openPause() {
  if (state.screen !== "game" || $("#pause-dialog").open) return;
  game.pause();
  $("#pause-dialog").showModal();
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
}

function onSettingsChange() {
  const form = $("#settings-form");
  state.settings = {
    motion: form.elements.motion.value,
    backgroundBirds: form.elements.backgroundBirds.checked,
    tileLabels: form.elements.tileLabels.checked,
    streakBonus: form.elements.streakBonus.checked,
  };
  saveSettings(state.settings);
  applySettings();
  game.refresh();
}

function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  saveSettings(state.settings);
  syncSettingsForm();
  applySettings();
}

// ---------- Events ----------

function onKeydown(event) {
  if (state.screen === "start") {
    if (event.key === "Tab" || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    leaveStart();
    return;
  }
  if (event.key !== "Escape") return;
  if (state.screen === "game") {
    // The open dialog handles its own Escape (closing = resume).
    if (!$("#pause-dialog").open) {
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
  });
  $("#btn-restart").addEventListener("click", () => {
    $("#pause-dialog").close();
    startGame(state.difficulty);
  });
  $("#btn-pause-menu").addEventListener("click", () => showScreen("menu"));
  $("#btn-play-again").addEventListener("click", () => startGame(state.difficulty));

  // Leaving the tab or app pauses the game (and its clock).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) openPause();
  });
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
syncSettingsForm();
applySettings();
renderBackground($("#sky-tiles"));
bindEvents();
