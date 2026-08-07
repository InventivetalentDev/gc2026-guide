# gamescom 2026 Guide

An unofficial, fan-made web guide to **gamescom 2026** (Cologne, Aug 26–30, 2026).

**Features**

- Overview of exhibitors with their announced (or rumored) games and products
- Hall & booth locations where known — clearly marked when unconfirmed
- Search across exhibitors, games and tags; filters by category, hall, playable demos
- Crowd forecasts (1–5) per exhibitor and a **Visit Planner** with queue-priority list and day-by-day advice
- Event info: dates, hours, tickets, special areas, Opening Night Live

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

## Architecture

All content lives in `data/` as JSON; the app (`index.html`, `js/app.js`, `css/`) is a thin renderer. **Updating the guide never requires code changes — only edit the JSON files.**

| File | Contents |
|---|---|
| `data/exhibitors.json` | Array of exhibitors: location, games, tags, crowd forecast |
| `data/event.json` | Event meta: dates, hours, tickets, areas, crowd tips |
| `data/meta.json` | `lastUpdated`, `revision`, freshness note |
| `data/changelog.json` | Per-revision change notes, shown on the Updates tab |

See [`docs/UPDATING.md`](docs/UPDATING.md) for the data schema and the periodic-refresh playbook (designed to be run by a scheduled Claude Code routine).

## Disclaimer

Not affiliated with gamescom, Koelnmesse or game — Verband der deutschen Games-Branche. Game statuses are labeled: **confirmed** (officially announced for gamescom), **expected** (strongly implied), **rumored** (editorial guess). Crowd levels are estimates.
