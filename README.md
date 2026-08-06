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

## Architecture

All content lives in `data/` as JSON; the app (`index.html`, `js/app.js`, `css/style.css`) is a thin renderer. **Updating the guide never requires code changes — only edit the JSON files.**

| File | Contents |
|---|---|
| `data/exhibitors.json` | Array of exhibitors: location, games, tags, crowd forecast |
| `data/event.json` | Event meta: dates, hours, tickets, areas, crowd tips |
| `data/meta.json` | `lastUpdated`, `revision`, freshness note |

See [`docs/UPDATING.md`](docs/UPDATING.md) for the data schema and the periodic-refresh playbook (designed to be run by a scheduled Claude Code routine).

## Disclaimer

Not affiliated with gamescom, Koelnmesse or game — Verband der deutschen Games-Branche. Game statuses are labeled: **confirmed** (officially announced for gamescom), **expected** (strongly implied), **rumored** (editorial guess). Crowd levels are estimates.
