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

const TYPE_LABELS = {
  platform: "Platforms",
  publisher: "Publishers",
  hardware: "Hardware",
  indie: "Indie",
  media: "Media & Community",
  merch: "Merch & Lifestyle",
};

const CROWD_LABELS = ["", "Calm", "Light", "Moderate", "Busy", "Extreme"];

async function loadData() {
  const bust = `?v=${Date.now()}`;
  const [exhibitors, event, meta] = await Promise.all([
    fetch(`data/exhibitors.json${bust}`).then((r) => r.json()),
    fetch(`data/event.json${bust}`).then((r) => r.json()),
    fetch(`data/meta.json${bust}`).then((r) => r.json()),
  ]);
  state.exhibitors = exhibitors;
  state.event = event;
  state.meta = meta;
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

function filtered() {
  let list = state.exhibitors.filter((ex) => {
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

function locationBadge(ex) {
  if (!ex.hall) return `<span class="location unknown">📍 location TBA</span>`;
  const cls = ex.locationConfirmed ? "" : " unconfirmed";
  const label = `Hall ${esc(ex.hall)}${ex.booth ? " · " + esc(ex.booth) : ""}`;
  const hint = ex.locationConfirmed ? "" : " (unconfirmed)";
  return `<span class="location${cls}" title="${ex.locationConfirmed ? "Officially confirmed" : "Best guess — not officially confirmed"}">📍 ${label}${hint}</span>`;
}

function gameRow(g) {
  const playable = g.playable ? `<span class="badge badge-playable">playable</span>` : "";
  const note = g.note ? `<span class="game-note">${esc(g.note)}</span>` : "";
  return `<div class="game">
    <span class="game-title">${esc(g.title)}</span>
    <span class="badge status-${esc(g.status || "expected")}">${esc(g.status || "expected")}</span>
    ${playable}
    ${note}
  </div>`;
}

function card(ex) {
  const games = ex.games || [];
  const isOpen = state.expanded.has(ex.id);
  const shown = isOpen ? games : games.slice(0, 4);
  const moreBtn =
    games.length > 4
      ? `<button class="more-games" data-id="${esc(ex.id)}">${isOpen ? "Show fewer" : `Show all ${games.length} games`}</button>`
      : "";
  const crowd = ex.crowd || 0;
  return `<article class="card">
    <div class="card-head">
      <div>
        <span class="type-tag">${esc(TYPE_LABELS[ex.type] || ex.type)}</span>
        <h3>${esc(ex.name)}</h3>
      </div>
      ${locationBadge(ex)}
    </div>
    <p class="desc">${esc(ex.description)}</p>
    ${games.length ? `<div class="games">${shown.map(gameRow).join("")}</div>${moreBtn}` : ""}
    ${ex.tags?.length ? `<div class="tag-row">${ex.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="card-foot">
      <div class="crowd-row">
        <span class="crowd-label">Crowd forecast: <strong>${CROWD_LABELS[crowd] || "?"}</strong></span>
        <span class="crowd-meter crowd-${crowd}" title="${esc(ex.crowdNote || "")}"><span></span><span></span><span></span><span></span><span></span></span>
      </div>
      ${ex.visitAdvice ? `<p class="advice"><strong>Tip:</strong> ${esc(ex.visitAdvice)}</p>` : ""}
    </div>
  </article>`;
}

function renderExhibitors() {
  const list = filtered();
  $("#exhibitor-grid").innerHTML = list.map(card).join("");
  $("#no-results").classList.toggle("hidden", list.length > 0);
  const total = state.exhibitors.length;
  $("#result-count").textContent =
    list.length === total ? `${total} exhibitors` : `${list.length} of ${total} exhibitors`;

  document.querySelectorAll(".more-games").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      renderExhibitors();
    })
  );
}

function renderFilters() {
  const types = [...new Set(state.exhibitors.map((e) => e.type))];
  $("#type-filters").innerHTML =
    `<button class="chip ${state.type === "all" ? "active" : ""}" data-type="all">All</button>` +
    types
      .map(
        (t) =>
          `<button class="chip ${state.type === t ? "active" : ""}" data-type="${esc(t)}">${esc(TYPE_LABELS[t] || t)}</button>`
      )
      .join("");
  document.querySelectorAll("#type-filters .chip").forEach((chip) =>
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
    `<button class="chip hall-chip ${state.hall === "all" ? "active" : ""}" data-hall="all">All halls</button>` +
    halls
      .map(
        (h) =>
          `<button class="chip hall-chip ${state.hall === h ? "active" : ""}" data-hall="${esc(h)}">Hall ${esc(h)}</button>`
      )
      .join("");
  document.querySelectorAll("#hall-filters .chip").forEach((chip) =>
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
      return `<div class="day-card">
        <span class="day-date">${esc(d.label)}, ${esc(d.date.slice(5))}</span>
        <span class="day-access ${isTrade ? "trade" : "public"}">${esc(d.access)}</span>
        <span class="day-note">${esc(d.hours ? d.hours + " · " : "")}${esc(d.note || "")}</span>
      </div>`;
    })
    .join("");

  const busiest = [...state.exhibitors]
    .filter((e) => (e.crowd || 0) >= 4)
    .sort((a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name));
  $("#priority-list").innerHTML = busiest
    .map(
      (e, i) => `<div class="priority-item">
        <span class="priority-rank">#${i + 1}</span>
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
      (a) =>
        `<li><strong>${esc(a.name)}</strong>${a.hall ? ` <span class="area-hall">(Hall ${esc(a.hall)})</span>` : ""} — ${esc(a.description)}</li>`
    )
    .join("");
  $("#event-info").innerHTML = `
    <div class="info-block">
      <h2>📅 ${esc(ev.name)}</h2>
      <p>${esc(ev.location)} · ${esc(ev.dates)}</p>
      ${ev.onl ? `<p style="margin-top:8px"><strong style="color:var(--text)">Opening Night Live:</strong> ${esc(ev.onl.date)}${ev.onl.time ? ", " + esc(ev.onl.time) : ""} — ${esc(ev.onl.note || "")}</p>` : ""}
    </div>
    <div class="info-block">
      <h2>🎟️ Tickets</h2>
      <p>${esc(ev.tickets || "See gamescom.global for tickets.")}</p>
    </div>
    <div class="info-block">
      <h2>🗺️ Halls & areas</h2>
      <ul>${areas}</ul>
    </div>
    <div class="info-block">
      <h2>🔗 Official links</h2>
      <ul>
        <li><a href="https://www.gamescom.global/en" target="_blank" rel="noopener">gamescom.global</a> — official site</li>
        <li><a href="https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/" target="_blank" rel="noopener">Official exhibitor directory</a></li>
        <li><a href="https://www.gamescom.global/en/info/hall-plan" target="_blank" rel="noopener">Official hall plan</a></li>
      </ul>
    </div>`;
}

/* ---------- misc ---------- */

function renderCountdown() {
  const start = new Date(state.event.startDate + "T10:00:00+02:00");
  const now = new Date();
  const days = Math.ceil((start - now) / 86400000);
  const el = $("#countdown");
  if (days > 1) el.textContent = `🎮 ${days} days to go`;
  else if (days === 1) el.textContent = "🎮 Starts tomorrow!";
  else if (now < new Date(state.event.endDate + "T20:00:00+02:00")) el.textContent = "🎮 Happening now!";
  else el.textContent = "See you next year!";
}

function renderFreshness() {
  const m = state.meta;
  $("#data-freshness").textContent = `Data last updated: ${m.lastUpdated} (rev ${m.revision}). ${m.note || ""}`;
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
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab);
      });
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      $(`#view-${tab.dataset.view}`).classList.add("active");
    })
  );
}

async function main() {
  try {
    await loadData();
  } catch (err) {
    $("#exhibitor-grid").innerHTML = `<p class="empty">Failed to load data (${esc(err.message)}). If you opened this file directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }
  $("#event-dates").textContent = `${state.event.location} · ${state.event.dates}`;
  renderCountdown();
  renderFreshness();
  renderFilters();
  renderExhibitors();
  renderPlanner();
  renderEvent();
}

main();
