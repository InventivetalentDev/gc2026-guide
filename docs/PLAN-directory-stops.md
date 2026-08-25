# Implementation plan: saving the booths the guide has no card for

Picks up the seam left by `docs/PLAN-trade-exhibitors.md`. That feature
answered "the guide walks past ~820 exhibitors in halls 2–4" by letting a
directory row be a saved, planned stop under a `dir:<slug>` key. The same
sentence is true one hall over: the guide writes 170 cards, and the official
directory files 1,785 rows, 823 of which stand only in the entertainment
halls. Most of those are indie studios sharing one of hall 10's collective
stands, and the guide has nothing to say about any of them.

It does not need anything to say about them. What someone standing in hall
10.2 wants is not a review of 11 bit studios — it is a note that they are
here, on that stand, so the walk to it is on the plan with everything else.
That is a save, and the machinery for it already existed and was gated to
five halls.

**Status: built.** `js/map.js` joins the rest of the directory to the stands
it files, the stand sheet offers those names as saveable stops,
`js/app.js` resolves the resulting keys like any other, and every row in the
Full directory section grows a save button. No new storage key, no new
identity shape, no new plan concept.

## What is being built

- **A picker on the stand sheet.** Tap a stand in an entertainment hall and
  the sheet lists whoever the official directory files there that the guide
  has no card for, each saveable on its own. Past ten names it grows a
  filter box; saved names sort to the top.
- **A save button on every row of the Full directory**, which is the other
  way anyone finds one company among 1,785 — by typing its name.
- **Nothing else.** A booth saved this way is the same stop the trade
  feature already built: it appears in Your plan's day and hall lenses,
  takes a day, lights its stand, gets numbered in the route overlay,
  exports to `.ics`, and rides a share link.

## Why the existing rails carry it

`dir:<slug>` was never really a business-hall idea; it was "a booth with no
card of its own", and `isBusinessHall` was standing in for that. Three
things were already true and stayed true:

- `resolveSavedExhibitor()` already resolved **any** `dir:` key it found in
  the directory — only `tradeRecord()`'s business-hall filter stopped an
  entertainment row coming back with a hall and a booth.
- `inBusinessArea()` already asked the **location**, not the record's
  `type`. So an indie stop gets no "trade & media only" label and no
  weekend-closure warning without anything being added to keep it out.
- `migrateDirAliases()` already folds a `dir:` key onto a curated card the
  day one claims that slug. A pin made this year on a booth the guide cards
  next month becomes that card's stop, day assignment and all.

## Design decisions

### 1. Saveable is not covered

This is the decision the whole feature turns on, and the one that could
have quietly wrecked the map.

`docs/PLAN-hall-map.md` decision 7 spends the map's brightest channel on
coverage: **guide-covered names bright, official-only names dim, empty
stands code-only** — "coverage is visible at a glance and honest about
gaps". Feeding 823 directory rows into the same index that decides that
would turn most of the entertainment halls bright while the guide still had
nothing to say about them. The gaps would stop showing, and the map would
be lying about the one thing that page promises to be honest about.

So the join is **two indexes**, not one:

- `state.byStand` — who the guide *covers* here. Curated cards, plus the
  directory rows the business halls are browsed through, exactly as before.
  It decides the drawn name, the `covered` class, and the sheet's editorial
  block.
- `state.listedByStand` — who Koelnmesse *files* here that the guide writes
  nothing about. It decides one thing: that you can save them, and that a
  stand you saved one on lights up.

The business halls keep the old behaviour because there the directory *is*
the content — that is what a trade badge buys and what the banner says. In
the entertainment halls the cards are the content and the directory is a
personal-reference layer. The asymmetry is real, and it lands exactly on the
`trade` flag that already existed.

Verified as a property rather than trusted: across all eight entertainment
levels, **zero** directory rows reach `byStand` (see the verification
script). The `covered` counts under each hall are unchanged.

### 2. A stand is not a stop — a company is

606 of the entertainment halls' directory stands sit on a *shared* stand,
and the shape is extreme: hall 10.2's Indie Arena Booth is one footprint
with 172 companies filed on it, and four more stands carry 27–40 each. So
"save this stand" is not a question anybody is asking. "Save which of
these" is.

Saving `exs[0]` — which is what the business halls' Save button does, and
what a first cut here would have inherited — would have picked whichever
company sorted first out of 172. That is not a stop; it is a coin toss with
a name on it.

Hence the picker. Three properties make it usable rather than merely
present:

- **Saved rows sort to the top**, so the list opens on what you have
  already decided.
- **Past ten rows it grows a filter box.** Scrolling 172 names to find 11
  bit studios is worse than typing four letters of it.
- **It is patched, never rebuilt, after a save.** You came here to mark
  several; a rebuild would take away both the filter you typed and the
  place you had scrolled to. So a save inside the picker updates that one
  row and the sheet's badges, and nothing else moves. (The filter *is*
  cleared when the stand changes — a query typed against one stand would
  silently hide most of the next one's occupants, which reads as the guide
  knowing less than it does.)

**One occupant is the exception.** A stand with exactly one uncarded
company and no card gets that company's name as the sheet's heading and the
sheet's own Save button, and no list at all — a picker of one is a worse
answer than a button. There are ~330 of those.

### 3. The map does not rename a stand you pinned

A stand carrying a saved directory row lights signal orange like any other
stop, but the **name drawn on it does not change**: it stays the guide's, or
the official filing's, or nothing. Two reasons, and the second is the real
one:

- On a 172-way stand there is no "your" name to draw — you may have saved
  six.
- The label layer is decided by a collision pass (`docs/PLAN-hall-map.md`
  decision 9) whose verdicts are cumulative across zoom bands. Making the
  drawn name depend on the saved set would mean re-running that pass on
  every save, and a label that appears and disappears as you mark things is
  exactly the failure that decision exists to prevent.

The sheet names what you saved, the badge says "Saved", and the plan board
lists it by name. That is three places; the fourth would cost the map's
label stability.

### 4. A curated identity outranks a directory row for a share token

Share links write every saved item as a 5-character FNV-1a prefix, and v2
resolves collisions by exclusion — a prefix claimed twice is dropped for
every claimant, so an item is silently unshareable rather than
mistranslated.

Widening the claim from business rows to all 1,785 takes the namespace from
~220 identities to **2,164**, and finds the first real collision in it:
`044kb` is claimed by both the game *Tides of Annihilation* and
`dir:sharkbomb_studios`. `docs/PLAN-trade-exhibitors.md` avoided that one by
scoping the check to rows the guide mints tokens for; this feature mints a
token for that row, so it has to be faced.

Even exclusion would have been the wrong answer: it would have cost a
curated game its shareability to pay for an uncarded booth. So the rule is
exclusion **with precedence** — a curated identity beats a directory row
claiming the same prefix, and only the row is dropped. Two curated claimants
still take each other down, which is the case worth shouting about.

Encoder and decoder read the one map `buildShareCodeMap()` builds, so they
cannot disagree about who won. `tools/fetch-directory.py` mirrors the rule
and reports the two outcomes apart: a contested row is a note, a contested
card is a warning. Today: **2,164 identities, one row demoted, no
unresolved collisions.**

### 5. The directory is precached, and fetched for every hall

It was runtime-cached and fetched only when trade mode was on or a `dir:`
key was saved. Now every hall reads it — it is what names the 823
entertainment exhibitors and what lets a stand you pinned come up lit — so
`loadDirectory()` runs unconditionally at boot (not awaited, as before) and
`data/directory.json` joins the hall plans in the service worker's `DATA`
list.

~50 KB gzipped, against the ~45 KB the thirteen hall levels already cost.
The argument is the same one that put them there: reception inside
Koelnmesse is poor, and "which stand was that studio on" is a question you
ask in exactly the hall where you cannot ask the network.

### 6. A day survives the directory not having arrived yet

`renderRoute()` drops a `?day=` nobody planned, and it runs on the first
hall render — before the directory fetch it deliberately does not wait for
has landed. With a plan built only from curated cards that never mattered.
With a plan whose stops live in the directory, it threw the day away
permanently: the redraw when the rows land re-runs the check, but the
parameter is gone by then, and the plan board's "Map →" arrives with its
overlay silently off.

So the drop is held while a `dir:` key is saved and the directory is still
in flight — the same reading `tradeDataPending()` takes in the guide, where
a saved key with no directory loaded is *data that has not arrived*, not a
stop that went away. A `?day=` nobody planned is still dropped, once there
is something to judge it against.

(This was a latent bug in the trade feature, reachable by opening a business
hall with a planned trade booth. It is now reachable from every hall, which
is how it was found.)

### 7. No played tick on a directory row

`markButton` is offered for `saved` only, in the picker and in the Full
directory. Played reads "I have seen the lineup", and a row with no lineup
in the guide has nothing to have seen. A stand still dims when everything
*you marked* on it is played, which for a stand with no listed saves is
exactly the rule it had before.

## Deliberately not built

- **Saving a stand that has no directory row at all.** 46 stands across the
  entertainment halls are named in the hall plan but absent from the
  directory (booth builders, lounges, the Cosplay Village's tables), plus
  the unnamed ones. Saving those needs a second key shape — `stand:10.1/A020`
  — and with it a second resolver, a second share-token vocabulary and a
  second thing the plan board has to know about. Every rail this feature
  rides is keyed to an exhibitor identity. A stand is not one.
- **A free pin anywhere on the floor.** The snapshot draws every stand these
  halls have, so "save any drawn stand" covers the want without inventing a
  coordinate the data does not contain.
- **Entertainment directory rows in the exhibitor grid.** The grid is
  curated cards; the Full directory is the whole filing and already links
  every row to the map. Putting 823 uncarded rows in the grid would make
  "111 exhibitors" mean something else.
- **A queue call, crowd forecast or lineup for any of them.** The guide
  researched none of it. `withoutQueues()` states that rather than leaving
  it to the absence of data.

## How it is wired

1. **`js/marks.js`** — unchanged behaviour; the comment over the `dir:`
   helpers now says what they are for. `isBusinessHall` no longer decides
   which rows get a key (every row has one) and still decides what the badge
   gates and which stops the planner warns about on a closed day.
2. **`js/map.js`** — `directoryRecords()` (was `tradeRecords`) builds one
   record per row holding every stand it files, and sorts it into
   `state.trade` / `state.listed`; a row standing on both sides of the show
   is **the same object** in both, because `routeStops()` keys a stop by the
   record it found and a second copy would draw two pins. `buildJoin()`
   fills the two indexes, `standRecord()` returns `exs` and `listed`,
   `standMarks()` is the one definition of "what is mine on this stand", and
   `renderListed()` / `syncListed()` are the picker.
3. **`js/app.js`** — `directoryRecord()` (was `tradeRecord`) keeps every
   trade rule for a row with a business stand and gives a row without one no
   `type` at all, so nothing downstream labels it. `fromDirectory()` is
   provenance; `withoutQueues()` is the queue gate; `buildShareCodeMap()`
   claims every row and applies decision 4; `directoryRow()` grows a save
   button keyed to the curated card where one claims the slug.
4. **`map.html` / `css/map.css`** — `#sheet-listed` and its list. The list
   scrolls inside itself (42 vh) on a phone held upright and gives that up
   sideways, where `.map-sheet-body` is already doing the scrolling.
5. **`sw.js`** — `v16`, and `data/directory.json` in `DATA`. The bump is a
   dead-controls one in both directions: the old script under the new markup
   leaves an empty box on every shared stand.
6. **`tools/fetch-directory.py`** — `check_share_tokens()` covers every row
   and mirrors the precedence rule.

## Verification

Scripted (run from the repo root, against the committed data — it evals the
real `js/marks.js`, so the booth-code normaliser under test is the shipped
one):

1. Every directory stand in a drawn entertainment hall resolves to a drawn
   stand — **902 placed, 0 missed**.
2. No directory row reaches `byStand` in any entertainment hall — **0
   leaks**, so decision 1 holds as a property.
3. The Indie Arena Booth stand is still covered by its curated card, and by
   that card alone, with 171 studios offered beside it.
4. The 74 rows standing on both sides of the show are one object in both
   lists.

Manual, in a browser:

5. **The flagship** — `map.html#10.2/F010`: the sheet reads "Indie Arena
   Booth", keeps its queue forecast and its eleven games, and carries a list
   of 171 companies under it. Filter to "11 bit", tap the row: it presses,
   the filter survives, the badge reads Saved, the stand turns signal, the
   hall chip reads ●1, and `gc2026.saved.v1` holds `dir:11_bit_studios`.
   Reload: the row is pressed and sorted to the top.
6. **One occupant** — `map.html#10.1/A019`: the heading is "Jumbo Spiele
   GmbH", there is no list, the sheet's own Save button saves it, and the
   guide link goes to the official profile rather than into a grid that does
   not contain it.
7. **The plan** — that stop appears in Your plan as a booth (not a trade
   booth), at Hall 10.2 · F010/E019, with all five day chips and no
   closed-day warning. Assign it a day; `map.html?day=…#10.1/A019` draws pin
   1 and the sheet reads "Stop 1 of 1 · Saved · planned · Thu".
8. **The gate is intact** — `map.html#2.1/A002` with the badge off still
   shows the three filed names, the "most of these are in the guide with
   trade exhibitors on" hint and the switch, with no picker and no Save
   button. Turning it on renders the stand as a trade booth, still with no
   picker.
9. **A bogus day is still dropped** — `map.html?day=1999-01-01#10.1` clears
   the parameter and shows the overlay's own hint.
10. **The directory list** — search the Full directory for a studio, press
    its save button: the same key, the same stop, and the map lights the
    same stand.
11. **Offline** — load a hall, go offline, reload: the stand comes up lit
    and the 171-row picker still renders.
12. **Sideways** — at 844×390 the sheet is a right-hand panel, the × is on
    top of the stacking order, the list gives up its own scroll and the
    body scrolls instead.

## Still open

1. **Which of a shared stand's names are worth showing first.** Saved-then-
   alphabetical is a defensible default and not obviously the best one; the
   directory files a country and product groups that could rank instead.
   Decide after watching someone use it on a stand of 172.
2. **The 46 stands with no directory row.** Left unsaveable on purpose (see
   above). If they matter on site, the honest fix is a `stand:` key shape
   with its own resolver, not a loose name match against the hall plan.
3. **Whether the picker belongs on business stands too.** It does not
   appear there — a business stand's occupants are already `rec.exs` when
   the badge is on, and the sheet lists them. A shared pavilion of fourteen
   has the same "save which one" problem, and answers it today by making
   you go to the trade list. Unifying the two would mean the picker reading
   from `exs` as well, which is a bigger change to the sheet than this
   feature needed.
