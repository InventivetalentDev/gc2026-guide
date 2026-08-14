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
  /* raw official directory: null until the section is first opened */
  directory: null,
  directoryError: null,
  showDirectory: false,
  directoryLimit: 0,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const TYPE_LABELS = {
  platform: "Platforms",
  publisher: "Publishers",
  hardware: "Hardware",
  indie: "Indie",
  /* Booths whose draw is something you do rather than a game you demo — sim
     rigs, VR, an RC drift track, a rideable robot. Deliberately one broad
     category: the flavour ("sim racing", "attraction") lives in tags, so a new
     kind of stunt next year needs no new type. */
  experience: "Experiences & Activities",
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
  const [exhibitors, event, meta, changelog, hallplan] = await Promise.all([
    fetch(`data/exhibitors.json${bust}`).then((r) => r.json()),
    fetch(`data/event.json${bust}`).then((r) => r.json()),
    fetch(`data/meta.json${bust}`).then((r) => r.json()),
    fetch(`data/changelog.json${bust}`).then((r) => r.json()).catch(() => []),
    /* Only the ~900-byte index, only to know which halls the map covers.
       Optional on purpose: no hall plan, no map links, guide unchanged. */
    fetch(`data/hallplan/index.json${bust}`).then((r) => r.json()).catch(() => null),
  ]);
  state.exhibitors = exhibitors;
  state.event = event;
  state.meta = meta;
  state.changelog = changelog;
  state.mapHalls = new Set((hallplan?.halls || []).map((h) => String(h.id)));
  buildShareCodeMap();
}

/* ---------- saved & played marks ----------

   Two independent sets: exhibitor ids, and games keyed by normalised title
   rather than by booth. Eight titles this year are shown at two booths at once
   (Alien: Isolation 2 sits at both Xbox and SEGA), so a game mark applies at
   every booth showing the same title. */

/* The storage shape and the saved-game rule live in js/marks.js, because
   the hall map reads and writes the same two lists. Everything below
   still calls loadMarks/persistMarks/gameKey by their old names. */
const { MARK_KEYS, gameKey } = GCMarks;
const IT_KEY = "gc2026.itinerary.v1";
const PREFS_KEY = "gc2026.prefs.v1";

const loadMarks = (mark) => GCMarks.readMarks(mark);
const persistMarks = (mark) => GCMarks.writeMarks(mark, state.marks[mark]);

/* Both view preferences live here rather than beside the marks they act on:
   "hide played" is a lens on the list, the same kind of thing as the age
   filter, and neither survives being tangled up with the marks themselves. */
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const age = AGE_FILTERS.some(([value]) => value === raw.age) ? raw.age : "all";
    return {
      age,
      hidePlayed: raw.hidePlayed === true,
      planLens: raw.planLens === "hall" ? "hall" : "day",
      showDirectory: raw.showDirectory === true,
    };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return { age: "all", hidePlayed: false, planLens: "day", showDirectory: false };
  }
}

function persistPrefs() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        age: state.age,
        hidePlayed: state.hidePlayed,
        planLens: state.planLens,
        showDirectory: state.showDirectory,
      })
    );
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
      wide
        ? `<span class="bm-text" aria-hidden="true">${mark === "saved" ? (marked ? "Saved" : "Save") : "Played"}</span>`
        : ""
    }</button>`;
}

function markLabel(mark, kind, name, marked) {
  const what = kind === "game" ? name : `the ${name} booth`;
  if (mark === "played") return `Mark ${what} as ${marked ? "not played" : "played"}`;
  return marked ? `Remove ${what} from your saved list` : `Save ${what} to your list`;
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
    if (text) text.textContent = mark === "saved" ? (marked ? "Saved" : "Save") : "Played";
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
  claims.forEach((items, tok) => {
    if (items.length !== 1) return;
    const item = items[0];
    (item.kind === "exhibitors" ? shareCodes.exhibitorTok : shareCodes.gameTok).set(item.key, tok);
    shareCodes.tokItem.set(tok, item);
  });
}

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

/* The guide answers on two hostnames while the old one is retired, and a saved
   list is per-origin. Built from location.origin, a link shared from the legacy
   host would hand the recipient — or the sender's own next device — the very
   origin they are trying to leave, so sharing could never move a list forward.
   Only that one host is rewritten: gamescom.guide and localhost share
   themselves, as they should. */
const LEGACY_HOST = "gc2026.inventivetalent.org";
const SHARE_ORIGIN = "https://gamescom.guide";

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
  const origin = location.host === LEGACY_HOST ? SHARE_ORIGIN : location.origin;
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
   The legacy-origin rewrite in buildShareLink aims it at gamescom.guide.

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
   what carries it (buildMoveLink above) and ignoring leaves it here. */
const MOVED_KEY = "gc2026.moved.v1";

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
  if (location.host !== LEGACY_HOST || moveNoticeAnswered()) return;
  const move = buildMoveLink();
  showToast(
    move
      ? "The guide has moved to gamescom.guide. Your list comes with you."
      : "The guide has moved to gamescom.guide.",
    "Open",
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
const itemLabel = (n) => `${n} saved item${n === 1 ? "" : "s"}`;

/* The saved list is what the counts are about, so what else rode along is said
   separately rather than folded into a number nobody can check. Worded for
   any link — the day-plan toggle lets a plain share carry one now. */
function carriedNote(incoming) {
  const also = [];
  if (dayCount(incoming.days)) also.push("a day plan");
  if (incomingCount(incoming.played)) also.push("played marks");
  return also.length ? ` It carries ${also.join(" and ")} too.` : "";
}

function unresolvedNote(n) {
  if (!n) return "";
  return ` ${n === 1 ? "1 isn't" : `${n} aren't`} in the guide any more.`;
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
  showToast(snapshot.moved ? "Move undone." : "Shared list import undone.", null, null, {
    priority: true,
    replace: true,
  });
}

function offerIncoming(incoming) {
  const total = incomingCount(incoming);
  if (total === 0) {
    forgetPending();
    showToast("That shared list is out of date — nothing left to add.", null, null, {
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
      incoming.moved
        ? `Loaded ${itemLabel(total)} you moved over.${carriedNote(incoming)}${stale}`
        : `Loaded ${itemLabel(total)} from a shared link.${carriedNote(incoming)}${stale}`,
      "Undo",
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
        (id) => shareCodes.exhibitorIds.has(id) && !incoming.exhibitors.has(id)
      ).length +
      [...state.marks.saved.games].filter(
        (key) => shareCodes.gameToCode.has(key) && !incoming.games.has(key)
      ).length;
    const news = newCount ? ` — ${newCount} new to you` : "";
    const cost = drops
      ? ` Replacing removes ${drops} item${drops === 1 ? "" : "s"} you only have here.`
      : "";
    showToast(
      `Your moved plan has ${itemLabel(total)}${news}.${cost}${stale}`,
      "Replace my list",
      () => {
        const before = applyIncoming(incoming, "replace");
        showToast(
          `Your list now matches the moved plan.${carriedNote(incoming)}${stale}`,
          "Undo",
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
    showToast(`You already have everything in this shared link.${stale}`, null, null, {
      priority: true,
    });
    return;
  }
  showToast(
    `A shared link has ${itemLabel(total)} — ${newCount} new to you.${stale}`,
    "Add to my list",
    () => {
      const before = applyIncoming(incoming);
      showToast(
        `Added ${itemLabel(newCount)} from the shared link.${carriedNote(incoming)}${stale}`,
        "Undo",
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
    ? `${itemLabel(shareable)} ready to share. ${unavailable} older item${
        unavailable === 1 ? " is" : "s are"
      } no longer in the guide.`
    : itemLabel(shareable);

  const nativeShare = $("#native-share");
  nativeShare.hidden = typeof navigator.share !== "function";

  const hasEncoder = typeof window.qrSvg === "function";
  const svg = hasEncoder ? window.qrSvg(link) : null;
  $("#share-qr").hidden = !svg;
  $("#share-qr-image").innerHTML = svg || "";
  const fallback = $("#share-qr-fallback");
  fallback.textContent = hasEncoder
    ? "This list is too long for a QR code — send the link instead."
    : "The QR code could not be loaded — send the link instead.";
  fallback.hidden = Boolean(svg);

  const status = $("#share-status");
  status.textContent = "";
}

function showShareStatus(message) {
  const status = $("#share-status");
  status.textContent = message;
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
  input.addEventListener("focus", () => input.select());
  bindDialogDismiss(dialog, $("#close-share"));

  $("#copy-share-link").addEventListener("click", async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(input.value);
      showShareStatus("Link copied.");
    } catch {
      input.focus();
      input.select();
      showShareStatus("Press ⌘C / Ctrl+C to copy.");
    }
  });

  $("#native-share").addEventListener("click", async () => {
    try {
      await navigator.share({ title: "gamescom 2026 saved list", url: input.value });
    } catch (err) {
      if (err?.name !== "AbortError") {
        showShareStatus("Sharing failed — copy the link instead.");
      }
    }
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
      name: state.event?.name || "this guide",
      what: "The dates, hours, tickets and hall areas on this page",
      sources: state.event?.sources,
      updated: state.meta?.lastUpdated,
    };
  }
  const ex = state.exhibitors.find((item) => item.id === key);
  if (!ex) return null;
  return {
    name: ex.name,
    what: "The location, lineup and queue call on this card",
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
  const label = `Sources for ${subject.name} — ${list.length} link${list.length === 1 ? "" : "s"}`;
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
    `${subject.what} come from ${list.length} source${list.length === 1 ? "" : "s"}.` +
    (subject.updated ? ` Last checked ${subject.updated}.` : "");
  $("#sources-list").innerHTML = list
    .map((url, i) => {
      const { host, rest } = sourceParts(url);
      return `<li>
        <span class="src-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <a href="${esc(url)}" target="_blank" rel="noopener nofollow">
          <span class="src-host">${esc(host)}</span>${rest ? `<span class="src-path">${esc(rest)}</span>` : ""}
          <span class="sr-only">, opens in a new tab</span>
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
const byCrowdDesc = (a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name);
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
    ex.hall ? `hall ${ex.hall}` : "",
    ex.booth || "",
    ...(ex.tags || []),
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
    if (state.hidePlayed && hasPlayed(ex)) return false;
    return matchesQuery(ex, state.query);
  });

  const bySort = {
    "crowd-desc": byCrowdDesc,
    "crowd-asc": (a, b) => (a.crowd || 0) - (b.crowd || 0) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    hall: (a, b) => hallRank(a.hall) - hallRank(b.hall) || a.name.localeCompare(b.name),
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
const mapLink = (hall, booth) =>
  `map.html#${encodeURIComponent(hall)}` +
  (booth ? `/${encodeURIComponent([...GCMarks.boothCodes(booth)][0] || "")}` : "");

/* Every other place a hall is named — the planner rows, the directory — is
   also a way to that hall on the map. One helper so all of them make the
   same promise: plain text when the snapshot can't draw that hall, and a
   link that says out loud where it goes when it can. The visible label is
   left exactly as the row wrote it; only the destination is added. */
function hallLink(hall, booth, label) {
  if (!hasMap(hall)) return esc(label);
  const where = `Hall ${hall}${booth ? `, booth ${booth}` : ""}`;
  return `<a class="hall-link" href="${esc(mapLink(hall, booth))}"
    title="Open on the hall map"
    aria-label="${esc(`${where} — open the hall map`)}">${esc(label)}</a>`;
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
  const where = confirmed ? "Officially confirmed location" : "Best guess — not officially confirmed";
  const inner = `<span class="hall-kicker">Hall</span>
    <span class="hall-num">${esc(ex.hall)}</span>
    <span class="hall-booth">${ex.booth ? esc(ex.booth) : "booth TBA"}${confirmed ? "" : " · unconf."}</span>`;
  const state_ = `data-state="${confirmed ? "confirmed" : "unconfirmed"}"`;
  /* The plate is already the "where" of the card, so it is also the way
     to the map — no second control competing for the same corner. */
  if (!hasMap(ex.hall)) return `<div class="hall-marker" ${state_} title="${where}">${inner}</div>`;
  return `<a class="hall-marker" ${state_} href="${esc(mapLink(ex.hall, ex.booth))}"
      title="${where} — open the hall map"
      aria-label="${esc(`Hall ${ex.hall}${ex.booth ? `, booth ${ex.booth}` : ""} — open the hall map`)}">
    ${inner}<span class="hall-map-cue" aria-hidden="true">Map →</span>
  </a>`;
}

function ageBadge(status = "expected", label = "18+", extraClass = "") {
  const ageStatus = status === "confirmed" ? "confirmed" : "expected";
  const title = ageStatus === "confirmed"
    ? "18+ wristband required"
    : "18+ expected — not confirmed";
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
      ? `<span class="sr-only">Confirmed</span>`
      : `<span class="badge badge-status" data-status="${esc(status)}">${esc(status)}</span>`;
  const key = gameKey(g.title);
  return `<li class="game" data-status="${esc(status)}" data-saved="${isSaved("game", key)}" data-played="${isPlayed("game", key)}">
    <span class="game-main">
      <span class="game-title">${esc(g.title)}</span>
      ${statusLabel}
      ${g.playable ? `<span class="badge badge-playable">playable</span>` : ""}
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
      `<a class="official-link" href="${esc(ex.officialUrl)}" target="_blank" rel="noopener">Official exhibitor page<span aria-hidden="true"> ↗</span><span class="sr-only"> for ${esc(ex.name)}, opens in a new tab</span></a>`
    : "";
  const sources = sourcesButton("exhibitor", ex.id);
  return official || sources ? `<div class="foot-links">${official}${sources}</div>` : "";
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

  return `<article class="card" data-id="${esc(ex.id)}" data-saved="${hasSaved(ex)}" data-played="${hasPlayed(ex)}">
    <div class="exh-head">
      ${hallMarker(ex)}
      <div class="exh-id">
        <span class="overline">${esc(TYPE_LABELS[ex.type] || ex.type)}</span>
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
      ${footLinks(ex)}
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

  /* The search box and hall chips filter the directory as well, so it re-renders
     with the grid rather than being wired to each control separately. */
  renderDirectory();
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
  if (state.hidePlayed) parts.push("played hidden");
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

/* Trade-only halls. The curated cards never reach these, so the hall chips
   don't list them, but the raw directory is full of them and a visitor holding
   a consumer ticket cannot get in. */
const isBusinessHall = (hall) => parseFloat(hall) < 5;

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
  for (const ex of state.exhibitors) {
    claim(ex, ex.booth);
    const stands = String(ex.booth || "").split(",");
    if (stands.length > 1) for (const stand of stands) claim(ex, stand);
  }
  return map;
}

let directoryRequest = null;
let directorySignature = "";

function loadDirectory() {
  if (state.directory || directoryRequest) return directoryRequest;
  directoryRequest = fetch(`${DIRECTORY_URL}?v=${Date.now()}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((payload) => {
      state.directory = payload;
      state.directoryError = null;
    })
    .catch((err) => {
      state.directoryError = err.message || "failed to load";
    })
    .finally(() => {
      directoryRequest = null;
      renderDirectory();
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
      ...stands.map((s) => `hall ${s.hall} ${s.booth}`),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

function directoryRow(entry, byBooth) {
  const base = state.directory?.profileBase || "";
  const stands = (entry.stands || [])
    .map((s) => {
      const host = byBooth.get(boothKey(s.hall, s.booth));
      const business = isBusinessHall(s.hall);
      /* The booth number is the answer this section exists to give, so it is
         also the way to see it: a chip in a mapped hall opens the map on that
         stand. The host suffix stays outside the underline — it names a
         neighbour, not a place. */
      const where = `<span class="dir-stand-where"><b>${esc(s.hall)}</b>${
        s.booth ? ` · ${esc(s.booth)}` : ""
      }</span>${host && host.name !== entry.name ? `<i> at ${esc(host.name)}</i>` : ""}`;
      const cls = `dir-stand${business ? " dir-stand-trade" : ""}`;
      /* The business halls are drawn now, so their chips link like any
         other — the map opens them under a trade-only banner, which is a
         better answer than a dead chip. The warning rides along in the
         label either way: the plate is amber, and it says why. */
      const trade = business ? "Business area, trade & media only" : "";
      if (!hasMap(s.hall)) {
        return `<span class="${cls}"${trade ? ` title="${esc(trade)}"` : ""}>${where}</span>`;
      }
      return `<a class="${cls}" href="${esc(mapLink(s.hall, s.booth))}"
        title="${esc(trade ? `${trade} — open on the hall map` : "Open on the hall map")}"
        aria-label="${esc(
          `Hall ${s.hall}${s.booth ? `, booth ${s.booth}` : ""}${
            trade ? ", trade & media only" : ""
          } — open the hall map`
        )}">${where}</a>`;
    })
    .join("");
  const href = base && entry.slug ? `${base}${entry.slug}/` : "";
  const name = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(entry.name)}<span aria-hidden="true"> ↗</span><span class="sr-only">, official directory entry, opens in a new tab</span></a>`
    : esc(entry.name);
  return `<li class="dir-row">
    <span class="dir-name">${name}</span>
    <span class="dir-country">${esc(entry.country || "")}</span>
    <span class="dir-stands">${stands || '<span class="dir-stand dir-stand-tba">no booth listed</span>'}</span>
  </li>`;
}

function renderDirectory() {
  const section = $("#directory");
  if (!section) return; // stale cached shell — see the note in renderPlan
  const count = $("#directory-count");
  const note = $("#directory-note");
  const list = $("#directory-list");

  if (!state.showDirectory) {
    count.textContent = state.directory ? `${state.directory.count} booths` : "";
    note.textContent = "";
    list.innerHTML = "";
    return;
  }

  if (state.directoryError) {
    count.textContent = "";
    note.textContent = `Couldn't load the directory (${state.directoryError}). It needs one online load before it works offline.`;
    list.innerHTML = "";
    return;
  }
  if (!state.directory) {
    count.textContent = "";
    note.textContent = "Loading the official list…";
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
      ? `${state.directory.count} booths`
      : `${matches.length} / ${state.directory.count} booths`;

  const bits = [
    `The raw official list as published on ${esc(state.directory.lastUpdated)} — booths with a card above included, and no lineups, crowd ratings or saving down here.`,
  ];
  if (state.hall === "all" && trade) {
    bits.push(`${trade} of these stand only in the business area (halls 1–4), which a consumer ticket does not open.`);
  }
  if (!matches.length) {
    bits.push("Nothing here matches the current search or hall.");
  }
  note.innerHTML = bits.join(" ");

  list.innerHTML = matches.length
    ? `<ol class="dir-list">${shown.map((e) => directoryRow(e, byBooth)).join("")}</ol>` +
      (rest > 0
        ? `<button class="reset dir-more" type="button">Show ${rest} more</button>`
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
    $("#no-results").textContent =
      matches.length === 1
        ? "No card matches — but one booth in the full directory below does."
        : `No card matches — but ${matches.length} booths in the full directory below do.`;
  }
}

/* ---------- planner ---------- */

const isTradeDay = (d) => /trade|media|business/i.test(d.access);

/* Shared by the day board (section 01) and the itinerary group headers, so
   the two renderings of a day can never drift apart. */
function dayHeaderInner(d) {
  const [, month, day] = d.date.split("-");
  return `<span class="day-when">
      <span class="day-dow">${esc(d.label.slice(0, 3))}</span>
      <span class="day-date">${esc(day)}.${esc(month)}</span>
    </span>
    <span class="day-access ${isTradeDay(d) ? "trade" : "public"}">${esc(d.access)}</span>
    <span class="day-detail">
      ${d.hours ? `<span class="day-hours">${esc(d.hours)}</span>` : ""}
      ${d.note ? `<span class="day-note">${esc(d.note)}</span>` : ""}
    </span>`;
}

function itineraryItems() {
  const exhibitors = [...state.marks.saved.exhibitors]
    .map((key) => {
      const ex = state.exhibitors.find((item) => item.id === key);
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
  if (isAbsent(ex)) return "Absent — no booth";
  if (!ex.hall) return isOffsite(ex) ? "Offsite" : "Hall TBA";
  return `Hall ${ex.hall}${booth && ex.booth ? ` · ${ex.booth}` : ""}`;
}

function itineraryCrowd(item) {
  return item.kind === "exhibitor"
    ? item.ex.crowd || 0
    : Math.max(0, ...item.at.map((ex) => ex.crowd || 0));
}

function compareItineraryItems(a, b) {
  return itineraryCrowd(b) - itineraryCrowd(a) || a.name.localeCompare(b.name);
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
      : "Booth TBA";
  }
  const crowd = item.ex.crowd || 0;
  return (
    hallLink(item.ex.hall, item.ex.booth, itineraryLocation(item.ex)) +
    ` · Queue ${esc(crowd ? `${crowd}/5 ${CROWD_LABELS[crowd] || "?"}` : "unknown")}`
  );
}

function itineraryDayChips(item) {
  const current = assignedDay(item.kind, item.key);
  const label = `Assign ${item.name} to a day`;
  return `<span class="it-days" role="group" aria-label="${esc(label)}">${(state.event.days || [])
    .map((d) => {
      const active = current === d.date;
      const trade = isTradeDay(d);
      const action = active ? `Remove from ${d.label}` : `Assign to ${d.label}`;
      const title = trade ? `${action} (trade & media only)` : action;
      return `<button class="day-chip${active ? " active" : ""}" type="button"
        data-it-kind="${esc(item.kind)}" data-it-key="${esc(item.key)}" data-it-day="${esc(d.date)}"
        data-trade="${esc(String(trade))}" aria-pressed="${esc(String(active))}"
        title="${esc(title)}" aria-label="${esc(title)}">${esc(d.label.slice(0, 3))}</button>`;
    })
    .join("")}</span>`;
}

function itineraryItem(item) {
  const kindLabel = item.kind === "game" ? "Game" : "Booth";
  return `<div class="it-item" data-it-kind="${esc(item.kind)}" data-it-key="${esc(item.key)}" data-played="${itineraryPlayed(item)}">
    <span class="it-main">
      <span class="it-kind">${esc(kindLabel)}</span>
      <span class="it-name">${esc(item.name)}</span>
    </span>
    <span class="it-loc">${itineraryItemLocationHtml(item)}</span>
    ${itineraryDayChips(item)}
    ${markButton("saved", item.kind, item.key, item.name)}
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
      <div class="it-group-head unassigned"><span class="it-group-title">Unassigned</span></div>
      ${unassigned.map(itineraryItem).join("")}
    </div>`);
  }
  for (const d of state.event.days || []) {
    const dayItems = items
      .filter((item) => assignedDay(item.kind, item.key) === d.date)
      .sort(compareItineraryRows);
    if (!dayItems.length) continue;
    groups.push(`<div class="it-group" data-it-date="${esc(d.date)}">
      <div class="it-group-head">${dayHeaderInner(d)}</div>
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
  $("#plan-empty").textContent = savedCount()
    ? "Nothing you saved is in the current lineup anymore — exhibitors come and go between data updates."
    : "Nothing saved yet — hit + on a booth or game on the Exhibitors tab.";
  /* Absent stops render inline here ("Absent — no booth"); the footnote is the
     hall lens's way of saying the same thing. */
  $("#plan-absent").classList.add("hidden");
  const placed = items.filter((item) => validDays.has(assignedDay(item.kind, item.key))).length;
  $("#plan-count").textContent = items.length
    ? `${items.length} item${items.length === 1 ? "" : "s"}${placed ? ` · ${placed} placed` : ""}`
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
  return `<span class="priority-saved"><span class="row-label">Saved here</span>${mine
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

  const list = state.exhibitors
    .filter(hasAdult)
    .sort((a, b) => hallRank(a.hall) - hallRank(b.hall) || a.name.localeCompare(b.name));

  const rows = list
    .map((e) => {
      const titles = adultGames(e);
      const games = titles.length
        ? titles.map((g) => esc(g.title)).join(" · ")
        : "Booth-wide age-restricted zone";
      const location = hallLink(
        e.hall,
        e.booth,
        `${e.hall ? `Hall ${e.hall}` : "Hall TBA"} · ${e.booth || "booth TBA"}`
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
          expected ? ` ${ageBadge("expected", "18+ expected", "wristband-status")}` : ""
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
  const busiest = [...state.exhibitors].filter((e) => (e.crowd || 0) >= 4).sort(byCrowdDesc);
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
          e.hall ? hallLink(e.hall, e.booth, `Hall ${e.hall}`) : "TBA"
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
    ? "Everything on your list in the high-queue group is played — nice work."
    : savedCount()
      ? "Nothing you saved is in the high-queue group — good news, those booths should be closer to a walk-up."
      : "Nothing saved yet — hit + on a booth or game over on the Exhibitors tab.";
  const count =
    list.length === busiest.length
      ? `${busiest.length} high-queue booths`
      : `${list.length} / ${busiest.length} high-queue booths`;
  $("#priority-count").textContent = `${count}${played ? ` · ${played} played` : ""}`;
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
    const crowd = item.ex.crowd || 0;
    return `${item.name} — ${itineraryLocation(item.ex).replace(" · ", ", booth ")} (queue ${
      crowd ? `${crowd}/5` : "unknown"
    })`;
  }
  const booths = item.at
    .map((ex) => `${ex.name} (${itineraryLocation(ex, { booth: false })})`)
    .join(", ");
  return `${item.name} — ${booths ? `at ${booths}` : "booth not listed"}`;
}

function buildICS() {
  const items = itineraryItems();
  const stamp = icsDateTimeUTC(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//gc2026-guide//gamescom 2026 itinerary//EN",
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
      `SUMMARY:${icsEscape(`gamescom — ${d.label} plan (${dayItems.length} stop${dayItems.length === 1 ? "" : "s"})`)}`,
      `LOCATION:${icsEscape(state.event.location || "Koelnmesse, Cologne")}`,
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
  link.download = "gamescom-2026-itinerary.ics";
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

  state.exhibitors.filter(hasSaved).forEach((ex) => {
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
    .sort((a, b) => hallRank(a) - hallRank(b) || a.localeCompare(b));
  const keys = [...numbered, ...["offsite", "tba"].filter((key) => buckets.has(key))];

  return {
    groups: keys.map((key) => ({
      key,
      label: key === "offsite" ? "Offsite" : key === "tba" ? "Location TBA" : `Hall ${key}`,
      /* Crowd-desc, then played stops sink to the end of their hall — same
         stable two-pass sort as the priority table. */
      items: buckets
        .get(key)
        .sort(byCrowdDesc)
        .sort((a, b) => hasPlayed(a) - hasPlayed(b)),
    })),
    absent: absent.sort((a, b) => a.localeCompare(b)),
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
    .map((d) => `<span class="route-day">${esc(d.label.slice(0, 3))}</span>`)
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
      const kicker = group.key === "offsite" || group.key === "tba" ? "Location" : "Hall";
      const number = group.key === "offsite" ? "Offsite" : group.key === "tba" ? "TBA" : group.key;
      const rows = group.items
        .map((ex) => {
          const baseLocation = ex.booth ? ex.booth : ex.hall ? "booth TBA" : "location TBA";
          /* The booth number is the link; "· unconf." stays outside it. That
             suffix is a caveat about the data, not part of the address, and
             underlining it would offer to show you a stand we're not sure of. */
          const unconf = ex.hall && !ex.locationConfirmed ? " · unconf." : "";
          const crowd = ex.crowd || 0;
          return `<div class="route-item" data-saved="${isSaved("exhibitor", ex.id)}" data-played="${hasPlayed(ex)}">
            <span class="route-name">${esc(ex.name)}${dayFilter ? "" : routeDayTags(ex)}</span>
            <span class="route-booth">${hallLink(ex.hall, ex.booth, baseLocation)}${unconf}</span>
            <span class="route-crowd" data-level="${esc(crowd)}">Q${esc(crowd || "?")} · ${esc(CROWD_LABELS[crowd] || "?")}</span>
            <span class="row-actions">
              ${markButton("played", "exhibitor", ex.id, ex.name)}
              ${markButton("saved", "exhibitor", ex.id, ex.name)}
            </span>
            ${savedHereChips(ex, { day: dayFilter })}
          </div>`;
        })
        .join("");
      const countLabel = `${group.items.length} stop${group.items.length === 1 ? "" : "s"}`;
      /* The header opens the whole hall — the overview you want before
         walking into it. Each stop's booth number below opens that stand. */
      const toMap = hasMap(group.key)
        ? `<a class="route-hall-map" href="${esc(mapLink(group.key))}"
            aria-label="${esc(`Open hall ${group.key} on the map`)}">Map →</a>`
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
  $("#plan-empty").textContent = !savedCount()
    ? "Nothing saved yet — hit + on a booth or game over on the Exhibitors tab, and your stops will line up here hall by hall."
    : state.hidePlayed && played > 0 && stopCount === 0
      ? "Every stop here is played — nice work."
      : dayFilter === "none"
        ? "Every stop on your list has a day — flip to By day to review the plan."
        : dayFilter
          ? `Nothing planned for ${dayLabel(dayFilter)} yet. Assign stops to days in the By day view.`
          : "No current stops match your saved list — the exhibitor data may have changed.";
  $("#plan-count").textContent =
    `${stopCount} stop${stopCount === 1 ? "" : "s"} · ${hallCount} hall${hallCount === 1 ? "" : "s"}` +
    (played ? ` · ${played} played` : "");
  /* Absent entries have no day to belong to; the footnote is an all-days fact. */
  $("#plan-absent").classList.toggle("hidden", absent.length === 0 || Boolean(dayFilter));
  $("#plan-absent").textContent = absent.length
    ? `On your list but not on the show floor: ${absent.join(", ")}.`
    : "";
}

/* ---------- your plan ----------

   One board, two arrangements of the same saved list: the day lens is the
   itinerary (place stops on days, export them), the hall lens is the walking
   route. One section instead of two keeps a single list on screen, and lets
   the hall view read the day assignments instead of ignoring them. */

const PLAN_SUBS = {
  day: "Give each saved booth and game a day. Unassigned items sit at the top until you place them.",
  hall: "Your stops grouped by hall, in hall-number order — work down the list to avoid criss-crossing the halls.",
};

const dayLabel = (date) => (state.event.days || []).find((d) => d.date === date)?.label || date;

/* Day chips over the hall lens — the itinerary's assignments projected onto
   the route, so "today's stops, in walking order" is one tap. Hidden until at
   least one stop sits on a day, and in the day lens, where the grouping
   already answers the question. */
function renderPlanDayFilter() {
  const row = $("#plan-day-filter");
  if (!row) return;
  const seen = new Set();
  state.exhibitors.filter(hasSaved).forEach((ex) => {
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
        ["all", "All days", "Every stop on your list"],
        ...assigned.map((d) => [d.date, d.label.slice(0, 3), `Only stops planned for ${d.label}`]),
        ...(seen.has("none") ? [["none", "Unassigned", "Only stops without a day yet"]] : []),
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
  $("#plan-sub").textContent = hall ? PLAN_SUBS.hall : PLAN_SUBS.day;
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
    </div>
    <p class="info-foot">
      <span>Compiled from published sources, not from gamescom itself.</span>
      ${sourcesButton("event", "")}
    </p>`;
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
  $("#search").value = "";
  $("#playable-only").checked = false;
  $("#confirmed-only").checked = false;
  $("#saved-only").checked = false;
  $("#hide-played").checked = false;
  persistPrefs();
  renderMarkControls();
  renderFilters();
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
  const find = () => $(`#exhibitor-grid .card[data-id="${CSS.escape(ex.id)}"]`);
  if (!find()) {
    resetFilters();
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
    if (!confirm(`Forget all ${n} saved item${n === 1 ? "" : "s"} and their day assignments? This can't be undone.`)) return;
    state.marks.saved = { exhibitors: new Set(), games: new Set() };
    state.itinerary = { exhibitors: new Map(), games: new Map() };
    persistMarks("saved");
    persistItinerary();
    onMarksChanged({ rebuild: true });
  });
  $("#clear-played").addEventListener("click", () => {
    const n = playedCount();
    if (!confirm(`Forget all ${n} played mark${n === 1 ? "" : "s"}? This can't be undone.`)) return;
    state.marks.played = { exhibitors: new Set(), games: new Set() };
    persistMarks("played");
    onMarksChanged({ rebuild: true });
  });
  $("#export-ics").addEventListener("click", downloadICS);
  bindShareDialog();
  bindSourcesDialog();
  /* One delegated listener covers every +, ✓, day and sources button in every
     view, including the ones that get re-rendered underneath it. */
  document.addEventListener("click", (e) => {
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
    }
    pruneItinerary();
    renderFilters();
    renderExhibitors();
    renderMarkControls();
    renderPriority();
    renderWristband();
    renderPlan();
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

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(routeFor(tab.dataset.view))));
  /* push:true here so an unknown or now-stale hash gets rewritten to the route
     actually on screen rather than being left lying in the address bar. */
  window.addEventListener("hashchange", () => {
    const incoming = takeIncomingList();
    const landing = parseHash();
    showView(incoming ? SAVED_ROUTE : landing.route);
    if (incoming) offerIncoming(incoming);
    else focusExhibitor(landing.params.get("ex"));
  });
}

async function main() {
  try {
    await loadData();
  } catch (err) {
    $("#exhibitor-grid").innerHTML = `<p class="empty">Failed to load data (${esc(err.message)}). If you opened this file directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }
  state.marks.saved = loadMarks("saved");
  state.marks.played = loadMarks("played");
  state.itinerary = loadItinerary();
  Object.assign(state, loadPrefs());
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
  renderExhibitors();
  renderPlanner();
  renderEvent();
  renderChangelog();
  const landing = parseHash();
  showView(incoming ? SAVED_ROUTE : landing.route || VIEWS[0], { push: false });
  if (!incoming) focusExhibitor(landing.params.get("ex"));
  if (offer) offerIncoming(offer);
  /* Last, so an import prompt is the thing on screen when both apply — that one
     is priority anyway, and it carries the only Add/Undo the visitor gets. */
  offerMove();
}

main();
