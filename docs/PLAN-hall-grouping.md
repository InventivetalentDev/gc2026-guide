# Implementation plan: route view / hall grouping

Implements idea **#3** from `docs/FEATURE-IDEAS.md` (currently on the
`claude/gamescom-planning-features-i6yk0c` branch):

> Group the saved list by hall in a sensible walking order (5 → 6 → 7 → …) so
> users aren't criss-crossing Koelnmesse. Even a simple "your day, ordered by
> hall" view saves real walking time.

The bonus SVG hall map from that idea is **out of scope** here — see
[Future work](#future-work-svg-hall-map) for why and what it would take.

Everything below was verified against the current tree: line references,
CSS tokens, exhibitor ids, and the multi-booth game titles all check out.

## What gets built

A new **"Route by hall"** section on the Visit planner tab. It takes
everything on your saved list (booths you saved, plus booths showing a game
you saved), groups it by hall in hall-number order, and renders each hall as
a signage-style block of stops. Work down the list and you walk the halls
once, in one direction, instead of criss-crossing.

No new files, no schema changes, no service-worker changes — the feature is
a section in `index.html`, a code section in `js/app.js`, and a style block
in `css/style.css`, all of which are already in the offline precache.

## Design decisions

### 1. It lives on the Planner tab, as new section 02

Insert the route between "The five days" (01) and "Queue priority" (which
becomes 03; crowd tips become 04). The planner then reads as a narrative:
*when to go → where to walk → what to queue first → general tips*.

Rejected alternatives:

- **A fifth tab.** The tab strip (`index.html:49-52`) is exactly full at
  four tabs on a 360px phone, and a new view means touching `VIEWS`,
  `showView()`/`routeFor()` and the manifest shortcuts for no user benefit.
  The route is *derived* content — a projection of the saved list — and the
  planner is where that pattern already lives (the priority table's
  saved-only mode).
- **Grouping headers in the exhibitor grid.** Cards are ~40-line articles in
  a responsive grid that collapses to one column at 620px; full-width group
  headers would need grid hacks at every breakpoint and muddy the existing
  saved-only filter semantics.

### 2. Walking order is derived numerically — no data file, no fake precision

A tiny helper in `js/app.js` is the single source of truth for order:

```js
/* Hall-number order ≈ walking order at Koelnmesse: the entertainment halls
   sit in one ascending run and x.1/x.2 are upper levels of hall x, so
   "finish 6 and 6.1 before walking to 7" falls straight out of parseFloat.
   We have no verified floor-plan or entrance data, so this deliberately
   claims nothing more precise. If that ever lands, replace hallRank with an
   explicit HALL_ORDER array (plus per-hall entrance hints) — everything
   else reads order only through this function. */
const hallRank = (hall) => (hall ? parseFloat(hall) : Infinity);
```

For the actual data (halls `6`…`10.2`) numeric ascending *is* the sensible
walk: consecutive halls are physically adjacent, and `parseFloat` orders
sub-halls right after their ground floor (`6` → `6.1` → `7` → …). It also
handles any hall a future data refresh introduces (`5.2`, `11.1`) without a
code change.

What we know about the real venue, and why we don't encode more: most
visitors enter through the **North entrance next to Hall 8** (typical flow
8 → 6/7/9 → 10), while the South entrance sits at the Köln Messe/Deutz
station. So no single linear order is "correct" — it depends on where you
start. The section copy therefore says *"in hall-number order"*, not
"shortest walk", and the comment above marks the seam where a verified
order would slot in.

No `data/halls.json`: a new JSON file costs a `loadData()` entry, an
`sw.js` `DATA` entry, and an `UPDATING.md` schema section — for ~10 values
that change only if Koelnmesse rebuilds. The README's "data updates never
require code changes" rule governs editorial booth data; venue geometry is
static code territory.

### 3. Grouping semantics

- **Membership:** the existing `hasSaved(ex)` predicate (`js/app.js:128`) —
  booth saved *or* any of its games saved. That is the one established
  "on my list" test; don't invent a second one.
- **Buckets, in order:**
  1. Numbered halls, ascending by `hallRank`.
  2. **Offsite** — tag `offsite` (today: `tencent-worlds-of-play`), with the
     `booth` field ("Wassermannhalle (offsite)") as the location text.
  3. **Location TBA** — `hall === null`, not offsite, not absent (today:
     `focus`, `kuro-games`).
  4. Saved-but-**absent** entries (tag `not exhibiting`: `playstation`,
     `wargaming`, `take-two`, `thq-nordic`) get one dim footnote line —
     *"On your list but not on the show floor: …"* — not full rows, and not
     silence. Silently dropping a saved item reads as a bug; a full row
     invites walking to a booth that doesn't exist.
  - Check `not exhibiting` **before** `offsite`: wargaming carries both
    (`offsite event` + `not exhibiting`), and this matches `hallMarker()`
    precedence (`js/app.js:291-313`).
- **Within a hall:** crowd desc, then name — the house default comparator
  (`js/app.js:254`). True within-hall walking order is unknowable without
  booth coordinates; crowd-desc encodes real advice instead ("do this
  hall's worst queue first").
- **Each row shows** (modeled on the priority rows, `js/app.js:510-525`):
  the exhibitor name; the booth code in mono (`booth TBA` when the hall is
  known but the stand isn't, with the established `· unconf.` suffix when
  `locationConfirmed` is false); a compact crowd chip (`Q4 · Busy` from
  `CROWD_LABELS`, colored via `data-level`); the saved-game chips (reuse
  the `.priority-saved` / `.priority-game` markup and CSS verbatim); and
  `bmButton("exhibitor", ex.id, ex.name)` for one-tap save/remove — the
  delegated click listener (`js/app.js:714-717`) picks it up with zero
  extra wiring.
- **Multi-booth games are a feature, not a bug:** a saved game shown at two
  booths (e.g. *Alien: Isolation 2* at Xbox in 7.1 and SEGA/Atlus in 7)
  produces a stop in *both* halls — that's how you pick the shorter queue.
- **Group headers** are signage-style: mono uppercase "HALL" kicker, the
  big number, and a stop count. A count line above the board ("9 stops ·
  5 halls") mirrors `#priority-count`; only real halls count toward the
  hall number so it stays honest.

### 4. Empty state and discoverability

- Empty state, toggled exactly like `#priority-empty` (`js/app.js:532-536`):
  *"Nothing saved yet — hit + on a booth or game over on the Exhibitors
  tab, and your stops will line up here hall by hall."*
- Optional, severable: a "Route by hall →" button next to `#clear-saved` in
  the exhibitors toolbar foot (`index.html:96`), shown whenever
  `savedCount() > 0`, that calls `showView("planner")` and scrolls to the
  section. Deliberately **no** `#route` hash route — `showView()` rewrites
  unknown hashes to the default view, so a pseudo-route would need
  `routeFor()` special-casing for marginal value.

## Implementation steps

### Step 1 — `index.html`: section markup + renumbering

After the `#day-guide` div (line 113), insert:

```html
<section id="route-section">
  <h3 class="section-title"><span class="section-num">02</span> Route by hall</h3>
  <p class="section-sub">Your saved stops grouped by hall, in hall-number order — work down the list to avoid criss-crossing the halls.</p>
  <div class="route-controls">
    <span class="result-count" id="route-count"></span>
  </div>
  <div id="route-list" class="route-board"></div>
  <p class="empty hidden" id="route-empty"></p>
  <p class="route-absent hidden" id="route-absent"></p>
</section>
```

Renumber the later sections: `section-num` 02 → 03 on "Queue priority"
(line 115), 03 → 04 on "General crowd tips" (line 124). Nothing else
references section numbers.

Optional (decision 4): add
`<button class="reset hidden" id="goto-route" type="button">Route by hall →</button>`
after `#clear-saved` (line 96).

### Step 2 — `js/app.js`: the route section

New banner section after `renderPriority()` (line 541), before
`/* ---------- event info ---------- */`:

- `hallRank()` as in decision 2.
- `const isAbsent = (ex) => (ex.tags || []).includes("not exhibiting");`
  and `const isOffsite = (ex) => (ex.tags || []).includes("offsite");`
- `routeGroups()` (~25 lines): filter `state.exhibitors` by `hasSaved`;
  split off absent entries; group the rest into a `Map` keyed
  `isOffsite(ex) ? "offsite" : ex.hall ? String(ex.hall) : "tba"`; order
  keys by `hallRank` with `offsite` then `tba` appended; sort each group
  with `(a, b) => (b.crowd || 0) - (a.crowd || 0) || a.name.localeCompare(b.name)`.
  Returns `{ groups: [{ key, label, items }], absent: [names] }` with
  labels `Hall ${key}` / `Offsite` / `Location TBA`.
- `renderRoute()` (~40 lines): build the board as template-literal HTML —
  per group a `.route-hall` header (kicker, number, `${n} stop${n === 1 ? "" : "s"}`)
  followed by `.route-item` rows:

```js
const mine = savedGames(ex);
const loc = ex.booth
  ? ex.booth + (ex.locationConfirmed || isOffsite(ex) ? "" : " · unconf.")
  : ex.hall ? "booth TBA" : "location TBA";
return `<div class="route-item" data-saved="${isSaved("exhibitor", ex.id)}">
  <span class="route-name">${esc(ex.name)}</span>
  <span class="route-booth">${esc(loc)}</span>
  <span class="route-crowd" data-level="${ex.crowd || 0}">Q${ex.crowd || "?"} · ${esc(CROWD_LABELS[ex.crowd] || "?")}</span>
  ${bmButton("exhibitor", ex.id, ex.name)}
  ${mine.length ? `<span class="priority-saved">…same chip row as renderPriority (js/app.js:518-524)…</span>` : ""}
</div>`;
```

  Every interpolated value goes through `esc()`. Write the board with
  `keepingFocus($("#route-list"), …)` (`js/app.js:191`) so keyboard focus
  survives the re-render. Toggle `#route-list` / `#route-empty` like the
  priority table does; fill `#route-count` and the `#route-absent`
  footnote; hide the footnote when no saved exhibitor is absent.

### Step 3 — `js/app.js`: wire four call sites

Add `renderRoute();` immediately after each existing `renderPriority();`:

1. `onBookmarksChanged()` (line 163) — with a one-line comment: the route
   always rebuilds because a toggle changes row *membership* (the grid's
   patch-in-place shortcut doesn't apply); `keepingFocus` covers focus.
2. `renderPlanner()` (line 496) — this is the boot path; `main()` needs no
   change.
3. The `#clear-saved` handler (line 710).
4. The `storage` handler (line 724) — cross-tab sync.

If shipping `#goto-route`: bind it in `bindControls()`
(`showView("planner"); $("#route-section")?.scrollIntoView();`) and toggle
its visibility in `renderSavedControls()` (`js/app.js:205-210`).

### Step 4 — `css/style.css`: route block + breakpoints

New banner block after the priority styles (line 745), existing tokens only
(`--border`, `--rule-soft`, `--ground-2/-3`, `--warn`, `--alert`,
`--signal`, the mono kicker pattern):

- `.route-board` — bordered, radius, `overflow: hidden`.
- `.route-hall` — flex signage header on `--ground-3`: `.route-hall-kicker`
  (mono, uppercase, dim), `.route-hall-num` (bold, tabular-nums),
  `.route-hall-count` (mono, `margin-left: auto`).
- `.route-item` — grid row
  (`grid-template-columns: minmax(150px, 1.2fr) minmax(110px, 1fr) auto auto`),
  `--ground-2` background, `--rule-soft` divider; the `.bm` button pinned
  to the last column; `[data-saved="true"]` gets the
  `inset 3px 0 0 var(--signal)` accent (same as `.priority-item`); the
  `.priority-saved` chip row spans `grid-column: 1 / -1`.
- `.route-name` / `.route-booth` (mono) / `.route-crowd` with
  `[data-level="4"]` → `--warn`, `[data-level="5"]` → `--alert`.
- `.route-absent` — dim footnote.
- In the existing `@media (max-width: 860px)` block: stack the row
  (`grid-template-columns: 1fr auto auto`, booth code on its own line).
  Verify at a real 360px viewport during implementation; the 620px block
  likely needs nothing.

### Step 5 — docs

- `docs/UPDATING.md`, editorial rules: one new bullet — the tags
  `not exhibiting` and `offsite` are load-bearing for the planner's route
  view (`not exhibiting` → excluded from the route, footnote only;
  `offsite` → the Offsite bucket, with `booth` as the location text). Use
  those exact strings.
- `sw.js` needs **no change**: no new files, and `js/app.js` /
  `css/style.css` are already in the `SHELL` precache (`sw.js:32-33`).
- Optional at ship time: `data/changelog.json` entry + `data/meta.json`
  rev bump ("New: Route by hall on the Visit planner"), per the UPDATING.md
  procedure.

## Verification (manual test script)

Serve with `python3 -m http.server` from the repo root; start with the
`gc2026.saved.v1` localStorage key cleared.

1. **Empty state** — Planner tab shows section 02 with the empty message,
   no board; sections read 01/02/03/04.
2. **Ordering** — save `hoyoverse` (6.1), `embark` (6), `xbox` (7.1),
   `square-enix` (8), `bilibili` (10.1), `razer` + `indie-arena-booth`
   (10.2). Expect Hall 6 → 6.1 → 7.1 → 8 → 10.1 → 10.2; within 10.2, Razer
   (crowd 3) before Indie Arena Booth (crowd 2).
3. **Game-only membership + multi-booth** — clear all; save only the game
   *Alien: Isolation 2* from Xbox's card. Expect stops at **both** Xbox
   (Hall 7.1) and SEGA/Atlus (Hall 7), each with the saved-game chip and a
   "+" button (the booth itself isn't saved).
4. **Buckets** — save `tencent-worlds-of-play` → Offsite group, location
   "Wassermannhalle (offsite)". Save `focus` → Location TBA, last. Save
   `playstation` and `wargaming` → no rows; footnote lists both.
5. **Unconfirmed markers** — `netease` (7.1, unconfirmed, no booth) →
   "booth TBA"; `ggg-poe2` (hall 6, unconfirmed) → "· unconf." suffix.
6. **Live updates** — a route row's "−" removes it and updates groups,
   counts and the priority table with no console errors; `#clear-saved`
   from the Exhibitors tab empties the route; with two tabs open, toggling
   in one updates the other (storage event).
7. **Focus** — Tab to a route "+" button, press Enter: the board
   re-renders and focus returns to the equivalent button.
8. **Offline** — load once, go offline in DevTools, reload: the route
   renders from cache.
9. **Responsive** — 360px wide: rows wrap per the 860px rules, no
   horizontal scroll.
10. **Escaping** — names/booths render through `esc()`; no raw HTML from
    JSON strings reaches the DOM.

## Future work: SVG hall map

Deferred deliberately. There is no accurate coordinate source: the repo has
no floor geometry, `event.json`'s area vocabulary doesn't even match the
exhibitor hall values, and official hall plans are copyrighted renderings
(2026's isn't final anyway). An honest version would take: a hand-traced
schematic SVG of the hall *blocks only* (no booth positions — those are
unobtainable), shipped as a file added to the `sw.js` `SHELL` list,
highlighting driven from the same `routeGroups()` output, and a visible
"schematic, not to scale" label. `hallRank()` is the single seam a real
walking order (with entrance hints) would replace.

## Open questions

1. **Section order** — route as 02 (before Queue priority) is the
   recommendation; making it 03 instead is a two-character change.
2. **Walking-order accuracy** — hall-number order is defensible but
   unverified against the final 2026 layout. First-hand knowledge (which
   entrance you'll actually use) can be encoded later as an explicit
   `HALL_ORDER` array in one place.
3. **Tag spelling** — the Offsite bucket keys off the literal tag
   `offsite`; wargaming's `offsite event` would not match (irrelevant today
   because it's also `not exhibiting`, but worth normalizing in a data rev).
4. **One-tap remove for game-only stops** — a stop that's on the route only
   via saved games shows "+" (save the booth), so removing it means
   unsaving its games individually. Consistent with the priority table
   today; per-chip remove buttons would fix both views if it grates.
5. **`#goto-route` button** — severable if the toolbar foot feels crowded
   on small screens.
