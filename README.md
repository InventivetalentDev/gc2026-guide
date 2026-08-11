# gamescom 2026 Guide

An unofficial, fan-made web guide to **gamescom 2026** (Cologne, Aug 26–30, 2026).

**Features**

- Overview of exhibitors with their announced (or rumored) games and products
- Hall & booth locations where known — clearly marked when unconfirmed
- Search across exhibitors, games and tags; filters by category, hall, playable demos and age gate (hide 18+ / 18+ only)
- **Saved list** — bookmark booths and individual games, then filter both the exhibitor grid and the queue-priority list down to just those
- **Shareable saved lists** — move a plan to another device or send it to a friend with a link or scannable QR code
- Crowd forecasts (1–5) per exhibitor and a **Visit Planner** with queue-priority list, 18+ wristband checklist and day-by-day advice
- Event info: dates, hours, tickets, special areas, Opening Night Live
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

It's a fully static site — no build step. Serve the repo root with any static server:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` via `file://` won't work because the app fetches JSON.)

## Deploying

Any static host works. For GitHub Pages: repo **Settings → Pages → Source: GitHub Actions** — the included workflow (`.github/workflows/pages.yml`) deploys on every push to `main`.

## Design

**"Hall Signage"** — trade-fair wayfinding crossed with print. The hall number is
what you actually read while walking a show floor, so it gets a solid orange plate
and the largest type on the card (amber when the location is still a guess, grey
when it's TBA). Exhibitors are discrete panels with hard, unblurred offset shadows
rather than cells sharing hairlines. One signal colour, near-square corners, no
gradients, no emoji, no blurred elevation.

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

Shared links encode guide identifiers only — exhibitor IDs and compact game codes. The
link and its QR code are built entirely in your browser, so no saved-list data is
uploaded or sent anywhere by the guide. Opening one never replaces an existing list:
it asks before adding to a non-empty list, while an empty list imports immediately with
an Undo option. Opening the link consumes it — it does not stay in the address bar to be
forwarded on — so until the question is answered the tab keeps its own copy: dismissing
the prompt costs a reload rather than the whole list. Answer it, or close the tab, and
the copy is gone.

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
absolute ranks, and **Hide played** removes them altogether.

Played marks live in a second local-only storage entry, `gc2026.played.v1`, separate
from the saved list; **Hide played** is a view preference rather than a mark, so it
sits in `gc2026.prefs.v1` next to the age filter. All of it works offline, stays in
sync between tabs, and never leaves the device.

Played marks are deliberately **not** part of a shared link. A shared list is a plan
you hand to someone else, and your progress through it is not theirs — `?l=` carries
saved booths and games only.

## Architecture

All content lives in `data/` as JSON; the app (`index.html`, `js/app.js`, `css/`) is a thin renderer. **Updating the guide never requires code changes — only edit the JSON files.** `js/pwa.js` (install, update and offline state) and `sw.js` (caching) are separate from the renderer and untouched by data work.

| File | Contents |
|---|---|
| `data/exhibitors.json` | Array of exhibitors: location, games, tags, crowd forecast |
| `data/event.json` | Event meta: dates, hours, tickets, areas, crowd tips |
| `data/meta.json` | `lastUpdated`, `revision`, freshness note |
| `data/changelog.json` | Per-revision change notes, shown on the Updates tab |

See [`docs/UPDATING.md`](docs/UPDATING.md) for the data schema and the periodic-refresh playbook (designed to be run by a scheduled Claude Code routine).

## Disclaimer

Not affiliated with gamescom, Koelnmesse or game — Verband der deutschen Games-Branche. Game statuses are labeled: **confirmed** (officially announced for gamescom), **expected** (strongly implied), **rumored** (editorial guess). Crowd levels are estimates.
