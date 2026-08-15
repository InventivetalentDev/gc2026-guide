# Implementation plan: trade exhibitors

Picks up the seam left by `docs/PLAN-hall-map.md`'s business-hall work: the
map now draws halls 2.1–4.2 in the official area colours, under a banner
saying a consumer ticket does not open them — but the guide itself still
treats the ~815 exhibitors *in* those halls as inert directory rows. For a
visitor holding a trade or media badge, that is most of their show reduced
to name, country and booth number.

**Status: built.** This doc was written before the feature, which is why it
reads as a plan; the design it describes is what shipped. Three things came
out differently once the data was in front of us, and they are marked
**[changed]** where they appear below:

1. `isBusinessHall` is halls **2–4**, not "below 5". Hall 1 is the public
   Event Arena and the directory files a stand there.
2. The share-token check is scoped to rows the guide actually mints tokens
   for. Checking all 1658 rows reported a collision against a token that is
   never minted (`dir:sharkbomb_studios` — hall 10.2, not a trade row).
   Correctly scoped: **1038 identities, no collisions**.
3. A booth's **access** — walk-up stand or closed meeting building — turned
   out to be the most useful thing to say about the business halls, and is a
   new curated field. See "What the business halls actually are" below.

## What is being built

- **A trade exhibitor list** on the main page, shaped like the Full
  directory but saveable and plannable, covering every exhibitor with a
  business-hall stand. Its rows show what a trade exhibitor *offers* —
  the official product-group categories, country, booth, profile link —
  because trade exhibitors have no games to list.
- **Curated trade cards** in `data/exhibitors.json` for the notable booths
  (pavilions, platforms, interesting offers), rendered in the main grid
  with an Offers block where consumer cards have a Lineup. Researched and
  sourced the same way every existing card was.
- **One setting** — "I have a trade badge" — off by default. Consumer
  visitors never see any of it; turning it on lazy-loads the data and
  merges trade content into the guide.
- **Full integration**: a saved trade booth is a stop like any other — it
  appears in Your plan's day and hall lenses, colours its stand on the
  map, rides share links, and lands in the `.ics` export. The planner
  warns when a trade stop is assigned to a day the business area is
  closed. Queue priority and the 18+ wristband list exclude trade entries,
  which have neither queues nor wristbands.

## Why build it

The guide's one-liner is "plan your gamescom visit"; for a trade visitor
the plan runs through halls the guide currently walks past. The map
already answers *where* (`map.html#3.2/D050` works today); the directory
already answers *who is there*; what is missing is the loop the whole app
is built around — save it, put it on a day, walk the route. And the data
to close that loop is already flowing: the trade rows are in
`data/directory.json`, their halls are drawn, and their stand chips link.
What they lack is saveability and something to say beyond a booth number.

Integrated rather than parallel, because a trade visitor's day is not
split into modes: devcom meeting in 4.1, hands-on appointment in 8.1,
evening round through the indie hall. Two separate planners would each
hold half a day. One planner holding both is also what makes the best
warning in this feature possible: the business area closes after Friday,
and only a planner that sees both kinds of stop can catch a trade meeting
scheduled for Saturday.

## The data source

The trade list needs one thing the directory rows don't carry: what an
exhibitor actually does. The official exhibitor search has it as a filter
— "product groups", a two-level taxonomy — and the same paginated endpoint
`tools/fetch-directory.py` already sweeps accepts it:

```
?route=aussteller/blaettern&fw_ajax=1&start=N
  &paginatevalues={"hauptwarengruppe":"601","hauptwarengruppe2":"601",…}
```

Verified against the live endpoint: the category filter composes with the
hall filter (cat 601 alone: 180 rows; cat 601 ∩ hall 2.2: 19 rows), so
category membership is harvestable by running the existing sweep once per
top-level group — about 28 groups, ~150 requests at the tool's existing
pacing, no per-profile scraping. Two quirks to handle:

- Group ids come in near-duplicate pairs per label ("600" and "601" are
  both *Service firms, contractors*); dedupe by label, keep the lowest id.
- Membership overlaps — an exhibitor can be both *Development* and
  *Service firms* — so it is a list per exhibitor, not a single group.

The profile pages carry more (brands, target markets, addresses), but
that is one fetch per exhibitor for detail the profile link on the row
already provides. Deliberately skipped.

## What the business halls actually are

A question that only became askable once the data was joined: which of these
booths can you walk up to, and which are closed rooms you need an appointment
for? It matters more than anything else here — a trade visitor planning a walk
through Hall 4.2 would find a corridor of shut doors.

Two facts already in the repo answer it between them. From
`data/directory.json`, how many exhibitors list the same stand; from
`data/hallplan/`, how big that stand is:

| | stands | shape |
|---|---|---|
| Shared, 3+ exhibitors | 53 stands, **634 of the 821 trade rows** | national and regional pavilions — Spain's 33 companies on one 240 m² stand, a 70-exhibitor European collective in 3.2, Denmark's 17. Twenty desks under one roof; staffed all day; walk up. |
| Single occupant, large | the Hall 4.2 row — Tencent 702 m², Xbox 560, Bandai Namco 543, Nintendo 541, CD Projekt 432, NVIDIA 420, Ubisoft 403 | one company, hundreds of square metres, no co-exhibitors and no demos. A meeting building with a logo on it. |
| Single occupant, small | most of Hall 2.1 (median stand 14 m²) | an ordinary trade booth with a counter. Walk up. |

Note that size alone inverts: the **biggest** business stands are the **most**
closed. Occupancy is the signal, and only together with size.

So the guide says two different kinds of thing about it, and keeps them
separate:

- **A count, on every trade row.** `shared · 33` is a fact from the data —
  how many exhibitors list that stand — and the reader draws their own
  conclusion. No inference is stated per row, because none is sourceable for
  821 of them.
- **A judgement, only on a curated card**, as `access: open | appointment |
  mixed` with a note saying why (`docs/UPDATING.md` has the sourcing rule).
  It takes the queue index's place in the card foot, because it answers the
  same question a queue index does: is it worth walking over there.

**[changed]** — this was not in the original plan. Its open question ("whether
any trade booth deserves a crowd note") is settled in the other direction:
none does, and `access` is what that space was actually for.

## Design decisions

### 1. Enrich `data/directory.json` — no second data file

The trade rows *are* directory rows; a separate `trade.json` would
duplicate 816 of them and let two generated files drift. Instead the
fetch tool adds two fields to the file that already exists:

```jsonc
{
  "groups": { "100": "Hardware", "204": "Development", … },  // id → label, deduped
  "exhibitors": [
    { "name": "…", "country": "…", "slug": "…",
      "stands": [{ "hall": "3.2", "booth": "D050/F051" }],
      "cats": ["204", "600"] }                                // omitted when empty
  ]
}
```

Cost ≈ +6–8 KB gzipped on today's 43 KB, paid only by people who open the
Full directory or the trade list — the file stays lazy. The lazy-load the
setting needs already exists: `loadDirectory()` (`js/app.js:1715`) is a
single-flight fetch triggered on first need, and the service worker
serves `/data/` network-first with cache fallback (`sw.js:239`). Turning
the pref on calls a loader that is already there.

Categories are harvested for all 1630 rows, not just the business halls:
the harvest yields both for the same requests, and business-only would
foreclose ever showing categories in the Full directory (open question 1).

### 2. Identity: `dir:<slug>` in the existing sets; curated cards claim their row

A saveable thing needs a stable id. Directory rows have one — `slug`,
unique across all 1630 (verified) — and it enters the existing storage
prefixed: `dir:<slug>` in `saved.exhibitors` and as an itinerary key. The
prefix keeps the namespace honest (no curated id can collide, and the v1
share decoder that matches raw ids can never misread one), and
`js/marks.js` needs no change at all: `readMarks` stores strings
verbatim, and `hasSaved(marks, ex)` works on any record whose `id` is the
key.

Curated trade cards (part A) are ordinary `exhibitors.json` entries with
a new `type: "trade"` — not a new classification axis. `renderFilters()`
derives the type chips from `e.type` (`js/app.js:1592`), so the "Trade &
Business" chip comes free, and one predicate (`type === "trade"`) is the
whole gate everywhere a gate is needed. New fields on such a card:

- `offers: ["…"]` — what the booth is for, rendered as an **Offers**
  block where consumer cards render the Lineup;
- `country` (optional), shown where a consumer card shows nothing;
- `dirSlug` (required) — the directory row this card upgrades.

`dirSlug` is the dedup rule: the trade list suppresses rows claimed by a
curated card, and saving resolves through the curated id. A `dir:` key
saved before the card existed (from the map, or a share link) resolves to
the card via the alias, and `toggleMark` migrates the stored key on the
next write — one booth, one save, whichever door it came in through.

Rejected: a parallel `kind` field beside `type` (second schema dimension,
bespoke chip logic, and `docs/UPDATING.md` would have to explain when to
use which for no expressive gain).

### 3. Share links: same `t=` tokens — measured, not hoped

The v2 share format encodes each saved item as a 5-character FNV-1a token
(`buildShareCodeMap()`, `js/app.js:357`), and its collision policy is
strict: a token claimed twice is abandoned by every claimant. The comment
at the definition put the headroom at "about a thousand" identities;
adding 816 trade slugs to today's 217 lands at 1033 — close enough that
this was measured rather than assumed: **hashing all 1033 identities (75
curated ids, 142 game keys, 816 `dir:` slugs) with the repo's own hash
produces zero collisions.** The implementation re-verifies this at
generation time: `tools/fetch-directory.py` gains a check that mirrors
`tok36` (the same mirrored-constant convention as `boothCodes`/`codeSet`)
and warns before a colliding dataset ships.

So trade items ride the existing wire format unchanged, which buys the
compatibility that matters:

- **Old cached builds** decode new links losslessly for everything they
  know: `resolveV2` (`js/app.js:631`) keeps unresolved tokens' positions,
  so the positional day plan (`d=`) and played bitmask (`p=`) stay
  aligned, and trade items surface as the existing "N aren't in the guide
  any more" count.
- **New builds** receiving trade tokens before the directory has loaded
  hold the raw payload (it already sits in sessionStorage), load the
  directory, rebuild the code map, and re-parse before offering the
  import. Offline with a cold cache degrades to the old-build behaviour.

Rejected: a separate `x=` parameter for trade tokens (the day plan is
positional over `t=`'s entry order — trade stops could not carry day
assignments without duplicating that machinery); excluding trade items
from shares (a trade visitor's plan is exactly the thing they'd move to a
second device).

### 4. The pref gates discovery, never resolution

One boolean, `trade`, in the existing prefs blob (`loadPrefs`/
`persistPrefs`, `js/app.js:131/147`), off by default, synced cross-tab by
the storage listener that already re-applies prefs.

What it gates is **discovery**: the trade list's contents, curated
`type:"trade"` cards and their type chip, the business-hall chips in the
hall filter, and the map joining *unsaved* business stands for browsing.

What it must never gate is **resolution**. A `dir:` key can enter the
saved set with the pref off — tapped on the map, imported from a share —
and today's behaviour for an unresolvable exhibitor id is silent
invisibility (`itineraryItems()` drops it, `js/app.js:1908`). So: if the
saved set contains any `dir:` key, the directory is loaded at boot and
those items resolve in the planner, the map and the share dialog
regardless of the pref. Saved things never vanish because a setting is
off; the setting only decides whether *more* of them are offered.

The toggle lives where its effect is: the trade section itself. Closed,
the section explains what the business area is (trade & media badge only,
closed after Friday) and offers one button — "I have a trade badge — show
trade exhibitors". No toolbar clutter for the consumer majority, and
finding the switch *is* finding the feature.

**Revised after first use.** That reasoning holds for *finding* the
feature and fails for *using* it. The section sits below the whole grid —
measured at 47,764 px down a 390 px-wide viewport — so the only switch,
on or off, was a scroll past every card in the guide, and the off button
sat further down still, inside the section's note. Discovery and control
are different jobs. The section keeps the first: it is still the only
place that explains what the business area is, and it still carries the
enable button. The second moved to two remote controls:

- **A "Badge" chip pair at the top of the Filters drawer** — Consumer /
  Trade & media, above Category, Hall and Age. Two chips rather than a
  checkbox in the "Only show" row, because that row is filters (things
  that *hide* cards) and this hides nothing; stated as a pair it reads as
  a setting with two answers rather than a box you might have left
  ticked. The trade side carries the same amber as the business-hall
  chips below it. The collapsed drawer's summary line leads with "Trade
  badge · …" so the mode is legible without opening it — prefixed rather
  than joined to the constraint list, because it widens the pool instead
  of narrowing it, and the "nothing is filtered" reassurance has to
  survive beside it.
- **A "Your badge" block in Event info**, between Tickets and Halls &
  areas, where the other badge and access facts already live — the
  semantically right home for a setting that describes you rather than
  the list, and the only one reachable from every view.

Both call `setTrade(on, {announce: true})`, which raises a toast: the
thing that just changed is off screen (a section far below the fold, or
another view entirely), unlike the in-section button, where you are
standing in the result. The "on" toast offers "Show the list →". A second
flip drops the first toast rather than queueing behind it — left queued,
"Trade exhibitors on · Show the list →" would surface *after* you turned
it off and offer to scroll you to an empty section.

### 5. The trade list is its own section; the Full directory keeps its contract

The Full directory's block comment and note copy promise a lookup tool —
"no lineups, crowd ratings or saving down here" (`js/app.js:1651`). Making
its rows conditionally saveable would turn that copy, the row renderer
and the paging logic into mode soup. Instead the trade list is a sibling
`<details id="trade">` above it, reusing the directory's visual language
with its own row shape:

- name, linked to the official profile (same pattern as `directoryRow`,
  `js/app.js:1759`), country;
- stand chips — `standChips()` factored out of `directoryRow` and shared,
  amber trade plates and map links included;
- category tags from the `groups` table;
- a save button: `markButton("saved", "exhibitor", "dir:"+slug, name)` —
  the delegated `[data-mark]` listener (`js/app.js:2867`) handles it with
  zero new wiring.

Search and the hall chips apply exactly as `directoryMatches()` does
(`js/app.js:1740`), plus a section-local category chip row. Paging
mirrors the directory: 200 per page, page reset keyed on
`query|hall|category`. Membership: every row with at least one
business-hall stand (816), minus rows claimed by a curated `dirSlug`.
The Full directory itself changes only its note, which gains a pointer
sentence when trade mode is on.

### 6. Planner: one merged lookup, not parallel branches

Everything downstream of saving resolves ids in one of two ways: the
single resolver in `itineraryItems()` (`js/app.js:1905`), or an inverted
iteration over `state.exhibitors` + `hasSaved` (`routeGroups`
`js/app.js:2303`, `renderPlanDayFilter` `:2456`). Both get one merged
answer instead of a second code path:

- `resolveSavedExhibitor(key)` — curated card, else curated-via-`dirSlug`
  alias, else a trade record built from the directory cache:
  `{ id: "dir:"+slug, name, country, hall, booth, stands, cats,
  trade: true, officialUrl }`, with `hall`/`booth` from the first
  business stand and `stands` kept whole for the map.
- `plannedExhibitors()` — `state.exhibitors` plus resolved saved trade
  records — feeds the hall lens and the day filter. `hallRank` is
  `parseFloat`, so hall 2.1 leads the walking route naturally.

Queue priority (`js/app.js:2124`) and the wristband list (`:2079`) keep
iterating `state.exhibitors`, so directory-backed entries are excluded by
construction; they additionally skip `type === "trade"` so a curated
trade card stays out even if it someday carries a crowd note.

**The closed-days warning**: `isBusinessOpenDay(d)` lands beside
`isTradeDay` (`js/app.js:1888`), reading `data/event.json`'s own day
entries (the business area runs Wed–Fri; Sat/Sun say "business area
closed"). Assigning a trade stop to a closed day is warned, not blocked —
the guide's job is honesty, not enforcement, and a visitor may well plan
a Saturday walk *past* a booth to photograph a stand. The stop's day
chips mark closed days, and an assigned-anyway stop carries an amber note
on its row and a count in the day group's header. The `.ics` export
includes trade stops with no extra work — it is built from
`itineraryItems()`.

One more honesty fix that falls out: when saved `dir:` keys exist but the
directory hasn't loaded (first boot offline), the plan's empty state says
the trade data needs one online load — instead of today's misleading
"nothing you saved is in the current lineup anymore".

### 7. Map: join the second source, keep the sheet honest

`buildJoin()` (`js/map.js:69`) needs only `{hall, booth}` and already
de-dupes per stand, so trade records join the same way — iterating
`stands[]` where a record has one (directory rows can hold several
stands; curated records keep the scalar `hall`/`booth`). The map loads
the directory lazily when trade mode is on *or* any saved key starts with
`dir:` — same rule as the guide, same never-vanish guarantee.

Three parts of the map assume every joined record is a curated card and
get a branch:

- the sheet (`js/map.js:660` region) reads `crowd` and `games` and links
  `./#exhibitors?ex=<id>` — a trade record instead shows country,
  category labels and the trade-only line, and links the official
  profile, since no card exists to deep-link;
- `hallSavedCount()`'s not-yet-loaded fallback (`js/map.js:442`) counts
  by scalar `ex.hall` — it learns `stands[]`;
- the storage listener (`js/map.js:728`) watches only the mark keys — it
  additionally watches the prefs key, and a cross-tab save of a `dir:`
  key with no directory loaded triggers the lazy load before recolouring.

The pref itself is read through a small helper in `js/marks.js` — the
same justification that put `boothCodes` there: two pages answering the
same question must answer it identically.

### 8. Caching: runtime, not precache

`data/directory.json` stays out of the service worker's precache list.
The consumer majority never enables the pref, and precaching ~50 KB gz
for everyone inverts the economics that justified precaching the hall
plans (tiny files, everyone's map). The trade user's offline story still
holds: enabling the toggle *is* the first fetch, which warms the runtime
cache — the same one-online-load contract the directory's error copy
already states (`js/app.js:1817`). No `VERSION` bump: every new DOM
lookup guards on the element existing, per the cached-shell tolerance the
directory section already practices.

## Deliberately not built

- **Per-profile scraping** (brands, target markets, addresses) — one
  request per exhibitor for detail the profile link already serves.
- **A category filter in the Full directory** — the directory stays a
  lookup tool; categories are the trade list's vocabulary. The data
  supports adding it later (decision 1).
- **Blocking closed-day assignments** — warn, don't block (decision 6).
- **A trade-only map mode** — the map's area colours and banner already
  say what kind of hall you are in; hiding entertainment halls from trade
  visitors would just break their evening plan.
- **Trade-only crowd forecasts / queue integration** — business booths
  run on appointments, not queues; pretending otherwise would put fake
  numbers in the one list whose honesty matters most.

## How it is wired (stages, each independently shippable)

1. **Data pipeline** — `tools/fetch-directory.py`: category harvest
   (per-group sweep, label dedupe), `groups` + `cats` in the payload, a
   `--skip-categories` flag for the fast path, and the share-token
   collision check mirroring `tok36`. Regenerate `data/directory.json`;
   document the fields in `docs/UPDATING.md`.
2. **Core loop** — the pref (`js/app.js:131/147`), the `#trade` section
   in `index.html` + styles, `standChips()` factored out of
   `directoryRow`, `tradeRow`/`renderTrade` mirroring `renderDirectory`,
   boot-time directory load when the pref is on or saved `dir:` keys
   exist, `resolveSavedExhibitor`/`plannedExhibitors` into
   `itineraryItems` (`:1905`), `routeGroups` (`:2303`),
   `renderPlanDayFilter` (`:2456`), exclusions in `renderPriority`
   (`:2124`) and `renderWristband` (`:2079`), business-hall chips in
   `renderFilters` (`:1610`) when on, plan-empty copy.
3. **Curated trade cards** — researched and sourced like every existing
   card (candidates: country/regional pavilions, the gamescom biz/devcom
   presences, major service platforms); `TYPE_LABELS.trade`, the Offers
   block in `card()` (`:1484`), `dirSlug` aliasing + trade-list
   suppression + key migration in `toggleMark`; schema in
   `docs/UPDATING.md`.
4. **Share** — claim `dir:` tokens in `buildShareCodeMap` (`:357`),
   rebuild when the directory lands; decode path lazy-loads and re-parses
   before `offerIncoming`.
5. **Map** — decision 7's list (`js/map.js:69`, `:442`, sheet branch,
   listener, `css/map.css` sheet touches).
6. **Closed-day warnings + polish** — `isBusinessOpenDay`, chip marking,
   row/header notes; changelog + README.

## Verification (manual test script)

Serve the repo root; fresh profile = cleared `gc2026.*` keys. Playwright
is available at `/opt/node22/lib/node_modules/playwright` for the
scripted steps.

1. **Off by default** — fresh profile: the trade section shows only the
   explainer and enable button; no business-hall chips, no Trade type
   chip, no trade cards in the grid; priority and wristband lists
   unchanged from the parent branch.
2. **Enable** — exactly one `directory.json` request; count reads ~816
   booths; rows show name ↗, country, amber stand chips, category tags,
   save button. The pref survives a reload, and a second tab flips live
   via the storage event.
3. **Filters compose** — search + hall chip + category chip narrow
   together; "Show N more" pages; a query change resets the page.
4. **Save → plan** — save a hall 2.1 row: saved count increments; the day
   lens shows the stop with hall · booth; the hall lens groups it under
   Hall 2.1 *before* Hall 5.2; Sat/Sun day chips carry the closed
   marking; assigning Saturday renders the warning on the row and in the
   day header; the `.ics` export contains the stop; the stop's hall link
   opens `map.html` on the stand.
5. **Exclusions hold** — no `dir:` row and no `type:"trade"` card appears
   in queue priority or the wristband list.
6. **Curated card** — visible only with the pref on; Offers block, no
   Lineup; its directory row is suppressed in the trade list; a
   pre-saved `dir:` key shows the card as saved, and toggling migrates
   the stored key (inspect `gc2026.saved.v1`).
7. **Share round-trip** — save 2 curated + 2 trade + 1 game; open the
   link in a fresh profile with the pref off: the prompt offers all 5
   (directory fetched lazily), the import lands, the plan shows the trade
   stops, and the pref is still off. Scripted: recompute the FNV tokens
   over all ids + game keys + `dir:` slugs and assert zero collisions
   (mirrors the tool's generation-time check).
8. **Map** — a saved trade booth: hall chip shows ●1, stand colours
   signal, sheet shows country/categories/profile link and a working
   save button. With the pref on, tapping an unsaved business stand names
   its exhibitor and can save it. With the pref off and nothing saved,
   business halls render exactly as on the parent branch.
9. **Offline** — enable online once, then airplane mode: the trade list
   renders from cache; a fresh profile offline shows the one-online-load
   note; the map still draws the business halls from precache.
10. **Escaping** — official names, countries and category labels reach
    the DOM only through `esc()`/`textContent`.

## Answered

The four questions this doc opened with, as settled during implementation:

1. **`cats` scope** — all rows. 1621 of 1658 carry at least one group, for
   ~+7 KB gzipped, and the Full directory can grow a category filter later
   without another sweep.
2. **Toggle wording** — "I have a trade badge — show trade exhibitors".
   The Event view was deliberately left alone at first, on the grounds that
   a second mention is a second thing to keep in sync. Reversed once the
   feature was in use: see the revision under decision 4. There is now a
   "Your badge" block there and a Badge chip pair in the Filters drawer,
   and they stay in sync because they are rendered from `state.trade`
   rather than holding state of their own — `setTrade()` re-renders both,
   including across tabs via the storage listener.
3. **Closed-day UX** — warn, don't block, confirmed. Sat/Sun chips are struck
   through for a business-area stop, an assigned one carries an amber note on
   the row, the day group heads with a count, and the `.ics` description says
   "business area CLOSED this day" so it survives leaving the guide.
4. **Curation list** — 32 cards, and the criterion turned out not to be the
   one this doc assumed. See "What earns a card" below. No trade booth gets a
   crowd note.

## What earns a card

The obvious answer was "the big ones", and it is wrong. Stand size and
occupancy answer *is the door open* — they do not answer *do I care*. Sorted
by area, the business halls put a 560 m² closed Xbox compound at the top and
bury the names a trade visitor is actually hunting for:

| | |
|---|---|
| Unity Technologies | **12 m²** |
| Reddit | 16 m² |
| Wargaming, Kakao Games, Poki | 20 m² |
| Denuvo | 24 m² |
| IGN + Humble Bundle (one stand) | 30 m² |
| Amazon Web Services | 45 m² |
| Cloudflare | 63 m² |

A 12 m² Unity desk matters more to a trade visitor than any compound in 4.2.
So cards are curated the way the consumer cards always were — **by
recognition** — and the shape of the business halls only decides what a card
*says*, never whether one exists.

The 32 break down as: 22 recognisable B2B names with no consumer card at all
(infrastructure, platforms, payments, dev services, media, industry bodies),
6 national and regional pavilions, and 4 Hall 4.2 compounds. Pavilion cards
deliberately claim **no** `dirSlug` — a pavilion is a stand, not a row, so its
members stay listed individually below it.

Deliberately **not** done: a card per pavilion. There are 50 pavilion stands,
and carding the other 44 would have added forty near-identical entries that
pushed Cloudflare and Unity off the screen — a worse overview, not a better
one. The remaining pavilions stay in the list, marked by their `shared · N`
count.

## Two faces of one exhibitor

Around twenty exhibitors keep a booth on both sides of the show — Capcom demos
in 9.1 and takes meetings in 4.2. Duplicating them as two grid entries is
noise; folding them into one stop is wrong for a different reason, and it is
worth being precise about why, because it decided the design:

**The two booths keep different opening hours.** Hall 9.1 is open on Saturday;
Hall 4.2 is shut. A single stop can only carry one answer, so it either warns
falsely about the consumer booth or stays silent while a trade visitor
schedules a Wednesday-only meeting for the weekend. There is no correct
behaviour available once the two are merged.

So they stay **two cards** — the trade one carrying `businessOf` — rendered as
**one card you can turn over**. The plate is already the card's "where" and its
map link, so the other booth is a small square notched into the plate's corner;
tapping it swaps the plates' places and sizes.

- **The purple is load-bearing.** `#7800FF` is the fill Koelnmesse gives the
  business halls on its own plan, already carried through the snapshot into the
  map's hall washes. Turning a card over teaches the colour in one gesture.
  The ink inverts, measured not guessed: orange needs near-black (5.93:1, white
  is 3.32:1), purple needs the warm off-white (5.64:1, near-black is 3.04:1).
- **Filters choose the face**; a tap overrides until the filters change.
  Sorting reads the filter-driven face, so turning a card over never makes it
  jump position. Category and hall match on *either* face, so filtering to
  Hall 4.2 keeps Capcom and turns it over.
- **The corner square carries the other side's saved state**, or a saved trade
  stop would be invisible until you turned the card. It is patched by
  `syncMarkUI` like any other mark control.
- **Everything downstream still sees two stops**: separate days, separate map
  stands, separate share tokens, and the Saturday warning on the business one
  alone.

Deliberately **not** done: a nested `business: {}` block on the consumer card.
Each face needs everything a card needs — location, description, offers,
sources, saved state — so nesting would have meant a second schema to document
and a special case for business-only booths like Cloudflare, which are exactly
the same shape minus the pairing.

## Still open

- Hall 3.2's `D050/F051` is the largest collective in the business area — 70
  exhibitors from a dozen countries — and nothing in the official data names
  it. It has no card because naming it would mean guessing. Worth identifying
  on site or from a gamescom dev/Home of Indies announcement.
- The `access` values on the Hall 4.2 cards are reasoned from stand size and
  sole occupancy, not from a published statement per booth. They are the
  right call and the note says what they rest on, but a first-hand look at
  the hall would upgrade them from sourced-inference to observation.
