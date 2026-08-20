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
  /* card id → which face is showing, set by tapping a plate. Holds only the
     cards somebody has turned over; everything else follows the filters.
     Cleared when a filter changes — see faceOf(). */
  flipped: new Map(),
  /* replaced from localStorage in main() — see loadMarks() */
  marks: {
    saved: { exhibitors: new Set(), games: new Set() },
    played: { exhibitors: new Set(), games: new Set() },
  },
  /* item-key → ISO day date; replaced from localStorage in main() */
  itinerary: { exhibitors: new Map(), games: new Map() },
  /* the order you put the plan in — stop keys, first to last. Empty until
     something is moved, which is what "no opinion yet, sort it automatically"
     looks like. See "the plan's order" below. */
  planOrder: [],
  /* the same list read the other way, stop key → position. Derived, never
     stored: always written through setPlanOrder(). */
  planRanks: new Map(),
  /* which arrangement of the plan board is on screen; persisted in prefs */
  planLens: "day",
  /* hall-lens day filter: "all", an ISO day date, or "none" (unassigned) */
  planDay: "all",
  /* hall ids the hall map can draw; filled from data/hallplan/index.json */
  mapHalls: new Set(),
  /* hall id -> official area key ("entertainment" | "business"), from the same
     file. Sets the colour of a card's hall plate — see hallArea. */
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

/* What a business booth is when you walk up to it — the question a queue
   index answers for a consumer booth. The business halls hold two very
   different things under one colour: open stands staffed for walk-up
   conversation, and closed rooms that are meeting spaces with a logo outside.
   Which one you face decides whether turning up is worth anything, so it is
   stated per card and never guessed.

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

const VIEWS = ["exhibitors", "planner", "event", "updates"];

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
   render site keeps reading ex.description / ev.tickets / d.note exactly as
   before the split — the language never leaks past this point. Keys:
   exhibitors by id, their game notes by title (titles are untranslated proper
   nouns, and the same identity marks and share links use), days by ISO date,
   areas by official name. Missing keys mean empty prose, never a crash. */
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
   rather than by booth. Eight titles this year show at two booths at once
   (Alien: Isolation 2 sits at both Xbox and SEGA), so a game mark applies at
   every booth showing that title. */

/* The storage shapes, the saved-game rule and the plan's stop order live in
   js/marks.js, because the hall map reads and writes the same two lists and
   draws the same plan on the floor. Everything below still calls
   loadMarks/persistMarks/gameKey by their old names. */
const { MARK_KEYS, PREFS_KEY, IT_KEY, ORDER_KEY, gameKey } = GCMarks;

const loadMarks = (mark) => GCMarks.readMarks(mark);
const persistMarks = (mark) => GCMarks.writeMarks(mark, state.marks[mark]);

/* Both view preferences live here rather than beside the marks they act on:
   "hide played" is a lens on the list, the same kind of thing as the age
   filter, and neither works well tangled up with the marks themselves. */
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

/* A booth is done when marked directly, or when every game saved there is
   done. An unsaved booth with some incidentally played games does not count —
   which is why this reads off savedGames() and there is deliberately no
   playedGames() mirroring it. Saving is what scopes a booth to you; only then
   can playing everything finish it. */
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

/* The "+" adds to the list and the "−" takes it back off — same language as
   the "+ 4 more" / "− Show fewer" control, so no icon is needed. The filled
   plate carries the saved state, not the glyph. Played always uses a check,
   with a muted filled plate. */
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
  if (mark === "saved") prunePlan();
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

/* Putting focus back must not move the page under the visitor.

   focus() scrolls its element into view, and every element these renders hand
   it is one innerHTML older than a second: the browser has no memory of where
   it used to sit, so rather than leaving a control that is already on screen
   alone it scrolls the thing to the middle of the viewport. That is where the
   plan's jumps came from — assigning a stop to a day flung the board about
   1500px, a played tick on the queue table about 1800px, and every reorder
   crept the page by a row. The visitor pressed a button they could see; the
   page has to still be where they left it when the press is over.

   Keyboard users are the exception, and the reason this is not simply
   preventScroll everywhere: focus they cannot see is worse than a scroll. When
   the browser says the focus ring is showing (:focus-visible is exactly the
   "was this a keyboard interaction" question, asked of the engine rather than
   guessed at here) a control that landed off screen is brought back with the
   smallest scroll that reveals it. */
const canAskFocusVisible = (() => {
  try {
    document.documentElement.matches(":focus-visible");
    return true;
  } catch {
    return false; // pre-2022 engine — no ring to keep in view either
  }
})();

function restoreFocus(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (!canAskFocusVisible || !el.matches(":focus-visible")) return;
  const box = el.getBoundingClientRect();
  const fold = window.innerHeight || document.documentElement.clientHeight;
  if (box.bottom <= 0 || box.top >= fold) el.scrollIntoView({ block: "nearest" });
}

/* Re-rendering a list with innerHTML destroys the button that was just
   pressed, dropping keyboard focus back to the top of the page. Put it back on
   the equivalent button whenever one survives the re-render. When the whole row
   is gone instead (unsaving in a saved-only list removes it), land on the
   nearest remaining button — or the caller's fallback element — so keyboard
   users stay in context rather than dropping to <body>. */
function keepingFocus(container, render, fallback) {
  const el = document.activeElement;
  const inside = el && container.contains(el);
  const sel = !inside
    ? null
    : el.dataset.moveDir
      ? `.mv[data-move-key="${CSS.escape(el.dataset.moveKey)}"][data-move-dir="${CSS.escape(el.dataset.moveDir)}"]`
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
  /* An arrow that has just carried its stop to the end of its group comes
     back disabled, and focus() on a disabled button goes nowhere — land on
     the one still pointing back the way it came. */
  if (again?.disabled) {
    const partner = [...again.parentElement.children].find((sib) => sib !== again && !sib.disabled);
    if (partner) return restoreFocus(partner);
  } else if (again) return restoreFocus(again);
  if (index < 0) return;
  const buttons = [...container.querySelectorAll(".bm")];
  restoreFocus(buttons[Math.min(index, buttons.length - 1)] || fallback);
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
   and are still in circulation. v2 writes every item, exhibitor or game alike,
   as a fixed-width 5-char base36 hash prefix: fixed width needs no separators,
   and an id like tencent-worlds-of-play stops costing 22 characters. That is
   what fits a 30-item list back into the QR code, which v1 outgrew as the data
   doubled. */

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
     prefix claimed twice is dropped for every claimant — never emitted, never
     resolved — so a token can be lost but never mistranslated, and the loss
     shows up in the "no longer in the guide" counts the UI already displays.
     None of the current 217 items collide; there is head-room to about a
     thousand before 5 characters needs revisiting. */
  const claims = new Map();
  const claim = (kind, key) => {
    const tok = tok36(key);
    if (!claims.has(tok)) claims.set(tok, []);
    claims.get(tok).push({ kind, key });
  };
  state.exhibitors.forEach((ex) => claim("exhibitors", ex.id));
  gameKeys.forEach((key) => claim("games", key));
  /* Trade booths ride the same namespace rather than a parameter of their
     own: the day plan is positional over this one token list, so a second list
     could not carry day assignments without duplicating that machinery. Every
     "dir:" key claimable in the guide is claimed here, including rows a curated
     card has since taken over — an older link naming one still has to land, and
     migrateDirAliases folds it onto the card afterwards.

     Adding ~800 identities to ~220 is what the 5-character headroom note below
     was about, so tools/fetch-directory.py re-checks it at generation time.
     Only a directory that has actually loaded is in here, so a visitor who
     never turns trade mode on shares exactly what they always did. */
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

   Three hosts are draining. gamescom.guide went because "gamescom" is a
   registered mark of game — Verband der deutschen Games-Branche e.V., which
   licenses it to exhibitors and has had unofficial sites warned off carrying
   it in a domain name. gc26.guide went because it was an abbreviation with a
   year in it: fine to type, useless to say across a queue. hallgui.de is the
   one that stays.

   All three stay on this list because people are standing on them, and a saved
   list cannot cross an origin by itself. Only these are rewritten; hallgui.de
   and localhost share themselves.

   The head of index.html and map.html carries the same three names, for the
   redirect that runs before this file is fetched. A copy rather than an import
   because nothing loaded as a file can run that early — the same trade the
   language stamp makes with SUPPORTED in js/i18n.js. */
const LEGACY_HOSTS = ["gc2026.inventivetalent.org", "gamescom.guide", "gc26.guide"];
const SHARE_ORIGIN = "https://hallgui.de";

function onLegacyHost() {
  return LEGACY_HOSTS.includes(location.host);
}

/* One character per day: the base36 day of month. Absolute like a literal
   date — an index into event.days would mean something else the moment a day
   is added — at a twentieth of the cost of "token~2026-08-26". Null when two
   show days would share a character (a show spanning a month boundary into the
   same day-of-month); then the day plan simply does not ride. */
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
   reach ride as explicit tokens. Usually empty, and free when it is. */
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
   own plan following them to an address that will outlive the old one, the
   exact case the played and day toggles default off for. The legacy-origin
   rewrite in buildShareLink aims it at hallgui.de.

   The payload lives in the hash, so none of it is ever sent to a server — the
   same reason a shared list can be built offline.

   Null when there is nothing saved to carry, and the notice just navigates.
   Played marks and day assignments both hang off saved items, so an empty
   saved list means an empty move; that is also the rule the Share control uses
   to decide it has nothing to offer. */
function buildMoveLink() {
  if (!encodeEntries().length) return null;
  return buildShareLink({ move: true, days: true, played: true });
}

/* Nothing on the old hostname looks broken — it serves the same deploy — so a
   visitor can spend the whole show on an address that is going away without
   noticing. Hence one nudge, and only one: the answer is remembered either
   way, because a banner that returns on every load is one people learn to
   ignore.

   It is deliberately not a redirect. Someone mid-plan on a show floor should
   not have the page pulled out from under them, and everything the guide holds
   is per-origin: accepting is what carries it (buildMoveLink above), ignoring
   leaves it here.

   By the time this runs, the only people it can reach are the ones that
   argument is about. The head of index.html has already sent on anyone whose
   localStorage was completely empty — nothing per-origin to strand, so nothing
   to weigh — which leaves this notice to everybody who has something here,
   installed the app, or was asked once already and stayed.

   The key carries the destination's generation rather than the notice's, and
   this is the third. Answering does not settle anyone permanently — it moves
   them to whatever the answer pointed at, which twice has become a host that is
   itself draining. Anyone still carrying a v1 or v2 answer is somewhere on that
   chain, and the remembered answer is what would otherwise keep them from
   hearing about hallgui.de. So: one more nudge each time the address changes,
   then quiet again. */
const MOVED_KEY = "gc2026.moved.v3";

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
  if (!onLegacyHost() || moveNoticeAnswered()) return;
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
   here — an import landing on a device already in use has to be reversible
   whichever mode it applied in.

   Merge unions and never removes: a friend's link is an offer, not an
   authority over what you already chose. Replace assigns: a move is the same
   person's newer state, and replacing is the only way a removal or a
   rescheduled day travels between their devices. Parts that did not ride are
   left alone in both modes — absent means "not moved", not "none". */
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
    /* A replacing import drops the positions of everything it removes, and a
       hand-arranged plan is too much work to lose to an undone import. */
    planOrder: [...state.planOrder],
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
    prunePlan();
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
       loadItinerary/prunePlan while the item it points at is saved.
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
  setPlanOrder([...snapshot.planOrder]);
  persistPlanOrder();
  /* Undo can take away items the visitor already placed on a day, or
     arranged — prunePlan scopes both stores back to the restored list. */
  prunePlan();
  renderBookmarkViews();
  showToast(snapshot.moved ? t("toast.moveUndone") : t("toast.importUndone"), null, null, {
    priority: true,
    replace: true,
  });
}

/* A link can name trade booths the guide has not fetched yet — the recipient
   may never have turned trade mode on, which is exactly the case the pref must
   not break. So unresolved tokens are a reason to go and look before saying
   "out of date": load the directory, rebuild the vocabulary, and re-read the
   payload (still in sessionStorage) before making the offer. Offline with a
   cold cache falls through to the old behaviour, which counts them as no
   longer in the guide. */
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

  /* A move landing where a list already lives offers replace, not merge — it
     is the only path on which a removal or a moved day travels, and a union
     here would resurrect on this device exactly what was deleted on the other
     one. It is destructive in a way nothing else in the guide is, so the toast
     counts what goes before anything is touched, and the count names only
     items the visitor can see — entries the guide no longer recognises are
     invisible to them and would make the number a lie. */
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
   is nothing to choose. The sheet is just the address twice — once as a code
   to hold up to somebody else's phone, once as text to paste. */

/* The address to hand out is not the one in the address bar. That one can
   carry a shared-list hash, a ?lang the recipient should resolve themselves,
   campaign params, /index.html spelled out, or the hostname the guide is
   leaving — and a QR code outlives all of those. Each page states where it
   lives in its canonical tag, so that is what gets shared; the origin rule
   behind it is buildShareLink's. */
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

   Every entry in data/*.json records the pages it was built from. An
   unofficial guide that asks you to plan a day around a booth number owes you
   the ability to check it, so each card carries a quiet marker that opens its
   list — and the cards most worth checking are the ones whose hall plate says
   "unconf.". */

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

/* Callers must have state.event loaded: the stored dates are checked against
   the show schedule, and "no schedule" is not the same answer as "no such
   day". Without that distinction a call made before data/event.json lands
   reads every assignment as stale and drops the whole plan — and the next
   assignment writes that emptied map back over the stored one, so the loss
   outlives the session. A missing schedule therefore keeps the assignments as
   filed and lets the next load, which has the days, decide. */
function loadItinerary() {
  /* The parse and the storage shape live in js/marks.js since the map's
     sheet started reading the same key; what is validated on top of them is
     the guide's alone, because it is the page holding data/event.json and
     the map never writes an assignment, so it can never prune one. */
  const raw = GCMarks.readItinerary();
  const days = state.event?.days;
  const validDays = days ? new Set(days.map((d) => d.date)) : null;
  const keep = (kind) =>
    new Map(
      [...raw[kind]].filter(
        ([key, date]) => state.marks.saved[kind].has(key) && (!validDays || validDays.has(date))
      )
    );
  return { exhibitors: keep("exhibitors"), games: keep("games") };
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

/* Both stores are scoped by the saved list: an assignment or a position for
   something you no longer have saved is not a fact about your plan, and
   keeping it would quietly resurrect on a re-save. Called wherever the saved
   list shrinks. */
function prunePlan() {
  let changed = false;
  for (const kind of ["exhibitors", "games"]) {
    for (const key of state.itinerary[kind].keys()) {
      if (state.marks.saved[kind].has(key)) continue;
      state.itinerary[kind].delete(key);
      changed = true;
    }
  }
  if (changed) persistItinerary();

  const live = livePlanKeys();
  const kept = state.planOrder.filter((key) => live.has(key));
  if (kept.length === state.planOrder.length) return;
  setPlanOrder(kept);
  persistPlanOrder();
}

function onItineraryChanged() {
  /* An assignment feeds both lenses (day groups here, day tags and the day
     filter on the hall view), so the whole plan section re-renders. */
  renderPlan();
}

/* ---------- the plan's order, stored ----------

   Which stop comes first inside a day, or inside a hall. The automatic
   answer — busiest queue first, played stops last — is what the plan opens
   with; this is the override, written the first time somebody moves a row.
   Both lenses read it, and so does the hall map, which numbers the same
   stops on the floor: the storage shape, the key spelling and the comparator
   all live in js/marks.js for that reason.

   Read at boot with no validation against the show days, unlike the
   itinerary: a position is not a claim about the schedule, so nothing here
   can go stale when data/event.json changes. It is scoped by the saved list
   instead (prunePlan above), the way the itinerary is. */

const loadPlanOrder = () => GCMarks.readOrder();
const persistPlanOrder = () => GCMarks.writeOrder(state.planOrder);

/* One writer, because the Map is the list: setting one without the other is
   the bug this exists to make impossible. */
function setPlanOrder(keys) {
  state.planOrder = keys;
  state.planRanks = GCMarks.orderRanks(keys);
}

/* Where a stop sits, or UNRANKED for one nobody has placed — which sorts it
   to the end of its group, under the automatic rule, next to the others
   nobody has placed. */
const planRank = (kind, key) =>
  state.planRanks.get(GCMarks.stopKey(kind, key)) ?? GCMarks.UNRANKED;
const exPlanRank = (ex) => planRank("exhibitor", ex.id);

/* ---------- filtering & sorting ---------- */

/* Shared orderings. Crowd-desc is the house default wherever booths rank.
   Hall order approximates a sensible walk through the entertainment halls:
   decimal halls are upper levels, so parseFloat keeps 6.1 after 6 and before
   7, and missing halls sort last. If verified venue routing ever lands,
   hallRank is the single seam to replace with an explicit order — the grid's
   hall sort, the planner's route and the wristband list all read through it. */
const byName = (a, b) => a.localeCompare(b, GCI18N.lang);
const byCrowdDesc = (a, b) => (b.crowd || 0) - (a.crowd || 0) || byName(a.name, b.name);
const hallRank = (hall) => (hall ? parseFloat(hall) : Infinity);

/* "Hide 18+" is a browsing filter — "don't show me demos I can't play" — and
   deliberately not a content filter. It hides lineup rows, not prose. An
   earlier pass regex-scrubbed adult titles out of the searchable description,
   which made the grid render a name it would then refuse to find, and it could
   never be complete anyway (visitAdvice says "hit MW4 or 007 First Light
   first", and Plaion carries an "18+" tag). A leaky content filter reads as a
   guarantee it cannot keep, so descriptions stay exactly as written and stay
   searchable. */
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
   everything a card needs: its own location, description, offers, sources and
   saved state. Keeping them the same shape means a business-only booth like
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

   The snapshot is the source, because it is what the map colours halls from.
   When it is missing, the guide's own business-hall boundary answers instead,
   so a cold cache repaints the plates rather than dropping the distinction. A
   hall neither can place — an offsite venue, a hall we've never heard of —
   returns "" and its plate keeps the signal colour. */
const hallArea = (hall) => {
  if (!hall) return "";
  const filed = state.hallAreas.get(String(hall));
  if (filed) return filed;
  if (isBusinessHall(hall)) return "business";
  const level = parseFloat(hall);
  return level >= 5 && level < 11 ? "entertainment" : "";
};

/* `day` is the plan board's day filter riding along: the map draws that day's
   stops as a numbered route, so a hall opened from a filtered plan opens with
   the same day already on. Left off everywhere else — an unfiltered link must
   not decide a day for the map. */
const mapLink = (hall, booth, day) =>
  `map.html${day && day !== "all" ? `?day=${encodeURIComponent(day)}` : ""}` +
  `#${encodeURIComponent(hall)}` +
  (booth ? `/${encodeURIComponent([...GCMarks.boothCodes(booth)][0] || "")}` : "");

/* Every other place a hall is named — the planner rows, the directory — is
   also a way to that hall on the map. One helper so all of them behave the
   same: plain text when the snapshot can't draw that hall, a link that says
   out loud where it goes when it can. The visible label is left exactly as the
   row wrote it; only the destination is added. */
/* One phrasing of "Hall 7.1, booth A061" for every accessible name that
   needs it — the card plate, the planner rows, the directory chips. */
const whereLabel = (hall, booth) =>
  booth ? t("where.hallBooth", { hall, booth }) : t("where.hall", { hall });

function hallLink(hall, booth, label, day) {
  if (!hasMap(hall)) return esc(label);
  return `<a class="hall-link" href="${esc(mapLink(hall, booth, day))}"
    title="${esc(t("map.openTitle"))}"
    aria-label="${esc(t("map.openAria", { where: whereLabel(hall, booth) }))}">${esc(label)}</a>`;
}

/* The Halls & areas list names a span where every other place names a hall:
   one hall ("10.1"), a whole level whose halves it doesn't distinguish ("5"),
   or a run of levels ("5–10"). The map draws one hall at a time, so a span
   opens at the lowest hall inside it the snapshot can draw — "5–10" lands in
   the first entertainment hall, "2–4" in the first business one — and the
   map's own chip row, grouped by area, carries you along the rest.

   Only whole levels widen like that. "11.1" is a hall the snapshot either has
   or hasn't, and quietly landing on 10.2 instead would be a different room, so
   it stays plain text. So does anything unparseable. */
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
   of the card because that corner is where your thumb already is, and the one
   place the swap reads as an exchange rather than a jump.

   The colour is not decoration: the square is the other face's plate in
   miniature, painted in the colour Koelnmesse gives that hall on its own plan
   — purple across to the business halls, cyan back to the entertainment ones,
   the same fills the map uses. Turning the card over teaches what a plate's
   colour means in one gesture.

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

function gameRow(g) {
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
  const tail = isOpen ? [] : games.slice(4).filter((g) => isSaved("game", gameKey(g.title)));
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
              <ul class="games">${shown.map(gameRow).join("")}</ul>
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
      restoreFocus($(`#age-filters [data-age="${CSS.escape(age)}"]`));
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
   trade exhibitors. A shared stand is a national or regional pavilion — twenty
   desks under one roof — and a large stand with one occupant and no
   co-exhibitors is a publisher's meeting building.

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

/* Turning it on is also the first fetch, which warms the offline cache — the
   same one-online-load contract the directory already states.

   `announce` is set by the two remote controls (the toolbar chips and the
   Event info block), where the thing that just changed is off screen. The
   button inside the section itself leaves it off: you are standing in the
   result. */
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
   the two renderings of a day can never drift apart. The plan's headers pass
   note:false — they repeat the advice paragraph a plan spanning five days
   would otherwise carry five times, one scroll above where it already reads
   in full. The facts you act on (day, access, hours) stay. */
function dayHeaderInner(d, { note = true } = {}) {
  const [, month, day] = d.date.split("-");
  return `<span class="day-when">
      <span class="day-dow">${esc(shortDay(d.date))}</span>
      <span class="day-date">${esc(day)}.${esc(month)}</span>
    </span>
    <span class="day-access ${isTradeDay(d) ? "trade" : "public"}">${esc(d.access)}</span>
    <span class="day-detail">
      ${d.hours ? `<span class="day-hours">${esc(d.hours)}</span>` : ""}
      ${note && d.note ? `<span class="day-note">${esc(d.note)}</span>` : ""}
    </span>`;
}

/* Weekday names are derived from the date in the active language rather
   than hand-written per locale — see GCI18N.dayName. The short form is
   what the day chips and tags wear. */
const dayName = (date) => GCI18N.dayName(date);
const shortDay = (date) => GCI18N.dayName(date, "short");

/* `crowd` is filled in below rather than looked up per read: it is what both
   the queue cell and the automatic order are built from, and GCMarks'
   comparator reads a plain `.crowd` off whatever it is handed — the same
   property an exhibitor already carries, so one comparator serves the day
   lens, the hall lens and the map. */
function itineraryItems() {
  const exhibitors = [...state.marks.saved.exhibitors]
    .map((key) => {
      const ex = resolveSavedExhibitor(key);
      return ex ? { kind: "exhibitor", key, name: ex.name, ex, crowd: ex.crowd || 0 } : null;
    })
    .filter(Boolean);

  const games = [...state.marks.saved.games].map((key) => {
    const at = state.exhibitors.filter((ex) =>
      (ex.games || []).some((g) => gameKey(g.title) === key)
    );
    const name = at.length ? at[0].games.find((g) => gameKey(g.title) === key).title : key;
    /* A game shown at two booths takes the worse queue of the two: that is
       the one you will actually stand in if you want to play it. */
    return { kind: "game", key, name, at, crowd: Math.max(0, ...at.map((ex) => ex.crowd || 0)) };
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

const itineraryPlayed = (item) =>
  item.kind === "exhibitor" ? hasPlayed(item.ex) : isPlayed("game", item.key);

/* ---------- the plan's order, arranged ----------

   The storage half is up with the itinerary's; this is the half that knows
   what a stop is.

   Two lenses, two kinds of row, one list of keys. A day-lens row is a plan
   item — the booth or the game you saved — and is keyed as one. A hall-lens
   row is always a booth, including the booths that are only in your plan
   because you saved a game shown there, and is keyed as that booth. So a
   saved booth carries one position through both lenses, while a game holds
   its own position in the day list without pulling its publisher's row
   around the hall list, which is the right answer for a publisher showing
   four games you saved.

   The map reads the booth keys, and reads them exactly as the hall lens
   does, because its pins number a hall's stops for one day — which is the
   hall lens under a day filter, drawn on the floor. */

/* Every stop the plan holds, keyed the way the order stores them. Both row
   populations, deduped: an exhibitor you saved is one stop, not two. */
function planStops() {
  const stops = new Map();
  const add = (key, name, crowd, played) => {
    if (!stops.has(key)) stops.set(key, { key, name, crowd, played });
  };
  for (const item of itineraryItems())
    add(GCMarks.stopKey(item.kind, item.key), item.name, item.crowd, itineraryPlayed(item));
  for (const ex of plannedExhibitors())
    if (hasSaved(ex)) add(GCMarks.stopKey("exhibitor", ex.id), ex.name, ex.crowd || 0, hasPlayed(ex));
  return stops;
}

/* The keys a stored position may still refer to — see prunePlan. The raw
   saved keys are in it as well as the resolved ones, so a trade booth whose
   directory has not downloaded yet keeps its place instead of being pruned
   for being temporarily unresolvable. */
function livePlanKeys() {
  const live = new Set(planStops().keys());
  for (const key of state.marks.saved.exhibitors) live.add(GCMarks.stopKey("exhibitor", key));
  for (const key of state.marks.saved.games) live.add(GCMarks.stopKey("game", key));
  return live;
}

/* The automatic order — busiest first, played last — over the plain
   {name, crowd, played} records planStops() makes. */
const autoStopOrder = () => GCMarks.compareStops((stop) => stop.played, GCI18N.lang, null);

/* The stored order with everything missing from it appended, in the automatic
   order. That is exactly where those stops are already on screen — an
   unranked stop falls through to the automatic rule at the end of its group —
   so the first move writes the plan down as it stands and changes one thing,
   rather than silently reshuffling everything else on the way past. */
function completePlanOrder() {
  const stops = planStops();
  const kept = state.planOrder.filter((key) => stops.has(key));
  const have = new Set(kept);
  const rest = [...stops.values()]
    .filter((stop) => !have.has(stop.key))
    .sort(autoStopOrder())
    .map((stop) => stop.key);
  return [...kept, ...rest];
}

/* Move one row within the group it is displayed in — one day, or one hall.
   `groupKeys` is that group as rendered, read back off the DOM so the thing
   being permuted is the list the visitor is actually looking at.

   Only the positions that group occupies are rewritten. A stop pulled to the
   top of Thursday keeps every relation it had to Friday's stops and to the
   halls it does not stand in, so moving a row never reshuffles a list
   somewhere else on the board. */
function movePlanStop(key, groupKeys, delta) {
  const from = groupKeys.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= groupKeys.length) return;
  const order = completePlanOrder();
  const slots = groupKeys.map((k) => order.indexOf(k)).sort((a, b) => a - b);
  /* A row whose key is not in the completed order cannot be placed, and
     writing to slot -1 would corrupt the rest. Nothing renders such a row
     today; this is here so nothing quietly starts to. */
  if (slots[0] < 0) return;
  const moved = [...groupKeys];
  moved.splice(to, 0, ...moved.splice(from, 1));
  slots.forEach((slot, i) => (order[slot] = moved[i]));
  setPlanOrder(order);
  persistPlanOrder();
  renderPlan();
}

/* Back to automatic. Undoable from the toast rather than guarded by a
   confirm(): a hand-arranged plan is real work, and the cheapest way to say
   "that was not what I meant" is to hand it straight back. */
function resetPlanOrder() {
  if (!state.planOrder.length) return;
  const before = state.planOrder;
  const restore = () => {
    setPlanOrder(before);
    persistPlanOrder();
    renderPlan();
  };
  setPlanOrder([]);
  persistPlanOrder();
  renderPlan();
  showToast(t("toast.orderReset"), t("action.undo"), restore);
}

/* Your order first and last: a stop you put below a played one stays there,
   because "I moved it here" outranks anything the guide would otherwise
   reason about it. Under that, the automatic rule — which is the whole
   ordering until the first move. */
const planRowOrder = () =>
  GCMarks.compareStops(itineraryPlayed, GCI18N.lang, (item) => planRank(item.kind, item.key));

/* The queue index as its own cell, in both lenses and in the same words.
   It is what the plan sorts itself by, so it has to be readable next to the
   stop: "why is this one first" needs an answer on the page, and once the
   order can be overridden by hand it needs one even more — a list that no
   longer runs 5, 4, 4, 2 should still show what it is not running in.

   A business booth has no queue to forecast; what decides whether walking
   over is worth it there is the badge, so that is what its cell says. */
function crowdCell(className, crowd, business) {
  if (business)
    return `<span class="${className}" data-level="0">${esc(t("plan.tradeBadge"))}</span>`;
  const title = crowd
    ? t("plan.queueWith", { n: crowd, label: crowdLabel(crowd) })
    : t("plan.queueUnknown");
  return `<span class="${className}" data-level="${esc(crowd)}" title="${esc(title)}">${esc(
    t("route.queueShort", { n: crowd || "?" })
  )} · ${esc(crowdLabel(crowd))}</span>`;
}

/* The two arrows that put a stop where you want it, rendered from its place
   in its group so neither ever points out of one. A group of one gets none:
   there is nothing to arrange, and two dead buttons on every row of a
   one-stop day would be the loudest thing on the board.

   The group is named on the row rather than threaded through the markup as
   an index, so the delegated handler can read the order it is permuting
   straight back off the screen — see bindControls.

   Where the row now sits rides in the group's accessible name rather than in
   a live region: a move re-renders the board and focus is put back on the
   equivalent arrow (keepingFocus), which is a fresh element, so the name is
   read out again. That is the announcement — "Move Nintendo in the plan, 3
   of 5" — without a second channel to keep in step with the list. */
function moveButtons(key, name, i, total) {
  if (total < 2) return "";
  const arrow = { up: "▲", down: "▼" };
  return `<span class="row-move" role="group" aria-label="${esc(
    t("plan.moveAria", { name, n: i + 1, total })
  )}">${["up", "down"]
    .map((dir) => {
      const label = t(`plan.move.${dir}`, { name });
      const end = dir === "up" ? i === 0 : i === total - 1;
      return `<button class="mv" type="button" data-move-dir="${dir}" data-move-key="${esc(
        key
      )}"${end ? " disabled" : ""}
        title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${
          arrow[dir]
        }</span></button>`;
    })
    .join("")}</span>`;
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
  /* Where, and only where: the queue index used to be appended here and now
     has a cell of its own, in the column the hall lens keeps it in. */
  return hallLink(item.ex.hall, item.ex.booth, itineraryLocation(item.ex));
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

function itineraryItem(item, group, i, total) {
  const kindLabel =
    item.kind === "game"
      ? t("kind.game")
      : itemInBusinessArea(item)
        ? t("kind.trade")
        : t("kind.booth");
  const shut = stopOnClosedDay(item);
  return `<div class="it-item" data-it-kind="${esc(item.kind)}" data-it-key="${esc(item.key)}" data-played="${itineraryPlayed(item)}"
    data-stop-key="${esc(GCMarks.stopKey(item.kind, item.key))}" data-stop-group="${esc(group)}">
    <span class="it-main">
      <span class="it-kind">${esc(kindLabel)}</span>
      <span class="it-name">${esc(item.name)}</span>
    </span>
    <span class="it-loc">${itineraryItemLocationHtml(item)}</span>
    ${crowdCell("it-crowd", item.crowd, itemInBusinessArea(item))}
    ${itineraryDayChips(item)}
    ${moveButtons(GCMarks.stopKey(item.kind, item.key), item.name, i, total)}
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
  const order = planRowOrder();
  const unassigned = items
    .filter((item) => !validDays.has(assignedDay(item.kind, item.key)))
    .sort(order);
  const groups = [];

  if (unassigned.length) {
    groups.push(`<div class="it-group">
      <div class="it-group-head unassigned"><span class="it-group-title">${esc(
        t("plan.unassigned")
      )}</span></div>
      ${unassigned
        .map((item, i) => itineraryItem(item, "none", i, unassigned.length))
        .join("")}
    </div>`);
  }
  for (const d of state.event.days || []) {
    const dayItems = items
      .filter((item) => assignedDay(item.kind, item.key) === d.date)
      .sort(order);
    if (!dayItems.length) continue;
    /* One line at the top of the day rather than only a note per row: the
       question "is any of today's plan behind a closed door" should be
       answerable without reading every stop. */
    const shut = dayItems.filter(stopOnClosedDay).length;
    groups.push(`<div class="it-group" data-it-date="${esc(d.date)}">
      <div class="it-group-head" tabindex="-1">${dayHeaderInner(d, { note: false })}</div>
      ${
        shut
          ? `<p class="it-group-warn">${esc(
              t("plan.closedGroupWarn", { n: shut, day: dayName(d.date) })
            )}</p>`
          : ""
      }
      ${dayItems.map((item, i) => itineraryItem(item, d.date, i, dayItems.length)).join("")}
    </div>`);
  }

  /* Everything that sits *above* the board is written before the board is:
     keepingFocus() puts focus back mid-rebuild, and anything above it that
     grows afterwards pushes the control focus just landed on back off the
     screen it was scrolled onto. The count is the one line up there that
     moves with the plan. */
  const placed = items.filter((item) => validDays.has(assignedDay(item.kind, item.key))).length;
  $("#plan-count").textContent = items.length
    ? t("plan.itemCount", { n: items.length }) +
      (placed ? t("plan.placedSuffix", { n: placed }) : "")
    : "";

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
  $("#plan-browse")?.classList.toggle(
    "hidden",
    items.length > 0 || savedCount() > 0 || tradeDataPending()
  );
  /* Absent stops render inline here ("Absent — no booth"); the footnote is the
     hall lens's way of saying the same thing. */
  $("#plan-absent").classList.add("hidden");
}

/* How many of the plan's items sit on each day — the five-days board wears
   these so it doubles as a glanceable summary of the plan once stops have
   days. Counted from the same items the itinerary renders, so the board and
   the plan can never disagree about what is placed where. */
function plannedPerDay() {
  const counts = new Map();
  for (const item of itineraryItems()) {
    const day = assignedDay(item.kind, item.key);
    if (day) counts.set(day, (counts.get(day) || 0) + 1);
  }
  return counts;
}

function renderDayBoard() {
  const board = $("#day-guide");
  if (!board) return; // stale cached shell — see the note in renderPlan
  const counts = plannedPerDay();
  board.innerHTML = (state.event.days || [])
    .map((d) => {
      const n = counts.get(d.date) || 0;
      const aria = t("planner.dayPlannedAria", { day: dayName(d.date) });
      return `<div class="day-row">${dayHeaderInner(d)}${
        n
          ? `<button class="day-planned" type="button" data-planned-day="${esc(d.date)}"
              title="${esc(aria)}" aria-label="${esc(aria)}">${esc(
              t("planner.dayPlanned", { n })
            )}</button>`
          : ""
      }</div>`;
    })
    .join("");
  $$("#day-guide .day-planned").forEach((btn) =>
    btn.addEventListener("click", () => gotoPlanDay(btn.dataset.plannedDay))
  );
}

/* The count answers "which day is loaded"; this answers the tap that follows
   — "with what?". Each lens keeps its own meaning: the day lens scrolls to
   that day's group, the hall lens points its single-day filter at the day, so
   mid-show the tap lands on "today's stops, in walking order". */
function gotoPlanDay(date) {
  if (state.planLens === "hall") {
    if (state.planDay !== date) {
      state.planDay = date;
      /* Rebuilds the day board too, destroying the button just pressed —
         focus moves to the filter chip now doing what the button asked. */
      renderPlan();
    }
    $("#plan-section")?.scrollIntoView();
    ($(`#plan-day-filter [data-plan-day="${CSS.escape(date)}"]`) || $("#plan-title"))?.focus({
      preventScroll: true,
    });
    return;
  }
  const group = $(`#plan-board .it-group[data-it-date="${CSS.escape(date)}"]`);
  (group || $("#plan-section"))?.scrollIntoView();
  (group?.querySelector(".it-group-head") || $("#plan-title"))?.focus({ preventScroll: true });
}

/* Buttons rather than #id anchor links (see the note on #planner-jump in the
   markup); rebuilt with the section titles' own numbering, which stays fixed
   even when the wristband section is absent, so the chips always agree with
   the headings they lead to. */
function renderPlannerJump() {
  const nav = $("#planner-jump");
  if (!nav) return; // stale cached shell — see the note in renderPlan
  const sections = [
    ["01", "days-title", t("planner.fiveDays")],
    ["02", "plan-title", t("planner.yourPlan")],
    ["03", "priority-title", t("planner.queuePriority")],
    ["04", "wristband-title", t("planner.wristband")],
    ["05", "tips-title", t("planner.crowdTips")],
  ].filter(([, id]) => {
    const target = document.getElementById(id);
    /* The wristband section hides itself when no lineup is age-gated; a chip
       leading into a hidden section would scroll to nothing. */
    return target && !target.closest(".hidden, [hidden]");
  });
  nav.innerHTML = sections
    .map(
      ([num, id, label]) => `<button class="chip jump-chip" type="button" data-jump="${esc(id)}">
        <span class="section-num">${esc(num)}</span> ${esc(label)}</button>`
    )
    .join("");
  $$("#planner-jump .jump-chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      const target = document.getElementById(chip.dataset.jump);
      if (!target) return;
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    })
  );
}

function renderPlanner() {
  const ev = state.event;
  renderPriority();
  renderWristband();
  renderPlan();
  /* After renderWristband: the chips need to know whether section 04 exists. */
  renderPlannerJump();

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
    /* The order you arranged, then busiest first — but played stops are not
       sunk here the way the board sinks them. An exported day is the day as
       planned; what you have already done to it is this week's news, and the
       .ics file is written once. */
    const dayItems = items
      .filter((item) => assignedDay(item.kind, item.key) === d.date)
      .sort(GCMarks.compareStops(() => false, GCI18N.lang, (item) => planRank(item.kind, item.key)));
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

/* Which days a stop is planned for. Shared with the map's route overlay, which
   has to bucket the same booth onto the same day (js/marks.js). */
const stopDays = (ex) => GCMarks.stopDays(state.marks.saved, state.itinerary, ex);

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
      /* Your order first, then busiest, with played stops sinking to the end
         of their hall. The comparator and the positions are both shared with
         the map, which numbers the same stops on the floor and must count
         them in this order (js/marks.js). */
      items: buckets.get(key).sort(GCMarks.compareStops(hasPlayed, GCI18N.lang, exPlanRank)),
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
        .map((ex, i) => {
          const baseLocation = ex.booth
            ? ex.booth
            : ex.hall
              ? t("plate.boothTba")
              : t("route.locationTbaShort");
          /* The booth number is the link; "· unconf." stays outside it. That
             suffix is a caveat about the data, not part of the address, and
             underlining it would offer to show you a stand we're not sure of. */
          const unconf = ex.hall && !ex.locationConfirmed ? t("plate.unconfSuffix") : "";
          /* The group a move is measured against is the hall as rendered —
             under a day filter that is exactly the set the map numbers, so
             an arrow here moves a pin there. */
          return `<div class="route-item" data-saved="${isSaved("exhibitor", ex.id)}" data-played="${hasPlayed(ex)}"
            data-stop-key="${esc(GCMarks.stopKey("exhibitor", ex.id))}" data-stop-group="${esc(group.key)}">
            <span class="route-name">${esc(ex.name)}${dayFilter ? "" : routeDayTags(ex)}</span>
            <span class="route-booth">${hallLink(ex.hall, ex.booth, baseLocation, dayFilter)}${unconf}</span>
            ${crowdCell("route-crowd", ex.crowd || 0, inBusinessArea(ex))}
            <span class="row-actions">
              ${moveButtons(GCMarks.stopKey("exhibitor", ex.id), ex.name, i, group.items.length)}
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
        ? `<a class="route-hall-map" href="${esc(mapLink(group.key, null, dayFilter))}"
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

  /* Above the board before the board — see the note in renderItinerary. */
  $("#plan-count").textContent =
    t("route.stops", { n: stopCount }) +
    " · " +
    t("route.halls", { n: hallCount }) +
    (played ? t("priority.playedSuffix", { n: played }) : "");

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
  $("#plan-browse")?.classList.toggle(
    "hidden",
    stopCount > 0 || savedCount() > 0 || tradeDataPending()
  );
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
      restoreFocus($(`#plan-day-filter [data-plan-day="${CSS.escape(chip.dataset.planDay)}"]`));
    })
  );
}

function renderPlan() {
  /* The service worker caches index.html and app.js independently, so on a
     flaky network this file can briefly run against a one-version-older shell
     that still has the separate itinerary and route sections (see
     handleNavigation in sw.js). Bail out instead of letting a null lookup
     abort the whole boot. */
  /* First, and before the stale-shell bail below: the day board's planned
     counts ride with the plan — every path that can change an assignment or
     the saved list already ends here — and the board itself exists on shells
     old enough to lack #plan-board. */
  renderDayBoard();
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

  /* The two buttons in .plan-controls come next, and before the board rather
     than after it, because that row sits above the board and each of them
     appears for the first time on the very assignment or move that rebuilds
     it. keepingFocus() puts focus back mid-rebuild; a control row that grows
     after that shoves the button focus just landed on back off the screen.

     Export rides with the plan, not one lens — it always writes the full set
     of day assignments, whichever arrangement is on screen. Same visibility
     test the itinerary section used: at least one item placed on a real day. */
  const validDays = new Set((state.event?.days || []).map((d) => d.date));
  $("#export-ics").classList.toggle(
    "hidden",
    !itineraryItems().some((item) => validDays.has(assignedDay(item.kind, item.key)))
  );
  /* Offered only once there is an arrangement to give up: a plan still
     sorting itself has nothing to reset, and the button would be a control
     for a state nobody is in. */
  $("#plan-order-reset")?.classList.toggle("hidden", state.planOrder.length === 0);

  /* Same shell, restyled per lens; toggle (not className) so "hidden" and the
     renderers' own state survive the swap. */
  board.classList.toggle("it-board", !hall);
  board.classList.toggle("route-board", hall);
  hall ? renderRoute() : renderItinerary();
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

  /* Entrances are the one piece of event info that is advice rather than fact:
     which gate is quickest depends on the day and on which way Koelnmesse is
     steering the queue that morning. The lede says so, and the trade note gets
     its own paragraph because "West is best" only holds on the public days.

     Both names stay as they are in every language: `name` is the short English
     gate letter the guide sorts and links by, and `nameDe` is what Koelnmesse
     has written on the building — a German reader and an English one are both
     looking for the sign that says "Eingang West". */
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
  /* The reverse door: the plan's empty state back to the grid it is filled
     from. Focus lands on the tab rather than the search box, which would pop
     the keyboard over the grid the button promised to show. */
  $("#plan-browse")?.addEventListener("click", () => {
    showView("exhibitors");
    window.scrollTo(0, 0);
    $('.tab[data-view="exhibitors"]')?.focus({ preventScroll: true });
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
    setPlanOrder([]);
    persistMarks("saved");
    persistItinerary();
    persistPlanOrder();
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
  $("#plan-order-reset")?.addEventListener("click", resetPlanOrder);
  bindShareDialog();
  bindSiteShare();
  bindSourcesDialog();
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
      restoreFocus($(`#exhibitor-grid [data-face="${CSS.escape(owner)}"]`));
      return;
    }
    /* An arrow moves its row inside the group it is drawn in, and the group
       is read straight back off the screen: what gets permuted is the list
       the visitor is looking at, whichever lens drew it. */
    const move = e.target.closest("[data-move-dir]");
    if (move) {
      const group = move.closest("[data-stop-group]")?.dataset.stopGroup;
      if (group === undefined) return;
      const keys = $$(`#plan-board [data-stop-group="${CSS.escape(group)}"]`).map(
        (row) => row.dataset.stopKey
      );
      movePlanStop(move.dataset.moveKey, keys, move.dataset.moveDir === "up" ? -1 : 1);
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
    const watched = [...Object.values(MARK_KEYS), IT_KEY, ORDER_KEY, PREFS_KEY];
    if (e.key !== null && !watched.includes(e.key)) return;
    if (e.key === null || e.key === MARK_KEYS.saved) state.marks.saved = loadMarks("saved");
    if (e.key === null || e.key === MARK_KEYS.played) state.marks.played = loadMarks("played");
    if (e.key === null || e.key === IT_KEY) state.itinerary = loadItinerary();
    if (e.key === null || e.key === ORDER_KEY) setPlanOrder(loadPlanOrder());
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
    prunePlan();
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
      restoreFocus($(`#trade-cat-filters [data-trade-cat="${CSS.escape(state.tradeCat)}"]`));
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
    else focusExhibitor(landing.params.get("ex"));
  });
}

async function main() {
  /* Marks and prefs live in localStorage — no reason to wait for the network
     before reading them. Doing it first is what lets the directory download
     below share the wire with the core data instead of queueing behind it. */
  state.marks.saved = loadMarks("saved");
  state.marks.played = loadMarks("played");
  /* No schedule check to wait for, unlike the itinerary below: a position is
     a fact about your list, not about the show days. */
  setPlanOrder(loadPlanOrder());
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
  /* The marks and prefs above are read before the network, but the itinerary
     waits for loadData: it is validated against the show days, which only
     exist once data/event.json is in (see loadItinerary). */
  state.itinerary = loadItinerary();
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
  };
  const landingView = route === SAVED_ROUTE ? "exhibitors" : route;
  const first = VIEWS.includes(landingView) ? landingView : VIEWS[0];
  bootRender[first]();
  for (const view of VIEWS) if (view !== first) queueViewRender(view, bootRender[view]);
  showView(route, { push: false });
  if (!incoming) focusExhibitor(landing.params.get("ex"));
  if (offer) offerIncomingWhenReady(offer);
  /* Last, so an import prompt is the thing on screen when both apply — that one
     is priority anyway, and it carries the only Add/Undo the visitor gets. */
  offerMove();
}

main();
