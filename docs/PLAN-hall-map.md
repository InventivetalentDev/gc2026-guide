# Implementation plan: hall map

Picks up the deferred seam from `docs/PLAN-hall-grouping.md` ("Future work:
SVG hall map"). That deferral rested on a premise — *"There is no accurate
coordinate source … booth positions are unobtainable"* — which turned out to
be false. The official interactive hall plan at
`exhibitors.gamescom.global` loads its booth geometry from an
unauthenticated JSON endpoint, and that geometry (positions, booth numbers,
exhibitor names, all in metres) is exactly what an honest map needs.

**Status: built and integrated.** `tools/fetch-hallplan.mjs` snapshots the
geometry into `data/hallplan/`; `map.html` + `js/map.js` + `css/map.css`
draw it; `js/marks.js` holds what the map and the guide must agree on;
`sw.js` precaches both pages and all thirteen hall levels; the guide links out
from every place it names a hall — card plates, the plan board, queue
priority, the wristband list and all 1,630 rows of the full directory —
and the map links back to a card. A card may hold several stands and the
map lights every one of them; a booth's gallery level, which Koelnmesse
files as a second stand on the same outline, is drawn as the one booth it
is. Each hall is framed in its area colour and its doors are drawn as
openings in that frame — both from `data/hallplan/outline.json`, which is
ours rather than Koelnmesse's, because their data has no wall in it
(decision 5b). This document records the discovery, the design decisions and
the test script — the integration steps below are done, kept because they
say *where* everything is wired.

## Why build one at all

The official map is the benchmark to beat, and it sets a low bar on a
phone: every booth is an unlabelled white polygon with a click handler —
identifying *anything* costs a tap per booth — it loads the whole campus
artwork up front, and it needs a network, which Koelnmesse halls famously
do not supply. What the guide can do that it structurally cannot:

- **names on the booths**, sized by booth area, revealed by zoom level;
- **saved/played/unconfirmed state drawn on the map** — your plan, spatially;
- **works offline** once cached, like the rest of the guide;
- **deep links** (`map.html#7.1/A061`) from cards, the plan board, or a
  friend's message.

## The data source

```
POST https://exhibitors.gamescom.global/global/asdb.php
     ?sV=0480&sJ=2026&sS=3&route=hallenplan2/api&useNoSession=1&fw_ajax=1
     &halle={hall}&level={floor}
```

Per hall/floor the response carries `minmax` (hall bounds in metres, plus
per-hall mirror/rotation quirks), `bloecke` (background blocks) and
`staende` — booth polygons (`pl`, metres), booth codes (`standnr2`) and
exhibitor records (`kunden[].TITEL`, heavily duplicated, plus logo URLs).

Verified against guide data: guide hall `"7.1"` is Koelnmesse hall 7,
storey 1 (Xbox at A061 ✓), `"10.1"`/`"10.2"` are hall 10's two storeys
(Bilibili A-090 ✓, Razer E-020 D-021 ✓). Booth codes match after
normalisation — guide `A061/C060` vs official `A-061 C-060`.

Measured, after trimming to what we render (see the tool):

| hall level | area | stands | file (raw) | gzipped |
|---|---|---|---|---|
| 5.1 | entertainment | 141 | 15 KB | 3.3 KB |
| 5.2 | entertainment | 90 | 11 KB | 3.1 KB |
| 6.1 | entertainment | 35 | 4 KB | 1.3 KB |
| 7.1 | entertainment | 23 | 3 KB | 1.0 KB |
| 8.1 | entertainment | 35 | 4 KB | 1.5 KB |
| 9.1 | entertainment | 21 | 3 KB | 0.9 KB |
| 10.1 | entertainment | 191 | 25 KB | 6.8 KB |
| 10.2 | entertainment | 95 | 24 KB | 8.6 KB |
| 2.1 | business | 83 | 10 KB | 2.9 KB |
| 2.2 | business | 95 | 12 KB | 3.3 KB |
| 3.2 | business | 102 | 16 KB | 5.6 KB |
| 4.1 | business | 56 | 14 KB | 5.3 KB |
| 4.2 | business | 31 | 5 KB | 1.5 KB |
| **total** | | **998** | **147 KB** | **~45 KB** |

The whole show costs about one webfont. "Lazy-loading because it might be
a lot of data" inverted into "lazy-load for first paint, precache the lot
for offline".

## Design decisions

### 1. Own SVG rendering — no Leaflet, no tiles, no libraries

The official map uses Leaflet with `L.CRS.Simple`. At our scale that
machinery is dead weight: the biggest hall level is 191 polygons, and a
few hundred SVG paths is nothing for a phone. The prototype's whole
renderer + pan/zoom is ~350 lines of dependency-free JS, in keeping with
the repo's grain (self-hosted fonts, hand-rolled QR, no build step).

Rejected:

- **Leaflet like the original** — ~45 KB gz + CSS for machinery (tiles,
  projections, marker DOM) we don't need, and an external dependency.
- **MapLibre / vector tiles** — solves a data-volume problem we measured
  ourselves out of.
- **Pre-baked static SVG files** (labels rendered at snapshot time, no
  client geometry) — simplest possible, but forfeits the three best
  features: state colouring, zoom-band labels, tap-for-details.

### 2. Snapshot at refresh time — the client never talks to Koelnmesse

`tools/fetch-hallplan.mjs` fetches, trims and commits the geometry as
static JSON. Three separate reasons, any one of which would suffice:

- **Privacy.** Visitors' IPs never touch `koelnmesse.io` — the same
  reasoning that self-hosts the fonts (README, "Design"). This also rules
  out hotlinking their exhibitor logos.
- **Resilience.** The endpoint is unofficial and undocumented. If it
  changes shape or vanishes mid-show, the guide keeps serving the last
  committed snapshot; the tool fetches everything first, validates, and
  only then writes, so a half-broken response can't corrupt the data.
- **Editorial QA.** Snapshot diffs are review-able in git at booth
  granularity (one stand per line), and the tool's join report feeds the
  refresh playbook — e.g. it already shows SEGA Europe filed at concrete
  hall-7 stands while the guide's `sega-atlus` entry still has
  `"booth": null`. That is a booth confirmation waiting to be sourced.

What we take is facts — coordinates, codes, names. What we do **not** take
is their rendered artwork: the campus SVGs are copyrighted renderings, and
our map draws its own picture from the numbers. The map carries the
guide's standard unofficial disclaimer plus a "booth outlines: official
hall plan data · schematic" credit line.

### 3. True metres, official orientation

The endpoint's polygons come in a per-hall frame with mirror and rotation
quirks (`scalex: -1.06`, hall 10 rotated 90°…). The tool replicates the
official renderer's transform so our halls come out oriented like the
official plan — but keeps only the transform's *signs and rotation*,
dropping the magnitudes, which exist to squeeze halls onto their campus
artwork. Result: halls render aspect-true in real metres (hall 7 is
174.5 × 82 m), and hall 10's storeys come out portrait, which suits a
phone. All transform handling is baked into the data at snapshot time; the
client just draws coordinates.

One consequence to verify by eyeball (open question 1): if a hall ever
renders mirrored relative to reality, the fix is one sign in the tool's
`CAMPUS` table and a regenerated snapshot — the client never changes.

The business halls brought the first case where following the source
faithfully draws a hall upside down. Hall 2 is filed with `scaley` −0.92
on level 1 and +0.89 on level 2, so one building's two storeys come out
mirrored against each other. Two independent checks say level 1 is the
odd one: its stand rows run E→A up the hall where every other level
filed with a sign of its own runs A→E, and flipping it raises the
overlap of the two levels' structural blocks — the same walls, so they
should coincide — from 0.72 to 0.80. So the tool carries a `SIGN_FIX`
table beside `CAMPUS`, one entry, `"2.1": { dy: 1 }`. It is a documented
guess until someone walks hall 2 with the map open, and it is one sign
to undo.

### 4. The join is client-side, at load — geometry files stay editorial-free

Stands and guide exhibitors meet by `hall` + normalised booth code
(`A061/C060` ⇄ `A-061 C-060`; split on separators, strip punctuation,
uppercase — the same six lines in the tool and the page, single-sourced at
integration). Nothing from `exhibitors.json` is baked into
`data/hallplan/`, so:

- booth edits in `data/exhibitors.json` move map highlights immediately,
  preserving the README rule that updating the guide never requires code
  changes (or a tool re-run);
- the geometry snapshot only changes when Koelnmesse's filing changes.

The tool's join report (68/68 exhibitors matched today) is a QA aid, not
an artifact. Entries with `"booth": null` correctly match nothing and
simply don't light up — amber-dashed unconfirmed treatment still applies
where `locationConfirmed` is false, because where guide honesty and
official filing disagree, the guide's rules win.

Joining on the code and never on the name is the right call — names are
spelled three ways across three feeds ("Ubisoft", "Ubisoft GmbH",
"Nintendo of Europe SE / Accounting"), and matching on them loosely
enough to be useful is matching them loosely enough to eventually put one
company's name on another company's booth. But a code join is only as
complete as the codes, and a card that files one of an exhibitor's stands
leaves the others reading "not covered by the guide" — Ubisoft's second
Hall 6.1 booth did exactly that. So a `booth` value may list several
stands, comma-separated (`C011/B010, B020`), the slash still joining the
halves of one; and the join report now runs **both** directions, the
second one matching names purely to ask a human whether a stand belongs
to a card. Twelve did. The eight cards that grew now agree stand-for-stand
with the official directory, which is a separate feed from the hall plan.

The same evidence settles the `"booth": null` cases: four cards had a hall
but no number while the official plan named them on a stand all along.

### 4a. One footprint is one stand

Koelnmesse files a stand's gallery level as a stand of its own on exactly
the same four corners — `F-010 E-019` and `F-010g E-019g` are one place,
one floor above the other. Drawn as two, the empty upper one paints on top
and swallows every tap, so tapping the Indie Arena Booth answered "no
exhibitor filed for this stand" while the deep link to the very same
booth was right. 34 such pairs across six halls; hall 10.2 alone had 15.

`mergeLevels()` collapses them at load: one shape, every stand number
(the sheet reads "Stand F-010 E-019 · also F-010g E-019g"), every name
filed on either level, and the codes of both — so `#10.2/F010G` and
`#10.2/F010` land on the same stand. It joins **exact** duplicates only.
A sub-stand that sits *inside* a larger one (`E-071a` within `E-071`, 30
of them in hall 10.1) has a footprint of its own, means a different place,
and stays separate — that is what the paint-biggest-first order is for.
The snapshot on disk is untouched, as ever.

### 5. Per-hall lazy files, precached for offline

One JSON per hall level, fetched on first open (0.9–8.6 KB gz), prefetched
for the rest on idle. Integration adds all thirteen + `index.json` to the
service worker's `DATA` list (`sw.js:44`) — 45 KB gz buys "the map works
in a dead-reception hall before you ever opened it", which is the whole
point of the PWA. Runtime updates come free: the `/data/` path rule
(`sw.js:194`) already serves them network-first with cache fallback.

### 5a. Both areas, told apart by the official colours

The map draws every hall the show occupies, not only the halls the guide
writes cards about — it already drew 5.2, which no curated card sits in,
because a map that answers "what is in this hall" is worth more than one
that only answers "where is my saved booth". The same argument reaches
the business halls (2.1, 2.2, 3.2, 4.1, 4.2): 820 of the full
directory's stands are in them, every one of those rows already links to
a hall, and a trade visitor loses reception in hall 3 exactly like
everyone else. Hall 1 (Event Arena, 20 stands, one directory row) is
still left out — it is a venue rather than a floor of stands.

That doubles the halls in the row, so the row now has to say which is
which, and there is an existing vocabulary for it: the official plan
fills halls by area (`farbenvorgabe` in the hall-plan page — entertainment
`#00B9FF`, business `#7800FF`). The snapshot carries the area per hall and
the palette in `index.json`, and the map spends it in three places: the
hall row groups by area behind a swatch, the hall's structural blocks are
washed 22 % in its colour, and a business hall opens under a banner
saying a consumer ticket does not open these halls and they close after
Friday. Booth state stays the loud channel — saved is still signal
orange over everything.

Two notes on the palette. It is *checked*, not read at runtime: the
colours live in the tool's `AREAS` constant and a mismatch with the
official page fails the run (`checkAreaColours`), because a table we
parse blind can also repaint our map blind. And halls 5 and 10 are
missing from the official table entirely — they hold several areas each
(merch, cards, indie, retro, campus) and Koelnmesse leaves them
uncoloured — so the guide files them as what a visitor's ticket makes
them, entertainment halls, which is also what `data/event.json` has
always called them.

Rejected: drawing halls in the official *fill* at full strength (a purple
hall and an orange saved booth fight, and the colour would read as a
booth state); a separate legend panel (the hall row is already a list of
halls, so it is the legend); leaving the business halls out and letting
their directory rows stay dead text (the honest reason to link was
missing wayfinding, not missing permission — the banner supplies the
permission part).

### 5b. The hall has an outline, and the outline has doors

Two gaps that only show up once you are standing in a hall.

**Where does this hall end?** Koelnmesse files no wall. `bloecke` and
`staende` are all there is, so a hall's extent was only ever implied by
where its contents stopped — fine on hall 10.1's 180 stands, useless on
7.1, whose three empty aisles look like the hall simply ending. The
boundary is drawn in the hall's area colour: the same cyan or purple as
the chip you tapped to get here, at 60 %, one weight up from a stand's
stroke. It is the third and last place that colour is spent (decision
5a), and booth state stays the loud channel.

`size` is *not* where to draw it, which is the mistake this shipped with
for a day. It is the tight box around the blocks and stands, so an
outline drawn on it touches the outermost booth on all four sides by
construction — the hall came out shrink-wrapped, which is not what any
plan of these halls looks like. Nothing published measures the gap: the
endpoint's own `minmax` is `minmaxFound: "BLOECKE"`, i.e. that same box;
the interactive plan's margins fall out of per-hall fudge factors (it
scales hall 7 by ±1.06/0.94 to sit on campus artwork, and hall 8's
content overflows its outline entirely); the 2017 press plans show the
margin as whatever that year's layout left over. So the margin is a
stated drawing allowance in `outline.json`, not a measurement: 2 m north,
where every one of these halls files a 3 m-deep row of stands hard
against the boundary, and 6–7 m elsewhere, where the outermost thing is a
full-depth block that needs a perimeter aisle behind it. One number to
change if a walk says otherwise.

**Which end faces the Boulevard?** That one is worth more than it looks:
halls 6, 7 and 9 all open onto the same concourse, and knowing whether it
is behind you or 200 m the other way is most of what a hall map is for.
The current plan page exposes nothing directly — no door, no entrance
marker — but it carries the campus layout its own overview draws from
(`var hallen`), and that files every `Durchgang` as a polygon *between*
two halls: `D67` sits in the gap between 6 and 7, `D78` between 7 and 8,
`D109` between 9 and 10, and the Boulevard runs down the east side of 6
and 7 and the west side of 9. That is adjacency, and adjacency answers
the question. It also independently confirms the orientation the tool
derives (open question 1): the one cross-aisle in each of 6, 7 and 9 runs
out at exactly the wall the campus says the Boulevard is on. What it is
*not* is metric — those polygons sit on a 5-unit grid, and halls 6 and 7
come out at different metres-per-unit, so a passage is good to about
±15 m.

The doorways themselves come from the **2017 press hall plans**
(pcgames.de, from Koelnmesse's own artwork), which draw them: a break in
the wall with a tab naming what is through it. The building has not
moved, so those are read off the pixels as fractions of each wall and
laid onto ours. It settles what the geometry could not — hall 7 does have
three doors onto the Boulevard, at 19/48/79 % of its east wall, and its
passage to hall 6 is at the south-west corner rather than the aisle we
had snapped it to. Where the two sources meet they agree, which is the
reassuring part: hall 9's passage to hall 10, hall 10.1's to halls 4, 5,
9 and 11, all land where the campus polygons put them.

Three caveats are in the data as `approx`, because that set is artwork
too and it shows: hall 8's east-wall doors there are the hall-7 template
reused (hall 8 faces the Boulevard across its *south* wall, where the
campus puts it and where three real 6 m aisles line up), hall 9's
Boulevard doorways are simply not drawn although the hall plainly opens
that way, and hall 6 has no plan in the set at all. Those borrow hall 7's
spacing — same 82 m depth, same building module — and are drawn held
back.

Consequences worth naming:

- **The doors are ours, and the credit line says so.** `booth outlines:
  official hall plan · … · hall doors ours, approximate`. Everything else
  on this map is traceable to Koelnmesse; these are not, and the file
  records its own provenance per door.
- **They live in `data/hallplan/outline.json`, hand-written**, and the
  tool neither reads nor writes it — the one file in that directory the
  "never hand-edit `data/hallplan/`" rule does not cover, because no
  re-snapshot can supply either the wall or the doors in it. Correcting
  one is a number, not a run.
- **A door into another drawn hall is a tap that goes there.** The hall
  row already does that job for a keyboard or a screen reader, which is
  why the whole layer is `aria-hidden` rather than pretending to be a
  second set of buttons. Its tap target is an invisible 18 px stroke over
  a 3 px one, and it is tested *above* the stand behind it.
- **Labels are one per destination per wall, not one per door** — hall 7's
  east end has three openings onto the same Boulevard — and they are set
  at the 7 m ceiling `fitName()` gives a booth name, so they are legible
  wherever the largest name on the map is and no zoom band hides them.
  Which end faces the Boulevard is a question you ask *before* zooming
  in; answering it a band late is answering it late. The end walls'
  labels are turned to run along them: set across, "Boulevard" is 41 m
  of text against a hall 82 m deep, it left the stage entirely at fit
  zoom, and the only way to make room for the word would be to shrink
  the hall to a third of the screen. Turned, it costs one line of depth,
  which the viewBox reserves beyond each wall that carries a name.

Rejected: drawing the outline on the snapshot's `size` (it is the box
around the booths, so it always touches them — this is the bug the margin
fixes); deriving the doors in `tools/fetch-hallplan.mjs` at snapshot time
(it would make a hand-read fraction look generated, and tie fixing a door
to a network round-trip to Koelnmesse); drawing the outline in the area
colour at full strength (it then reads as a booth state, the same reason
decision 5a washes the blocks); putting any of it on `index.json`
(regenerated by the tool, so a hand-added door would be lost on the next
refresh — the same trap `map.area.*.access` is kept out of).

### 6. It stays its own page

`map.html` remains a separate page rather than a fifth view in
`index.html`:

- The tab strip is exactly full at four on a 360 px phone
  (`index.html:49-52`, same finding as PLAN-hall-grouping decision 1).
- A full-screen gesture surface inside the app's scroll page is a
  fight — `touch-action: none`, viewport control and the app's own
  scrolling all want the document. A dedicated page owns its viewport.
- The URL is the deep link: `map.html#7.1/A061` needs no `routeFor()`
  special-casing in `js/app.js` (`parseHash`, line 379, stays untouched).
- The app stays a thin renderer; the map is a specialist surface linked
  from it.

Rejected: fifth tab (width), a `<dialog>` like sources/share (gesture and
focus fights, and the sheet-inside-dialog nesting gets silly), folding
into `js/app.js` views (couples the biggest new code surface to every
render path for no user benefit).

### 7. Labels are the feature

- **Area-scaled names**: every way of breaking the name across one, two
  or three lines is tried and the arrangement that fits the booth
  largest wins, capped so anchor booths don't shout. Balancing the line
  lengths instead reads fine on a square booth and fails on a narrow
  one — MOZA Racing's stand is 4 m wide, where "MOZA Racing" on one line
  fits at 0.6 m and "MOZA / Racing" at 1.2 m. Below 0.45 m (about 13 px
  at full zoom on a phone) the name is dropped and the booth carries its
  code instead.
- **Zoom bands**: the SVG carries `z0/z1/z2` by zoom factor; CSS decides
  which size tier (`s1…s4`) shows names, and booth codes appear at `z2`.
  Zoomed out you see Xbox/Nintendo/SEGA; zoom in, mid-size names arrive;
  zoom further, every stand shows its code. No per-frame JS measurement.
- **A label layer above all shapes**: Koelnmesse files overlapping
  sub-stands ("E-071a" over "E-071", gallery stands suffixed "g") which
  would otherwise paint over neighbours' names.
- **Booth codes fitted to their booth**: a fixed size overflowed the
  small stands — "F-073g" is wider than its 4 m box — and spilled across
  neighbours. Below ~0.45 m the code is dropped; that stand is
  identified by tapping instead.
- **A collision pass decides what is actually drawn** (decision 9).
- **Guide-covered names bright, official-only names dim, empty stands
  code-only** — coverage is visible at a glance and honest about gaps.
- **State colours**: saved = signal plate (`hasSaved` semantics — booth
  saved *or* any of its games saved, `js/app.js:173`), played = dimmed,
  unconfirmed = amber dashed stroke.

### 9. Label placement is a collision pass, not a formula

Position alone cannot decide which labels are safe to draw. Koelnmesse
files sub-stands *inside* their parent (C-032 within C-030) and, in
several cases, exactly on top of it — Pawprint's C-041 and the empty
C-041g share all four corners — so a label drawn per booth will sit on
another booth's label no matter how it is positioned.

So every label is measured, then walked in priority order — guide-covered
booths first, then largest, a booth's own name ahead of its own code —
and any that collides with one already placed is dropped. Three
properties make this behave:

- **Bands are cumulative.** Whatever a band places keeps its spot in
  every deeper band. Deciding each band independently let a label win at
  one zoom and lose at the next, so zooming *in* could delete the name
  you were reading.
- **Measurement never depends on current visibility.** `getBBox()`
  reports zeros for a `display: none` element, so measuring while the
  previous pass's verdicts are applied piles every hidden label at the
  origin and corrupts the next verdict. Classes are cleared, then
  measured, then reassigned.
- **The second pass waits a frame after `document.fonts.ready`.** That
  promise resolves before the text using the font is laid out again;
  measuring in the gap yields fallback widths, which is enough for a
  two-line name to overlap its own booth code.

Each of those three was a real bug found by measuring rendered label
boxes across all seven halls, and each looked like "the declutter just
doesn't work" from the outside. The check is worth keeping as a test
(verification step 3): every hall, every band, zero overlapping pairs.
`declutter.passes` exists so a test can wait for labels to settle
instead of sleeping.

A dropped label costs nothing permanent — the stand stays tappable, and
deeper bands run their own pass, so names reappear as competition thins.

### 8. Storage compatibility

The prototype reads and writes the app's own `gc2026.saved.v1`
(`js/app.js:102-131` shapes) and listens to `storage`, so save-on-map and
save-in-app stay in sync across tabs today. At integration the map page
should reuse the app's mark helpers verbatim rather than keeping its
replica (see steps).

## Deliberately not built

Route/day overlays (numbered stops for a selected day — though the sheet
now *names* the day a stop is planned for, see "how it is wired" 8),
search-on-map, played *toggling* from the map (it is shown, not editable —
the guide owns that flow), and keyboard interaction beyond Escape, the
zoom keys and the labelled stand buttons: a keyboard user gets the guide's
list, which is better for that input anyway, and pretending otherwise with
an arrow-key pan would be theatre. None of these change the architecture.

## How it is wired

1. **The page** is `map.html` (a shell, like `index.html`) + `js/map.js`
   + `css/map.css`. It links `css/style.css` first and adds its own layer
   on top, so there is exactly one palette and the hall chips are the
   guide's `.chip.hall-chip` component, not a lookalike. `js/pwa.js` is
   shared as-is: it null-checks everything it touches, so on the map it
   just registers the worker and drives the offline flag.
2. **Shared rules** live in `js/marks.js` (`GCMarks`), loaded before both
   apps: the storage keys and shape, `gameKey`, the booth-or-game
   `hasSaved` predicate, and `boothCodes` — the booth-code normaliser
   that decides which stand lights up. `js/app.js` calls it behind its
   existing names. The one copy that cannot be shared is in
   `tools/fetch-hallplan.mjs` (Node, no DOM), and that file says so.
3. **Service worker**: `map.html`, `js/map.js`, `js/marks.js` and
   `css/map.css` are in `SHELL`; every `data/hallplan/*` file is in
   `DATA` — the thirteen hall levels, the index, the outlines and the
   campus layout. `handleNavigation` picks its fallback with `pageKey()` — an
   offline navigation to `/map.html` gets the cached map, not the guide,
   which is what every navigation used to fall back to.
4. **Cross-links in**: `hallMarker()` renders the hall plate as an anchor
   to `map.html#<hall>/<booth>` when `state.mapHalls` has that hall
   (loaded from `data/hallplan/index.json`, optional — no index, no
   links, guide unchanged). Plan-board hall headers carry a `Map →` link.
   The manifest has a "Hall map" shortcut, second after "Saved list".
   Everywhere else a hall or booth is *named* rather than plated,
   `hallLink()` wraps that text: queue-priority rows, the wristband list,
   the plan board's day lens (where a game shown at two booths links to
   each) and each stop's booth number in the hall lens — the header keeps
   opening the whole hall, a stop opens its stand. It
   is gated on the same `hasMap()`, so an undrawn hall stays plain text,
   and it takes the row's own label untouched — only a destination is
   added. `itineraryLocation()` stays plain text beside it because the
   `.ics` export writes it into a calendar file.
   The full directory does the same thing one level down: every row's
   `hall · booth` chip is the link, since the booth number is the answer
   that section exists to give. 1,622 of its stands sit in a drawn hall
   and all 1,622 resolve to a stand — two of them needed `boothCodes()`
   to split run-together filings like `F040gE057g`, which it now does
   without changing any curated booth's codes. The business halls are
   drawn now (decision 5a), so their chips link too, and they keep the
   amber plate and the "trade & media only" they always carried — the
   map they open says the same thing in a banner. Hall 1 and the outdoor
   F-areas are still undrawn, so those few chips stay plain text.
4a. **The halls-and-areas list** in Event info is the one place the guide
    names a *span* rather than a hall: "5–10" for the entertainment area,
    "2–4" for the business one, "5" for a level whose halves it does not
    separate. `areaMapHall()` resolves those to the lowest hall inside
    the span the snapshot can draw — 5.1, 2.1 and 5.1 — so the plate
    opens the near end of the area and the map's own area-grouped chip
    row carries you along the rest. An exact hall (10.1, 10.2, 5.1)
    links to itself; only whole levels widen, because "11.1" is a hall
    the snapshot either has or hasn't and landing on 10.2 instead would
    be a different room. Hall 1, 11.1 and the four hall-less rows stay
    plain text. The plate keeps the label the data filed, so the
    accessible name carries both — "Halls 5–10 — open Hall 5.1 on the
    hall map" — rather than letting the number you tapped and the hall
    you land in disagree silently.
5. **Cross-links out**: the sheet links to `./#exhibitors?ex=<id>`, and
   `focusExhibitor()` in `js/app.js` scrolls that card into view and
   flashes it, clearing any filter that would otherwise hide it.
6. **UPDATING.md** has a "Refreshing the hall plans" section: when to
   re-run the tool, how to read the join report, and the rule that booth
   numbers stay editorial — never hand-edit `data/hallplan/`. The booth
   convention (slash joins a stand's halves, comma separates stands) is
   in the editorial rules, next to the reason it matters.
7. **`node tools/fetch-hallplan.mjs --report`** runs the QA alone,
   against the committed snapshot. Booth numbers change far more often
   than Koelnmesse's layout does, and checking one should not mean
   fetching the other again.
8. **View controls and the round trip.** Zoom buttons (+ / − / fit, with
   the `+`/`-`/`0` keys behind them) stand in the stage's corner, under
   the sheet in the stacking order so a phone's sheet wins the corner —
   pinch and wheel already did the job, but neither is discoverable with
   a mouse alone and neither offered the way back out to the whole hall.
   The URL always names what is on screen: a chip or door tap
   `replaceState`s `#hall`, closing the sheet drops the stand code, so
   the copied link is never a place you already left. The ← goes
   `history.back()` when the map was opened from the guide (same-origin
   referrer), restoring the guide's scroll and filters instead of
   reloading it from the top; direct arrivals keep the plain `./` link.
   And the sheet names the day a stop is planned for, read from the same
   `gc2026.itinerary.v1` the plan board writes — the key and its parse
   moved to `js/marks.js` (`GCMarks.IT_KEY`, `readItinerary()`) the day
   two pages started reading it, per that file's rule. The map shows
   assignments and never edits them; a `storage` event keeps an open
   sheet's day current, like the marks.
9. **The overview** (decision/open question 5) is the hall row's first
   chip and renders into the same `#map` element a hall does — which is
   what gives it the pan, the pinch, the zoom buttons and the fit button
   without a second implementation. `state.hall` holds `"overview"` while
   it is up, so the URL is `#overview`, `refreshMarks()` forks to
   `refreshCampus()` (per-hall saved counts rather than per-stand marks),
   and a hall plate's tap target is the door layer's trick again: an
   invisible path over the label layer, handled by the same line that
   handles a door. `data/hallplan/campus.json` is fetched once the first
   hall is on screen, never before it, and the chip is offered only when
   it lands — so an installed shell whose worker predates the file simply
   does not show it, and no control on the page opens nothing.

## Verification (manual test script)

Serve the repo root; clear `gc2026.saved.v1`.

1. **Cold open** `map.html` — hall 7.1 renders, anchor names visible at
   fit, no horizontal page scroll at 360 px, footer counts read
   "23 stands · 8 in the guide". Counts are of drawn stands, so they are
   post-merge: 180 in hall 10.1, 80 in 10.2, 93 in 3.2.
2. **Zoom bands** — pinch/wheel in: mid names appear, then booth codes;
   nothing that was readable at one zoom disappears at the next; strokes
   stay 1 px; pan stays 60 fps-ish during gesture.
3. **No overlapping labels** (scripted): for each hall, for each band,
   set the map to that band, measure every label not hidden in it, and
   assert no two boxes intersect. Wait on `declutter.passes >= 2` first —
   measuring earlier reads pre-webfont metrics. Also assert every
   guide-covered stand is named in at least one band (45 today).
4. **Deep link** — paste `map.html#10.2/E020`: hall 10.2 loads, Razer
   zoomed + sheet open. Change the hash in the bar to `#9.1` — hall
   switches without reload.
5. **Desktop drag** — mouse-drag the map on a desktop browser: it pans.
   No ghost image follows the cursor, no text selection, no `dragstart`
   fires.
6. **Save loop** — tap Nintendo (9.1), Save booth: stand turns signal,
   chip shows ●1, second tab's exhibitor grid shows the bookmark;
   unsave from the grid, map reverts (storage event).
7. **Game-only saving** — save just *Alien: Isolation 2* in the app:
   Xbox's stand lights up in 7.1 (booth-or-game semantics).
8. **Unconfirmed** — an exhibitor with `locationConfirmed: false` and a
   booth code renders amber-dashed; its sheet says so.
9. **Density** — hall 10.1's 180 drawn stands render without jank.
9a. **Merged footprints** — tapping the middle of the Indie Arena Booth
    opens *its* sheet, not an empty one: `elementsFromPoint` at that
    point finds exactly one `.stand`. `#10.2/F010` and `#10.2/F010G`
    select the same stand, whose sheet reads "also F-010g E-019g" and
    lists the names filed on both levels.
9b. **Multi-stand cards** — every stand of Ubisoft, Embark, SEGA,
    Nintendo, LEGO, Headis, Gryphline and KRAFTON reads as covered, each
    naming the same card. The card plate wraps between stands and never
    inside a code. `--report` is silent in both directions, and each of
    those cards' codes matches its row in `data/directory.json`.
10. **Orientation spot-check** (once, on site or against the official map
    side-by-side): Xbox fills hall 7's western end; Nintendo sits at
    A-010 B-009 in 9.1; Razer at E-020 D-021 in 10.2. A mirrored hall
    means one sign in the tool's `CAMPUS` table, then re-snapshot. Hall
    2.1 is the one level we deliberately draw against its filing
    (decision 3, open question 1) — check it first, and if it is wrong
    the fix is deleting its `SIGN_FIX` entry.
9c. **Outline and doors** — every hall is framed in its area colour, and
    the frame breaks at each door. In 7.1 the Boulevard is the east end
    (three openings, the third dimmed) and hall 8 is off the north wall;
    in 9.1 the Boulevard is the west end and hall 10 is off the south;
    8.1's three Boulevard doors sit on three real aisles. Every wall
    names what is behind it at every zoom, once — reading down the east
    wall, up the west, straight across the north and south, and never
    over a booth name. Tapping the "Hall 7.1" door in 8.1 switches hall;
    tapping a stand still opens that stand, and the deep-linked stand
    still lands dead centre of the stage (the drawing starts outside the
    hall now, not at the booth box). Delete
    `data/hallplan/outline.json` and the map falls back to the booth box,
    no doors, and drops "hall doors ours" from the credit line.
10a. **Areas** — the hall row groups into Entertainment and Business
    behind a coloured swatch, the business group is flagged trade-only,
    and the chips of a group carry that colour on their edge. Opening
    2.1/2.2/3.2/4.1/4.2 shows the trade banner under the row and washes
    the hall's blocks purple; every entertainment hall is cyan and shows
    no banner. `node tools/fetch-hallplan.mjs` prints "colours: …
    still match the official plan" — if it throws instead, Koelnmesse
    repainted and `AREAS` needs the new value.
11. **Cross-links** — a card's hall plate opens that booth's sheet on the
    map; a plan-board hall header opens that hall; the sheet's "open in
    guide" lands on that card, even with "saved only" left on. Cards for
    halls the snapshot lacks show a plain plate with no link. The named
    halls link too: a queue-priority row, a wristband row, a day-lens
    stop and a hall-lens booth number each land on their own booth
    (its "· unconf." suffix stays outside the link), and a directory chip in a drawn
    hall opens that stand's sheet — showing the official filing's name
    when the guide has no card for it. A business-hall directory chip
    links too, keeps its amber plate, and says "trade & media only" in
    its title and its accessible name; chips in hall 1 and the F-areas
    are still not links. In Event info, the areas list opens the map at
    the near end of a span — "5–10" at 5.1, "2–4" at 2.1 with the trade
    banner up — an exact hall at itself, and 1 / 11.1 / "—" not at
    all. The `.ics` export still contains no markup.
12. **Offline** — airplane mode, reopen installed app → map, switch to a
    never-opened hall: renders from precache. Navigating straight to
    `map.html` offline serves the map, not the guide.
13. **Escaping** — official names render through `esc()`/`textContent`
    everywhere; no raw HTML from snapshot JSON reaches the DOM.
14. **The overview** — the row's first chip draws the site: halls 2–11
    each in place, the Boulevard down the middle with halls 6 and 7 west
    of it and 9 and 10 east, hall 8 across the north end, the business
    halls south behind the Piazza. Halls 1 and 11 are dimmed and take no
    taps; every other plate opens its hall, and the plate you tapped is
    the chip that is now active. Save a booth in hall 7 and its plate
    carries ●1 inside the plate and a signal outline, live, without
    leaving the overview. Gate names sit clear of the halls at every
    zoom — north above the plan, south below it, east and west set back
    over the passages — and there are four of them, not the six the
    source's artwork marks. `#overview` is a working deep link, and
    with `campus.json` 404ing the chip is absent and that link falls
    through to a hall rather than an empty stage.

## Open questions

1. **Orientation ground truth.** Settled for the entertainment halls:
   checked against the official plan by eye after the first release, and
   they sit the right way round. Open again for hall 2.1, the one level
   whose filed signs disagree with its own second storey — the tool
   flips it on the evidence in decision 3, and only a walk through hall
   2 (or Koelnmesse's printed plan) settles it. The other four business
   levels are as filed. The `CAMPUS`/`SIGN_FIX` tables in the tool are
   where any correction goes; the client never changes.
2. ~~**Sub-stand suffix policy.**~~ Half settled: a suffixed stand
   sharing its parent's exact footprint is the same place and is merged
   into it (decision 4a). One that has a footprint of its own is a
   different place and renders as filed — `E-071a` carries five
   exhibitors of its own, and hiding it would lose them. What is left is
   cosmetic: whether an annexe should read as subordinate to its parent
   rather than as a peer. Decide after seeing them on site.
3. **The other hall levels.** Mostly answered: the five business-area
   levels are drawn (decision 5a), and hall 5.1 with them — Cosplay
   Village, the Artist Area and the ground-floor merch shops, 141
   stands, the largest entertainment level after hall 10.1. Its signs
   are as filed: both of hall 5's storeys carry the same `scalex`/
   `scaley`, its stand rows run A→E the same way round as every other
   hall's, and flipping it drops the two levels' structural-block
   overlap from 0.46 to 0.30 — so no `SIGN_FIX` entry, unlike hall 2.1.
   That leaves hall 1 (Event Arena, 20 stands and a single directory
   row — a venue, not a floor of stands) and the outdoor F-areas and
   P4, which have 11 directory stands between them. Each is a `HALLS`
   entry in the tool plus a re-run, and each needs its own orientation
   check, since the signs are a per-hall fact.
4. ~~**Feeding confirmations back.**~~ Built: `unclaimedReport()` lists
   official stand names matching a guide exhibitor in that hall whose
   card has not claimed them. It found twelve stands across eight cards
   on its first run, including the four that had `"booth": null`. It is a
   suggestion list for the sourced editorial process and is never
   auto-applied — the match is loose on purpose, which is exactly why a
   human has to read it.
5. ~~**A campus overview.**~~ Built, and it is the diagram this entry
   always said it would be. `tools/fetch-hallplan.mjs --campus` snapshots
   the page's `hallen` array to `data/hallplan/campus.json`, and the hall
   row's first chip draws it: every hall in its place, the Boulevard and
   the Piazza between them, every Durchgang and Passage, the Confex and
   the Congress wings, the four gates — and a tap on a hall opens it. The
   halls the guide draws no level of (1 and 11) are on it dimmed, for
   orientation, and take no taps; each hall the guide *does* draw carries
   the count of your saved booths in it, the same ●n the chips use.

   What it is still not is a plan: the rings are on a 5-unit grid and each
   hall is fitted to its slot rather than drawn to scale (hall 6 comes out
   at ~1.5 m per unit across and ~1.4 down, hall 4 at ~1.6 and ~2.1), so
   nothing on it measures anything. It is right about where a hall is and
   wrong about how big it is, and the credit line under it says "diagram,
   not to scale" for exactly that reason.

   The gates came with it, and did not need the guess this entry feared.
   They are dots on the site artwork the page lays over the outlines, and
   once that artwork's frame is pinned to the outlines' (it is theirs
   shifted 134 units) each lands where it should — Nord in hall 8's own
   entrance hall, West between halls 2 and 4, Ost beside hall 10, Süd past
   the corridor between halls 3 and 11. A dot is a coordinate, so we take
   the points and none of the drawing.

   Four of them, though the artwork marks six. That artwork is
   Koelnmesse's *Verkehrsleitfaden* — the traffic guide for the grounds,
   drawn once for every fair they host, with the Hohenzollernbrücke, the
   streets and the car parks on it — so it marks every way onto the site
   the buildings have, not the ones a given show opens. "Eingang Halle 9"
   and "Eingang Boulevard" are in neither the gamescom-configured `hallen`
   array nor anything gamescom publishes, and the guide's own entrances
   section says four gates. Drawn beside the four in the same style they
   would read as a fifth and sixth way in. Taking a coordinate is safe;
   claiming a door is open is not, and `CAMPUS_ENTRANCES` in the tool is
   where that line is drawn.

   All of which is a different question from which of hall 8's *openings*
   is Eingang Nord, which is still a walk and still not on a hall wall.
7. **Which doors are actually there.** Halls 6 and 9 borrow hall 7's
   door spacing — hall 6 has no 2017 plan and hall 9's Boulevard side is
   not drawn in its own — and hall 8's Boulevard doors are placed from
   the campus layout rather than read off a plan. They are flagged
   `approx` in `data/hallplan/outline.json` and drawn held back, and the
   whole file is hedged in the credit line. The margin the wall stands
   off the booths is in the same position: a stated allowance, because
   no source measures it. Settling either is a walk down the Boulevard
   with the map open, and the fix is a number in one file.
6. **Day-route overlay.** Numbered stops from the plan board's day
   assignments drawn on the hall — the natural second iteration once the
   base map is in.
