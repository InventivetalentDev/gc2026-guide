# "Today" mode — implementation plan

## Context

`docs/PLAN-played-it-tracking.md` closes its opening section by naming what the
`✓` was a prerequisite for: *idea #7 ("Today" mode: what's still unplayed)*.
Both halves of that prerequisite have since shipped — the day assignments in
`gc2026.itinerary.v1` and the played marks in `gc2026.played.v1` — and nothing
puts them together.

Today the mid-show question costs four deliberate moves: open the Visit planner,
scroll past the five-days board to *Your plan*, flip the lens to **By hall**, tap
the day chip for the day it is, and turn on **Hide played**. Every one of those
is a thing you have to know exists, and the answer they compose is the one thing
a visitor standing in Hall 8 at 11:00 actually wants. The app already knows what
day it is. It should just say.

Constraint, unchanged: fully static, no build step, no backend, works offline.
Today stores nothing — it is a lens over the three keys the planner already
reads.

## Design decisions

- **A view, not a section.** "Mode" is the right word for it: during the show the
  front of the app changes. It gets a fifth tab, a `#today` route, and it is the
  landing view when a bare address is opened on a show day that has stops on it.
  This is the opposite call from **Hide played**, which the played-it plan
  deliberately kept off the router — that was a preference on a list you are
  already looking at, and this is the thing you open cold at the West entrance.
- **It exists only during the show.** The tab, the view and the route all appear
  on the five show days and are gone the rest of the year. A tab reading
  "gamescom is not running" for 360 days is chrome that earns nothing, and
  `#today` off-show lands on the planner — the section Today is a lens on —
  rather than on a page that explains itself. The tab wears a live dot rather
  than an index number, because it is not part of the standing 01–04 sequence.
- **No launcher shortcut**, for the same reason inverted: `manifest.webmanifest`
  is a fixed year-round artifact, launchers already truncate its five entries,
  and a sixth that dead-ends for most of the year is a bad trade for a tab that
  is on screen anyway once the show starts.
- **It leads only when it has something to lead with.** Landing on Today is
  conditional on the day having stops; otherwise the exhibitor grid keeps the
  front door. An empty Today is a worse first screen than a list of booths, and
  an address that names a view still wins over both.
- **The clock is read in the show's timezone, not the device's.** A phone still
  set to another continent would otherwise open Wednesday's plan on Thursday
  morning, and count the wrong hours to closing. One `Intl.DateTimeFormat` pass
  in `Europe/Berlin` yields both the date and minutes-since-midnight, so "which
  day is it" and "how long until the doors" cannot disagree. Hours come from the
  machine-readable `open`/`close` in `data/event.json` — the two fields the
  calendar export already writes — so a schedule change stays a data edit.
- **Stops with no day cannot appear.** That falls straight out of "Today is a
  lens", and it is the one thing about the feature a visitor could otherwise be
  quietly wrong about. So it is counted out loud under the list, with the way to
  the planner beside it.
- **Played stops fold, they do not vanish.** `Hide played` removes rows outright,
  which is right for a filter and wrong for a progress screen: a mis-tapped `✓`
  mid-hall needs to be one tap from being taken back. They go into a `<details>`
  fold that keeps its open state across re-renders, and the fold's own count is
  its label.
- **Nothing that measures what is done takes `--signal`.** The rule the played-it
  plan set holds here: the progress meter and the Done fold are muted, and the
  one orange thing on the screen is the stop you have not walked to yet — the
  "go here first" strip, which is advice rather than a record.
- **The first-stop strip names the stop and its queue level, and stops there.**
  A booth's `visitAdvice` is four sentences of editorial prose; pasted into a
  strip meant to answer "which one first" it buries the answer. The advice
  already sits on the card and in the queue-priority row.
- **The route rows are the plan's rows.** `routeRow()` and `routeHallHeader()`
  come out of `renderRoute()` and are shared, and `routeGroups()` takes the day
  and the hide-played flag as arguments defaulting to the view state. Today is
  the hall lens scoped to one date; a second copy of that markup would drift the
  moment either view grew a field.

## Implementation

### 1. `js/app.js` — the show clock

`SHOW_TZ` plus `showNow()` returning `{ date, minutes }`, with a device-clock
fallback for an engine without the IANA database (an hour out beats no Today at
all). `showDay()` is the single "does Today exist" predicate; `dayStatus()` and
`dayStatusLine()` turn `open`/`close` into *doors at 10:00 · 2h to go* / *open
now · closes 20:00 · 3h 40m left* / *closed for today · Friday opens 10:00*, and
the last day gets its own line.

### 2. `js/app.js` — the hall lens, generalised

`routeGroups({ day, hidePlayed })` — both were reads of view state — and it now
returns the set-aside stops themselves (`done`) rather than only their count, so
the fold can list them. `routeRow()`, `routeHallHeader()` and `routeBoard()` come
out of `renderRoute()` unchanged.

### 3. `js/app.js` — `renderToday()`

Header strip, progress meter, closed-business note (reusing the plan's
`plan.closedGroupWarn`), the first-stop strip, the route board, the Done fold,
the unplaced count and the two doors out. Hooked into `onMarksChanged()`,
`onItineraryChanged()`, `renderBookmarkViews()`, the `storage` listener, the boot
render queue and `showView()`; plus a `visibilitychange` listener, the only one
in the app, because Today is the only surface that ages.

### 4. `index.html`, `css/style.css`

The tab (first, `hidden` until `renderTodayTab()` says otherwise) and
`#view-today`. `.tab` sets `display: flex`, which beats the UA sheet's `[hidden]`
rule whatever the specificity, so that needs saying out loud; and the tab row's
left edge has to align with the content whichever tab currently starts it.

### 5. `keepingFocus()`

One fix it needed: "survived the re-render" has to mean *reachable*. Ticking a
stop moves its row into the Done fold, which still holds that very button, and
`.focus()` inside a shut `<details>` silently drops to `<body>`. `offsetParent`
does not catch it — a closed fold hides its content without taking it out of
layout — so the test is `offsetParent` **and** not inside `details:not([open])`.

### 6. `sw.js`

`VERSION` to `v10`. A fifth tab and a fifth `<section>` in `index.html`, both
driven entirely by `js/app.js`: mismatched halves fail in both directions, and a
mode that exists for five days should not spend one of them waiting for a
revalidation. The route is guarded in `showView()` as well, so the bad pairing
degrades instead of throwing.

## Verification

Serve the site and drive it with the clock moved into the show week —
`tools/preview-today.mjs` is that, wrapped up, and it is also the only way to see
the feature at all before Aug 26. Playwright's `page.clock.setFixedTime` is enough:
nothing in the app reads the date except `showNow()` and the countdown, so faking
the timers as well would only put the search debounce at risk.

Moving the dates in `data/event.json` instead does **not** work as a shortcut —
the day prose is keyed by ISO date in `data/i18n/{en,de}.json`, so the access
pill, the hours and the day notes all go blank and `tools/check-i18n.mjs` fails
with "show day … has no prose".

1. **Off-show** — the tab is absent, a bare address lands on the exhibitor grid,
   and `#today` lands on the planner. The Exhibitors tab keeps the row's left
   edge.
2. **Show day** — the tab appears; a bare address lands on Today when the day has
   stops and on the grid when it does not.
3. **The list** — today's stops in hall order, a game saved at a booth showing up
   as that booth's "Saved here" chip, a stop assigned to another day absent.
4. **The `✓`** — moves the row into the Done fold, updates the count and meter,
   and leaves keyboard focus on the next stop's `✓` rather than on `<body>`.
   Unticking from inside the fold puts the row back and leaves the fold open.
5. **Status line** — before doors, open, after close, a trade day, and the last
   day of the show.
6. **Closed business area** — a business-hall stop planned for the weekend draws
   the warning above the list.
7. **Two tabs** — a `✓` or a day assignment in one updates the other.
8. **German** — the whole surface, including the "{h} Std. {m} Min." spans.
9. **Storage blocked** — Safari private mode: Today renders its empty state and
   nothing throws.
10. **360px** — the status line takes its own row under the weekday, and the page
    does not scroll sideways.
