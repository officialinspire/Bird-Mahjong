// Achievement art and screens: badges, the Stats screen, the results list
// and the "achievement earned" toast. Rendering only; what is earned comes
// from js/player-stats.js and js/achievements.js.
//
// Badges are drawn with inline SVG in the game's palette (bronze, silver and
// gold, plus leaf, sky and cardinal) with the bird's own tile art in a round
// window, so they match the tiles and need no extra image files:
//   medal    a disc on a two-tailed ribbon
//   rosette  a scalloped award rosette on a ribbon
//   trophy   a cup with handles on a plinth (the difficulty firsts)
// Locked badges are shown faded and hatched with a padlock, like blocked tiles.

import { ACHIEVEMENTS, CATEGORIES, progressOf } from "../achievements.js";
import { DIFFICULTIES } from "../config.js";
import { BIRD_IDS } from "../game/birds.js";
import { LAYOUT_IDS } from "../game/geometry.js";
import { tileFile, tileUrl } from "./tile-images.js";
import { currentDayStreak } from "../player-stats.js";

const SVG = "http://www.w3.org/2000/svg";

function svg(markup) {
  const el = document.createElementNS(SVG, "svg");
  el.setAttribute("viewBox", "0 0 100 120");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  el.classList.add("badge-frame");
  el.innerHTML = markup;
  return el;
}

// Ribbon tails shared by medals and rosettes.
const RIBBON = `
  <path class="b-ribbon" d="M30 70 L18 116 L32 106 L42 118 L50 78 Z"/>
  <path class="b-ribbon b-ribbon--alt" d="M70 70 L82 116 L68 106 L58 118 L50 78 Z"/>`;

const SHAPES = {
  medal: () => `${RIBBON}
    <circle class="b-edge" cx="50" cy="50" r="42"/>
    <circle class="b-face" cx="50" cy="50" r="37"/>
    <circle class="b-rim" cx="50" cy="50" r="30"/>
    <path class="b-shine" d="M22 38 A30 30 0 0 1 44 16" />`,
  rosette: () => {
    // 16 scallops around the disc.
    const petals = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return `<circle cx="${(50 + Math.cos(a) * 38).toFixed(1)}" cy="${(50 + Math.sin(a) * 38).toFixed(1)}" r="9"/>`;
    }).join("");
    return `${RIBBON}
      <g class="b-edge">${petals}</g>
      <circle class="b-face" cx="50" cy="50" r="38"/>
      <circle class="b-rim" cx="50" cy="50" r="30"/>
      <path class="b-shine" d="M22 38 A30 30 0 0 1 44 16" />`;
  },
  trophy: () => `
    <path class="b-edge" d="M16 16 C2 16 2 44 26 48 L26 40 C12 38 12 24 18 24 Z"/>
    <path class="b-edge" d="M84 16 C98 16 98 44 74 48 L74 40 C88 38 88 24 82 24 Z"/>
    <path class="b-face" d="M16 8 H84 V40 C84 62 68 76 50 78 C32 76 16 62 16 40 Z"/>
    <rect class="b-edge" x="44" y="76" width="12" height="16" rx="2"/>
    <path class="b-face" d="M28 104 C28 94 38 90 50 90 C62 90 72 94 72 104 Z"/>
    <rect class="b-ribbon" x="22" y="102" width="56" height="12" rx="3"/>
    <circle class="b-rim" cx="50" cy="40" r="24"/>
    <path class="b-shine" d="M22 18 V38" />`,
};

const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm2 0h6V7a3 3 0 0 0-6 0Z"/></svg>`;

/** A badge element for an achievement (decorative; its card carries the text). */
export function createBadge(achievement, { earned = false, size = "md" } = {}) {
  const { shape, tier, bird } = achievement.badge;
  const badge = document.createElement("span");
  badge.className = `badge badge--${shape} badge--${size}`;
  badge.dataset.tier = tier;
  badge.setAttribute("aria-hidden", "true");
  if (!earned) badge.classList.add("is-locked");
  badge.append(svg(SHAPES[shape]()));
  const frame = document.createElement("span");
  frame.className = "badge-window";
  const img = document.createElement("img");
  img.src = tileUrl(tileFile(bird), "sm");
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy";
  frame.append(img);
  badge.append(frame);
  if (!earned) {
    const lock = document.createElement("span");
    lock.className = "badge-lock";
    lock.innerHTML = LOCK;
    badge.append(lock);
  }
  return badge;
}

const dateFormat = (() => {
  try { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return null; }
})();
const formatDate = (t) => (dateFormat ? dateFormat.format(new Date(t)) : new Date(t).toDateString());
/** "1 h 5 min", "12 min", "45 s". */
function formatDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h} h${m ? ` ${m} min` : ""}`;
  return m ? `${m} min` : `${total} s`;
}
const formatSeconds = (s) => (s === null || s === undefined ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One achievement card for the Stats screen. */
function achievementCard(a, stats, unlocked) {
  const earned = Boolean(unlocked[a.id]);
  const li = el("li", `achievement ${earned ? "is-earned" : "is-locked"}`);
  li.dataset.achievement = a.id;
  li.append(createBadge(a, { earned }));
  const body = el("div", "achievement-body");
  body.append(el("strong", "achievement-name", a.name));
  body.append(el("span", "achievement-text", a.text));
  if (earned) {
    body.append(el("em", "achievement-quip", a.quip));
    body.append(el("small", "achievement-date", `Earned ${formatDate(unlocked[a.id])}`));
  } else {
    const p = progressOf(a, stats);
    if (p) {
      const [have, need] = p;
      const bar = el("span", "achievement-progress");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", `${a.name} progress`);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(need));
      bar.setAttribute("aria-valuenow", String(have));
      bar.setAttribute("aria-valuetext", `${have.toLocaleString()} of ${need.toLocaleString()}`);
      const fill = el("span");
      fill.style.width = `${Math.round((have / need) * 100)}%`;
      bar.append(fill);
      body.append(bar, el("small", "achievement-count", `${have.toLocaleString()} / ${need.toLocaleString()}`));
    } else {
      body.append(el("small", "achievement-count", "Not earned yet"));
    }
  }
  li.append(body);
  return li;
}

/**
 * Fill the Stats screen: a summary, records per difficulty, and every
 * achievement grouped by category. `records(id)` gives js/best-scores.js's
 * { score, bestTime, games } or null.
 */
export function renderStats(root, { stats, unlocked, records, today = "" }) {
  const earnedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  const streak = currentDayStreak(stats, today);
  const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
  const summary = [
    ["Boards cleared", stats.boardsCleared.toLocaleString()],
    ["Pairs cleared", stats.pairsCleared.toLocaleString()],
    ["Best streak", stats.bestStreak > 1 ? `×${stats.bestStreak}` : "—"],
    ["Day streak", streak ? plural(streak, "day") : "—"],
    ["Days played", stats.daysPlayed.toLocaleString()],
    ["Time birding", stats.totalSeconds ? formatDuration(stats.totalSeconds) : "—"],
    ["Birds seen", `${stats.species.length} / ${BIRD_IDS.length}`],
    ["Layouts cleared", `${stats.layouts.length} / ${LAYOUT_IDS.length}`],
    ["Achievements", `${earnedCount} / ${ACHIEVEMENTS.length}`],
  ];
  const dl = el("dl", "stats-summary");
  dl.setAttribute("aria-label", "Your totals");
  for (const [label, value] of summary) {
    const div = el("div");
    div.append(el("dt", "", label), el("dd", "", value));
    dl.append(div);
  }

  const table = el("table", "stats-table");
  const caption = el("caption", "visually-hidden", "Records by difficulty");
  const head = el("thead");
  const hr = el("tr");
  for (const h of ["Difficulty", "Cleared", "Best score", "Fastest"]) {
    const th = el("th", "", h);
    th.scope = "col";
    hr.append(th);
  }
  head.append(hr);
  const tbody = el("tbody");
  for (const d of DIFFICULTIES) {
    const r = records(d.id);
    const tr = el("tr");
    const th = el("th", "", d.name);
    th.scope = "row";
    tr.append(th,
      el("td", "", String(Math.max(stats.clears[d.id] || 0, r?.games || 0))),
      el("td", "", r ? r.score.toLocaleString() : "—"),
      el("td", "", formatSeconds(stats.fastest[d.id] ?? r?.bestTime ?? null)));
    tbody.append(tr);
  }
  table.append(caption, head, tbody);

  const sections = CATEGORIES.map((c) => {
    const list = ACHIEVEMENTS.filter((a) => a.category === c.id);
    const got = list.filter((a) => unlocked[a.id]).length;
    const section = el("section", "achievement-group");
    section.dataset.category = c.id;
    const h3 = el("h3", "", c.name);
    h3.append(el("span", "achievement-group-count", `${got} / ${list.length}`));
    const ul = el("ul", "achievement-list");
    ul.setAttribute("role", "list");
    ul.append(...list.map((a) => achievementCard(a, stats, unlocked)));
    section.append(h3, el("p", "achievement-group-blurb", c.blurb), ul);
    return section;
  });

  const achievementsTitle = el("h2", "stats-heading", "Achievements");
  achievementsTitle.append(el("span", "achievement-group-count", `${earnedCount} of ${ACHIEVEMENTS.length} earned`));

  // Jump links to each group: with this many achievements, scrolling alone is a chore.
  const nav = el("nav", "achievement-nav");
  nav.setAttribute("aria-label", "Achievement groups");
  for (const c of CATEGORIES) {
    const list = ACHIEVEMENTS.filter((a) => a.category === c.id);
    const button = el("button", "achievement-chip", c.name);
    button.type = "button";
    button.dataset.jump = c.id;
    button.append(el("span", "", `${list.filter((a) => unlocked[a.id]).length}/${list.length}`));
    button.addEventListener("click", () => {
      const target = root.querySelector(`.achievement-group[data-category="${c.id}"]`);
      target?.scrollIntoView({ block: "start", behavior: document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth" });
      target?.querySelector("h3")?.focus({ preventScroll: true });
    });
    nav.append(button);
  }
  for (const section of sections) section.querySelector("h3").tabIndex = -1;

  root.replaceChildren(dl, el("h2", "stats-heading", "By difficulty"), table, achievementsTitle, nav, ...sections);
}

/** The "new achievements" row on the results screen. */
export function renderEarned(root, list) {
  root.hidden = list.length === 0;
  const ul = root.querySelector("ul");
  ul.replaceChildren(...list.map((a) => {
    const li = el("li", "earned-item");
    li.dataset.achievement = a.id;
    li.append(createBadge(a, { earned: true, size: "sm" }), el("span", "", a.name));
    return li;
  }));
  root.querySelector(".earned-title").textContent = list.length === 1 ? "New achievement" : `${list.length} new achievements`;
}

/**
 * Toasts for achievements earned mid-game: one at a time, each for a few
 * seconds, announced politely to screen readers. `host` is an empty element.
 */
export function createToaster(host, { duration = 3600 } = {}) {
  const queue = [];
  let timer = null;

  function next() {
    timer = null;
    const a = queue.shift();
    if (!a) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }
    const card = el("div", "toast-card");
    card.dataset.achievement = a.id;
    const text = el("span", "toast-text");
    text.append(el("small", "", "Achievement earned"), el("strong", "", a.name), el("span", "toast-quip", a.quip));
    card.append(createBadge(a, { earned: true, size: "sm" }), text);
    host.replaceChildren(card);
    host.hidden = false;
    timer = setTimeout(next, duration);
  }

  return {
    show(list) {
      queue.push(...list);
      if (!timer) next();
    },
    /** Drop anything showing or queued (e.g. leaving the game screen). */
    clear() {
      clearTimeout(timer);
      queue.length = 0;
      next();
    },
    get showing() { return !host.hidden; },
  };
}
