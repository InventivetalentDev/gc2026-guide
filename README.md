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
- Crowd forecasts (1–5) per exhibitor and a **Visit planner** with queue-priority list, 18+ wristband checklist and day-by-day advice
- **Live queue times during the show** — optional reports under a random, resettable device id per playable game (or per booth where there is no playable lineup), server-side aggregation with report count and age, measured waits that can finish offline, and a phone-first moderation console
- **Your plan** — one board for everything you saved, arranged **by day** (assign each stop a day, see that day's hours and crowd advice inline, export to calendar) or **by hall** (walking order, with per-stop day tags and a single-day filter)
- **Hall map** — every hall drawn booth by booth, with exhibitor names *on* the booths and your saved ones lit up; tap a booth for its lineup and queue call. The entertainment halls and the trade-only business halls, each washed in the colour the official plan gives that area, with the business ones flagged as the door a consumer ticket does not open. Every hall or booth number named anywhere in the guide — card plates, your plan, queue priority, the full directory, the halls and areas in Event info — opens it on that stand, and it works offline like everything else
- **Trade exhibitors**, behind one setting — "I have a trade badge", off by default, switchable from the Badge row at the top of the filters, from Event info, from the trade section itself, or from the map's business-area banner. It opens the business halls (2–4): ~820 booths the guide otherwise walks past, saveable and plannable like any other stop, with product-group filters, curated cards for the platforms, services and national pavilions standing there, and the one thing that decides whether walking over is worth it — whether a booth is an open stand or a closed room you need an appointment for. A booth saved there is a stop in the same plan as your Thursday demo queue, and the planner warns when one lands on a day the business area is shut
- **Two-faced cards** for the twenty-odd exhibitors with a booth on each side of the show. Capcom demos in Hall 9.1 and takes meetings in 4.2; tap the small purple square in the corner of the hall plate and the card turns over to its business booth, tap the cyan one to turn it back. The square is the other booth's plate in miniature, and both colours are Koelnmesse's own — purple for the business halls, cyan for the entertainment ones — so a plate means the same thing here as it does on the official plan. The two booths stay separate stops in your plan, because they keep different hours
- Event info: dates, hours, tickets, special areas with the way onto the map for the hall each stands in, Opening Night Live, and which of the four **entrances** to use — including what a trade badge changes about that and about when you get in
- **Installable and offline-capable** — add it to your home screen and the whole guide
  stays readable in a hall with no reception

## Install / offline

The guide is a PWA. Chrome, Edge and Samsung Internet offer an **Install app** button
in the masthead; iOS Safari gets the same button pointing at *Share → Add to Home
Screen*. Installed or not, `sw.js` caches the shell and the data on first visit, which
is the point of the whole thing: Koelnmesse's halls eat mobile reception, and the
guide is most needed exactly where the network is worst.

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

That mode deliberately has no live queue API. To run the complete app with a local D1
database, use Node 22+, then:

```sh
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply QUEUE_DB --local
tools/build-site.sh
npx wrangler dev
# open http://localhost:8787/?queue-dev=1
```

The example's paired clock values put the Worker inside the show window so the
time-gated report flow can be exercised before Aug 26. They live only in the ignored
local environment file, never in Wrangler's deployed configuration or a request field.

## Deploying

Live on **Cloudflare Workers** as a hybrid Worker: static files still go straight from
the edge, while only `/api/*` runs the small queue script backed by D1.
`.github/workflows/cloudflare.yml` verifies pull requests and deploys `main`;
`wrangler.toml` is the configuration. There is still no client compile step:
`tools/build-site.sh` copies the site into `dist/` for upload, while `worker/` remains
server code outside the asset directory.

It runs there rather than on GitHub Pages because Pages gives a repository one custom
domain and the guide answers on four: **`hallgui.de`**, plus `gamescom.guide`,
`gc26.guide` and the original `gc2026.inventivetalent.org` for as long as those three
take to drain. All three are bookmarked or installed on somebody's phone, and a saved
list is per-origin — so they keep serving the guide rather than a redirect until the
people standing on them have been offered the move.

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

Throughout all of it the guide still calls the show by its name, which is ordinary
referential use and was never the part anyone objects to. Only the domain moved.

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

The `+` on a card head saves a booth; the `+` on a lineup row saves a single game.
Both are kept in `localStorage` under `gc2026.saved.v1` — no account, no server, and
nothing leaves the device unless you share a link yourself. Two tabs of the guide stay
in sync via the `storage` event, and if storage is blocked altogether (Safari private
mode) the list still works for the session instead of throwing.

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
day's stops in hall order. Assignments are kept separately under `gc2026.itinerary.v1`,
follow the same booth and game keys, and stay on this device too; the arrangement you
last picked is a view preference in `gc2026.prefs.v1`.

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

The `✓` beside every game and booth records what you have already played. A booth
counts as played when you tick it directly, or when every game you saved there has
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
normalisation that decides which stand lights up, and the `dir:<slug>` identity
a business-hall booth is saved under on either page.

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
| `data/meta.json` | `lastUpdated`, `revision` |
| `data/i18n/<lang>.json` | Every sentence a visitor reads, per language, keyed back to the files above |
| `data/changelog.json` | Per-revision change notes, shown on the Updates tab (English only) |
| `data/hallplan/index.json`, `data/hallplan/hall-*.json` | Booth outlines per hall level, for the map. Generated by `tools/fetch-hallplan.mjs` from Koelnmesse's hall-plan data — booth *numbers* stay editorial in `exhibitors.json`, and the two are joined at load time |
| `data/hallplan/outline.json` | How far each hall's wall stands off its booths, and where the doors in it are. Hand-written, and the one file in that directory the tool never touches: the official data files stand blocks and stands, never a wall or a doorway |
| `worker/` | Live queue Worker, estimator, phone moderation page and tracked D1 migrations; never copied into `dist/` |

### Languages

The guide is English and German. The language is decided at load time — the
`?lang` parameter, then a stored preference, then the browser's own — and a
switcher sits in the header and the footer. There are no `/de/` URLs: one
deploy, one service-worker scope, and a share link means the same thing
whoever opens it.

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
facts, which nobody owns, nor the generated `data/hallplan/index.json` and
`data/hallplan/hall-*.json`, which come from Koelnmesse's published hall-plan
data and are not this project's to relicense (`outline.json` beside them is
hand-written and *is* covered — none of it came from there).
[`data/README.md`](data/README.md) sets out the line in full.

If that split looks fussy for a fan project: it is what keeps the repository
from claiming more than it can give. A single MIT over everything would have
offered strangers the right to sublicense Koelnmesse's hall plans.

## Disclaimer

Not affiliated with gamescom, Koelnmesse or game — Verband der deutschen Games-Branche. Game statuses are labeled: **confirmed** (officially announced for gamescom), **expected** (strongly implied), **rumored** (editorial guess). Crowd levels are estimates.
