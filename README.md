# gamescom 2026 Guide

An unofficial, fan-made web guide to **gamescom 2026** (Cologne, Aug 26–30, 2026).

**Features**

- Overview of exhibitors with their announced (or rumored) games and products
- Hall & booth locations where known — clearly marked when unconfirmed
- A link to the exhibitor's official gamescom page where one exists, for the booth program straight from the source
- **Sources on every entry** — an ⓘ marker in each card's foot opens the pages that booth number, lineup and queue call were built from, with the date it was last checked, so an unconfirmed detail can be checked before you plan a day around it
- Search across exhibitors, games and tags; filters by category, hall, playable demos and age gate (hide 18+ / 18+ only)
- **Saved list** — bookmark booths and individual games, then filter both the exhibitor grid and the queue-priority list down to just those
- **Shareable saved lists** — move a plan to another device or send it to a friend with a link or scannable QR code
- **Share the guide itself** — a Share button in the masthead opens a QR code big enough to hold up to the phone of whoever you are queueing with, plus the link to copy for posting it anywhere else
- **Share one booth** — every card's corner carries a Share row beside Save and Played. It hands out a link that opens the guide *on that card*, scrolled to it and lit for a moment, rather than at the top of a list of a hundred and eleven — so "Capcom is in 9.1" can be a link instead of a description. A card turned to its business booth shares the business booth, and a link naming one switches the trade exhibitors on to answer it
- Crowd forecasts (1–5) per exhibitor and a **Visit planner** with queue-priority list, 18+ wristband checklist and day-by-day advice
- **Live queue times during the show** — a **Live queues** tab, open only while the show is on, that lists the lines you are standing in and searches all ~160 queues to report a new one; the cards themselves just show the figures, with one *Report a queue* link that opens the tab already narrowed to that booth. Optional reports under a random, resettable device id per playable game (or per booth where there is no playable lineup), server-side aggregation with report count and age, measured waits that can finish offline, and a phone-first moderation console
- **Your plan** — one board for everything you saved, arranged **by day** (assign each stop a day, see that day's hours inline, export to calendar) or **by hall** (walking order, with per-stop day tags and a single-day filter); the five-days board counts each day's planned stops and taps through to them. Each stop wears its queue index in both arrangements, and ▲▼ put the list in **the order you'll actually walk it** — the guide opens with busiest-queue-first and hands the order over the moment you disagree; the hall map numbers its pins from the same order. Either arrangement reaches the map from its own headings — a hall heading opens that hall, a day heading opens the whole site with that day lit
- **Hall map** — every hall drawn booth by booth, with exhibitor names *on* the booths and your saved ones lit up. Tap a booth for its lineup, its queue call and — once you've assigned it in the planner — the day you planned it for. Entertainment halls and trade-only business halls are each washed in the colour the official plan gives that area, and the business ones are flagged as the door a consumer ticket does not open. Pick a day and that day's stops are pinned on the floor in your plan's own order — the one you arranged, or busiest first with played ones last until you do — so "Thursday, hall 7.1" is a picture rather than a list. It does not stop at the wall: the halls either side of this one in the plan are named in the bar, a tap from opening, and where a doorway is known to start the way there the route runs out to it and an arrow points through. The overview answers the same question for the whole site — every hall that day touches, lit and numbered in order. Every hall or booth number named anywhere in the guide — card plates, your plan, queue priority, the full directory, the halls and areas in Event info — opens the map on that stand. It works offline like everything else
- **Trade exhibitors**, behind one setting — "I have a trade badge", off by default. Switch it from the Badge row at the top of the filters, from Event info, from the trade section itself, or from the map's business-area banner. It opens the business halls (2–4): ~820 booths the guide otherwise walks past, saveable and plannable like any other stop, with product-group filters and curated cards for the platforms, services and national pavilions standing there. Each booth says whether it is an open stand or a closed room you need an appointment for — the one thing that decides whether walking over is worth it. A booth saved there is a stop in the same plan as your Thursday demo queue, and the planner warns when one lands on a day the business area is shut
- **Two-faced cards** for the twenty-odd exhibitors with a booth on each side of the show. Capcom demos in Hall 9.1 and takes meetings in 4.2; tap the small purple square in the corner of the hall plate and the card turns over to its business booth, tap the cyan one to turn it back. The square is the other booth's plate in miniature, in Koelnmesse's own colours — purple for the business halls, cyan for the entertainment ones — so a plate means the same thing here as on the official plan. The two booths stay separate stops in your plan, because they keep different hours
- Event info: dates, hours, tickets, special areas with the way onto the map for the hall each stands in, Opening Night Live, and which of the four **entrances** to use — including what a trade badge changes about that and about when you get in
- **Installable and offline-capable** — add it to your home screen and the whole guide
  stays readable in a hall with no reception

## Install / offline

The guide is a PWA. Chrome, Edge and Samsung Internet offer an **Install app** button
in the masthead; iOS Safari gets the same button pointing at *Share → Add to Home
Screen*. Installed or not, `sw.js` caches the shell and the data on first visit. That
is the point of the whole thing: mobile reception inside Koelnmesse's halls is poor,
and the guide is most needed exactly where the network is worst.

Freshness is not traded away for it. Exhibitor data is served network-first and only
falls back to the last good copy when the network fails — the masthead says
**Offline · showing saved data** when that happens. A new deploy offers a Reload
prompt rather than swapping the page out from under you.

Serve it over HTTPS (or `localhost`); service workers are inert on `file://` and on
plain HTTP.

## Running locally

For static UI and data work, serve the repo root with any static server:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` via `file://` won't work because the app fetches JSON.)

One part of the guide can't be reached that way: the **Today** tab exists only on
the five show days, so before Aug 26 there is nothing to click. `?now` moves the
clock for one load, on whatever server you already have:

| URL | |
|---|---|
| `?now` | the show's first day, an hour after the doors open |
| `?now=14:30` | same day, that time in Cologne |
| `?now=2026-08-29` | that day, an hour after its doors |
| `?now=2026-08-29T19:45` | that day, 15 minutes before closing |

It works anywhere the page does — a `file://`-adjacent IDE server, a phone on the
LAN, the deployed site — and combines with the rest: `?now=2026-08-29#today`,
`?now&lang=de`. Today only has stops if you gave some a day, so save a couple of
booths in the planner first, or you'll get its empty state.

A moved clock says so: a bar across the top of every page names the moment it is
pretending to be, and links back out. It has to, because otherwise a screenshot of
`?now=2026-08-27` is indistinguishable from the real Thursday. Like `?lang`, it wins
for one load, is never stored, and never rides in a link the guide builds.

## Running the queue API locally

A plain static server has no live queue API. The API is a second Worker, and in
production a route puts it on the same hostname as the site; locally a small
proxy stands in for that route. Node 22+, then two terminals:

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local

npm run dev:api     # terminal 1 — the queue Worker on :8787
npm run dev         # terminal 2 — site + /api proxy on :8000
# open http://localhost:8000/?queue-dev=1
```

`npm run dev` serves the repository's real files, so an edit shows on reload
with no build step in between. The example's paired clock values put the Worker
inside the show window so the time-gated report flow can be exercised before
Aug 26. They live only in the ignored local environment file, never in
Wrangler's deployed configuration or a request field.

## Deploying

Live on **Cloudflare Workers** as two Workers sharing every hostname: the site is
static files served straight from the edge with no script at all, and a second
Worker answers `/api/*` for live queues, backed by D1. A route beats a custom
domain for the paths it covers, which is what puts them on one origin.
`.github/workflows/cloudflare.yml` verifies pull requests and deploys `main`;
`wrangler.toml` configures the site and `wrangler-api.toml` the API. Keeping them
apart is what stops a pull request preview — which inherits its Worker's bindings
— from ever running against the show's real database. There is still no client
compile step: `tools/build-site.sh` copies the site into `dist/` for upload,
while `worker/` remains server code outside the asset directory. Pull requests
from branches in this repo each get a preview, deployed nowhere; forks
deliberately do not ([`docs/DEPLOYING.md`](docs/DEPLOYING.md), *PR previews*).

It runs there rather than on GitHub Pages because Pages gives a repository one custom
domain and the guide answers on four: **`hallgui.de`**, plus `gamescom.guide`,
`gc26.guide` and the original `gc2026.inventivetalent.org` for as long as those three
take to drain. All three are bookmarked or installed on somebody's phone, and a saved
list is per-origin — so they keep serving the guide rather than a redirect until the
people standing on them have been offered the move.

Arriving on one of them for the first time is the exception. Nothing in `localStorage`,
no installed app and a working connection together mean there is nothing on that
hostname to strand, so the head of each page sends that visit straight to `hallgui.de`
— path, query and hash intact — before anything paints. Everyone else stays and is
offered the move instead.

The address moved twice, for different reasons. `gamescom.guide` had to go: the name is
a registered mark of game — Verband der deutschen Games-Branche e.V., who license it to
exhibitors and have had unofficial sites warned off carrying it in a domain. `gc26.guide`
replaced it and then went too, for a softer reason — it is an abbreviation with a year in
it, fine to type and useless to say across a queue, and it would have needed replacing
again next August.

`hallgui.de` is the one that stays. It names the thing the guide is actually built
around, the hall map; it reads as "hallguide" once the dot stops being punctuation; and
it has no year in it. Six alias domains redirect to it rather than serving the guide, so
they cost nothing in extra origins — `hallguide.de` most importantly, because it is how
somebody who only *heard* the name would spell it, and owning both means it does not
matter which side of the `de` they put the dot on.

Throughout all of it the guide still calls the show by its name. That is ordinary
referential use and was never the part anyone objects to; only the domain moved.

Any static host works, but two routing options are not optional if you move it
elsewhere: `/map.html` must be served without a redirect, and `/` must serve
`index.html`. See [`docs/DEPLOYING.md`](docs/DEPLOYING.md) for the setup, the domain
cutover and why those two matter to the service worker.

## Design

**"Hall Signage"** — trade-fair wayfinding crossed with print. The hall number is
what you actually read while walking a show floor, so it gets a solid plate and the
largest type on the card, filled in that hall's own colour on the official plan —
cyan for the entertainment halls, purple for the business ones, the same fills the
map washes those halls with (dashed edge when the location is still a guess, grey
plate when it's TBA). Exhibitors are discrete panels with hard, unblurred offset
shadows rather than cells sharing hairlines. One signal colour, near-square corners,
no gradients, no emoji, no blurred elevation.

Two details that look like mistakes but aren't:

- **The card offset shadow is lighter than the ground, not darker.** A black shadow
  is invisible on a near-black page; offsetting in a lighter tone (`--plate-shadow`)
  gives the same "printed second layer" read as ink on paper, inverted.
- **Anton is used for structural headings only** — page and section titles, weekday
  labels, the wordmark — and for exactly one element inside a card, the tilted
  `N PLAYABLE` stamp. Exhibitor names stay on Archivo Narrow, and the per-game
  badges stay quiet outlines: repeating either treatment down a 23-game lineup turns
  emphasis into noise.

Everything is driven by the tokens at the top of `css/style.css`. Two earlier
directions — a light "Fanzine" and an all-monospace "Console" — were built on the
same tokens and dropped when this one was picked; `css/themes.css` is recoverable
from git history if you ever want to compare again.

Typefaces are **self-hosted** in `fonts/` (Archivo, Archivo Narrow, JetBrains Mono,
Anton — all OFL). Embedding Google Fonts by URL sends every visitor's IP to Google,
which German courts have treated as a GDPR violation, and this guide's audience is
overwhelmingly German. To refresh them, re-run the download step in
[`docs/UPDATING.md`](docs/UPDATING.md#refreshing-the-webfonts).

## The saved list

The `+` in a card's corner saves a booth; the `+` on a lineup row saves a single game.
Both are kept in `localStorage` under `gc2026.saved.v1` — no account, no server, and
nothing leaves the device unless you share a link yourself. Two tabs of the guide stay
in sync via the `storage` event, and if storage is blocked altogether (Safari private
mode) the list still works for the session instead of throwing.

The corner itself is three rows — **Save**, **Played**, **Share** — one per thing you
can do with a booth, each carrying its own word rather than a bare glyph, and each the
full width of a fixed column, so pressing one never resizes the button under the thumb
that pressed it or shoves the exhibitor's name sideways.

Shared links encode guide identifiers only — compact fixed-width hashes of exhibitor
ids and game titles, never the names themselves. The link and its QR code are built
entirely in your browser, so no saved-list data is uploaded or sent anywhere by the
guide. The dialog asks who the link is for. **Someone else** carries the saved list
alone by default — a plan you hand to a friend, and your progress through it is not
theirs. **Another of my devices** brings the day plan and played marks along too, and
on arrival offers **Replace my list** instead of adding: replacing is what lets a
removed booth or a rescheduled day carry across your own devices, and the prompt
counts what it would remove before anything is touched. The include boxes stay
adjustable in either mode, and nothing about the choice is remembered between opens.

Sharing the *guide* rather than a list is a separate control — **Share** in the
masthead — and carries nothing of yours: it is the canonical address, once as a QR
code sized to be scanned across a queue and once as text to copy. Where the OS
provides a share sheet it is offered too; there are no per-platform buttons, because
a copied link reaches everywhere one of those would have.

Sharing one *booth* is the third of the three, and the smallest: the **Share** row in
a card's corner hands out `#exhibitors?ex=<id>`, which carries nothing of yours
either. It is the address the hall map has always used to send someone to a card, so
what arrives is the guide scrolled to that booth and the card lit for a moment —
which is the whole difference between a link and a description. A card turned to its
business booth shares the business booth rather than its owner, and a link naming a
booth in halls 2–4 switches the trade exhibitors on to answer it rather than landing
on an empty grid; a toast says so, and the Badge row switches them straight back off.
Same sheet as the other two — the link first, because this one is usually sent rather
than held up, with the QR under it for the times you are standing together after all.

A link for someone else never replaces an existing list: it asks before adding to a
non-empty list, while an empty list imports immediately with an Undo option — and a
replace is undone the same way, day plan and played marks included. Opening a link
consumes it — it does not stay in the address bar to be forwarded on — so until the
question is answered the tab keeps its own copy: dismissing the prompt costs a reload
rather than the whole list. Answer it, or close the tab, and the copy is gone.

The Visit Planner turns those bookmarks into a plan — one board, two arrangements.
The day view is the itinerary: assign each stop a day, see that day's hours and crowd
advice inline, export the assignments to a calendar file. The hall view is the walking
route, and it reads the same assignments back: each stop carries tags for the days it
is planned on, and once anything is placed, day chips filter the route down to a single
day's stops in hall order. Filtered to a day, the hall view's map links hand that day
to the hall map, which numbers the same stops on the floor in the same order — the
numbers and the rows come from one comparator, so they can never disagree. Assignments
are kept separately under `gc2026.itinerary.v1`, follow the same booth and game keys,
and stay on this device too; the arrangement you last picked is a view preference in
`gc2026.prefs.v1`.

Within a day, or within a hall, the order is the queue index descending with played
stops last — until you say otherwise. The ▲▼ on each row move a stop up or down its
group, and from the first move the plan keeps the order you left it in, under
`gc2026.planorder.v1`: a flat list of stop keys that both arrangements and the hall
map's numbered pins read. Nothing is stored until you move something, so a plan you
never argued with sorts itself, and **Reset order** — with an Undo in the toast — hands
it back to the queue index. New stops join at the end of their group rather than
shouldering into the middle of a plan you have already thought about.

It is entirely local, so it needs no network: with the app running off the service
worker cache in a dead-reception hall, the list still renders, both saved-only filters
still work, and anything saved while offline persists. That is the case it is for —
you build the list at home and read it on the show floor.

Which is also why the filtered list is a route, `#saved`, and not only a checkbox: the
installed app carries a **Saved** launcher shortcut straight to it, so your list is one
long-press from the home screen instead of three taps into a filter drawer. It is
listed first of the four shortcuts because launchers truncate — if anything gets cut it
should be Updates, not this. On the exhibitor list the URL owns the filter: `#saved`
turns it on, `#exhibitors` clears it, and the tabs route through whichever you had set,
so switching to the planner and back keeps your filter. A bare `#saved` route survives
a reload; the **Share list** control builds a separate, self-contained link for moving
the actual items.

Games are keyed by **title**, not by booth. Eight titles this year are shown at two
booths at once — Alien: Isolation 2 sits at both Xbox and SEGA — and someone who saved
the game wants to see every booth running it so they can walk to the shorter queue.
The same rule drives both saved-only filters: an exhibitor counts as saved if you
saved the booth itself *or* any game they are showing, so saving *Fable* is enough to
keep Xbox in your filtered queue-priority list. That list also names which of your
games each booth is running, and keeps its ranks absolute — `04` still means "fourth
worst queue of the show", not "fourth row you happen to be looking at".

One consequence for data edits: renaming a game in `data/exhibitors.json` orphans that
game in anyone's saved list. See the editorial rules in
[`docs/UPDATING.md`](docs/UPDATING.md#editorial-rules).

### Played tracking

The `✓` beside every game, and the **Played** row in a card's corner, record what you
have already played. A booth counts as played when you tick it directly, or when every game you saved there has
been played. Save another game at a booth that was complete that way and the booth
becomes active again until you play the new addition.

Played rows use a muted filled plate and dim in place rather than taking the orange
signal colour: saved things need attention, while played things should recede. In the
queue-priority list, played booths sink below the unplayed ones without changing their
absolute ranks, and **Hide played** removes them altogether. Itinerary day groups get
the same treatment: played stops dim and sink to the bottom of their day, so each
group leads with what's still left to do.

Played marks live in a second local-only storage entry, `gc2026.played.v1`, separate
from the saved list; **Hide played** is a view preference rather than a mark, so it
sits in `gc2026.prefs.v1` next to the age filter. All of it works offline, stays in
sync between tabs, and never leaves the device.

Played marks are deliberately **not** part of a shared link by default. A shared list
is a plan you hand to someone else, and your progress through it is not theirs.
Moving between your own devices is what the **Played marks** box in the share dialog
exists for — there your progress follows you, alongside the day plan.

Moving yourself between the guide's hostnames is the one case that is not a share, so
it carries everything: accepting the notice on any of the three draining hostnames
brings the saved list, the played marks and the day assignments over to `hallgui.de` in
one step. Somebody who accepted an earlier notice gets asked once more, because what
they accepted then was an address that has since moved on. See
[`docs/DEPLOYING.md`](docs/DEPLOYING.md).

### Today

On the five show days a fifth tab appears at the front of the row, and the guide
stops being a pre-show tool. **Today** is the walking route scoped to the day it
actually is: your stops for today in hall order, the ones you have ticked `✓`
folded away at the bottom, and a header that says whether the halls are open,
what time they close and how long that leaves. When more than one stop is left it
names the one with the worst queue, because that is the decision the morning
actually turns on.

It is a lens, not a fourth list. Today reads the saved list, the played marks,
the day assignments and the order you put the plan in, and stores nothing of its
own — reorder a hall in the planner and Today walks it that way. That has one
consequence worth stating: a stop with no day can never appear on it. The count under the
list says how many are in that position and leads to the planner, where they get
one. Opening the guide mid-show lands on Today whenever the day has stops on it —
an empty Today would be a worse front door than the exhibitor grid, so it only
leads when it has something to lead with.

Which day it is gets read in the show's own timezone rather than the device's, so
a phone still set to another continent does not open Wednesday's plan on Thursday
morning. The hours come from `open`/`close` in `data/event.json`, the same two
fields the calendar export writes, so a schedule change stays a data edit. The
clock is refreshed whenever the tab is opened or the app comes back to the
foreground — a phone that spent an hour in a pocket must not come back saying
"closes in 3h".

The one thing it does not do is arrange. The reorder arrows stay on the planner,
which shows the whole plan; Today shows one day with the played stops folded
away, and arrows there would rearrange a list against stops you cannot see.

Off-show none of it exists: the tab is gone, and `#today` lands on the planner
rather than on a page explaining that gamescom is not running. That is also why
there is no launcher shortcut for it — the manifest is a fixed, year-round
artifact, and launchers truncate the list it already has.

## Architecture

Editorial content lives in `data/` as JSON; the app (`index.html`, `js/app.js`,
`js/queue.js`, `css/`) is a thin renderer. Ordinary guide updates still require only
JSON edits. `worker/` owns the live queue API, D1 migration, estimator and moderation
page; `js/pwa.js` and `sw.js` keep offline guide content separate from every `/api/`
response.

The hall map is a second page (`map.html`, `js/map.js`, `css/map.css`) rather
than a fifth tab: it wants the whole viewport, and a full-screen pan/pinch
surface fights the app's own scrolling. `js/marks.js` holds the few rules both
pages must agree on — the saved/played storage shape, the booth-code
normalisation that decides which stand lights up, the `dir:<slug>` identity a
business-hall booth is saved under on either page, and the plan's two rules:
which day a stop is on, and which stop is number 1. Anything either page kept
its own copy of would drift, and a map that numbered your Thursday differently
from the list it read it off would be worse than no numbers at all.

Every list in the app is drawn from a function that returns one row's markup as
a string — `card()`, `tradeRow()`, `directoryRow()` — and `renderKeyed()` in
`js/app.js` is what puts those strings on screen. It keeps the element it built
for each row alongside the markup it built it from: a row whose markup has not
changed is handed back as the same element rather than parsed again, and the
list is then walked into the order asked for with the fewest moves. That is
what makes re-sorting the grid cost about what moving 111 cards costs rather
than what building them costs — the measurements are in the comment above the
function. Two rules fall out of it:

- **The markup is the cache key.** Anything that should change a row has to
  change what its row function returns. Everything those functions read — the
  marks, the age filter, the expanded set, the language — is already in what
  they return, so this holds by construction; a row that reached outside for
  state would go stale invisibly.
- **Per-row listeners are delegated** — on `document`, or on the list's own
  container — never bound after a render. A reused element keeps the listeners
  it was built with, so binding per render would stack them on the survivors
  and miss the rebuilt ones.

Work that the visitor is not waiting for does not run in the handler they are
waiting on. The two directory lists sit below the grid, so a filter change
schedules them with `defer()` and they fill a frame later; a view behind
another tab is re-rendered through `refreshViews()`, which hands it to the same
idle queue the boot renders use. Both keep the tap charged for what it changed
on screen and nothing else.

For the rows that *are* rebuilt, the older rule still holds: **a rebuild must
not move the page.** The visitor pressed a button that was on screen, so the
view belongs where they left it when the press is over. Three things threaten
that, and all three are handled where they arise rather than papered over
afterwards:

- `focus()` scrolls its element into view, and after a rebuild the element is
  new, so the browser has no memory of it and centres it. `restoreFocus()` in
  `js/app.js` puts focus back without the scroll, and reveals the control only
  when the focus ring is actually showing — the keyboard case, where invisible
  focus is the worse failure.
- The browser's scroll anchoring holds a node in view to absorb content
  loading above it. A wholesale rebuild destroys that node, so it corrects for
  a shift that never happened; the rebuilt containers opt out with
  `overflow-anchor: none`.
- Anything above a list has to be written *before* the list, not after: focus
  goes back mid-rebuild, and a header row that grows afterwards shoves the
  control focus just landed on off the screen.

One rule runs through the trade feature and is worth stating once: **the "I
have a trade badge" setting gates discovery, never resolution.** It decides
what the guide offers you. It never decides whether something you already
saved still resolves — a booth tapped on the map or imported from a share link
shows up in your plan with the setting off, because a saved thing quietly
disappearing because of a preference is the one behaviour none of this is
allowed to have. `docs/PLAN-trade-exhibitors.md` is the design record.

| File | Contents |
|---|---|
| `data/exhibitors.json` | Array of exhibitors: location, games, tags, crowd forecast — structure only. `type: "trade"` cards are business-area booths and carry `offers` and an `access` value instead of a lineup and a queue index |
| `data/directory.json` | The raw official exhibitor list (~1650 rows) with each row's product groups. Lazy-loaded — it backs the Full directory and the trade list. Generated by `tools/fetch-directory.py` |
| `data/event.json` | Event structure: opening times, business-area hours, trade-day flags, areas |
| `data/meta.json` | `lastUpdated` and `revision` — when the data last changed — plus `lastChecked`, the day the sources were last swept, which moves on every refresh whether or not it found anything. That is what lets a card nobody has had to correct in a week say so, instead of reading as a week stale |
| `data/i18n/<lang>.json` | Every sentence a visitor reads, per language, keyed back to the files above |
| `data/changelog.json` | Per-revision change notes, shown on the Updates tab (English only). Each bullet is tagged `content`, `feature` or `fix` — what the guide knows about the show, what it can do, what it was getting wrong — so "when did the game information last change" is one chip away rather than a read through every revision |
| `data/hallplan/index.json`, `data/hallplan/hall-*.json` | Booth outlines per hall level, for the map. Generated by `tools/fetch-hallplan.mjs` from Koelnmesse's hall-plan data — booth *numbers* stay editorial in `exhibitors.json`, and the two are joined at load time |
| `data/hallplan/outline.json` | How far each hall's wall stands off its booths, and where the doors in it are. Hand-written, and the one file in that directory the tool never touches: the official data files stand blocks and stands, never a wall or a doorway |
| `data/hallplan/campus.json` | The whole site in one diagram — every hall in its place, the Boulevard between them, the passages and the gates — behind the map's Overview chip. Generated by the same tool from the hall-plan page's campus outlines, which are fitted to Koelnmesse's artwork rather than drawn to scale: right about where a hall is, wrong about how big it is, and it says so |
| `worker/` | The live queue API Worker (deployed separately from the site, see `wrangler-api.toml`), estimator, phone moderation page and tracked D1 migrations; never copied into `dist/` |

### Languages

The guide is English and German. The language is decided at load time — the
`?lang` parameter, then a stored preference, then the browser's own — and a
switcher sits in the header and the footer. There are no `/de/` URLs: one
deploy, one service-worker scope, and a share link means the same thing
whoever opens it.

That last-resort browser detection is also why `?lang=de` has to be a real
address rather than an implementation detail. A crawler arrives with no German
preference and nothing stored, so left to itself it would see the English
guide on every visit and never learn the German one exists. `?lang=de` is the
one address that pins the language for anyone, so both switchers are `<a>`
elements pointing at it — `js/i18n.js` relabels them, keeps them on the view
you are reading, and takes the click so a real visitor still gets the choice
remembered rather than stuck in the URL. The `<link rel="alternate" hreflang>`
set in `index.html` and `map.html` says the two are editions of each other,
and `sitemap.xml` repeats the pairing.

Data and language are stored separately. The base files above hold ids, halls,
booth numbers and flags; the prose lives in `data/i18n/en.json` and
`data/i18n/de.json`, keyed by exhibitor id, game title, show date and area
name. A reader fetches the base data plus *one* language, so nobody downloads
prose they can't read. Weekday names aren't stored at all — they're formatted
from the date in the reader's language.

Two things stay English on purpose: proper nouns (game titles, exhibitor and
area names — game titles are also the identity behind saved marks and share
links, so translating them would break every link in circulation), and the
changelog, which is rewritten every few days. `imprint.html` stays English;
`privacy.html` contains both languages because queue reporting is the first optional
visitor action that reaches the server.

`js/i18n.js` is the whole runtime: language resolution, a ~45-line `t()` with
interpolation and plurals, and a `data-i18n` pass over the static markup.
`tools/check-i18n.mjs` enforces key, plural and placeholder parity, checks the
prose still points at data that exists, and flags English that changed after
its translation — `tools/build-site.sh` runs it before every deploy.

### Search and link previews

Everything below the masthead is rendered from JSON after boot, so the first
look any machine gets at this site is a header, a footer and no subject. Four
things put that right, and all four are checked by `tools/check-seo.mjs`
before a deploy — every one of them is hand-written about data that moves,
none of it shows on screen, and a mistake in any of it looks exactly like a
working site until it is somebody else's search result.

- **Canonical.** Four hostnames serve this file (see `wrangler.toml`), and the
  canonical is what stops them competing as four copies. On `?lang=de` it
  points at itself instead — a language edition that canonicals to the English
  page is one that gets dropped.
- **`hreflang`.** The German guide's only route in; see above.
- **JSON-LD.** An `Event` and a `WebSite`, so a crawler learns this is a
  listing for a five-day show in Cologne without running a script. Ticket
  prices are deliberately left out: the official shop is the only place that
  should be quoting those in a search result. The dates, name and venue are
  checked against `data/event.json` on every build.
- **Open Graph.** The guide is passed around in queues and Discord servers far
  more than it is searched for, and every unfurler that renders those links is
  a server that never runs a line of the page — so the preview text is static
  English in the markup rather than `data-i18n`, and `icons/og-cover.png`
  (`tools/make-screenshots.mjs`) is the card image.

`robots.txt` is a plain allow-all pointing at the sitemap. `sitemap.xml` is
generated into `dist/` at deploy time by `tools/make-sitemap.mjs`, which reads
its URLs back out of the staged pages' own `hreflang` links rather than
keeping a second list to fall out of step.

See [`docs/UPDATING.md`](docs/UPDATING.md) for the data schema and the periodic-refresh playbook (designed to be run by a scheduled Claude Code routine).

## Licensing

Two licences, because the repository holds two different kinds of thing.

| | Licence | |
|---|---|---|
| **Code** — `index.html`, `map.html`, `js/`, `css/`, `sw.js`, `worker/`, `test/`, `tools/` and Worker configuration | [MIT](LICENSE) | Take it, fork it for another show, no conditions beyond the notice |
| **Data** — `data/` | [CC BY 4.0](data/LICENSE) | Credit *hallgui.de* and say when you took it |

The data licence covers the editorial layer — the selection, the
confirmed/expected/rumored calls, the crowd forecasts, the sources and check
dates, and the compilation as a database. It does **not** cover the underlying
facts, which nobody owns, nor the generated `data/hallplan/index.json`,
`data/hallplan/hall-*.json` and `data/hallplan/campus.json`, which come from
Koelnmesse's published hall-plan data and are not this project's to relicense
(`outline.json` beside them is hand-written and *is* covered — none of it came
from there).
[`data/README.md`](data/README.md) sets out the line in full.

If that split looks fussy for a fan project: it is what keeps the repository
from claiming more than it can give. A single MIT over everything would have
offered strangers the right to sublicense Koelnmesse's hall plans.

## Disclaimer

Not affiliated with gamescom, Koelnmesse or game — Verband der deutschen Games-Branche. Game statuses are labeled: **confirmed** (officially announced for gamescom), **expected** (strongly implied), **rumored** (editorial guess). Crowd levels are estimates.
