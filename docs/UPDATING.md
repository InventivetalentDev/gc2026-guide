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
3. **Sweep the official exhibitor directory for new names** — this is now scripted.
   `tools/fetch-directory.py` walks the paginated AJAX endpoint (no session needed,
   20 entries per page, total reported by `blaetternInfo(N)`) and rewrites
   `data/directory.json`, which the site's **Full directory** section reads:
   ```sh
   python3 tools/fetch-directory.py                    # whole show → data/directory.json
   python3 tools/fetch-directory.py --hall 10.1        # one hall, to stdout, for eyeballing
   python3 tools/fetch-directory.py --skip-categories  # names and stands only, ~1 min
   ```
   Re-run it on every refresh — it is the file that answers "is this company even
   here?", and a stale copy silently misses new registrations.

   The full run also sweeps the official **product-group** taxonomy once per group
   to fill each row's `cats` (the tags the Trade exhibitors section renders and
   filters by). That is most of its runtime — a few minutes against ~150 requests —
   so `--skip-categories` exists for a quick booth-number refresh. It writes no
   `groups`/`cats` at all, which means the trade list loses its category chips
   until the next full run; prefer the full sweep unless you are in a hurry.

   Two of its stderr lines are worth reading rather than scrolling past:
   ```
   categories: 18 groups · 1621/1658 exhibitors tagged
   share tokens: 1038 identities, no collisions
   ```
   The second is a real check, not decoration. Trade booths are saved and shared
   under `dir:<slug>` keys, and the share format hashes every identity to a
   5-character token; a token claimed twice is abandoned by both claimants, so
   those items silently stop riding share links. The tool mirrors `tok36()` from
   `js/app.js` and warns before such a dataset ships. If it ever does warn, the
   fix is a wider `TOK_LEN` in `js/app.js` (a share-format change), not an edit
   here.

   The search form ignores plain query parameters, but it does accept its whole
   state as one JSON blob in `paginatevalues`, which is how the `--hall` filter
   works; every key has to be present even when empty (see `FORM` in the script).

   Then diff the sweep against `data/exhibitors.json` by hand and decide what earns
   a card. Concentrate on the consumer halls (5.x–10.x); halls 1–4.x are the
   trade-only business area, and `F…` values are open-air sites. **Hall 10 is where
   the long tail lives** — 10.1 alone carries ~184 booths and 10.2 ~460, most of the
   latter being individual studios inside the Indie Arena Booth. Two things there
   are worth re-checking every time, because neither is ever in the press: the
   hardware/peripheral row in 10.1's A–D rows, and anything registered under a legal
   entity that hides a known brand (MOZA Racing files as *Shenzhen Gudsen Technology*,
   Backforce as *Interstuhl*, AULA as *Dongguan Suoai Electronics*). The self-managed
   profile payload in step 4 carries a `Brand` field that unmasks most of these.
   Useful permalinks:
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
6. **Update `data/event.json`** if hours/tickets/areas/ONL details changed (e.g. days selling out — that raises crowd levels too). Each day's `business` field is
   load-bearing: `"closed"` there is what makes the planner warn a trade visitor
   who has put a business-hall stop on a Saturday. Its source is gamescom's own
   opening-hours table on
   <https://www.gamescom.global/en/info/trade-visitors>, which lists the business
   and entertainment areas in separate columns.
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
- **In `booth`, the slash joins the halves of one stand and the comma separates stands.** `A030/B029` is a single shared stand; `A030/B029, A040, A029` is LEGO's three. Both the map's highlight and the directory's "at &lt;host&gt;" label read this, so an exhibitor holding several stands needs all of them or the map calls the unlisted ones "not covered by the guide" — which is what happened to Ubisoft's second Hall 6.1 booth. Put the stand a visitor should walk to first: it is the one the card's plate deep-links to. `node tools/fetch-hallplan.mjs --report` names any stand filed under an exhibitor we cover whose card has not claimed it.
- The tags `not exhibiting` and `offsite` are load-bearing for the hall view of the planner's "Your plan" board. Use those exact strings: `not exhibiting` excludes an entry from the route and lists it in the absent footnote only; `offsite` files a **hall-less** entry under the Offsite bucket. A `hall` value always wins over the `offsite` tag — an entry carrying both (Tencent runs a Hall 8.1 booth *and* the offsite Wassermannhalle exhibition) is routed to its hall, because that is the stop a visitor walks to.
- `age` is the minimum age for an interactive demo **on the show floor**, not the USK or PEGI rating of the finished game. `ageStatus: "confirmed"` needs an exhibitor statement or official listing; a restriction inferred from the game's rating stays `"expected"`. Keep `age` numeric so lower gates remain expressible, but the current UI only filters and badges values `>= 18`. Use exhibitor-level `ageRestricted: true` only for a gated zone with no single game to attach it to — it is a hand-written assertion that the gate is real, so the UI treats it as confirmed and does *not* mark the booth "18+ expected".
- The `Hide 18+` filter is a **browsing filter** ("don't show me demos I can't play"), not a content filter: it hides lineup rows, while descriptions, `visitAdvice` and tags stay as written and stay searchable. Don't write data on the assumption that a title is suppressed everywhere when it is hidden.
- `platforms` is rendered on each game row as short codes (`XSX`, `SW2`, `PS5`…). Unknown values fall back to the uppercased string, so keep them short and consistent — see `PLATFORM_CODES` in `js/app.js` to add a new mapping.
- Crowd scale: 1 calm · 2 light · 3 moderate · 4 busy (30–90 min queues) · 5 extreme (2 h+ queues, may cap lines early).
- Don't remove the `sources` history; append. **`sources` is user-facing** — the ⓘ marker
  in a card's foot opens the list, so every URL is one a visitor can be sent to. Keep
  them deep links to the page that actually carries the claim rather than a site's front
  page or a search result, drop one that has gone dead instead of leaving it to 404 on a
  reader, and don't paste in a paywalled or login-walled URL as the only evidence for a
  booth. Non-`http(s)` entries are dropped by the UI without a word, so they read as
  missing evidence rather than as a note.
- `officialUrl` is the only outbound link **in the card's own layout**, so it points at
  gamescom's own profile for that booth — never a publisher's marketing site, and never a
  directory search result. Booths we run as one entry but gamescom registers as two
  (Team17 × astragon, Paradox / Urban Games) get the headliner's page; a second link
  would just make the reader choose. `sources` is where the rest of the evidence goes,
  and it is a click away behind the marker rather than competing with the plan.
  One narrow exception: an area or stand run by gamescom itself, which has no partner
  profile to link, may point at gamescom's own page for that thing — `gamescom-lan` links
  to `lan.gamescom.global` and `gamescom-campus` to `/en/program/areas/gamescom-campus`
  (the other area pages under `/en/program/areas/` follow the same slug pattern). That is
  still gamescom publishing about its own floor, which is what the rule protects; a
  vendor's shop is not.
- `lastUpdated` is user-facing for the same reason — the sources dialog prints it as
  "Last checked". Only move it when you actually re-checked that entry's sources.
- `type: "experience"` is for booths whose draw is **something you do rather than a
  game you demo** — sim rigs, VR, a rideable robot, an RC drift track, head-only table
  tennis. Keep it broad on purpose: the specific flavour goes in `tags`
  (`sim racing`, `attraction`, `VR`), so next year's stunt needs no new type. A company
  that merely *sells* hardware stays `hardware` even if you can touch it — MOZA is an
  experience because the booth is six bookable rigs; Corsair is hardware because the
  booth is a product wall. Note gamescom's own directory makes a similar cut with its
  `Fun_More` partner type, which is a decent sanity check.
- A brand registered on an exhibitor's official profile is **not** the same as an
  announced demo. It supports `status: "expected"` with a note saying so — not
  `confirmed`, and never `playable: true`. Several Hall 10 entries (Stage Tour,
  House Flipper 2, PROJECT BLITZ) rest on exactly this and say so in their notes.
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
  "type": "platform",              // platform | publisher | hardware | indie | experience | media | merch | trade
  "hall": "8",                     // string or null (halls can be "4.1" style)
  "booth": "B010",                 // string or null; "/" joins one stand's halves, "," separates stands
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

#### `type: "trade"` — business-area cards

A booth in halls 2–4. These are only shown to a visitor who has turned on
"I have a trade badge", and they replace two of a normal card's parts, because
neither means anything for a business booth: the **Lineup** becomes an
**Offers** list, and the **queue index** becomes an **access** line.

```jsonc
{
  "id": "xbox-business",           // its own id — a brand can hold a consumer card too
  "businessOf": "xbox",            // optional: makes this the other face of that card
  "name": "Xbox — business booth",
  "type": "trade",
  "hall": "4.2",
  "booth": "A061/B060",
  "country": "United States",      // optional; shown beside the type in the overline
  "dirSlug": "microsoft",          // optional: the data/directory.json row this card IS
  "access": "appointment",         // open | appointment | mixed — see below
  "accessNote": "…",               // optional: overrides the default wording for `access`
  "offers": ["What you can actually do at this booth"],
  "games": []                      // always empty; a trade booth has no lineup
}
```

#### `businessOf` — two faces of one exhibitor

About twenty exhibitors hold a consumer booth *and* a business-hall booth:
Capcom demos in 9.1 and takes meetings in 4.2. Write them as **two cards**, the
trade one carrying `businessOf: "<consumer card id>"`. The grid then renders
the pair as **one card you can turn over** — a small square in the corner of
the hall plate, in the business area's own purple, swaps the two plates.

They stay two cards on purpose, because they are two stops: each gets its own
day in the planner, its own stand on the map, its own share token, and only the
business one is warned about when it lands on a Saturday. Folding them into one
entry would make that warning impossible to get right, since the two booths
keep different opening hours.

- **Name the trade face distinctly** — `"Capcom — business booth"`, not
  `"Capcom"`. The suffix is redundant on the card, where the purple plate
  already says it, but the planner lists both stops and two rows called
  "Capcom" would be unreadable.
- **Only pair booths belonging to the same company.** Tencent files two
  business rows; `level-infinite` pairs with the Proxima Beta / Level Infinite
  stand, while the separate Tencent Technology stand is nobody's face and stays
  a standalone card.
- **A business-only exhibitor takes no `businessOf`** — Cloudflare and NVIDIA
  have no consumer booth, so they are ordinary standalone trade cards.
- The owner card needs no edit at all; the pairing is declared entirely on the
  trade side.

- **`access` is the one editorial judgement on a trade card, so source it.**
  `open` = an open stand, staffed, walk up. `appointment` = a closed structure
  where meetings are booked in advance and there is nothing to see from the
  aisle. `mixed` = an open counter with closed meeting rooms behind it.
  The two shapes are usually obvious from two facts that are already in the
  data: how many exhibitors share the stand (`data/directory.json` — a national
  pavilion has ten to seventy on one stand) and how big it is
  (`data/hallplan/` — a 500 m² stand with a single occupant and no
  co-exhibitors is a meeting building). Use those as evidence, not as a rule:
  a small single-occupant stand in Hall 2.1 is an ordinary table booth you can
  walk up to.
- **`dirSlug` claims a directory row.** The row then disappears from the trade
  list, because the card is the better answer, and a `dir:<slug>` key already
  saved by a visitor — from the map, or from a share link — is migrated onto
  the card's id on their next load. Use it when the card *is* that one
  exhibitor. A pavilion card describes a **stand**, not a row, so it takes no
  `dirSlug` and its members stay listed individually.
- Don't give a trade card `crowd`, `crowdNote` or a game list. Queue priority
  and the 18+ wristband exclude `type: "trade"` outright — business booths run
  on appointments, not queues, and inventing a number for one would put a
  fiction in the list that most needs to be trusted.
- **What earns a trade card is recognition, not size.** Stand area is a good
  guide to whether a booth is open or closed and a terrible guide to whether
  anyone is looking for it: Unity exhibits on 12 m², Reddit on 16, Cloudflare
  on 63, while the largest stands in the halls are closed compounds nobody can
  walk into. Pick the names a trade visitor would search for and be annoyed to
  miss. Resist carding pavilions wholesale — there are 50 of them and forty
  near-identical cards would bury the twenty names worth surfacing.

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
      "business": "09:00–19:00",   // business-area hours, or the literal "closed"
      "open": "13:00",             // entertainment-area opening for the public, HH:MM
      "close": "19:00",            // entertainment-area closing, HH:MM
      "note": "..."
    }
  ],
  "onl": { "date": "Tue, Aug 25", "time": "20:00 CEST", "note": "..." },
  "tickets": "summary incl. sold-out status",
  "areas": [ { "name": "Indie Arena Booth", "hall": "10.2", "description": "..." } ],
  "entrances": {                   // optional; the Info tab drops the section without it
    "lede": "paragraph above the list",
    "trade": "paragraph below it, rendered under an 'On a trade badge' lead-in",
    "list": [ { "name": "West", "nameDe": "Eingang West", "description": "..." } ]
  },
  "crowdTips": ["...", "..."],
  "sources": ["https://..."]
}
```

`open`/`close` drive the planner and are the **public** hours; a trade badge gets
into the entertainment halls at 09:00 every day, which belongs in `hours` and the
day `note` rather than in these two fields.

### `data/meta.json`

```jsonc
{ "lastUpdated": "2026-08-06", "revision": 1, "note": "shown in the footer" }
```

### `data/directory.json` — generated, do not hand-edit

The raw official exhibitor list behind the site's **Full directory** section.
Rewritten wholesale by `tools/fetch-directory.py`; hand edits are lost on the next
refresh, and anything worth keeping belongs in `exhibitors.json` as a card instead.

```jsonc
{
  "lastUpdated": "2026-08-15",
  "count": 1658,
  "source": "https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/",
  "profileBase": "https://exhibitors.gamescom.global/en/exhibitor/",  // + slug + "/"
  "groups": { "204": "Development", "601": "Service firms, contractors" },  // id → label
  "exhibitors": [
    { "name": "1000 Orks UG", "country": "Germany", "slug": "1000_orks_ug",
      "stands": [ { "hall": "10.2", "booth": "F010/E019" } ],
      "cats": ["201", "204"] }                       // ids into `groups`; omitted when empty
  ]
}
```

`slug` is **not decorative** — it is a saveable identity. A business-hall row is
saved, planned and shared as `dir:<slug>`, so a slug that changes upstream
orphans somebody's saved booth the same way a renamed game `title` does. The
slugs are Koelnmesse's own and some of them look wrong: `&why GmbH` is filed as
`-whyassociacao_de_produt` and `Artifika Games` as
`muhammed_serkan_yildwestdeutscher_rundfu` — two truncated contact fields run
together. Those are correct and resolve to the right profile; don't "fix" them.

`groups` is the official product-group taxonomy, harvested by sweeping the
listing endpoint once per group. Ids arrive in near-duplicate pairs per label
(`600` and `601` are both *Service firms, contractors*) of which typically only
one is populated, and the parent nodes nobody files under (`100` Hardware,
`200` Software) come back empty and are dropped — 18 of the 22 advertised
labels survive.

Booth strings are normalised to the guide's own `A010/B011` form on the way in, so
the UI can match a directory stand against a card's `hall` + `booth` and label it
"at Indie Arena Booth". That match is booth-based and needs no maintenance — but it
is also why `booth` values in `exhibitors.json` should stay in that form.

An exhibitor holding several stands is filed here as **one row carrying every code**
(`C011/B010/B020` for Ubisoft), so a card answers both to its whole set of codes and
to each of its stands on its own. That also makes this file a second, independent
check on a card's `booth`: the hall plan and the directory are separate feeds, and
where they agree on an exhibitor's stands the number is about as sourced as it gets.

It is written minified (~215 KB, ~48 KB over the wire) and is **not** in the service
worker's precache list: it is fetched the first time a visitor opens the Full directory
or turns on trade mode, and cached from then on by the generic `/data/` rule. Nobody
pays for it who never opens it — which is why the trade setting is off by default, and
why precaching it for the consumer majority would be the wrong trade.

One consequence worth keeping: because trade booths live in this file rather than in
`exhibitors.json`, a visitor who has saved one needs it loaded before their plan can
show that stop. The guide therefore fetches it at boot whenever a saved key starts with
`dir:` — regardless of the trade setting — and says so in the plan's empty state when it
hasn't arrived yet. Never make that fetch conditional on the pref.

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

One list does need editing by hand: a **new hall level** adds a file under
`data/hallplan/`, and files are only precached if they are named in `DATA`
(`sw.js`). A hall missing from that list still works online and still
renders — it just won't be there in a hall with no signal, which is the one
place it matters.

A caveat worth knowing when a change looks like it did not deploy: a visitor who
already has the guide open is one load behind by design — the cached copy is served
first and replaced in the background. So a CSS or JS change can take a couple of loads
to appear on a device that has been there before. It is not stuck; closing the app and
reopening it, or accepting the "newer version is ready" prompt,
takes it immediately. What is *not* normal is never seeing it at all — that was a real
bug in the caching, fixed in the same commit as this note.

Icons and manifest screenshots are generated, not hand-drawn, and only go stale if
the design changes:

```sh
pip install pillow fonttools brotli && python3 tools/make-icons.py
# screenshots (optional; needs playwright and the site served locally)
node tools/make-screenshots.mjs
```

## Refreshing the hall plans

`data/hallplan/*.json` holds the booth outlines the Hall map draws — one
file per hall level, snapshotted from Koelnmesse's own hall-plan data:

```sh
node tools/fetch-hallplan.mjs      # no dependencies; ~10s
```

**This is not part of a normal data refresh.** Booth *geometry* only changes
when Koelnmesse revises the floor layout, which is rare and unrelated to the
editorial updates above. Re-run it when:

- a hall is re-laid-out (stands appear in the wrong place, or a booth you
  know exists has no stand);
- the guide starts covering a hall the snapshot doesn't have — add it to
  `HALLS` in the tool first (`"3.1": ["3", "1", "business"]`, i.e. official
  hall, level and which area it belongs to), and it appears in the map's
  hall row automatically. A new hall needs one look at the rendered result:
  the mirror/rotation signs are a per-hall fact, and hall 2.1 already
  needed a `SIGN_FIX` entry to come out the right way up;
- the map's credit date is old enough to be embarrassing.

The run also checks the two area colours — the fills the official plan
gives the entertainment and business halls, which the map re-uses so the
two agree at a glance — and prints:

```
colours: entertainment, business still match the official plan
```

If it *throws* there instead, Koelnmesse repainted an area: put the new
value in `AREAS` in the tool and re-run. Nothing is written until that
passes, so the committed snapshot is never half-updated. The line under
the hall row telling trade visitors the business halls need a badge is
`AREAS.business.access` in the same table — it is ours, not theirs, and
editing it is an editorial decision like any other.

Booth *numbers* are editorial and live in `data/exhibitors.json` as always.
The map joins the two at load time by hall + booth code, so a booth
correction moves the highlight on the next load with no re-run — never edit
`data/hallplan/` by hand to fix a booth number.

The tool ends with a join report:

```
join: 42/42 guide exhibitors matched to a stand
```

Any exhibitor it names has a `hall` + `booth` in the guide with no matching
stand in the official data. Usually one of:

- a booth number that has since changed → verify at the source and fix
  `data/exhibitors.json`;
- a collective or co-exhibitor filed under the organiser's name → nothing to
  fix, the stand is real, the guide's booth code just isn't the filed one;
- a hall whose snapshot predates the exhibitor moving in → re-run the tool.

The reverse case is useful editorially: the official data often names a stand
before the guide has the booth. `sega-atlus` sat at `"booth": null` while
SEGA Europe was already filed at concrete hall-7 stands. That is a booth
confirmation waiting to be sourced — treat it as a lead, not as truth, and
follow the sourcing rules above before writing it in.

If the endpoint ever changes shape the tool fails loudly and writes nothing,
leaving the committed snapshot in place; the map keeps working. Nothing at
runtime talks to Koelnmesse — visitors only ever fetch our own files.

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
