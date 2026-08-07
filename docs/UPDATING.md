# Data update playbook

This guide's content will change frequently until gamescom 2026 opens (Aug 26, 2026):
exhibitors announce lineups, booth numbers get published, rumors get confirmed or die.
This document is the playbook for refreshing the data — written so a scheduled
**Claude Code routine** can execute it unattended.

## What to do on each refresh

1. **Re-check primary sources** (in order of authority):
   - Official exhibitor directory: https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/ (has hall + booth numbers once published)
   - Official hall plan: https://www.gamescom.global/en/info/hall-plan
   - gamescom news: https://www.gamescom.global/en
   - Publisher/platform press releases and socials (Xbox Wire, Nintendo, Capcom, HoYoverse, etc.)
   - Gaming press for lineup roundups: gematsu.com, insider-gaming.com, trueachievements.com, gamesradar.com
2. **Web-search for news since the last update** — query patterns like
   `gamescom 2026 <exhibitor> lineup`, `gamescom 2026 booth`, `gamescom 2026 playable`,
   restricted to the last ~2 weeks.
3. **Update `data/exhibitors.json`**:
   - Add newly announced exhibitors.
   - Upgrade game `status` (`rumored` → `expected` → `confirmed`) as info firms up; **never downgrade silently** — remove a game only if it's officially not coming, and note why in the commit message.
   - Fill in `hall`/`booth` and flip `locationConfirmed` to `true` when officially published.
   - Set `playable` when hands-on demos are confirmed.
   - Re-evaluate `crowd`, `crowdNote` and `visitAdvice` when new info (booth size, lineup hype, ticket sellouts) changes the picture.
   - Refresh each touched exhibitor's `lastUpdated` and append new `sources`.
4. **Update `data/event.json`** if hours/tickets/areas/ONL details changed (e.g. days selling out — that raises crowd levels too).
5. **Bump `data/meta.json`**: set `lastUpdated` to today (ISO date), increment `revision`, adjust `note` if warranted.
6. **Append a `data/changelog.json` entry** (newest first) for the new revision, with a short
   human-readable bullet per meaningful change — this renders on the site's Updates tab.
   Skip trivia; write for visitors ("Ubisoft booth confirmed: Hall 6 B010"), not diffs.
7. **Validate**: every file must parse as JSON and satisfy the schema below. Quick check:
   ```sh
   node -e "['exhibitors','event','meta','changelog'].forEach(f=>JSON.parse(require('fs').readFileSync('data/'+f+'.json')))"
   ```
8. **Commit & push to `main`** with a message summarizing what changed, e.g.
   `data: Ubisoft booth confirmed Hall 6 B010; add Anno 118 as playable; bump rev 7`.

## Editorial rules

- `status` semantics — keep these honest, the UI surfaces them to users:
  - `confirmed`: exhibitor or gamescom officially announced it for the show
  - `expected`: strongly implied (e.g. publisher confirmed + game launches in Sept/Oct)
  - `rumored`: our inference only — press speculation, past-year patterns
- `locationConfirmed: false` + a hall value means "best guess (often from 2025 placement)". The UI renders it amber with an "(unconfirmed)" suffix.
- Crowd scale: 1 calm · 2 light · 3 moderate · 4 busy (30–90 min queues) · 5 extreme (2 h+ queues, may cap lines early).
- Don't remove the `sources` history; append.

## Schema

### `data/exhibitors.json` — array of:

```jsonc
{
  "id": "xbox",                    // stable slug, never change once published
  "name": "Xbox (Microsoft)",
  "type": "platform",              // platform | publisher | hardware | indie | media | merch
  "hall": "8",                     // string or null (halls can be "4.1" style)
  "booth": "B010",                 // string or null
  "locationConfirmed": false,      // true only when officially published for 2026
  "description": "1–2 sentences on what they're showing.",
  "games": [
    {
      "title": "Fable",
      "status": "confirmed",       // confirmed | expected | rumored
      "playable": true,            // true | false | null (unknown)
      "platforms": ["Xbox Series X|S", "PC"],
      "note": "one-line context (optional)"
    }
  ],
  "tags": ["AAA", "shooter", "family-friendly"],
  "crowd": 5,                      // 1–5, see scale above
  "crowdNote": "why this rating",
  "visitAdvice": "when to go / queue strategy",
  "sources": ["https://..."],
  "lastUpdated": "2026-08-06"
}
```

### `data/event.json`

```jsonc
{
  "name": "gamescom 2026",
  "location": "Koelnmesse, Cologne",
  "dates": "Aug 26–30, 2026",
  "startDate": "2026-08-26",       // used for the countdown
  "endDate": "2026-08-30",
  "days": [ { "date": "2026-08-26", "label": "Wednesday", "access": "trade & media only", "hours": "09:00–19:00", "note": "..." } ],
  "onl": { "date": "Tue, Aug 25", "time": "20:00 CEST", "note": "..." },
  "tickets": "summary incl. sold-out status",
  "areas": [ { "name": "Indie Arena Booth", "hall": "10.2", "description": "..." } ],
  "crowdTips": ["...", "..."],
  "sources": ["https://..."]
}
```

### `data/meta.json`

```jsonc
{ "lastUpdated": "2026-08-06", "revision": 1, "note": "shown in the footer" }
```

### `data/changelog.json` — array, newest first:

```jsonc
[
  {
    "date": "2026-08-07",
    "revision": 2,
    "changes": ["One bullet per meaningful change, visitor-readable."]
  }
]
```

## Suggested routine prompt

> Follow docs/UPDATING.md in this repo: re-check official gamescom 2026 sources and
> recent news, update data/*.json accordingly (new exhibitors, confirmed booths/halls,
> lineup changes, crowd re-evaluation), bump data/meta.json, validate JSON, then
> commit and push to main with a summary of changes. If nothing changed, do nothing.

Cadence: every 2–3 days until ~Aug 20, then daily through the show (booth numbers and
demo lineups often land in the final week).
