/* gamescom 2026 guide — all content comes from data/*.json so the data
   can be refreshed without touching app code. */

const state = {
  exhibitors: [],
  event: null,
  meta: null,
  query: "",
  type: "all",
  hall: "all",
  playableOnly: false,
  confirmedOnly: false,
  sort: "crowd-desc",
  expanded: new Set(),
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
const THEMES = ["signage", "zine", "console"];
const THEME_KEY = "gc26-theme";

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

/* ---------- filtering & sorting ---------- */

function matchesQuery(ex, q) {
  if (!q) return true;
  const hay = [
    ex.name,
    ex.description,
    ex.hall ? `hall ${ex.hall}` : "",
    ex.booth || "",
    ...(ex.tags || []),
    ...(ex.games || []).map((g) => g.title),
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
    state.playableOnly ||
    state.confirmedOnly
  );
}

function filtered() {
  const list = state.exhibitors.filter((ex) => {
    if (state.type !== "all" && ex.type !== state.type) return false;
    if (state.hall !== "all" && String(ex.hall) !== state.hall) return false;
    if (state.playableOnly && !(ex.games || []).some((g) => g.playable)) return false;
    if (state.confirmedOnly && !ex.locationConfirmed) return false;
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

function gameRow(g) {
  const status = g.status || "expected";
  const plat = platformCodes(g.platforms);
  /* "confirmed" is the default state — labelling all 23 rows of a big booth
     would be noise, so it stays a dot plus screen-reader text. */
  const statusLabel =
    status === "confirmed"
      ? `<span class="sr-only">Confirmed</span>`
      : `<span class="badge badge-status" data-status="${esc(status)}">${esc(status)}</span>`;
  return `<li class="game" data-status="${esc(status)}">
    <span class="game-main">
      <span class="game-title">${esc(g.title)}</span>
      ${statusLabel}
      ${g.playable ? `<span class="badge badge-playable">playable</span>` : ""}
    </span>
    ${plat ? `<span class="game-plat">${esc(plat)}</span>` : "<span></span>"}
    ${g.note ? `<span class="game-note">${esc(g.note)}</span>` : ""}
  </li>`;
}

function card(ex) {
  const games = ex.games || [];
  const isOpen = state.expanded.has(ex.id);
  const shown = isOpen ? games : games.slice(0, 4);
  const moreBtn =
    games.length > 4
      ? `<button class="more-games" type="button" data-id="${esc(ex.id)}">${
          isOpen ? "− Show fewer" : `+ ${games.length - 4} more`
        }</button>`
      : "";
  const crowd = ex.crowd || 0;
  const playableCount = games.filter((g) => g.playable).length;

  return `<article class="card">
    <div class="exh-head">
      ${hallMarker(ex)}
      <div class="exh-id">
        <span class="overline">${esc(TYPE_LABELS[ex.type] || ex.type)}</span>
        <h3>${esc(ex.name)}</h3>
      </div>
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
                }</span>
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
  $("#exhibitor-grid").innerHTML = list.map(card).join("");
  $("#exhibitor-grid").classList.toggle("hidden", list.length === 0);
  $("#no-results").classList.toggle("hidden", list.length > 0);
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
  if (state.playableOnly) parts.push("playable only");
  if (state.confirmedOnly) parts.push("confirmed only");
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

  const busiest = [...state.exhibitors]
    .filter((e) => (e.crowd || 0) >= 4)
    .sort((a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name));
  $("#priority-list").innerHTML = busiest
    .map(
      (e, i) => `<div class="priority-item">
        <span class="priority-rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="priority-name">${esc(e.name)}</span>
        <span class="priority-loc">${e.hall ? `Hall ${esc(e.hall)}` : "TBA"}</span>
        <span class="priority-advice">${esc(e.visitAdvice || e.crowdNote || "")}</span>
      </div>`
    )
    .join("");

  $("#crowd-tips").innerHTML = (ev.crowdTips || []).map((t) => `<li>${esc(t)}</li>`).join("");
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

/* ---------- views & theme ---------- */

function showView(name, { push = true } = {}) {
  if (!VIEWS.includes(name)) name = VIEWS[0];
  $$(".tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  $$(".view").forEach((v) => v.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  if (push && location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}

function applyTheme(name) {
  if (!THEMES.includes(name)) name = THEMES[0];
  document.documentElement.dataset.theme = name;
  $$(".theme-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === name));
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch (_) {
    /* private mode — theme just won't persist */
  }
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
  $("#reset-filters").addEventListener("click", () => {
    Object.assign(state, { query: "", type: "all", hall: "all", playableOnly: false, confirmedOnly: false });
    $("#search").value = "";
    $("#playable-only").checked = false;
    $("#confirmed-only").checked = false;
    renderFilters();
    renderExhibitors();
  });

  /* Desktop has room to keep the filters open; a phone does not. */
  $("#toolbar-more").open = window.matchMedia("(min-width: 760px)").matches;

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
  window.addEventListener("hashchange", () => showView(location.hash.slice(1), { push: false }));

  $$(".theme-btn").forEach((btn) => btn.addEventListener("click", () => applyTheme(btn.dataset.theme)));
}

/* Theme is applied before data loads so there is no flash of the wrong direction. */
function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (_) {
    /* ignore */
  }
  applyTheme(saved || document.documentElement.dataset.theme || THEMES[0]);
}

async function main() {
  initTheme();
  try {
    await loadData();
  } catch (err) {
    $("#exhibitor-grid").innerHTML = `<p class="empty">Failed to load data (${esc(err.message)}). If you opened this file directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }
  $("#event-dates").textContent = `${state.event.location} · ${state.event.dates}`;
  bindControls();
  renderCountdown();
  renderFreshness();
  renderFilters();
  renderExhibitors();
  renderPlanner();
  renderEvent();
  renderChangelog();
  showView(location.hash.slice(1) || VIEWS[0], { push: false });
}

main();
