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
  hidePlayed: false,
  prioritySavedOnly: false,
  view: "exhibitors",
  sort: "crowd-desc",
  expanded: new Set(),
  /* card id → which face is showing, set by tapping a plate. Only holds the
     cards somebody has actually turned over; everything else follows the
     filters. Cleared when a filter changes — see faceOf(). */
  flipped: new Map(),
  /* replaced from localStorage in main() — see loadMarks() */
  marks: {
    saved: { exhibitors: new Set(), games: new Set() },
    played: { exhibitors: new Set(), games: new Set() },
  },
  /* item-key → ISO day date; replaced from localStorage in main() */
  itinerary: { exhibitors: new Map(), games: new Map() },
  /* which arrangement of the plan board is on screen; persisted in prefs */
  planLens: "day",
  /* hall-lens day filter: "all", an ISO day date, or "none" (unassigned) */
  planDay: "all",
  /* hall ids the hall map can draw; filled from data/hallplan/index.json */
  mapHalls: new Set(),
  /* hall id -> official area key ("entertainment" | "business"), from the same
     file: what colour a card's hall plate is painted (see hallArea) */
  hallAreas: new Map(),
  /* raw official directory: null until the section is first opened */
  directory: null,
  directoryError: null,
  showDirectory: false,
  directoryLimit: 0,
  /* raw tag -> localized display label, from the locale overlay */
  tagLabels: {},
  /* raw country -> localized name, likewise */
  countryLabels: {},
  /* explicit switcher choice, or null = keep following the browser */
  lang: null,
  /* "I have a trade badge" — gates what the guide offers, never what it
     resolves. See the trade section below. */
  trade: false,
  showTrade: false,
  tradeCat: "all",
  tradeLimit: 0,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* Every user-facing string reads through here — js/i18n.js resolves the
   language before this file runs. The shim tolerates one load against a
   stale cached shell that predates the i18n scripts (see renderPlan on
   mixed shell/script pairings): keys render as themselves, nothing throws,
   and the service worker version bump retires that pairing. */
const GCI18N = window.GCI18N || {
  lang: "en",
  t: (key) => key,
  dayName: (date) => String(date),
  formatDate: (date) => String(date),
  apply() {},
  setLang() {},
};
const t = GCI18N.t;
const formatDate = GCI18N.formatDate || ((date) => String(date));

/* Category, crowd and age vocabularies are ids, not text — display labels
   live in js/i18n/<lang>.js under type.*, crowd.* and age.*. "experience"
   stays one broad category on purpose: the flavour ("sim racing",
   "attraction") lives in tags, so a new kind of stunt next year needs no
   new type. */
const typeLabel = (type) => {
  const label = t(`type.${type}`);
  return label === `type.${type}` ? type : label;
};
const crowdLabel = (level) => {
  const label = t(`crowd.${level}`);
  return label === `crowd.${level}` ? "?" : label;
};

/* What a business booth actually is when you walk up to it — the question a
   queue index answers for a consumer booth. The business halls hold two very
   different things under one colour: open stands staffed for walk-up
   conversation, and closed structures that are meeting rooms with a logo on
   the outside. Which one you are looking at decides whether turning up is
   worth anything at all, so it is stated per card and never guessed.

   The enum lives in the data as `access`; only its wording is localized. */
const TRADE_ACCESS_KEYS = ["open", "appointment", "mixed"];
const tradeAccess = (key) =>
  TRADE_ACCESS_KEYS.includes(key)
    ? { label: t(`trade.access.${key}.label`), note: t(`trade.access.${key}.note`) }
    : null;
/* Country names come from the official directory in English. Translated at
   display time from the same overlay as the tags, so the generated
   data/directory.json is never hand-edited and both the trade cards and the
   directory rows read the same way. */
const countryLabel = (country) => state.countryLabels?.[country] || country;
/* The official product-group taxonomy, same treatment as the countries: the
   labels arrive in English in the generated data/directory.json, and the
   display name per language lives in the locale overlay. */
const groupLabel = (id, fallback) => state.groupLabels?.[id] || fallback || "";
/* Translated at display time only — raw tags stay the searchable,
   logic-bearing identifiers (see mergeStrings and matchesQuery). */
const tagLabel = (tag) => state.tagLabels?.[tag] || tag;

const AGE_FILTERS = ["all", "hide", "only"];

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

const VIEWS = ["exhibitors", "planner", "event", "updates", "queues"];

async function loadData() {
  const bust = `?v=${Date.now()}`;
  const lang = GCI18N.lang;
  const [exhibitors, event, meta, changelog, hallplan, strings] = await Promise.all([
    fetch(`data/exhibitors.json${bust}`).then((r) => r.json()),
    fetch(`data/event.json${bust}`).then((r) => r.json()),
    fetch(`data/meta.json${bust}`).then((r) => r.json()),
    fetch(`data/changelog.json${bust}`).then((r) => r.json()).catch(() => []),
    /* Only the ~900-byte index, only to know which halls the map covers.
       Optional on purpose: no hall plan, no map links, guide unchanged. */
    fetch(`data/hallplan/index.json${bust}`).then((r) => r.json()).catch(() => null),
    /* The editorial prose for the active language — the base files above
       are structure only (ids, halls, numbers). A missing overlay falls
       back to English, and failing that renders empty prose rather than
       failing the boot: the booth numbers still work in the halls. */
    fetch(`data/i18n/${lang}.json${bust}`)
      .then((r) => r.json())
      .catch(() =>
        lang === "en"
          ? null
          : fetch(`data/i18n/en.json${bust}`).then((r) => r.json()).catch(() => null)
      ),
  ]);
  mergeStrings(exhibitors, event, meta, strings);
  state.exhibitors = exhibitors;
  state.event = event;
  state.meta = meta;
  state.changelog = changelog;
  state.mapHalls = new Set((hallplan?.halls || []).map((h) => String(h.id)));
  state.hallAreas = new Map(
    (hallplan?.halls || []).filter((h) => h.area).map((h) => [String(h.id), h.area])
  );
  buildShareCodeMap();
}

/* Write the locale overlay's prose back onto the loaded objects, so every
   render site keeps reading ex.description / ev.tickets / d.note exactly
   as before the split — the language never leaks past this point. Keys:
   exhibitors by id, their game notes by title (titles are untranslated
   proper nouns and the same identity marks and share links use), days by
   ISO date, areas by official name. Tolerant throughout: missing keys
   mean empty prose, never a crash. */
function mergeStrings(exhibitors, event, meta, strings) {
  const overlay = strings || {};
  state.tagLabels = overlay.tags || {};
  state.countryLabels = overlay.countries || {};
  state.groupLabels = overlay.dirGroups || {};
  for (const ex of exhibitors) {
    const local = overlay.exhibitors?.[ex.id] || {};
    ex.description = local.description || "";
    ex.crowdNote = local.crowdNote || "";
    ex.visitAdvice = local.visitAdvice || "";
    /* Trade cards only. `offers` stays an array — the card renders one list
       item per line — and an absent key must leave the property absent
       rather than empty, because tradeBlocks() tests its length to decide
       whether the Offers block exists at all. */
    ex.accessNote = local.accessNote || "";
    if (local.offers) ex.offers = local.offers;
    for (const game of ex.games || []) {
      game.note = local.games?.[game.title] || "";
    }
  }
  const ev = overlay.event || {};
  event.location = ev.location || event.location || "";
  event.dates = ev.dates || "";
  event.tickets = ev.tickets || "";
  event.crowdTips = ev.crowdTips || [];
  if (event.onl) {
    event.onl.date = ev.onl?.date || "";
    event.onl.note = ev.onl?.note || "";
  }
  for (const day of event.days || []) {
    const local = ev.days?.[day.date] || {};
    day.access = local.access || "";
    day.hours = local.hours || "";
    day.note = local.note || "";
  }
  for (const area of event.areas || []) {
    area.description = ev.areas?.[area.name] || "";
  }
  /* Entrances keep their two names in the base data — `name` is the key the
     prose hangs off, `nameDe` the sign on the building — and take only their
     advice from the overlay. */
  if (event.entrances) {
    event.entrances.lede = ev.entrances?.lede || "";
    event.entrances.trade = ev.entrances?.trade || "";
    for (const entrance of event.entrances.list || []) {
      entrance.description = ev.entrances?.list?.[entrance.name] || "";
    }
  }
  meta.note = overlay.meta?.note || "";
}

/* ---------- saved & played marks ----------

   Two independent sets: exhibitor ids, and games keyed by normalised title
   rather than by booth. Eight titles this year are shown at two booths at once
   (Alien: Isolation 2 sits at both Xbox and SEGA), so a game mark applies at
   every booth showing the same title. */

/* The storage shape and the saved-game rule live in js/marks.js, because
   the hall map reads and writes the same two lists. Everything below
   still calls loadMarks/persistMarks/gameKey by their old names. */
const { MARK_KEYS, PREFS_KEY, gameKey } = GCMarks;
const IT_KEY = "gc2026.itinerary.v1";
/* Live queue transport/session state lives in its own optional plain script.
   The guard is intentional: a service-worker transition can briefly pair a
   new app.js with the previous shell, which did not load js/queue.js. */
const QUEUES = window.GCQueues || null;
const QUEUE_CLAIMS = [0, 10, 20, 30, 45, 60, 90, 120];
const QUEUE_AHEAD = [10, 20, 30, 50, 75, 100, 150, 200];
const QUEUE_TYPES = ["single", "pairs", "group", "wave"];
const QUEUE_BATCHES = [2, 5, 10, 20, 50, 100];

let queueDialogState = null;
let queuePromptKey = null;
let queueSurfaceGate = "";
const pendingQueueActions = new Set();

const loadMarks = (mark) => GCMarks.readMarks(mark);
const persistMarks = (mark) => GCMarks.writeMarks(mark, state.marks[mark]);

/* Both view preferences live here rather than beside the marks they act on:
   "hide played" is a lens on the list, the same kind of thing as the age
   filter, and neither survives being tangled up with the marks themselves. */
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const age = AGE_FILTERS.includes(raw.age) ? raw.age : "all";
    return {
      age,
      hidePlayed: raw.hidePlayed === true,
      planLens: raw.planLens === "hall" ? "hall" : "day",
      showDirectory: raw.showDirectory === true,
      trade: raw.trade === true,
      showTrade: raw.showTrade === true,
      /* null means "no explicit choice" — the browser's preference keeps
         deciding. js/i18n.js reads this key itself, before this file runs
         and on map.html where app.js never loads; here it only has to
         survive the round trip so persistPrefs cannot erase it. */
      lang: raw.lang === "de" || raw.lang === "en" ? raw.lang : null,
    };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return {
      age: "all", hidePlayed: false, planLens: "day",
      showDirectory: false, trade: false, showTrade: false, lang: null,
    };
  }
}

function persistPrefs() {
  try {
    const prefs = {
      age: state.age,
      hidePlayed: state.hidePlayed,
      planLens: state.planLens,
      showDirectory: state.showDirectory,
      trade: state.trade,
      showTrade: state.showTrade,
    };
    /* Only written once the switcher has been used: an auto-detected
       visitor keeps following their browser, on this device and the next. */
    if (state.lang) prefs.lang = state.lang;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* out of quota or storage denied — the choice still works for this session */
  }
}

const markSet = (mark, kind) => (kind === "game" ? state.marks[mark].games : state.marks[mark].exhibitors);
const isMarked = (mark, kind, key) => markSet(mark, kind).has(key);
const isSaved = (kind, key) => isMarked("saved", kind, key);
const isPlayed = (kind, key) => isMarked("played", kind, key);
const savedGames = (ex) => GCMarks.savedGames(state.marks.saved, ex);
const markCount = (mark) => state.marks[mark].exhibitors.size + state.marks[mark].games.size;
const savedCount = () => markCount("saved");
const playedCount = () => markCount("played");

/* An exhibitor counts as saved if you saved the booth itself *or* any game
   they're showing — the publisher is how you actually get to the game. */
const hasSaved = (ex) => GCMarks.hasSaved(state.marks.saved, ex);

/* A booth is done when marked directly, or when every game saved there is done.
   An unsaved booth with some incidentally played games does not count as done —
   which is why this reads off savedGames() and there is deliberately no
   playedGames() mirroring it. The two marks are not symmetric here: saving is
   what scopes a booth to you, and only then can playing everything finish it. */
const hasPlayed = (ex) => {
  const mine = savedGames(ex);
  return isPlayed("exhibitor", ex.id) ||
    (mine.length > 0 && mine.every((g) => isPlayed("game", gameKey(g.title))));
};

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
   carried by the filled plate, not by the glyph. Played always uses a check;
   its muted filled plate carries that state. */
function markButton(mark, kind, key, name, { wide = false } = {}) {
  const marked = isMarked(mark, kind, key);
  const label = markLabel(mark, kind, name, marked);
  const glyph = mark === "played" ? "✓" : marked ? "−" : "+";
  return `<button class="bm${wide ? " bm-wide" : ""}" type="button"
      data-mark="${mark}" data-bm-kind="${kind}" data-bm-key="${esc(key)}" data-bm-name="${esc(name)}"
      aria-pressed="${marked}" title="${esc(label)}" aria-label="${esc(label)}">
    <span class="bm-mark" aria-hidden="true">${glyph}</span>${
      wide ? `<span class="bm-text" aria-hidden="true">${esc(markText(mark, marked))}</span>` : ""
    }</button>`;
}

const markText = (mark, marked) =>
  mark === "played" ? t("mark.played") : marked ? t("mark.saved") : t("mark.save");

/* German declines around the booth name rather than wrapping it in "the …
   booth", so the whole sentence is one key per case with the name
   interpolated — never assembled from fragments here. */
function markLabel(mark, kind, name, marked) {
  const what = kind === "game" ? "game" : "booth";
  const action = mark === "played" ? (marked ? "unplay" : "play") : marked ? "unsave" : "save";
  return t(`mark.aria.${what}.${action}`, { name });
}

function toggleMark(mark, kind, key) {
  const set = markSet(mark, kind);
  set.has(key) ? set.delete(key) : set.add(key);
  persistMarks(mark);
  /* Only the saved set scopes the itinerary; a played tick can't orphan it. */
  if (mark === "saved") pruneItinerary();
  onMarksChanged();
}

/* rebuild:true is for the bulk clears. Patching in place is only right when a
   pointer is resting on the button that was just pressed; a clear has no such
   button, and it changes which lineup rows belong on screen at all — a saved
   game is rendered out of the "+ N more" tail, so leaving the markup alone
   strands that row with no control to collapse it again. */
function onMarksChanged({ rebuild = false } = {}) {
  /* Re-rendering the whole grid on every toggle would pull the button you just
     clicked out from under the pointer, so patch the buttons in place and only
     rebuild when a mark-dependent filter is deciding what's on screen. */
  if (rebuild || state.savedOnly || state.hidePlayed) renderExhibitors();
  else syncMarkUI();
  renderMarkControls();
  renderPriority();
  renderWristband();
  /* A bookmark toggle can add or remove whole plan stops, so the plan board
     cannot use the grid's patch-in-place shortcut. keepingFocus() restores
     its buttons. */
  renderPlan();
}

/* Bring already-rendered buttons and their rows back in sync with the sets,
   without touching the surrounding markup. */
function syncMarkUI() {
  $$('[data-mark]').forEach((btn) => {
    const { mark, bmKind: kind, bmKey: key, bmName: name } = btn.dataset;
    const marked = isMarked(mark, kind, key);
    const label = markLabel(mark, kind, name, marked);
    btn.setAttribute("aria-pressed", String(marked));
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.querySelector(".bm-mark").textContent = mark === "played" ? "✓" : marked ? "−" : "+";
    const text = btn.querySelector(".bm-text");
    if (text) text.textContent = markText(mark, marked);
    const row = btn.closest(".game");
    if (row) row.dataset[mark] = String(marked);
  });
  $$("#exhibitor-grid .card").forEach((el) => {
    const ex = state.exhibitors.find((e) => e.id === el.dataset.id);
    if (ex) {
      el.dataset.saved = String(hasSaved(ex));
      el.dataset.played = String(hasPlayed(ex));
    }
  });
  /* The corner plate reports the *other* face's saved state, which a patch of
     this card's own buttons would otherwise leave stale. */
  $$("[data-face-other]").forEach((btn) => {
    btn.dataset.faceSaved = String(isSaved("exhibitor", btn.dataset.faceOther));
  });
}

/* Re-rendering a list with innerHTML destroys the button that was just pressed,
   which drops keyboard focus back to the top of the page. Put it back on the
   equivalent button whenever one survives the re-render. When the whole row is
   gone instead (unsaving in a saved-only list removes it), land on the nearest
   remaining button — or the caller's fallback element — so keyboard users stay
   in context rather than dropping to <body>. */
function keepingFocus(container, render, fallback) {
  const el = document.activeElement;
  const inside = el && container.contains(el);
  const sel = !inside
    ? null
    : el.dataset.itDay
      ? `[data-it-kind="${CSS.escape(el.dataset.itKind)}"][data-it-key="${CSS.escape(el.dataset.itKey)}"][data-it-day="${CSS.escape(el.dataset.itDay)}"]`
      : el.dataset.mark && el.dataset.bmKey
      ? `.bm[data-mark="${CSS.escape(el.dataset.mark)}"][data-bm-kind="${CSS.escape(el.dataset.bmKind)}"][data-bm-key="${CSS.escape(el.dataset.bmKey)}"]`
      : el.dataset.srcKind
      ? `.src-btn[data-src-kind="${CSS.escape(el.dataset.srcKind)}"][data-src-key="${CSS.escape(el.dataset.srcKey)}"]`
      : el.classList.contains("more-games")
        ? `.more-games[data-id="${CSS.escape(el.dataset.id)}"]`
        : null;
  const index = sel ? [...container.querySelectorAll(".bm")].indexOf(el) : -1;
  render();
  if (!sel) return;
  const again = container.querySelector(sel);
  if (again) return again.focus();
  if (index < 0) return;
  const buttons = [...container.querySelectorAll(".bm")];
  (buttons[Math.min(index, buttons.length - 1)] || fallback)?.focus();
}

function renderMarkControls() {
  const saved = savedCount();
  const played = playedCount();
  $("#saved-count").textContent = saved ? `(${saved})` : "";
  $("#priority-saved-count").textContent = saved ? `(${saved})` : "";
  $("#played-count").textContent = played ? `(${played})` : "";
  $("#clear-saved").classList.toggle("hidden", saved === 0);
  $("#clear-played").classList.toggle("hidden", played === 0);
  $("#goto-plan")?.classList.toggle("hidden", saved === 0);
  $("#hide-played").checked = state.hidePlayed;
  $("#priority-hide-played").checked = state.hidePlayed;
  $("#share-list").classList.toggle("hidden", encodeEntries().length === 0);
}

/* ---------- sharing ----------

   A shared URL carries only guide identifiers — exhibitor ids and hashes of
   the normalised game titles — never the names themselves. Every vocabulary
   is rebuilt from the guide data, so a link needs no server and works from
   the offline cache.

   Two wire formats coexist. v1 (dot-separated: exhibitor ids verbatim, games
   as variable-length hashes) is decode-only now, for links that predate v2
   and are still pinned to chats and fridge doors. v2 writes every item,
   exhibitor or game alike, as a fixed-width 5-char base36 hash prefix: fixed
   width needs no separators, and an id like tencent-worlds-of-play stops
   costing 22 characters. That is what lets a 30-item list back into the QR
   code, which the v1 format quietly outgrew as the data doubled. */

const TOK_LEN = 5;

const shareCodes = {
  /* v1, decode only */
  exhibitorIds: new Set(),
  gameToCode: new Map(),
  codeToGame: new Map(),
  /* v2 */
  exhibitorTok: new Map(),
  gameTok: new Map(),
  tokItem: new Map(),
};

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const tok36 = (identity) => hash32(identity).toString(36).padStart(7, "0").slice(0, TOK_LEN);

function buildShareCodeMap() {
  shareCodes.exhibitorIds = new Set(state.exhibitors.map((ex) => ex.id));
  shareCodes.gameToCode.clear();
  shareCodes.codeToGame.clear();
  shareCodes.exhibitorTok.clear();
  shareCodes.gameTok.clear();
  shareCodes.tokItem.clear();

  const gameKeys = [
    ...new Set(state.exhibitors.flatMap((ex) => (ex.games || []).map((game) => gameKey(game.title)))),
  ].sort();

  /* v1 salted its collisions, which is relational: which item gets the salt
     depends on what else is in the dataset, so adding an exhibitor could
     silently repoint a token in links already shared. Decoding stays exact
     for the tokens v1 actually emitted, so the map is rebuilt the same way. */
  const taken = new Set(shareCodes.exhibitorIds);
  gameKeys.forEach((key) => {
    let salt = 0;
    let code;
    do {
      code = hash32(salt ? `${key}#${salt}` : key).toString(36);
      salt += 1;
    } while (taken.has(code));
    taken.add(code);
    shareCodes.gameToCode.set(key, code);
    shareCodes.codeToGame.set(code, key);
  });

  /* v2 shares one flat namespace and resolves collisions by exclusion: a
     prefix claimed twice is abandoned by every claimant — never emitted,
     never resolved — so a token can be lost but never mistranslated, and the
     loss surfaces through the "no longer in the guide" counts the UI already
     shows. Zero of the current 217 items collide; head-room runs to about a
     thousand before 5 characters wants revisiting. */
  const claims = new Map();
  const claim = (kind, key) => {
    const tok = tok36(key);
    if (!claims.has(tok)) claims.set(tok, []);
    claims.get(tok).push({ kind, key });
  };
  state.exhibitors.forEach((ex) => claim("exhibitors", ex.id));
  gameKeys.forEach((key) => claim("games", key));
  /* Trade booths ride the same namespace rather than a parameter of their
     own: the day plan is positional over this one token list, so a second
     list could not carry day assignments without duplicating that machinery.
     Every "dir:" key claimable in the guide is claimed here, including rows a
     curated card has since taken over — an older link naming one still has to
     land, and migrateDirAliases folds it onto the card afterwards.

     Adding ~800 identities to ~220 is what the 5-character headroom note
     below was about, so tools/fetch-directory.py re-checks it at generation
     time; only a directory that has actually loaded is in here, so a visitor
     who never turns trade mode on shares exactly what they always did. */
  (state.directory?.exhibitors || []).forEach((entry) => {
    if (isTradeEntry(entry)) claim("exhibitors", dirKey(entry.slug));
  });
  claims.forEach((items, tok) => {
    if (items.length !== 1) return;
    const item = items[0];
    (item.kind === "exhibitors" ? shareCodes.exhibitorTok : shareCodes.gameTok).set(item.key, tok);
    shareCodes.tokItem.set(tok, item);
  });
}

/* Whether a saved exhibitor key names something the visitor can actually see
   in this build — a curated card or a directory row the guide knows about.
   Used where a count is shown to a person, so a stale id left in storage
   never becomes a number nobody can check. */
const knownExhibitorKey = (id) => shareCodes.exhibitorIds.has(id) || shareCodes.exhibitorTok.has(id);

/* The saved list as sorted {tok, kind, key} entries. The order is the
   contract: `d` and `p` in the payload are positional over exactly this
   sequence, and sorting is what keeps the same list producing the same
   link byte for byte. */
function encodeEntries() {
  const entries = [];
  state.marks.saved.exhibitors.forEach((id) => {
    const tok = shareCodes.exhibitorTok.get(id);
    if (tok) entries.push({ tok, kind: "exhibitors", key: id });
  });
  state.marks.saved.games.forEach((key) => {
    const tok = shareCodes.gameTok.get(key);
    if (tok) entries.push({ tok, kind: "games", key });
  });
  return entries.sort((a, b) => (a.tok < b.tok ? -1 : 1));
}

/* The guide answers on several hostnames while the retired ones drain, and a
   saved list is per-origin. Built from location.origin, a link shared from a
   legacy host would hand the recipient — or the sender's own next device — the
   very origin they are trying to leave, so sharing could never move a list
   forward.

   Three hosts are draining, and they left for different reasons. gamescom.guide
   went because "gamescom" is a registered mark of game — Verband der deutschen
   Games-Branche e.V., which licenses it to exhibitors and has had unofficial
   sites warned off carrying it in a domain name. gc26.guide went because it was
   an abbreviation nobody could hold in their head: fine to type, useless to say
   across a queue. hallgui.de is the last of it — a name that survives the year
   in it, and reads as "hallguide" once the dot stops being punctuation.

   All three stay on this list for one reason: people are standing on them, and
   a saved list cannot cross an origin by itself. Only these are rewritten;
   hallgui.de and localhost share themselves, as they should. */
const LEGACY_HOSTS = ["gc2026.inventivetalent.org", "gamescom.guide", "gc26.guide"];
const SHARE_ORIGIN = "https://hallgui.de";

function onLegacyHost() {
  return LEGACY_HOSTS.includes(location.host);
}

/* One character per day: the base36 day of month. Absolute like a literal
   date — an index into event.days means something else the moment a day is
   added — at a twentieth of the cost of "token~2026-08-26". Null when two
   show days would share a character (a show spanning a month boundary into
   the same day-of-month); then the day plan simply does not ride. */
function dayCodeMaps() {
  const toChar = new Map();
  const toDate = new Map();
  for (const day of state.event?.days || []) {
    const ch = Number(String(day.date).slice(8, 10)).toString(36);
    if (toDate.has(ch)) return null;
    toChar.set(day.date, ch);
    toDate.set(ch, day.date);
  }
  return { toChar, toDate };
}

/* Positional over the entry order: one character per saved item, "-" for
   unscheduled, trailing blanks trimmed. A 30-item schedule costs 30
   characters where the v1 pairs cost ~370 — the difference between a day
   plan that fits a QR code and one that does not. */
function encodeDays(entries) {
  const maps = dayCodeMaps();
  if (!maps) return null;
  return entries
    .map(({ kind, key }) => maps.toChar.get(state.itinerary[kind].get(key)) || "-")
    .join("")
    .replace(/-+$/, "");
}

/* Played-and-saved as a bitmask over the entry order, 5 bits per base36
   character, trailing zeros trimmed. */
function encodePlayedMask(entries) {
  let bits = "";
  entries.forEach(({ kind, key }) => {
    bits += state.marks.played[kind].has(key) ? "1" : "0";
  });
  let mask = "";
  for (let i = 0; i < bits.length; i += 5) {
    mask += parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2).toString(36);
  }
  return mask.replace(/0+$/, "");
}

/* The ✓ does not require saving first, so played marks the bitmask cannot
   reach ride as explicit tokens. Usually empty, and costs nothing then. */
function encodePlayedOnly() {
  const toks = [];
  state.marks.played.exhibitors.forEach((id) => {
    if (state.marks.saved.exhibitors.has(id)) return;
    const tok = shareCodes.exhibitorTok.get(id);
    if (tok) toks.push(tok);
  });
  state.marks.played.games.forEach((key) => {
    if (state.marks.saved.games.has(key)) return;
    const tok = shareCodes.gameTok.get(key);
    if (tok) toks.push(tok);
  });
  return toks.sort().join("");
}

/* A part that rides empty still writes its param: `p=` with nothing in it
   says "the played part came along, and it is empty", which on a replacing
   import is the difference between clearing the local marks and leaving
   them alone. An absent param means the part did not ride at all. */
function buildShareLink({ move = false, days = false, played = false } = {}) {
  /* Search params are not part of the guide state and can contain referral or
     campaign data that should not hitch a ride in somebody else's link. */
  const origin = onLegacyHost() ? SHARE_ORIGIN : location.origin;
  const entries = encodeEntries();
  /* Versioned by the param name, v1's own convention: `l` is v1, `t` is v2.
     A `v=2&l=` spelling would cost 8 characters, and the QR budget is
     exactly 8 characters too tight for a 30-item list with its day plan. */
  const params = [`t=${entries.map((entry) => entry.tok).join("")}`];
  if (days) {
    const encoded = encodeDays(entries);
    if (encoded !== null) params.push(`d=${encoded}`);
  }
  if (played) {
    params.push(`p=${encodePlayedMask(entries)}`);
    const only = encodePlayedOnly();
    if (only) params.push(`q=${only}`);
  }
  /* Bare flag — presence is the message. v1 spelled it m=1, and the decoder
     accepts either. */
  if (move) params.push("m");
  return `${origin}${location.pathname}#s?${params.join("&")}`;
}

/* Where the move notice sends people. Everything rides — played marks and
   day assignments included — because this is not a share: it is one person's
   own plan following them to an address that is going to outlive the old
   one, the exact case the played and day toggles exist to default off for.
   The legacy-origin rewrite in buildShareLink aims it at hallgui.de.

   Payload lives in the hash, so none of it is ever sent to a server — the
   same reason a shared list can be built offline.

   Null when there is nothing saved to carry, and the notice just navigates.
   Played marks and day assignments both hang off saved items, so an empty
   saved list means an empty move; it is also the rule the Share control
   already uses to decide it has nothing to offer. */
function buildMoveLink() {
  if (!encodeEntries().length) return null;
  return buildShareLink({ move: true, days: true, played: true });
}

/* Nothing on the old hostname looks broken — it serves the same deploy — which
   is exactly why a visitor can spend the whole show on an address that is going
   away without ever noticing. Hence one nudge, and only one: it is remembered
   the moment they answer it either way, because a banner that returns on every
   load is a banner people learn to read past.

   It is deliberately not a redirect. Someone mid-plan on a show floor should
   not have the page pulled out from under them, and a move is a decision worth
   taking on purpose: everything the guide holds is per-origin, so accepting is
   what carries it (buildMoveLink above) and ignoring leaves it here.

   Bumped on every change of destination, and this is the third. Answering the
   notice does not settle anyone permanently — it moves them to whatever the
   answer pointed at, which twice now has become a host that is itself draining.
   Anyone still carrying a v1 or v2 answer is somewhere on that chain, and the
   remembered answer is what would keep them from ever hearing about hallgui.de.
   So the key carries the destination's generation rather than the notice's: one
   more nudge each time the address changes, then quiet again. */
const MOVED_KEY = "gc2026.moved.v3";
let moveNoticeOffered = false;

function moveNoticeAnswered() {
  try {
    return localStorage.getItem(MOVED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberMoveNotice() {
  try {
    localStorage.setItem(MOVED_KEY, "1");
  } catch {
    /* storage blocked (Safari private mode) — the notice returns next load,
       which is the harmless direction for this to fail in */
  }
}

function offerMove() {
  if (!onLegacyHost() || moveNoticeAnswered() || moveNoticeOffered) return;
  /* Queue sessions cannot cross origins: their server anchor and deferred
     completion live under this hostname's localStorage. Postpone the move
     until they have finished instead of stranding a measurement mid-show. */
  if (QUEUES && (QUEUES.sessions().length || QUEUES.pendingCount())) return;
  moveNoticeOffered = true;
  const move = buildMoveLink();
  showToast(
    move ? t("moved.withList") : t("moved.plain"),
    t("moved.open"),
    () => {
      rememberMoveNotice();
      location.assign(move || `${SHARE_ORIGIN}${location.pathname}${location.hash}`);
    },
    { onDismiss: rememberMoveNotice }
  );
}

function parseHash() {
  const raw = location.hash.slice(1);
  const i = raw.indexOf("?");
  const route = i === -1 ? raw : raw.slice(0, i);
  return {
    /* "s" is "saved" in payload links, where "#saved?" against "#s?" is four
       characters of QR budget. Consuming normalises it, so the alias never
       reaches the address bar, syncHash or anything that compares routes. */
    route: route === "s" ? SAVED_ROUTE : route,
    params: new URLSearchParams(i === -1 ? "" : raw.slice(i + 1)),
  };
}

function resolveTokens(payload) {
  const incoming = { exhibitors: new Set(), games: new Set(), unresolved: 0 };
  const tokens = new Set(String(payload).split(".").filter(Boolean));
  tokens.forEach((token) => {
    if (shareCodes.exhibitorIds.has(token)) incoming.exhibitors.add(token);
    else if (shareCodes.codeToGame.has(token)) incoming.games.add(shareCodes.codeToGame.get(token));
    else incoming.unresolved += 1;
  });
  return incoming;
}

/* A day nobody is exhibiting on is dropped rather than imported: dates come
   from data/event.json and an old link can outlive a schedule change, exactly
   as loadItinerary already guards the stored copy. */
function resolveDays(payload) {
  const valid = new Set((state.event.days || []).map((d) => d.date));
  const days = { exhibitors: new Map(), games: new Map() };
  String(payload)
    .split(".")
    .filter(Boolean)
    .forEach((pair) => {
      const [token, date] = pair.split("~");
      if (!valid.has(date)) return;
      if (shareCodes.exhibitorIds.has(token)) days.exhibitors.set(token, date);
      else if (shareCodes.codeToGame.has(token)) days.games.set(shareCodes.codeToGame.get(token), date);
    });
  return days;
}

/* v2: fixed-width tokens, no separators. `d` and `p` are positional over the
   token order of `l` — a position is kept even when its token no longer
   resolves, so one stale item cannot shift every day and tick after it. */
function resolveV2(params) {
  const incoming = {
    exhibitors: new Set(),
    games: new Set(),
    unresolved: 0,
    played: { exhibitors: new Set(), games: new Set(), unresolved: 0 },
    days: { exhibitors: new Map(), games: new Map() },
  };

  const list = String(params.get("t") || "");
  const items = [];
  for (let i = 0; i + TOK_LEN <= list.length; i += TOK_LEN) {
    const item = shareCodes.tokItem.get(list.slice(i, i + TOK_LEN)) || null;
    items.push(item);
    if (item) incoming[item.kind].add(item.key);
    else incoming.unresolved += 1;
  }
  /* A truncated tail is a lost item, not nothing. */
  if (list.length % TOK_LEN) incoming.unresolved += 1;

  const maps = dayCodeMaps();
  const days = String(params.get("d") || "");
  for (let i = 0; maps && i < days.length && i < items.length; i++) {
    const item = items[i];
    const date = maps.toDate.get(days[i]);
    if (item && date) incoming.days[item.kind].set(item.key, date);
  }

  const mask = String(params.get("p") || "");
  for (let ci = 0; ci < mask.length; ci++) {
    const value = parseInt(mask[ci], 36);
    if (Number.isNaN(value)) continue;
    for (let bit = 0; bit < 5; bit++) {
      if (!(value & (16 >> bit))) continue;
      const item = items[ci * 5 + bit];
      if (item) incoming.played[item.kind].add(item.key);
    }
  }

  const only = String(params.get("q") || "");
  for (let i = 0; i + TOK_LEN <= only.length; i += TOK_LEN) {
    const item = shareCodes.tokItem.get(only.slice(i, i + TOK_LEN));
    if (item) incoming.played[item.kind].add(item.key);
    else incoming.played.unresolved += 1;
  }

  return incoming;
}

/* One payload shape for every arrival, whichever format and parts it rode
   with. Anything the guide no longer recognises falls out here rather than
   reaching the stored lists. */
function parsePayload(query) {
  const params = new URLSearchParams(query);
  if (!params.has("t") && !params.has("l")) return null;
  const incoming = params.has("t")
    ? resolveV2(params)
    : Object.assign(resolveTokens(params.get("l") || ""), {
        played: resolveTokens(params.get("p") || ""),
        days: resolveDays(params.get("d") || ""),
      });
  incoming.moved = params.has("m");
  /* Presence, not emptiness — see buildShareLink on empty params. */
  incoming.hasPlayed = params.has("p") || params.has("q");
  incoming.hasDays = params.has("d");
  return incoming;
}

/* The address bar stops being the copy of the link the moment the payload is
   consumed, so this tab keeps its own until the offer has been answered.
   Dismissing the prompt then costs a reload rather than the whole list, and
   the copy dies with the tab — it can never haunt a later visit. */
const PENDING_KEY = "gc2026.share.pending";

function rememberPending(payload) {
  try {
    sessionStorage.setItem(PENDING_KEY, payload);
  } catch {
    /* storage denied — the offer simply won't survive a reload */
  }
}

function forgetPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing was stored in the first place */
  }
}

function takeIncomingList() {
  const { route, params } = parseHash();
  if (route !== SAVED_ROUTE || (!params.has("t") && !params.has("l"))) return null;

  /* The whole query, not just the list: a move's played marks and day
     assignments have to survive an unanswered prompt the same way. */
  const query = params.toString();
  rememberPending(query);
  /* Consume the payload before any rendering can synchronise the route, so a
     refresh cannot import twice and the link is not left lying in the bar. */
  history.replaceState(null, "", "#saved");
  return parsePayload(query);
}

/* An offer this tab was made but never answered — a dismissed prompt, or a
   reload before the visitor decided. */
function pendingIncomingList() {
  let query = null;
  try {
    query = sessionStorage.getItem(PENDING_KEY);
  } catch {
    /* storage denied */
  }
  return query === null ? null : parsePayload(query);
}

const incomingCount = (incoming) => incoming.exhibitors.size + incoming.games.size;
const dayCount = (days) => days.exhibitors.size + days.games.size;
const itemLabel = (n) => t("share.items", { n });

/* The saved list is what the counts are about, so what else rode along is said
   separately rather than folded into a number nobody can check. Worded for
   any link — the day-plan toggle lets a plain share carry one now. */
function carriedNote(incoming) {
  const also = [];
  if (dayCount(incoming.days)) also.push(t("share.carried.days"));
  if (incomingCount(incoming.played)) also.push(t("share.carried.played"));
  return also.length ? t("share.carried.note", { what: also.join(t("share.carried.join")) }) : "";
}

function unresolvedNote(n) {
  if (!n) return "";
  return t("share.stale", { n });
}

function renderBookmarkViews() {
  renderExhibitors();
  renderMarkControls();
  renderPriority();
  renderWristband();
  renderPlan();
}

/* The snapshot covers all three lists so Undo puts back exactly what was
   here — an import landing on a device that had already been used has to be
   reversible whichever mode it applied in.

   Merge unions and never removes: a friend's link is an offer, not an
   authority over what you already chose. Replace assigns: a move is the same
   person's newer state, and replacing is the only way a removal or a
   rescheduled day ever travels between their devices. Parts that did not
   ride are left alone in both modes — absent means "not moved", not "none". */
function applyIncoming(incoming, mode = "merge") {
  const before = {
    exhibitors: new Set(state.marks.saved.exhibitors),
    games: new Set(state.marks.saved.games),
    played: {
      exhibitors: new Set(state.marks.played.exhibitors),
      games: new Set(state.marks.played.games),
    },
    itinerary: {
      exhibitors: new Map(state.itinerary.exhibitors),
      games: new Map(state.itinerary.games),
    },
    moved: incoming.moved,
  };
  if (mode === "replace") {
    state.marks.saved = {
      exhibitors: new Set(incoming.exhibitors),
      games: new Set(incoming.games),
    };
    persistMarks("saved");
    if (incoming.hasPlayed) {
      state.marks.played = {
        exhibitors: new Set(incoming.played.exhibitors),
        games: new Set(incoming.played.games),
      };
      persistMarks("played");
    }
    if (incoming.hasDays) {
      state.itinerary = {
        exhibitors: new Map(incoming.days.exhibitors),
        games: new Map(incoming.days.games),
      };
      persistItinerary();
    }
    /* When the day plan stayed home, local assignments survive for items
       still saved and fall away with the items the replace removed. */
    pruneItinerary();
  } else {
    incoming.exhibitors.forEach((id) => state.marks.saved.exhibitors.add(id));
    incoming.games.forEach((key) => state.marks.saved.games.add(key));
    persistMarks("saved");
    if (incomingCount(incoming.played)) {
      incoming.played.exhibitors.forEach((id) => state.marks.played.exhibitors.add(id));
      incoming.played.games.forEach((key) => state.marks.played.games.add(key));
      persistMarks("played");
    }
    /* Applied after the saved list, because an assignment only survives
       loadItinerary/pruneItinerary while the item it points at is saved.
       Blanks only: an addition must not reschedule what the visitor already
       placed — overwriting is what replace is for. */
    if (dayCount(incoming.days)) {
      incoming.days.exhibitors.forEach((date, id) => {
        if (!state.itinerary.exhibitors.has(id)) state.itinerary.exhibitors.set(id, date);
      });
      incoming.days.games.forEach((date, key) => {
        if (!state.itinerary.games.has(key)) state.itinerary.games.set(key, date);
      });
      persistItinerary();
    }
  }
  /* A link written before a booth earned a card carries the old "dir:" key;
     fold it onto the card now rather than leaving the same booth saved twice. */
  migrateDirAliases();
  renderBookmarkViews();
  /* Answered. Undo is a correction to a decision already made, not a reason to
     put the offer back on the table. */
  forgetPending();
  return before;
}

function restoreBookmarks(snapshot) {
  state.marks.saved = {
    exhibitors: new Set(snapshot.exhibitors),
    games: new Set(snapshot.games),
  };
  persistMarks("saved");
  state.marks.played = {
    exhibitors: new Set(snapshot.played.exhibitors),
    games: new Set(snapshot.played.games),
  };
  persistMarks("played");
  state.itinerary = {
    exhibitors: new Map(snapshot.itinerary.exhibitors),
    games: new Map(snapshot.itinerary.games),
  };
  persistItinerary();
  /* Undo can take away items the visitor already placed on a day. */
  pruneItinerary();
  renderBookmarkViews();
  showToast(snapshot.moved ? t("toast.moveUndone") : t("toast.importUndone"), null, null, {
    priority: true,
    replace: true,
  });
}

/* A link can name trade booths the guide has not fetched yet — the recipient
   may never have turned trade mode on, which is exactly the case the pref is
   not allowed to break. Unresolved tokens are therefore a reason to go and
   look before saying "out of date": load the directory, rebuild the
   vocabulary, and re-read the payload (it is still in sessionStorage) before
   the offer is made. Offline with a cold cache falls through to the old
   behaviour, which counts them as no longer in the guide. */
async function offerIncomingWhenReady(incoming) {
  if (incoming.unresolved > 0 && !state.directory) {
    await loadDirectory();
    const again = pendingIncomingList();
    if (again) return offerIncoming(again);
  }
  return offerIncoming(incoming);
}

function offerIncoming(incoming) {
  const total = incomingCount(incoming);
  if (total === 0) {
    forgetPending();
    showToast(t("share.outOfDate"), null, null, {
      priority: true,
    });
    return;
  }

  const stale = unresolvedNote(incoming.unresolved);
  /* Old localStorage entries can outlive a renamed/removed guide item. They
     remain stored in case the data returns, but do not make the visible local
     list count as non-empty for import decisions. */
  if (encodeEntries().length === 0) {
    const before = applyIncoming(incoming);
    showToast(
      (incoming.moved
        ? t("share.loadedMoved", { items: itemLabel(total) })
        : t("share.loadedShared", { items: itemLabel(total) })) +
        carriedNote(incoming) +
        stale,
      t("action.undo"),
      () => restoreBookmarks(before),
      { priority: true }
    );
    return;
  }

  const newCount =
    [...incoming.exhibitors].filter((id) => !state.marks.saved.exhibitors.has(id)).length +
    [...incoming.games].filter((key) => !state.marks.saved.games.has(key)).length;

  /* A move landing where a list already lives offers replace, not merge —
     it is the only path on which a removal or a moved day travels, and a
     union here would resurrect on this device exactly what was deleted on
     the other one. Destructive in a way nothing else in the guide is, so
     the toast counts what goes before anything is touched, and the count
     only names items the visitor can see — entries the guide no longer
     recognises are invisible to them and would make the number a lie. */
  if (incoming.moved) {
    const drops =
      [...state.marks.saved.exhibitors].filter(
        (id) => knownExhibitorKey(id) && !incoming.exhibitors.has(id)
      ).length +
      [...state.marks.saved.games].filter(
        (key) => shareCodes.gameToCode.has(key) && !incoming.games.has(key)
      ).length;
    const news = newCount ? t("share.newToYou", { n: newCount }) : "";
    const cost = drops ? t("share.replaceCost", { n: drops }) : "";
    showToast(
      t("share.movedPlan", { items: itemLabel(total), news }) + cost + stale,
      t("share.replaceAction"),
      () => {
        const before = applyIncoming(incoming, "replace");
        showToast(
          t("share.replaced") + carriedNote(incoming) + stale,
          t("action.undo"),
          () => restoreBookmarks(before),
          { priority: true, replace: true }
        );
      },
      { priority: true }
    );
    return;
  }

  /* Someone re-opening a link they already imported. There is nothing to
     add, so offering the button would only produce an import of nothing. */
  if (newCount === 0) {
    forgetPending();
    showToast(t("share.alreadyHave") + stale, null, null, {
      priority: true,
    });
    return;
  }
  showToast(
    t("share.linkHas", { items: itemLabel(total), n: newCount }) + stale,
    t("share.addAction"),
    () => {
      const before = applyIncoming(incoming);
      showToast(
        t("share.added", { items: itemLabel(newCount) }) + carriedNote(incoming) + stale,
        t("action.undo"),
        () => restoreBookmarks(before),
        { priority: true, replace: true }
      );
    },
    { priority: true }
  );
}

/* What the dialog's controls currently ask for. Never persisted: the mode
   and its boxes reset on every open, because a played list shared once by
   accident must not become the quiet default for the next link.

   Every element access here tolerates a cached pre-modes index.html (the
   bindSourcesDialog rule): the SW serves markup and script on different
   cache strategies, so one load can pair them across the format change,
   and that load must still share saved-only rather than throw. */
function shareSelection() {
  return {
    move: Boolean($("#share-mode-device")?.checked),
    days: Boolean($("#share-part-days")?.checked),
    played: Boolean($("#share-part-played")?.checked),
  };
}

/* The mode sets the defaults — someone else gets the list alone, your own
   device gets everything — and the boxes stay live afterwards for the
   in-between cases, like handing a friend the day plan you built together. */
function applyShareModeDefaults() {
  const device = Boolean($("#share-mode-device")?.checked);
  const days = $("#share-part-days");
  const played = $("#share-part-played");
  if (days) days.checked = device;
  if (played) played.checked = device;
}

/* An empty part stays visible but disabled rather than vanishing, so the
   row does not reflow underneath a toggle someone is about to tap. */
function syncSharePart(part, count) {
  const box = $(`#share-part-${part}`);
  if (!box) return;
  box.disabled = count === 0;
  if (box.disabled) box.checked = false;
  $(`#share-part-${part}-count`).textContent = `(${count})`;
}

function renderShareDialog() {
  const entries = encodeEntries();
  const dayTotal = dayCodeMaps()
    ? entries.filter(({ kind, key }) => state.itinerary[kind].has(key)).length
    : 0;
  const playedTotal =
    entries.filter(({ kind, key }) => state.marks.played[kind].has(key)).length +
    encodePlayedOnly().length / TOK_LEN;
  const savedCountEl = $("#share-part-saved-count");
  if (savedCountEl) savedCountEl.textContent = `(${entries.length})`;
  syncSharePart("days", dayTotal);
  syncSharePart("played", playedTotal);

  const link = buildShareLink(shareSelection());
  const input = $("#share-link");
  input.value = link;
  const shareable = entries.length;
  const unavailable = savedCount() - shareable;
  $("#share-count").textContent = unavailable
    ? t("share.readyWithStale", { items: itemLabel(shareable) }) +
      t("share.staleOlder", { n: unavailable })
    : itemLabel(shareable);

  const nativeShare = $("#native-share");
  nativeShare.hidden = typeof navigator.share !== "function";

  const hasEncoder = typeof window.qrSvg === "function";
  const svg = hasEncoder ? window.qrSvg(link) : null;
  $("#share-qr").hidden = !svg;
  $("#share-qr-image").innerHTML = svg || "";
  const fallback = $("#share-qr-fallback");
  fallback.textContent = hasEncoder ? t("share.qrTooLong") : t("share.qrFailed");
  fallback.hidden = Boolean(svg);

  const status = $("#share-status");
  status.textContent = "";
}

/* Copy and OS-share are identical in both share sheets — only the ids and
   the sheet's title differ — so the wiring lives once.

   A refused clipboard is not an error state: it falls back to selecting the
   link, which is what a person would have done unaided, and says so. */
function bindLinkActions({ input, copy, native, status, titleKey }) {
  const say = (message) => {
    status.textContent = message;
  };
  input.addEventListener("focus", () => input.select());

  copy.addEventListener("click", async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(input.value);
      say(t("share.copied"));
    } catch {
      input.focus();
      input.select();
      say(t("share.copyManually"));
    }
  });

  native.addEventListener("click", async () => {
    try {
      await navigator.share({ title: t(titleKey), url: input.value });
    } catch (err) {
      /* Closing the OS sheet without picking anything is a choice, not a
         failure, and reporting it would call every dismissal a problem. */
      if (err?.name !== "AbortError") say(t("share.failed"));
    }
  });
}

function bindShareDialog() {
  const dialog = $("#share-dialog");
  const input = $("#share-link");

  $("#share-list").addEventListener("click", () => {
    /* Fresh defaults on every open — see shareSelection. */
    const friend = $("#share-mode-friend");
    if (friend) {
      friend.checked = true;
      applyShareModeDefaults();
    }
    renderShareDialog();
    dialog.showModal();
  });
  ["#share-mode-friend", "#share-mode-device"].forEach((selector) =>
    $(selector)?.addEventListener("change", () => {
      applyShareModeDefaults();
      renderShareDialog();
    })
  );
  ["#share-part-days", "#share-part-played"].forEach((selector) =>
    $(selector)?.addEventListener("change", renderShareDialog)
  );
  bindDialogDismiss(dialog, $("#close-share"));
  bindLinkActions({
    input,
    copy: $("#copy-share-link"),
    native: $("#native-share"),
    status: $("#share-status"),
    titleKey: "share.nativeTitle",
  });
}

/* ---------- share the guide ----------

   Distinct from sharing a saved list: nothing of yours rides along, so there
   is nothing to choose and the sheet is just the address, twice — once as a
   code to hold up to the phone of whoever you are queueing with, once as
   text to paste wherever you were going to paste it. */

/* The address to hand out is not the one in the address bar. That one can
   carry a shared-list hash, a ?lang the recipient should be resolving for
   themselves, campaign params, /index.html spelled out, or the hostname the
   guide is in the middle of leaving — and a QR code outlives every one of
   those. Each page states where it lives in its canonical tag, so that is
   what gets shared; the origin rule behind it is buildShareLink's. */
function siteShareUrl() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (isHttpUrl(canonical)) return canonical;
  return `${onLegacyHost() ? SHARE_ORIGIN : location.origin}/`;
}

function renderSiteShare() {
  const url = siteShareUrl();
  $("#site-share-link").value = url;

  /* js/qr.js is deferred, so it is there by the time anything can be
     tapped — but a share sheet that renders an empty white square would be
     worse than one that says "use the link", and the link is right below. */
  const svg = typeof window.qrSvg === "function" ? window.qrSvg(url) : null;
  $("#site-share-qr").hidden = !svg;
  $("#site-share-qr-image").innerHTML = svg || "";
  $("#site-share-qr-fallback").hidden = Boolean(svg);

  $("#native-site-share").hidden = typeof navigator.share !== "function";
  $("#site-share-status").textContent = "";
}

function bindSiteShare() {
  const dialog = $("#site-share-dialog");
  const button = $("#share-site");
  /* Tolerate a cached pre-share index.html — the bindSourcesDialog rule. */
  if (!dialog || !button) return;

  button.addEventListener("click", () => {
    renderSiteShare();
    dialog.showModal();
  });
  bindDialogDismiss(dialog, $("#close-site-share"));
  bindLinkActions({
    input: $("#site-share-link"),
    copy: $("#copy-site-link"),
    native: $("#native-site-share"),
    status: $("#site-share-status"),
    titleKey: "shareSite.nativeTitle",
  });
}

/* ---------- sources & attribution ----------

   Every entry in data/*.json already records the pages it was built from. An
   unofficial guide that asks you to plan a day around a booth number owes you
   the ability to check it, so each card carries a quiet marker that opens its
   list — and the cards you most want to check are exactly the ones whose hall
   plate says "unconf.". */

/* Only http(s) becomes a live link: a stray javascript: or data: URL in the
   data would otherwise be one tap away on every card showing it. */
const isHttpUrl = (url) => /^https?:\/\//i.test(String(url));
const sourceList = (sources) => (Array.isArray(sources) ? sources.filter(isHttpUrl) : []);

/* Split for display: the host is what tells you whether this is gamescom
   itself, the exhibitor, or a games-press roundup — so it leads, and the path
   follows in a dimmer tone rather than a wrapped 120-character URL. */
function sourceParts(url) {
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname}${parsed.search}`.replace(/\/+$/, "");
    return { host: parsed.hostname.replace(/^www\./, ""), rest };
  } catch {
    /* isHttpUrl already passed, so this is a URL the parser rejects — show it
       whole rather than dropping the only evidence for the entry. */
    return { host: url, rest: "" };
  }
}

function sourcesSubject(kind, key) {
  if (kind === "event") {
    return {
      name: state.event?.name || t("sources.thisGuide"),
      what: "event",
      sources: state.event?.sources,
      updated: state.meta?.lastUpdated,
    };
  }
  const ex = state.exhibitors.find((item) => item.id === key);
  if (!ex) return null;
  return {
    name: ex.name,
    what: "card",
    sources: ex.sources,
    updated: ex.lastUpdated,
  };
}

/* The dialog lives in index.html, which the service worker refreshes
   independently of this file (see the note in renderPlan) — no dialog, no
   marker, rather than a marker that does nothing when it is tapped. */
function sourcesButton(kind, key) {
  const subject = sourcesSubject(kind, key);
  const list = sourceList(subject?.sources);
  if (!list.length || !$("#sources-dialog")) return "";
  const label = t("sources.aria", { name: subject.name, n: list.length });
  return `<button class="src-btn" type="button"
      data-src-kind="${esc(kind)}" data-src-key="${esc(key)}"
      title="${esc(label)}" aria-label="${esc(label)}" aria-haspopup="dialog">
    <span class="src-glyph" aria-hidden="true">i</span>
    <span class="src-n" aria-hidden="true">${list.length}</span>
  </button>`;
}

function openSources(kind, key) {
  const dialog = $("#sources-dialog");
  const subject = sourcesSubject(kind, key);
  const list = sourceList(subject?.sources);
  if (!dialog || !list.length) return;

  $("#sources-subject").textContent = subject.name;
  $("#sources-note").textContent =
    t(`sources.note.${subject.what}`, { n: list.length }) +
    (subject.updated
      ? t("sources.lastChecked", { date: formatDate(subject.updated) })
      : "");
  $("#sources-list").innerHTML = list
    .map((url, i) => {
      const { host, rest } = sourceParts(url);
      return `<li>
        <span class="src-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <a href="${esc(url)}" target="_blank" rel="noopener nofollow">
          <span class="src-host">${esc(host)}</span>${rest ? `<span class="src-path">${esc(rest)}</span>` : ""}
          <span class="sr-only">${esc(t("a11y.newTab"))}</span>
        </a>
      </li>`;
    })
    .join("");
  dialog.showModal();
}

/* Backdrop clicks target the dialog itself. Check the coordinates as well, so
   a click on padding inside the panel does not dismiss it. */
function bindDialogDismiss(dialog, closeBtn) {
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

function bindSourcesDialog() {
  const dialog = $("#sources-dialog");
  if (!dialog) return; // tolerate a cached pre-sources index.html
  bindDialogDismiss(dialog, $("#close-sources"));
}

/* ---------- itinerary ---------- */

function loadItinerary() {
  const empty = { exhibitors: new Map(), games: new Map() };
  try {
    const raw = JSON.parse(localStorage.getItem(IT_KEY) || "{}");
    const validDays = new Set((state.event?.days || []).map((d) => d.date));
    const entries = (kind) => {
      const source =
        raw && raw[kind] && typeof raw[kind] === "object" && !Array.isArray(raw[kind]) ? raw[kind] : {};
      const saved = state.marks.saved[kind];
      return Object.entries(source).filter(([key, date]) => saved.has(key) && validDays.has(date));
    };
    return {
      exhibitors: new Map(entries("exhibitors")),
      games: new Map(entries("games")),
    };
  } catch {
    /* corrupt entry, or storage blocked entirely — assignments stay in-session */
    return empty;
  }
}

function persistItinerary() {
  try {
    localStorage.setItem(
      IT_KEY,
      JSON.stringify({
        exhibitors: Object.fromEntries(state.itinerary.exhibitors),
        games: Object.fromEntries(state.itinerary.games),
      })
    );
  } catch {
    /* out of quota or storage denied — assignments still work for this session */
  }
}

const itMap = (kind) => (kind === "game" ? state.itinerary.games : state.itinerary.exhibitors);
const assignedDay = (kind, key) => itMap(kind).get(key) || null;

function assignToDay(kind, key, date) {
  const map = itMap(kind);
  map.get(key) === date ? map.delete(key) : map.set(key, date);
  persistItinerary();
  onItineraryChanged();
}

function pruneItinerary() {
  let changed = false;
  for (const kind of ["exhibitors", "games"]) {
    for (const key of state.itinerary[kind].keys()) {
      if (state.marks.saved[kind].has(key)) continue;
      state.itinerary[kind].delete(key);
      changed = true;
    }
  }
  if (changed) persistItinerary();
}

function onItineraryChanged() {
  /* An assignment feeds both lenses (day groups here, day tags and the day
     filter on the hall view), so the whole plan section re-renders. */
  renderPlan();
}

/* ---------- filtering & sorting ---------- */

/* Shared orderings. Crowd-desc is the house default wherever booths rank;
   hall order approximates a sensible walk through the entertainment halls —
   decimal halls are upper levels, so parseFloat keeps 6.1 after 6 and before
   7, and missing halls sort last. If verified venue routing ever lands,
   hallRank is the single seam to replace with an explicit order: the grid's
   hall sort, the planner's route and the wristband list all read through it. */
const byName = (a, b) => a.localeCompare(b, GCI18N.lang);
const byCrowdDesc = (a, b) => (b.crowd || 0) - (a.crowd || 0) || byName(a.name, b.name);
const hallRank = (hall) => (hall ? parseFloat(hall) : Infinity);

/* "Hide 18+" is a browsing filter — "don't show me demos I can't play" — and
   deliberately not a content filter. It hides lineup rows, not prose: an earlier
   pass regex-scrubbed adult titles out of the searchable description, which made
   the grid render a name it would then refuse to find, and could never be
   complete anyway (visitAdvice says "hit MW4 or 007 First Light first", and
   Plaion carries an "18+" tag). A leaky content filter reads as a guarantee it
   cannot keep, so descriptions stay exactly as written and stay searchable. */
function matchesQuery(ex, q) {
  if (!q) return true;
  const hay = [
    ex.name,
    ex.description,
    ex.country || "",
    countryLabel(ex.country || ""),
    /* Both spellings of "hall 7.1", so the word works in either language
       whichever one the page is in. */
    ex.hall ? `hall ${ex.hall} ${t("hall.word")} ${ex.hall}` : "",
    ex.booth || "",
    /* Raw tag and its localized label both match: a German visitor types
       "Simracing", an English one "sim racing", and the chip they can see
       is always searchable. */
    ...(ex.tags || []),
    ...(ex.tags || []).map(tagLabel),
    ...visibleGames(ex).map((g) => g.title),
    /* Searching "18+" while hiding 18+ would return exactly the booths whose
       gated titles are currently hidden. */
    hasAdult(ex) && state.age !== "hide" ? "18+" : "",
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
    state.savedOnly ||
    state.hidePlayed
  );
}

/* ---------- two-faced cards ----------

   Around twenty exhibitors hold a consumer booth *and* a business-hall booth:
   Capcom demos in 9.1 and takes meetings in 4.2, a fifteen-minute walk apart.
   They are one company and genuinely two stops, so the guide files them as two
   cards — the business one carrying `businessOf: "<consumer id>"` — and the
   grid renders the pair as a single card you can turn over.

   Two cards rather than one card with a nested block, because each face needs
   everything a card needs (its own location, description, offers, sources,
   saved state). Keeping them the same shape means a business-only booth like
   Cloudflare is not a special case, and the planner, map, share links and
   closed-day warning all keep treating each booth as the separate stop it is. */

function businessFaces() {
  const map = new Map();
  for (const ex of state.exhibitors) {
    if (ex.businessOf) map.set(ex.businessOf, ex);
  }
  return map;
}

/* The other side of this card, if it has one and the visitor is being offered
   trade content at all. */
function otherFace(ex) {
  if (!state.trade) return null;
  if (ex.businessOf) return state.exhibitors.find((e) => e.id === ex.businessOf) || null;
  return businessFaces().get(ex.id) || null;
}

/* Which face the filters ask for. Selecting the trade category, or a business
   hall, is asking to see that side of every card that has one. */
function defaultFace(ex) {
  const face = businessFaces().get(ex.id);
  if (!face || !state.trade) return ex;
  if (state.type === "trade") return face;
  if (state.type !== "all") return ex;
  if (state.hall !== "all") return String(face.hall) === state.hall ? face : ex;
  return ex;
}

/* Which face is showing: the filters' default, unless this card has been
   turned over by hand. Sorting deliberately reads defaultFace() instead, so
   turning one card over never makes it jump to a different place in the grid. */
function faceOf(ex) {
  const face = businessFaces().get(ex.id);
  if (!face || !state.trade) return ex;
  if (state.flipped.has(ex.id)) return state.flipped.get(ex.id) ? face : ex;
  return defaultFace(ex);
}

/* Both sides of a card, for the filters that must not make it vanish: asking
   for Hall 4.2 has to keep Capcom, whose *other* face stands there. */
const bothFaces = (ex) => {
  const face = state.trade ? businessFaces().get(ex.id) : null;
  return face ? [ex, face] : [ex];
};

const savedEitherFace = (ex) => bothFaces(ex).some(hasSaved);

/* The cards this visitor is being offered at all. Trade cards are discovery,
   so they hide with the pref off — but only from the grid: a saved one still
   resolves everywhere, which is what plannedExhibitors() is for. A paired
   business face is never its own grid entry; it is rendered as the other side
   of the card it belongs to. */
function cardPool() {
  const owners = new Set(state.exhibitors.map((ex) => ex.id));
  return state.exhibitors.filter((ex) => {
    if (ex.businessOf && owners.has(ex.businessOf)) return false;
    return state.trade || ex.type !== "trade";
  });
}

function filtered() {
  const list = cardPool().filter((ex) => {
    const faces = bothFaces(ex);
    /* Category and hall look at both sides, so filtering to Hall 4.2 keeps
       the card whose business booth stands there and turns it over. */
    if (state.type !== "all" && !faces.some((f) => f.type === state.type)) return false;
    if (state.hall !== "all" && !faces.some((f) => String(f.hall) === state.hall)) return false;
    /* The lineup filters are about games, which only the consumer side has. */
    if (state.age === "only" && !hasAdult(ex)) return false;
    if (state.age === "hide") {
      if (ex.ageRestricted === true) return false;
      if ((ex.games || []).length && !visibleGames(ex).length) return false;
    }
    if (state.playableOnly && !visibleGames(ex).some((g) => g.playable)) return false;
    const face = faceOf(ex);
    if (state.confirmedOnly && !face.locationConfirmed) return false;
    if (state.savedOnly && !savedEitherFace(ex)) return false;
    if (state.hidePlayed && faces.every(hasPlayed)) return false;
    return faces.some((f) => matchesQuery(f, state.query));
  });

  /* Sorted on the filter-driven face, never the hand-flipped one — see
     faceOf(). */
  const key = (ex) => defaultFace(ex);
  const bySort = {
    "crowd-desc": (a, b) => byCrowdDesc(key(a), key(b)),
    "crowd-asc": (a, b) =>
      (key(a).crowd || 0) - (key(b).crowd || 0) || byName(a.name, b.name),
    name: (a, b) => byName(a.name, b.name),
    hall: (a, b) => hallRank(key(a).hall) - hallRank(key(b).hall) || byName(a.name, b.name),
  };
  return list.sort(bySort[state.sort] || bySort["crowd-desc"]);
}

/* ---------- rendering ---------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- live queues ----------

   The transport module only exposes facts. These helpers turn those facts
   into the four surfaces that use them: a full tracker on a game/booth, the
   worst live queue beside a card's forecast, and compact planner figures. */

const queueForGame = (ex, game) =>
  QUEUES && game?.playable === true ? QUEUES.queue(ex.id, gameKey(game.title)) : null;
const boothQueue = (ex) => QUEUES?.queue(ex.id, QUEUES.BOOTH) || null;

function queueEx(queue) {
  return queue && state.exhibitors.find((ex) => ex.id === queue.exhibitor);
}

function queueGame(queue) {
  const ex = queueEx(queue);
  return queue?.game === QUEUES?.BOOTH
    ? null
    : (ex?.games || []).find((game) => gameKey(game.title) === queue?.game) || null;
}

function queueName(queue) {
  const ex = queueEx(queue);
  const game = queueGame(queue);
  return game ? t("queue.nameGame", { game: game.title, exhibitor: ex?.name || queue.exhibitor }) : ex?.name || queue?.exhibitor || "";
}

const queueAttrs = (queue) =>
  `data-queue-exhibitor="${esc(queue.exhibitor)}" data-queue-game="${esc(queue.game)}"`;

function queueAge(age) {
  const minutes = Math.max(0, Math.floor(Number(age || 0) / 60));
  return minutes < 1 ? t("queue.ageNow") : t("queue.ageMinutes", { n: minutes });
}

function queueMechanics(live) {
  if (!live?.qtype || !QUEUE_TYPES.includes(live.qtype)) return "";
  const batch = Number(live.batch);
  /* The Worker reports the median of fixed input buckets. With an even vote
     count that aggregate can sit between two chips (for example 75 from 50
     and 100), and is still a valid mechanics measurement. */
  if (
    (live.qtype === "group" || live.qtype === "wave") &&
    Number.isInteger(batch) &&
    batch >= QUEUE_BATCHES[0] &&
    batch <= QUEUE_BATCHES.at(-1)
  ) {
    return t(`queue.mechanics.${live.qtype}Batch`, { n: batch });
  }
  return t(`queue.mechanics.${live.qtype}`);
}

function queueLiveMain(live) {
  const estimate = Math.max(0, Math.round(Number(live?.est) || 0));
  if (live?.closed) return t("queue.live.closed");
  if (live?.how === "flow") return t("queue.live.flow", { n: estimate });
  /* The server clamps an extreme measured wait and says so, because at the
     ceiling the figure is a floor: "4 h+", not a flat four hours. */
  if (live?.how === "done" && live.capped) {
    return t("queue.live.doneCapped", { n: Math.max(1, Math.round(estimate / 60)) });
  }
  if (live?.how === "done") return t("queue.live.done", { n: estimate });
  if (live?.how === "sofar") return t("queue.live.sofar", { n: estimate });
  return "";
}

/* Empty when there is no current figure. The "why it is empty" question —
   never reported, or reported and gone stale — is answered only in the queues
   view, where it changes what you would do about it. Answering it on a card
   put the word "unavailable" under every game of all seventy-six. */
function queueLiveMarkup(queue, { compact = false } = {}) {
  const live = QUEUES?.live(queue);
  if (!live) return "";
  const main = queueLiveMain(live);
  if (!main) return "";
  const reports = t("queue.reports", { n: Number(live.n) || 0 });
  const mechanics = queueMechanics(live);
  const detail = `<span class="queue-live-detail${compact ? " sr-only" : ""}">
    <span>${esc(reports)}</span><span aria-hidden="true">·</span>
    <span data-live-age ${queueAttrs(queue)}>${esc(queueAge(live.age))}</span>${
      mechanics ? `<span aria-hidden="true">·</span><span>${esc(mechanics)}</span>` : ""
    }
  </span>`;
  return `<span class="queue-live${compact ? " queue-live-compact" : ""}" data-tier="${esc(live.how)}">
    <span class="queue-live-main">${esc(main)}</span>${detail}
  </span>`;
}

function queueElapsedMarkup(queue, session) {
  const minutes = Math.max(0, Math.floor(QUEUES.elapsed(session) / 60));
  return `<span class="queue-session-time" data-queue-elapsed ${queueAttrs(queue)}>${esc(
    t("queue.elapsed", { n: minutes })
  )}</span>`;
}

/* A game row states its live figure and nothing else. Controls used to live
   here — join and closed on every playable title, three more once you were in
   the line — which on a twelve-game card like Xbox's put twenty-four buttons
   under one lineup. Reporting moved to the Live queues view; a card now reads.

   The unavailable notice goes with them. It made sense beside a control you
   could no longer use; repeated down a card, and again on all seventy-six of
   them, it is just the word "offline" seventy-six times. The queues view says
   it once. */
function queueTrackerInner(queue) {
  if (!QUEUES?.visible() || !queue) return "";
  return queueLiveMarkup(queue);
}

function queueTracker(queue, extraClass = "") {
  if (!QUEUES?.visible() || !queue) return "";
  return `<span class="queue-tracker${extraClass ? ` ${extraClass}` : ""}" data-queue-surface="tracker"
    tabindex="-1" ${queueAttrs(queue)}>${queueTrackerInner(queue)}</span>`;
}

/* One control per card, next to the forecast meter, replacing every per-game
   button. It carries the exhibitor so the queues view opens already narrowed
   to this booth — an ordinary hash link, the same shape as the card deep-links
   the map already emits, so Back returns to the card. */
function queueReportLinkInner(ex) {
  if (!QUEUES?.visible() || !ex) return "";
  const mine = QUEUES.sessions().filter((entry) => entry.exhibitor === ex.id).length;
  const label = mine ? t("queue.reportLinkActive", { n: mine }) : t("queue.reportLink");
  return `<a class="queue-report-link${mine ? " queue-report-link-active" : ""}" href="#queues?ex=${encodeURIComponent(ex.id)}"
    aria-label="${esc(t("queue.reportLinkAria", { exhibitor: ex.name }))}">${esc(label)}</a>`;
}

function queueReportLink(ex) {
  /* The wrapper is emitted whenever the booth *has* queues, even before the
     show opens and the contents appear. refreshQueueSurfaces() can only refill
     surfaces that are already in the DOM, so a card rendered at 08:29 on the
     Wednesday still gains its link when the gate flips at 08:30. */
  if (!QUEUES || !ex || ex.type === "trade" || isAbsent(ex)) return "";
  if (!QUEUES.queuesFor(ex).length) return "";
  return `<span class="queue-report" data-queue-surface="report" data-queue-exhibitor="${esc(
    ex.id
  )}">${queueReportLinkInner(ex)}</span>`;
}

function queueSummaryInner(ex, compact = false) {
  if (!QUEUES?.visible()) return "";
  const worst = QUEUES?.worst(ex);
  return worst ? queueLiveMarkup(worst.queue, { compact }) : "";
}

function queueSummary(ex, { compact = false, kind = "summary" } = {}) {
  if (!QUEUES?.visible() || !ex || ex.type === "trade" || isAbsent(ex)) return "";
  return `<span class="queue-summary${compact ? " queue-summary-compact" : ""}" data-queue-surface="${esc(
    kind
  )}" data-queue-exhibitor="${esc(ex.id)}" data-queue-compact="${compact}">${queueSummaryInner(ex, compact)}</span>`;
}

function compareQueueEntries(a, b) {
  if (a.live.closed !== b.live.closed) return a.live.closed ? -1 : 1;
  return (Number(b.live.est) || 0) - (Number(a.live.est) || 0) ||
    (Number(b.live.newest) || 0) - (Number(a.live.newest) || 0);
}

function itemQueueEntry(item) {
  if (!QUEUES || !item) return null;
  if (item.kind === "exhibitor") return QUEUES.worst(item.ex);
  return item.at
    .map((ex) => {
      const queue = QUEUES.queue(ex.id, item.key);
      return queue ? { queue, live: QUEUES.live(queue) } : null;
    })
    .filter((entry) => entry?.live)
    .sort(compareQueueEntries)[0] || null;
}

function itemQueueInner(item) {
  if (!QUEUES?.visible()) return "";
  const entry = itemQueueEntry(item);
  if (!entry) return "";
  const at = item.kind === "game" && item.at.length > 1 ? queueEx(entry.queue)?.name : "";
  return `${queueLiveMarkup(entry.queue, { compact: true })}${
    at ? `<span class="queue-live-at">${esc(t("queue.atExhibitor", { exhibitor: at }))}</span>` : ""
  }`;
}

function itemQueueSummary(item) {
  if (!QUEUES?.visible() || !item || (item.kind === "exhibitor" && (item.ex.type === "trade" || isAbsent(item.ex)))) return "";
  return `<span class="queue-plan-live" data-queue-surface="item" data-queue-item-kind="${esc(
    item.kind
  )}" data-queue-item-key="${esc(item.key)}">${itemQueueInner(item)}</span>`;
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

/* Which halls the map can actually draw, from data/hallplan/index.json.
   Empty when that file is missing (an older cached copy, or a hall the
   snapshot doesn't cover), and every link below is gated on it — a plate
   that opens an empty map is worse than a plate that doesn't link. */
const hasMap = (hall) => state.mapHalls.has(String(hall));

/* Which area of the show a hall stands in, and so which colour its plate is
   painted (see .hall-plate[data-area] — the official plan's own fills).

   The snapshot is the source, because it is what the map colours halls from;
   when it is missing the guide's own business-hall boundary answers instead,
   so a cold cache repaints the plates rather than dropping the distinction.
   A hall neither can place — an offsite venue, a hall we've never heard of —
   returns "" and its plate keeps the signal colour. */
const hallArea = (hall) => {
  if (!hall) return "";
  const filed = state.hallAreas.get(String(hall));
  if (filed) return filed;
  if (isBusinessHall(hall)) return "business";
  const level = parseFloat(hall);
  return level >= 5 && level < 11 ? "entertainment" : "";
};

const mapLink = (hall, booth) =>
  `map.html#${encodeURIComponent(hall)}` +
  (booth ? `/${encodeURIComponent([...GCMarks.boothCodes(booth)][0] || "")}` : "");

/* Every other place a hall is named — the planner rows, the directory — is
   also a way to that hall on the map. One helper so all of them make the
   same promise: plain text when the snapshot can't draw that hall, and a
   link that says out loud where it goes when it can. The visible label is
   left exactly as the row wrote it; only the destination is added. */
/* One phrasing of "Hall 7.1, booth A061" for every accessible name that
   needs it — the card plate, the planner rows, the directory chips. */
const whereLabel = (hall, booth) =>
  booth ? t("where.hallBooth", { hall, booth }) : t("where.hall", { hall });

function hallLink(hall, booth, label) {
  if (!hasMap(hall)) return esc(label);
  return `<a class="hall-link" href="${esc(mapLink(hall, booth))}"
    title="${esc(t("map.openTitle"))}"
    aria-label="${esc(t("map.openAria", { where: whereLabel(hall, booth) }))}">${esc(label)}</a>`;
}

/* The Halls & areas list names a span where every other place names a hall:
   one hall ("10.1"), a whole level whose halves it doesn't distinguish
   ("5"), or a run of levels ("5–10"). The map draws one hall at a time, so
   a span opens at the lowest hall inside it the snapshot can draw — "5–10"
   lands in the first entertainment hall, "2–4" in the first business one,
   and the map's own chip row, grouped by area, carries you along the rest.

   Only whole levels widen like that. "5.1" is a hall the snapshot either
   has or hasn't, and quietly landing on 5.2 instead would be a different
   room — so it stays plain text, as does anything unparseable. */
function areaMapHall(hall) {
  const filed = String(hall ?? "").trim();
  if (!filed) return "";
  if (hasMap(filed)) return filed;
  /* Either dash, and either side of it spaced or not: this is hand-filed
     prose, and "2 – 4" means what "2–4" means. */
  const ends = filed.split(/\s*[–—-]\s*/);
  if (!ends.every((end) => /^\d+$/.test(end))) return "";
  const from = Number(ends[0]);
  const to = Number(ends[ends.length - 1]);
  return (
    [...state.mapHalls]
      .filter((id) => Math.floor(hallRank(id)) >= from && Math.floor(hallRank(id)) <= to)
      .sort((a, b) => hallRank(a) - hallRank(b))[0] || ""
  );
}

/* The way to this card's other booth, notched into the corner of the plate
   that shows the current one. It sits *on* the plate rather than at the foot
   of the card because that is the corner your thumb is already near and the
   one place the swap reads as an exchange rather than a jump.

   The colour is not decoration: the square is the other face's plate in
   miniature, painted in the colour Koelnmesse gives that hall on its own plan
   — purple across to the business halls, cyan back to the entertainment ones,
   the same fills the map washes those halls with. So turning the card over
   teaches what a plate's colour means in one gesture.

   The small square carries the other side's saved state, because otherwise a
   saved trade stop is invisible until you turn the card. */
function faceSwitch(ex) {
  const other = otherFace(ex);
  if (!other) return "";
  const toTrade = other.type === "trade";
  const label = toTrade
    ? t("card.faceToTrade", { hall: other.hall })
    : t("card.faceToPublic", { hall: other.hall });
  const area = hallArea(other.hall) || (toTrade ? "business" : "");
  /* data-face-other names whose saved state the dot reflects, so syncMarkUI
     can keep it live: a mark toggle patches buttons in place rather than
     rebuilding the grid, and without this the dot only appeared on the next
     full render. */
  return `<button class="face-switch" type="button" data-area="${esc(area)}"
      data-face="${esc(ex.businessOf || ex.id)}" data-face-to="${toTrade ? "trade" : "public"}"
      data-face-other="${esc(other.id)}" data-face-saved="${hasSaved(other)}"
      title="${esc(label)}" aria-label="${esc(label)}">
    <span class="face-hall" aria-hidden="true">${esc(other.hall || "?")}</span>
    <span class="face-saved" aria-hidden="true"></span>
  </button>`;
}

/* The hall number is the one thing you read while walking, so it gets
   set like a wayfinding sign rather than tucked into a badge. */
function hallMarker(ex) {
  /* Every return goes through wrap(), so a card with a business booth still
     offers the way to it even when this side has no location at all —
     Wargaming has no consumer hall and a stand in 2.2. */
  const area = hallArea(ex.hall) || (ex.type === "trade" ? "business" : "");
  const wrap = (plate) =>
    `<div class="hall-plate" data-area="${esc(area)}">${plate}${faceSwitch(ex)}</div>`;
  if ((ex.tags || []).includes("not exhibiting")) {
    return wrap(`<div class="hall-marker" data-state="absent">
      <span class="hall-kicker">${esc(t("plate.statusKicker"))}</span>
      <span class="hall-num">${esc(t("plate.absent"))}</span>
      <span class="hall-booth">${esc(t("plate.noBooth"))}</span>
    </div>`);
  }
  if (!ex.hall) {
    return wrap(`<div class="hall-marker" data-state="tba">
      <span class="hall-kicker">${esc(t("hall.word"))}</span>
      <span class="hall-num">${esc(t("plate.tba"))}</span>
      <span class="hall-booth">${esc(t("plate.notAnnounced"))}</span>
    </div>`);
  }
  const confirmed = !!ex.locationConfirmed;
  const where = confirmed ? t("plate.confirmedTitle") : t("plate.unconfirmedTitle");
  const inner = `<span class="hall-kicker">${esc(t("hall.word"))}</span>
    <span class="hall-num">${esc(ex.hall)}</span>
    <span class="hall-booth">${ex.booth ? esc(ex.booth) : esc(t("plate.boothTba"))}${
      confirmed ? "" : esc(t("plate.unconfSuffix"))
    }</span>`;
  const state_ = `data-state="${confirmed ? "confirmed" : "unconfirmed"}"`;
  /* The plate is already the "where" of the card, so it is also the way
     to the map — no second control competing for the same corner. */
  if (!hasMap(ex.hall)) {
    return wrap(`<div class="hall-marker" ${state_} title="${esc(where)}">${inner}</div>`);
  }
  return wrap(`<a class="hall-marker" ${state_} href="${esc(mapLink(ex.hall, ex.booth))}"
      title="${esc(t("map.openTitleWith", { what: where }))}"
      aria-label="${esc(t("map.openAria", { where: whereLabel(ex.hall, ex.booth) }))}">
    ${inner}<span class="hall-map-cue" aria-hidden="true">${esc(t("map.cue"))}</span>
  </a>`);
}

function ageBadge(status = "expected", label = "18+", extraClass = "") {
  const ageStatus = status === "confirmed" ? "confirmed" : "expected";
  const title = ageStatus === "confirmed" ? t("age.confirmedTitle") : t("age.expectedTitle");
  return `<span class="badge badge-age${extraClass ? ` ${extraClass}` : ""}" data-age-status="${ageStatus}"
      title="${esc(title)}"><span aria-hidden="true">${esc(label)}</span><span class="sr-only">${esc(title)}</span></span>`;
}

/* A booth-wide `ageRestricted` is a hand-written editorial assertion that the
   zone is gated — per docs/UPDATING.md it is only set when a source supports it,
   so it counts as confirmed. A per-game flag inferred from the title's rating
   does not, and stays "expected". */
const boothAgeStatus = (ex) =>
  ex.ageRestricted === true || adultGames(ex).some((g) => g.ageStatus === "confirmed")
    ? "confirmed"
    : "expected";

function gameRow(ex, g) {
  const status = g.status || "expected";
  const plat = platformCodes(g.platforms);
  /* "confirmed" is the default state — labelling all 23 rows of a big booth
     would be noise, so it stays a dot plus screen-reader text. */
  const statusLabel =
    status === "confirmed"
      ? `<span class="sr-only">${esc(t("status.confirmed"))}</span>`
      : `<span class="badge badge-status" data-status="${esc(status)}">${esc(
          t(`status.${status}`) === `status.${status}` ? status : t(`status.${status}`)
        )}</span>`;
  const key = gameKey(g.title);
  return `<li class="game" data-status="${esc(status)}" data-saved="${isSaved("game", key)}" data-played="${isPlayed("game", key)}">
    <span class="game-main">
      <span class="game-title">${esc(g.title)}</span>
      ${statusLabel}
      ${g.playable ? `<span class="badge badge-playable">${esc(t("badge.playable"))}</span>` : ""}
      ${isAdult(g) ? ageBadge(g.ageStatus) : ""}
    </span>
    ${plat ? `<span class="game-plat">${esc(plat)}</span>` : "<span></span>"}
    ${markButton("played", "game", key, g.title)}
    ${markButton("saved", "game", key, g.title)}
    ${g.note ? `<span class="game-note">${esc(g.note)}</span>` : ""}
    ${g.playable === true ? queueTracker(queueForGame(ex, g), "game-queue") : ""}
  </li>`;
}

/* The last line of the card: where the booth speaks for itself (the official
   profile) and where we got the rest (the sources marker). Both are optional,
   and the row disappears when neither is there. */
function footLinks(ex) {
  const official = ex.officialUrl
    ? /* Every card would otherwise announce the same "Official exhibitor page"
         to a screen reader, so the booth name rides along in the accessible name. */
      `<a class="official-link" href="${esc(ex.officialUrl)}" target="_blank" rel="noopener">${esc(
        t("card.officialPage")
      )}<span aria-hidden="true"> ↗</span><span class="sr-only">${esc(
        t("card.officialPageAria", { name: ex.name })
      )}</span></a>`
    : "";
  const sources = sourcesButton("exhibitor", ex.id);
  return official || sources ? `<div class="foot-links">${official}${sources}</div>` : "";
}

/* The trade card's answer to the Lineup block. A business booth has no games
   to list, so what it is *for* takes that space — and the access line takes
   the queue meter's, because "can I just walk up" is the equivalent question. */
function tradeBlocks(ex) {
  const offers = ex.offers || [];
  const access = tradeAccess(ex.access);
  const list = offers.length
    ? `<div class="block">
        <div class="block-head">
          <span>${esc(t("trade.offers"))}</span>
          <span>${esc(t("trade.offerCount", { n: offers.length }))}</span>
        </div>
        <ul class="offers">${offers.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      </div>`
    : "";
  /* The card's own note always wins. Failing that, only the two states that
     need explaining carry the default: "walk-up" says everything a sentence
     would, and repeating the same line down twenty open stands turns the one
     line that matters — the closed ones — into wallpaper. */
  const note = ex.accessNote || (ex.access === "open" ? "" : access?.note) || "";
  const line = access
    ? `<div class="trade-access" data-access="${esc(ex.access)}">
        <span class="row-label">${esc(t("trade.accessLabel"))}</span>
        <span class="trade-access-val" title="${esc(access.note)}">${esc(access.label)}</span>
        ${note ? `<span class="trade-access-note">${esc(note)}</span>` : ""}
      </div>`
    : "";
  return { list, line };
}

function card(ex) {
  const games = visibleGames(ex);
  const isOpen = state.expanded.has(ex.id);
  /* A saved game never hides behind "+ 12 more" — the whole point of saving it
     is not having to go looking for it again. */
  const tail = isOpen
    ? []
    : games
        .slice(4)
        .filter(
          (g) =>
            isSaved("game", gameKey(g.title)) ||
            Boolean(QUEUES?.session(queueForGame(ex, g))) ||
            Boolean(QUEUES?.pendingFor(queueForGame(ex, g)))
        );
  const shown = isOpen ? games : [...games.slice(0, 4), ...tail];
  const hidden = games.length - shown.length;
  const moreBtn =
    games.length > 4 && (isOpen || hidden > 0)
      ? `<button class="more-games" type="button" data-id="${esc(ex.id)}">${esc(
          isOpen ? t("card.showFewer") : t("card.showMore", { n: hidden })
        )}</button>`
      : "";
  const crowd = ex.crowd || 0;
  const playableCount = games.filter((g) => g.playable).length;
  const isTrade = ex.type === "trade";
  const trade = isTrade ? tradeBlocks(ex) : null;

  return `<article class="card${isTrade ? " card-trade" : ""}" data-id="${esc(ex.id)}" data-saved="${hasSaved(ex)}" data-played="${hasPlayed(ex)}">
    <div class="exh-head">
      ${hallMarker(ex)}
      <div class="exh-id">
        <span class="overline">${esc(typeLabel(ex.type))}${
          isTrade && ex.country ? ` · ${esc(countryLabel(ex.country))}` : ""
        }</span>
        <h3>${esc(ex.name)}${hasAdult(ex) && !games.length && state.age !== "hide" ? ageBadge(boothAgeStatus(ex)) : ""}</h3>
      </div>
      ${markButton("played", "exhibitor", ex.id, ex.name)}
      ${markButton("saved", "exhibitor", ex.id, ex.name, { wide: true })}
    </div>
    <div class="card-body">
      <p class="desc">${esc(ex.description)}</p>
      ${
        games.length
          ? `<div class="block">
              <div class="block-head">
                <span>${esc(t("card.lineup"))}</span>
                <span>${esc(t("card.titles", { n: games.length }))}${
                  playableCount
                    ? `<span class="stamp">${esc(t("card.playableCount", { n: playableCount }))}</span>`
                    : ""
                }${hasAdult(ex) && state.age !== "hide" ? ageBadge(boothAgeStatus(ex)) : ""}</span>
              </div>
              <ul class="games">${shown.map((game) => gameRow(ex, game)).join("")}</ul>
              ${moreBtn}
            </div>`
          : trade?.list || ""
      }
      ${
        ex.tags?.length
          ? `<div class="tag-row">${ex.tags
              .map((tag) => `<span class="tag">${esc(tagLabel(tag))}</span>`)
              .join("")}</div>`
          : ""
      }
    </div>
    <div class="card-foot">
      ${
        isTrade
          ? trade.line
          : `<div class="queue" data-level="${crowd}">
        <span class="row-label">${esc(t("card.queueIndex"))}</span>
        <span class="meter" data-level="${crowd}" role="img"
          aria-label="${esc(t("card.queueAria", { n: crowd }))}"
          title="${esc(ex.crowdNote || "")}"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="queue-val">${crowd ? `${crowd}/5` : "—"} ${esc(crowdLabel(crowd))}</span>
        ${queueSummary(ex)}
        ${queueReportLink(ex)}
      </div>`
      }
      ${
        ex.visitAdvice
          ? `<p class="advice"><span class="advice-label">${esc(t("card.planLabel"))}</span>${esc(
              ex.visitAdvice
            )}</p>`
          : ""
      }
      ${footLinks(ex)}
    </div>
  </article>`;
}

function renderExhibitors() {
  const list = filtered();
  keepingFocus($("#exhibitor-grid"), () => {
    /* The grid iterates owner cards; each one renders whichever of its two
       faces is showing. */
    $("#exhibitor-grid").innerHTML = list.map((ex) => card(faceOf(ex))).join("");
  });
  $("#exhibitor-grid").classList.toggle("hidden", list.length === 0);
  $("#no-results").classList.toggle("hidden", list.length > 0);
  $("#no-results").textContent =
    state.savedOnly && savedCount() === 0 ? t("empty.noSavedYet") : t("empty.noMatches");
  $("#reset-filters").classList.toggle("hidden", !filtersActive());

  const total = cardPool().length;
  $("#result-count").textContent =
    list.length === total
      ? t("count.exhibitors", { n: total })
      : t("count.exhibitorsFiltered", { n: list.length, total });
  renderFilterSummary();

  $$(".more-games").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      renderExhibitors();
    })
  );

  /* The search box and hall chips filter both lower lists as well, so they
     re-render with the grid rather than being wired to each control
     separately. Trade first: it sits above the directory on the page. */
  renderTrade();
  renderDirectory();
}

/* When the drawer is collapsed this line is the only thing telling you what is
   still filtered, so it spells out every active constraint. */
function renderFilterSummary() {
  const parts = [];
  if (state.type !== "all") parts.push(typeLabel(state.type));
  if (state.hall !== "all") parts.push(t("where.hall", { hall: state.hall }));
  if (state.age === "hide") parts.push(t("summary.hideAdult"));
  if (state.age === "only") parts.push(t("summary.onlyAdult"));
  if (state.playableOnly) parts.push(t("summary.playableOnly"));
  if (state.confirmedOnly) parts.push(t("summary.confirmedOnly"));
  if (state.savedOnly) parts.push(t("summary.savedOnly"));
  if (state.hidePlayed) parts.push(t("summary.playedHidden"));
  if (state.query) parts.push(`“${state.query}”`);
  const el = $("#filter-summary");
  /* Trade mode leads the line rather than joining the list of constraints:
     it is not a filter — it widens the pool instead of narrowing it — and
     this way the "nothing is filtered" reassurance survives beside it. */
  const filters = parts.length ? parts.join(" · ") : t("summary.noneLower");
  el.textContent = state.trade
    ? t("summary.tradePrefix", { filters })
    : parts.length
      ? filters
      : t("summary.none");
  el.dataset.active = String(parts.length > 0 || state.trade);
}

/* Two chips rather than a checkbox in the "Only show" row, because that row
   is filters — things that hide cards — and this hides nothing. Stated as a
   pair, it also reads as a setting with two answers rather than a box you
   might have left ticked by accident. */
function renderBadge() {
  const row = $("#badge-filters");
  if (!row) return; // stale cached shell — see the note in renderPlan
  const chips = [
    [false, t("badge.consumer"), t("badge.consumerTitle")],
    [true, t("badge.trade"), t("badge.tradeTitle")],
  ];
  row.innerHTML = chips
    .map(
      ([on, label, title]) =>
        `<button class="chip badge-chip${on ? " badge-chip-trade" : ""} ${
          state.trade === on ? "active" : ""
        }" type="button" data-badge="${on ? "trade" : "consumer"}"
        aria-pressed="${state.trade === on}" title="${esc(title)}">${esc(label)}</button>`
    )
    .join("");
  $$("#badge-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => setTrade(chip.dataset.badge === "trade", { announce: true }))
  );
}

function renderFilters() {
  renderBadge();
  const types = [...new Set(cardPool().map((e) => e.type))];
  /* A type chip pointing at cards that just became invisible would answer
     with an empty grid, so the filter follows the pool it filters. */
  if (state.type !== "all" && !types.includes(state.type)) state.type = "all";
  $("#type-filters").innerHTML =
    `<button class="chip ${state.type === "all" ? "active" : ""}" type="button" data-type="all">${esc(
      t("filter.all")
    )}</button>` +
    types
      .map(
        (type) =>
          `<button class="chip ${state.type === type ? "active" : ""}" type="button" data-type="${esc(type)}">${esc(typeLabel(type))}</button>`
      )
      .join("");
  $$("#type-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.type = chip.dataset.type;
      /* A new filter asks for a face of its own, so hand-flipped cards go
         back to following it — see faceOf(). */
      state.flipped.clear();
      renderFilters();
      renderExhibitors();
    })
  );

  /* The curated cards decide which halls exist here — plus, in trade mode,
     the business halls the directory puts booths in. A hall chip nobody can
     enter is noise for the consumer majority and the whole point for a trade
     visitor, which is exactly what the pref is for. */
  const hallSet = new Set(cardPool().filter((e) => e.hall).map((e) => String(e.hall)));
  if (state.trade) {
    for (const entry of state.directory?.exhibitors || []) {
      for (const s of tradeStands(entry)) hallSet.add(String(s.hall));
    }
  }
  const halls = [...hallSet].sort((a, b) => parseFloat(a) - parseFloat(b));
  $("#hall-filters").innerHTML =
    `<button class="chip hall-chip ${state.hall === "all" ? "active" : ""}" type="button" data-hall="all">${esc(
      t("filter.all")
    )}</button>` +
    halls
      .map((h) => {
        const business = isBusinessHall(h);
        const label = business
          ? t("hall.businessAria", { hall: h })
          : t("where.hall", { hall: h });
        return `<button class="chip hall-chip ${
          state.hall === h ? "active" : ""
        }" type="button" data-hall="${esc(h)}" data-area="${esc(hallArea(h))}" aria-label="${esc(label)}"${
          business ? ` title="${esc(t("directory.businessArea"))}"` : ""
        }>${esc(h)}</button>`;
      })
      .join("");
  $$("#hall-filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.hall = chip.dataset.hall;
      state.flipped.clear();
      renderFilters();
      renderExhibitors();
    })
  );

  const ageFilters = $("#age-filters");
  if (!ageFilters) return; // a cached pre-age-filter index.html may briefly pair with this JS
  ageFilters.innerHTML = AGE_FILTERS
    .map(
      (value) =>
        `<button class="chip age-chip ${state.age === value ? "active" : ""}" type="button"
          data-age="${value}" aria-pressed="${state.age === value}">${esc(t(`age.filter.${value}`))}</button>`
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

/* ---------- the full official directory ----------

   data/directory.json is the raw exhibitor list gamescom publishes — every
   registered booth, 1600-odd of them, most of which will never earn a card. It
   stays a separate file for two reasons: it is ~200 KB of names nobody needs to
   answer "where is Xbox", and it is machine-generated (tools/fetch-directory.py)
   where the cards are hand-written. The section below is a lookup tool, not a
   second grid — no crowd ratings, no saving, just "this company exists and it is
   standing here".

   It is fetched the first time the section is opened and then kept for the
   session. The service worker caches /data/ network-first, so a visitor who
   opened it once still has it in a hall with no signal. */

const DIRECTORY_URL = "data/directory.json";
const DIRECTORY_PAGE = 200;

/* The business area is halls 2–4 — gamescom's own boundary, and the halls
   whose plans the map draws in the official business colour. A consumer
   ticket does not open them and they close after Friday. Shared with the map
   through js/marks.js: it decides which rows are saveable as trade booths,
   so the two pages have to draw the line in the same place. */
const { isBusinessHall } = GCMarks;

/* The directory writes a shared booth "F010+E019", our cards write
   "F010/E019", and either side may list the halves in either order. Sorting the
   parts collapses all of that to one comparable key. */
function boothKey(hall, booth) {
  if (!hall || !booth) return "";
  const parts = String(booth)
    .toUpperCase()
    .split(/[+,/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
  return `${String(hall).trim()}|${parts.join("+")}`;
}

/* booth → the curated exhibitor standing on it, so a directory row can say
   "at Indie Arena Booth" instead of stranding 172 studio names with no context.

   An exhibitor can hold more than one stand — Ubisoft has a second, smaller
   booth across the aisle from its main one — and a card lists them separated
   by commas, the slash still joining the halves of a single shared stand.
   Both readings have to be registered, because the two sides file such an
   exhibitor differently: the directory puts every code on one row
   ("C011/B010/B020"), while a neighbour renting space on one of those stands
   names only that stand. So the card answers to its whole set of codes and
   to each stand on its own. */
function curatedByBooth() {
  const map = new Map();
  const claim = (ex, booth) => {
    const key = boothKey(ex.hall, booth);
    if (key && !map.has(key)) map.set(key, ex);
  };
  /* cardPool, not every card: with trade mode off a consumer must not be
     told their Full-directory row stands "at Spanish games pavilion (ICEX)",
     which is a thing only trade mode is supposed to know about. */
  for (const ex of cardPool()) {
    claim(ex, ex.booth);
    const stands = String(ex.booth || "").split(",");
    if (stands.length > 1) for (const stand of stands) claim(ex, stand);
  }
  return map;
}

let directoryRequest = null;
let directorySignature = "";

/* Always a promise, so a caller that needs the data before it can answer —
   the share decoder — can simply await it. */
function loadDirectory() {
  if (state.directory) return Promise.resolve();
  if (directoryRequest) return directoryRequest;
  directoryRequest = fetch(`${DIRECTORY_URL}?v=${Date.now()}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((payload) => {
      state.directory = payload;
      state.directoryError = null;
      /* Everything keyed off the directory is stale the moment it lands: the
         slug index, the share vocabulary that now knows 800 more identities,
         and the hall chips that can now offer the business halls. */
      directoryIndexCache = null;
      standShareCache = null;
      tradeRecordCache.clear();
      buildShareCodeMap();
    })
    .catch((err) => {
      state.directoryError = err.message || t("directory.loadFailed");
    })
    .finally(() => {
      directoryRequest = null;
      /* The fetch starts before the core data awaits, so it can land first.
         state.event is only set once loadData() resolves and main() renders
         every view right after — nothing is on screen yet to refresh. */
      if (!state.event) return;
      if (state.directory) {
        renderFilters();
        renderMarkControls();
      }
      /* The expensive refreshes — 200 trade rows, the plan board — go
         straight to the DOM only for the view actually on screen. A view
         still holding its queued boot render needs nothing: that render runs
         with the directory already in state. */
      const work = [
        ["exhibitors", () => { renderTrade(); renderDirectory(); }],
        ["planner", () => { renderPriority(); renderPlan(); }],
      ];
      for (const [view, render] of work) {
        if (pendingViewRender.has(view)) continue;
        if (state.view === view) render();
        else queueViewRender(view, render);
      }
    });
  return directoryRequest;
}

/* Search and the hall chips drive this list too — that is the whole point of a
   directory, and it means "where is company X" is answered by the box already
   at the top of the page. The category, age and playable filters are about
   lineups the directory doesn't have, so they deliberately don't apply. */
function directoryMatches() {
  const entries = state.directory?.exhibitors || [];
  const q = state.query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return entries.filter((entry) => {
    const stands = entry.stands || [];
    if (state.hall !== "all" && !stands.some((s) => s.hall === state.hall)) return false;
    if (!terms.length) return true;
    const hay = [
      entry.name,
      entry.country,
      countryLabel(entry.country),
      ...stands.map((s) => `${t("hall.word")} ${s.hall} hall ${s.hall} ${s.booth}`),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

/* The official profile is the one link a raw directory row can offer — it is
   the exhibitor speaking for itself, where the row is only a booth number. */
function profileUrl(entry) {
  const base = state.directory?.profileBase || "";
  return base && entry.slug ? `${base}${entry.slug}/` : "";
}

function profileLink(entry) {
  const href = profileUrl(entry);
  return href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(entry.name)}<span aria-hidden="true"> ↗</span><span class="sr-only">${esc(t("directory.entryAria"))}</span></a>`
    : esc(entry.name);
}

/* Shared by the Full directory and the trade list, so a stand reads the same
   in both: the same amber plate for the business halls, the same map link,
   the same "at <host>" when a bigger booth is standing on it. `self` is the
   row's own name, so a card never labels itself as its own neighbour. */
function standChips(stands, byBooth, self = "") {
  return (stands || [])
    .map((s) => {
      const host = byBooth.get(boothKey(s.hall, s.booth));
      const business = isBusinessHall(s.hall);
      /* The booth number is the answer this section exists to give, so it is
         also the way to see it: a chip in a mapped hall opens the map on that
         stand. The host suffix stays outside the underline — it names a
         neighbour, not a place. */
      const where = `<span class="dir-stand-where"><b>${esc(s.hall)}</b>${
        s.booth ? ` · ${esc(s.booth)}` : ""
      }</span>${
        host && host.name !== self
          ? `<i>${esc(t("directory.hostedAt", { name: host.name }))}</i>`
          : ""
      }`;
      const cls = `dir-stand${business ? " dir-stand-trade" : ""}`;
      /* The business halls are drawn now, so their chips link like any
         other — the map opens them under a trade-only banner, which is a
         better answer than a dead chip. The warning rides along in the
         label either way: the plate is amber, and it says why. */
      const trade = business ? t("directory.businessArea") : "";
      if (!hasMap(s.hall)) {
        return `<span class="${cls}"${trade ? ` title="${esc(trade)}"` : ""}>${where}</span>`;
      }
      return `<a class="${cls}" href="${esc(mapLink(s.hall, s.booth))}"
        title="${esc(trade ? t("map.openTitleWith", { what: trade }) : t("map.openTitle"))}"
        aria-label="${esc(
          t("map.openAria", {
            where: whereLabel(s.hall, s.booth) + (trade ? t("map.tradeOnlySuffix") : ""),
          })
        )}">${where}</a>`;
    })
    .join("");
}

function directoryRow(entry, byBooth) {
  const stands = standChips(entry.stands, byBooth, entry.name);
  return `<li class="dir-row">
    <span class="dir-name">${profileLink(entry)}</span>
    <span class="dir-country">${esc(entry.country ? countryLabel(entry.country) : "")}</span>
    <span class="dir-stands">${
      stands ||
      `<span class="dir-stand dir-stand-tba">${esc(t("directory.noBooth"))}</span>`
    }</span>
  </li>`;
}

function renderDirectory() {
  const section = $("#directory");
  if (!section) return; // stale cached shell — see the note in renderPlan
  const count = $("#directory-count");
  const note = $("#directory-note");
  const list = $("#directory-list");

  if (!state.showDirectory) {
    count.textContent = state.directory
      ? t("directory.booths", { n: state.directory.count })
      : "";
    note.textContent = "";
    list.innerHTML = "";
    return;
  }

  if (state.directoryError) {
    count.textContent = "";
    note.textContent = t("directory.error", { error: state.directoryError });
    list.innerHTML = "";
    return;
  }
  if (!state.directory) {
    count.textContent = "";
    note.textContent = t("directory.loading");
    list.innerHTML = "";
    return;
  }

  /* A lifted cap belongs to the search that lifted it — changing the query or
     the hall starts a new list and a new first page. Marking something saved
     re-renders this too, and must not silently collapse it. */
  const signature = `${state.query}|${state.hall}`;
  if (signature !== directorySignature) {
    directorySignature = signature;
    state.directoryLimit = DIRECTORY_PAGE;
  }

  const matches = directoryMatches();
  const shown = matches.slice(0, state.directoryLimit || DIRECTORY_PAGE);
  const rest = matches.length - shown.length;
  const byBooth = curatedByBooth();
  const trade = matches.filter((e) => (e.stands || []).every((s) => isBusinessHall(s.hall))).length;

  count.textContent =
    matches.length === state.directory.count
      ? t("directory.booths", { n: state.directory.count })
      : t("directory.boothsFiltered", { n: matches.length, total: state.directory.count });

  const bits = [
    esc(t("directory.lede", { date: formatDate(state.directory.lastUpdated) })),
  ];
  if (state.hall === "all" && trade) {
    bits.push(esc(t("directory.tradeOnly", { n: trade })));
  }
  if (!matches.length) {
    bits.push(esc(t("directory.noMatches")));
  }
  note.innerHTML = bits.join(" ");

  list.innerHTML = matches.length
    ? `<ol class="dir-list">${shown.map((e) => directoryRow(e, byBooth)).join("")}</ol>` +
      (rest > 0
        ? `<button class="reset dir-more" type="button">${esc(t("directory.showMore", { n: rest }))}</button>`
        : "")
    : "";

  const more = list.querySelector(".dir-more");
  if (more) {
    more.addEventListener("click", () => {
      state.directoryLimit = matches.length;
      renderDirectory();
    });
  }

  /* "Nothing matches" is a lie when the answer is sitting two hundred pixels
     further down — searching a booth we never carded is exactly what this
     section is for. */
  const gridEmpty = $("#exhibitor-grid").classList.contains("hidden");
  if (gridEmpty && matches.length) {
    $("#no-results").textContent = t("directory.fallbackHint", { n: matches.length });
  }
}

/* ---------- trade exhibitors ----------

   Halls 2.1–4.2 are the business area: ~800 exhibitors a consumer ticket
   cannot reach, and the guide walked past all of them. For a visitor holding
   a trade or media badge that is most of their show, so they become saveable,
   plannable stops like any booth — see docs/PLAN-trade-exhibitors.md.

   Two rules hold the whole design together:

   1. The `trade` pref gates **discovery**, never **resolution**. It decides
      whether the guide offers trade content. It never decides whether a trade
      booth you already saved resolves — one tapped on the map or imported
      from a link shows up in your plan with the setting off, because a saved
      thing vanishing because of a setting is the one behaviour nothing here
      is allowed to have.
   2. A trade booth has exactly one identity wherever it came from. Directory
      rows enter the existing saved set as "dir:<slug>"; a curated card that
      claims that row (`dirSlug`) takes the identity over, and the stored key
      is migrated on sight. One booth, one save, one stop. */

/* The key shape is shared with the map through js/marks.js — a booth saved
   there has to be the same item here. */
const { dirKey, isDirKey, dirSlug } = GCMarks;

const TRADE_PAGE = 200;

/* A directory row belongs to the trade list when it stands in the business
   area at all. Rows with a foot in both (a publisher with a business booth
   *and* an entertainment stand) are trade rows too — the business stand is
   the one a consumer ticket cannot reach, and it is why they are listed. */
const tradeStands = (entry) => (entry.stands || []).filter((s) => isBusinessHall(s.hall));
const isTradeEntry = (entry) => tradeStands(entry).length > 0;

let directoryIndexCache = null;
const tradeRecordCache = new Map();

function directoryIndex() {
  if (!directoryIndexCache) {
    directoryIndexCache = new Map(
      (state.directory?.exhibitors || []).map((entry) => [entry.slug, entry])
    );
  }
  return directoryIndexCache;
}

/* slug → the curated card that claims it. Written by hand as `dirSlug` on a
   trade card, which is what stops one booth appearing as both a card and a
   directory row. */
function curatedByDirSlug() {
  const map = new Map();
  for (const ex of state.exhibitors) if (ex.dirSlug) map.set(ex.dirSlug, ex);
  return map;
}

/* A directory row dressed as the exhibitor-shaped record everything
   downstream expects — the planner, the route, the map and the .ics export
   all read `hall`/`booth`/`name`/`id` and nothing else. Memoised so a stop
   keeps one identity across re-renders. */
function tradeRecord(entry) {
  const cached = tradeRecordCache.get(entry.slug);
  if (cached) return cached;
  const stands = tradeStands(entry);
  const first = stands[0] || {};
  const record = {
    id: dirKey(entry.slug),
    name: entry.name,
    type: "trade",
    trade: true,
    country: entry.country || "",
    hall: first.hall || null,
    booth: first.booth || "",
    stands,
    cats: entry.cats || [],
    officialUrl: profileUrl(entry),
    /* No lineup, no queue forecast, no crowd note: a business booth runs on
       appointments, and inventing numbers for it would poison the one list
       whose honesty matters most. */
    games: [],
  };
  tradeRecordCache.set(entry.slug, record);
  return record;
}

/* The single resolver for a saved exhibitor key, whichever kind it is. Every
   downstream lookup goes through this instead of growing a second code path:
   a curated card by id, a curated card that claims the slug, or a trade
   record built from the directory. Null while the directory is still
   loading — callers treat that as "not yet", not as "gone". */
function resolveSavedExhibitor(key) {
  const curated = state.exhibitors.find((ex) => ex.id === key);
  if (curated) return curated;
  if (!isDirKey(key)) return null;
  const slug = dirSlug(key);
  const claimed = curatedByDirSlug().get(slug);
  if (claimed) return claimed;
  const entry = directoryIndex().get(slug);
  return entry ? tradeRecord(entry) : null;
}

/* The curated cards plus every saved trade booth — the population the plan
   board, the hall route and the day filter iterate. Trade booths are in it
   only when saved, because the guide has no editorial opinion about the 800
   it did not card. */
function plannedExhibitors() {
  const list = [...state.exhibitors];
  const seen = new Set(list.map((ex) => ex.id));
  state.marks.saved.exhibitors.forEach((key) => {
    if (!isDirKey(key)) return;
    const ex = resolveSavedExhibitor(key);
    if (ex && !seen.has(ex.id)) {
      seen.add(ex.id);
      list.push(ex);
    }
  });
  return list;
}

/* Is any saved key a directory row? Then the directory has to load whatever
   the pref says — rule 1 above. */
const hasSavedTrade = () =>
  [...state.marks.saved.exhibitors].some(isDirKey) ||
  [...state.marks.played.exhibitors].some(isDirKey);

/* A saved `dir:` key with no directory loaded is data that has not arrived,
   not an item that went away. Telling someone "nothing you saved is in the
   lineup" there would be a lie about their own list. */
const tradeDataPending = () => hasSavedTrade() && !state.directory;
const tradePendingCopy = () => t("trade.dataPending");

/* A `dir:` key saved before a card claimed that row — from the map, from a
   share link, or from a build that predates the card — is the same booth
   under an older name. Rewriting it on sight keeps one booth from holding two
   saves, and carries its day assignment across with it. */
function migrateDirAliases() {
  const byDirSlug = curatedByDirSlug();
  if (!byDirSlug.size) return;
  let moved = 0;
  for (const mark of ["saved", "played"]) {
    for (const kind of ["exhibitors"]) {
      const set = state.marks[mark][kind];
      for (const key of [...set]) {
        if (!isDirKey(key)) continue;
        const card = byDirSlug.get(dirSlug(key));
        if (!card) continue;
        set.delete(key);
        set.add(card.id);
        moved += 1;
        const days = state.itinerary.exhibitors;
        if (days.has(key)) {
          if (!days.has(card.id)) days.set(card.id, days.get(key));
          days.delete(key);
        }
      }
      if (moved) persistMarks(mark);
    }
  }
  if (moved) persistItinerary();
}

/* How many exhibitors list each business stand.

   This is the most useful thing the business halls tell you about themselves,
   and it is a count rather than a judgement. The two shapes are stark: 184
   stands have a single occupant, while 53 shared stands carry 634 of the 821
   trade exhibitors — because a shared stand is a national or regional
   pavilion, twenty desks under one roof, and a large stand with one occupant
   and no co-exhibitors is a publisher's meeting building.

   The row shows the number. What it means is said once in the section note,
   and per booth only on a curated card, where it can be sourced. */
const TRADE_SHARED_MIN = 5;

let standShareCache = null;

function standShare() {
  if (standShareCache) return standShareCache;
  const counts = new Map();
  for (const entry of state.directory?.exhibitors || []) {
    for (const s of entry.stands || []) {
      if (!isBusinessHall(s.hall)) continue;
      const key = boothKey(s.hall, s.booth);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  standShareCache = counts;
  return counts;
}

/* The largest count across an exhibitor's business stands — a studio sharing
   a pavilion and holding a desk elsewhere is on a pavilion. */
function sharedWith(entry) {
  const counts = standShare();
  let most = 1;
  for (const s of tradeStands(entry)) most = Math.max(most, counts.get(boothKey(s.hall, s.booth)) || 1);
  return most;
}

/* Which product groups are worth offering as filters: the ones the rows on
   screen actually carry, named from the directory's own table. */
function tradeGroups(entries) {
  const groups = state.directory?.groups || {};
  const counts = new Map();
  for (const entry of entries) {
    for (const id of entry.cats || []) {
      if (groups[id]) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ id, label: groupLabel(id, groups[id]), n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/* Search and the hall chips drive this list exactly as they drive the Full
   directory; the category chips are this section's own. Rows claimed by a
   curated card drop out — the card is the better answer and carries the save. */
function tradeMatches({ category = true } = {}) {
  const claimed = curatedByDirSlug();
  const q = state.query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  const groups = state.directory?.groups || {};
  return (state.directory?.exhibitors || []).filter((entry) => {
    if (!isTradeEntry(entry) || claimed.has(entry.slug)) return false;
    if (state.hall !== "all" && !(entry.stands || []).some((s) => s.hall === state.hall)) return false;
    if (category && state.tradeCat !== "all" && !(entry.cats || []).includes(state.tradeCat)) {
      return false;
    }
    if (!terms.length) return true;
    const hay = [
      entry.name,
      entry.country,
      countryLabel(entry.country),
      ...(entry.stands || []).map(
        (s) => `${t("hall.word")} ${s.hall} hall ${s.hall} ${s.booth}`
      ),
      /* Both spellings stay searchable, the same way tags do. */
      ...(entry.cats || []).map((id) => groups[id] || ""),
      ...(entry.cats || []).map((id) => groupLabel(id, groups[id])),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

function tradeRow(entry, byBooth) {
  const groups = state.directory?.groups || {};
  const key = dirKey(entry.slug);
  const cats = (entry.cats || [])
    .map((id) => groupLabel(id, groups[id]))
    .filter(Boolean)
    .map((label) => `<span class="tag">${esc(label)}</span>`)
    .join("");
  const share = sharedWith(entry);
  /* Five, not three. At three the number is just as true but means something
     else entirely — CurseForge shares a stand with Overwolf, its own parent,
     which is a company and its subsidiary rather than a collective. The
     pavilions this is worth flagging run from a dozen exhibitors to seventy,
     so the threshold sits above the noise, and the label states the count
     without telling you what to conclude from it. */
  const shared = share >= TRADE_SHARED_MIN
    ? `<span class="trade-shared" title="${esc(t("trade.sharedTitle", { n: share }))}">${esc(
        t("trade.shared", { n: share })
      )}</span>`
    : "";
  return `<li class="dir-row trade-row" data-saved="${isSaved("exhibitor", key)}">
    <span class="dir-name">${profileLink(entry)}</span>
    <span class="dir-country">${esc(entry.country ? countryLabel(entry.country) : "")}</span>
    <span class="dir-stands">${standChips(entry.stands, byBooth, entry.name)}${shared}</span>
    <span class="trade-tags">${cats}</span>
    ${markButton("saved", "exhibitor", key, entry.name)}
  </li>`;
}

let tradeSignature = "";

/* The closed state of the section is the feature's front door: it explains
   what the business area is and offers the one switch, rather than hiding a
   toggle in a settings row the consumer majority would have to read past. */
function renderTradeGate() {
  const gate = $("#trade-gate");
  if (!gate) return;
  gate.hidden = state.trade;
}

function renderTrade() {
  const section = $("#trade");
  if (!section) return; // stale cached shell — see the note in renderPlan
  const count = $("#trade-count");
  const note = $("#trade-note");
  const list = $("#trade-list");
  const cats = $("#trade-cat-filters");
  renderTradeGate();

  if (!state.trade) {
    count.textContent = "";
    note.textContent = "";
    list.innerHTML = "";
    cats.innerHTML = "";
    cats.classList.add("hidden");
    return;
  }

  if (state.directoryError) {
    count.textContent = "";
    note.textContent = t("trade.loadError", { error: state.directoryError });
    list.innerHTML = "";
    cats.classList.add("hidden");
    return;
  }
  if (!state.directory) {
    count.textContent = "";
    note.textContent = t("trade.loading");
    list.innerHTML = "";
    cats.classList.add("hidden");
    return;
  }

  /* Same rule as the directory: a lifted cap belongs to the search that
     lifted it, and saving a booth re-renders this list without collapsing it. */
  const signature = `${state.query}|${state.hall}|${state.tradeCat}`;
  if (signature !== tradeSignature) {
    tradeSignature = signature;
    state.tradeLimit = TRADE_PAGE;
  }

  /* The chip row is built from what the query and hall leave standing, not
     from what the category chip itself leaves — otherwise picking one chip
     would delete all the others. */
  const inScope = tradeMatches({ category: false });
  const offered = tradeGroups(inScope);
  if (state.tradeCat !== "all" && !offered.some((g) => g.id === state.tradeCat)) {
    state.tradeCat = "all";
    tradeSignature = `${state.query}|${state.hall}|all`;
  }

  const matches = tradeMatches();
  const total = (state.directory.exhibitors || []).filter(isTradeEntry).length;

  count.textContent =
    matches.length === total
      ? t("directory.booths", { n: total })
      : t("directory.boothsFiltered", { n: matches.length, total });

  /* Collapsed, the summary count above is the only visible part of this
     section — stop before building 200 rows of hidden list. The toggle
     listener re-renders on open, so whatever the chips and list held goes
     stale invisibly and is rebuilt the moment it could be seen. */
  if (!section.open) return;

  cats.classList.toggle("hidden", offered.length < 2);
  cats.innerHTML = offered.length < 2 ? "" : [
    `<button class="chip ${state.tradeCat === "all" ? "active" : ""}" type="button"
      data-trade-cat="all" aria-pressed="${state.tradeCat === "all"}">${esc(t("filter.all"))}</button>`,
    ...offered.map(
      (g) => `<button class="chip ${state.tradeCat === g.id ? "active" : ""}" type="button"
        data-trade-cat="${esc(g.id)}" aria-pressed="${state.tradeCat === g.id}"
        title="${esc(t("trade.exhibitorCount", { n: g.n }))}">${esc(g.label)}</button>`
    ),
  ].join("");

  const shown = matches.slice(0, state.tradeLimit || TRADE_PAGE);
  const rest = matches.length - shown.length;
  const byBooth = curatedByBooth();

  const bits = [t("trade.listWhat"), t("trade.listWalkUp"), t("trade.listPlannable")];
  if (!matches.length) bits.push(t("trade.listNoMatches"));
  note.innerHTML = `${bits.map(esc).join(" ")} <button class="linkish" id="trade-off" type="button">${esc(
    t("trade.turnOff")
  )}</button>`;
  $("#trade-off").addEventListener("click", () => setTrade(false));

  keepingFocus(list, () => {
    list.innerHTML = matches.length
      ? `<ol class="dir-list trade-list">${shown.map((e) => tradeRow(e, byBooth)).join("")}</ol>` +
        (rest > 0
          ? `<button class="reset dir-more" type="button">${esc(
              t("directory.showMore", { n: rest })
            )}</button>`
          : "")
      : "";
  });

  const more = list.querySelector(".dir-more");
  if (more) {
    more.addEventListener("click", () => {
      state.tradeLimit = matches.length;
      renderTrade();
    });
  }
}

/* Turning it on is also the first fetch, which is what warms the offline
   cache — the same one-online-load contract the directory already states.

   `announce` is set by the two remote controls (the toolbar chips and the
   Event info block), where the thing that just changed — a section far below
   the fold, or one on another view entirely — is off screen. The button
   inside the section itself leaves it off: you are standing in the result. */
let tradeToast = null;

function setTrade(on, { announce = false } = {}) {
  if (state.trade === on) return;
  state.trade = on;
  if (on) {
    state.showTrade = true;
    const section = $("#trade");
    if (section) section.open = true;
  }
  persistPrefs();
  loadDirectory();
  renderTrade();
  renderFilters();
  renderExhibitors();
  renderPriority();
  renderPlan();
  if (state.event) renderEvent(); // keeps the Event info block's own button in step
  if (!announce) return;
  /* Flip the switch twice and the first message must not outlive it: left in
     the queue, "Trade exhibitors on · Show the list →" would surface after
     you turned it off and offer to scroll you to an empty section. */
  if (tradeToast && tradeToast !== activeToast) hideToast(tradeToast);
  tradeToast = on
    ? showToast(
        t("trade.toastOn"),
        t("trade.showList"),
        () => {
          showView("exhibitors");
          const section = $("#trade");
          if (!section) return;
          section.open = true; // the <details> toggle listener persists it
          section.scrollIntoView();
        },
        { replace: true }
      )
    : showToast(t("trade.toastOff"), null, null, { replace: true });
}

/* ---------- planner ---------- */

/* An explicit flag in data/event.json, not a regex over the access text:
   that text is editorial prose and now exists in every language, so
   "does this day admit the public" has to be a fact in the data rather
   than something read back out of a sentence. */
const isTradeDay = (d) => d.trade === true;

/* The business halls run Wednesday to Friday and are shut for the weekend —
   the one fact about them a plan can get wrong in a way that costs a visitor
   a wasted trip across the grounds. Read off the day's own `business` entry
   in data/event.json rather than inferred here, so a schedule change is a
   data edit like every other. */
const isBusinessOpenDay = (d) => d?.business !== "closed";

/* Shared by the day board (section 01) and the itinerary group headers, so
   the two renderings of a day can never drift apart. */
function dayHeaderInner(d) {
  const [, month, day] = d.date.split("-");
  return `<span class="day-when">
      <span class="day-dow">${esc(shortDay(d.date))}</span>
      <span class="day-date">${esc(day)}.${esc(month)}</span>
    </span>
    <span class="day-access ${isTradeDay(d) ? "trade" : "public"}">${esc(d.access)}</span>
    <span class="day-detail">
      ${d.hours ? `<span class="day-hours">${esc(d.hours)}</span>` : ""}
      ${d.note ? `<span class="day-note">${esc(d.note)}</span>` : ""}
    </span>`;
}

/* Weekday names are derived from the date in the active language rather
   than hand-written per locale — see GCI18N.dayName. The short form is
   what the day chips and tags wear. */
const dayName = (date) => GCI18N.dayName(date);
const shortDay = (date) => GCI18N.dayName(date, "short");

function itineraryItems() {
  const exhibitors = [...state.marks.saved.exhibitors]
    .map((key) => {
      const ex = resolveSavedExhibitor(key);
      return ex ? { kind: "exhibitor", key, name: ex.name, ex } : null;
    })
    .filter(Boolean);

  const games = [...state.marks.saved.games].map((key) => {
    const at = state.exhibitors.filter((ex) =>
      (ex.games || []).some((g) => gameKey(g.title) === key)
    );
    const name = at.length ? at[0].games.find((g) => gameKey(g.title) === key).title : key;
    return { kind: "game", key, name, at };
  });

  return [...exhibitors, ...games];
}

/* Same precedence as routeGroups(), so a booth reads the same in both planner
   sections: absence wins over everything, then a known hall wins over the
   offsite tag — an entry carrying both is a stop you can walk to. */
function itineraryLocation(ex, { booth = true } = {}) {
  if (isAbsent(ex)) return t("plan.absentStop");
  if (!ex.hall) return isOffsite(ex) ? t("plan.offsite") : t("plan.hallTba");
  return booth && ex.booth
    ? t("where.hallDotBooth", { hall: ex.hall, booth: ex.booth })
    : t("where.hall", { hall: ex.hall });
}

function itineraryCrowd(item) {
  return item.kind === "exhibitor"
    ? item.ex.crowd || 0
    : Math.max(0, ...item.at.map((ex) => ex.crowd || 0));
}

function compareItineraryItems(a, b) {
  return itineraryCrowd(b) - itineraryCrowd(a) || byName(a.name, b.name);
}

const itineraryPlayed = (item) =>
  item.kind === "exhibitor" ? hasPlayed(item.ex) : isPlayed("game", item.key);

/* Played stops sink below the live ones inside each group, same as the
   queue-priority list — the day keeps its shape but leads with what's left. */
function compareItineraryRows(a, b) {
  return itineraryPlayed(a) - itineraryPlayed(b) || compareItineraryItems(a, b);
}

/* Returns markup, not text: the hall reads through to the map, the same way
   the card's plate does. itineraryLocation() above stays plain text — the
   calendar export writes it into an .ics file, where a link is just noise.
   A game shown at two booths links each of them separately. */
function itineraryItemLocationHtml(item) {
  if (item.kind === "game") {
    return item.at.length
      ? item.at
          .map(
            (ex) =>
              `${esc(ex.name)} — ${hallLink(ex.hall, ex.booth, itineraryLocation(ex, { booth: false }))}`
          )
          .join(" · ")
      : t("plan.boothTba");
  }
  const where = hallLink(item.ex.hall, item.ex.booth, itineraryLocation(item.ex));
  /* A business booth has no queue to forecast, and "Queue unknown" there
     reads as "we didn't check" rather than "this is not that kind of stop".
     Its badge requirement is the useful thing to say in that space. */
  if (inBusinessArea(item.ex)) return `${where} · ${esc(t("plan.tradeBadge"))}`;
  const crowd = item.ex.crowd || 0;
  return `${where} · ${esc(
    crowd ? t("plan.queueWith", { n: crowd, label: crowdLabel(crowd) }) : t("plan.queueUnknown")
  )}`;
}

/* Does this stop stand in the business area? Asked of the location, not of
   the card's `type`: a publisher card sitting in hall 4.2 is behind the same
   closed doors on Saturday as any directory row. */
const inBusinessArea = (ex) =>
  Boolean(ex) &&
  (isBusinessHall(ex.hall) || (ex.stands || []).some((s) => isBusinessHall(s.hall)));

const itemInBusinessArea = (item) => item.kind === "exhibitor" && inBusinessArea(item.ex);

const dayByDate = (date) => (state.event?.days || []).find((d) => d.date === date) || null;

/* Warned, never blocked: the guide's job is to be honest, not to enforce a
   plan. Someone may well walk past a stand on Saturday to photograph it. */
const stopOnClosedDay = (item) =>
  itemInBusinessArea(item) && !isBusinessOpenDay(dayByDate(assignedDay(item.kind, item.key)));

function itineraryDayChips(item) {
  const current = assignedDay(item.kind, item.key);
  const label = t("plan.assignAria", { name: item.name });
  const business = itemInBusinessArea(item);
  return `<span class="it-days" role="group" aria-label="${esc(label)}">${(state.event.days || [])
    .map((d) => {
      const active = current === d.date;
      const trade = isTradeDay(d);
      const shut = business && !isBusinessOpenDay(d);
      const day = dayName(d.date);
      const action = active ? t("plan.removeFromDay", { day }) : t("plan.assignToDay", { day });
      const title = shut
        ? t("plan.dayClosedSuffix", { action, day })
        : trade
          ? t("plan.dayTradeSuffix", { action })
          : action;
      return `<button class="day-chip${active ? " active" : ""}" type="button"
        data-it-kind="${esc(item.kind)}" data-it-key="${esc(item.key)}" data-it-day="${esc(d.date)}"
        data-trade="${esc(String(trade))}" data-closed="${esc(String(shut))}"
        aria-pressed="${esc(String(active))}"
        title="${esc(title)}" aria-label="${esc(title)}">${esc(shortDay(d.date))}</button>`;
    })
    .join("")}</span>`;
}

function itineraryItem(item) {
  const kindLabel =
    item.kind === "game"
      ? t("kind.game")
      : itemInBusinessArea(item)
        ? t("kind.trade")
        : t("kind.booth");
  const shut = stopOnClosedDay(item);
  return `<div class="it-item" data-it-kind="${esc(item.kind)}" data-it-key="${esc(item.key)}" data-played="${itineraryPlayed(item)}">
    <span class="it-main">
      <span class="it-kind">${esc(kindLabel)}</span>
      <span class="it-name">${esc(item.name)}</span>
    </span>
    <span class="it-loc">${itineraryItemLocationHtml(item)}</span>
    ${itemQueueSummary(item)}
    ${itineraryDayChips(item)}
    ${markButton("saved", item.kind, item.key, item.name)}
    ${
      shut
        ? `<span class="it-warn">${esc(
            t("plan.closedWarn", { day: dayName(assignedDay(item.kind, item.key)) })
          )}</span>`
        : ""
    }
  </div>`;
}

function renderItinerary() {
  const items = itineraryItems();
  const validDays = new Set((state.event.days || []).map((d) => d.date));
  const unassigned = items
    .filter((item) => !validDays.has(assignedDay(item.kind, item.key)))
    .sort(compareItineraryRows);
  const groups = [];

  if (unassigned.length) {
    groups.push(`<div class="it-group">
      <div class="it-group-head unassigned"><span class="it-group-title">${esc(
        t("plan.unassigned")
      )}</span></div>
      ${unassigned.map(itineraryItem).join("")}
    </div>`);
  }
  for (const d of state.event.days || []) {
    const dayItems = items
      .filter((item) => assignedDay(item.kind, item.key) === d.date)
      .sort(compareItineraryRows);
    if (!dayItems.length) continue;
    /* One line at the top of the day rather than only a note per row: the
       question "is any of today's plan behind a closed door" should be
       answerable without reading every stop. */
    const shut = dayItems.filter(stopOnClosedDay).length;
    groups.push(`<div class="it-group" data-it-date="${esc(d.date)}">
      <div class="it-group-head">${dayHeaderInner(d)}</div>
      ${
        shut
          ? `<p class="it-group-warn">${esc(
              t("plan.closedGroupWarn", { n: shut, day: dayName(d.date) })
            )}</p>`
          : ""
      }
      ${dayItems.map(itineraryItem).join("")}
    </div>`);
  }

  const board = $("#plan-board");
  keepingFocus(board, () => {
    board.innerHTML = groups.join("");
  });
  board.classList.toggle("hidden", items.length === 0);
  $("#plan-empty").classList.toggle("hidden", items.length > 0);
  /* Saved-but-empty happens when every saved id fell out of a data refresh —
     "nothing saved yet" would be a lie next to a visible saved counter. */
  $("#plan-empty").textContent = tradeDataPending()
    ? tradePendingCopy()
    : savedCount()
      ? t("plan.emptyStale")
      : t("plan.emptyNoSaved");
  /* Absent stops render inline here ("Absent — no booth"); the footnote is the
     hall lens's way of saying the same thing. */
  $("#plan-absent").classList.add("hidden");
  const placed = items.filter((item) => validDays.has(assignedDay(item.kind, item.key))).length;
  $("#plan-count").textContent = items.length
    ? t("plan.itemCount", { n: items.length }) +
      (placed ? t("plan.placedSuffix", { n: placed }) : "")
    : "";
}

function renderPlanner() {
  const ev = state.event;
  $("#day-guide").innerHTML = (ev.days || [])
    .map((d) => `<div class="day-row">${dayHeaderInner(d)}</div>`)
    .join("");

  renderPriority();
  renderWristband();
  renderPlan();

  $("#crowd-tips").innerHTML = (ev.crowdTips || []).map((t) => `<li>${esc(t)}</li>`).join("");
}

/* The "Saved here" chip row is shared by the queue-priority table and the
   route board — one helper so the markup can't drift apart. The route passes
   its day filter so a single-day view lists only that day's games. */
function savedHereChips(ex, { day = null } = {}) {
  const mine = day
    ? savedGames(ex).filter((g) => (assignedDay("game", gameKey(g.title)) || "none") === day)
    : savedGames(ex);
  if (!mine.length) return "";
  return `<span class="priority-saved"><span class="row-label">${esc(
    t("plan.savedHere")
  )}</span>${mine
    .map((g) => `<span class="priority-game">${esc(g.title)}</span>`)
    .join("")}</span>`;
}

/* Deliberately independent of state.age: the planner does not inherit the
   exhibitor grid's filters (prioritySavedOnly is a separate toggle from
   savedOnly for the same reason), and this section exists for the visitor who
   wants the wristband, not the one browsing without it. */
function renderWristband() {
  const container = $("#wristband-list");
  const section = $("#wristband-section");
  if (!container || !section) return; // tolerate a cached pre-wristband index.html

  /* Trade booths are excluded by construction — they carry no lineup — and
     explicitly as well, so a curated trade card can never wander in here. */
  const list = state.exhibitors
    .filter((e) => e.type !== "trade" && hasAdult(e))
    .sort((a, b) => hallRank(a.hall) - hallRank(b.hall) || byName(a.name, b.name));

  const rows = list
    .map((e) => {
      const titles = adultGames(e);
      const games = titles.length
        ? titles.map((g) => esc(g.title)).join(" · ")
        : esc(t("wristband.wholeBooth"));
      const location = hallLink(
        e.hall,
        e.booth,
        `${e.hall ? t("where.hall", { hall: e.hall }) : t("plan.hallTba")} · ${
          e.booth || t("plate.boothTba")
        }`
      );
      const expected = boothAgeStatus(e) !== "confirmed";
      /* The "expected" marker sits inside the titles cell rather than in a column
         of its own: every row is its own grid, so a column that only some rows
         fill sizes those rows' fr tracks differently and breaks the alignment
         down the list. */
      return `<div class="priority-item wristband-item" data-saved="${hasSaved(e)}" data-played="${hasPlayed(e)}">
        <span class="wristband-name">${esc(e.name)}</span>
        <span class="wristband-loc">${location}</span>
        <span class="wristband-games">${games}${
          expected ? ` ${ageBadge("expected", t("age.expectedBadge"), "wristband-status")}` : ""
        }</span>
        <span class="row-actions">
          ${markButton("played", "exhibitor", e.id, e.name)}
          ${markButton("saved", "exhibitor", e.id, e.name)}
        </span>
      </div>`;
    })
    .join("");

  keepingFocus(container, () => {
    container.innerHTML = rows;
  });
  section.classList.toggle("hidden", list.length === 0);
}

function renderPriority() {
  /* A business booth runs on appointments, not queues, so it has no place in
     a queue ranking — excluded by having no `crowd`, and by type as well so
     the rule survives someone filling one in. */
  const busiest = [...state.exhibitors]
    .filter((e) => e.type !== "trade" && (e.crowd || 0) >= 4)
    .sort(byCrowdDesc);
  /* Ranks come from the unfiltered order: "07" has to keep meaning "seventh
     worst queue of the show", not "seventh row you happen to be looking at". */
  const scoped = state.prioritySavedOnly ? busiest.filter(hasSaved) : busiest;
  const played = scoped.filter(hasPlayed).length;
  const list = state.hidePlayed ? scoped.filter((e) => !hasPlayed(e)) : [...scoped];
  list.sort((a, b) => hasPlayed(a) - hasPlayed(b));

  const rows = list
    .map(
      (e) => `<div class="priority-item" data-saved="${hasSaved(e)}" data-played="${hasPlayed(e)}">
        <span class="priority-rank">${String(busiest.indexOf(e) + 1).padStart(2, "0")}</span>
        <span class="priority-name">${esc(e.name)}${hasAdult(e) ? ageBadge(boothAgeStatus(e)) : ""}</span>
        <span class="priority-loc">${
          e.hall
            ? hallLink(e.hall, e.booth, t("where.hall", { hall: e.hall }))
            : esc(t("plate.tba"))
        }</span>
        <span class="priority-advice">${esc(e.visitAdvice || e.crowdNote || "")}</span>
        ${queueSummary(e, { compact: true, kind: "priority" })}
        <span class="row-actions">
          ${markButton("played", "exhibitor", e.id, e.name)}
          ${markButton("saved", "exhibitor", e.id, e.name)}
        </span>
        ${savedHereChips(e)}
      </div>`
    )
    .join("");
  keepingFocus(
    $("#priority-list"),
    () => {
      $("#priority-list").innerHTML = rows;
    },
    $("#priority-saved-only")
  );

  $("#priority-list").classList.toggle("hidden", list.length === 0);
  $("#priority-empty").classList.toggle("hidden", list.length > 0);
  $("#priority-empty").textContent = state.hidePlayed && scoped.length > 0 && list.length === 0
    ? t("priority.emptyAllPlayed")
    : savedCount()
      ? t("priority.emptyNoneHigh")
      : t("priority.emptyNoSaved");
  const count =
    list.length === busiest.length
      ? t("priority.count", { n: busiest.length })
      : t("priority.countFiltered", { n: list.length, total: busiest.length });
  $("#priority-count").textContent =
    count + (played ? t("priority.playedSuffix", { n: played }) : "");
}

/* ---------- calendar export ---------- */

function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

const icsEncoder = new TextEncoder();

function icsFold(line) {
  const folded = [];
  let part = "";
  let bytes = 0;
  let limit = 75;

  for (const char of String(line)) {
    const size = icsEncoder.encode(char).length;
    if (part && bytes + size > limit) {
      folded.push(part);
      part = char;
      bytes = size;
      /* The leading space on a continuation line also counts as an octet. */
      limit = 74;
    } else {
      part += char;
      bytes += size;
    }
  }
  folded.push(part);
  return folded.join("\r\n ");
}

function icsDateTimeUTC(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function icsDescription(item) {
  if (item.kind === "exhibitor") {
    /* Spelled out rather than reusing the on-screen location string: the
       calendar entry is read away from the guide, where "9.1 · A070" has
       lost the column header that explained it. */
    const where = isAbsent(item.ex)
      ? t("plan.absentStop")
      : !item.ex.hall
        ? isOffsite(item.ex)
          ? t("plan.offsite")
          : t("plan.hallTba")
        : item.ex.booth
          ? t("ics.hallBooth", { hall: item.ex.hall, booth: item.ex.booth })
          : t("where.hall", { hall: item.ex.hall });
    /* The calendar entry is read away from the guide, so the badge — and a
       day the area is shut — has to be legible without it. */
    if (inBusinessArea(item.ex)) {
      const shut = stopOnClosedDay(item) ? t("ics.businessClosed") : "";
      return t("ics.tradeExhibitor", { name: item.name, where, shut });
    }
    const crowd = item.ex.crowd || 0;
    return t("ics.exhibitor", {
      name: item.name,
      where,
      queue: crowd ? `${crowd}/5` : t("ics.queueUnknown"),
    });
  }
  const booths = item.at
    .map((ex) => `${ex.name} (${itineraryLocation(ex, { booth: false })})`)
    .join(", ");
  return booths
    ? t("ics.gameAt", { name: item.name, booths })
    : t("ics.gameNoBooth", { name: item.name });
}

function buildICS() {
  const items = itineraryItems();
  const stamp = icsDateTimeUTC(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//gc2026-guide//gamescom 2026 itinerary//${GCI18N.lang.toUpperCase()}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const d of state.event.days || []) {
    const dayItems = items
      .filter((item) => assignedDay(item.kind, item.key) === d.date)
      .sort(compareItineraryItems);
    if (!dayItems.length) continue;

    lines.push("BEGIN:VEVENT", `UID:gc2026-${d.date}@gc2026-guide`, `DTSTAMP:${stamp}`);

    const start = d.open ? new Date(`${d.date}T${d.open}:00+02:00`) : null;
    const end = d.close ? new Date(`${d.date}T${d.close}:00+02:00`) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      lines.push(`DTSTART:${icsDateTimeUTC(start)}`, `DTEND:${icsDateTimeUTC(end)}`);
    } else {
      const date = String(d.date).replace(/-/g, "");
      const next = new Date(`${d.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${icsDateTimeUTC(next).slice(0, 8)}`);
    }

    lines.push(
      `SUMMARY:${icsEscape(
        t("ics.summary", { day: dayName(d.date), n: dayItems.length })
      )}`,
      `LOCATION:${icsEscape(state.event.location || t("ics.locationFallback"))}`,
      `DESCRIPTION:${icsEscape(dayItems.map(icsDescription).join("\n"))}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}

function downloadICS() {
  const blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = t("ics.filename");
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- route by hall — the plan's hall lens ---------- */

const isAbsent = (ex) => (ex.tags || []).includes("not exhibiting");
const isOffsite = (ex) => (ex.tags || []).includes("offsite");

/* Which days a stop is planned for: the booth's own assignment plus those of
   the saved games shown there. "none" stands in for any saved element still
   waiting for a day. */
function stopDays(ex) {
  const days = new Set();
  if (isSaved("exhibitor", ex.id)) days.add(assignedDay("exhibitor", ex.id) || "none");
  savedGames(ex).forEach((g) => days.add(assignedDay("game", gameKey(g.title)) || "none"));
  return days;
}

function routeGroups() {
  const buckets = new Map();
  const absent = [];
  let played = 0;

  plannedExhibitors().filter(hasSaved).forEach((ex) => {
    /* Absence wins over offsite: entries such as Wargaming mention an offsite
       event but still have no show-floor stop. */
    if (isAbsent(ex)) {
      absent.push(ex.name);
      return;
    }
    /* The day filter scopes everything after it — including the played count,
       so "1 played" always describes the stops actually on screen. */
    if (state.planDay !== "all" && !stopDays(ex).has(state.planDay)) return;
    if (hasPlayed(ex)) {
      played += 1;
      if (state.hidePlayed) return;
    }
    /* A known hall wins over the offsite tag. Some entries are both — Tencent
       runs a Hall 8.1 booth *and* the Wassermannhalle art exhibition on one
       entry — and a stop you can walk to belongs in the hall you walk to. */
    const key = ex.hall ? String(ex.hall) : isOffsite(ex) ? "offsite" : "tba";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ex);
  });

  const numbered = [...buckets.keys()]
    .filter((key) => key !== "offsite" && key !== "tba")
    .sort((a, b) => hallRank(a) - hallRank(b) || byName(a, b));
  const keys = [...numbered, ...["offsite", "tba"].filter((key) => buckets.has(key))];

  return {
    groups: keys.map((key) => ({
      key,
      label:
        key === "offsite"
          ? t("plan.offsite")
          : key === "tba"
            ? t("route.locationTba")
            : t("where.hall", { hall: key }),
      /* Crowd-desc, then played stops sink to the end of their hall — same
         stable two-pass sort as the priority table. */
      items: buckets
        .get(key)
        .sort(byCrowdDesc)
        .sort((a, b) => hasPlayed(a) - hasPlayed(b)),
    })),
    absent: absent.sort(byName),
    played,
  };
}

/* Short day tags on a stop — the hall lens reading the day lens back. Only in
   the all-days view; under a single-day filter every row would repeat the
   same tag. */
function routeDayTags(ex) {
  const assigned = new Set([...stopDays(ex)].filter((day) => day !== "none"));
  if (!assigned.size) return "";
  return (state.event.days || [])
    .filter((d) => assigned.has(d.date))
    .map((d) => `<span class="route-day">${esc(shortDay(d.date))}</span>`)
    .join("");
}

function renderRoute() {
  const routeList = $("#plan-board");
  const dayFilter = state.planDay === "all" ? null : state.planDay;
  const { groups, absent, played } = routeGroups();
  const stopCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hallCount = groups.filter((group) => group.key !== "offsite" && group.key !== "tba").length;
  const html = groups
    .map((group) => {
      const kicker =
        group.key === "offsite" || group.key === "tba"
          ? t("route.locationKicker")
          : t("hall.word");
      const number =
        group.key === "offsite"
          ? t("plan.offsite")
          : group.key === "tba"
            ? t("plate.tba")
            : group.key;
      const rows = group.items
        .map((ex) => {
          const baseLocation = ex.booth
            ? ex.booth
            : ex.hall
              ? t("plate.boothTba")
              : t("route.locationTbaShort");
          /* The booth number is the link; "· unconf." stays outside it. That
             suffix is a caveat about the data, not part of the address, and
             underlining it would offer to show you a stand we're not sure of. */
          const unconf = ex.hall && !ex.locationConfirmed ? t("plate.unconfSuffix") : "";
          const crowd = ex.crowd || 0;
          return `<div class="route-item" data-saved="${isSaved("exhibitor", ex.id)}" data-played="${hasPlayed(ex)}">
            <span class="route-name">${esc(ex.name)}${dayFilter ? "" : routeDayTags(ex)}</span>
            <span class="route-booth">${hallLink(ex.hall, ex.booth, baseLocation)}${unconf}</span>
            <span class="route-crowd" data-level="${esc(inBusinessArea(ex) ? 0 : crowd)}">${
              inBusinessArea(ex)
                ? esc(t("plan.tradeBadge"))
                : `${esc(t("route.queueShort", { n: crowd || "?" }))} · ${esc(crowdLabel(crowd))}`
            }</span>
            ${queueSummary(ex, { compact: true, kind: "route" })}
            <span class="row-actions">
              ${markButton("played", "exhibitor", ex.id, ex.name)}
              ${markButton("saved", "exhibitor", ex.id, ex.name)}
            </span>
            ${savedHereChips(ex, { day: dayFilter })}
          </div>`;
        })
        .join("");
      const countLabel = t("route.stops", { n: group.items.length });
      /* The header opens the whole hall — the overview you want before
         walking into it. Each stop's booth number below opens that stand. */
      const toMap = hasMap(group.key)
        ? `<a class="route-hall-map" href="${esc(mapLink(group.key))}"
            aria-label="${esc(
              t("map.openAria", { where: t("where.hall", { hall: group.key }) })
            )}">${esc(t("map.cue"))}</a>`
        : "";
      return `<h4 class="route-hall" aria-label="${esc(`${group.label}, ${countLabel}`)}">
        <span class="route-hall-kicker">${esc(kicker)}</span>
        <span class="route-hall-num">${esc(number)}</span>
        <span class="route-hall-count">${esc(countLabel)}</span>
        ${toMap}
      </h4>${rows}`;
    })
    .join("");

  keepingFocus(
    routeList,
    () => {
      routeList.innerHTML = html;
    },
    $("#plan-title")
  );
  routeList.classList.toggle("hidden", stopCount === 0);
  /* Under a day filter the absent footnote is hidden, so it can't stand in
     for the empty message the way it does on the all-days view. */
  $("#plan-empty").classList.toggle("hidden", stopCount > 0 || (!dayFilter && absent.length > 0));
  $("#plan-empty").textContent = tradeDataPending()
    ? tradePendingCopy()
    : !savedCount()
    ? t("route.emptyNoSaved")
    : state.hidePlayed && played > 0 && stopCount === 0
      ? t("route.emptyAllPlayed")
      : dayFilter === "none"
        ? t("route.emptyAllAssigned")
        : dayFilter
          ? t("route.emptyForDay", { day: dayName(dayFilter) })
          : t("route.emptyStale");
  $("#plan-count").textContent =
    t("route.stops", { n: stopCount }) +
    " · " +
    t("route.halls", { n: hallCount }) +
    (played ? t("priority.playedSuffix", { n: played }) : "");
  /* Absent entries have no day to belong to; the footnote is an all-days fact. */
  $("#plan-absent").classList.toggle("hidden", absent.length === 0 || Boolean(dayFilter));
  $("#plan-absent").textContent = absent.length
    ? t("route.absentNote", { names: absent.join(", ") })
    : "";
}

/* ---------- your plan ----------

   One board, two arrangements of the same saved list: the day lens is the
   itinerary (place stops on days, export them), the hall lens is the walking
   route. One section instead of two keeps a single list on screen, and lets
   the hall view read the day assignments instead of ignoring them. */

/* Day chips over the hall lens — the itinerary's assignments projected onto
   the route, so "today's stops, in walking order" is one tap. Hidden until at
   least one stop sits on a day, and in the day lens, where the grouping
   already answers the question. */
function renderPlanDayFilter() {
  const row = $("#plan-day-filter");
  if (!row) return;
  const seen = new Set();
  plannedExhibitors().filter(hasSaved).forEach((ex) => {
    if (!isAbsent(ex)) stopDays(ex).forEach((day) => seen.add(day));
  });
  const assigned = (state.event.days || []).filter((d) => seen.has(d.date));
  /* A filter left pointing at a day that lost its last stop would strand the
     view on an empty board with no active chip to clear it. */
  if (state.planDay !== "all" && !seen.has(state.planDay)) state.planDay = "all";
  const show = state.planLens === "hall" && assigned.length > 0;
  row.classList.toggle("hidden", !show);
  row.innerHTML = !show
    ? ""
    : [
        ["all", t("route.allDays"), t("route.allDaysTitle")],
        ...assigned.map((d) => [
          d.date,
          shortDay(d.date),
          t("route.onlyDay", { day: dayName(d.date) }),
        ]),
        ...(seen.has("none")
          ? [["none", t("plan.unassigned"), t("route.onlyUnassigned")]]
          : []),
      ]
        .map(
          ([value, label, title]) => `<button class="day-chip${state.planDay === value ? " active" : ""}"
            type="button" data-plan-day="${esc(value)}" aria-pressed="${state.planDay === value}"
            title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button>`
        )
        .join("");
  $$("#plan-day-filter .day-chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.planDay = chip.dataset.planDay;
      renderPlan();
      /* The render rebuilds the chip row — put focus back on the chip that
         was pressed, the way the age filter does. */
      $(`#plan-day-filter [data-plan-day="${CSS.escape(chip.dataset.planDay)}"]`)?.focus();
    })
  );
}

function renderPlan() {
  /* The service worker caches index.html and app.js independently, so on a
     flaky network this file can briefly run against a one-version-older shell
     that still has the separate itinerary and route sections (see
     handleNavigation in sw.js). Bail out instead of letting a null lookup
     abort the whole boot. */
  const board = $("#plan-board");
  if (!board) return;
  const hall = state.planLens === "hall";
  $$("#plan-lens .lens-chip").forEach((chip) => {
    const on = chip.dataset.lens === state.planLens;
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", String(on));
  });
  $("#plan-sub").textContent = hall ? t("plan.sub.hall") : t("plan.sub.day");
  /* Before the board: this can reset a stranded state.planDay back to "all",
     and routeGroups() has to see the corrected value. */
  renderPlanDayFilter();
  /* Same shell, restyled per lens; toggle (not className) so "hidden" and the
     renderers' own state survive the swap. */
  board.classList.toggle("it-board", !hall);
  board.classList.toggle("route-board", hall);
  hall ? renderRoute() : renderItinerary();
  /* Export rides with the plan, not one lens — it always writes the full set
     of day assignments, whichever arrangement is on screen. Same visibility
     test the itinerary section used: at least one item placed on a real day. */
  const validDays = new Set((state.event?.days || []).map((d) => d.date));
  $("#export-ics").classList.toggle(
    "hidden",
    !itineraryItems().some((item) => validDays.has(assignedDay(item.kind, item.key)))
  );
}

/* ---------- event info ---------- */

function renderEvent() {
  const ev = state.event;
  /* The hall column is a hall number like any other in the guide, so it is
     also the way to that hall on the map — an anchor wearing the same plate,
     not a second control. The label stays exactly as the data wrote it; the
     accessible name carries the destination, because for a span like "5–10"
     the hall you land in is not the number you tapped (see areaMapHall). */
  const areas = (ev.areas || [])
    .map((a) => {
      const to = areaMapHall(a.hall);
      /* One hall, named and landed on: the plate can speak like every other
         hall link in the guide. A span can't — the number you tapped is not
         the hall that opens — so it says both, and says the tapped number
         first, which is the one a voice command has to match. */
      const itself = to === String(a.hall ?? "").trim();
      const where = t("where.hall", { hall: to });
      const spanned = t(/[–—-]/.test(String(a.hall)) ? "where.halls" : "where.hall", {
        hall: a.hall,
      });
      const plate = to
        ? `<a class="area-hall hall-link" href="${esc(mapLink(to))}"
            title="${esc(itself ? t("map.openTitle") : t("map.openTitleWith", { what: where }))}"
            aria-label="${esc(
              itself ? t("map.openAria", { where }) : t("map.openAreaAria", { halls: spanned, where })
            )}">${esc(a.hall)}</a>`
        : `<span class="area-hall${a.hall ? "" : " none"}">${a.hall ? esc(a.hall) : "—"}</span>`;
      return `<li>
        ${plate}
        <span>
          <span class="area-name">${esc(a.name)}</span><br>
          <span class="area-desc">${esc(a.description)}</span>
        </span>
      </li>`;
    })
    .join("");

  /* Entrances are the one piece of event info that is advice rather than
     fact: the gate that is quickest depends on the day and on which way
     Koelnmesse is steering the queue that morning. The lede says so, and
     the trade note gets its own paragraph because "West is best" is only
     true on the public days.

     Both names stay as they are in every language: `name` is the short
     English gate letter the guide sorts and links by, and `nameDe` is what
     Koelnmesse has written on the building — a German reader and an English
     one are both looking for the sign that says "Eingang West". */
  const ent = ev.entrances;
  const entrances = (ent?.list || [])
    .map(
      (e) => `<li>
        <span class="area-hall entrance-name">${esc(e.name)}</span>
        <span>
          <span class="area-name">${esc(e.nameDe || e.name)}</span><br>
          <span class="area-desc">${esc(e.description)}</span>
        </span>
      </li>`
    )
    .join("");

  /* The official site answers in German too, so a German reader gets sent
     to the German pages rather than bounced through the English ones. */
  const officialBase = GCI18N.lang === "de" ? "de" : "en";
  const links = [
    [`https://www.gamescom.global/${officialBase}`, "gamescom.global", t("links.officialSite")],
    [
      `https://exhibitors.gamescom.global/${officialBase}/gamescom-exhibitors/list-of-exhibitors/`,
      t("links.exhibitorDirectory"),
      t("links.officialList"),
    ],
    [
      `https://www.gamescom.global/${officialBase}/info/hall-plan`,
      t("links.hallPlan"),
      t("links.officialMap"),
    ],
  ]
    .map(
      ([href, name, desc]) =>
        `<li><a href="${href}" target="_blank" rel="noopener"><span class="link-name">${esc(name)}</span><span class="link-desc">${esc(desc)} ↗</span></a></li>`
    )
    .join("");

  $("#event-info").innerHTML = `
    <div class="info-block">
      <h2><span class="section-num">01</span> ${esc(t("event.theShow"))}</h2>
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
      <h2><span class="section-num">02</span> ${esc(t("event.tickets"))}</h2>
      <p>${esc(ev.tickets || t("event.ticketsFallback"))}</p>
    </div>
    <div class="info-block">
      <h2><span class="section-num">03</span> ${esc(t("event.yourBadge"))}</h2>
      <p>${t("event.badgeWhat")}</p>
      <p class="fact-sub">${esc(
        state.trade ? t("event.badgeOnNote") : t("event.badgeOffNote")
      )}</p>
      <button class="${state.trade ? "badge-off" : "trade-enable"}" id="badge-toggle" type="button">${esc(
        state.trade ? t("trade.hide") : t("trade.enable")
      )}</button>
    </div>
    <div class="info-block">
      <h2><span class="section-num">04</span> ${esc(t("event.areas"))}</h2>
      <ul class="area-list">${areas}</ul>
    </div>
    ${
      entrances
        ? `<div class="info-block">
      <h2><span class="section-num">05</span> ${esc(t("event.entrances"))}</h2>
      ${ent.lede ? `<p>${esc(ent.lede)}</p>` : ""}
      <ul class="area-list">${entrances}</ul>
      ${
        ent.trade
          ? `<p class="entrance-trade"><strong>${esc(t("event.entrancesTradeLabel"))}</strong> ${esc(
              ent.trade
            )}</p>`
          : ""
      }
    </div>`
        : ""
    }
    <div class="info-block">
      <h2><span class="section-num">0${entrances ? 6 : 5}</span> ${esc(t("event.officialLinks"))}</h2>
      <ul class="link-list">${links}</ul>
    </div>
    <p class="info-foot">
      <span>${esc(t("event.compiledNote"))}</span>
      ${sourcesButton("event", "")}
    </p>`;

  /* setTrade() re-renders this block, so the listener is re-attached with it
     rather than delegated — same pattern as the filter chips. */
  $("#badge-toggle").addEventListener("click", () => setTrade(!state.trade, { announce: true }));
}

/* ---------- changelog ---------- */

function renderChangelog() {
  const entries = [...(state.changelog || [])].sort((a, b) => b.revision - a.revision);
  $("#changelog").innerHTML = entries
    .map(
      (e) => `<div class="timeline-entry">
        <div class="timeline-head">
          <span class="timeline-date">${esc(formatDate(e.date))}</span>
          <span class="rev-tag">${esc(t("updates.rev", { n: e.revision }))}</span>
        </div>
        <ul>${(e.changes || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");
}

/* ---------- live queue interaction ---------- */

function queueFromElement(el) {
  return QUEUES?.queue(el?.dataset.queueExhibitor, el?.dataset.queueGame) || null;
}

function queueItem(kind, key) {
  return itineraryItems().find((item) => item.kind === kind && item.key === key) || null;
}

/* ---------- the Live queues view ----------

   One searchable list of every reportable queue, replacing the controls that
   used to hang off each game row. Built once per data load: 162 entries at
   revision 29, small enough to filter on every keystroke without the debounce
   the exhibitor grid needs, because only this list re-renders. */

let queueIndex = [];
let queueScopeEx = null;
let queueQuery = "";

function buildQueueIndex() {
  queueIndex = [];
  if (!QUEUES) return;
  for (const ex of state.exhibitors) {
    for (const queue of QUEUES.queuesFor(ex)) {
      const game = queueGame(queue);
      queueIndex.push({
        queue,
        ex,
        title: game ? game.title : ex.name,
        /* A booth queue is the booth, so repeating the name as a subtitle
           would read "Nintendo — Nintendo". */
        subtitle: game ? ex.name : "",
        haystack: [game?.title || "", ex.name, ex.hall || "", ex.booth || "", ...(ex.tags || [])]
          .join(" ")
          .toLowerCase(),
        lead: (game ? game.title : ex.name).toLowerCase(),
      });
    }
  }
  queueIndex.sort((a, b) => byName(a.title, b.title));
}

/* Ranked so a typed title beats a booth that merely mentions it: exact lead,
   then lead prefix, then a word start anywhere, then any substring. Pure, and
   deliberately no fuzzy matching — "hlo" should not offer Halo to somebody
   standing in front of a sign. */
function matchQueues(query, entries) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const scored = [];
  for (const entry of entries) {
    let score = -1;
    if (entry.lead === needle) score = 0;
    else if (entry.lead.startsWith(needle)) score = 1;
    else if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(entry.haystack)) score = 2;
    else if (entry.haystack.includes(needle)) score = 3;
    if (score >= 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || byName(a.entry.title, b.entry.title))
    .map(({ entry }) => entry);
}

/* The one place the empty states are worth telling apart. "No reports yet" is
   an invitation — you could be the first. A figure that has aged out is not:
   the queue was being reported and has gone quiet, and saying "no reports"
   there would be a lie. The stale case is only claimed while connected, since
   offline everything looks stale and the notice at the top already says so. */
function queueLiveRowCell(queue) {
  const markup = queueLiveMarkup(queue);
  if (markup) return markup;
  const stale = QUEUES.connected() && QUEUES.unavailable(queue);
  return `<span class="queue-live ${stale ? "queue-live-unavailable" : "queue-live-none"}">${esc(
    t(stale ? "queue.liveUnavailable" : "queue.noReports")
  )}</span>`;
}

function queueRowMarkup(entry) {
  const { queue, ex } = entry;
  const name = queueName(queue);
  const active = QUEUES.session(queue);
  const pending = QUEUES.pendingFor(queue);
  const canReport = QUEUES.canReport();
  const place = ex.hall
    ? t(ex.booth ? "where.hallDotBooth" : "where.hall", { hall: ex.hall, booth: ex.booth || "" })
    : ex.booth || "";

  let actions = "";
  if (pending) {
    actions = `<span class="queue-session-time">${esc(t("queue.pendingCompletion"))}</span>`;
  } else if (active) {
    actions = `${queueElapsedMarkup(queue, active)}
      <span class="queue-session-actions">
        ${
          canReport
            ? `<button class="queue-action" type="button" data-queue-action="update" ${queueAttrs(queue)}
                aria-label="${esc(t("queue.action.updateAria", { queue: name }))}">${esc(t("queue.action.update"))}</button>`
            : ""
        }
        <button class="queue-action queue-action-primary" type="button" data-queue-action="entered" ${queueAttrs(queue)}
          aria-label="${esc(t("queue.action.enteredAria", { queue: name }))}">${esc(t("queue.action.entered"))}</button>
        <button class="queue-action" type="button" data-queue-action="left" ${queueAttrs(queue)}
          aria-label="${esc(t("queue.action.leftAria", { queue: name }))}">${esc(t("queue.action.left"))}</button>
      </span>`;
  } else if (canReport) {
    actions = `<span class="queue-session-actions">
      <button class="queue-action queue-action-primary" type="button" data-queue-action="join" ${queueAttrs(queue)}
        aria-label="${esc(t("queue.action.joinAria", { queue: name }))}">${esc(t("queue.action.join"))}</button>
      <button class="queue-action" type="button" data-queue-action="closed" ${queueAttrs(queue)}
        aria-label="${esc(t("queue.action.closedAria", { queue: name }))}">${esc(t("queue.action.closed"))}</button>
    </span>`;
  }

  return `<article class="queue-row" ${queueAttrs(queue)}>
    <div class="queue-row-head">
      <h4 class="queue-row-title">${esc(entry.title)}</h4>
      ${entry.subtitle ? `<p class="queue-row-sub">${esc(entry.subtitle)}</p>` : ""}
      ${place ? `<p class="queue-row-place">${esc(place)}</p>` : ""}
    </div>
    <div class="queue-row-live">${queueLiveRowCell(queue)}</div>
    <div class="queue-row-actions">${actions}</div>
  </article>`;
}

function renderQueuesMine() {
  const section = $("#queues-mine-section");
  const list = $("#queues-mine");
  if (!section || !list) return;
  const open = QUEUES.sessions()
    .map((entry) => queueIndex.find((row) => row.queue.exhibitor === entry.exhibitor && row.queue.game === entry.game))
    .filter(Boolean)
    .sort((a, b) => Number(QUEUES.session(b.queue)?.joinedAt || 0) - Number(QUEUES.session(a.queue)?.joinedAt || 0));
  const pending = queueIndex.filter((row) => QUEUES.pendingFor(row.queue));
  const rows = [...open, ...pending.filter((row) => !open.includes(row))];
  section.hidden = rows.length === 0;
  list.innerHTML = rows.map((entry) => queueRowMarkup(entry)).join("");
}

function renderQueuesScope() {
  const scope = $("#queues-scope");
  if (!scope) return;
  const ex = queueScopeEx && state.exhibitors.find((entry) => entry.id === queueScopeEx);
  scope.hidden = !ex;
  scope.innerHTML = ex
    ? `<span class="queues-scope-label">${esc(t("queues.scopedTo", { exhibitor: ex.name }))}</span>
       <button class="chip" type="button" id="queues-scope-clear">${esc(t("queues.showAll"))}</button>`
    : "";
}

function renderQueuesResults() {
  const list = $("#queues-results");
  const count = $("#queues-result-count");
  const empty = $("#queues-empty");
  if (!list || !count || !empty) return;

  const scoped = queueScopeEx ? queueIndex.filter((entry) => entry.ex.id === queueScopeEx) : queueIndex;
  /* Scoped to a booth, the whole (short) list is the answer and typing
     narrows it. Unscoped, an untyped list of 162 queues is not a useful
     starting point, so the saved list stands in for it. */
  let rows;
  let heading = "";
  if (queueQuery) {
    rows = matchQueues(queueQuery, scoped);
    heading = t("queues.countMatches", { n: rows.length });
  } else if (queueScopeEx) {
    rows = scoped;
    heading = t("queues.countMatches", { n: rows.length });
  } else {
    rows = queueIndex.filter((entry) => isSaved("exhibitor", entry.ex.id) || isSaved("game", entry.queue.game));
    heading = rows.length ? t("queues.countSaved", { n: rows.length }) : "";
  }

  const shown = rows.slice(0, 40);
  list.innerHTML = shown.map((entry) => queueRowMarkup(entry)).join("");
  count.textContent = heading;
  empty.hidden = shown.length > 0;
  if (!shown.length) {
    empty.textContent = queueQuery
      ? t(queueScopeEx ? "queues.emptyScoped" : "queues.emptySearch", { query: queueQuery })
      : t("queues.emptyDefault");
  }
}

function renderQueuesNotice() {
  const notice = $("#queues-notice");
  if (!notice) return;
  let message = "";
  if (!QUEUES.visible()) message = t("queues.noticeBeforeShow");
  else if (!QUEUES.canReport()) message = t("queues.noticeClosed");
  else if (!QUEUES.connected()) message = t("queues.noticeOffline");
  notice.hidden = !message;
  notice.textContent = message;
}

function renderQueues() {
  if (!QUEUES || !$("#view-queues")) return;
  if (!queueIndex.length) buildQueueIndex();
  renderQueuesNotice();
  renderQueuesMine();
  renderQueuesScope();
  renderQueuesResults();
}

/* Narrow the view to one booth, or clear it. Landing scoped also clears any
   stale query, so arriving from a card never shows another booth's matches. */
function applyQueueScope(exhibitorId) {
  const ex = exhibitorId && state.exhibitors.find((entry) => entry.id === exhibitorId);
  queueScopeEx = ex ? ex.id : null;
  queueQuery = "";
  const search = $("#queues-search");
  if (search) search.value = "";
  renderQueues();
  /* Arriving from a card link is a view change, not a scroll: the card that
     sent you here can be a long way down the grid, and switching tabs keeps
     the offset, which lands you in the middle of the queue list. Only the
     link and a deep link reach here — the tab itself replaces the hash rather
     than changing it — and on a deep link the page is already at the top, so
     this costs nothing there. No smooth scroll: a tab switch is instant
     everywhere else in the app. */
  window.scrollTo(0, 0);
}

/* The tab is absent outside the show days, like every other queue surface. */
function syncQueueTab() {
  const tab = $('.tab[data-view="queues"]');
  if (!tab || !QUEUES) return;
  const show = QUEUES.visible();
  tab.hidden = !show;
  if (!show && state.view === "queues") showView(VIEWS[0]);
}

function refreshQueueSurfaces() {
  if (!QUEUES) return;
  queueSurfaceGate = `${QUEUES.visible()}:${QUEUES.canReport()}`;
  $$('[data-queue-surface]').forEach((surface) => {
    const focused = surface.contains(document.activeElement) ? document.activeElement : null;
    const action = focused?.dataset.queueAction;
    let html = "";
    if (surface.dataset.queueSurface === "tracker") {
      html = queueTrackerInner(queueFromElement(surface));
    } else if (surface.dataset.queueSurface === "item") {
      html = itemQueueInner(queueItem(surface.dataset.queueItemKind, surface.dataset.queueItemKey));
    } else if (surface.dataset.queueSurface === "report") {
      const ex = state.exhibitors.find((entry) => entry.id === surface.dataset.queueExhibitor);
      html = ex ? queueReportLinkInner(ex) : "";
    } else {
      const ex = state.exhibitors.find((entry) => entry.id === surface.dataset.queueExhibitor);
      html = ex ? queueSummaryInner(ex, surface.dataset.queueCompact === "true") : "";
    }
    surface.innerHTML = html;
    if (action) {
      const queue = queueFromElement(focused);
      const selector = queue
        ? `[data-queue-action="${CSS.escape(action)}"][data-queue-exhibitor="${CSS.escape(
            queue.exhibitor
          )}"][data-queue-game="${CSS.escape(queue.game)}"]`
        : `[data-queue-action="${CSS.escape(action)}"]`;
      const replacement = surface.querySelector(selector);
      if (replacement) replacement.focus({ preventScroll: true });
      else if (surface.matches('[tabindex]')) surface.focus({ preventScroll: true });
    }
  });
  /* The queues view is rendered whole rather than through surfaces: its rows
     appear and disappear as sessions open and close, which a per-surface
     refresh cannot express. Only while it is the visible tab — rebuilding a
     hidden list on every 30-second tick is work nobody sees. */
  syncQueueTab();
  if (state.view === "queues") renderQueues();
}

function updateQueueTimes() {
  if (!QUEUES) return;
  $$('[data-queue-elapsed]').forEach((el) => {
    const queue = queueFromElement(el);
    const session = QUEUES.session(queue);
    if (!session) return;
    el.textContent = t("queue.elapsed", { n: Math.max(0, Math.floor(QUEUES.elapsed(session) / 60)) });
  });
  let freshnessExpired = false;
  $$('[data-live-age]').forEach((el) => {
    const live = QUEUES.live(queueFromElement(el));
    if (live) el.textContent = queueAge(live.age);
    else freshnessExpired = true;
  });
  /* Ticks normally touch text nodes only. Crossing a tier's freshness
     boundary is the exception: replace the small queue surfaces so the old
     number becomes unavailable even after polling stops at closing time. */
  if (freshnessExpired) refreshQueueSurfaces();
}

function queueClaimLabel(value) {
  return t(`queue.claim.${value}`);
}

function queueAheadLabel(value) {
  return value === 200 ? t("queue.ahead.200") : t("queue.ahead.value", { n: value });
}

function queueDialogAhead() {
  return `<div class="queue-dialog-step">
    <p class="queue-dialog-question">${esc(t("queue.aheadQuestion"))}</p>
    <div class="queue-choice-row" role="group" aria-label="${esc(t("queue.aheadAria"))}">
      ${QUEUE_AHEAD.map(
        (value) => `<button class="queue-choice" type="button" data-queue-dialog-action="ahead" data-value="${value}">${esc(
          queueAheadLabel(value)
        )}</button>`
      ).join("")}
      <button class="queue-choice" type="button" data-queue-dialog-action="ahead-none">${esc(
        t("queue.aheadSkip")
      )}</button>
    </div>
  </div>`;
}

function queueDialogDetails() {
  if (queueDialogState?.metaSaved) return "";
  const selected = queueDialogState?.qtype || "";
  const wantsBatch = selected === "group" || selected === "wave";
  return `<details class="queue-details"${queueDialogState.detailsOpen ? " open" : ""}>
    <summary>${esc(t("queue.details"))}</summary>
    <p>${esc(t("queue.detailsHelp"))}</p>
    <div class="queue-choice-row" role="group" aria-label="${esc(t("queue.typeAria"))}">
      ${QUEUE_TYPES.map(
        (value) => `<button class="queue-choice${selected === value ? " active" : ""}" type="button"
          data-queue-dialog-action="qtype" data-value="${value}" aria-pressed="${selected === value}">${esc(
            t(`queue.type.${value}`)
          )}</button>`
      ).join("")}
    </div>
    ${
      wantsBatch
        ? `<p class="queue-dialog-question">${esc(t("queue.batchQuestion"))}</p>
          <div class="queue-choice-row" role="group" aria-label="${esc(t("queue.batchAria"))}">
            ${QUEUE_BATCHES.map(
              (value) => `<button class="queue-choice${queueDialogState.batch === value ? " active" : ""}" type="button"
                data-queue-dialog-action="batch" data-value="${value}" aria-pressed="${
                  queueDialogState.batch === value
                }">~${value}</button>`
            ).join("")}
          </div>`
        : ""
    }
    <button class="queue-meta-save" type="button" data-queue-dialog-action="meta" ${selected ? "" : "disabled"}>${esc(
      t("queue.detailsSave")
    )}</button>
  </details>`;
}

function renderQueueDialog() {
  const dialog = $("#queue-dialog");
  if (!dialog || !queueDialogState) return;
  $("#queue-dialog-subject").textContent = queueName(queueDialogState.queue);
  const flow = $("#queue-dialog-flow");
  if (queueDialogState.mode === "join") {
    flow.innerHTML = `<div class="queue-dialog-step">
      <p class="queue-dialog-question">${esc(t("queue.claimQuestion"))}</p>
      <div class="queue-choice-row" role="group" aria-label="${esc(t("queue.claimAria"))}">
        ${QUEUE_CLAIMS.map(
          (value) => `<button class="queue-choice" type="button" data-queue-dialog-action="claim" data-value="${value}">${esc(
            queueClaimLabel(value)
          )}</button>`
        ).join("")}
      </div>
    </div>`;
  } else if (queueDialogState.mode === "update") {
    flow.innerHTML = queueDialogAhead();
  } else {
    flow.innerHTML = `${queueDialogState.aheadDone ? "" : queueDialogAhead()}${queueDialogDetails()}`;
  }
  flow.querySelectorAll("button").forEach((button) => {
    button.disabled = button.disabled || queueDialogState.busy;
  });
  const details = flow.querySelector(".queue-details");
  details?.addEventListener("toggle", () => {
    if (queueDialogState) queueDialogState.detailsOpen = details.open;
  });
  $("#queue-dialog-status").textContent = queueDialogState.status || "";
  $("#queue-dialog-done").hidden = queueDialogState.mode !== "details";
}

let queueDialogInvoker = null;

function openQueueDialog(queue, mode, invoker = null) {
  const dialog = $("#queue-dialog");
  if (!dialog || !queue) return;
  queueDialogInvoker = invoker;
  queueDialogState = {
    queue,
    mode,
    busy: false,
    status: "",
    aheadDone: false,
    qtype: "",
    batch: null,
    detailsOpen: false,
    metaSaved: false,
  };
  renderQueueDialog();
  dialog.showModal();
  requestAnimationFrame(() => dialog.querySelector(".queue-choice")?.focus());
}

const QUEUE_ERROR_KEYS = {
  network_unavailable: "queue.offlineNotSent",
  completion_pending: "queue.errorCompletionPending",
  deferred_rejected: "queue.errorCompletionExpired",
  update_too_soon: "queue.errorTooSoon",
  update_conflict: "queue.errorTooSoon",
  closure_too_soon: "queue.errorTooSoon",
  meta_already_reported: "queue.errorMetaReported",
  no_open_session: "queue.errorExpired",
  session_already_closed: "queue.errorExpired",
  writes_paused: "queue.errorPaused",
  outside_show_hours: "queue.errorHours",
  event_ended: "queue.errorHours",
  client_denied: "queue.errorDenied",
  unknown_queue: "queue.errorUnavailable",
};

const queueError = (error) => {
  if (error?.queueOffline) return error.message;
  if (error?.status === 429 || error?.code === "session_limit" || error?.code === "rate_limited") {
    return t("queue.errorRate");
  }
  const key = QUEUE_ERROR_KEYS[error?.code];
  return key ? t(key) : t("queue.error", { error: error?.message || t("queue.errorUnknown") });
};

function requireQueueDelivery(result) {
  if (!result?.dropped) return result;
  const error = new Error(t("queue.offlineNotSent"));
  error.queueOffline = true;
  throw error;
}

function focusQueueFallback(queue) {
  const tracker = queue
    ? $(`[data-queue-surface="tracker"][data-queue-exhibitor="${CSS.escape(
        queue.exhibitor
      )}"][data-queue-game="${CSS.escape(queue.game)}"]`)
    : null;
  if (tracker?.getClientRects().length) tracker.focus({ preventScroll: true });
  else $('.tab[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
}

async function submitQueueDialog(action, value) {
  if (!queueDialogState || queueDialogState.busy) return;
  if (action === "qtype") {
    queueDialogState.qtype = value;
    queueDialogState.batch = null;
    renderQueueDialog();
    $(`#queue-dialog-flow [data-queue-dialog-action="qtype"][data-value="${CSS.escape(value)}"]`)?.focus();
    return;
  }
  if (action === "batch") {
    queueDialogState.batch = Number(value);
    renderQueueDialog();
    $(`#queue-dialog-flow [data-queue-dialog-action="batch"][data-value="${CSS.escape(String(value))}"]`)?.focus();
    return;
  }

  const stateAtSubmit = queueDialogState;
  stateAtSubmit.busy = true;
  stateAtSubmit.status = t("queue.sending");
  renderQueueDialog();
  let failed = false;
  try {
    if (action === "claim") {
      requireQueueDelivery(await QUEUES.report(stateAtSubmit.queue, "joined", { claimed: Number(value) }));
      stateAtSubmit.mode = "details";
      stateAtSubmit.status = t("queue.joinedSuccess");
    } else if (action === "ahead" || action === "ahead-none") {
      const body = action === "ahead" ? { ahead: Number(value) } : {};
      requireQueueDelivery(await QUEUES.report(stateAtSubmit.queue, "update", body));
      if (stateAtSubmit.mode === "update") {
        const dialog = $("#queue-dialog");
        if (queueDialogState === stateAtSubmit && dialog.open) dialog.close();
        showToast(t("queue.updatedSuccess"));
        return;
      }
      stateAtSubmit.aheadDone = true;
      stateAtSubmit.status = t("queue.updatedSuccess");
    } else if (action === "meta") {
      const body = { qtype: stateAtSubmit.qtype };
      if (stateAtSubmit.batch) body.batch = stateAtSubmit.batch;
      requireQueueDelivery(await QUEUES.report(stateAtSubmit.queue, "meta", body));
      stateAtSubmit.metaSaved = true;
      stateAtSubmit.status = t("queue.detailsSaved");
    }
  } catch (error) {
    failed = true;
    stateAtSubmit.status = queueError(error);
  } finally {
    if (queueDialogState === stateAtSubmit) {
      stateAtSubmit.busy = false;
      renderQueueDialog();
      if ($("#queue-dialog").open) {
        if (failed) {
          $("#queue-dialog-flow button:not([disabled])")?.focus();
        } else if (action === "claim") $("#queue-dialog-flow .queue-choice")?.focus();
        else if (action === "ahead" || action === "ahead-none" || action === "meta") {
          $("#queue-dialog-done")?.focus();
        }
      }
    }
  }
}

async function runQueueAction(queue, action, source = null) {
  if (!queue) return;
  const promptSource = Boolean(source?.closest("#queue-prompt"));
  const actionGroup = action === "entered" || action === "left" ? "outcome" : action;
  const pendingKey = `${QUEUES.queueKey(queue.exhibitor, queue.game)}:${actionGroup}`;
  if (pendingQueueActions.has(pendingKey)) return;
  if (action === "join" || action === "update") {
    queuePromptKey = null;
    renderQueuePrompt(false);
    openQueueDialog(queue, action, source);
    return;
  }
  pendingQueueActions.add(pendingKey);
  if (source) {
    source.disabled = true;
    source.setAttribute("aria-busy", "true");
  }
  try {
    const result = await QUEUES.report(queue, action);
    queuePromptKey = null;
    if (action === "entered" && result.queued) showToast(t("queue.enteredDeferred"));
    else if (action === "left" && result.dropped) showToast(t("queue.leftOffline"));
    else if (result.dropped) showToast(t("queue.offlineNotSent"));
    else showToast(t(`queue.${action}Success`));
    if (action === "closed") QUEUES.refresh({ force: true });
  } catch (error) {
    showToast(queueError(error));
  } finally {
    pendingQueueActions.delete(pendingKey);
    if (source?.isConnected) {
      source.disabled = false;
      source.removeAttribute("aria-busy");
    }
    refreshQueueSurfaces();
    renderQueuePrompt(true);
    if (promptSource && $("#queue-prompt")?.hidden) {
      requestAnimationFrame(() => focusQueueFallback(queue));
    }
  }
}

function renderQueuePrompt(allowNew) {
  const prompt = $("#queue-prompt");
  const announcement = $("#queue-prompt-announcement");
  if (!prompt || !QUEUES?.visible()) {
    if (prompt) prompt.hidden = true;
    if (announcement) announcement.textContent = "";
    document.body.classList.remove("queue-prompt-open");
    return;
  }
  const previousKey = queuePromptKey;
  let session = queuePromptKey
    ? QUEUES.sessions().find((entry) => QUEUES.queueKey(entry.exhibitor, entry.game) === queuePromptKey)
    : null;
  if (!session && allowNew) {
    session = QUEUES.promptCandidate();
    queuePromptKey = session ? QUEUES.queueKey(session.exhibitor, session.game) : null;
  }
  const queue = session ? QUEUES.queue(session.exhibitor, session.game) : null;
  if (!session || !queue) {
    prompt.hidden = true;
    if (announcement) announcement.textContent = "";
    document.body.classList.remove("queue-prompt-open");
    return;
  }
  const minutes = Math.max(0, Math.floor(QUEUES.elapsed(session) / 60));
  const message = t("queue.prompt", { queue: queueName(queue), n: minutes });
  $("#queue-prompt-text").textContent = message;
  if (allowNew && queuePromptKey !== previousKey && announcement) {
    announcement.textContent = `${t("queue.promptTitle")} ${message}`;
  }
  const update = $("#queue-prompt-update");
  update.hidden = !QUEUES.canReport();
  for (const [id, action] of [
    ["#queue-prompt-update", "update"],
    ["#queue-prompt-entered", "entered"],
    ["#queue-prompt-left", "left"],
  ]) {
    const button = $(id);
    button.dataset.queueExhibitor = queue.exhibitor;
    button.dataset.queueGame = queue.game;
    button.setAttribute("aria-label", t(`queue.action.${action}Aria`, { queue: queueName(queue) }));
  }
  prompt.hidden = false;
  document.body.classList.add("queue-prompt-open");
}

function bindQueueControls() {
  if (!QUEUES || !$("#queue-dialog")) return;

  /* No debounce, unlike the exhibitor search: that one rebuilds the grid and
     both directory lists, this one rebuilds at most forty rows. */
  const search = $("#queues-search");
  search?.addEventListener("input", () => {
    queueQuery = search.value.trim();
    renderQueuesResults();
  });
  /* The scope chip is replaced on every render, so the listener lives on its
     container rather than the button. */
  $("#queues-scope")?.addEventListener("click", (event) => {
    if (!event.target.closest("#queues-scope-clear")) return;
    queueScopeEx = null;
    renderQueuesScope();
    renderQueuesResults();
    search?.focus();
  });

  const dialog = $("#queue-dialog");
  bindDialogDismiss(dialog, $("#close-queue"));
  dialog.addEventListener("close", () => {
    const invoker = queueDialogInvoker;
    const queue = queueDialogState?.queue;
    queueDialogState = null;
    queueDialogInvoker = null;
    if (invoker?.isConnected && !invoker.closest("[hidden]")) {
      invoker.focus({ preventScroll: true });
    }
    else if (queue) focusQueueFallback(queue);
  });
  $("#queue-dialog-done").addEventListener("click", () => dialog.close());
  $("#queue-dialog-flow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-queue-dialog-action]");
    if (button) submitQueueDialog(button.dataset.queueDialogAction, button.dataset.value);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-queue-action]");
    if (!button || button.closest("#queue-prompt")) return;
    runQueueAction(queueFromElement(button), button.dataset.queueAction, button);
  });
  for (const [id, action] of [
    ["#queue-prompt-update", "update"],
    ["#queue-prompt-entered", "entered"],
    ["#queue-prompt-left", "left"],
  ]) {
    $(id).addEventListener("click", (event) => runQueueAction(queueFromElement(event.currentTarget), action, event.currentTarget));
  }
  window.addEventListener("gcqueueschange", (event) => {
    if (event.detail?.reason === "tick") {
      if (`${QUEUES.visible()}:${QUEUES.canReport()}` !== queueSurfaceGate) refreshQueueSurfaces();
      updateQueueTimes();
      renderQueuePrompt(false);
      offerMove();
      return;
    }
    refreshQueueSurfaces();
    updateQueueTimes();
    renderQueuePrompt(["start", "focus", "storage"].includes(event.detail?.reason));
    offerMove();
    if (event.detail?.reason === "replay" && event.detail.rejected?.length) {
      showToast(queueError(event.detail.rejected[0]));
    }
  });
  renderQueuePrompt(true);
}

/* ---------- misc ---------- */

const toast = $("#toast");
let activeToast = null;
const toastQueue = [];

function renderToast(notification) {
  activeToast = notification;
  $("#toast-text").textContent = notification.message;
  const btn = $("#toast-action");
  if (notification.actionLabel) {
    btn.textContent = notification.actionLabel;
    btn.hidden = false;
    btn.onclick = notification.onAction;
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  toast.hidden = false;
}

function queueToast(notification) {
  if (!notification.priority) {
    toastQueue.push(notification);
    return;
  }
  const before = toastQueue.findIndex((queued) => !queued.priority);
  toastQueue.splice(before === -1 ? toastQueue.length : before, 0, notification);
}

/* Import prompts are priority notifications because their payload has already
   been removed from the address bar. PWA and install messages queue behind
   them instead of destroying the only Add/Undo action. */
function showToast(message, actionLabel, onAction, options = {}) {
  if (!toast) return null;
  const notification = {
    message,
    actionLabel,
    onAction,
    onDismiss: options.onDismiss,
    priority: Boolean(options.priority),
  };
  if (toast.hidden || !activeToast || options.replace) {
    renderToast(notification);
  } else if (notification.priority && !activeToast.priority) {
    queueToast(activeToast);
    renderToast(notification);
  } else if (options.queue !== false) {
    queueToast(notification);
  } else {
    return null;
  }
  return notification;
}

function hideToast(notification) {
  if (!toast) return;
  if (notification && notification !== activeToast) {
    const queued = toastQueue.indexOf(notification);
    if (queued !== -1) toastQueue.splice(queued, 1);
    return;
  }
  const next = toastQueue.shift();
  if (next) renderToast(next);
  else {
    activeToast = null;
    toast.hidden = true;
  }
}

/* onDismiss fires for the ✕ alone, never for a programmatic hide: "the visitor
   waved this away" and "this toast is finished" are different facts, and only
   the first one is worth remembering. */
if (toast)
  $("#toast-dismiss").addEventListener("click", () => {
    const dismissed = activeToast;
    hideToast();
    dismissed?.onDismiss?.();
  });
window.gcToast = { show: showToast, hide: hideToast };

function renderCountdown() {
  const start = new Date(state.event.startDate + "T10:00:00+02:00");
  const now = new Date();
  const days = Math.ceil((start - now) / 86400000);
  const el = $("#countdown");
  if (days >= 1) el.textContent = t("countdown.days", { n: days });
  else if (now < new Date(state.event.endDate + "T20:00:00+02:00"))
    el.textContent = t("countdown.live");
  else el.textContent = t("countdown.over");
}

function renderFreshness() {
  const m = state.meta;
  $("#data-freshness").textContent =
    t("meta.freshness", { date: formatDate(m.lastUpdated), rev: m.revision }) +
    (m.note ? ` ${m.note}` : "");
}

/* ---------- views ----------

   Routes are the four view names plus "saved" — the exhibitor list with the
   saved-only filter on. It's a route rather than only a checkbox so the
   installed app can put a launcher shortcut straight on your list, and so the
   filtered list can be linked and survives a reload. */

/* Every filter back to its default, controls included. Shared by the
   reset button and by focusExhibitor(), which has to be able to clear a
   filter that is hiding the card the visitor asked for. Callers do their
   own re-rendering — the two want different sets. */
function resetFilters() {
  Object.assign(state, {
    query: "",
    type: "all",
    hall: "all",
    age: "all",
    playableOnly: false,
    confirmedOnly: false,
    savedOnly: false,
    hidePlayed: false,
  });
  state.flipped.clear();
  $("#search").value = "";
  $("#playable-only").checked = false;
  $("#confirmed-only").checked = false;
  $("#saved-only").checked = false;
  $("#hide-played").checked = false;
  persistPrefs();
  renderMarkControls();
  renderFilters();
}

/* ---------- deferred view rendering ----------

   Boot used to render all four views in one synchronous block, and the page
   sat frozen — no scroll, no taps — until the whole thing finished. Only one
   view is visible, so only that one has to be ready before first paint; the
   other three are queued here and rendered either in idle time or the moment
   their tab is opened, whichever comes first.

   The thunks are plain state→DOM renders, so running one late — or running
   it redundantly after a state change already re-rendered that view — is
   only wasted work, never wrong output. One view per idle slot, so no single
   callback grows back into the block this exists to break up. */
const pendingViewRender = new Map();
let viewRenderPump = false;

function queueViewRender(view, render) {
  pendingViewRender.set(view, render);
  pumpViewRenders();
}

function flushViewRender(view) {
  const render = pendingViewRender.get(view);
  if (!render) return;
  pendingViewRender.delete(view);
  render();
}

function pumpViewRenders() {
  if (viewRenderPump || !pendingViewRender.size) return;
  viewRenderPump = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 80));
  idle(() => {
    viewRenderPump = false;
    const next = pendingViewRender.keys().next();
    if (!next.done) flushViewRender(next.value);
    pumpViewRenders();
  });
}

const SAVED_ROUTE = "saved";

const routeFor = (view) => (view === "exhibitors" && state.savedOnly ? SAVED_ROUTE : view);

function syncHash() {
  const target = routeFor(state.view);
  if (location.hash.slice(1) !== target) history.replaceState(null, "", `#${target}`);
}

/* The hall map links back as #exhibitors?ex=<id> — a booth you tapped on
   the map should land on its own card, not at the top of the grid. The
   param is consumed like a share payload (syncHash drops it moments
   later anyway), and any filter hiding the card is cleared first: you
   asked for this booth by name, so a stale "saved only" must not answer
   with an empty grid. */
function focusExhibitor(id) {
  const ex = id && state.exhibitors.find((e) => e.id === id);
  if (!ex) return;
  /* A business booth tapped on the map deep-links to its own face's id, so
     land on the paired card already turned to that side rather than on its
     consumer booth in a different hall. Set after resetFilters(), which
     clears hand-flipped cards along with the filters they were following. */
  const find = () => $(`#exhibitor-grid .card[data-id="${CSS.escape(ex.id)}"]`);
  const turn = () => {
    if (ex.businessOf) state.flipped.set(ex.businessOf, true);
  };
  turn();
  if (!find()) {
    resetFilters();
    turn();
    renderExhibitors();
  }
  const card = find();
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "auto" });
  card.classList.add("card-landed");
  card.addEventListener("animationend", () => card.classList.remove("card-landed"), { once: true });
}

function setSavedOnly(on) {
  if (state.savedOnly === on) return;
  state.savedOnly = on;
  $("#saved-only").checked = on;
  renderExhibitors();
}

function setHidePlayed(on) {
  state.hidePlayed = on;
  $("#hide-played").checked = on;
  $("#priority-hide-played").checked = on;
  /* The lens is a preference, not a mark — persistMarks here would rewrite the
     unchanged played sets and lose the toggle on the next reload. */
  persistPrefs();
  renderExhibitors();
  renderPriority();
  renderPlan();
}

function showView(route, { push = true } = {}) {
  const wantsSaved = route === SAVED_ROUTE;
  let name = wantsSaved ? "exhibitors" : route;
  if (!VIEWS.includes(name)) name = VIEWS[0];
  state.view = name;
  /* A view whose boot render is still queued gets it now — opening the tab
     outruns the idle slot it was waiting for. */
  flushViewRender(name);
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
  /* Unlike the other four, this view is a snapshot of live state rather than
     of the dataset: sessions opened and figures arrived while it was hidden,
     and flushViewRender() only ever fires once. */
  if (name === "queues") renderQueues();
  if (push) syncHash();
}

function bindControls() {
  /* One render per pause, not per keystroke: the grid plus both directory
     lists is too much DOM to rebuild at typing speed on a phone. The value is
     read when the timer fires, so a reset that clears the box mid-wait is
     seen, not raced. */
  let searchTimer = 0;
  const search = $("#search");
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = search.value.trim();
      if (query === state.query) return;
      state.query = query;
      renderExhibitors();
    }, 120);
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
  $("#hide-played").addEventListener("change", (e) => {
    setHidePlayed(e.target.checked);
  });
  $("#priority-saved-only").addEventListener("change", (e) => {
    state.prioritySavedOnly = e.target.checked;
    renderPriority();
  });
  $("#priority-hide-played").addEventListener("change", (e) => {
    setHidePlayed(e.target.checked);
  });
  /* Optional-chained like the other #plan-* lookups: absent on a stale
     cached shell — see the note in renderPlan. */
  $("#goto-plan")?.addEventListener("click", () => {
    showView("planner");
    $("#plan-section").scrollIntoView();
    $("#plan-title").focus({ preventScroll: true });
  });
  /* The lens chips are static markup, so a click never re-renders them out
     from under the pointer — only the board below swaps. */
  $$("#plan-lens .lens-chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      if (state.planLens === chip.dataset.lens) return;
      state.planLens = chip.dataset.lens;
      persistPrefs();
      renderPlan();
    })
  );
  $("#clear-saved").addEventListener("click", () => {
    const n = savedCount();
    if (!confirm(t("confirm.clearSaved", { n }))) return;
    state.marks.saved = { exhibitors: new Set(), games: new Set() };
    state.itinerary = { exhibitors: new Map(), games: new Map() };
    persistMarks("saved");
    persistItinerary();
    onMarksChanged({ rebuild: true });
  });
  $("#clear-played").addEventListener("click", () => {
    const n = playedCount();
    if (!confirm(t("confirm.clearPlayed", { n }))) return;
    state.marks.played = { exhibitors: new Set(), games: new Set() };
    persistMarks("played");
    onMarksChanged({ rebuild: true });
  });
  $("#export-ics").addEventListener("click", downloadICS);
  bindShareDialog();
  bindSiteShare();
  bindSourcesDialog();
  bindQueueControls();
  /* One delegated listener covers every +, ✓, day and sources button in every
     view, including the ones that get re-rendered underneath it. */
  document.addEventListener("click", (e) => {
    /* Turning a card over. Keyed on the owner's id from either side, so the
       two plates are the same switch pointing opposite ways. */
    const face = e.target.closest("[data-face]");
    if (face) {
      const owner = face.dataset.face;
      state.flipped.set(owner, face.dataset.faceTo === "trade");
      renderExhibitors();
      /* Land on the plate that just became small — the way back — rather than
         dropping focus to the top of the page. */
      $(`#exhibitor-grid [data-face="${CSS.escape(owner)}"]`)?.focus();
      return;
    }
    const day = e.target.closest("[data-it-day]");
    if (day) {
      assignToDay(day.dataset.itKind, day.dataset.itKey, day.dataset.itDay);
      return;
    }
    const src = e.target.closest("[data-src-kind]");
    if (src) {
      openSources(src.dataset.srcKind, src.dataset.srcKey);
      return;
    }
    const btn = e.target.closest("[data-mark]");
    if (btn) toggleMark(btn.dataset.mark, btn.dataset.bmKind, btn.dataset.bmKey);
  });
  /* Same marks, second tab: keep them from overwriting each other. */
  window.addEventListener("storage", (e) => {
    const watched = [...Object.values(MARK_KEYS), IT_KEY, PREFS_KEY];
    if (e.key !== null && !watched.includes(e.key)) return;
    if (e.key === null || e.key === MARK_KEYS.saved) state.marks.saved = loadMarks("saved");
    if (e.key === null || e.key === MARK_KEYS.played) state.marks.played = loadMarks("played");
    if (e.key === null || e.key === IT_KEY) state.itinerary = loadItinerary();
    if (e.key === null || e.key === PREFS_KEY) {
      Object.assign(state, loadPrefs());
      /* The <details> holds its own open state, so a pref that arrived from
         another tab has to be pushed back onto the element. */
      const directory = $("#directory");
      if (directory && directory.open !== state.showDirectory) directory.open = state.showDirectory;
      if (state.showDirectory) loadDirectory();
      const trade = $("#trade");
      if (trade && trade.open !== state.showTrade) trade.open = state.showTrade;
      if (state.trade) loadDirectory();
    }
    /* A trade booth saved in the other tab needs its data here before the
       plan can show it — the same never-vanish rule as at boot. */
    if (hasSavedTrade()) loadDirectory();
    pruneItinerary();
    renderFilters();
    renderExhibitors();
    renderMarkControls();
    renderPriority();
    renderWristband();
    renderPlan();
    if (state.event) renderEvent(); // its badge block is a switch, not just copy
  });

  $("#reset-filters").addEventListener("click", () => {
    resetFilters();
    renderExhibitors();
    renderPriority();
    /* Resetting hide-played changes which plan stops are on screen too —
       skipping this re-render left the hall view stale before the merge. */
    renderPlan();
    syncHash();
  });

  /* Desktop has room to keep the filters open; a phone does not. */
  $("#toolbar-more").open = window.matchMedia("(min-width: 760px)").matches;

  const directory = $("#directory");
  if (directory) {
    directory.open = state.showDirectory;
    if (state.showDirectory) loadDirectory();
    directory.addEventListener("toggle", () => {
      state.showDirectory = directory.open;
      persistPrefs();
      if (directory.open) loadDirectory();
      renderDirectory();
    });
  }

  const trade = $("#trade");
  if (trade) {
    trade.open = state.showTrade;
    /* Opening the section does not turn the feature on — it shows the pitch.
       Only the button does, which is why the fetch hangs off state.trade. */
    if (state.trade) loadDirectory();
    trade.addEventListener("toggle", () => {
      state.showTrade = trade.open;
      persistPrefs();
      if (trade.open && state.trade) loadDirectory();
      renderTrade();
    });
    $("#trade-enable")?.addEventListener("click", () => setTrade(true));
    /* The chip row is rebuilt by its own render, so this is delegated the way
       the mark buttons are rather than re-bound per chip. */
    $("#trade-cat-filters")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-trade-cat]");
      if (!chip) return;
      state.tradeCat = chip.dataset.tradeCat;
      renderTrade();
      $(`#trade-cat-filters [data-trade-cat="${CSS.escape(state.tradeCat)}"]`)?.focus();
    });
  }

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(routeFor(tab.dataset.view))));
  /* push:true here so an unknown or now-stale hash gets rewritten to the route
     actually on screen rather than being left lying in the address bar. */
  window.addEventListener("hashchange", () => {
    const incoming = takeIncomingList();
    const landing = parseHash();
    showView(incoming ? SAVED_ROUTE : landing.route);
    if (incoming) offerIncomingWhenReady(incoming);
    /* `?ex=` means "this booth" on both views, and each reads it its own way:
       the grid scrolls to the card, the queues view narrows to its lines. */
    else if (landing.route === "queues") applyQueueScope(landing.params.get("ex"));
    else focusExhibitor(landing.params.get("ex"));
  });
}

async function main() {
  /* Marks and prefs live in localStorage — no reason to wait for the network
     before reading them. Doing it first is what lets the directory download
     below share the wire with the core data instead of queueing behind it. */
  state.marks.saved = loadMarks("saved");
  state.marks.played = loadMarks("played");
  state.itinerary = loadItinerary();
  Object.assign(state, loadPrefs());
  /* Rule 1: the pref gates discovery, not resolution. A trade booth already
     on the list resolves whether or not trade mode is on. */
  if (state.trade || hasSavedTrade()) loadDirectory();
  try {
    await loadData();
  } catch (err) {
    $("#exhibitor-grid").innerHTML = `<p class="empty">${esc(
      t("boot.loadFailed", { error: err.message })
    )} <code>python3 -m http.server</code></p>`;
    return;
  }
  QUEUES?.configure({ event: state.event, exhibitors: state.exhibitors });
  /* After the itinerary, so a day assignment stored under the old key is
     still there to be carried across — and after loadData, which brings the
     cards those keys migrate onto. */
  migrateDirAliases();
  const incoming = takeIncomingList();
  /* Only a link in the address bar moves the visitor to their list; a leftover
     offer is repeated where they already were. */
  const offer = incoming || pendingIncomingList();
  $("#event-dates").textContent = `${state.event.location} · ${state.event.dates}`;
  bindControls();
  renderCountdown();
  renderFreshness();
  renderMarkControls();
  renderFilters();
  /* Only the landing view renders before first paint; the rest go through
     the idle queue (see queueViewRender). A #saved landing sets the filter
     before that first render so the grid is not built twice. */
  const landing = parseHash();
  const route = incoming ? SAVED_ROUTE : landing.route || VIEWS[0];
  if (route === SAVED_ROUTE && !state.savedOnly) {
    state.savedOnly = true;
    $("#saved-only").checked = true;
  }
  const bootRender = {
    exhibitors: renderExhibitors,
    planner: renderPlanner,
    event: renderEvent,
    updates: renderChangelog,
    queues: renderQueues,
  };
  const landingView = route === SAVED_ROUTE ? "exhibitors" : route;
  const first = VIEWS.includes(landingView) ? landingView : VIEWS[0];
  bootRender[first]();
  for (const view of VIEWS) if (view !== first) queueViewRender(view, bootRender[view]);
  showView(route, { push: false });
  syncQueueTab();
  /* Live data is deliberately last and unawaited: the static guide has
     already rendered, so a dead hall connection can never hold first paint. */
  QUEUES?.start();
  if (!incoming) {
    if (route === "queues") applyQueueScope(landing.params.get("ex"));
    else focusExhibitor(landing.params.get("ex"));
  }
  if (offer) offerIncomingWhenReady(offer);
  /* Last, so an import prompt is the thing on screen when both apply — that one
     is priority anyway, and it carries the only Add/Undo the visitor gets. */
  offerMove();
}

main();
