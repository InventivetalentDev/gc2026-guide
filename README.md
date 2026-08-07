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

The site ships **three visual directions on identical markup and content**, switchable
from the footer (the choice is remembered in `localStorage`). They exist so one can be
picked and the other two deleted:

| Direction | Idea | Trade-off |
|---|---|---|
| **Signage** (default) | Trade-fair wayfinding — hall numbers set like Koelnmesse signage, hairline rules, one signal colour, no gradients or shadows | Calm and dense; the least "loud" of the three |
| **Fanzine** | Photocopied show handout — newsprint ground, poster-weight display type, hard offset shadows, two spot colours | The only light direction, so the only one that stays readable in the sunlit halls |
| **Console** | Terminal readout — all monospace, full-width dense rows, amber on near-black | Best density-per-screen, least welcoming to a first-timer |

`css/style.css` holds the tokens, layout and components with the Signage values baked
into `:root`. `css/themes.css` re-declares only colour, type and shape under
`[data-theme="zine"]` / `[data-theme="console"]`. To commit to one direction: delete
`themes.css`, its `<link>`, and the footer's `.theme-switch` block.

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
