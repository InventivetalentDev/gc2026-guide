# Implementation plan: 18+ / age-rating flag and filter

Implements idea **#8** from `docs/FEATURE-IDEAS.md` (currently on branch
`claude/gamescom-planning-features-i6yk0c`).

## Context

Several booths at gamescom gate demos behind an age check: you show ID, get a red
18+ wristband, and only then may you queue. Today that fact lives in free text —
`"18+ wristband required"` in a Call of Duty note, `"18+ likely"` on METRO 2039,
one `"18+"` tag on Plaion, one sentence in EA's `visitAdvice`. Prose can't be
filtered and can't be planned against, so it serves nobody:

- A parent or an under-18 visitor cannot hide demos they can't play.
- Someone who *wants* those demos has no list of which booths need the wristband,
  and finds out at the front of a 90-minute queue instead of at the entrance.

Turning it into a structured field fixes both: the exhibitor grid gets a
three-way age filter, game rows get an `18+` badge, and the Visit planner gains a
wristband section listing every affected booth so the wristband gets collected on
arrival.

Constraints stay as they are: fully static, no build step, no backend, works
offline from the service-worker cache.

## Decisions taken

Three open questions were put to the maintainer and went unanswered, so the plan
takes the recommended option on each; each is cheap to revisit.

1. **Data shape** — `age` + `ageStatus` on a game, not a bare boolean. The
   current notes already distinguish "18+ wristband required" from "18+ likely",
   and a boolean throws that away.
2. **Filter mode** — tri-state (All / Hide 18+ / 18+ only), and "Hide 18+" also
   drops the offending rows *inside* a card. Booth-level-only hiding would remove
   all 22 remaining Xbox titles because of one Call of Duty.
3. **Planner** — yes, ship the wristband section. The filter is only half of what
   the idea asks for.

## Data model

`data/exhibitors.json`, on a **game** object (both fields optional; absent means
no known restriction):

```jsonc
{
  "title": "Call of Duty: Modern Warfare 4",
  "status": "confirmed",
  "playable": true,
  "age": 18,                 // minimum age to play this demo AT gamescom
  "ageStatus": "confirmed",  // confirmed | expected  (default: "expected")
  "note": "…"
}
```

On an **exhibitor** object, an optional booth-wide override for a gated zone with
no single game to hang it on:

```jsonc
{ "ageRestricted": true }
```

Semantics — write these into the editorial rules so the refresh routine follows
them:

- `age` describes the **gate on the show floor**, not the USK rating of the
  finished game. A USK-18 title shown as a non-interactive trailer is not gated.
- `ageStatus: "confirmed"` needs a source (exhibitor statement, official
  listing). Everything inferred from the game's own rating stays `"expected"` —
  the UI marks it as unconfirmed rather than overclaiming.
- `age` is a number so `16` is expressible later, but only `>= 18` gates anything
  in the UI today (`AGE_GATE = 18`).

### Seed data

Directly supported by what's already in the file — do these, and fold the now
redundant prose into the structured field rather than duplicating it:

| Exhibitor | Game | age / ageStatus | Evidence in repo |
|---|---|---|---|
| `xbox` | Call of Duty: Modern Warfare 4 | 18 / confirmed | note: "18+ wristband required" |
| `xbox` | METRO 2039 | 18 / expected | note: "18+ likely" |
| `plaion` | METRO 2039 | 18 / expected | description + `visitAdvice` + `18+` tag |
| `ea` | Battlefield 6 (seasonal content) | 18 / expected | `visitAdvice`: "you'll need the 18+ red wristband" |

Then a research pass over the remaining lineup for demos likely to be gated —
candidates worth checking include *Gears of War: E-Day*, *Alien: Isolation 2*
(Xbox and SEGA — flag both, same title key), *The Blood of Dawnwalker* (Xbox and
Bandai Namco), *Silent Hill: Townfall*, *Warhammer 40,000: Space Marine 3*,
*Hunt: Showdown 1896*, *Grand Theft Auto VI*. Flag only what a source supports,
as `expected`; leave the rest absent. **Don't guess a whole lineup adult** — an
over-broad flag makes "Hide 18+" useless.

Keep Plaion's existing `"18+"` tag: tags are free-text search fodder, and losing
it would break a search someone already uses.

## Code changes

### `js/app.js`

**Helpers** — next to the bookmark helpers (`gameKey`, `savedGames`, `hasSaved`,
around line 121), so the age predicates read the same way:

```js
const AGE_GATE = 18;
const isAdult   = (g) => Number(g.age) >= AGE_GATE;
const adultGames = (ex) => (ex.games || []).filter(isAdult);
const hasAdult  = (ex) => ex.ageRestricted === true || adultGames(ex).length > 0;
/* One place decides which rows exist under the current age filter — the card,
   the query haystack and the playable check must all agree. */
const visibleGames = (ex) =>
  state.age === "hide" ? (ex.games || []).filter((g) => !isAdult(g)) : (ex.games || []);
```

**State** — add `age: "all"` to `state` (values `all` | `hide` | `only`).

**Filtering** — in `filtered()` (line 243), before the query check:

- `only`: drop exhibitors where `!hasAdult(ex)`.
- `hide`: drop exhibitors where `ex.ageRestricted === true`, and drop ones whose
  whole lineup is gated (`ex.games?.length && !visibleGames(ex).length`). A booth
  with no games at all stays — it carries no flagged content.
- `state.playableOnly` must test `visibleGames(ex)`, not `ex.games`, or a booth
  survives on a demo that is currently hidden.

**Search** — `matchesQuery()` (line 214) builds its haystack from
`visibleGames(ex)` and appends `"18+"` when `hasAdult(ex)`, so typing `18+` finds
gated booths uniformly instead of only the one carrying the tag.

**Filter chips** — `renderFilters()` (line 436) gains a third block over a static
list, wired exactly like the type and hall chips:

```js
const AGE_FILTERS = [["all", "All"], ["hide", "Hide 18+"], ["only", "18+ only"]];
```

rendered into a new `#age-filters` container, chips carrying `data-age` and class
`chip age-chip`.

**Badges** — `gameRow()` (line 315) emits, after the `playable` badge:

```html
<span class="badge badge-age" data-age-status="expected"
      title="18+ expected — not confirmed">18+</span>
```

`title` is `"18+ wristband required"` when confirmed. `card()` (line 337) puts the
same badge in the lineup `block-head` next to the `N playable` stamp when
`hasAdult(ex)` and the filter isn't `hide`, so the card announces the gate before
you expand 22 rows. `card()` must build `games` from `visibleGames(ex)` so the
"+ N more" count, the `playableCount` and the saved-game tail all reflect the
filter.

**Filter plumbing** — `filtersActive()` (line 232), `renderFilterSummary()`
(line 423, add `"hide 18+"` / `"18+ only"`), and the `#reset-filters` handler
(line 727) each need the new key. Reset returns `age` to `"all"`: it is presented
as a filter, so it clears like one — the sticky preference below is what carries
a parent's choice between visits.

**Persistence** — a second, tiny localStorage record so the choice survives a
reload, mirroring `loadBookmarks`/`persistBookmarks` (lines 93–119) including
their `try/catch` for blocked storage:

```js
const PREFS_KEY = "gc2026.prefs.v1";   // { age: "all" | "hide" | "only" }
```

Load in `main()` (line 754) before the first `renderFilters()`/`renderExhibitors()`,
save on every chip click. Extend the existing `storage` listener (line 719) —
which already tolerates a `null` key — to re-read prefs as well as bookmarks so a
second tab follows along.

**Planner section** — new `renderWristband()`, called from `renderPlanner()`
(line 476) and from `onBookmarksChanged()` (line 156) so the saved highlight stays
live. It renders into a new `#wristband-list`, reusing the `.priority-table` /
`.priority-item` markup shape and `bmButton()` so a booth can be saved from there:

- Lead line: booths with 18+ demos check ID and hand out a red wristband — get it
  on arrival, not at the front of the queue.
- One row per exhibitor with `hasAdult(ex)`, sorted by hall then name: name,
  `Hall N · booth`, the gated titles, `data-saved` for the inset signal bar,
  and an `18+ expected` marker when no gated title on that booth is confirmed.
- The whole section (`h3` + list) hides when nothing is flagged, so a data file
  with no age flags renders exactly as today.

**Priority list** — `renderPriority()` (line 501) gains the same small `18+`
badge after `priority-name` when `hasAdult(e)`, tying the queue plan to the
wristband section above it.

### `index.html`

- New toolbar row in the filter drawer, after the Hall row (lines 87–90):
  `<span class="row-label">Age</span><div class="filter-row" id="age-filters"></div>`.
- Planner: insert the wristband section as `03` between Queue priority and
  General crowd tips (lines 115–125) — `section-title`, `section-sub`,
  `<div id="wristband-list" class="priority-table">` — and renumber crowd tips to
  `04`.
- Footer legend (lines 154–159) gains one line: `18+` — demo is age-gated, ID and
  red wristband needed.

### `css/style.css`

- `.badge-age` beside `.badge-playable` (line 499): `--alert` (`#f2564f`) for
  `data-age-status="confirmed"`, `--warn` for `expected` — the same
  confirmed/unconfirmed colour language the hall marker and status badges already
  use. Outline only, no fill: per the README the tilted stamp is the one
  hand-applied element, and badges stay quiet down a long lineup.
- `.chip.age-chip.active` — follow `.chip.hall-chip.active` (line 337).
- `.wristband-*` rows: reuse `.priority-item` and add only the grid-template
  override the different column set needs, plus the phone breakpoint near
  line 981.

### Docs & data bookkeeping

- `docs/UPDATING.md` — add `age` / `ageStatus` / `ageRestricted` to the schema
  block (lines 60–85), an editorial rule stating the gate-not-USK semantics and
  the confirmed-needs-a-source rule, and a bullet in the refresh checklist
  (step 3, line 19) so the scheduled routine keeps the flags current.
- `README.md` — extend the filters bullet (line 8) and the feature list with the
  age filter and the wristband section.
- `data/meta.json` — bump `revision` to 5, `lastUpdated` to the commit date.
- `data/changelog.json` — one visitor-readable entry for rev 5.
- `sw.js` — **no** `VERSION` bump: nothing is renamed or removed, and
  `docs/UPDATING.md` ("The offline cache") is explicit that `css/`, `js/` and data
  changes propagate on their own.

## Verification

```sh
# 1. data still parses (the check from docs/UPDATING.md step 7)
node -e "['exhibitors','event','meta','changelog'].forEach(f=>JSON.parse(require('fs').readFileSync('data/'+f+'.json')))"

# 2. every age flag is well-formed
node -e "
const ex=require('./data/exhibitors.json');
ex.flatMap(e=>(e.games||[]).map(g=>[e.id,g])).forEach(([id,g])=>{
  if(g.age===undefined) return;
  if(typeof g.age!=='number') throw new Error(id+': age must be a number — '+g.title);
  if(g.ageStatus && !['confirmed','expected'].includes(g.ageStatus))
    throw new Error(id+': bad ageStatus — '+g.title);
});
console.log('age flags ok');"

# 3. serve and click through
python3 -m http.server 8000   # http://localhost:8000
```

Manual pass (no test suite in the repo — the project is plain static files):

1. **Badges** — Xbox card shows `18+` on Call of Duty (red, tooltip "wristband
   required") and on METRO 2039 (amber, "expected"); the lineup header shows the
   booth-level `18+`.
2. **Hide 18+** — Xbox stays in the grid with Call of Duty and METRO 2039 gone,
   the `+ N more` count drops by two, and the `N playable` stamp decreases.
   Plaion (whole lineup gated) disappears entirely.
3. **18+ only** — grid reduces to Xbox, EA, Plaion (plus whatever the research
   pass added).
4. **Combinations** — `18+ only` + `Playable demos` + Hall 7 narrows correctly;
   the filter summary line spells out every active constraint; `Clear filters`
   restores everything including the age chip.
5. **Search** — typing `18+` returns the gated booths; with `Hide 18+` on,
   searching `call of duty` returns nothing rather than an Xbox card with no
   matching row.
6. **Persistence** — set `Hide 18+`, reload: still set. Open a second tab, change
   it there, watch the first tab follow. In a private window with storage blocked
   the page must still render (the `try/catch` path).
7. **Planner** — the wristband section lists Xbox / EA / Plaion with halls and
   gated titles; saving Xbox from the exhibitor grid immediately marks its
   wristband row; the `18+` marker appears on matching queue-priority rows.
8. **Empty-data guard** — temporarily strip every `age` field and confirm the
   wristband section and card badges disappear cleanly, with the grid unchanged
   from today.
9. **Offline** — load once, go offline (DevTools), reload: filter, badges and
   wristband section all still work off the cached data.
10. **Accessibility** — tab through the age chips (visible focus ring, keyboard
    activatable); confirm the `18+` badge carries a `title` that a screen reader
    surfaces, and that `Hide 18+` doesn't strand focus when the card under the
    cursor is removed.

Line numbers refer to the files as of the commit that added this plan.
