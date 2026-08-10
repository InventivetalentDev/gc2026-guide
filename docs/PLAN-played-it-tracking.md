# "Played it" tracking — implementation plan

## Context

`docs/FEATURE-IDEAS.md` item #4: *"By day two, the queue-priority list should
distinguish what's already done. A checkmark per game that greys it out and
re-sorts the priority list makes the planner useful across the whole visit."*

Today the guide is a pre-show tool. The saved list (`gc2026.saved.v1`, shipped in
c659c18) captures intent — what you want to see — but nothing captures progress.
On day three of a five-day show the queue-priority list still opens with the same
booth at rank 01 whether you queued for it on Wednesday or not, so the visitor has
to hold "already done" in their head. Marking things played turns the planner from
a one-shot plan into something that stays useful across the whole visit, and it is
the prerequisite for idea #7 ("Today" mode: *what's still unplayed*).

Constraint, unchanged: fully static, no build step, no backend, works offline.
Played marks are localStorage-only, exactly like the saved list.

## Design decisions

- **Games and booths can both be marked.** A booth is done if you ticked it
  directly **or** every game you saved at that booth is played — the exact mirror
  of the existing `hasSaved()` rule ("saved if the booth *or* any of its games is
  saved", `js/app.js:128`). Saving a fourth game at a done booth un-dones it, which
  is correct.
- **Every lineup row gets the ✓**, not just saved ones, so you can record a booth
  you wandered into. It sits back at the same `opacity: .45` the `+` already uses
  in a 23-title lineup.
- **Played booths sink to the bottom of the queue-priority list** and go dim, but
  keep their absolute rank ("07" still means seventh-worst queue of the show).
  A "Hide played" toggle removes them outright.
- **Played never takes the signal colour.** `--signal` is the visitor's own
  emphasis; done is the opposite of emphasis. The set state is a muted filled
  plate, and the row recedes. Worth a CSS comment — it will otherwise look like an
  oversight next to the orange saved plate.
- **No reordering in the exhibitor grid.** The sort dropdown owns that order;
  sinking played cards would contradict "Name A–Z". They dim in place, and
  "Hide played" removes them.

## Implementation

### 1. `js/app.js` — generalise bookmarks into two mark sets

The saved-list plumbing (`loadBookmarks`, `persistBookmarks`, `bmSet`, `bmButton`,
`toggleBookmark`, `syncBookmarkUI`, `js/app.js:82-210`) is already the exact shape
played needs. Generalise rather than duplicate ~60 lines:

```js
const MARK_KEYS = { saved: "gc2026.saved.v1", played: "gc2026.played.v1" };
state.marks = { saved: {exhibitors:Set, games:Set}, played: {exhibitors:Set, games:Set} };
```

- `gc2026.saved.v1` keeps its **exact key and `{exhibitors, games}` shape** — existing
  visitors' lists must load untouched. `gc2026.played.v1` reuses the same shape plus
  a `hidePlayed` boolean (see step 4).
- Rename to `loadMarks(mark)` / `persistMarks(mark)` / `markSet(mark, kind)` /
  `isMarked(mark, kind, key)` / `toggleMark(mark, kind, key)` / `markButton(...)` /
  `syncMarkUI()` / `onMarksChanged()`. Keep thin aliases `isSaved`/`isPlayed` so the
  render call sites stay readable.
- Games stay keyed by normalised title via the existing `gameKey()` — playing a game
  marks it at both booths showing it, which is right: you played it once.
- Derived booth state, next to `hasSaved()`:
  ```js
  const playedGames = (ex) => (ex.games||[]).filter(g => isPlayed("game", gameKey(g.title)));
  const hasPlayed = (ex) =>
    isMarked("played","exhibitor",ex.id) ||
    (savedGames(ex).length > 0 && savedGames(ex).every(g => isPlayed("game", gameKey(g.title))));
  ```

**Three things that will silently break if missed:**

- `keepingFocus()` (`js/app.js:191`) rebuilds a selector from `el.dataset.bmKey`.
  It must include the mark, or pressing ✓ returns focus to the `+` on the same row.
- The `storage` listener (`js/app.js:719`) early-returns on any key that isn't
  `BM_KEY`. It must accept both keys.
- `onBookmarksChanged()` (`js/app.js:156`) only re-renders the grid when
  `savedOnly` is on. It must also re-render when `hidePlayed` is on, since a tick
  can now remove the card the button lives on.

### 2. Buttons and markup

- `markButton("played", kind, key, name)` renders `✓` in **both** states — the plate
  carries the state, matching the note at `js/app.js:130-132`. `aria-pressed`, plus
  `aria-label`/`title` from a `markLabel()` sibling of `bmLabel()`: *"Mark Fable as
  played"* / *"Mark Fable as not played"*.
- `gameRow()` (`js/app.js:315`): add the ✓ before the `+` and add
  `data-played="${...}"` alongside the existing `data-saved`.
- `card()` (`js/app.js:337`): a stretched icon-only ✓ plate immediately left of the
  existing wide `+ Save` in `.exh-head`, and `data-played` on the `<article>`.
  Icon-only keeps the head from crowding the exhibitor name on a phone.
- The single delegated click listener (`js/app.js:714`) matches `[data-mark]` and
  dispatches on `dataset.mark` — one listener still covers every button in both views.

### 3. `js/app.js` — queue-priority list

In `renderPriority()` (`js/app.js:501`):

- `busiest` and the rank source (`busiest.indexOf(e) + 1`) stay exactly as they are.
- After the existing saved-only filter, drop played rows when `state.hidePlayed`.
- Sink, don't reshuffle: `list.sort((a, b) => hasPlayed(a) - hasPlayed(b))` — `Array#sort`
  is stable, so crowd order survives inside each group.
- `data-played` on `.priority-item`; add the ✓ next to the existing `+`.
- Count line: append `· N played` when any are played.
- Empty state when everything is hidden: *"Everything on your list in the high-queue
  group is played — nice work."*

### 4. `js/app.js` + `index.html` — the "Hide played" toggle

One piece of state, two checkboxes, kept in sync the way `setSavedOnly()`
(`js/app.js:652`) already does it — `setHidePlayed(on)` updates both boxes and
re-renders both views.

- `index.html:91-98` "Only show" row: `<label class="toggle"><input type="checkbox"
  id="hide-played"> Hide played <span class="saved-count" id="played-count"></span></label>`
  and a `Clear played` reset button beside `Clear saved`.
- `index.html:117-120` `.priority-controls`: a second `Hide played` checkbox.
- `filtered()` (`js/app.js:243`): `if (state.hidePlayed && hasPlayed(ex)) return false;`
- `filtersActive()` and `renderFilterSummary()` gain `"played hidden"`.
- `#reset-filters` clears it along with the others.
- Persist it inside `gc2026.played.v1` — on day three you should not have to re-tick
  it every morning. The loader tolerates the field being absent.
- `Clear played` reuses the `confirm()` pattern from `#clear-saved` (`js/app.js:703`).
- **Not** a route. `#saved` exists because it is the thing you open cold from a
  launcher shortcut; "hide played" is a preference on a list you are already looking at.

### 5. `css/style.css`

Extend the "saved list" block (`css/style.css:533-595`) into "saved & played", with
a comment explaining why played deliberately does not take `--signal`.

- `.bm[data-mark="played"][aria-pressed="true"]` — filled plate in `--ink-dim` with
  `--ground` ink. Muted, not orange.
- `.game[data-played="true"]` — title and platform codes to `--ink-dim`, status dot
  muted. **No strikethrough**: struck text down a 23-row lineup reads as noise; dim
  plus a filled ✓ is enough. Must also override
  `.game[data-saved="true"] .game-title` (`css/style.css:587`) so played wins over saved.
- `.card[data-played="true"]` — body to ~`.62` opacity and drop the `--signal` border
  it gets from `[data-saved="true"]` (`css/style.css:579`).
- `.priority-item[data-played="true"]` — dim, and replace the orange inset rule
  (`css/style.css:709`) with a muted one.
- Wrap the two buttons on a priority row in a flex `.row-actions` span rather than
  adding a grid column — `.priority-item .bm { grid-column: -2/-1 }` and the phone
  breakpoint at `css/style.css:980` then need no changes.
- Do **not** reuse `.stamp` for a "PLAYED" mark. Its comment
  (`css/style.css:501-503`) says it is deliberately the only hand-applied element.

### 6. Docs and data

- `README.md`: a "Played tracking" subsection after "The saved list" (`README.md:78`)
  — the derived-booth rule, the muted-plate rationale, the priority sink with absolute
  ranks, and that it is a second localStorage key that never leaves the device.
- `docs/UPDATING.md:50`: the existing editorial rule says renaming a game orphans it in
  saved lists. Extend it — a rename now orphans the played mark too.
- `data/changelog.json` + `data/meta.json`: new entry at `revision: 5`, dated the day it
  ships, written for visitors ("Tick ✓ on a game once you've played it…"), matching the
  voice of the rev-3 saved-list entry.
- `manifest.webmanifest`: regenerate both screenshots with `tools/make-screenshots.mjs`
  (Chromium is at `/opt/pw-browsers`; do not run `playwright install`) and update the
  two `label` strings, which currently advertise "per-game saving". Same precedent as
  the saved-list commit.
- `sw.js`: **no change.** No new files, so the precache list is unchanged, and `css/`
  and `js/` are stale-while-revalidate — a deploy touching only those propagates without
  bumping `VERSION`.

## Verification

Serve the static site and drive it in a browser:

```
python3 -m http.server 8000    # from the repo root
```

1. **Saved list still loads.** Before touching anything, save a booth and two games on
   `main`, then load the branch — the list must come back intact from `gc2026.saved.v1`.
2. **Game ✓** — tick a game at Xbox: the row dims, the ✓ fills muted (not orange),
   and the same title dims at the second booth showing it (Alien: Isolation 2 is at
   both Xbox and SEGA).
3. **Derived booth done** — save exactly two Xbox games, play both: the Xbox card and
   its queue-priority row go done with no booth-level tick. Save a third: both un-done.
4. **Priority sink** — played rows drop below unplayed ones, keep their rank numbers,
   and crowd order holds inside each group. "Hide played" removes them; the count reads
   `· N played`.
5. **Filter interaction** — with "Hide played" on in the exhibitor grid, ticking ✓ on a
   card removes it without throwing, and "Clear filters" restores it.
6. **Keyboard** — tab to a ✓, press Space; focus must land back on that ✓, not the `+`.
7. **Two tabs** — tick in one, the other updates via the `storage` event.
8. **Offline** — load, kill the network in DevTools, reload: ticks made offline persist,
   both toggles work.
9. **Storage blocked** — Safari private mode / DevTools with localStorage denied: marks
   work for the session, nothing throws.
10. **Phone width** — at 360px, two buttons on a game row and the ✓ + `+ Save` pair in
    the card head must not wrap or crowd the exhibitor name.

Commit to `claude/played-it-tracking-plan-j1n8u8` and push with `-u origin`.
