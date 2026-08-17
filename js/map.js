/* gamescom 2026 guide — hall map.

   Draws one hall at a time from data/hallplan/*.json (booth geometry
   snapshotted by tools/fetch-hallplan.mjs) and colours it with your
   saved list. Deliberately dependency-free: the biggest hall level is
   191 stands, which is nothing for inline SVG, and a mapping library
   would cost more than everything here.

   Its own page rather than a fifth view in the guide, because a
   full-screen gesture surface fights the app's scrolling, and because
   the URL then *is* the deep link: map.html#7.1/A061.

   Saved/played marks are the guide's own — same localStorage keys, same
   rules, via js/marks.js — so a booth saved here is saved there and
   vice versa, live across tabs. See docs/PLAN-hall-map.md. */

"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SVGNS = "http://www.w3.org/2000/svg";

/* Same string registry as the guide (js/i18n.js runs first on this page
   too), so the queue vocabulary is one set of crowd.* keys rather than a
   second copy to drift. The shim keeps a stale cached shell booting. */
const GCI18N = window.GCI18N || {
  lang: "en",
  t: (key) => key,
  apply() {},
  dayName: String,
  formatDate: String,
};
const t = GCI18N.t;
const formatDate = GCI18N.formatDate || ((date) => String(date));
/* Country and product-group names arrive in English from the generated
   data/directory.json; their display names live in the locale overlay the
   guide loads. The map fetches that overlay only for these two maps — see
   loadLabels below. */
const countryLabel = (c) => state.labels.countries?.[c] || c;
const groupLabel = (id, fallback) => state.labels.dirGroups?.[id] || fallback || "";

const crowdLabel = (level) => {
  const label = t(`crowd.${level}`);
  return label === `crowd.${level}` ? "" : label;
};

const DEFAULT_HALL = "7.1";

const state = {
  index: null,          // data/hallplan/index.json
  areas: {},            // area key -> {label, colour, trade?, access?}
  outline: {},          // data/hallplan/outline.json — hall margins + doors
  labels: {},           // {countries, dirGroups} from data/i18n/<lang>.json
  exhibitors: [],       // data/exhibitors.json
  trade: [],            // business-hall rows from data/directory.json, once loaded
  halls: new Map(),     // hall id -> hall json
  byStand: new Map(),   // "hall:CODE" -> [exhibitor, …]
  hall: null,           // current hall id
  stands: [],           // render records for the current hall
  marks: { saved: null, played: null },
  sel: null,
};

/* ================= marks ================= */

function loadMarks() {
  state.marks.saved = GCMarks.readMarks("saved");
  state.marks.played = GCMarks.readMarks("played");
}

const exSaved = (ex) => GCMarks.hasSaved(state.marks.saved, ex);
/* A booth reads as played when marked directly, or when every game you
   saved there is played — the same asymmetry as the guide's hasPlayed. */
const exPlayed = (ex) => {
  const mine = GCMarks.savedGames(state.marks.saved, ex);
  return state.marks.played.exhibitors.has(ex.id) ||
    (mine.length > 0 && mine.every((g) => state.marks.played.games.has(GCMarks.gameKey(g.title))));
};

function toggleSaved(id) {
  loadMarks(); /* pick up another tab's changes before writing over them */
  const set = state.marks.saved.exhibitors;
  set.has(id) ? set.delete(id) : set.add(id);
  GCMarks.writeMarks("saved", state.marks.saved);
  refreshMarks();
}

/* ================= joining guide data to stands ================= */

/* Nothing editorial is baked into data/hallplan/*.json: stands and
   exhibitors meet here, by hall plus booth code, so a booth correction
   in data/exhibitors.json moves the highlight with no re-snapshot.

   Two sources feed it. The curated cards carry one scalar hall/booth pair;
   a trade record built from the directory can hold several stands, so it
   also joins through `stands[]`. Both end up in the same index, and
   everything downstream stops caring where a record came from. */
function buildJoin() {
  state.byStand.clear();
  const add = (ex, hall, booth) => {
    if (!hall || !booth) return;
    for (const code of GCMarks.boothCodes(booth)) {
      const key = `${hall}:${code}`;
      if (!state.byStand.has(key)) state.byStand.set(key, []);
      const at = state.byStand.get(key);
      if (!at.includes(ex)) at.push(ex);
    }
  };
  for (const ex of [...state.exhibitors, ...state.trade].filter(offered)) {
    add(ex, ex.hall, ex.booth);
    for (const s of ex.stands || []) add(ex, s.hall, s.booth);
  }
}

/* Business-area content follows the guide's rule rather than the map's
   convenience: offered only in trade mode — else a consumer taps a Hall 2.1
   stand, gets a name, and follows a link into a grid that is hiding it.
   Saved ones always join, because that rule gates discovery and never
   resolution.

   Both sources are checked, not just the curated cards. Directory rows used
   to be spread into the join unconditionally, which held only while nothing
   ever fetched them with the pref off — turn trade on and off again and the
   rows stayed, leaving 54 of hall 2.1's 78 stands joined with the setting
   off. The switch on the access banner makes that a one-tap path, so the
   gate belongs on the join itself. */
const isTradeContent = (ex) => ex.type === "trade" || ex.trade === true;

const offered = (ex) =>
  !isTradeContent(ex) ||
  GCMarks.tradeMode() ||
  state.marks.saved.exhibitors.has(ex.id) ||
  state.marks.played.exhibitors.has(ex.id);

/* Anything that changes who joins to a stand — new rows arriving, trade mode
   flipped in the other tab — invalidates the hall on screen, because both the
   chip counts and the stand records read the join. Re-selecting afterwards
   keeps an open sheet pointing at the same stand. */
function redrawJoin() {
  buildJoin();
  if (!state.hall || !$("#map")) return;
  const code = state.sel ? [...state.sel.codes][0] : null;
  renderHall(state.hall);
  if (!code) return;
  const rec = state.stands.find((r) => r.codes.has(code));
  if (rec) selectStand(rec);
}

/* ================= trade exhibitors =================

   The business halls are drawn, but only the guide's curated cards used to
   join to them, so a hall of 300 stands lit up almost none. The directory
   knows who is standing there, so with trade mode on — or with any trade
   booth already saved — those rows join too and the business halls become
   as usable as the entertainment ones.

   Same two rules as the guide (docs/PLAN-trade-exhibitors.md): the pref
   gates browsing, never resolution, and a booth's identity is its `dir:`
   key wherever it was saved from. */

const DIRECTORY_URL = "data/directory.json";
let directoryRequest = null;

const wantsTrade = () =>
  GCMarks.tradeMode() ||
  [...state.marks.saved.exhibitors].some(GCMarks.isDirKey) ||
  [...state.marks.played.exhibitors].some(GCMarks.isDirKey);

/* A directory row in the same shape the rest of this file expects from an
   exhibitor: an id, a name, and stands to join on. `trade` is what the sheet
   branches on — nothing else needs to know. */
function tradeRecords(payload) {
  const claimed = new Set(state.exhibitors.map((ex) => ex.dirSlug).filter(Boolean));
  const out = [];
  for (const entry of payload.exhibitors || []) {
    const stands = (entry.stands || []).filter((s) => GCMarks.isBusinessHall(s.hall));
    if (!stands.length || claimed.has(entry.slug)) continue;
    out.push({
      id: GCMarks.dirKey(entry.slug),
      name: entry.name,
      trade: true,
      country: entry.country || "",
      cats: (entry.cats || []).map((id) => groupLabel(id, payload.groups?.[id])).filter(Boolean),
      profile: payload.profileBase && entry.slug ? `${payload.profileBase}${entry.slug}/` : "",
      stands,
      games: [],
    });
  }
  return out;
}

/* Country and product-group display names, fetched alongside the directory
   rather than at boot: they are only ever rendered for a business stand, and
   that is exactly the case that already pays for a directory fetch. English
   rides along in the directory itself as the fallback, so a failed overlay
   costs the translation and nothing else. */
function loadLabels() {
  if (GCI18N.lang === "en" || Object.keys(state.labels).length) return Promise.resolve();
  return fetch(`data/i18n/${GCI18N.lang}.json?v=${Date.now()}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((overlay) => {
      state.labels = { countries: overlay.countries || {}, dirGroups: overlay.dirGroups || {} };
    })
    .catch(() => {
      state.labels = { countries: {}, dirGroups: {} };
    });
}

function loadTrade() {
  if (state.trade.length || directoryRequest) return directoryRequest;
  directoryRequest = Promise.all([
    fetch(`${DIRECTORY_URL}?v=${Date.now()}`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
    ),
    loadLabels(),
  ])
    .then(([payload]) => {
      state.trade = tradeRecords(payload);
      redrawJoin();
    })
    .catch(() => {
      /* offline with a cold cache: the business halls simply stay as they
         were, which is exactly the parent branch's behaviour */
    })
    .finally(() => {
      directoryRequest = null;
    });
  return directoryRequest;
}

function standRecord(hallId, s) {
  const codes = GCMarks.boothCodes([s.nr, ...(s.also || [])].join(" "));
  const exs = [];
  for (const code of codes)
    for (const ex of state.byStand.get(`${hallId}:${code}`) || [])
      if (!exs.includes(ex)) exs.push(ex);
  return { data: s, codes, exs };
}

/* ================= hall data ================= */

/* Which patch of floor a stand stands on, as a comparable key.

   Koelnmesse does not file the two levels corner-for-corner in the same
   order. Gryphline's Hall 8.1 stands are the pair that showed it:
   C-020 B-012 and its gallery agree byte for byte, while B-021 C-030 is
   filed [90,10] [114,10] [114,40] [90,40] and B-021g C-030g is the same
   rectangle written backwards, [90,40] [114,40] [114,10] [90,10]. So one
   of Gryphline's two booths answered to a tap and the other returned an
   empty "B-021g C-030g".

   Comparing the literal coordinate string therefore matched only the
   pairs that happened to agree — 65 of 134 across the show. This reduces
   the corner ring to a canonical form instead: the smallest rotation of
   the ring and of its reverse, which two polygons share exactly when
   they are the same ring, whichever corner it starts from and whichever
   way round it runs. */
function footprint(poly) {
  const ring = poly.map((p) => p.join());
  /* defensive: this data leaves the ring open, but a closing vertex would
     otherwise rotate into the middle and never match its reverse */
  if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
  let best = null;
  for (const dir of [ring, [...ring].reverse()]) {
    for (let i = 0; i < dir.length; i++) {
      const rot = dir.slice(i).concat(dir.slice(0, i)).join(" ");
      if (best === null || rot < best) best = rot;
    }
  }
  return best;
}

/* Koelnmesse files a stand's gallery level as a stand of its own, on
   exactly the same four corners: F-010 E-019 and F-010g E-019g are one
   place, one floor above the other. Drawn as two stands the empty upper
   one lands on top and swallows every tap, which is why tapping the
   Indie Arena Booth answered "no exhibitor filed for this stand" while
   the deep link to it was right all along.

   Same footprint means same place, so they become one stand: one shape,
   every stand number, every name filed on either level. This joins stands
   standing on the same corners only — a sub-stand that sits *inside* a
   larger one (E-071a within E-071, 30 of them in hall 10.1) has a
   footprint of its own and stays separate, which is what the painting
   order below is for. 134 pairs across eleven halls; hall 10.1 alone
   has 26. */
function mergeLevels(stands) {
  /* Which number a visitor reads on the stand: the one the exhibitors
     were filed against, and failing that the plain ground-floor number
     rather than its "g" twin. */
  const rank = (s) => (s.names.length ? 2 : 0) + (/\d[a-z]/.test(s.nr) ? 0 : 1);
  const byFootprint = new Map();
  for (const s of stands) {
    const key = footprint(s.poly);
    if (byFootprint.has(key)) byFootprint.get(key).push(s);
    else byFootprint.set(key, [s]);
  }
  return [...byFootprint.values()].map((group) => {
    if (group.length === 1) return group[0];
    const [main, ...rest] = [...group].sort((a, b) => rank(b) - rank(a));
    return {
      ...main,
      /* the levels stack, so the footprint is the larger of them, not the sum */
      a: Math.max(...group.map((s) => s.a || 0)),
      also: rest.map((s) => s.nr),
      names: [...new Set([main, ...rest].flatMap((s) => s.names))],
    };
  });
}

/* Fetched once, merged once, and drawn in that shape from then on — the
   snapshot on disk stays a faithful copy of what Koelnmesse filed. */
async function loadHall(id) {
  if (!state.halls.has(id)) {
    const entry = state.index.halls.find((h) => h.id === id);
    const hall = await fetch(`data/hallplan/${entry.file}`).then((r) => r.json());
    hall.stands = mergeLevels(hall.stands);
    state.halls.set(id, hall);
  }
  return state.halls.get(id);
}

/* ================= geometry helpers ================= */

const polyPath = (poly) => "M" + poly.map((p) => p[0] + " " + p[1]).join("L") + "Z";

function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* Set a name as large as the booth allows, by trying every way of
   breaking it across one, two or three lines and keeping whichever fits
   biggest. Breaking by character count instead — balance the halves,
   done — reads fine on a square booth and fails on a narrow one: MOZA
   Racing's stand is 4 m wide, so "MOZA Racing" on one line fitted at
   0.6 m and got dropped as unreadable, where "MOZA / Racing" fits at
   1.2 m. Names are short, so trying all the breaks is a handful of
   candidates per booth. */
function fitName(name, box, area) {
  const spaces = [];
  for (let i = 0; i < name.length; i++) if (name[i] === " ") spaces.push(i);
  const candidates = [[name]];
  for (const i of spaces) candidates.push([name.slice(0, i), name.slice(i + 1)]);
  for (const i of spaces)
    for (const j of spaces)
      if (j > i) candidates.push([name.slice(0, i), name.slice(i + 1, j), name.slice(j + 1)]);

  let best = { lines: [name], fs: 0 };
  for (const lines of candidates) {
    const longest = Math.max(...lines.map((l) => l.length));
    /* booth width vs text length, booth height vs line count, and a cap
       tied to booth size so anchor booths don't shout */
    const fs = Math.min(
      (box.w * 0.92) / (longest * 0.52),
      (box.h * 0.5) / lines.length,
      Math.sqrt(area) * 0.3,
      7
    );
    if (fs > best.fs) best = { lines, fs };
  }
  return best;
}

/* ================= the hall's outline and its doors =================

   Koelnmesse files no wall. The endpoint carries stand blocks and stands,
   so a hall's extent is only ever implied by where its contents stop —
   which reads fine on a dense hall and leaves 7.1's three empty aisles
   looking like the hall simply ends there.

   The size in the snapshot is no help on its own: it is the tight box
   around those contents, so an outline drawn on it touches the outermost
   booth on all four sides by construction — which is exactly how this
   started, and it looked shrink-wrapped. The hall around that box comes
   from data/hallplan/outline.json instead: a margin per side, and the
   doorways. Both are ours; see the note in that file for where each
   number came from and how sure it is.

   The outline carries the hall's area colour — the same colour as the
   chip you tapped to get here, and the only other place on the map it
   appears, so booth state stays the loud channel. The doors matter more
   than they look: the halls connect to each other and to the Boulevard
   at a handful of points, and knowing which end of hall 7 faces the
   Boulevard is the difference between a 30 m walk and a 200 m one. A
   door that leads into another hall we draw is a tap that goes there —
   the hall row does the same job for a keyboard or a screen reader,
   which is why this whole layer is aria-hidden rather than pretending
   to be a second set of buttons. */

/* Metres of clear space left outside the hall in the viewBox. The
   outline stroke is centred on the wall and the door brackets stand off
   it, so without this the outer half of both would be clipped by the SVG
   viewport. Labels are allowed past it (#map { overflow: visible }) —
   they are text in the margin, and reserving hall-sized room for them
   would shrink every hall to fit a word. */
const GAP = 4;

const NO_MARGIN = { n: 0, e: 0, s: 0, w: 0 };

/* How far the wall stands off the booth box, per side. A hall may name
   its own; everything else takes the file's default, and a map with no
   file at all falls back to the box itself. */
function marginOf(id) {
  const file = state.outline;
  return { ...NO_MARGIN, ...(file.margin || {}), ...(file.halls?.[id]?.margin || {}) };
}

/* One wall: where it runs, which way is out of the hall, and the span of
   `at` values that lie on it. `at` is measured in the hall's own frame —
   x along the north and south walls, y along the east and west ones — so
   it starts negative, at the outside corner of the margin. */
function edgeOf(key, W, H, m) {
  return {
    n: { pt: (t) => [t, -m.n], out: [0, -1], t0: -m.w, t1: W + m.e },
    s: { pt: (t) => [t, H + m.s], out: [0, 1], t0: -m.w, t1: W + m.e },
    w: { pt: (t) => [-m.w, t], out: [-1, 0], t0: -m.n, t1: H + m.s },
    e: { pt: (t) => [W + m.e, t], out: [1, 0], t0: -m.n, t1: H + m.s },
  }[key];
}
const EDGE_KEYS = ["n", "e", "s", "w"];

const DOOR_DEPTH = 3.2;  /* how far a door's bracket stands off the wall */
const DOOR_FS = 4.2;     /* door label size, metres — offered from z1 */

const hallOf = (to) => (to && to.startsWith("hall:") ? to.slice(5) : null);

/* "Boulevard" for the concourse, "Hall 6.1" for a passage. An unknown
   destination gets no label rather than a raw key on the map. */
function doorLabel(to) {
  const hall = hallOf(to);
  if (hall) return t("where.hall", { hall });
  const key = `map.door.${to}`;
  const label = t(key);
  return label === key ? "" : label;
}

/* The stretches of one wall that are actually wall, i.e. the whole run
   from t0 to t1 minus every opening in it. Openings are clamped and
   merged, so two doors filed overlapping leave one gap rather than a
   sliver of wall between them. */
function wallSegments(t0, t1, doors) {
  const gaps = doors
    .map((d) => [Math.max(t0, d.at - d.span / 2), Math.min(t1, d.at + d.span / 2)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = t0;
  for (const [a, b] of gaps) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < t1) out.push([cur, t1]);
  return out;
}

function renderOutline(svg, id, W, H, m) {
  const doors = (state.outline.halls?.[id]?.doors || [])
    .filter((d) => EDGE_KEYS.includes(d.edge) && d.span > 0);
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "hall-outline");
  g.setAttribute("aria-hidden", "true");

  /* All four walls as one path: a few dozen segments at most, and one
     element keeps the boundary a single thing to style. */
  let d = "";
  for (const key of EDGE_KEYS) {
    const edge = edgeOf(key, W, H, m);
    for (const [a, b] of wallSegments(edge.t0, edge.t1, doors.filter((x) => x.edge === key))) {
      const [ax, ay] = edge.pt(a);
      const [bx, by] = edge.pt(b);
      d += `M${ax} ${ay}L${bx} ${by}`;
    }
  }
  const wall = document.createElementNS(SVGNS, "path");
  wall.setAttribute("class", "hall-wall");
  wall.setAttribute("d", d);
  g.appendChild(wall);

  /* Each opening gets a bracket standing off the wall — the gap alone
     reads as a missing bit of outline, the bracket reads as a doorway. */
  for (const door of doors) {
    const edge = edgeOf(door.edge, W, H, m);
    const a = Math.max(edge.t0, door.at - door.span / 2);
    const b = Math.min(edge.t1, door.at + door.span / 2);
    const [ox, oy] = edge.out;
    const [ax, ay] = edge.pt(a);
    const [bx, by] = edge.pt(b);
    const path =
      `M${ax} ${ay}L${ax + ox * DOOR_DEPTH} ${ay + oy * DOOR_DEPTH}` +
      `L${bx + ox * DOOR_DEPTH} ${by + oy * DOOR_DEPTH}L${bx} ${by}`;

    const hall = hallOf(door.to);
    const link = hall && hallExists(hall);
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("class",
      `hall-door${hall ? " to-hall" : ""}${door.approx ? " approx" : ""}`);
    p.setAttribute("d", path);
    g.appendChild(p);
    /* A 3 px stroke is not a tap target on a phone, so a tappable door
       carries an invisible fat one over it. */
    if (link) {
      const hit = document.createElementNS(SVGNS, "path");
      hit.setAttribute("class", "hall-door-hit");
      hit.setAttribute("d", path);
      hit.dataset.hall = hall;
      g.appendChild(hit);
    }
  }

  /* One label per destination per wall, not per door: hall 7's east end
     has three openings onto the same Boulevard, and saying so three times
     is noise. Labels sit outside the wall, where there is nothing to
     collide with and no booth name to cover. */
  const groups = new Map();
  for (const door of doors) {
    const text = doorLabel(door.to);
    if (!text) continue;
    const key = `${door.edge}|${door.to}`;
    if (!groups.has(key)) groups.set(key, { edge: door.edge, text, ats: [] });
    groups.get(key).ats.push(door.at);
  }
  for (const { edge: key, text, ats } of groups.values()) {
    const edge = edgeOf(key, W, H, m);
    const [px, py] = edge.pt(ats.reduce((a, b) => a + b, 0) / ats.length);
    const off = DOOR_DEPTH + 1.8;
    const el = document.createElementNS(SVGNS, "text");
    /* The anchor is a class rather than the text-anchor attribute: the
       map's own `#map text` rule sets it to middle, and a presentation
       attribute loses to any stylesheet rule — which put "Boulevard"
       straddling the doorway it names. */
    el.setAttribute("class", `door-lbl on-${key}`);
    el.setAttribute("font-size", DOOR_FS);
    if (key === "n" || key === "s") {
      el.setAttribute("x", px);
      /* glyphs sit above their baseline, so only the south wall's label
         has to be pushed down by a line to clear the wall */
      el.setAttribute("y", py + edge.out[1] * off + (key === "s" ? DOOR_FS * 0.8 : 0));
    } else {
      el.setAttribute("x", px + edge.out[0] * off);
      el.setAttribute("y", py + DOOR_FS * 0.34);
    }
    el.textContent = text;
    g.appendChild(el);
  }

  svg.appendChild(g);
}

/* ================= hall rendering ================= */

function renderHall(id) {
  const hall = state.halls.get(id);
  const [W, H] = hall.size;

  const m = marginOf(id);
  /* The drawing is the booth box, plus the hall around it, plus GAP for
     the outline's own stroke — so the picture starts outside the hall's
     north-west corner rather than at the box's. view.ox/oy carry that
     offset for everything that works in hall metres. */
  view.ox = -(m.w + GAP);
  view.oy = -(m.n + GAP);
  const vw = W + m.w + m.e + GAP * 2;
  const vh = H + m.n + m.s + GAP * 2;

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("id", "map");
  svg.setAttribute("viewBox", `${view.ox} ${view.oy} ${vw} ${vh}`);
  svg.setAttribute("width", vw);
  svg.setAttribute("height", vh);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("map.planAria", { hall: id }));
  /* The hall's structure is washed in its area colour — the only thing
     on the map that carries it, so booth state stays the loud channel. */
  svg.style.setProperty("--area", areaOf(id).colour || "");

  const blocks = document.createElementNS(SVGNS, "g");
  for (const b of hall.blocks) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("class", "hall-block");
    p.setAttribute("d", polyPath(b));
    blocks.appendChild(p);
  }
  svg.appendChild(blocks);

  /* labels live in their own layer above every stand shape — overlapping
     sub-stands (E-071a over E-071, gallery "…g" stands) would otherwise
     paint over their neighbours' names */
  const labels = document.createElementNS(SVGNS, "g");

  /* Paint big stands first so nested ones (30 of hall 10.1's 191 sit
     inside a larger stand) stay on top and stay tappable. The data file
     is ordered by stand number for reviewable diffs, which is not a
     containment order. */
  const painting = [...hall.stands].sort((a, b) => (b.a || 0) - (a.a || 0));

  state.stands = [];
  for (const s of painting) {
    const rec = standRecord(id, s);
    const g = document.createElementNS(SVGNS, "g");
    const lg = document.createElementNS(SVGNS, "g");
    const box = bbox(s.poly);
    const name = rec.exs.length ? rec.exs[0].name : (s.names[0] || "");

    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", polyPath(s.poly));
    g.appendChild(p);

    let cls = "", fs = 0;
    if (name) {
      const fit = fitName(name, box, s.a || box.w * box.h);
      const lines = fit.lines;
      fs = fit.fs;
      /* 0.45 m is the same floor the booth codes use: about 13 px on a
         phone at full zoom, which is the only band a name this small is
         offered in anyway. Anything below that is a smudge, and the
         stand is identified by tapping instead. */
      if (fs >= 0.45) {
        const t = document.createElementNS(SVGNS, "text");
        t.setAttribute("class", "lbl-name");
        t.setAttribute("x", box.cx);
        t.setAttribute("y", box.cy - ((lines.length - 1) * fs * 1.05) / 2);
        t.setAttribute("font-size", fs);
        lines.forEach((line, i) => {
          const ts = document.createElementNS(SVGNS, "tspan");
          ts.setAttribute("x", box.cx);
          if (i) ts.setAttribute("dy", fs * 1.05);
          ts.textContent = line;
          t.appendChild(ts);
        });
        lg.appendChild(t);
        rec.nameEl = t;
        rec.nameLines = lines.length;
      }
    }
    /* size tier: 1 = anchor booth … 4 = tiny. Drives how deep you have to
       zoom before this name is offered at all (see declutter). */
    rec.tier = fs >= 3 ? 1 : fs >= 1.9 ? 2 : fs >= 1.2 ? 3 : 4;

    /* Booth codes are set to fit their own booth. A fixed size overflowed
       the small stands ("F-073g" is wider than its 4 m box) and spilled
       across neighbours; below ~0.45 m it would be unreadable even at max
       zoom, so those stands stay code-less and are identified by tapping. */
    const codeFs = Math.min(1.6, (box.w * 0.9) / (s.nr.length * 0.62), box.h * 0.42);
    if (codeFs >= 0.45) {
      const code = document.createElementNS(SVGNS, "text");
      code.setAttribute("class", "lbl-code");
      code.setAttribute("x", box.cx);
      code.setAttribute("font-size", codeFs);
      /* Under the whole name block when there is one, otherwise centred.
         The name's last baseline sits (lines-1)/2 line-heights below the
         booth centre — forgetting that put the code inside a two-line
         name's second line. */
      const lastBaseline = box.cy + (((rec.nameLines || 1) - 1) * fs * 1.05) / 2;
      const y = fs ? lastBaseline + fs * 0.3 + codeFs : box.cy + codeFs * 0.36;
      code.setAttribute("y", Math.min(y, box.y1 - codeFs * 0.25));
      code.textContent = s.nr;
      lg.appendChild(code);
      rec.codeEl = code;
    }

    if (rec.exs.length) {
      cls += " covered";
      /* the guide's honesty rules win over the official filing: an
         unconfirmed booth stays marked as such even though a stand
         exists at that number */
      if (rec.exs.some((ex) => ex.locationConfirmed === false)) cls += " unconf";
    } else if (s.names.length) {
      cls += " official";
    }
    g.setAttribute("class", `stand ${cls}`);
    /* The label layer carries the same state classes — the CSS colours
       text by them — but is not a .stand: it holds no shape, takes no
       taps, and counting stands must not count it twice. */
    lg.setAttribute("class", `stand-labels ${cls}`);
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", t("map.standAria", { name: name || t("map.stand"), nr: s.nr }));

    rec.g = g;
    rec.lg = lg;
    state.stands.push(rec);
    svg.appendChild(g);
    labels.appendChild(lg);
  }
  /* After the stands: a stand that runs up to the wall would otherwise
     paint over the boundary it stops at, and a door's tap target has to
     sit above the stand behind it. Still under the label layer, which
     stays the topmost thing on the map. */
  renderOutline(svg, id, W, H, m);
  svg.appendChild(labels);

  $("#map")?.remove();
  $("#load").hidden = true;
  $("#stage").appendChild(svg);

  declutter.passes = 0;
  declutter();
  /* Webfont metrics differ from the fallback's, so measure again once
     Archivo Narrow has actually landed — one frame later, because
     fonts.ready resolves before the text using them has been laid out
     again, and measuring in that gap yields the fallback's widths and
     lets a name overlap its own booth code. Always two passes per hall,
     even when the fonts are cached, so "labels are settled" is a
     condition a test can wait on rather than a sleep. */
  document.fonts?.ready.then(() =>
    requestAnimationFrame(() => { if ($("#map") === svg) declutter(); }));

  refreshMarks();
  fitView(svg, vw, vh);
}

/* Decide, per zoom band, which labels are actually drawn.

   Two things make this necessary and neither is solvable by position
   alone: Koelnmesse files sub-stands that sit inside their parent
   (C-032 within C-030) or exactly on top of it (C-041g over Pawprint's
   C-041, same four corners), and small stands sit close enough that a
   name and a neighbour's code collide well before they overlap a booth.

   So: measure every label, walk them in priority order — guide-covered
   booths first, then biggest, names before codes — and drop any that
   collides with one already placed. A dropped label is not a loss: the
   stand is still tappable, and deeper zoom bands run their own pass, so
   labels reappear as their neighbours' competition thins out. */
function declutter() {
  const items = [];
  for (const rec of state.stands) {
    if (rec.nameEl) items.push({ el: rec.nameEl, rec, name: true });
    if (rec.codeEl) items.push({ el: rec.codeEl, rec, name: false });
  }
  /* Measure with every label shown. getBBox() reports zeros for a
     display:none element, so measuring while last pass's verdicts are
     still applied would put every hidden label in a phantom pile at the
     origin — and re-running after the webfonts land would then delete
     labels the first pass had placed. Clear first, measure, then decide.
     No paint happens in between, so nothing flashes.

     Both loops are batched — every write, then every read — because
     interleaving them forces a layout per label. */
  for (const it of items) it.el.classList.remove("nz0", "nz1", "nz2");
  for (const it of items) {
    const b = it.el.getBBox();
    const pad = 0.35;
    it.box = { x0: b.x - pad, y0: b.y - pad, x1: b.x + b.width + pad, y1: b.y + b.height + pad };
  }
  items.sort((a, b) =>
    (b.rec.exs.length ? 1 : 0) - (a.rec.exs.length ? 1 : 0) ||
    (b.rec.data.a || 0) - (a.rec.data.a || 0) ||
    (a.name ? 0 : 1) - (b.name ? 0 : 1)); /* a booth's name outranks its own code */

  const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  /* Bands are cumulative: whatever a band placed keeps its spot in every
     deeper band. Deciding each band independently let a label win at one
     zoom and lose at the next, so zooming in could make a name you were
     reading disappear. Zooming in now only ever adds labels. */
  const placed = new Set();
  declutter.passes = (declutter.passes || 0) + 1; /* tests wait on this */
  for (let band = 0; band < 3; band++) {
    const taken = items.filter((it) => placed.has(it)).map((it) => it.box);
    for (const it of items) {
      /* tier 1 names show from the start, tier 4 only at the deepest
         band; codes are a last-band detail */
      const offered = it.name ? it.rec.tier <= band + 2 : band === 2;
      const show = placed.has(it) || (offered && !taken.some((t) => hits(t, it.box)));
      it.el.classList.toggle(`nz${band}`, !show);
      if (show && !placed.has(it)) {
        placed.add(it);
        taken.push(it.box);
      }
    }
  }
}

/* re-apply saved/played classes without rebuilding the DOM */
function refreshMarks() {
  let saved = 0;
  for (const rec of state.stands) {
    const isSaved = rec.exs.some(exSaved);
    const isPlayed = rec.exs.length > 0 && rec.exs.every(exPlayed);
    for (const el of [rec.g, rec.lg]) {
      el.classList.toggle("saved", isSaved);
      el.classList.toggle("played", isPlayed);
    }
    if (isSaved) saved += 1;
  }
  const covered = state.stands.filter((r) => r.exs.length).length;
  $("#counts").textContent =
    t("map.counts", { n: state.stands.length, covered: covered || t("map.coveredNone") }) +
    (saved ? t("map.countsSaved", { n: saved }) : "");
  renderChips();
}

/* ================= areas ================= */

/* The halls fall into two areas, and which one you are looking at is not
   cosmetic: a consumer ticket opens the entertainment halls and does not
   open the business ones. The colours are Koelnmesse's own — the hall
   fills from the official plan, carried through the snapshot — so the
   two maps agree at a glance; the access line is ours, because no colour
   says "you cannot walk in here". */
const areaOf = (id) => {
  const key = state.index.halls.find((h) => h.id === id)?.area;
  const area = state.areas[key];
  return area ? { ...area, id: key } : {};
};

/* Named in the source as the hall's whole area ("Business"), read on the
   page as the place ("Business area"). */
const areaName = (area) => {
  if (!area.id) return area.label ? t("map.areaSuffix", { label: area.label }) : "";
  const label = t(`map.area.${area.id}.label`);
  return t("map.areaSuffix", { label: label === `map.area.${area.id}.label` ? area.label : label });
};

/* The access sentence lives in js/i18n/<lang>.js keyed by area id rather than
   in data/hallplan/index.json: that file is regenerated by
   tools/fetch-hallplan.mjs and would lose a hand-added translation on the
   next refresh. The generated English rides along as the fallback. */
const areaAccess = (area) => {
  if (!area.id) return area.access || "";
  const s = t(`map.area.${area.id}.access`);
  return s === `map.area.${area.id}.access` ? area.access || "" : s;
};

/* The banner is this page's switch as well as its warning. It already appears
   on exactly the five halls where trade mode changes anything and never on
   the seven where it does not, it sits directly above what changes, and it
   already says "trade & media badge only" — so the switch finishes that
   sentence rather than introducing a second idea, and the map keeps every
   pixel it has for the map. */
function renderAccess(id) {
  const area = areaOf(id);
  const note = $("#access");
  note.hidden = !area.access;
  if (!area.access) {
    note.innerHTML = ""; // don't leave the last business hall's switch behind
    return;
  }
  note.style.setProperty("--area", area.colour || "");
  const on = GCMarks.tradeMode();
  note.innerHTML =
    `<b>${esc(areaName(area))}</b> — ${esc(areaAccess(area))}` +
    (area.trade
      ? ` <button class="map-access-btn${on ? " is-on" : ""}" id="access-trade" type="button">${
          esc(on ? t("map.hideExhibitors") : t("map.showExhibitors"))
        }</button>`
      : "");
  $("#access-trade")?.addEventListener("click", () => setTrade(!GCMarks.tradeMode()));
}

/* The guide owns the preference; this page just writes it and redraws itself,
   because a tab gets no storage event for its own write. */
function setTrade(on) {
  if (GCMarks.tradeMode() === on) return;
  GCMarks.setTradeMode(on);
  /* Turning it on may need rows this page has never fetched — loadTrade()
     redraws the hall itself once they land. Everything else redraws now. */
  if (on && !state.trade.length) loadTrade();
  else redrawJoin();
  renderAccess(state.hall);
  if ($("#map")) refreshMarks(); // the counts line and the chip row both move
}

/* ================= hall chips ================= */

const standsOf = (ex) => (ex.stands?.length ? ex.stands : [{ hall: ex.hall, booth: ex.booth }]);

function hallSavedCount(id) {
  const hall = state.halls.get(id);
  /* Not loaded yet — count from guide data alone. Reads through standsOf so
     a multi-stand trade record is counted in every hall it stands in, not
     only in the scalar `hall` a curated card carries. */
  if (!hall) {
    return [...state.exhibitors, ...state.trade].filter(
      (ex) => exSaved(ex) && standsOf(ex).some((s) => String(s.hall) === id)
    ).length;
  }
  let n = 0;
  for (const s of hall.stands) if (standRecord(id, s).exs.some(exSaved)) n += 1;
  return n;
}

/* One scrolling row, but grouped: the halls of an area sit behind that
   area's name in that area's colour, so the row doubles as the legend
   and the business halls can't be mistaken for more of the show. The
   index is written area-major, so grouping is just a change of key
   between chips. */
function renderChips() {
  let last = null;
  $("#halls").innerHTML = state.index.halls
    .map((h) => {
      const area = state.areas[h.area] || {};
      let head = "";
      /* An index.json from before the areas existed (a cached copy in an
         installed app) simply has none, and the row falls back to the
         flat list of chips it always was. */
      if (h.area !== last) {
        last = h.area;
        if (area.label)
          head = `<span class="hall-group" style="--area:${esc(area.colour || "")}"
            aria-hidden="true">${esc(area.label)}${
            area.trade ? ` <i class="hall-group-trade">${esc(t("map.tradeOnlyLabel"))}</i>` : ""
          }</span>`;
      }
      const n = hallSavedCount(h.id);
      /* Screen readers get no group heading — the row is one flat list to
         them — so each chip names its own area, and the trade-only ones
         say so before you are taken there. */
      const label =
        t("where.hall", { hall: h.id }) +
        (area.label ? `, ${areaName(area)}` : "") +
        (area.trade ? t("map.tradeVisitorsOnly") : "") +
        (n ? t("map.chipSavedAria", { n }) : "");
      return `${head}<button class="chip hall-chip ${h.id === state.hall ? "active" : ""}" type="button"
        data-hall="${esc(h.id)}" style="--area:${esc(area.colour || "")}"
        aria-label="${esc(label)}">${esc(t("where.hall", { hall: h.id }))}${
        n ? ` <span class="chip-saved" aria-hidden="true">●${n}</span>` : ""
      }</button>`;
    })
    .join("");
}

/* ================= pan / zoom ================= */

/* ox/oy: the hall coordinate the drawing's top-left corner sits at —
   negative, because the picture starts outside the hall (see renderHall). */
const view = { s: 1, tx: 0, ty: 0, fit: 1, min: 1, max: 1, ox: 0, oy: 0 };
let raf = 0;

function applyView() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const map = $("#map");
    if (!map) return;
    map.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    const z = view.s / view.fit;
    map.setAttribute("class", z < 1.7 ? "z0" : z < 3.4 ? "z1" : "z2");
  });
}

function fitView(svg, W, H) {
  const r = $("#stage").getBoundingClientRect();
  view.fit = Math.min(r.width / W, r.height / H) * 0.94;
  view.min = view.fit * 0.8;
  /* ~10× fit ≈ a 15 m slice of hall on a phone — enough to read any booth
     code; deeper just gets lost in empty aisle */
  view.max = view.fit * 10;
  view.s = view.fit;
  view.tx = (r.width - W * view.s) / 2;
  view.ty = (r.height - H * view.s) / 2;
  applyView();
}

function clampView() {
  const map = $("#map");
  if (!map) return;
  const W = +map.getAttribute("width"), H = +map.getAttribute("height");
  const r = $("#stage").getBoundingClientRect();
  const m = 60; /* keep at least this much content on screen */
  view.tx = Math.min(r.width - m, Math.max(m - W * view.s, view.tx));
  view.ty = Math.min(r.height - m, Math.max(m - H * view.s, view.ty));
}

function zoomAt(px, py, factor) {
  const s = Math.min(view.max, Math.max(view.min, view.s * factor));
  const k = s / view.s;
  view.tx = px - (px - view.tx) * k;
  view.ty = py - (py - view.ty) * k;
  view.s = s;
  clampView();
  applyView();
}

const stage = $("#stage");
const pointers = new Map();
let pinch = null;  /* {d0, mid0, s0, tx0, ty0} */
let tap = null;    /* {x, y, t, target} */
let lastTap = { t: 0, x: 0, y: 0 };

/* Chrome and Firefox start a native element drag from a mouse-down on SVG
   content, which steals the gesture and drags a ghost of the map instead
   of panning it. Cancelling both the default of the pointerdown and any
   dragstart that still gets through keeps every drag a pan. */
stage.addEventListener("dragstart", (e) => e.preventDefault());

stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#sheet")) return;
  e.preventDefault();
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  $("#map")?.style.setProperty("will-change", "transform");
  if (pointers.size === 1) {
    tap = { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target };
    stage.classList.add("dragging");
  } else if (pointers.size === 2) {
    tap = null;
    const [a, b] = [...pointers.values()];
    pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y),
      mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      s0: view.s, tx0: view.tx, ty0: view.ty,
    };
  }
});

stage.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const rect = stage.getBoundingClientRect();
  if (pointers.size === 1 && !pinch) {
    view.tx += e.clientX - p.x;
    view.ty += e.clientY - p.y;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 9) tap = null;
    clampView();
    applyView();
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const s = Math.min(view.max, Math.max(view.min, pinch.s0 * (d / pinch.d0)));
    const k = s / pinch.s0;
    const m0 = { x: pinch.mid0.x - rect.left, y: pinch.mid0.y - rect.top };
    view.s = s;
    view.tx = mid.x - (m0.x - pinch.tx0) * k;
    view.ty = mid.y - (m0.y - pinch.ty0) * k;
    clampView();
    applyView();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) {
    stage.classList.remove("dragging");
    $("#map")?.style.removeProperty("will-change");
  }
  if (tap && e.type === "pointerup" && Date.now() - tap.t < 400) {
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const now = Date.now();
    if (now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
      zoomAt(x, y, 2.2); /* double tap */
      lastTap = { t: 0, x, y };
    } else {
      lastTap = { t: now, x, y };
      /* A door into another hall goes there. Checked before the stand
         underneath it, which is the whole reason its hit path is drawn on
         top: tapping the passage out of hall 7 must not select the booth
         standing beside it. */
      const door = tap.target.closest?.(".hall-door-hit");
      if (door) showHall(door.dataset.hall);
      else {
        const g = tap.target.closest?.(".stand");
        selectStand(g ? state.stands.find((r) => r.g === g) : null);
      }
    }
    tap = null;
  }
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(1.0015, -e.deltaY));
}, { passive: false });

/* ================= selection & sheet ================= */

function zoomToStand(rec) {
  const box = bbox(rec.data.poly);
  const r = stage.getBoundingClientRect();
  view.s = Math.min(view.max, Math.max(view.fit * 3.4, view.fit));
  /* −ox/−oy: the drawing starts outside the hall, not at the booth box */
  view.tx = r.width / 2 - (box.cx - view.ox) * view.s;
  /* 0.4 rather than 0.5: the sheet covers the bottom of the stage */
  view.ty = r.height * 0.4 - (box.cy - view.oy) * view.s;
  clampView();
  applyView();
}

function selectStand(rec, { zoom = false } = {}) {
  state.sel?.g.classList.remove("sel");
  state.sel = rec || null;
  const sheet = $("#sheet");
  if (!rec) {
    sheet.classList.remove("open");
    /* Take the closed sheet back out of the document for assistive tech
       once it has slid away — an offscreen panel of stale booth details
       is still readable otherwise. */
    sheet.addEventListener("transitionend", () => {
      if (!sheet.classList.contains("open")) sheet.hidden = true;
    }, { once: true });
    return;
  }
  rec.g.classList.add("sel");
  if (zoom) zoomToStand(rec);

  const s = rec.data;
  const ex = rec.exs[0];
  $("#sheet-name").textContent = ex ? ex.name : (s.names[0] || t("map.standNr", { nr: s.nr }));
  $("#sheet-loc").textContent =
    t("map.sheetLoc", { hall: state.hall, nr: s.nr }) +
    (s.also ? t("map.sheetAlso", { list: s.also.join(", ") }) : "") +
    (s.a ? ` · ~${s.a} m²` : "");

  const badges = [];
  if (rec.exs.some(exSaved))
    badges.push(`<span class="badge badge-saved">${esc(t("mark.saved"))}</span>`);
  if (ex && ex.locationConfirmed === false)
    badges.push(`<span class="badge badge-unconf">${esc(t("map.unconfBadge"))}</span>`);
  if (rec.exs.length && rec.exs.every(exPlayed))
    badges.push(`<span class="badge">${esc(t("mark.played"))}</span>`);
  $("#sheet-badges").innerHTML = badges.join("");

  let who;
  if (ex && ex.trade) {
    /* A directory-backed booth: no lineup, no queue forecast, nothing
       editorial at all — what it does have is a country, its product groups
       and the fact that you need a badge to be standing here. */
    who = `<b>${esc(ex.name)}</b>`;
    if (ex.country) who += ` · ${esc(countryLabel(ex.country))}`;
    if (ex.cats.length) {
      who += `<br>${esc(ex.cats.slice(0, 4).join(", "))}` +
        (ex.cats.length > 4 ? esc(t("map.plusMore", { n: ex.cats.length - 4 })) : "");
    }
    /* Shared business stands run large — one 837 m² stand in hall 2.1 holds
       fourteen companies — so the neighbours are capped the way the official
       plan's own name list is, rather than filling the sheet. */
    if (rec.exs.length > 1) {
      const rest = rec.exs.slice(1);
      who += `<br>${esc(t("map.alsoHere"))}: ${rest.slice(0, 6).map((x) => esc(x.name)).join(", ")}` +
        (rest.length > 6 ? esc(t("map.plusMore", { n: rest.length - 6 })) : "");
    }
    who += `<br><span class="map-sheet-dim">${esc(t("directory.businessArea"))}</span>`;
  } else if (ex) {
    const games = ex.games || [];
    who = `<b>${esc(ex.name)}</b>`;
    if (ex.crowd)
      who += ` · ${esc(t("map.queueForecast", { n: ex.crowd, label: crowdLabel(ex.crowd) }))}`;
    if (games.length) {
      const titles = games.slice(0, 3).map((g) => esc(g.title)).join(", ");
      who += `<br>${esc(t("map.gamesCount", { n: games.length }))}: ${titles}` +
        (games.length > 3 ? esc(t("map.plusMore", { n: games.length - 3 })) : "");
    }
    if (rec.exs.length > 1)
      who += `<br>${esc(t("map.alsoHere"))}: ${rec.exs.slice(1).map((x) => esc(x.name)).join(", ")}`;
  } else if (s.names.length) {
    /* Named in the official plan but not in the guide — say so rather
       than leave a blank booth looking like a data bug.

       In a business hall with trade mode off that message is wrong, and it
       is the page's one dead end: the guide has most of these rows and is
       simply not offering them, the save button is hidden, and there is
       nothing here to press. "Most", not "all" — 18 of hall 2.1's 78 stands
       stay uncovered either way — so the line is hedged, and turning the
       switch on re-renders this sheet with whichever answer is true. */
    const gated = GCMarks.isBusinessHall(state.hall) && !GCMarks.tradeMode();
    who = s.names.slice(0, 6).map(esc).join(", ") +
      (s.names.length > 6 ? esc(t("map.plusMore", { n: s.names.length - 6 })) : "") +
      (gated
        ? `<br><span class="map-sheet-dim">${esc(t("map.gatedHint"))}</span>` +
          `<br><button class="map-sheet-enable" id="sheet-trade" type="button">${esc(
            t("map.showTrade")
          )}</button>`
        : `<br><span class="map-sheet-dim">${esc(t("map.notCovered"))}</span>`);
  } else {
    who = `<span class="map-sheet-dim">${esc(t("map.noExhibitor"))}</span>`;
  }
  $("#sheet-who").innerHTML = who;
  /* setTrade() redraws the join and re-selects this stand, so the sheet
     answers with the exhibitor — or with the honest "not covered". */
  $("#sheet-trade")?.addEventListener("click", () => setTrade(true));

  const save = $("#sheet-save");
  save.hidden = !ex;
  if (ex) {
    const on = state.marks.saved.exhibitors.has(ex.id);
    save.dataset.on = on;
    save.textContent = on ? t("map.unsaveBooth") : t("map.saveBooth");
    save.onclick = () => {
      toggleSaved(ex.id);
      selectStand(rec);
    };
  }
  /* Straight to the exhibitor's card in the guide when we know who this
     is; the saved list otherwise. A trade booth has no card to land on, so
     it offers the exhibitor's own official profile instead — a link into the
     guide would drop the visitor on a grid that does not contain them. */
  const link = $("#sheet-link");
  if (ex && ex.trade && ex.profile) {
    link.href = ex.profile;
    link.textContent = t("map.officialProfile");
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener nofollow");
  } else {
    link.href = ex && !ex.trade ? `./#exhibitors?ex=${encodeURIComponent(ex.id)}` : "./#exhibitors";
    link.textContent = t("map.openInGuide");
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }

  sheet.hidden = false;
  /* force a layout between "displayed" and "open" so the slide-in has a
     start state to animate from — display:none has none */
  void sheet.offsetHeight;
  sheet.classList.add("open");
  /* replaceState: shareable position without stuffing the back stack —
     and it never fires hashchange, so our own writes can't loop */
  history.replaceState(null, "", `#${state.hall}/${[...rec.codes][0] || ""}`);
}

$("#sheet-close").addEventListener("click", () => selectStand(null));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.sel) selectStand(null);
});

window.addEventListener("storage", (e) => {
  const keys = [...Object.values(GCMarks.MARK_KEYS), GCMarks.PREFS_KEY];
  if (e.key !== null && !keys.includes(e.key)) return;
  /* The guide writes prefs on nearly every interaction, so this fires far
     more often than a mark change and can easily land before the hall index
     has arrived. Everything below needs it; nothing below is urgent, and
     main() renders the current state anyway once it lands. */
  if (!state.index) return;
  loadMarks();
  /* Trade mode turned on in the guide, or a trade booth saved there — either
     way this page now needs rows it has not fetched. loadTrade() redraws the
     hall itself once they land; when it has nothing to fetch, the join still
     has to be rebuilt, because which curated cards are offered just changed. */
  if (wantsTrade() && !state.trade.length) loadTrade();
  else if (e.key === null || e.key === GCMarks.PREFS_KEY) redrawJoin();
  refreshMarks();
  if (state.sel) selectStand(state.sel);
});

/* ================= source credit ================= */

/* Where the outlines came from and when they were checked — the same
   promise the guide's ⓘ sources dialog makes about every booth number,
   kept in the one place this page has room for it. Link and date come
   from the snapshot itself, so a re-run of tools/fetch-hallplan.mjs
   re-dates it without anyone remembering to. */
function renderSourceNote() {
  const { source, fetched } = state.index;
  const date = formatDate(fetched);
  /* The doors are the one thing on this map that is not traceable to the
     official plan — it files no wall and no doorway — so the credit line
     stops short of claiming them. Per hall, not for the map as a whole:
     five of the twelve have no doors filed yet, and a disclaimer about
     something that isn't on the screen is just a longer footer. */
  const ours = state.outline.halls?.[state.hall]?.doors?.length
    ? ` · ${esc(t("map.doorsApprox"))}`
    : "";
  $("#srcnote").innerHTML =
    `${esc(t("map.outlines"))}: <a href="${esc(source)}" target="_blank" rel="noopener nofollow">${esc(
      t("map.officialHallPlan")
    )}</a> · ${esc(t("map.checkedOn", { date }))}${ours}`;
}

/* ================= boot ================= */

async function showHall(id, { standCode = null } = {}) {
  if (id !== state.hall || !$("#map")) {
    state.hall = id;
    state.sel = null;
    $("#sheet").classList.remove("open");
    renderChips();
    /* Twelve halls no longer fit the row, so a hall opened from a deep
       link or a chip at the far end is scrolled to rather than left off
       screen. Only on a hall change: doing it from refreshMarks would
       yank the row back while someone is reading along it. */
    $("#halls .chip.active")?.scrollIntoView({ inline: "center", block: "nearest" });
    renderAccess(id);
    renderSourceNote(); /* its door clause is per hall */
    if (!state.halls.has(id)) $("#load").hidden = false;
    await loadHall(id);
    renderHall(id);
  }
  if (standCode) {
    const rec = state.stands.find((r) => r.codes.has(standCode));
    if (rec) selectStand(rec, { zoom: true });
  }
}

const hallExists = (id) => Boolean(state.index?.halls.some((h) => h.id === id));

$("#halls").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) showHall(chip.dataset.hall);
});

/* the address bar is an input too: a pasted #hall/stand link navigates */
window.addEventListener("hashchange", () => {
  const [h, code] = location.hash.slice(1).split("/");
  if (hallExists(h)) showHall(h, { standCode: code ? code.toUpperCase() : null });
});

window.addEventListener("resize", () => {
  const map = $("#map");
  if (map) fitView(map, +map.getAttribute("width"), +map.getAttribute("height"));
});

async function main() {
  loadMarks();
  const bust = `?v=${Date.now()}`;
  const [index, exhibitors, outline] = await Promise.all([
    fetch(`data/hallplan/index.json${bust}`).then((r) => r.json()),
    fetch(`data/exhibitors.json${bust}`).then((r) => r.json()),
    /* Optional, unlike the other two: an installed shell whose service
       worker predates this file has nothing to serve for it offline, and
       a hall without it is drawn on its booth box with no openings —
       tighter than it should be, but a map. Not worth failing a boot over. */
    fetch(`data/hallplan/outline.json${bust}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})),
  ]);
  state.index = index;
  state.areas = index.areas || {};
  state.outline = outline || {};
  state.exhibitors = exhibitors;
  buildJoin();
  renderSourceNote();
  /* Not awaited: the entertainment halls are the common case and must not
     wait on a 43 KB file they don't use. The business halls fill in when it
     lands, which is what the redraw in loadTrade() is for. */
  if (wantsTrade()) loadTrade();

  /* deep link first, then the hall holding most of your saved stops,
     then the default */
  const [hallArg, code] = location.hash.slice(1).split("/");
  let start = hallExists(hallArg) ? hallArg : null;
  if (!start) {
    let best = 0;
    for (const h of index.halls) {
      const n = hallSavedCount(h.id);
      if (n > best) {
        best = n;
        start = h.id;
      }
    }
  }
  await showHall(start || DEFAULT_HALL, { standCode: code ? code.toUpperCase() : null });

  /* Idle-prefetch the rest: 1–8 KB gzipped each, and the service worker
     has them precached anyway — this just spares the parse on tap. */
  const prefetch = () => {
    for (const h of state.index.halls) loadHall(h.id).catch(() => {});
  };
  "requestIdleCallback" in window
    ? requestIdleCallback(prefetch, { timeout: 4000 })
    : setTimeout(prefetch, 3000);
}

main().catch((err) => {
  $("#load").hidden = false;
  $("#load").textContent = t("map.loadFailed", { error: err.message });
});
