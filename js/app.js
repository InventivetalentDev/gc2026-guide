/* gamescom 2026 guide — all content comes from data/*.json so the data
   can be refreshed without touching app code. */

const state = {
  exhibitors: [],
  event: null,
  meta: null,
  query: "",
  type: "all",
  hall: "all",
  age: "all",
  playableOnly: false,
  confirmedOnly: false,
  savedOnly: false,
  prioritySavedOnly: false,
  view: "exhibitors",
  sort: "crowd-desc",
  expanded: new Set(),
  /* replaced from localStorage in main() — see loadBookmarks() */
  bookmarks: { exhibitors: new Set(), games: new Set() },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const TYPE_LABELS = {
  platform: "Platforms",
  publisher: "Publishers",
  hardware: "Hardware",
  indie: "Indie",
  media: "Media & Community",
  merch: "Merch & Lifestyle",
};

const CROWD_LABELS = ["Unknown", "Calm", "Light", "Moderate", "Busy", "Extreme"];
const AGE_FILTERS = [["all", "All"], ["hide", "Hide 18+"], ["only", "18+ only"]];

/* Long platform names blow out a dense card — show signage-style short codes.
   Keys are matched after lowercasing and stripping any parenthetical. */
const PLATFORM_CODES = {
  "xbox series x|s": "XSX",
  "xbox series x": "XSX",
  xbox: "XBOX",
  pc: "PC",
  ps5: "PS5",
  ps4: "PS4",
  playstation: "PS",
  "switch 2": "SW2",
  switch: "SW",
  "nintendo switch 2": "SW2",
  "nintendo switch": "SW",
  mobile: "MOB",
  ios: "IOS",
  android: "AND",
  vr: "VR",
  psvr2: "PSVR2",
  "meta quest": "QUEST",
  cloud: "CLOUD",
  consoles: "CONSOLE",
  console: "CONSOLE",
  multi: "MULTI",
  digital: "DIGITAL",
  tcg: "TCG",
  tba: "TBA",
  tbc: "TBA",
};

const VIEWS = ["exhibitors", "planner", "event", "updates"];

async function loadData() {
  const bust = `?v=${Date.now()}`;
  const [exhibitors, event, meta, changelog] = await Promise.all([
    fetch(`data/exhibitors.json${bust}`).then((r) => r.json()),
    fetch(`data/event.json${bust}`).then((r) => r.json()),
    fetch(`data/meta.json${bust}`).then((r) => r.json()),
    fetch(`data/changelog.json${bust}`).then((r) => r.json()).catch(() => []),
  ]);
  state.exhibitors = exhibitors;
  state.event = event;
  state.meta = meta;
  state.changelog = changelog;
}

/* ---------- saved list (bookmarks) ----------

   Two independent sets: exhibitor ids, and games keyed by normalised title
   rather than by booth. Eight titles this year are shown at two booths at once
   (Alien: Isolation 2 sits at both Xbox and SEGA), and someone saving a game
   wants to see every booth running it so they can pick the shorter queue. */

const BM_KEY = "gc2026.saved.v1";
const PREFS_KEY = "gc2026.prefs.v1";

const gameKey = (title) => String(title).trim().toLowerCase().replace(/\s+/g, " ");

function loadBookmarks() {
  const empty = { exhibitors: new Set(), games: new Set() };
  try {
    const raw = JSON.parse(localStorage.getItem(BM_KEY) || "{}");
    return {
      exhibitors: new Set(Array.isArray(raw.exhibitors) ? raw.exhibitors : []),
      games: new Set(Array.isArray(raw.games) ? raw.games : []),
    };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return empty;
  }
}

function persistBookmarks() {
  try {
    localStorage.setItem(
      BM_KEY,
      JSON.stringify({
        exhibitors: [...state.bookmarks.exhibitors],
        games: [...state.bookmarks.games],
      })
    );
  } catch {
    /* out of quota or storage denied — the list still works for this session */
  }
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const age = AGE_FILTERS.some(([value]) => value === raw.age) ? raw.age : "all";
    return { age };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return { age: "all" };
  }
}

function persistPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ age: state.age }));
  } catch {
    /* out of quota or storage denied — the choice still works for this session */
  }
}

const bmSet = (kind) => (kind === "game" ? state.bookmarks.games : state.bookmarks.exhibitors);
const isSaved = (kind, key) => bmSet(kind).has(key);
const savedGames = (ex) => (ex.games || []).filter((g) => isSaved("game", gameKey(g.title)));
const savedCount = () => state.bookmarks.exhibitors.size + state.bookmarks.games.size;

/* An exhibitor counts as saved if you saved the booth itself *or* any game
   they're showing — the publisher is how you actually get to the game. */
const hasSaved = (ex) => isSaved("exhibitor", ex.id) || savedGames(ex).length > 0;

const AGE_GATE = 18;
const isAdult = (g) => Number(g.age) >= AGE_GATE;
const adultGames = (ex) => (ex.games || []).filter(isAdult);
const hasAdult = (ex) => ex.ageRestricted === true || adultGames(ex).length > 0;
/* One place decides which rows exist under the current age filter — the card,
   the query haystack and the playable check must all agree. */
const visibleGames = (ex) =>
  state.age === "hide" ? (ex.games || []).filter((g) => !isAdult(g)) : (ex.games || []);

/* The "+" adds to the list and the "−" takes it back off — same language as the
   "+ 4 more" / "− Show fewer" control, so no icon is needed. The saved state is
   carried by the filled plate, not by the glyph. */
function bmButton(kind, key, name, { wide = false } = {}) {
  const saved = isSaved(kind, key);
  const label = bmLabel(kind, name, saved);
  return `<button class="bm${wide ? " bm-wide" : ""}" type="button"
      data-bm-kind="${kind}" data-bm-key="${esc(key)}" data-bm-name="${esc(name)}"
      aria-pressed="${saved}" title="${esc(label)}" aria-label="${esc(label)}">
    <span class="bm-mark" aria-hidden="true">${saved ? "−" : "+"}</span>${
      wide ? `<span class="bm-text" aria-hidden="true">${saved ? "Saved" : "Save"}</span>` : ""
    }</button>`;
}

function bmLabel(kind, name, saved) {
  const what = kind === "game" ? name : `the ${name} booth`;
  return saved ? `Remove ${what} from your saved list` : `Save ${what} to your list`;
}

function toggleBookmark(kind, key) {
  const set = bmSet(kind);
  set.has(key) ? set.delete(key) : set.add(key);
  persistBookmarks();
  onBookmarksChanged();
}

function onBookmarksChanged() {
  /* Re-rendering the whole grid on every toggle would pull the button you just
     clicked out from under the pointer, so patch the buttons in place and only
     rebuild when a saved-only filter is deciding what's on screen. */
  if (state.savedOnly) renderExhibitors();
  else syncBookmarkUI();
  renderSavedControls();
  renderPriority();
  renderWristband();
}

/* Bring already-rendered buttons and their rows back in sync with the sets,
   without touching the surrounding markup. */
function syncBookmarkUI() {
  $$("[data-bm-kind]").forEach((btn) => {
    const { bmKind: kind, bmKey: key, bmName: name } = btn.dataset;
    const saved = isSaved(kind, key);
    const label = bmLabel(kind, name, saved);
    btn.setAttribute("aria-pressed", String(saved));
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.querySelector(".bm-mark").textContent = saved ? "−" : "+";
    const text = btn.querySelector(".bm-text");
    if (text) text.textContent = saved ? "Saved" : "Save";
    const row = btn.closest(".game");
    if (row) row.dataset.saved = String(saved);
  });
  $$("#exhibitor-grid .card").forEach((el) => {
    const ex = state.exhibitors.find((e) => e.id === el.dataset.id);
    if (ex) el.dataset.saved = String(hasSaved(ex));
  });
}

/* Re-rendering a list with innerHTML destroys the button that was just pressed,
   which drops keyboard focus back to the top of the page. Put it back on the
   equivalent button whenever one survives the re-render. */
function keepingFocus(container, render) {
  const el = document.activeElement;
  const inside = el && container.contains(el);
  const sel = !inside
    ? null
    : el.dataset.bmKey
      ? `.bm[data-bm-kind="${el.dataset.bmKind}"][data-bm-key="${CSS.escape(el.dataset.bmKey)}"]`
      : el.classList.contains("more-games")
        ? `.more-games[data-id="${CSS.escape(el.dataset.id)}"]`
        : null;
  render();
  if (sel) container.querySelector(sel)?.focus();
}

function renderSavedControls() {
  const n = savedCount();
  $("#saved-count").textContent = n ? `(${n})` : "";
  $("#priority-saved-count").textContent = n ? `(${n})` : "";
  $("#clear-saved").classList.toggle("hidden", n === 0);
}

/* ---------- filtering & sorting ---------- */

const reEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function adultTitleAliases(title) {
  const clean = String(title).replace(/\s*\([^)]*\)/g, "").trim();
  const candidates = [clean, clean.replace(/^the\s+/i, ""), clean.replace(/\s+\d+$/, "")];
  candidates.slice().forEach((candidate) => {
    if (!candidate.includes(":")) return;
    candidates.push(
      ...candidate
        .split(":")
        .map((part) => part.trim())
        .filter((part) => part.includes(" "))
    );
  });
  return [...new Set(candidates.map((alias) => alias.toLowerCase()))]
    .filter((alias) => alias.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function searchableDescription(ex) {
  const description = String(ex.description || "");
  if (state.age !== "hide") return description;
  /* Headline descriptions often repeat a game using a shortened title (for
     example "Call of Duty" rather than its full subtitle). Remove those actual
     title mentions without suppressing unrelated words that happen to occur in
     a title, such as "content". */
  const aliases = [...state.exhibitors.flatMap(adultGames), ...adultGames(ex)]
    .flatMap((g) => adultTitleAliases(g.title));
  return [...new Set(aliases)].reduce(
    (text, alias) => text.replace(new RegExp(`\\b${reEscape(alias)}\\b`, "gi"), " "),
    description
  );
}

function matchesQuery(ex, q) {
  if (!q) return true;
  const hay = [
    ex.name,
    searchableDescription(ex),
    ex.hall ? `hall ${ex.hall}` : "",
    ex.booth || "",
    ...(ex.tags || []),
    ...visibleGames(ex).map((g) => g.title),
    hasAdult(ex) ? "18+" : "",
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

function filtersActive() {
  return (
    state.query !== "" ||
    state.type !== "all" ||
    state.hall !== "all" ||
    state.age !== "all" ||
    state.playableOnly ||
    state.confirmedOnly ||
    state.savedOnly
  );
}

function filtered() {
  const list = state.exhibitors.filter((ex) => {
    if (state.type !== "all" && ex.type !== state.type) return false;
    if (state.hall !== "all" && String(ex.hall) !== state.hall) return false;
    if (state.age === "only" && !hasAdult(ex)) return false;
    if (state.age === "hide") {
      if (ex.ageRestricted === true) return false;
      if ((ex.games || []).length && !visibleGames(ex).length) return false;
    }
    if (state.playableOnly && !visibleGames(ex).some((g) => g.playable)) return false;
    if (state.confirmedOnly && !ex.locationConfirmed) return false;
    if (state.savedOnly && !hasSaved(ex)) return false;
    return matchesQuery(ex, state.query);
  });

  const bySort = {
    "crowd-desc": (a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name),
    "crowd-asc": (a, b) => (a.crowd || 0) - (b.crowd || 0) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    hall: (a, b) => {
      const ha = a.hall ? parseFloat(a.hall) : 99;
      const hb = b.hall ? parseFloat(b.hall) : 99;
      return ha - hb || a.name.localeCompare(b.name);
    },
  };
  return list.sort(bySort[state.sort] || bySort["crowd-desc"]);
}

/* ---------- rendering ---------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function platformCode(raw) {
  const clean = String(raw).toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  if (PLATFORM_CODES[clean]) return PLATFORM_CODES[clean];
  const bare = clean.replace(/\s+tb[cad]$/, "");
  if (PLATFORM_CODES[bare]) return PLATFORM_CODES[bare];
  return clean.toUpperCase();
}

function platformCodes(platforms) {
  const codes = (platforms || [])
    .map(platformCode)
    .filter((c, i, arr) => c && arr.indexOf(c) === i);
  if (!codes.length) return "";
  const shown = codes.slice(0, 4).join("·");
  return codes.length > 4 ? `${shown}·+${codes.length - 4}` : shown;
}

/* The hall number is the one thing you read while walking, so it gets
   set like a wayfinding sign rather than tucked into a badge. */
function hallMarker(ex) {
  if ((ex.tags || []).includes("not exhibiting")) {
    return `<div class="hall-marker" data-state="absent">
      <span class="hall-kicker">Status</span>
      <span class="hall-num">Absent</span>
      <span class="hall-booth">no booth</span>
    </div>`;
  }
  if (!ex.hall) {
    return `<div class="hall-marker" data-state="tba">
      <span class="hall-kicker">Hall</span>
      <span class="hall-num">TBA</span>
      <span class="hall-booth">not announced</span>
    </div>`;
  }
  const confirmed = !!ex.locationConfirmed;
  return `<div class="hall-marker" data-state="${confirmed ? "confirmed" : "unconfirmed"}"
      title="${confirmed ? "Officially confirmed location" : "Best guess — not officially confirmed"}">
    <span class="hall-kicker">Hall</span>
    <span class="hall-num">${esc(ex.hall)}</span>
    <span class="hall-booth">${ex.booth ? esc(ex.booth) : "booth TBA"}${confirmed ? "" : " · unconf."}</span>
  </div>`;
}

function ageBadge(status = "expected", label = "18+", extraClass = "") {
  const ageStatus = status === "confirmed" ? "confirmed" : "expected";
  const title = ageStatus === "confirmed"
    ? "18+ wristband required"
    : "18+ expected — not confirmed";
  return `<span class="badge badge-age${extraClass ? ` ${extraClass}` : ""}" data-age-status="${ageStatus}"
      title="${esc(title)}"><span aria-hidden="true">${esc(label)}</span><span class="sr-only">${esc(title)}</span></span>`;
}

const boothAgeStatus = (ex) =>
  adultGames(ex).some((g) => g.ageStatus === "confirmed") ? "confirmed" : "expected";

function gameRow(g) {
  const status = g.status || "expected";
  const plat = platformCodes(g.platforms);
  /* "confirmed" is the default state — labelling all 23 rows of a big booth
     would be noise, so it stays a dot plus screen-reader text. */
  const statusLabel =
    status === "confirmed"
      ? `<span class="sr-only">Confirmed</span>`
      : `<span class="badge badge-status" data-status="${esc(status)}">${esc(status)}</span>`;
  const key = gameKey(g.title);
  return `<li class="game" data-status="${esc(status)}" data-saved="${isSaved("game", key)}">
    <span class="game-main">
      <span class="game-title">${esc(g.title)}</span>
      ${statusLabel}
      ${g.playable ? `<span class="badge badge-playable">playable</span>` : ""}
      ${isAdult(g) ? ageBadge(g.ageStatus) : ""}
    </span>
    ${plat ? `<span class="game-plat">${esc(plat)}</span>` : "<span></span>"}
    ${bmButton("game", key, g.title)}
    ${g.note ? `<span class="game-note">${esc(g.note)}</span>` : ""}
  </li>`;
}

function card(ex) {
  const games = visibleGames(ex);
  const isOpen = state.expanded.has(ex.id);
  /* A saved game never hides behind "+ 12 more" — the whole point of saving it
     is not having to go looking for it again. */
  const tail = isOpen ? [] : games.slice(4).filter((g) => isSaved("game", gameKey(g.title)));
  const shown = isOpen ? games : [...games.slice(0, 4), ...tail];
  const hidden = games.length - shown.length;
  const moreBtn =
    games.length > 4 && (isOpen || hidden > 0)
      ? `<button class="more-games" type="button" data-id="${esc(ex.id)}">${
          isOpen ? "− Show fewer" : `+ ${hidden} more`
        }</button>`
      : "";
  const crowd = ex.crowd || 0;
  const playableCount = games.filter((g) => g.playable).length;

  return `<article class="card" data-id="${esc(ex.id)}" data-saved="${hasSaved(ex)}">
    <div class="exh-head">
      ${hallMarker(ex)}
      <div class="exh-id">
        <span class="overline">${esc(TYPE_LABELS[ex.type] || ex.type)}</span>
        <h3>${esc(ex.name)}${hasAdult(ex) && !games.length && state.age !== "hide" ? ageBadge(boothAgeStatus(ex)) : ""}</h3>
      </div>
      ${bmButton("exhibitor", ex.id, ex.name, { wide: true })}
    </div>
    <div class="card-body">
      <p class="desc">${esc(ex.description)}</p>
      ${
        games.length
          ? `<div class="block">
              <div class="block-head">
                <span>Lineup</span>
                <span>${games.length} title${games.length === 1 ? "" : "s"}${
                  playableCount ? `<span class="stamp">${playableCount} playable</span>` : ""
                }${hasAdult(ex) && state.age !== "hide" ? ageBadge(boothAgeStatus(ex)) : ""}</span>
              </div>
              <ul class="games">${shown.map(gameRow).join("")}</ul>
              ${moreBtn}
            </div>`
          : ""
      }
      ${ex.tags?.length ? `<div class="tag-row">${ex.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="card-foot">
      <div class="queue" data-level="${crowd}">
        <span class="row-label">Queue index</span>
        <span class="meter" data-level="${crowd}" role="img"
          aria-label="Queue index ${crowd} of 5"
          title="${esc(ex.crowdNote || "")}"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="queue-val">${crowd ? `${crowd}/5` : "—"} ${esc(CROWD_LABELS[crowd] || "?")}</span>
      </div>
      ${ex.visitAdvice ? `<p class="advice"><span class="advice-label">Plan</span>${esc(ex.visitAdvice)}</p>` : ""}
    </div>
  </article>`;
}

function renderExhibitors() {
  const list = filtered();
  keepingFocus($("#exhibitor-grid"), () => {
    $("#exhibitor-grid").innerHTML = list.map(card).join("");
  });
  $("#exhibitor-grid").classList.toggle("hidden", list.length === 0);
  $("#no-results").classList.toggle("hidden", list.length > 0);
  $("#no-results").textContent =
    state.savedOnly && savedCount() === 0
      ? "Nothing saved yet — hit + on a booth or on any game in its lineup to start a list."
      : "Nothing matches — try clearing filters.";
  $("#reset-filters").classList.toggle("hidden", !filtersActive());

  const total = state.exhibitors.length;
  $("#result-count").textContent =
    list.length === total ? `${total} exhibitors` : `${list.length} / ${total} exhibitors`;
  renderFilterSummary();

  $$(".more-games").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      renderExhibitors();
    })
  );
}

/* When the drawer is collapsed this line is the only thing telling you what is
   still filtered, so it spells out every active constraint. */
function renderFilterSummary() {
  const parts = [];
  if (state.type !== "all") parts.push(TYPE_LABELS[state.type] || state.type);
  if (state.hall !== "all") parts.push(`Hall ${state.hall}`);
  if (state.age === "hide") parts.push("hide 18+");
  if (state.age === "only") parts.push("18+ only");
  if (state.playableOnly) parts.push("playable only");
  if (state.confirmedOnly) parts.push("confirmed only");
  if (state.savedOnly) parts.push("saved only");
  if (state.query) parts.push(`“${state.query}”`);
  const el = $("#filter-summary");
  el.textContent = parts.length ? parts.join(" · ") : "All categories, all halls";
  el.dataset.active = String(parts.length > 0);
}

function renderFilters() {
  const types = [...new Set(state.exhibitors.map((e) => e.type))];
  $("#type-filters").innerHTML =
    `<button class="chip ${state.type === "all" ? "active" : ""}" type="button" data-type="all">All</button>` +
    types
      .map(
        (t) =>
          `<button class="chip ${state.type === t ? "active" : ""}" type="button" data-type="${esc(t)}">${esc(TYPE_LABELS[t] || t)}</button>`
      )
      .join("");
  $$("#type-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.type = chip.dataset.type;
      renderFilters();
      renderExhibitors();
    })
  );

  const halls = [...new Set(state.exhibitors.filter((e) => e.hall).map((e) => String(e.hall)))].sort(
    (a, b) => parseFloat(a) - parseFloat(b)
  );
  $("#hall-filters").innerHTML =
    `<button class="chip hall-chip ${state.hall === "all" ? "active" : ""}" type="button" data-hall="all">All</button>` +
    halls
      .map(
        (h) =>
          `<button class="chip hall-chip ${state.hall === h ? "active" : ""}" type="button" data-hall="${esc(h)}">${esc(h)}</button>`
      )
      .join("");
  $$("#hall-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.hall = chip.dataset.hall;
      renderFilters();
      renderExhibitors();
    })
  );

  const ageFilters = $("#age-filters");
  if (!ageFilters) return; // a cached pre-age-filter index.html may briefly pair with this JS
  ageFilters.innerHTML = AGE_FILTERS
    .map(
      ([value, label]) =>
        `<button class="chip age-chip ${state.age === value ? "active" : ""}" type="button"
          data-age="${value}" aria-pressed="${state.age === value}">${label}</button>`
    )
    .join("");
  ageFilters.closest(".toolbar-row")?.classList.remove("hidden");
  $$("#age-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      const age = chip.dataset.age;
      state.age = age;
      persistPrefs();
      renderFilters();
      renderExhibitors();
      $(`#age-filters [data-age="${CSS.escape(age)}"]`)?.focus();
    })
  );
}

/* ---------- planner ---------- */

function renderPlanner() {
  const ev = state.event;
  $("#day-guide").innerHTML = (ev.days || [])
    .map((d) => {
      const isTrade = /trade|media|business/i.test(d.access);
      const [, month, day] = d.date.split("-");
      return `<div class="day-row">
        <span class="day-when">
          <span class="day-dow">${esc(d.label.slice(0, 3))}</span>
          <span class="day-date">${esc(day)}.${esc(month)}</span>
        </span>
        <span class="day-access ${isTrade ? "trade" : "public"}">${esc(d.access)}</span>
        <span class="day-detail">
          ${d.hours ? `<span class="day-hours">${esc(d.hours)}</span>` : ""}
          ${d.note ? `<span class="day-note">${esc(d.note)}</span>` : ""}
        </span>
      </div>`;
    })
    .join("");

  renderPriority();
  renderWristband();

  $("#crowd-tips").innerHTML = (ev.crowdTips || []).map((t) => `<li>${esc(t)}</li>`).join("");
}

function renderWristband() {
  const container = $("#wristband-list");
  const section = $("#wristband-section");
  if (!container || !section) return; // tolerate a cached pre-wristband index.html

  const list = state.exhibitors
    .filter(hasAdult)
    .sort((a, b) => {
      const ha = a.hall ? parseFloat(a.hall) : 99;
      const hb = b.hall ? parseFloat(b.hall) : 99;
      return ha - hb || a.name.localeCompare(b.name);
    });

  const rows = list
    .map((e) => {
      const titles = adultGames(e);
      const games = titles.length
        ? titles.map((g) => esc(g.title)).join(" · ")
        : "Booth-wide age-restricted zone";
      const location = `${e.hall ? `Hall ${esc(e.hall)}` : "Hall TBA"} · ${
        e.booth ? esc(e.booth) : "booth TBA"
      }`;
      const expected = boothAgeStatus(e) !== "confirmed";
      return `<div class="priority-item wristband-item" data-saved="${hasSaved(e)}">
        <span class="wristband-name">${esc(e.name)}</span>
        <span class="wristband-loc">${location}</span>
        <span class="wristband-games">${games}</span>
        ${expected ? ageBadge("expected", "18+ expected", "wristband-status") : ""}
        ${bmButton("exhibitor", e.id, e.name)}
      </div>`;
    })
    .join("");

  keepingFocus(container, () => {
    container.innerHTML = rows;
  });
  section.classList.toggle("hidden", list.length === 0);
}

function renderPriority() {
  const busiest = [...state.exhibitors]
    .filter((e) => (e.crowd || 0) >= 4)
    .sort((a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name));
  /* Ranks come from the unfiltered order: "07" has to keep meaning "seventh
     worst queue of the show", not "seventh row you happen to be looking at". */
  const list = state.prioritySavedOnly ? busiest.filter(hasSaved) : busiest;

  const rows = list
    .map((e) => {
      const mine = savedGames(e);
      return `<div class="priority-item" data-saved="${hasSaved(e)}">
        <span class="priority-rank">${String(busiest.indexOf(e) + 1).padStart(2, "0")}</span>
        <span class="priority-name">${esc(e.name)}${hasAdult(e) ? ageBadge(boothAgeStatus(e)) : ""}</span>
        <span class="priority-loc">${e.hall ? `Hall ${esc(e.hall)}` : "TBA"}</span>
        <span class="priority-advice">${esc(e.visitAdvice || e.crowdNote || "")}</span>
        ${bmButton("exhibitor", e.id, e.name)}
        ${
          mine.length
            ? `<span class="priority-saved"><span class="row-label">Saved here</span>${mine
                .map((g) => `<span class="priority-game">${esc(g.title)}</span>`)
                .join("")}</span>`
            : ""
        }
      </div>`;
    })
    .join("");
  keepingFocus($("#priority-list"), () => {
    $("#priority-list").innerHTML = rows;
  });

  $("#priority-list").classList.toggle("hidden", list.length === 0);
  $("#priority-empty").classList.toggle("hidden", list.length > 0);
  $("#priority-empty").textContent = savedCount()
    ? "Nothing you saved is in the high-queue group — good news, those booths should be closer to a walk-up."
    : "Nothing saved yet — hit + on a booth or game over on the Exhibitors tab.";
  $("#priority-count").textContent =
    list.length === busiest.length
      ? `${busiest.length} high-queue booths`
      : `${list.length} / ${busiest.length} high-queue booths`;
}

/* ---------- event info ---------- */

function renderEvent() {
  const ev = state.event;
  const areas = (ev.areas || [])
    .map(
      (a) => `<li>
        <span class="area-hall${a.hall ? "" : " none"}">${a.hall ? esc(a.hall) : "—"}</span>
        <span>
          <span class="area-name">${esc(a.name)}</span><br>
          <span class="area-desc">${esc(a.description)}</span>
        </span>
      </li>`
    )
    .join("");

  const links = [
    ["https://www.gamescom.global/en", "gamescom.global", "Official site"],
    [
      "https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/",
      "Exhibitor directory",
      "Official list",
    ],
    ["https://www.gamescom.global/en/info/hall-plan", "Hall plan", "Official map"],
  ]
    .map(
      ([href, name, desc]) =>
        `<li><a href="${href}" target="_blank" rel="noopener"><span class="link-name">${esc(name)}</span><span class="link-desc">${esc(desc)} ↗</span></a></li>`
    )
    .join("");

  $("#event-info").innerHTML = `
    <div class="info-block">
      <h2><span class="section-num">01</span> The show</h2>
      <p class="headline-fact">${esc(ev.name)}</p>
      <p class="fact-sub">${esc(ev.location)} · ${esc(ev.dates)}</p>
      ${
        ev.onl
          ? `<p style="margin-top:14px"><strong>Opening Night Live</strong> — ${esc(ev.onl.date)}${
              ev.onl.time ? ", " + esc(ev.onl.time) : ""
            }. ${esc(ev.onl.note || "")}</p>`
          : ""
      }
    </div>
    <div class="info-block">
      <h2><span class="section-num">02</span> Tickets</h2>
      <p>${esc(ev.tickets || "See gamescom.global for tickets.")}</p>
    </div>
    <div class="info-block">
      <h2><span class="section-num">03</span> Halls &amp; areas</h2>
      <ul class="area-list">${areas}</ul>
    </div>
    <div class="info-block">
      <h2><span class="section-num">04</span> Official links</h2>
      <ul class="link-list">${links}</ul>
    </div>`;
}

/* ---------- changelog ---------- */

function renderChangelog() {
  const entries = [...(state.changelog || [])].sort((a, b) => b.revision - a.revision);
  $("#changelog").innerHTML = entries
    .map(
      (e) => `<div class="timeline-entry">
        <div class="timeline-head">
          <span class="timeline-date">${esc(e.date)}</span>
          <span class="rev-tag">rev ${esc(e.revision)}</span>
        </div>
        <ul>${(e.changes || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");
}

/* ---------- misc ---------- */

function renderCountdown() {
  const start = new Date(state.event.startDate + "T10:00:00+02:00");
  const now = new Date();
  const days = Math.ceil((start - now) / 86400000);
  const el = $("#countdown");
  if (days > 1) el.textContent = `T−${days} days`;
  else if (days === 1) el.textContent = "T−1 day";
  else if (now < new Date(state.event.endDate + "T20:00:00+02:00")) el.textContent = "● Live now";
  else el.textContent = "See you next year";
}

function renderFreshness() {
  const m = state.meta;
  $("#data-freshness").textContent = `Data updated ${m.lastUpdated} · rev ${m.revision}. ${m.note || ""}`;
}

/* ---------- views ----------

   Routes are the four view names plus "saved" — the exhibitor list with the
   saved-only filter on. It's a route rather than only a checkbox so the
   installed app can put a launcher shortcut straight on your list, and so the
   filtered list can be linked and survives a reload. */

const SAVED_ROUTE = "saved";

const routeFor = (view) => (view === "exhibitors" && state.savedOnly ? SAVED_ROUTE : view);

function syncHash() {
  const target = routeFor(state.view);
  if (location.hash.slice(1) !== target) history.replaceState(null, "", `#${target}`);
}

function setSavedOnly(on) {
  if (state.savedOnly === on) return;
  state.savedOnly = on;
  $("#saved-only").checked = on;
  renderExhibitors();
}

function showView(route, { push = true } = {}) {
  const wantsSaved = route === SAVED_ROUTE;
  let name = wantsSaved ? "exhibitors" : route;
  if (!VIEWS.includes(name)) name = VIEWS[0];
  state.view = name;
  /* On the exhibitor list the URL owns the filter, so landing on #saved turns
     it on and landing on #exhibitors clears it. The tabs route through
     routeFor(), so switching away and back keeps whatever you had set. */
  if (name === "exhibitors") setSavedOnly(wantsSaved);
  $$(".tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  $$(".view").forEach((v) => v.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  if (push) syncHash();
}

function bindControls() {
  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    renderExhibitors();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderExhibitors();
  });
  $("#playable-only").addEventListener("change", (e) => {
    state.playableOnly = e.target.checked;
    renderExhibitors();
  });
  $("#confirmed-only").addEventListener("change", (e) => {
    state.confirmedOnly = e.target.checked;
    renderExhibitors();
  });
  $("#saved-only").addEventListener("change", (e) => {
    setSavedOnly(e.target.checked);
    syncHash();
  });
  $("#priority-saved-only").addEventListener("change", (e) => {
    state.prioritySavedOnly = e.target.checked;
    renderPriority();
  });
  $("#clear-saved").addEventListener("click", () => {
    const n = savedCount();
    if (!confirm(`Forget all ${n} saved item${n === 1 ? "" : "s"}? This can't be undone.`)) return;
    state.bookmarks = { exhibitors: new Set(), games: new Set() };
    persistBookmarks();
    renderExhibitors();
    renderSavedControls();
    renderPriority();
    renderWristband();
  });
  /* One delegated listener covers every + button in both views, including the
     ones that get re-rendered underneath it. */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bm-kind]");
    if (btn) toggleBookmark(btn.dataset.bmKind, btn.dataset.bmKey);
  });
  /* Same list, second tab: keep them from overwriting each other. */
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== BM_KEY && e.key !== PREFS_KEY) return;
    if (e.key === null || e.key === BM_KEY) state.bookmarks = loadBookmarks();
    if (e.key === null || e.key === PREFS_KEY) Object.assign(state, loadPrefs());
    renderFilters();
    renderExhibitors();
    renderSavedControls();
    renderPriority();
    renderWristband();
  });

  $("#reset-filters").addEventListener("click", () => {
    Object.assign(state, {
      query: "",
      type: "all",
      hall: "all",
      age: "all",
      playableOnly: false,
      confirmedOnly: false,
      savedOnly: false,
    });
    $("#search").value = "";
    $("#playable-only").checked = false;
    $("#confirmed-only").checked = false;
    $("#saved-only").checked = false;
    persistPrefs();
    renderFilters();
    renderExhibitors();
    syncHash();
  });

  /* Desktop has room to keep the filters open; a phone does not. */
  $("#toolbar-more").open = window.matchMedia("(min-width: 760px)").matches;

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(routeFor(tab.dataset.view))));
  /* push:true here so an unknown or now-stale hash gets rewritten to the route
     actually on screen rather than being left lying in the address bar. */
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
}

async function main() {
  try {
    await loadData();
  } catch (err) {
    $("#exhibitor-grid").innerHTML = `<p class="empty">Failed to load data (${esc(err.message)}). If you opened this file directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }
  state.bookmarks = loadBookmarks();
  Object.assign(state, loadPrefs());
  $("#event-dates").textContent = `${state.event.location} · ${state.event.dates}`;
  bindControls();
  renderCountdown();
  renderFreshness();
  renderSavedControls();
  renderFilters();
  renderExhibitors();
  renderPlanner();
  renderEvent();
  renderChangelog();
  showView(location.hash.slice(1) || VIEWS[0], { push: false });
}

main();
