// Bird Mahjong app shell: screen flow, settings and background.
// Flow: Start → Main menu → Difficulty → Game → Results, plus How to Play
// and Settings off the menu. No gameplay yet.

import { DIFFICULTIES, SMALL_TILE_DIR, difficultyById } from "./config.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { renderBackground } from "./background.js";

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
  if ($("#pause-dialog").open) $("#pause-dialog").close();

  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen === next;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  state.screen = name;
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

      button.append(icon, title, detail);
      li.append(button);
      return li;
    })
  );
}

function startGame(difficultyId) {
  const d = difficultyById(difficultyId);
  state.difficulty = d.id;
  $("#game-difficulty").textContent = `${d.name} · ${d.habitat}`;
  $("#stat-tiles").textContent = String(d.tiles);
  $("#stat-moves").textContent = "0";
  $("#stat-time").textContent = "0:00";
  showScreen("game");
}

function showResults() {
  const d = difficultyById(state.difficulty);
  $("#results-difficulty").textContent = `${d.name} · ${d.habitat}`;
  showScreen("results");
}

// ---------- Settings ----------

function applySettings() {
  const { motion, backgroundBirds, tileLabels } = state.settings;
  document.documentElement.dataset.motion = motion;
  document.documentElement.dataset.tileLabels = tileLabels ? "on" : "off";
  $("#sky-tiles").hidden = !backgroundBirds;
}

function syncSettingsForm() {
  const form = $("#settings-form");
  form.elements.motion.value = state.settings.motion;
  form.elements.backgroundBirds.checked = state.settings.backgroundBirds;
  form.elements.tileLabels.checked = state.settings.tileLabels;
}

function onSettingsChange() {
  const form = $("#settings-form");
  state.settings = {
    motion: form.elements.motion.value,
    backgroundBirds: form.elements.backgroundBirds.checked,
    tileLabels: form.elements.tileLabels.checked,
  };
  saveSettings(state.settings);
  applySettings();
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
      $("#pause-dialog").showModal();
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

  $("#btn-pause").addEventListener("click", () => $("#pause-dialog").showModal());
  $("#btn-pause-menu").addEventListener("click", () => showScreen("menu"));
  $("#btn-preview-results").addEventListener("click", showResults);
  $("#btn-play-again").addEventListener("click", () => startGame(state.difficulty));

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

renderDifficulties();
syncSettingsForm();
applySettings();
renderBackground($("#sky-tiles"));
bindEvents();
