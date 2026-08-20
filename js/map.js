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
const dayName = GCI18N.dayName || ((date) => String(date));
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
  campus: null,         // data/hallplan/campus.json — the whole site, once fetched
  labels: {},           // {countries, dirGroups} from data/i18n/<lang>.json
  exhibitors: [],       // data/exhibitors.json
  trade: [],            // business-hall rows from data/directory.json, once loaded
  halls: new Map(),     // hall id -> hall json
  byStand: new Map(),   // "hall:CODE" -> [exhibitor, …]
  hall: null,           // current hall id, or OVERVIEW
  stands: [],           // render records for the current hall
  plates: [],           // render records for the overview's hall plates
  marks: { saved: null, played: null },
  itinerary: { exhibitors: new Map(), games: new Map() },
  planRanks: new Map(),  // stop key -> position, the order the guide was left in
  sel: null,
  /* the day the route overlay is showing: an ISO date, "none" for the stops
     still waiting for a day, or null for "overlay off" */
  day: null,
  route: [],            // this hall's stops for that day, in plan order
  labelsLayer: null,    // the drawn hall's label layer — the route line goes under it
};

/* ================= marks ================= */

function loadMarks() {
  state.marks.saved = GCMarks.readMarks("saved");
  state.marks.played = GCMarks.readMarks("played");
  /* The plan rides along with the marks rather than being loaded on its own:
     every caller here is reacting to "the lists may have moved", and a day
     assignment — or a stop moved up the list — made in the guide is exactly
     that kind of move.

     Guarded for the same reason as the GCI18N shim above: a stale cached
     js/marks.js without these reads must not stop the map booting. */
  state.itinerary = GCMarks.readItinerary?.() || state.itinerary;
  state.planRanks = GCMarks.readOrder ? GCMarks.orderRanks(GCMarks.readOrder()) : state.planRanks;
}

/* Where a booth sits in the plan, read exactly as the guide's hall lens reads
   it: a booth is keyed by its own id there and here, so pin 3 is the third
   row of the hall the pins were drawn from, arranged or not. */
const exRank = (ex) =>
  state.planRanks.get(GCMarks.stopKey("exhibitor", ex.id)) ?? GCMarks.UNRANKED;

const exSaved = (ex) => GCMarks.hasSaved(state.marks.saved, ex);
/* A booth reads as played when marked directly, or when every game you
   saved there is played — the same asymmetry as the guide's hasPlayed. */
const exPlayed = (ex) => {
  const mine = GCMarks.savedGames(state.marks.saved, ex);
  return state.marks.played.exhibitors.has(ex.id) ||
    (mine.length > 0 && mine.every((g) => state.marks.played.games.has(GCMarks.gameKey(g.title))));
};

/* Which show day(s) this exhibitor is planned for: their own assignment
   plus those of any saved game standing here — the same union the plan
   board's day lens files a stop under, so the sheet and the board name
   the same days. Sorted, because ISO dates sort into show order. */
function plannedDays(ex) {
  const days = new Set();
  const own = state.itinerary.exhibitors.get(ex.id);
  if (own) days.add(own);
  for (const g of GCMarks.savedGames(state.marks.saved, ex)) {
    const day = state.itinerary.games.get(GCMarks.gameKey(g.title));
    if (day) days.add(day);
  }
  return [...days].sort();
}

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
  /* The overview draws no stands, but it counts them: a hall's saved
     total is read through the join, so it moves when the join does — on
     the chips as much as on the plates, which is refreshMarks' overview
     branch rather than refreshCampus on its own. Trade rows landing on
     an overview that was already up used to move the plates and leave
     the chip row saying nothing at all about the business halls. */
  if (onOverview()) return refreshMarks();
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
   order. Gryphline's Hall 8.1 stands showed it: C-020 B-012 and its gallery
   agree byte for byte, while B-021 C-030 is filed [90,10] [114,10] [114,40]
   [90,40] and B-021g C-030g is the same rectangle written backwards,
   [90,40] [114,40] [114,10] [90,10]. So one of Gryphline's two booths
   answered to a tap and the other returned an empty "B-021g C-030g".

   Comparing the literal coordinate string matched only the pairs that
   happened to agree — 65 of 134 across the show. This reduces the corner
   ring to a canonical form instead: the smallest rotation of the ring and
   of its reverse, which two polygons share exactly when they are the same
   ring, whichever corner it starts from and whichever way round it runs. */
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
   place, one floor above the other. Drawn as two stands, the empty upper
   one lands on top and swallows every tap — which is why tapping the Indie
   Arena Booth answered "no exhibitor filed for this stand" while the deep
   link to it was right all along.

   Same footprint means same place, so they become one stand: one shape,
   every stand number, every name filed on either level. This joins only
   stands on the same corners — a sub-stand that sits *inside* a larger one
   (E-071a within E-071, 30 of them in hall 10.1) has a footprint of its own
   and stays separate, which is what the painting order below is for. 138
   pairs across twelve halls; hall 10.1 alone has 26. */
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

/* Set a name as large as the booth allows, by trying every way of breaking
   it across one, two or three lines and keeping whichever fits biggest.
   Breaking by character count instead — balance the halves, done — reads
   fine on a square booth and fails on a narrow one: MOZA Racing's stand is
   4 m wide, so "MOZA Racing" on one line fitted at 0.6 m and got dropped as
   unreadable, where "MOZA / Racing" fits at 1.2 m. Names are short, so
   trying every break is a handful of candidates per booth. */
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
   booth on all four sides — which is how this started, and it looked
   shrink-wrapped. The hall around that box comes from
   data/hallplan/outline.json instead: a margin per side, and the doorways.
   Both are ours; see the note in that file for where each number came from
   and how sure it is.

   The outline carries the hall's area colour — the same colour as the chip
   you tapped to get here, and the only other place on the map it appears,
   so booth state stays the loud channel. The doors matter more than they
   look: the halls connect to each other and to the Boulevard at a handful
   of points, and knowing which end of hall 7 faces the Boulevard is the
   difference between a 30 m walk and a 200 m one. A door leading into
   another hall we draw is a tap that goes there. The hall row does the same
   job for a keyboard or a screen reader, which is why this whole layer is
   aria-hidden rather than pretending to be a second set of buttons. */

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
/* Door label size, in metres like every other label here. 7 m is the
   ceiling fitName() gives a booth name, so this is exactly as big as the
   largest name on the map: if any label is legible at a given zoom, this
   one is. The doors can then be named from the widest band, rather than
   waiting for you to zoom in on a hall you are trying to find your way
   out of. */
const DOOR_FS = 7;
const LBL_OFF = DOOR_DEPTH + 1.8;    /* label baseline, metres out from the wall */
const LBL_BAND = LBL_OFF + DOOR_FS;  /* room a labelled wall needs beyond itself */

/* A leg pointer's name — the hall a planned day leaves for — is set one line
   further out again, in the same margin. It belongs to the day route rather
   than to the building, but renderHall has to reserve room for it before any
   day has been picked, so the band is declared up here with the door's.

   Smaller than DOOR_FS on purpose: the door names where this opening goes,
   which is true whatever is on screen; the leg names where *your* plan goes
   through it, which is true only while a day is lit. The second should not
   shout over the first. */
const LEG_FS = 5;
const LEG_OFF = LBL_BAND + 1.6;   /* leg name baseline, metres out from the wall */
const LEG_BAND = LEG_OFF + LEG_FS;

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

const doorsOf = (id) =>
  (state.outline.halls?.[id]?.doors || [])
    .filter((d) => EDGE_KEYS.includes(d.edge) && d.span > 0);

/* Which walls will carry a name, so renderHall can leave room for it
   beyond them before it has drawn anything. */
const labelledEdges = (doors) =>
  new Set(doors.filter((d) => doorLabel(d.to)).map((d) => d.edge));

function renderOutline(svg, id, W, H, m, doors) {
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
    const el = document.createElementNS(SVGNS, "text");
    el.setAttribute("class", `door-lbl on-${key}`);
    el.setAttribute("font-size", DOOR_FS);
    if (key === "n" || key === "s") {
      el.setAttribute("x", px);
      /* glyphs sit above their baseline, so only the south wall's label
         has to be pushed down by a line to clear the wall */
      el.setAttribute("y", py + edge.out[1] * LBL_OFF + (key === "s" ? DOOR_FS * 0.8 : 0));
    } else {
      /* Turned to run *along* an end wall rather than out from it. Set
         across, "Boulevard" is 41 m of text against a hall 82 m deep — it
         left the stage entirely at fit zoom, and the only way to make room
         would be to shrink the hall to a third of the screen. Turned, it
         costs one line of depth instead. Reading downward on the east wall
         and upward on the west is the usual convention and keeps the glyphs
         on the outside in both cases. */
      el.setAttribute(
        "transform",
        `translate(${px + edge.out[0] * LBL_OFF} ${py}) rotate(${key === "e" ? 90 : -90})`
      );
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
  const doors = doorsOf(id);
  /* The drawing is the booth box, plus the hall around it, plus room
     beyond each wall: GAP for the outline's own stroke, a whole line of
     type on a wall that is named, and a second line on a wall with a
     doorway in it, where the day route may put the hall it leaves for.
     The labels are drawn outside, and the stage clips whatever the
     viewBox does not reserve. So the picture starts outside the hall's
     north-west corner rather than at the box's, and view.ox/oy carry
     that offset for everything that works in hall metres.

     The second line is reserved whether or not a day is lit, and even on
     a wall no plan will ever point through. The overlay comes and goes
     with a chip tap, long after this is decided; growing the picture
     under someone who has zoomed into a booth would cost more than the
     6 m of margin does, and a name pushed inside instead lands on the
     stands the map is for. */
  const named = labelledEdges(doors);
  const doored = new Set(doors.map((d) => d.edge));
  const out = (k) =>
    Math.max(GAP, doored.has(k) ? LEG_BAND : named.has(k) ? LBL_BAND : 0);
  view.ox = -(m.w + out("w"));
  view.oy = -(m.n + out("n"));
  const vw = W + m.w + m.e + out("w") + out("e");
  const vh = H + m.n + m.s + out("n") + out("s");

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
  state.plates = [];
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
    /* Kept as written, because the route overlay appends a stop number to it
       and has to be able to take that number back off again. */
    rec.aria = t("map.standAria", { name: name || t("map.stand"), nr: s.nr });
    g.setAttribute("aria-label", rec.aria);

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
  renderOutline(svg, id, W, H, m, doors);
  svg.appendChild(labels);
  state.labelsLayer = labels;

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
  /* The overview has no stands to mark — what it carries is a saved count
     per hall, which moves for the same reasons and is refreshed here for
     the same one: everything that writes a mark ends up calling this. */
  if (onOverview()) {
    /* First, and not only before the chips: renderRoute is what drops a day
       nobody planned, and both the plates under it and the chips above it now
       count that day's stops rather than the whole saved list. */
    renderRoute();
    refreshCampus();
    renderChips();
    return;
  }
  for (const rec of state.stands) {
    const isSaved = rec.exs.some(exSaved);
    const isPlayed = rec.exs.length > 0 && rec.exs.every(exPlayed);
    for (const el of [rec.g, rec.lg]) {
      el.classList.toggle("saved", isSaved);
      el.classList.toggle("played", isPlayed);
    }
  }
  /* The overlay is a reading of the saved list and the plan, so it is redrawn
     wherever those are: this runs after every hall render, every mark change
     and every storage event. */
  renderRoute();
  const covered = state.stands.filter((r) => r.exs.length).length;
  /* The first two numbers describe the drawing — how many stands it holds and
     how many of them the guide covers. The third describes your plan, and so
     counts stops, the way the chip for this hall directly above it does. It
     used to count lit rectangles, which put "5 saved" under a chip reading 2
     for the Thursday holding Capcom and Nintendo: one hall, one screen, two
     numbers for the same question. */
  const saved = hallCountBy(state.hall, exSaved);
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

/* How much of your plan stands in one hall — the number on its chip, and,
   summed over a building's levels, the number on its plate on the overview.

   Stops, not stands. A card holding four stands in one hall (Nintendo does)
   is one place you walk to, one row in the plan, one pin on the floor, and
   so one here: this badge is read next to a hall name as "how much of mine
   is in there", and every other number the guide prints about a saved list
   answers that question in stops. Counting rectangles instead made the badge
   mean one thing with a day picked and another without — hall 9 read ●5 on
   the saved list and ●2 on the Thursday that held both its booths — and sent
   the map's opening hall to whichever hall happened to hold the most
   *stands*, past the one holding most of the plan.

   The two branches count the same unit for the same reason. Which side of
   the parse you are on decides how well the guide can see the hall, never
   what a stop is. */
function hallCountBy(id, counts) {
  const hall = state.halls.get(id);
  /* Not loaded yet — count from guide data alone. Reads through standsOf so
     a multi-stand trade record is counted in every hall it stands in, not
     only in the scalar `hall` a curated card carries. */
  if (!hall) {
    return [...state.exhibitors, ...state.trade].filter(
      (ex) => counts(ex) && standsOf(ex).some((s) => String(s.hall) === id)
    ).length;
  }
  const stops = new Set();
  for (const s of hall.stands)
    for (const ex of standRecord(id, s).exs) if (counts(ex)) stops.add(ex);
  return stops.size;
}

const hallSavedCount = (id) => hallCountBy(id, exSaved);

/* The same count with a day over it: how many of that day's stops stand in
   this hall. With the overlay on, "which hall is today in" is the question
   the row is being read for, and answering it with the whole saved list
   would send you into halls you have nothing planned in. Same unit either
   way, so the chip agrees with the number the route bar prints below it. */
const hallStopCount = (id) =>
  hallCountBy(
    id,
    (ex) =>
      GCMarks.hasSaved(state.marks.saved, ex) &&
      GCMarks.stopDays(state.marks.saved, state.itinerary, ex).has(state.day)
  );

/* Is the day scoping what the row counts? Whenever a day is picked — on a
   hall, where the row says which halls that day is in, and on the overview,
   where the plates directly under the row say the same thing and the two
   disagreeing would be the worst of both readings. (The overview used to be
   the exception, back when it carried no route of its own to agree with.)

   One predicate rather than several `state.day` tests, because the number and
   the name read off it: a chip printing the saved count while announcing "5
   stops planned" is worse than either answer on its own. */
const dayScoped = () => Boolean(state.day);
const hallCount = (id) => (dayScoped() ? hallStopCount(id) : hallSavedCount(id));

/* Every chip's count in one string, for telling "these numbers moved"
   from "they did not" without rendering anything to find out. */
const countsKey = () => state.index.halls.map((h) => hallCount(h.id)).join(",");

/* The row's first chip, and the only one that is not a hall: it steps back
   to the whole site. It leads rather than follows the halls because that is
   the order the question comes in — where am I, then which hall — and it
   carries no area colour, because it belongs to none of them.

   Offered only once the layout is in hand (see loadCampus), so a chip that
   would open nothing is never on screen. */
const overviewChip = () =>
  state.campus
    ? `<button class="chip hall-chip campus-chip ${onOverview() ? "active" : ""}" type="button"
        data-view="${OVERVIEW}" aria-label="${esc(t("map.overviewAria"))}">${esc(
        t("map.overview")
      )}</button>`
    : "";

/* One scrolling row, but grouped: the halls of an area sit behind that
   area's name in that area's colour, so the row doubles as the legend
   and the business halls can't be mistaken for more of the show. The
   index is written area-major, so grouping is just a change of key
   between chips. */
function renderChips() {
  let last = null;
  $("#halls").innerHTML = overviewChip() + state.index.halls
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
      const n = hallCount(h.id);
      /* Screen readers get no group heading — the row is one flat list to
         them — so each chip names its own area, and the trade-only ones
         say so before you are taken there. */
      const label =
        t("where.hall", { hall: h.id }) +
        (area.label ? `, ${areaName(area)}` : "") +
        (area.trade ? t("map.tradeVisitorsOnly") : "") +
        (n ? t(dayScoped() ? "map.chipPlannedAria" : "map.chipSavedAria", { n }) : "");
      return `${head}<button class="chip hall-chip ${h.id === state.hall ? "active" : ""}" type="button"
        data-hall="${esc(h.id)}" style="--area:${esc(area.colour || "")}"
        aria-label="${esc(label)}">${esc(t("where.hall", { hall: h.id }))}${
        n ? ` <span class="chip-saved" aria-hidden="true">●${n}</span>` : ""
      }</button>`;
    })
    .join("");
}

/* ================= the campus overview =================

   Thirteen hall chips answer "take me to hall 7". They do not answer "where
   *is* hall 7", which is the question someone standing at a gate with a
   saved list actually has — and the doors on a hall's own outline answer it
   only one wall at a time. So the row's first chip is the whole site: every
   hall in its place, the Boulevard between them, the gates, and the count
   of your saved booths on each hall. Tapping one opens it.

   Drawn from data/hallplan/campus.json, Koelnmesse's own campus outline. It
   is a diagram, not a plan — its halls are fitted to their slots rather
   than drawn to scale, and the file's note says so at length — so nothing
   here measures anything. What it is right about is which hall is where,
   which is the whole job.

   It renders into the same #map element a hall does, which gives it the
   pan, the pinch, the zoom buttons and the fit button for free. Like the
   hall's own door layer, the picture is aria-hidden: the chip row above it
   is already the accessible list of halls, and a second one made of SVG
   plates would only be the same halls said twice. */

const OVERVIEW = "overview";
const onOverview = () => state.hall === OVERVIEW;

const CAMPUS_URL = "data/hallplan/campus.json";
let campusRequest = null;

/* Fetched once, after the first hall is on screen — never before it. The
   overview is the second thing anyone looks at, and a hall is the first;
   7 KB must not stand between a visitor and the hall they asked for.
   Until it lands the chip is simply not offered, which is also what an
   installed shell whose service worker predates this file gets. */
function loadCampus() {
  if (state.campus) return Promise.resolve(state.campus);
  if (!campusRequest)
    campusRequest = fetch(`${CAMPUS_URL}?v=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        state.campus = data;
        renderChips(); /* the chip exists from here on */
        return data;
      })
      .finally(() => {
        campusRequest = null;
      });
  return campusRequest;
}

/* "Boulevard", "Confex", "North" — the campus file names a feature with a
   key rather than a word, so the name is translated like everything else.
   An unknown key draws nothing rather than a raw key on the map. */
const placeLabel = (kind, key) => {
  if (!key) return "";
  const label = t(`map.${kind}.${key}`);
  return label === `map.${kind}.${key}` ? "" : label;
};

/* Room reserved in the viewBox beyond the site, per side. Deep enough
   north and south for a gate's name to be set outside the plan, and only
   as deep east and west as a gate's dot needs — the drawing is fitted to
   the width of the screen, so a margin there comes off the size of every
   hall, and the two gates on those sides are named inside instead (see
   gatesEl). */
const CAMPUS_PAD = { n: 26, e: 12, s: 30, w: 12 };

/* Secondary labels — the Boulevard, the Piazza, the Confex — are set at
   one size wherever they fit and shrunk only when they do not. They name
   the ground between the halls; scaling them with the shape would make
   the Boulevard shout louder than hall 8. */
const PLACE_FS = 11;
const PLACE_MIN = 5;   /* below this it is a smudge — drop it instead */
const GATE_FS = 11;    /* a gate is a destination; a passage is not */
/* How wide a gate's name may be set. Above and below the site it lies in
   the margin, where the only cost is a strip of empty stage; against the
   east and west edges it is set back over the site itself, because the
   drawing is always as wide as the screen allows and a margin there comes
   straight off the size of every hall. */
const GATE_RUN = { n: 130, s: 130, e: 90, w: 90 };

/* A polygon's area centroid, which for the shapes in this file is a point
   inside them. The bbox centre is not: the Boulevard is an L (its north
   arm runs east along hall 8) and the centre of the box around it lands
   in the empty ground beside hall 9. */
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const w = x0 * y1 - x1 * y0;
    a += w;
    cx += (x0 + x1) * w;
    cy += (y0 + y1) * w;
  }
  const box = bbox(poly);
  if (!a) return [box.cx, box.cy];
  return [cx / (3 * a), cy / (3 * a)];
}

/* Break a name over one or two lines at whichever size fits the run it is
   set along, and say so when nothing legible fits. Every space is tried,
   not just the last: "Entrance Hall 9" broken after the last one is
   "Entrance Hall" over a lone "9", which is both wider and worse. */
function fitPlace(name, run, cap = PLACE_FS) {
  const candidates = [[name]];
  for (let i = 0; i < name.length; i++)
    if (name[i] === " ") candidates.push([name.slice(0, i), name.slice(i + 1)]);
  let best = { lines: [name], fs: 0 };
  for (const lines of candidates) {
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.min(cap, (run * 0.94) / (longest * 0.6));
    if (fs > best.fs) best = { lines, fs };
  }
  return best;
}

function textEl(cls, x, y, fs, lines) {
  const el = document.createElementNS(SVGNS, "text");
  el.setAttribute("class", cls);
  el.setAttribute("x", x);
  el.setAttribute("y", y - ((lines.length - 1) * fs * 1.05) / 2);
  el.setAttribute("font-size", fs);
  lines.forEach((line, i) => {
    const ts = document.createElementNS(SVGNS, "tspan");
    ts.setAttribute("x", x);
    if (i) ts.setAttribute("dy", fs * 1.05);
    ts.textContent = line;
    el.appendChild(ts);
  });
  return el;
}

/* The name of a piece of ground, set on it. Turned to run along it when
   the shape is more than twice as tall as it is wide — the Boulevard is a
   20-unit strip 160 long, and "Boulevard" set across it covers the halls
   on both sides. */
function placeEl(name, poly) {
  const box = bbox(poly);
  const turn = box.h > box.w * 2;
  const { lines, fs } = fitPlace(name, turn ? box.h : box.w);
  /* Too small to read, or too tall for the strip it is set on: the
     Congress-Centrum's east wing is ten units wide on this diagram, and
     two lines of type across it is a smudge with a name in it. */
  if (fs < PLACE_MIN || lines.length * fs * 1.05 > (turn ? box.w : box.h)) return null;
  const [cx, cy] = centroid(poly);
  /* Built at the origin and moved by the transform, which is what lets it
     be turned: an x/y pair cannot be rotated about itself. */
  const el = textEl("campus-place", 0, fs * 0.36, fs, lines);
  el.setAttribute("transform", `translate(${cx} ${cy}) rotate(${turn ? -90 : 0})`);
  return el;
}

/* Which way a gate's name is set: its own compass point, whatever else is
   nearby — "Entrance South" belongs below the plan, where someone arriving
   at it is standing. A gate the snapshot names some other way is not drawn
   rather than guessed at; there are four, and the tool says why. */
const gateEdge = (id) => ({ north: "n", east: "e", south: "s", west: "w" }[id.replace("entrance-", "")]);

/* The gates, as a dot each and a name.

   North and south are named outside the drawing with a leader back to the
   dot, the way a plan labels its edges. East and west are named inside it,
   reading back over the site from the dot: they sit at the widest points of
   a picture that is always fitted to the width of the screen, so a margin
   out there would cost every hall a third of its size for two words. Set
   over the halls, they need the halo the CSS gives them, and they land on
   the passages either way.

   There is one gate to an edge today, but two on one edge would set their
   names on top of each other, so names sharing an edge are pushed apart
   along it afterwards. The leader, or the dot beside the name, still says
   which is which. */
function gatesEl(gates, W, H) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "campus-gates");

  const placed = [];
  for (const gate of gates) {
    const [x, y] = gate.at;
    const dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("class", "campus-gate-dot");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", 4.5);
    g.appendChild(dot);

    const name = placeLabel("gate", gate.id);
    const edge = gateEdge(gate.id);
    if (!name || !edge) continue;
    const fit = fitPlace(name, GATE_RUN[edge], GATE_FS);
    const across = edge === "e" || edge === "w";
    placed.push({
      x, y, edge, across, ...fit,
      /* where the name sits along its edge, before anything is pushed */
      at: across ? y : x,
      /* and how much of that edge it takes up */
      span: across
        ? fit.lines.length * fit.fs * 1.05
        : Math.max(...fit.lines.map((l) => l.length)) * fit.fs * 0.6,
    });
  }

  for (const edge of EDGE_KEYS) {
    const mine = placed.filter((p) => p.edge === edge).sort((a, b) => a.at - b.at);
    for (let i = 1; i < mine.length; i++)
      mine[i].at = Math.max(mine[i].at, mine[i - 1].at + (mine[i - 1].span + mine[i].span) / 2 + 4);
  }

  for (const p of placed) {
    const rise = ((p.lines.length - 1) * p.fs * 1.05) / 2;
    let x, y, dir;
    if (p.across) {
      /* Back over the site from the dot when the dot is at that edge, and
         out towards the edge when it is not: the Boulevard's own gate
         stands in the middle of the site, where reading back over it would
         set the name across hall 6. */
      const room = p.edge === "e" ? W - p.x : p.x;
      const back = p.edge === "e" ? "to-w" : "to-e";
      const out = p.edge === "e" ? "to-e" : "to-w";
      dir = room < GATE_RUN[p.edge] ? back : out;
      x = dir === "to-w" ? p.x - 7 : p.x + 7;
      y = p.at + p.fs * 0.36;
    } else {
      x = p.at;
      dir = "";
      /* stacked away from the plan, so a second line never grows back
         over the halls */
      y = p.edge === "n" ? -8 - rise : H + 8 + p.fs * 0.8 + rise;
    }
    if (!p.across || Math.abs(p.at - p.y) > 1) {
      const line = document.createElementNS(SVGNS, "path");
      line.setAttribute("class", "campus-gate-line");
      line.setAttribute("d", `M${p.x} ${p.y}L${p.across ? x : p.at} ${p.across ? p.at : y}`);
      g.appendChild(line);
    }
    /* The side it reads from is a class rather than a text-anchor
       attribute: #map text sets that anchor in CSS, and a stylesheet beats
       a presentation attribute however specific the element thinks it is. */
    g.appendChild(textEl(`campus-gate-lbl ${dir}`, x, y, p.fs, p.lines));
  }
  return g;
}

function renderCampus(campus) {
  const [W, H] = campus.size;
  view.ox = -CAMPUS_PAD.w;
  view.oy = -CAMPUS_PAD.n;
  const vw = W + CAMPUS_PAD.w + CAMPUS_PAD.e;
  const vh = H + CAMPUS_PAD.n + CAMPUS_PAD.s;

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("id", "map");
  svg.setAttribute("viewBox", `${view.ox} ${view.oy} ${vw} ${vh}`);
  svg.setAttribute("width", vw);
  svg.setAttribute("height", vh);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("map.campusAria"));

  const ground = document.createElementNS(SVGNS, "g");
  ground.setAttribute("class", "campus-ground");
  ground.setAttribute("aria-hidden", "true");
  const plates = document.createElementNS(SVGNS, "g");
  plates.setAttribute("aria-hidden", "true");
  const labels = document.createElementNS(SVGNS, "g");
  labels.setAttribute("class", "campus-labels");
  labels.setAttribute("aria-hidden", "true");

  /* One name per named place, on the largest piece carrying it: the
     Boulevard is filed in two lengths, and saying so twice on one spine
     reads as two Boulevards. */
  const named = new Map();
  for (const f of campus.features) {
    if (!f.place) continue;
    const box = bbox(f.poly);
    const best = named.get(f.place);
    if (!best || box.w * box.h > best.w * best.h) named.set(f.place, { ...box, poly: f.poly });
  }

  for (const f of campus.features) {
    if (f.kind === "hall") continue;
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("class", `campus-ground-${f.kind}`);
    p.setAttribute("d", polyPath(f.poly));
    ground.appendChild(p);
  }
  for (const [place, shape] of named) {
    const el = placeEl(placeLabel("place", place), shape.poly);
    if (el) labels.appendChild(el);
  }

  state.plates = [];
  for (const f of campus.features) {
    if (f.kind !== "hall") continue;
    const box = bbox(f.poly);
    /* Which map a tap opens: the first level of this hall the guide
       draws. A hall it draws none of — hall 1, hall 11 — is on the
       diagram for orientation and takes no taps. */
    const open = (f.levels || [])[0] || null;

    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", `campus-hall${open ? " is-open" : ""}`);
    if (f.area) g.style.setProperty("--area", state.areas[f.area]?.colour || "");
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", polyPath(f.poly));
    g.appendChild(p);
    if (open) {
      /* Same trick as a door's fat invisible stroke: the plate itself is
         under the label layer, so the tap target sits on top of both. */
      const hit = document.createElementNS(SVGNS, "path");
      hit.setAttribute("class", "campus-hall-hit");
      hit.setAttribute("d", polyPath(f.poly));
      hit.dataset.hall = open;
      g.appendChild(hit);
    }
    plates.appendChild(g);

    const lg = document.createElementNS(SVGNS, "g");
    lg.setAttribute("class", `campus-hall-lbl${open ? " is-open" : ""}`);
    const fs = Math.min(box.w / (f.id.length * 0.66), box.h * 0.46, 26);
    const badgeFs = Math.max(7, fs * 0.42);
    const num = textEl("campus-num", box.cx, box.cy + fs * 0.36, fs, [f.id]);
    lg.appendChild(num);
    /* The saved count, in the same ●n shorthand as the hall chips, under
       the number and inside the plate — a count hanging off the bottom of
       hall 7 reads as belonging to whatever is below it. Left empty rather
       than absent so refreshCampus only ever sets text, and the number
       rides up by half a badge to make room only while there is one. */
    const saved = textEl(
      "campus-saved",
      box.cx,
      Math.min(box.cy + fs * 0.36 + badgeFs * 0.95, box.y1 - badgeFs * 0.3),
      badgeFs,
      [""]
    );
    lg.appendChild(saved);
    labels.appendChild(lg);
    /* cx/cy is the area centroid, not the box centre: hall 8 is an L and the
       middle of the box around it lands beside the building, which is where a
       line drawn between plates would kink. x0/y0 is the corner a leg number
       sits in, the same corner a stop pin takes on its stand. */
    const [cx, cy] = centroid(f.poly);
    state.plates.push({
      id: f.id,
      levels: f.levels || [],
      open,
      g,
      lg,
      num,
      cx,
      cy,
      x0: box.x0,
      y0: box.y0,
      mid: box.cy + fs * 0.36,
      up: box.cy + fs * 0.36 - badgeFs * 0.6,
      saved: saved.firstChild,
    });
  }

  svg.appendChild(ground);
  svg.appendChild(plates);
  labels.appendChild(gatesEl(campus.entrances || [], W, H));
  svg.appendChild(labels);

  $("#map")?.remove();
  $("#load").hidden = true;
  $("#stage").appendChild(svg);
  refreshMarks();
  fitView(svg, vw, vh);
}

/* The overview's half of refreshMarks: how many of your saved booths stand in
   each hall, counted over every level of it the guide draws — or how many of
   the chosen day's stops do, while the route is on. Through hallCount, so a
   plate and the chip for the same hall are never two answers. */
function refreshCampus() {
  let total = 0;
  let open = 0;
  for (const plate of state.plates) {
    const n = plate.levels.reduce((sum, id) => sum + hallCount(id), 0);
    total += n;
    if (plate.open) open += 1;
    plate.saved.textContent = n ? `●${n}` : "";
    plate.num.setAttribute("y", n ? plate.up : plate.mid);
    for (const el of [plate.g, plate.lg]) el.classList.toggle("saved", n > 0);
  }
  $("#counts").textContent =
    t("map.campusCounts", { n: open }) +
    (total ? t(dayScoped() ? "map.countsPlanned" : "map.countsSaved", { n: total }) : "");
}

async function showOverview() {
  const campus = state.campus || (await loadCampus().catch(() => null));
  if (!campus) return; /* nothing to show, and the chip is gone by now */
  if (onOverview() && $("#map")) return;
  /* Before the hall changes, so the open sheet's stand is deselected in
     the hall it belongs to rather than left with its outline lit. */
  selectStand(null);
  state.hall = OVERVIEW;
  state.stands = [];
  renderChips();
  $("#halls .chip.active")?.scrollIntoView({ inline: "center", block: "nearest" });
  renderAccess(OVERVIEW);
  renderCampus(campus);
  renderSourceNote();
  history.replaceState(null, "", `#${OVERVIEW}`);
}

/* ================= the day route overlay =================

   The plan board's day assignments, read back onto the floor. Pick a day and
   every stop you placed on it that stands in this hall gets a numbered pin,
   joined in order by a thin line.

   Three things make it honest rather than decorative:

   The order is the plan's own — whatever order you left the list in, or
   busiest first with played stops sinking to the end while you have left it
   alone — and both the comparator and the positions come from js/marks.js,
   so pin 3 is the third row of the list it was read from. Two views of one
   plan that disagreed about which stop is first would be worse than one
   view.

   The line is *not* a walking route and never claims to be. Nothing here
   knows where the aisles run: the snapshot files stand blocks and stands, and
   the doors are already our own reading. A shortest path drawn through
   geometry we do not have would be a guess about the one thing on this page
   a visitor would follow literally. So it is drawn thin and dashed, under the
   labels, and the bar says what it is.

   And a stop is a booth, not a stand. A card may hold several stands in one
   hall; each of them carries the same number, because they are one stop you
   walk to, and the line runs through the largest. */

const PLAN_NONE = "none";  /* saved, but not yet placed on a day */
const PIN_R = 4.2;         /* pin radius, in hall metres like every other mark here */

/* Every day carrying at least one saved stop, plus whether anything is still
   unplaced — the same set, from the same two stores, that the guide's plan
   board offers as its day filter. Days sort by their ISO value, which is the
   order the show runs in. */
function planDays() {
  const seen = new Set();
  for (const ex of [...state.exhibitors, ...state.trade])
    if (GCMarks.hasSaved(state.marks.saved, ex))
      for (const day of GCMarks.stopDays(state.marks.saved, state.itinerary, ex)) seen.add(day);
  return {
    days: [...seen].filter((day) => day !== PLAN_NONE).sort(),
    unplaced: seen.has(PLAN_NONE),
  };
}

/* This hall's stops for the chosen day, numbered.

   Built from the stands rather than from the exhibitor list, so a card
   standing in two halls is a stop in both — the map already lights every
   stand it holds, and the overlay has no business being narrower than the
   colour it sits on top of. `recs` comes out largest-stand-first because
   state.stands is in painting order. */
function routeStops() {
  if (!state.day) return [];
  const stops = new Map();
  for (const rec of state.stands) {
    for (const ex of rec.exs) {
      if (!stops.has(ex)) {
        if (!GCMarks.hasSaved(state.marks.saved, ex)) continue;
        if (!GCMarks.stopDays(state.marks.saved, state.itinerary, ex).has(state.day)) continue;
        stops.set(ex, { ex, recs: [], played: exPlayed(ex) });
      }
      stops.get(ex).recs.push(rec);
    }
  }
  const order = GCMarks.compareStops(exPlayed, GCI18N.lang, exRank);
  return [...stops.values()]
    .sort((a, b) => order(a.ex, b.ex))
    .map((stop, i) => ({ ...stop, n: i + 1 }));
}

/* ---- the halls either side of this one ----

   A day almost never fits in one hall. The pins above number the stops
   standing in the hall on screen and stop at its walls, which leaves the
   question the walls actually raise — "and then where?" — answered nowhere.

   "Then" is the plan board's own hall order, which is ascending hall number:
   the groups its hall lens lists, in the order it lists them. That is no more
   a solved walking route than the line between the pins is; it is the order
   the arranged list reads in, put on the floor. */

/* "10.2" and "10.1" are both hall 10. A passage lands you in the building and
   the storey is an escalator inside it, which nothing in the data files. */
const hallBase = (id) => String(id).split(".")[0];

/* The day's halls, in that order, with the count each carries. Counted with
   hallStopCount, so a leg agrees with the chip for the same hall in the row
   above rather than offering a second number for the same question. */
function dayHalls() {
  if (!state.day || !state.index) return [];
  return state.index.halls
    .map((h) => ({ id: h.id, n: hallStopCount(h.id) }))
    .filter((h) => h.n > 0)
    .sort((a, b) => parseFloat(a.id) - parseFloat(b.id));
}

/* Where the hall on screen sits in that order.

   Measured by hall number rather than by position in the list, so a hall with
   nothing planned in it still gets the two legs it stands between: someone
   who walked into 8.1 on a day planned for 7.1 and 9.1 is exactly the person
   who needs to be told which way is which. */
function dayLegs(halls) {
  const here = parseFloat(state.hall);
  if (!halls.length || Number.isNaN(here)) return { prev: null, next: null };
  const before = halls.filter((h) => h.id !== state.hall && parseFloat(h.id) < here);
  const after = halls.filter((h) => h.id !== state.hall && parseFloat(h.id) > here);
  return { prev: before[before.length - 1] || null, next: after[0] || null };
}

/* ---- and the way out toward them ----

   Which building a door lands you in, as a graph node. Anything that is not a
   hall — the Boulevard, a gate — is a place in its own right, because it is
   how two halls that share no wall are joined. */
const doorNode = (to) => {
  const hall = hallOf(to);
  return hall ? `hall:${hallBase(hall)}` : String(to || "") || null;
};

/* Every door in data/hallplan/outline.json as one undirected graph. Built per
   call: it is seven halls and two dozen doors, and a cached copy would be one
   more thing to invalidate when the file behind it is swapped by an update. */
function doorGraph() {
  const graph = new Map();
  const join = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a).add(b);
  };
  for (const [level, hall] of Object.entries(state.outline.halls || {})) {
    const from = `hall:${hallBase(level)}`;
    for (const door of hall.doors || []) {
      const to = doorNode(door.to);
      if (!to || to === from) continue;
      join(from, to);
      join(to, from);
    }
  }
  return graph;
}

/* The doors on *this* hall's wall that start the way to another hall.

   A breadth-first walk of the graph above, seeded with the openings this
   storey actually files, so the answer is always a door you could walk to
   from where you are standing — 10.2 files its own, and a first step borrowed
   from 10.1 would point at a wall this floor has no opening in. Two halls
   joined by a passage come out as that passage; hall 7 to hall 9 comes out as
   hall 7's Boulevard doors, because the Boulevard is what the file says joins
   them.

   It counts doorways, not metres. There is no distance in this data and this
   is not a shortest walk — it is the first step of one, which is the whole of
   what it claims: leave by here.

   null when nothing filed reaches that hall. Seven of the thirteen levels
   have no doors at all, and an arrow at a wall we have never opened would be
   an invention of exactly the kind decision 5b exists to avoid; the leg is
   still named in the bar, where it costs no geometry to say. */
function exitToward(level, target) {
  const from = `hall:${hallBase(level)}`;
  const goal = `hall:${hallBase(target)}`;
  if (from === goal) return null;
  const seeds = new Map();
  for (const door of doorsOf(level)) {
    const node = doorNode(door.to);
    if (!node || node === from) continue;
    if (!seeds.has(node)) seeds.set(node, []);
    seeds.get(node).push(door);
  }
  if (seeds.has(goal)) return seeds.get(goal);
  const graph = doorGraph();
  const seen = new Set([from, ...seeds.keys()]);
  /* Each frontier entry remembers the door it set out from, which is the
     answer being looked for — the rest of the path is hall 9's business. */
  let frontier = [...seeds.keys()].map((node) => [node, node]);
  while (frontier.length) {
    const next = [];
    for (const [node, seed] of frontier)
      for (const step of graph.get(node) || []) {
        if (step === goal) return seeds.get(seed);
        if (seen.has(step)) continue;
        seen.add(step);
        next.push([step, seed]);
      }
    frontier = next;
  }
  return null;
}

/* A door's mouth: the middle of the opening as drawn, which is the filed
   centre clamped to the wall it is filed on (renderOutline clamps the same
   way, and a door filed past the corner would otherwise be pointed at from
   outside the hall). */
function doorMouth(door, W, H, m) {
  const edge = edgeOf(door.edge, W, H, m);
  const a = Math.max(edge.t0, door.at - door.span / 2);
  const b = Math.min(edge.t1, door.at + door.span / 2);
  return { edge, at: (a + b) / 2 };
}

/* Two halls that share a passage put the leg's name on the wall twice: the
   door is already labelled "Hall 6.1" out in the margin, and a chip inside
   saying the same thing is the map repeating itself. The arrow alone is the
   whole addition there — which way, through this one. */
const legNamed = (mouth, label) => doorLabel(mouth.door.to) === label;

/* Of the doors that start the way there, the one nearest the stop you are
   leaving from. Hall 7's east wall has three openings onto the same
   Boulevard; which of them is closest to stop 3 is a fact about geometry we
   have, unlike anything beyond the wall. */
function nearestMouth(doors, [x, y], W, H, m) {
  let best = null;
  for (const door of doors) {
    const mouth = doorMouth(door, W, H, m);
    const [mx, my] = mouth.edge.pt(mouth.at);
    const d = Math.hypot(mx - x, my - y);
    if (!best || d < best.d) best = { ...mouth, door, d };
  }
  return best;
}

/* The chosen day lives in the address bar, not in prefs: it is a question
   about one visit ("show me Thursday"), the guide's own day filter is not
   persisted either, and putting it in the URL is what lets the plan board's
   "Map →" hand a day over (see mapLink in js/app.js). replaceState, like
   every other write this page makes, so it never stuffs the back stack. */
function writeDayParam() {
  const url = new URL(location.href);
  if (state.day) url.searchParams.set("day", state.day);
  else url.searchParams.delete("day");
  if (url.href !== location.href) history.replaceState(null, "", url.href);
}

/* Tapping the lit chip turns the overlay off — one control, the same language
   as the day chips in the guide, where the active chip unassigns. */
function pickDay(day) {
  state.day = state.day === day ? null : day;
  writeDayParam();
  /* refreshMarks rather than renderRoute alone: the hall row's badges count
     the chosen day's stops while one is on (hallCount), so the whole reading
     of the saved list moves with the chip, not just the pins. */
  refreshMarks();
  /* That render rebuilt the chip row, so the button that was just pressed is
     a different element — put focus back on it, the way the guide's own day
     filter does, or a keyboard user is dropped at the top of the page. */
  document.querySelector(`#route-days [data-route-day="${CSS.escape(day)}"]`)?.focus();
  /* an open sheet carries the stop number, which just changed */
  if (state.sel) selectStand(state.sel);
}

function renderRouteBar(offered) {
  const bar = $("#route");
  /* An installed shell one version old has no route bar; the overlay simply
     doesn't appear, which is the same deal every other progressive addition
     to this page gets. */
  if (!bar) return;
  bar.hidden = !offered.days.length;
  if (bar.hidden) {
    $("#route-days").innerHTML = "";
    return; /* the status line is renderRoute's, hidden along with the bar */
  }
  /* Each chip says what tapping it does, not what it is — the lit one offers
     to turn the overlay back off, which is the whole of this control. */
  const chips = [
    ...offered.days.map((day) => {
      const name = GCI18N.dayName(day);
      return [
        day,
        GCI18N.dayName(day, "short"),
        t(state.day === day ? "map.routeDayOff" : "map.routeDayOn", { day: name }),
      ];
    }),
    ...(offered.unplaced
      ? [
          [
            PLAN_NONE,
            t("plan.unassigned"),
            t(state.day === PLAN_NONE ? "map.routeUnplacedOff" : "map.routeUnplacedOn"),
          ],
        ]
      : []),
  ];
  $("#route-days").innerHTML = chips
    .map(([day, label, title]) => {
      const on = state.day === day;
      return `<button class="day-chip${on ? " active" : ""}" type="button"
        data-route-day="${esc(day)}" aria-pressed="${on}"
        title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button>`;
    })
    .join("");
  for (const chip of document.querySelectorAll("#route-days .day-chip"))
    chip.addEventListener("click", () => pickDay(chip.dataset.routeDay));
}

/* The legs, as two buttons beside the status line.

   The map answers "which way out" with an arrow at a door, and can only
   answer it where the outline files one — seven of the thirteen levels file
   none. This says the same thing in words, for those halls and for a screen
   reader, and it is a real control: the hall it names is one tap away, which
   is what you wanted the moment you read it.

   Rendered even when the pointer beside it could not be drawn, and never
   instead of one: two halves of one answer, not a fallback. */
function legButtons(legs) {
  return [
    [legs.prev, "map.legPrev", "map.legPrevAria"],
    [legs.next, "map.legNext", "map.legNextAria"],
  ]
    .filter(([leg]) => leg)
    .map(([leg, key, ariaKey]) => {
      const aria = t(ariaKey, { hall: leg.id, n: leg.n });
      return `<button class="map-route-leg" type="button" data-leg-hall="${esc(leg.id)}"
        title="${esc(aria)}" aria-label="${esc(aria)}">${esc(
        t(key, { hall: leg.id, n: leg.n })
      )}</button>`;
    })
    .join("");
}

/* The bar's sentence and its two leg buttons, written together because the
   buttons are the end of the sentence — "3 stops here, then hall 9.1". */
function renderRouteStatus(html) {
  const status = $("#route-status");
  if (!status) return;
  status.innerHTML = html;
  for (const btn of status.querySelectorAll(".map-route-leg"))
    btn.addEventListener("click", () => showHall(btn.dataset.legHall));
}

/* Wipe last render's verdicts before drawing this one: the overlay is rebuilt
   whole rather than diffed, and a stand that has dropped off the route has to
   lose its number in the accessible name as well as on screen. */
function clearRoute(svg) {
  svg?.querySelectorAll(".route-line, .route-pins, .route-legs").forEach((el) => el.remove());
  for (const rec of state.stands) {
    if (!rec.stop) continue;
    rec.stop = null;
    rec.g.classList.remove("stop");
    rec.g.setAttribute("aria-label", rec.aria);
  }
  for (const plate of state.plates) {
    if (!plate.leg) continue;
    plate.leg = null;
    plate.g.classList.remove("leg");
    plate.lg.classList.remove("leg");
  }
}

/* Where the route line meets a stop: the middle of its largest stand, which
   is the one the pins are drawn from. */
const stopPoint = (stop) => {
  const box = bbox(stop.recs[0].data.poly);
  return [box.cx, box.cy];
};

const PTR = 5.4;  /* leg arrowhead, in hall metres like every other mark here */

/* One leg pointer: an arrowhead through the doorway, and the hall it leads to
   named out in the margin beyond it.

   The name is set the way a door's own name is — same margin, same rotation
   on an end wall, one line further out (LEG_OFF) so the two never collide
   however the doors on that wall are grouped. Outside is the only place on
   this map with nothing to cover: inside, a name at a doorway lands on the
   outermost stand row, which is the row the map exists to show. The room for
   it is reserved when the hall is drawn, because this layer cannot grow the
   picture it is drawn on (see renderHall).

   aria-hidden, like the door layer under it and the pins over it: the two
   buttons in the bar are the same two legs, already named, already tappable,
   and by something that takes focus. */
function legPointer({ leg, mouth, inbound }) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", `route-leg-mark${inbound ? " in" : ""}`);

  const { edge, at, door } = mouth;
  const key = door.edge;
  const [ox, oy] = edge.out;
  const [mx, my] = edge.pt(at);
  const dir = inbound ? -1 : 1;
  /* The tip sits level with the outer edge of the door's own bracket, so the
     two read as one mark rather than as an arrow standing beside a doorway.
     An arrival is the same triangle turned around through it. */
  const tx = mx + ox * DOOR_DEPTH * dir;
  const ty = my + oy * DOOR_DEPTH * dir;
  const bx = tx - ox * PTR * dir;
  const by = ty - oy * PTR * dir;
  const [px, py] = [-oy, ox]; /* along the wall */
  const w = PTR * 0.44;
  const head = document.createElementNS(SVGNS, "path");
  head.setAttribute("class", "route-leg-head");
  head.setAttribute("d", `M${tx} ${ty}L${bx + px * w} ${by + py * w}L${bx - px * w} ${by - py * w}Z`);
  g.appendChild(head);

  const label = t("where.hall", { hall: leg.id });
  /* Nothing more to say: the wall's own label is this hall, the arrow says
     which way through it, and the door under both is already a tap that goes
     there (renderOutline). */
  if (legNamed(mouth, label)) return g;

  const el = document.createElementNS(SVGNS, "text");
  el.setAttribute("class", `route-leg-lbl on-${key}`);
  el.setAttribute("font-size", LEG_FS);
  if (key === "n" || key === "s") {
    el.setAttribute("x", mx);
    /* glyphs sit above their baseline, so only a name below the wall has to
       be pushed down by a line to clear it — the door labels' own rule */
    el.setAttribute("y", my + oy * LEG_OFF + (key === "s" ? LEG_FS * 0.8 : 0));
  } else {
    /* Turned to run along an end wall, reading downward on the east and
       upward on the west, for the reason the door labels are: set across, a
       hall name is 25 m of type against a hall 82 m deep. */
    el.setAttribute(
      "transform",
      `translate(${mx + ox * LEG_OFF} ${my}) rotate(${key === "e" ? 90 : -90})`
    );
  }
  el.textContent = label;
  g.appendChild(el);

  /* Tappable like the door under it, and for the same reason: it is pointing
     at a hall, and what you do with a hall you are being pointed at is go
     there. Its own hit rect rather than the door's, because a Boulevard door
     leads to the Boulevard and this leads to hall 9.1.

     It runs from the wall out to the end of the name, and never a metre
     inside it: everything in there is a stand, and a control that swallowed
     taps meant for one would have taken more than it gave. */
  const reach = Math.max((label.length * LEG_FS * 0.62) / 2, w) + 1.5;
  const corner = (t0, depth) => {
    const [x, y] = edge.pt(t0);
    return [x + ox * depth, y + oy * depth];
  };
  const [x1, y1] = corner(at - reach, 0);
  const [x2, y2] = corner(at + reach, LEG_BAND);
  const hit = document.createElementNS(SVGNS, "rect");
  hit.setAttribute("class", "route-leg-hit");
  hit.setAttribute("x", Math.min(x1, x2));
  hit.setAttribute("y", Math.min(y1, y2));
  hit.setAttribute("width", Math.abs(x2 - x1));
  hit.setAttribute("height", Math.abs(y2 - y1));
  hit.dataset.hall = leg.id;
  g.appendChild(hit);
  return g;
}

function renderRoute() {
  const offered = planDays();
  const live = new Set([...offered.days, ...(offered.unplaced ? [PLAN_NONE] : [])]);
  /* A day whose last stop was unsaved — or a ?day= for a day nobody planned —
     would strand the overlay on an empty hall with no lit chip to clear it. */
  if (state.day && (!offered.days.length || !live.has(state.day))) {
    state.day = null;
    writeDayParam();
  }
  renderRouteBar(offered);

  const svg = $("#map");
  clearRoute(svg);
  const halls = dayHalls();
  if (onOverview()) {
    state.route = [];
    renderCampusRoute(svg, halls);
    return;
  }
  state.route = svg ? routeStops() : [];
  const legs = dayLegs(halls);
  const here = !state.day
    ? `<span class="map-route-hint">${esc(t("map.routeHint"))}</span>`
    : state.route.length
      ? `${esc(t("map.routeStops", { n: state.route.length }))} <span class="map-route-hint">${esc(
          t("map.routeOrderNote")
        )}</span>`
      : `<span class="map-route-hint">${esc(t("map.routeNoneHere"))}</span>`;
  renderRouteStatus(here + legButtons(legs));
  const hall = svg && state.halls.get(state.hall);
  if (!hall) return;
  const [W, H] = hall.size;
  const m = marginOf(state.hall);

  /* Where the plan comes in and where it goes out. Drawn even when this hall
     holds none of the day's stops: which way out is the last useful thing a
     hall you have nothing planned in can tell you. */
  const pointers = [];
  for (const [leg, inbound, stop] of [
    [legs.prev, true, state.route[0]],
    [legs.next, false, state.route[state.route.length - 1]],
  ]) {
    if (!leg) continue;
    const doors = exitToward(state.hall, leg.id);
    if (!doors?.length) continue;
    const anchor = stop ? stopPoint(stop) : null;
    const mouth = nearestMouth(doors, anchor || [W / 2, H / 2], W, H, m);
    if (mouth) pointers.push({ leg, inbound, mouth, anchor });
  }
  if (!state.route.length && !pointers.length) return;

  /* Under the labels, so the line never crosses out a booth name; over the
     stands, so it is not hidden by the ones it runs across. One path for the
     chain and both legs: a leg is the same line saying the same thing, run
     from the stop the day leaves by to the door it leaves through. */
  let d = state.route.length ? "M" + state.route.map((s) => stopPoint(s).join(" ")).join("L") : "";
  for (const { mouth, anchor } of pointers) {
    if (!anchor) continue;
    const [mx, my] = mouth.edge.pt(mouth.at);
    d += `M${anchor[0]} ${anchor[1]}L${mx} ${my}`;
  }
  if (d) {
    const line = document.createElementNS(SVGNS, "path");
    line.setAttribute("class", "route-line");
    line.setAttribute("aria-hidden", "true");
    line.setAttribute("d", d);
    svg.insertBefore(line, state.labelsLayer);
  }

  /* Appended last, so the numbers sit above every name and every stand. The
     layer is aria-hidden: the same numbers are already in each stand's own
     accessible name, where they can be reached by the button that carries
     them rather than as loose text in a graphic, and the legs beside them are
     the two buttons in the bar. */
  const pins = document.createElementNS(SVGNS, "g");
  pins.setAttribute("class", "route-pins");
  pins.setAttribute("aria-hidden", "true");
  const total = state.route.length;
  /* Painted last stop first, so where two pins on neighbouring stands overlap
     at fit zoom the *earlier* number stays on top. Nothing is ever dropped —
     a hidden pin is a lost stop, unlike a hidden label — and zooming in
     separates them; this only decides which one you can read before you do. */
  for (const stop of [...state.route].reverse()) {
    /* Every stand the stop holds is lit and carries the stop's number in its
       own accessible name — the whole footprint is the place you are walking
       to, and a keyboard user landing on any part of it should hear which
       stop it is. */
    for (const rec of stop.recs) {
      rec.stop = stop;
      rec.g.classList.add("stop");
      rec.g.setAttribute("aria-label", rec.aria + t("map.stopAria", { n: stop.n, total }));
    }

    /* The number itself is drawn once, on the same stand the route line runs
       through (stopPoint takes recs[0], the largest). One stop is one number:
       Nintendo files four stands in hall 9 and wore four discs all reading
       "2", which is four stops on the floor and two in the bar above it. */
    const box = bbox(stop.recs[0].data.poly);
    /* Two digits need a wider disc, or "10" runs over its own edge. */
    const r = PIN_R * (stop.n > 9 ? 1.18 : 1);
    /* Pinned to the stand's north-west corner rather than its middle: the
       middle is where its name is, and a route that covers the names it is
       routing you between has cost more than it gave. A stand too small to
       have a corner to spare simply wears the pin centred. */
    const cx = box.x0 + Math.min(r * 0.6, box.w / 2);
    const cy = box.y0 + Math.min(r * 0.6, box.h / 2);

    const disc = document.createElementNS(SVGNS, "circle");
    disc.setAttribute("class", `route-pin${stop.played ? " done" : ""}`);
    disc.setAttribute("cx", cx);
    disc.setAttribute("cy", cy);
    disc.setAttribute("r", r);
    const num = document.createElementNS(SVGNS, "text");
    num.setAttribute("class", `route-pin-n${stop.played ? " done" : ""}`);
    num.setAttribute("x", cx);
    /* half a cap height below the centre — SVG text hangs off its baseline */
    num.setAttribute("y", cy + r * 0.38);
    num.setAttribute("font-size", r * 1.1);
    num.textContent = stop.n;
    pins.append(disc, num);
  }
  svg.appendChild(pins);

  if (pointers.length) {
    const marks = document.createElementNS(SVGNS, "g");
    marks.setAttribute("class", "route-legs");
    marks.setAttribute("aria-hidden", "true");
    for (const p of pointers) marks.appendChild(legPointer(p));
    svg.appendChild(marks);
  }
}

/* ================= the day's halls, on the overview =================

   The same reading one step back. On the site diagram a number is a hall and
   not a stop — hall 6 first, then hall 9, then hall 10 — which is the one
   thing thirteen chips in a row cannot say, however many of them carry a
   count. It is the hall lens's grouping with the site drawn under it.

   Both numberings are the plan board's own and neither is a walk: a pin
   inside a hall is that hall group's row, a plate out here is that group's
   place in the list of groups. */

/* The day's levels collapsed onto the buildings, in the same order: 10.1 and
   10.2 are one hall out here. The count on each plate already sums its levels
   (refreshCampus), so a leg carries only its place in the order. */
const dayBuildings = (halls) => [...new Set(halls.map((h) => hallBase(h.id)))];

/* Those of them the diagram can draw, with the plate to draw on. Hall 1 and
   hall 11 are on the diagram for orientation and the guide draws neither, so
   nothing can be planned in them — but the sentence above counts the plan and
   this counts the picture, and a hall missing from the artwork must cost the
   picture a number, not the plan a hall. */
const platedLegs = (buildings) =>
  buildings
    .map((id, i) => ({ id, leg: i + 1, plate: state.plates.find((p) => p.id === id) }))
    .filter((leg) => leg.plate);

function renderCampusRoute(svg, halls) {
  const buildings = dayBuildings(halls);
  const stops = halls.reduce((sum, h) => sum + h.n, 0);
  renderRouteStatus(
    !state.day
      ? `<span class="map-route-hint">${esc(t("map.routeHintCampus"))}</span>`
      : buildings.length
        ? `${esc(t("map.routeHalls", { n: buildings.length }))} · ${esc(
            t("map.routeStopsAll", { n: stops })
          )} <span class="map-route-hint">${esc(t("map.routeOrderNote"))}</span>`
        : `<span class="map-route-hint">${esc(t("map.routeNoneAnywhere"))}</span>`
  );
  const legs = svg ? platedLegs(buildings) : [];
  if (!legs.length) return;

  const marks = document.createElementNS(SVGNS, "g");
  marks.setAttribute("class", "route-legs");
  marks.setAttribute("aria-hidden", "true");

  /* One hall is an order of one: a line through a single plate is a dot, and
     a number on it reads "first of one", which is noise. The plate is lit
     either way — that much is not about order, it is where the day is. */
  const ordered = legs.length > 1;
  if (ordered) {
    const line = document.createElementNS(SVGNS, "path");
    line.setAttribute("class", "route-line");
    line.setAttribute("d", "M" + legs.map(({ plate }) => `${plate.cx} ${plate.cy}`).join("L"));
    marks.appendChild(line);
  }

  for (const { plate, leg } of legs) {
    plate.leg = leg;
    for (const el of [plate.g, plate.lg]) el.classList.add("leg");
    if (!ordered) continue;
    /* The plate's north-west corner, the same corner a stop pin takes on its
       stand — the middle of a plate is where its number and its count are. */
    const r = PIN_R * 1.6 * (leg > 9 ? 1.18 : 1);
    const cx = plate.x0 + r * 1.1;
    const cy = plate.y0 + r * 1.1;
    const disc = document.createElementNS(SVGNS, "circle");
    disc.setAttribute("class", "route-pin");
    disc.setAttribute("cx", cx);
    disc.setAttribute("cy", cy);
    disc.setAttribute("r", r);
    const num = document.createElementNS(SVGNS, "text");
    num.setAttribute("class", "route-pin-n");
    num.setAttribute("x", cx);
    num.setAttribute("y", cy + r * 0.38);
    num.setAttribute("font-size", r * 1.1);
    num.textContent = leg;
    marks.append(disc, num);
  }
  svg.appendChild(marks);
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
  if (e.target.closest("#sheet, .map-zoom")) return;
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
      /* A door into another hall goes there, and so do a hall plate on the
         overview and a leg pointer's chip — one path, because they are the
         same gesture. All three are checked before the stand underneath
         them, which is the whole reason their hit shapes are drawn on top:
         tapping the passage out of hall 7 must not select the booth standing
         beside it. The leg comes first of the three because it is drawn last
         and means the most where they overlap — it is pointing at hall 9.1,
         while the door it stands in is only pointing at the Boulevard. */
      const door = tap.target.closest?.(
        ".route-leg-hit, .hall-door-hit, .campus-hall-hit"
      );
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

/* The buttons beside the gestures: a mouse without a wheel gesture has no
   discoverable way in, and nothing at all offered the way back out to the
   whole hall short of a dozen wheel notches. Steps are centred on the
   stage, like a double tap in the middle; 1.6 per press walks the three
   zoom bands in about four presses. Optional-chained like the sheet's
   buttons, so a stale cached shell without them still boots this script. */
function zoomStep(factor) {
  const r = stage.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, factor);
}
function fitCurrent() {
  const map = $("#map");
  if (map) fitView(map, +map.getAttribute("width"), +map.getAttribute("height"));
}
$("#zoom-in")?.addEventListener("click", () => zoomStep(1.6));
$("#zoom-out")?.addEventListener("click", () => zoomStep(1 / 1.6));
$("#zoom-fit")?.addEventListener("click", fitCurrent);

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
    /* The stand goes with its sheet: what stays in the bar is the hall,
       which is what the screen now shows. */
    if (state.hall) history.replaceState(null, "", `#${state.hall}`);
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
  /* First: on a numbered stand this is the thing you tapped to check. */
  if (rec.stop)
    badges.push(
      `<span class="badge badge-stop">${esc(
        t("map.stopBadge", { n: rec.stop.n, total: state.route.length })
      )}</span>`
    );
  if (rec.exs.some(exSaved))
    badges.push(`<span class="badge badge-saved">${esc(t("mark.saved"))}</span>`);
  /* The day this stop is planned for, read from the same itinerary the plan
     board writes — the map is where you stand when you wonder "was this a
     Thursday thing?", and the answer should not cost a trip to the guide.
     Weekday names come from the dates, like everywhere else (js/i18n.js). */
  const days = [...new Set(rec.exs.flatMap(plannedDays))].sort();
  if (days.length)
    badges.push(`<span class="badge">${esc(
      t("map.plannedFor", { days: days.map((d) => dayName(d, "short")).join(", ") })
    )}</span>`);
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
  /* Browsing stands by keyboard is deliberately the guide's job (see
     PLAN-hall-map.md, "deliberately not built") — but the zoom is a view
     control, not stand browsing, and these are the keys every map answers
     to. "=" is "+" unshifted on the common layouts. */
  if (e.key === "+" || e.key === "=") zoomStep(1.6);
  else if (e.key === "-" || e.key === "_") zoomStep(1 / 1.6);
  else if (e.key === "0") fitCurrent();
});

window.addEventListener("storage", (e) => {
  /* IT_KEY and ORDER_KEY too: assign a day on the plan board, or move a stop
     up it, and an open sheet's "planned · Thu" — and the route overlay's
     pins — follow without a reload, like the marks do. */
  const keys = [
    ...Object.values(GCMarks.MARK_KEYS),
    GCMarks.PREFS_KEY,
    GCMarks.IT_KEY,
    GCMarks.ORDER_KEY,
  ];
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
  /* The overview is drawn from a different file with a different promise:
     Koelnmesse's campus outline is theirs and dated like the booths, but
     it is fitted to their artwork rather than measured, so the line that
     credits it also has to say it is not to scale. */
  if (onOverview() && state.campus) {
    $("#srcnote").innerHTML =
      `${esc(t("map.campusLayout"))}: <a href="${esc(state.campus.source)}" target="_blank" rel="noopener nofollow">${esc(
        t("map.officialHallPlan")
      )}</a> · ${esc(t("map.checkedOn", { date: formatDate(state.campus.fetched) }))} · ${esc(
        t("map.campusNotToScale")
      )}`;
    return;
  }
  const { source, fetched } = state.index;
  const date = formatDate(fetched);
  /* The doors are the one thing on this map that is not traceable to the
     official plan — it files no wall and no doorway — so the credit line
     stops short of claiming them. Per hall, not for the map as a whole:
     seven of the thirteen have no doors filed yet, and a disclaimer about
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
    /* Thirteen halls no longer fit the row, so a hall opened from a deep
       link or a chip at the far end is scrolled to rather than left off
       screen. Only on a hall change: doing it from refreshMarks would
       yank the row back while someone is reading along it. */
    $("#halls .chip.active")?.scrollIntoView({ inline: "center", block: "nearest" });
    renderAccess(id);
    renderSourceNote(); /* its door clause is per hall */
    if (!state.halls.has(id)) $("#load").hidden = false;
    await loadHall(id);
    renderHall(id);
    /* The address bar always names the hall on screen. A chip or door tap
       used to leave the previous stand's #hall/booth standing, so copying
       the link — the whole reason the URL is the deep link — shared a place
       you had already left. selectStand overwrites this with #hall/booth
       when a stand was asked for; replaceState like there, because browsing
       halls is one place in history, not a trail of them. */
    history.replaceState(null, "", `#${id}`);
  }
  if (standCode) {
    const rec = state.stands.find((r) => r.codes.has(standCode));
    if (rec) selectStand(rec, { zoom: true });
  }
}

const hallExists = (id) => Boolean(state.index?.halls.some((h) => h.id === id));

$("#halls").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (chip.dataset.view === OVERVIEW) showOverview();
  else if (chip.dataset.hall) showHall(chip.dataset.hall);
});

/* the address bar is an input too: a pasted #hall/stand link navigates */
window.addEventListener("hashchange", () => {
  const [h, code] = location.hash.slice(1).split("/");
  if (h === OVERVIEW) showOverview();
  else if (hallExists(h)) showHall(h, { standCode: code ? code.toUpperCase() : null });
});

window.addEventListener("resize", fitCurrent);

/* The ← is an <a href="./"> so it always works — middle-click, long-press,
   copy the link. But followed as a link it reloads the guide from the top,
   throwing away the scroll position and filters the visitor left behind to
   check the map. When this page was opened *from* the guide, one step back
   restores all of that (bfcache included), and it is always one step: hall
   browsing here never pushes history, replaceState throughout. Direct and
   external arrivals keep the plain link — there is nothing of theirs behind
   them to go back to. */
$(".map-back")?.addEventListener("click", (e) => {
  let fromGuide = false;
  try {
    const ref = new URL(document.referrer);
    fromGuide = ref.origin === location.origin && !ref.pathname.endsWith("/map.html");
  } catch {
    /* no referrer, or an unparseable one — a direct open */
  }
  if (fromGuide && history.length > 1) {
    e.preventDefault();
    history.back();
  }
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

  /* A day handed over by the plan board's "Map →", or by a shared link.
     Nothing is validated here: renderRoute drops a day nobody planned, which
     is the same check a day losing its last stop has to pass anyway. */
  state.day = new URLSearchParams(location.search).get("day") || null;

  /* deep link first, then the hall holding most of your saved stops,
     then the default */
  const [hallArg, code] = location.hash.slice(1).split("/");
  if (hallArg === OVERVIEW) {
    /* The one arrival that needs the layout before anything is drawn.
       A failed fetch falls through to a hall, which is a map either way. */
    await showOverview();
    if (onOverview()) return prefetchRest();
  }
  let start = hallExists(hallArg) ? hallArg : null;
  if (!start) {
    let best = 0;
    for (const h of index.halls) {
      const n = hallCount(h.id);
      if (n > best) {
        best = n;
        start = h.id;
      }
    }
  }
  await showHall(start || DEFAULT_HALL, { standCode: code ? code.toUpperCase() : null });
  prefetchRest();
}

/* Everything the map will want next, once the map it was asked for is on
   screen. The campus layout is fetched straight away rather than at idle,
   because until it lands the overview chip is not in the row at all and a
   control that appears seconds later is worse than one that was always
   there. The halls wait for idle: they are 1–8 KB gzipped each, the
   service worker has them precached anyway, and this only spares the
   parse on tap. */
function prefetchRest() {
  loadCampus().catch(() => {});
  const prefetch = async () => {
    const before = countsKey();
    await Promise.all(state.index.halls.map((h) => loadHall(h.id).catch(() => {})));
    /* And then say so. A hall's saved count is read from its own stands
       once the plan is parsed and estimated from the guide's exhibitor
       list until then, and the two disagree wherever one exhibitor holds
       more than one stand in a hall: the estimate counts the exhibitor,
       the truth counts the stands. Nothing else redraws those numbers,
       so the estimate used to stand for the rest of the session — most
       visibly on the overview, whose plates are the one screen whose
       whole job is those counts. */
    if (countsKey() === before) return;
    if (onOverview()) refreshCampus();
    /* The row is rebuilt seconds after the map settled, possibly under a
       finger already scrolling it, so it is put back where it was. */
    const row = $("#halls");
    const at = row.scrollLeft;
    renderChips();
    row.scrollLeft = at;
  };
  "requestIdleCallback" in window
    ? requestIdleCallback(prefetch, { timeout: 4000 })
    : setTimeout(prefetch, 3000);
}

main().catch((err) => {
  $("#load").hidden = false;
  $("#load").textContent = t("map.loadFailed", { error: err.message });
});
