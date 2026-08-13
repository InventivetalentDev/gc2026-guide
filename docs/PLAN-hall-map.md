# Implementation plan: hall map

Picks up the deferred seam from `docs/PLAN-hall-grouping.md` ("Future work:
SVG hall map"). That deferral rested on a premise — *"There is no accurate
coordinate source … booth positions are unobtainable"* — which turned out to
be false. The official interactive hall plan at
`exhibitors.gamescom.global` loads its booth geometry from an
unauthenticated JSON endpoint, and that geometry (positions, booth numbers,
exhibitor names, all in metres) is exactly what an honest map needs.

**A working prototype ships on this branch**: `map.html` (standalone page,
not linked from the app, not in the service-worker precache),
`tools/fetch-hallplan.mjs` (snapshot tool) and `data/hallplan/` (the
snapshot). This document records what was learned building it and what
integration takes.

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

| hall level | stands | file (raw) | gzipped |
|---|---|---|---|
| 5.2 | 90 | 11 KB | 3.2 KB |
| 6.1 | 35 | 5 KB | 1.4 KB |
| 7.1 | 23 | 3 KB | 1.1 KB |
| 8.1 | 35 | 5 KB | 1.5 KB |
| 9.1 | 21 | 3 KB | 0.9 KB |
| 10.1 | 191 | 25 KB | 7.0 KB |
| 10.2 | 94 | 24 KB | 8.2 KB |
| **total** | **489** | **76 KB** | **~23 KB** |

The whole entertainment area costs less than one webfont. "Lazy-loading
because it might be a lot of data" inverted into "lazy-load for first
paint, precache the lot for offline".

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

The tool's join report (42/42 exhibitors matched today) is a QA aid, not
an artifact. Entries with `"booth": null` correctly match nothing and
simply don't light up — amber-dashed unconfirmed treatment still applies
where `locationConfirmed` is false, because where guide honesty and
official filing disagree, the guide's rules win.

### 5. Per-hall lazy files, precached for offline

One JSON per hall level, fetched on first open (0.9–8.2 KB gz), prefetched
for the rest on idle. Integration adds all seven + `index.json` to the
service worker's `DATA` list (`sw.js:44`) — 23 KB gz buys "the map works
in a dead-reception hall before you ever opened it", which is the whole
point of the PWA. Runtime updates come free: the `/data/` path rule
(`sw.js:194`) already serves them network-first with cache fallback.

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

- **Area-scaled names**: font size fitted to booth width/height/area,
  capped so anchor booths don't shout; names longer than ~11 chars split
  into two balanced lines.
- **Zoom bands**: the SVG carries `z0/z1/z2` by zoom factor; CSS decides
  which size tier (`s1…s4`) shows names, and booth codes appear at `z2`.
  Zoomed out you see Xbox/Nintendo/SEGA; zoom in, mid-size names arrive;
  zoom further, every stand shows its code. No per-frame JS measurement.
- **A label layer above all shapes**: Koelnmesse files overlapping
  sub-stands ("E-071a" over "E-071", gallery stands suffixed "g") which
  would otherwise paint over neighbours' names.
- **Guide-covered names bright, official-only names dim, empty stands
  code-only** — coverage is visible at a glance and honest about gaps.
- **State colours**: saved = signal plate (`hasSaved` semantics — booth
  saved *or* any of its games saved, `js/app.js:173`), played = dimmed,
  unconfirmed = amber dashed stroke.

### 8. Storage compatibility

The prototype reads and writes the app's own `gc2026.saved.v1`
(`js/app.js:102-131` shapes) and listens to `storage`, so save-on-map and
save-in-app stay in sync across tabs today. At integration the map page
should reuse the app's mark helpers verbatim rather than keeping its
replica (see steps).

## What the prototype deliberately omits

Route/day overlays (numbered stops for a selected day), search-on-map,
keyboard/screen-reader interaction beyond `aria-label`s, played toggling
(display only), per-exhibitor deep links back into the guide (no such
route exists yet — `#exhibitors` is as close as it gets), and any service
worker involvement. None of these change the architecture.

## Integration steps

1. **Split the page** into `map.html` + `js/map.js` + `css/map.css`
   (house pattern; also lets the SW's stale-while-revalidate versioning
   apply, `sw.js:135`). Import tokens from `css/style.css` rather than
   duplicating the palette block.
2. **Share the storage/join helpers.** Either extract
   `gameKey/loadMarks/persistMarks/hasSaved` + `codeSet` into a small
   `js/marks.js` used by both pages, or accept the duplication
   consciously — but then add a test-script check that the two stay
   byte-identical. The prototype's replica drift is the main integration
   hazard.
3. **Service worker**: add `map.html`, `js/map.js`, `css/map.css` to
   `SHELL` (`sw.js:28`) and the eight `data/hallplan/*` files to `DATA`
   (`sw.js:44`). Teach `handleNavigation` (`sw.js:165`) to fall back to
   the cached `map.html` for navigations whose pathname ends in
   `/map.html` — today every offline navigation falls back to the shell
   `./`, which would serve the guide instead of the map.
4. **Cross-links in**: the hall plate on exhibitor cards
   (`hallMarker`, `js/app.js:887`) links to `map.html#<hall>/<booth>`
   when the hall is known; plan-board hall headers link to
   `map.html#<hall>`; both `target`-less same-tab links. Add a "Hall map"
   entry to the manifest `shortcuts` — after "Saved list", which stays
   first (README, "the saved list").
5. **Cross-links out**: the sheet's "open in guide" gains a real target
   once the guide has per-exhibitor anchors; until then it routes to
   `#exhibitors` (and `#saved` when the booth is saved).
6. **UPDATING.md**: new section — when to re-run
   `tools/fetch-hallplan.mjs` (layout revisions, new halls), reading the
   join report, and the editorial rule that `booth` values use official
   codes (`A061/C060` formatting is fine; the normaliser eats both).
7. **Ship**: `data/changelog.json` entry + `data/meta.json` rev bump per
   the UPDATING.md procedure.

## Verification (manual test script)

Serve the repo root; clear `gc2026.saved.v1`.

1. **Cold open** `map.html` — hall 7.1 renders, anchor names visible at
   fit, no horizontal page scroll at 360 px, footer counts read
   "23 stands · 6 in the guide".
2. **Zoom bands** — pinch/wheel in: mid names appear, then booth codes;
   strokes stay 1 px; pan stays 60 fps-ish during gesture (no re-raster
   until release).
3. **Deep link** — paste `map.html#10.2/E020`: hall 10.2 loads, Razer
   zoomed + sheet open. Change the hash in the bar to `#9.1` — hall
   switches without reload.
4. **Save loop** — tap Nintendo (9.1), Save booth: stand turns signal,
   chip shows ●1, second tab's exhibitor grid shows the bookmark;
   unsave from the grid, map reverts (storage event).
5. **Game-only saving** — save just *Alien: Isolation 2* in the app:
   Xbox's stand lights up in 7.1 (booth-or-game semantics).
6. **Unconfirmed** — an exhibitor with `locationConfirmed: false` and a
   booth code renders amber-dashed; its sheet says so.
7. **Overlaps** — hall 10.2 gallery stands ("…g") don't hide base-stand
   labels; hall 10.1's 191 stands render without jank.
8. **Orientation spot-check** (once, on site or against the official map
   side-by-side): Xbox fills hall 7's western end; Nintendo sits at
   A-010 B-009 in 9.1; Razer at E-020 D-021 in 10.2. A mirrored hall
   means one sign in the tool's `CAMPUS` table, then re-snapshot.
9. **Offline** (after step 3 of integration) — airplane mode, reopen
   installed app → map, switch to a never-opened hall: renders from
   precache.
10. **Escaping** — official names render through `esc()`/`textContent`
    everywhere; no raw HTML from snapshot JSON reaches the DOM.

## Open questions

1. **Orientation ground truth.** The transform matches the official
   renderer's math, but nobody has eyeballed our halls against the
   official plan yet (this environment couldn't load their site in a
   browser). Cheap to check, cheap to fix (decision 3).
2. **Sub-stand suffix policy.** Suffixed stands ("a" annexes, "g"
   galleries, "y"…) currently render as filed, layered under the label
   plane. Merging or dimming them is a data-shape question for the tool,
   not the client — decide after seeing them on site.
3. **The other twelve hall levels.** Koelnmesse files halls 1–5, outdoor
   F-areas and P4 in the same endpoint. `index.json` drives the chip row,
   so adding one is a `HALLS` entry in the tool + re-run — do it when the
   guide covers exhibitors there (business area, cosplay village).
4. **Feeding confirmations back.** The join report already surfaces
   official filings the guide lacks (`sega-atlus` today). Worth a tool
   flag that also lists official stand names fuzzy-matching guide
   exhibitor names that failed to join — as *suggestions* for the sourced
   editorial process, never auto-applied.
5. **A campus overview.** The official page embeds hall-outline
   coordinates for the whole campus (its `hallen` array) — a schematic
   "which hall is where" entry screen is buildable from data if the
   per-hall chips prove insufficient wayfinding.
6. **Day-route overlay.** Numbered stops from the plan board's day
   assignments drawn on the hall — the natural second iteration once the
   base map is in.
