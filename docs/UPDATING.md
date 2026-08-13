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
   ⚠️ News only surfaces the AAA names. Community and mid-size booths (Aternos,
   SCS Software, Behaviour, retro brands…) never make the press — they are only
   findable in the directory sweep below.
3. **Sweep the official exhibitor directory for new names** — the directory has no
   public API and its search form ignores query parameters, but the paginated AJAX
   endpoint works without a session, 20 entries per page:
   ```sh
   # loop start=0,20,40,… until past the total reported by blaetternInfo(N) in the response
   curl -s "https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/?route=aussteller/blaettern&fw_ajax=1&start=0"
   ```
   Each result item carries the company name, country and a hall-plan link with
   `halle=` / `standnr=` parameters. Diff at least the consumer halls (5.x–10.x)
   against `data/exhibitors.json` on every refresh; halls 1–4.x are the trade-only
   business area, and `F…` values are open-air sites. Useful permalinks:
   - Directory entry: `https://exhibitors.gamescom.global/exhibitor/<slug>/` (slug from the result link)
   - Self-managed profile with booth program: `https://www.gamescom.global/en/exhibitor/<slug>`
     (different slug namespace; the page embeds a JSON `partner` payload with products,
     events and booth descriptions — grep the page source for `\"partner\":`)
4. **Re-check `officialUrl` links** — the self-managed profile is what the exhibitor
   itself publishes (booth program, trailers, meet-and-greet times), so it's the one
   link per booth worth surfacing. The slugs are legal-entity names, not brands
   (`ea-swiss-sarl`, `gryph-frontier-pte-ltd`), so don't guess them — enumerate the
   list page, which paginates with `?page=N` and repeats the last page once exhausted:
   ```sh
   # ~9 pages of ~100; each embedded partner object carries name, nameShort and slug
   curl -s "https://www.gamescom.global/en/exhibitors?page=1" | grep -o '"nameShort\\?":.\\{0,120\\}'
   ```
   Two rules keep these honest, because a wrong slug silently sends visitors to another
   company: **open every URL you add** and confirm the `<title>` names the right
   exhibitor (a missing profile soft-404s with a `200` and `<title>404 | gamescom</title>`),
   and **skip any partner whose payload has `"disablePartnerPage": true`** — gamescom
   itself stops linking those, so we don't either.
5. **Update `data/exhibitors.json`**:
   - Add newly announced exhibitors.
   - Upgrade game `status` (`rumored` → `expected` → `confirmed`) as info firms up; **never downgrade silently** — remove a game only if it's officially not coming, and note why in the commit message.
   - Fill in `hall`/`booth` and flip `locationConfirmed` to `true` when officially published.
   - Set `playable` when hands-on demos are confirmed.
   - Re-check show-floor age gates: set numeric game `age` and `ageStatus`, or booth-wide `ageRestricted`, only when a source supports the restriction.
   - Re-evaluate `crowd`, `crowdNote` and `visitAdvice` when new info (booth size, lineup hype, ticket sellouts) changes the picture.
   - Add `officialUrl` for any exhibitor that gained a profile page, and drop it again if a page disappears.
   - Refresh each touched exhibitor's `lastUpdated` and append new `sources`.
6. **Update `data/event.json`** if hours/tickets/areas/ONL details changed (e.g. days selling out — that raises crowd levels too).
7. **Bump `data/meta.json`**: set `lastUpdated` to today (ISO date), increment `revision`, adjust `note` if warranted.
8. **Append a `data/changelog.json` entry** (newest first) for the new revision, with a short
   human-readable bullet per meaningful change — this renders on the site's Updates tab.
   Skip trivia; write for visitors ("Ubisoft booth confirmed: Hall 6 B010"), not diffs.
9. **Validate**: every file must parse as JSON and satisfy the schema below. Quick check:
   ```sh
   node -e "['exhibitors','event','meta','changelog'].forEach(f=>JSON.parse(require('fs').readFileSync('data/'+f+'.json')))"
   ```
10. **Commit & push to `main`** with a message summarizing what changed, e.g.
   `data: Ubisoft booth confirmed Hall 6 B010; add Anno 118 as playable; bump rev 7`.

## Editorial rules

- `status` semantics — keep these honest, the UI surfaces them to users:
  - `confirmed`: exhibitor or gamescom officially announced it for the show
  - `expected`: strongly implied (e.g. publisher confirmed + game launches in Sept/Oct)
  - `rumored`: our inference only — press speculation, past-year patterns
- `locationConfirmed: false` + a hall value means "best guess (often from 2025 placement)". The UI marks the hall block amber and suffixes the booth with "· unconf."
- The tags `not exhibiting` and `offsite` are load-bearing for the hall view of the planner's "Your plan" board. Use those exact strings: `not exhibiting` excludes an entry from the route and lists it in the absent footnote only; `offsite` files a **hall-less** entry under the Offsite bucket. A `hall` value always wins over the `offsite` tag — an entry carrying both (Tencent runs a Hall 8.1 booth *and* the offsite Wassermannhalle exhibition) is routed to its hall, because that is the stop a visitor walks to.
- `age` is the minimum age for an interactive demo **on the show floor**, not the USK or PEGI rating of the finished game. `ageStatus: "confirmed"` needs an exhibitor statement or official listing; a restriction inferred from the game's rating stays `"expected"`. Keep `age` numeric so lower gates remain expressible, but the current UI only filters and badges values `>= 18`. Use exhibitor-level `ageRestricted: true` only for a gated zone with no single game to attach it to — it is a hand-written assertion that the gate is real, so the UI treats it as confirmed and does *not* mark the booth "18+ expected".
- The `Hide 18+` filter is a **browsing filter** ("don't show me demos I can't play"), not a content filter: it hides lineup rows, while descriptions, `visitAdvice` and tags stay as written and stay searchable. Don't write data on the assumption that a title is suppressed everywhere when it is hidden.
- `platforms` is rendered on each game row as short codes (`XSX`, `SW2`, `PS5`…). Unknown values fall back to the uppercased string, so keep them short and consistent — see `PLATFORM_CODES` in `js/app.js` to add a new mapping.
- Crowd scale: 1 calm · 2 light · 3 moderate · 4 busy (30–90 min queues) · 5 extreme (2 h+ queues, may cap lines early).
- Don't remove the `sources` history; append.
- `officialUrl` is the **only** outbound link on a card, so it points at gamescom's own
  profile for that booth — never a publisher's marketing site, and never a directory
  search result. Booths we run as one entry but gamescom registers as two (Team17 ×
  astragon, Paradox / Urban Games) get the headliner's page; a second link would just
  make the reader choose. `sources` is where the rest of the evidence goes.
- **A game `title` is a user-facing key, so treat it like `id`.** Visitors save games and
  mark them played by lowercased title, and day assignments in `gc2026.itinerary.v1`
  deliberately follow the same key — rename *Fable* to *Fable (2026)* and everyone who
  saved or played it silently loses that mark, on every booth showing it, and the rename
  also orphans its day assignment. Correct an outright wrong title, but don't
  re-punctuate, re-subtitle or "tidy" one that already works. The same key is why a title
  spelled identically at two booths (Alien: Isolation 2 at both Xbox and SEGA) is saved
  and marked played at both at once — which is the intent, so keep shared titles spelled
  the same across exhibitors.

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
  "officialUrl": "https://www.gamescom.global/en/exhibitor/xbox",  // optional: official profile, omit when there is none
  "ageRestricted": true,           // optional: booth-wide age gate when no game fits
  "description": "1–2 sentences on what they're showing.",
  "games": [
    {
      "title": "Fable",
      "status": "confirmed",       // confirmed | expected | rumored
      "playable": true,            // true | false | null (unknown)
      "age": 18,                   // optional: minimum age for this show-floor demo
      "ageStatus": "confirmed",   // optional: confirmed | expected (default expected)
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
  "days": [
    {
      "date": "2026-08-26",
      "label": "Wednesday",
      "access": "trade & media only",
      "hours": "Business 09:00–19:00, entertainment 13:00–19:00",
      "open": "13:00",             // entertainment-area opening, HH:MM
      "close": "19:00",            // entertainment-area closing, HH:MM
      "note": "..."
    }
  ],
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

## The offline cache

The guide is an installable PWA and `sw.js` caches the data files, so a data-only
refresh needs nothing done here: JSON is served network-first, and an online visitor
always gets the new revision on their next load. Installed copies re-check for a new
service worker when the window is brought back to the foreground, at most hourly.

`VERSION` at the top of `sw.js` only needs bumping to **discard** every cached copy —
for example if a data file is renamed or removed. Changes to `css/`, `js/` and the
data files propagate on their own.

A caveat worth knowing when a change looks like it did not deploy: a visitor who
already has the guide open is one load behind by design — the cached copy is served
first and replaced in the background — and the browser's own HTTP cache holds these
files for ten minutes on top of that. So a CSS or JS change can take a few minutes and
a couple of loads to appear on a device that has been there before. It is not stuck;
closing the app and reopening it, or accepting the "newer version is ready" prompt,
takes it immediately. What is *not* normal is never seeing it at all — that was a real
bug in the caching, fixed in the same commit as this note.

Icons and manifest screenshots are generated, not hand-drawn, and only go stale if
the design changes:

```sh
pip install pillow fonttools brotli && python3 tools/make-icons.py
# screenshots (optional; needs playwright and the site served locally)
node tools/make-screenshots.mjs
```

## Refreshing the webfonts

Fonts are self-hosted in `fonts/` so no visitor request reaches a third party. They
only need regenerating if a family changes or you add one. From the repo root:

```sh
python3 - <<'PY'
import re, subprocess, os, pathlib
SPECS = [("Archivo", "Archivo:wght@400..700", "archivo"),
         ("Archivo Narrow", "Archivo+Narrow:wght@600..700", "archivo-narrow"),
         ("JetBrains Mono", "JetBrains+Mono:wght@400..700", "jetbrains-mono"),
         ("Anton", "Anton", "anton")]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
KEEP = {"latin", "latin-ext"}          # German umlauts live in latin
os.makedirs("fonts", exist_ok=True)
out = ["/* Generated — see docs/UPDATING.md. Licences in fonts/LICENSE.md. */\n"]
for family, spec, slug in SPECS:
    css = subprocess.run(["curl","-sA",UA,
        f"https://fonts.googleapis.com/css2?family={spec}&display=swap"],
        capture_output=True, text=True).stdout
    for subset, block in re.findall(r"/\* (\S+) \*/\s*(@font-face \{.*?\})", css, re.S):
        if subset not in KEEP: continue
        url = re.search(r"url\((https://[^)]+)\)", block).group(1)
        fname = f"{slug}-{subset}.woff2"
        subprocess.run(["curl","-sA",UA,url,"-o",f"fonts/{fname}"], check=True)
        out.append(f"/* {family} — {subset} */\n{block.replace(url, f'../fonts/{fname}')}\n")
pathlib.Path("css/fonts.css").write_text("\n".join(out))
PY
```

The Chrome user-agent matters — Google serves `.ttf` to unknown clients and the far
smaller `woff2` (and the variable-weight files) only to modern browsers. Re-check
`fonts/LICENSE.md` if you add a family; everything shipped must be OFL or equivalent.

## Suggested routine prompt

> Follow docs/UPDATING.md in this repo: re-check official gamescom 2026 sources and
> recent news, update data/*.json accordingly (new exhibitors, confirmed booths/halls,
> lineup changes, crowd re-evaluation), bump data/meta.json, validate JSON, then
> commit and push to main with a summary of changes. If nothing changed, do nothing.

Cadence: every 2–3 days until ~Aug 20, then daily through the show (booth numbers and
demo lineups often land in the final week).
