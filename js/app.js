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
  buildShareCodeMap();
}

/* ---------- saved & played marks ----------

   Two independent sets: exhibitor ids, and games keyed by normalised title
   rather than by booth. Eight titles this year are shown at two booths at once
   (Alien: Isolation 2 sits at both Xbox and SEGA), so a game mark applies at
   every booth showing the same title. */

const MARK_KEYS = { saved: "gc2026.saved.v1", played: "gc2026.played.v1" };
const IT_KEY = "gc2026.itinerary.v1";
const PREFS_KEY = "gc2026.prefs.v1";

const gameKey = (title) => String(title).trim().toLowerCase().replace(/\s+/g, " ");

function loadMarks(mark) {
  try {
    const raw = JSON.parse(localStorage.getItem(MARK_KEYS[mark]) || "{}");
    return {
      exhibitors: new Set(Array.isArray(raw.exhibitors) ? raw.exhibitors : []),
      games: new Set(Array.isArray(raw.games) ? raw.games : []),
    };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return { exhibitors: new Set(), games: new Set() };
  }
}

function persistMarks(mark) {
  try {
    const marks = state.marks[mark];
    localStorage.setItem(
      MARK_KEYS[mark],
      JSON.stringify({ exhibitors: [...marks.exhibitors], games: [...marks.games] })
    );
  } catch {
    /* out of quota or storage denied — marks still work for this session */
  }
}

/* Both view preferences live here rather than beside the marks they act on:
   "hide played" is a lens on the list, the same kind of thing as the age
   filter, and neither survives being tangled up with the marks themselves. */
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const age = AGE_FILTERS.some(([value]) => value === raw.age) ? raw.age : "all";
    return { age, hidePlayed: raw.hidePlayed === true };
  } catch {
    /* corrupt entry, or storage blocked entirely (Safari private mode) */
    return { age: "all", hidePlayed: false };
  }
}

function persistPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ age: state.age, hidePlayed: state.hidePlayed }));
  } catch {
    /* out of quota or storage denied — the choice still works for this session */
  }
}

const markSet = (mark, kind) => (kind === "game" ? state.marks[mark].games : state.marks[mark].exhibitors);
const isMarked = (mark, kind, key) => markSet(mark, kind).has(key);
const isSaved = (kind, key) => isMarked("saved", kind, key);
const isPlayed = (kind, key) => isMarked("played", kind, key);
const savedGames = (ex) => (ex.games || []).filter((g) => isSaved("game", gameKey(g.title)));
const markCount = (mark) => state.marks[mark].exhibitors.size + state.marks[mark].games.size;
const savedCount = () => markCount("saved");
const playedCount = () => markCount("played");

/* An exhibitor counts as saved if you saved the booth itself *or* any game
   they're showing — the publisher is how you actually get to the game. */
const hasSaved = (ex) => isSaved("exhibitor", ex.id) || savedGames(ex).length > 0;

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
  renderItinerary();
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
   equivalent button whenever one survives the re-render. */
function keepingFocus(container, render) {
  const el = document.activeElement;
  const inside = el && container.contains(el);
  const sel = !inside
    ? null
    : el.dataset.itDay
      ? `[data-it-kind="${CSS.escape(el.dataset.itKind)}"][data-it-key="${CSS.escape(el.dataset.itKey)}"][data-it-day="${CSS.escape(el.dataset.itDay)}"]`
      : el.dataset.mark && el.dataset.bmKey
      ? `.bm[data-mark="${CSS.escape(el.dataset.mark)}"][data-bm-kind="${CSS.escape(el.dataset.bmKind)}"][data-bm-key="${CSS.escape(el.dataset.bmKey)}"]`
      : el.classList.contains("more-games")
        ? `.more-games[data-id="${CSS.escape(el.dataset.id)}"]`
        : null;
  render();
  if (sel) container.querySelector(sel)?.focus();
}

function renderMarkControls() {
  const saved = savedCount();
  const played = playedCount();
  $("#saved-count").textContent = saved ? `(${saved})` : "";
  $("#priority-saved-count").textContent = saved ? `(${saved})` : "";
  $("#played-count").textContent = played ? `(${played})` : "";
  $("#clear-saved").classList.toggle("hidden", saved === 0);
  $("#clear-played").classList.toggle("hidden", played === 0);
  $("#hide-played").checked = state.hidePlayed;
  $("#priority-hide-played").checked = state.hidePlayed;
  $("#share-list").classList.toggle("hidden", encodedSavedTokens().length === 0);
}

/* ---------- sharing ----------

   A shared URL contains only stable exhibitor ids and short hashes of the
   normalised game titles. Both maps are rebuilt from the guide data, so the
   link needs no server and works from the offline cache. */

const shareCodes = {
  exhibitorIds: new Set(),
  gameToCode: new Map(),
  codeToGame: new Map(),
};

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function buildShareCodeMap() {
  shareCodes.exhibitorIds = new Set(state.exhibitors.map((ex) => ex.id));
  shareCodes.gameToCode.clear();
  shareCodes.codeToGame.clear();

  const gameKeys = [
    ...new Set(state.exhibitors.flatMap((ex) => (ex.games || []).map((game) => gameKey(game.title)))),
  ].sort();
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
}

function encodedSavedTokens() {
  const exhibitors = [...state.marks.saved.exhibitors]
    .filter((id) => shareCodes.exhibitorIds.has(id))
    .sort();
  const games = [...state.marks.saved.games]
    .map((key) => shareCodes.gameToCode.get(key))
    .filter(Boolean)
    .sort();
  return [...exhibitors, ...games];
}

function buildShareLink() {
  /* Search params are not part of the guide state and can contain referral or
     campaign data that should not hitch a ride in somebody else's link. */
  const base = `${location.origin}${location.pathname}`;
  return `${base}#saved?l=${encodedSavedTokens().join(".")}`;
}

function parseHash() {
  const raw = location.hash.slice(1);
  const i = raw.indexOf("?");
  return {
    route: i === -1 ? raw : raw.slice(0, i),
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
  if (route !== SAVED_ROUTE || !params.has("l")) return null;

  const payload = params.get("l") || "";
  rememberPending(payload);
  /* Consume the payload before any rendering can synchronise the route, so a
     refresh cannot import twice and the link is not left lying in the bar. */
  history.replaceState(null, "", "#saved");
  return resolveTokens(payload);
}

/* An offer this tab was made but never answered — a dismissed prompt, or a
   reload before the visitor decided. */
function pendingIncomingList() {
  let payload = null;
  try {
    payload = sessionStorage.getItem(PENDING_KEY);
  } catch {
    /* storage denied */
  }
  return payload === null ? null : resolveTokens(payload);
}

const incomingCount = (incoming) => incoming.exhibitors.size + incoming.games.size;
const itemLabel = (n) => `${n} saved item${n === 1 ? "" : "s"}`;

function unresolvedNote(n) {
  if (!n) return "";
  return ` ${n === 1 ? "1 isn't" : `${n} aren't`} in the guide any more.`;
}

function renderBookmarkViews() {
  renderExhibitors();
  renderMarkControls();
  renderPriority();
  renderWristband();
  renderItinerary();
}

function applyIncoming(incoming) {
  const before = {
    exhibitors: new Set(state.marks.saved.exhibitors),
    games: new Set(state.marks.saved.games),
  };
  incoming.exhibitors.forEach((id) => state.marks.saved.exhibitors.add(id));
  incoming.games.forEach((key) => state.marks.saved.games.add(key));
  persistMarks("saved");
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
  /* Undo can take away items the visitor already placed on a day. */
  pruneItinerary();
  renderBookmarkViews();
  showToast("Shared list import undone.", null, null, { priority: true, replace: true });
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
  if (encodedSavedTokens().length === 0) {
    const before = applyIncoming(incoming);
    showToast(
      `Loaded ${itemLabel(total)} from a shared link.${stale}`,
      "Undo",
      () => restoreBookmarks(before),
      { priority: true }
    );
    return;
  }

  const newCount =
    [...incoming.exhibitors].filter((id) => !state.marks.saved.exhibitors.has(id)).length +
    [...incoming.games].filter((key) => !state.marks.saved.games.has(key)).length;
  /* Someone re-opening a link they already imported, or the other half of a
     phone/desktop pair that is already in sync. There is nothing to add, so
     offering the button would only produce an import of nothing. */
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
        `Added ${itemLabel(newCount)} from the shared link.${stale}`,
        "Undo",
        () => restoreBookmarks(before),
        { priority: true, replace: true }
      );
    },
    { priority: true }
  );
}

function renderShareDialog() {
  const link = buildShareLink();
  const input = $("#share-link");
  input.value = link;
  const shareable = encodedSavedTokens().length;
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
    renderShareDialog();
    dialog.showModal();
  });
  input.addEventListener("focus", () => input.select());
  $("#close-share").addEventListener("click", () => dialog.close());

  /* Backdrop clicks target the dialog itself. Check the coordinates as well,
     so a click on padding inside the panel does not dismiss it. */
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
  renderItinerary();
}

/* ---------- filtering & sorting ---------- */

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

function itineraryLocation(ex, { booth = true } = {}) {
  if ((ex.tags || []).includes("not exhibiting")) return "Absent — no booth";
  if (!ex.hall) return "Hall TBA";
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

function itineraryItemLocation(item) {
  if (item.kind === "game") {
    return item.at.length
      ? item.at.map((ex) => `${ex.name} — ${itineraryLocation(ex, { booth: false })}`).join(" · ")
      : "Booth TBA";
  }
  const crowd = item.ex.crowd || 0;
  return `${itineraryLocation(item.ex)} · Queue ${crowd ? `${crowd}/5 ${CROWD_LABELS[crowd] || "?"}` : "unknown"}`;
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
    <span class="it-loc">${esc(itineraryItemLocation(item))}</span>
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

  const board = $("#itinerary");
  keepingFocus(board, () => {
    board.innerHTML = groups.join("");
  });
  board.classList.toggle("hidden", items.length === 0);
  $("#itinerary-empty").classList.toggle("hidden", items.length > 0);
  /* Saved-but-empty happens when every saved id fell out of a data refresh —
     "nothing saved yet" would be a lie next to a visible saved counter. */
  $("#itinerary-empty").textContent = savedCount()
    ? "Nothing you saved is in the current lineup anymore — exhibitors come and go between data updates."
    : "Nothing saved yet — hit + on a booth or game on the Exhibitors tab.";
  $("#export-ics").classList.toggle(
    "hidden",
    !items.some((item) => validDays.has(assignedDay(item.kind, item.key)))
  );
}

function renderPlanner() {
  const ev = state.event;
  $("#day-guide").innerHTML = (ev.days || [])
    .map((d) => `<div class="day-row">${dayHeaderInner(d)}</div>`)
    .join("");

  renderItinerary();
  renderPriority();
  renderWristband();

  $("#crowd-tips").innerHTML = (ev.crowdTips || []).map((t) => `<li>${esc(t)}</li>`).join("");
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
  const busiest = [...state.exhibitors]
    .filter((e) => (e.crowd || 0) >= 4)
    .sort((a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name));
  /* Ranks come from the unfiltered order: "07" has to keep meaning "seventh
     worst queue of the show", not "seventh row you happen to be looking at". */
  const scoped = state.prioritySavedOnly ? busiest.filter(hasSaved) : busiest;
  const played = scoped.filter(hasPlayed).length;
  const list = state.hidePlayed ? scoped.filter((e) => !hasPlayed(e)) : [...scoped];
  list.sort((a, b) => hasPlayed(a) - hasPlayed(b));

  const rows = list
    .map((e) => {
      const mine = savedGames(e);
      return `<div class="priority-item" data-saved="${hasSaved(e)}" data-played="${hasPlayed(e)}">
        <span class="priority-rank">${String(busiest.indexOf(e) + 1).padStart(2, "0")}</span>
        <span class="priority-name">${esc(e.name)}${hasAdult(e) ? ageBadge(boothAgeStatus(e)) : ""}</span>
        <span class="priority-loc">${e.hall ? `Hall ${esc(e.hall)}` : "TBA"}</span>
        <span class="priority-advice">${esc(e.visitAdvice || e.crowdNote || "")}</span>
        <span class="row-actions">
          ${markButton("played", "exhibitor", e.id, e.name)}
          ${markButton("saved", "exhibitor", e.id, e.name)}
        </span>
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

if (toast) $("#toast-dismiss").addEventListener("click", () => hideToast());
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

function setHidePlayed(on) {
  state.hidePlayed = on;
  $("#hide-played").checked = on;
  $("#priority-hide-played").checked = on;
  persistMarks("played");
  renderExhibitors();
  renderPriority();
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
  /* One delegated listener covers every +, ✓ and day button in every view,
     including the ones that get re-rendered underneath it. */
  document.addEventListener("click", (e) => {
    const day = e.target.closest("[data-it-day]");
    if (day) {
      assignToDay(day.dataset.itKind, day.dataset.itKey, day.dataset.itDay);
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
    if (e.key === null || e.key === PREFS_KEY) Object.assign(state, loadPrefs());
    pruneItinerary();
    renderFilters();
    renderExhibitors();
    renderMarkControls();
    renderPriority();
    renderWristband();
    renderItinerary();
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
    renderExhibitors();
    renderPriority();
    syncHash();
  });

  /* Desktop has room to keep the filters open; a phone does not. */
  $("#toolbar-more").open = window.matchMedia("(min-width: 760px)").matches;

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(routeFor(tab.dataset.view))));
  /* push:true here so an unknown or now-stale hash gets rewritten to the route
     actually on screen rather than being left lying in the address bar. */
  window.addEventListener("hashchange", () => {
    const incoming = takeIncomingList();
    showView(incoming ? SAVED_ROUTE : parseHash().route);
    if (incoming) offerIncoming(incoming);
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
  showView(incoming ? SAVED_ROUTE : parseHash().route || VIEWS[0], { push: false });
  if (offer) offerIncoming(offer);
}

main();
