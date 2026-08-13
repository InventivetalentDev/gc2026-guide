# Implementation plan: day-by-day itinerary builder

Plan for feature idea #1 in `docs/FEATURE-IDEAS.md` (branch
`claude/gamescom-planning-features-i6yk0c`):

> The planner currently gives generic per-day advice, but saved booths/games
> aren't tied to a day. Let users assign each saved item to a specific day
> (Thu/Fri/…), showing that day's hours and crowd notes inline, so the saved
> list becomes an actual plan. Bonus: "export to calendar" (.ics) button.

Everything below respects the site's constraints: fully static, no build
step, no backend, works offline. Line numbers refer to the tree as of
revision 4 (Aug 10 data update).

## Design decisions

- **UI home** — a new "Your itinerary" section in the existing Planner view,
  inserted between "The five days" and "Queue priority". Not a fifth tab: no
  hash-routing, manifest-shortcut, or screenshot changes needed, and the
  feature is an upgrade of the planner, which is how FEATURE-IDEAS frames it.
- **Storage** — new localStorage key `gc2026.itinerary.v1`:

  ```json
  { "exhibitors": { "xbox": "2026-08-27" }, "games": { "alien: isolation 2": "2026-08-28" } }
  ```

  A map of item key → ISO day date, mirroring the two bookmark kinds in
  `gc2026.saved.v1`. One day per item ("assign each saved item to *a*
  specific day"). In memory: two `Map`s on `state.itinerary`.
- **Item identity** mirrors bookmarks exactly: exhibitor `id` slug, and
  `gameKey(title)` (`js/app.js:91`) for games — deliberately *not*
  booth-scoped, per the rule in `docs/UPDATING.md`. An itinerary game row
  lists every booth running the title (nine titles appear at two booths),
  so "pick the shorter queue" still works inside the plan.
- **Assignment control** — a row of five day chips (Wed–Sun) per item.
  Clicking the active chip unassigns; one control, same language as the
  `+`/`−` save button. Wired through the existing single delegated document
  click listener via `data-it-kind` / `data-it-key` / `data-it-day`
  attributes, so chips work in any re-rendered markup with no re-binding.
- **Orphans** — unsaving an item drops its assignment. Pruning happens at
  the three mutation sites (bookmark toggle, clear-saved, `storage` event),
  never as a side effect of rendering; `loadItinerary()` also filters
  defensively (key must currently be bookmarked, date must exist in
  `event.days`), which covers corrupt storage.
- **Wednesday (trade & media only)** — assignment is allowed (trade
  visitors and Wildcard holders are real users), but the Wed chip renders
  dashed with a warning title, and the Wednesday group header already
  carries the red `trade` access pill plus the sold-out note from
  `event.json`.
- **Absent booths** — `not exhibiting` tag → "Absent — no booth";
  `hall: null` → "Hall TBA". Chips stay enabled; the row states reality and
  planning around it stays the user's call.
- **No new files** — all code goes into `js/app.js` (~200 lines) and
  `css/style.css` (~70 lines). `sw.js` SHELL and VERSION stay untouched
  (stale-while-revalidate rewrites js/css in place; adding no files means
  nothing to precache).
- **.ics export** — included as its own commit, droppable without touching
  the rest. Needs machine-readable hours: add `open`/`close` fields to
  `event.json` days (prose `hours` stays for display) — data changes over
  code changes, per the repo philosophy.

## 1. Data model and storage (`js/app.js`)

New constant below `BM_KEY` (`js/app.js:89`):

```js
const IT_KEY = "gc2026.itinerary.v1";
```

New state field in the `state` literal (`js/app.js:4`):

```js
/* item-key → ISO day date; replaced from localStorage in main() */
itinerary: { exhibitors: new Map(), games: new Map() },
```

New `/* ---------- itinerary ---------- */` block after the bookmarks block
(~`js/app.js:210`), following the existing try/catch storage discipline
(degrades to session-only when storage is blocked, like
`loadBookmarks`/`persistBookmarks`):

```js
function loadItinerary()   // parse IT_KEY; keep entries whose key is bookmarked AND date ∈ event.days
function persistItinerary()
const itMap = (kind) => (kind === "game" ? state.itinerary.games : state.itinerary.exhibitors);
const assignedDay = (kind, key) => itMap(kind).get(key) || null;

function assignToDay(kind, key, date) {
  const map = itMap(kind);
  map.get(key) === date ? map.delete(key) : map.set(key, date);  // active chip toggles off
  persistItinerary();
  onItineraryChanged();
}

function pruneItinerary()  // drop entries whose key left state.bookmarks; persist only if changed
function onItineraryChanged() { renderItinerary(); }
```

## 2. Hook points into existing code (`js/app.js`)

| Site | Change |
|---|---|
| `main()` (~761) | `state.itinerary = loadItinerary();` after `state.bookmarks = loadBookmarks();` (after `loadData()`, so days exist to validate against) |
| `toggleBookmark` (149) | `pruneItinerary();` before `onBookmarksChanged();` |
| `onBookmarksChanged` (156) | append `renderItinerary();` |
| clear-saved handler (703) | reset `state.itinerary` to empty Maps, `persistItinerary()`, append `renderItinerary()`; the `confirm()` copy now mentions day assignments |
| `storage` listener (719) | also react to `IT_KEY`; reload itinerary, `pruneItinerary()`, `renderItinerary()` — cross-tab sync for free |
| delegated click listener (714) | add a branch: `e.target.closest("[data-it-day]")` → `assignToDay(...)` from its dataset |
| `renderPlanner` (476) | call `renderItinerary()` next to the existing `renderPriority()` call — the initial render |
| `keepingFocus` (191) | new selector branch for `el.dataset.itDay` → `[data-it-kind=…][data-it-key=…][data-it-day=…]`; the equivalent chip always exists after a row moves groups, so keyboard focus follows it |
| `bindControls` (678) | `#export-ics` click → `downloadICS` (commit 3) |

## 3. Markup and rendering

**`index.html`** — insert between `#day-guide` (line 113) and the "Queue
priority" heading (line 115), renumbering the later `section-num`s
(Queue priority 02 → 03, General crowd tips 03 → 04):

```html
<h3 class="section-title"><span class="section-num">02</span> Your itinerary</h3>
<p class="section-sub">Give each saved booth and game a day. Unassigned items sit at the top until you place them.</p>
<div class="itinerary-controls">
  <button class="reset hidden" id="export-ics" type="button">Export to calendar (.ics)</button>
</div>
<div id="itinerary" class="it-board"></div>
<p class="empty hidden" id="itinerary-empty"></p>
```

**`renderItinerary()`** — full `innerHTML` rebuild of `#itinerary` wrapped
in `keepingFocus`, built from an `itineraryItems()` model:

- saved exhibitors → `{ kind: "exhibitor", key, name, ex }`
- saved games → `{ kind: "game", key, name, at }` where `at` is every
  exhibitor whose `games` contain the key (original-casing title from the
  first match)

Grouping: an **Unassigned bucket first**, then one group per `event.days`
entry *that has items* — empty day groups are noise, since the day board in
section 01 already lists every day. Within a group, sort by crowd
descending then name, the same comparator as `renderPriority`, reinforcing
"hit high-queue booths first".

Day-group headers reuse the `.day-row` inner classes (`.day-when`,
`.day-dow`, `.day-date`, `.day-access`, `.day-hours`, `.day-note`) so each
group shows that day's hours, access pill, and crowd note inline — the core
of the feature ask — and aligns visually with section 01.

Item rows: a kind overline (Booth/Game), name, location
(`Hall 7.1 · A061/C060`; games list every booth: `Xbox — Hall 7.1 ·
SEGA/Atlus — Hall 9`), crowd level for exhibitors, the five day chips, and
a `bmButton()` so unsaving works right from the row (existing delegation
and `syncBookmarkUI` handle it with no extra code). Chip labels are
`d.label.slice(0, 3)` like the day board; active chips get
`aria-pressed="true"` and a "Remove from Thursday" title; every
interpolation goes through `esc()` (game keys contain `:` and `'`).

Empty states: nothing saved at all → hide the board, show
`#itinerary-empty` ("Nothing saved yet — hit + on a booth or game on the
Exhibitors tab."); saved but nothing assigned → just the Unassigned bucket.
`#export-ics` is visible only when at least one assignment exists.

Re-render scope: an assignment click re-renders only `#itinerary`;
save/unsave flows through the existing `onBookmarksChanged` fan-out.

**`css/style.css`** — new block after the day-board styles (~line 684),
design tokens only, no new colors/radii/fonts:

- `.it-board` — bordered shell like `.day-board`.
- `.it-group-head` — grid `92px 130px 1fr` mirroring `.day-row` so the day
  columns align with section 01; `--ground-3` header band.
- `.it-item` — the `.priority-item` recipe (grid row, `--ground-2`,
  `--rule-soft` separators).
- `.it-days` — flex chip row with wrap; `.day-chip.active` gets the
  signal treatment like `.hall-chip.active` (a day assignment is
  wayfinding, not a filter); `.day-chip[data-trade="true"]:not(.active)`
  dashed border + `--ink-dim`.
- 620 px breakpoint: stack `.it-item` into two rows (name + location /
  chips), matching how `.priority-item` collapses.

## 4. .ics export

**`data/event.json`** — add machine-readable entertainment-area hours to
every `days[]` entry, keeping the prose `hours` for display:

```jsonc
{ "date": "2026-08-27", …, "hours": "Entertainment 10:00–20:00",
  "open": "10:00", "close": "20:00" }
```

Values from the current prose: Wed 13:00–19:00 (the entertainment span),
Thu/Fri 10:00–20:00, Sat/Sun 09:00–20:00.

**`js/app.js`** — new `/* ---------- calendar export ---------- */` block:

- `icsEscape(s)` — escape `\` first, then `;` and `,`; strip `\r`; `\n` →
  literal `\n`.
- `icsFold(line)` — RFC 5545 folding at ≤ 75 **octets** per line
  (count with `TextEncoder` per character — descriptions contain en dashes
  and umlauts), continuation is CRLF + one space.
- `icsDateTimeUTC(d)` — `getUTC*` → `YYYYMMDDTHHMMSSZ`. Build times as
  `new Date(d.date + "T" + d.open + ":00+02:00")`; the hardcoded `+02:00`
  follows the `renderCountdown` precedent and is unconditionally correct
  for late August (CEST). Emitting UTC avoids shipping a VTIMEZONE block.
- `buildICS()` — one VEVENT per day with at least one assigned item:

  ```
  UID:gc2026-2026-08-27@gc2026-guide
  DTSTART:20260827T080000Z
  DTEND:20260827T180000Z
  SUMMARY:gamescom — Thursday plan (4 stops)
  LOCATION:Koelnmesse\, Cologne
  DESCRIPTION:Xbox (Microsoft) — Hall 7.1\, booth A061/C060 (queue 5/5)\nFable — at Xbox (Hall 7.1)\n…
  ```

  The UID is deterministic per day, so re-exporting after replanning
  replaces events on re-import instead of stacking duplicates. The
  description comes from the same `itineraryItems()` model the section
  renders. CRLF line endings throughout.
- **Stale-cache fallback**: the service worker serves `data/event.json`
  network-first with a cached fallback, so new `app.js` can meet an old
  cached `event.json` without `open`/`close`. Emit an all-day
  `DTSTART;VALUE=DATE` event in that case — never throw.
- `downloadICS()` — Blob (`text/calendar;charset=utf-8`) +
  `URL.createObjectURL` + `<a download="gamescom-2026-itinerary.ics">`;
  revoke the URL in a `setTimeout(…, 1000)` (Safari races immediate
  revocation). On iOS standalone PWAs the browser opens an import preview
  instead of downloading — that preview *is* the add-to-calendar flow.
- Opening Night Live is skipped in v1: `onl.date` is a display string
  ("Tue, Aug 25"), not ISO. Adding `"dateISO": "2026-08-25"` to `onl` and
  one more VEVENT is a ~10-line follow-up when wanted.

## 5. Commits, in order

1. `data: structured open/close hours per day for the calendar export` —
   `event.json` fields; `docs/UPDATING.md` schema block extended, plus an
   editorial-rule sentence noting game-title renames now also orphan day
   assignments (`gc2026.itinerary.v1`, same key rule as bookmarks). Pure
   data/docs; nothing reads the fields yet.
2. `feat: assign saved booths and games to a day on the visit planner` —
   sections 1–3 complete; fully functional without export.
3. `feat: export the day plan to calendar (.ics)` — section 4 plus
   `#export-ics` wiring and visibility.
4. `data: changelog + revision bump for the itinerary builder` —
   `changelog.json` entry (revision 5, visitor-readable bullets: assign to
   day, day hours inline, calendar export, "stays in this browser");
   `meta.json` revision 5 + `lastUpdated`; README features bullet and a
   short paragraph in the saved-list section mentioning
   `gc2026.itinerary.v1`. Optionally rerun `tools/make-screenshots.mjs`
   since the planner changed materially.

No `sw.js` changes in any commit.

## 6. Verification

JSON validity (what CI checks): `python3 -m json.tool` over each changed
`data/*.json`.

Manual, via `python3 -m http.server 8000`:

1. Fresh profile → planner shows the empty state; export button hidden.
2. Save Xbox (booth) and "Alien: Isolation 2" (game) → both appear
   Unassigned; the game row lists Xbox *and* SEGA/Atlus.
3. Assign Thu → row moves into a Thursday group showing
   "Entertainment 10:00–20:00" and the crowd note; chip goes
   signal-colored; keyboard focus survives the move (Tab to a chip, Enter).
4. Click Thu again → back to Unassigned. The Wed chip is dashed with a
   trade warning title but still assignable.
5. Save Wargaming and a `hall: null` exhibitor → "Absent — no booth" /
   "Hall TBA" rows render; chips work.
6. Reload → assignments persist. Corrupt the key
   (`localStorage.setItem('gc2026.itinerary.v1','garbage')`) → no console
   error, empty itinerary.
7. Two windows side by side → assignments sync via the `storage` event;
   unsaving in one drops the assignment in both; Clear saved empties both,
   and the confirm dialog mentions assignments.
8. Unsave from an itinerary row's `−` → the row leaves the section and the
   grid card un-fills.
9. Export with items on two days → validate the file (icalendar.org) or
   import into a calendar app; check CEST→UTC times (10:00 local =
   08:00Z), comma escaping in LOCATION, CRLF endings, no line over 75
   octets. Serve a day without `open` → all-day fallback event.
10. DevTools offline after one online load → planner, itinerary, and
    export all work offline.
