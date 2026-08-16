# Live queue times — crowd-sourced wait reports

**Status: research/plan only. Nothing here is implemented, and the open
questions at the end are genuinely open — this document is the groundwork for
that conversation, not a settled spec.**

## Context

The guide already talks about queues everywhere — it just does it in the past
tense. Every entertainment exhibitor carries a static `crowd` forecast (1–5),
rendered as the queue meter on cards, ranked in the planner's queue-priority
list, echoed in plan rows, route stops and calendar exports. What it cannot say
is what the queue at Xbox is *right now*, and on the show floor that is the
question. The official Wartezeit boards answer it per booth, but only when you
are standing in front of one.

The ask: let a visitor standing at a booth report the current wait with a
couple of taps, aggregate those reports server-side, discard garbage, and show
every other visitor a live queue status alongside the forecast.

This is the first feature that cannot be static. Everything the guide does
today ships as files; a live report has to land somewhere all visitors can
read within a minute or two. So the plan splits into two halves of different
character: a small backend (new territory for this repo) and a client surface
(routine, follows existing patterns).

Two constraints shape everything below:

1. **The halls eat mobile reception.** The whole PWA exists because Koelnmesse
   kills phones. A live feature degrades by nature when offline — the plan's
   job is to make it degrade honestly (age labels, "live unavailable") rather
   than silently show stale numbers as current.
2. **The clock.** The show runs Aug 26–30; today is Aug 16. The feature is
   worthless on Aug 31. Whatever ships must be buildable in days and only has
   to survive five of them — which argues for the simplest architecture that
   is honest and abuse-resistant, not the most elegant one.

## 1. Where the backend lives

The site deploys as an **assets-only Cloudflare Worker** — `wrangler.toml` has
no `main` script, just `[assets]`. Cloudflare's supported path for exactly this
situation is to add a script to the same Worker and route selected paths to it:

```toml
main = "worker/index.js"

[assets]
directory = "./dist"
html_handling = "none"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]
```

`run_worker_first` matters and is not optional decoration. With
`not_found_handling = "single-page-application"`, an unmatched path is
answered with `index.html` — without the explicit route list, whether an
`/api/` request reaches the script depends on the browser's `Sec-Fetch-Mode`
header. The array opts out of that inference: `/api/*` always runs the script,
everything else keeps today's behaviour byte for byte. (Needs wrangler ≥
4.20.0.)

Same Worker means **same origin on every hostname** — hallgui.de, the three
draining legacy domains, workers.dev — so no CORS, no per-environment API URL
in the client, and the `_headers` file needs nothing (there is no CSP to
extend; response headers for `/api/*` are set by the script itself).
`worker/` sits outside `dist/`, so `tools/build-site.sh` needs no change —
wrangler picks `main` up from the repo root.

A separate Worker on an api. subdomain was considered and rejected: it buys
independent deploys at the cost of CORS preflights on every report, a second
runbook, and a hardcoded origin in a client that currently has none.

## 2. Storage

Four Cloudflare options, one honest fit:

- **KV** — last-write-wins and eventually consistent; concurrent appends from
  two phones at the same booth eat each other. Fine for a computed snapshot,
  wrong for the raw reports.
- **Durable Objects** — a single DO serializing all queue state is the elegant
  answer and would be the pick for a year-round service. It is also a second
  new platform concept in a repo that currently has zero, and mid-show
  debugging means talking to an opaque object rather than running a query.
- **Workers Analytics Engine** — built for exactly this write pattern, but
  reads are sampled; a booth with 4 reports can answer with 2 of them.
- **D1** — one SQLite table of raw reports, aggregation is a SQL query, and
  mid-show a misbehaving client or a garbage flood can be inspected and
  cleaned with `wrangler d1 execute` from a laptop. Free tier (5M reads,
  100k writes/day) is an order of magnitude above any plausible load once
  reads are edge-cached (§4).

**D1**, on debuggability during the five days that matter. One table:

```sql
CREATE TABLE reports (
  exhibitor  TEXT    NOT NULL,   -- ex.id, validated against exhibitors.json
  game       TEXT,               -- gameKey(title), NULL = booth-level (open Q1)
  wait       INTEGER NOT NULL,   -- minutes bucket, or -1 = queue closed
  client     TEXT    NOT NULL,   -- anonymous per-device id (see §6)
  reported_at INTEGER NOT NULL   -- unixepoch(), server clock only
);
CREATE INDEX idx_reports_time ON reports (reported_at);
CREATE INDEX idx_reports_booth ON reports (exhibitor, reported_at);
```

The nullable `game` column is there from day one even though the MVP UI is
booth-level (open question 1) — adding it later is a migration on live
show-week data; carrying it unused costs nothing.

Rows older than ~24h are pruned by a Cron Trigger (`0 3 * * *`); the working
set is only ever the last hour, so the table stays tiny either way.

## 3. API

Two endpoints, both under `/api/queue/`.

**`POST /api/queue/report`** — body `{ "exhibitor": "xbox", "wait": 30 }`
plus the client id header. Validation, in order, each rejecting with a 4xx:

1. `exhibitor` must be a real id with a queue to report — present in
   `data/exhibitors.json` and not a `trade` exhibitor (business booths run on
   appointments; the app already excludes them from every queue surface). The
   worker reads the deployed `exhibitors.json` through its own `ASSETS`
   binding and caches the id set in the isolate — no build step, and the
   allowlist can never drift from the data actually being served.
2. `wait` must be one of the fixed buckets (§5) or the closed sentinel. Free
   minutes are not accepted from the wire even if the UI someday offers them —
   the bucket list is the first and cheapest garbage filter.
3. Show-hours gate: server time must be within `event.days` open–close (±30
   min grace), else 403 "the show is closed". Kills the entire category of
   bored-at-home garbage, and `event.json` rides the same ASSETS binding.
4. Rate limits (§6).

Accepted reports get `reported_at` stamped from the **server** clock; the
client's opinion of the time is never trusted (a phone that just left airplane
mode after two hours in Hall 7 will happily claim any time).

**`GET /api/queue/live`** — the whole show in one blob:

```json
{ "at": 1756202400,
  "booths": { "xbox":   { "wait": 45, "n": 6, "newest": 1756202100 },
              "nintendo": { "closed": true, "n": 3, "newest": 1756201800 } } }
```

One request answers every card, the map, and the planner — there is no
per-booth endpoint to fan out. The handler computes aggregates for all booths
in one query and the response is cached (§4), so cost does not scale with the
number of booths a visitor looks at.

## 4. Aggregation and garbage

Aggregation runs at read time over a **rolling 60-minute window**:

- **One voice per device per booth**: only each client's *newest* report in
  the window counts. Updating your estimate replaces it rather than stacking
  it, and one keyboard cannot outvote a queue by tapping ten times.
- **Median** of the counted reports, snapped back to the nearest bucket.
  Median is the outlier filter: with bucketed inputs bounding the range and
  dedup bounding repetition, a lone troll report at 120 against four honest
  30s simply does not move the answer. Explicit IQR/MAD trimming was
  considered and adds nothing a median over buckets doesn't already do — noted
  here so it isn't re-invented later.
- **Closed** wins when reported by ≥2 devices more recently than the median
  wait report — "they shut the queue" is news that outranks a number.
- **No minimum count, but the count always shows.** The guide's house pattern
  is provenance over suppression (source markers, "unconfirmed" flags). A
  single report renders as "~30 min · 1 report · 5 min ago" and the reader
  weighs it — data will be thin at a fan guide's scale, and hiding n<3 could
  mean hiding the feature.
- Staleness is display-side: the client renders age from `newest` and fades
  to "no recent reports" past the window. Nothing pretends 9 a.m. data is
  current at noon.

**Read cost**: the GET response is held in the edge cache
(`caches.default`) for **60 seconds**, plus `Cache-Control: max-age=30` for
the browser. D1 is touched roughly once a minute per colo — effectively once
a minute total, since the entire audience stands in one city — regardless of
how many phones poll. Worker *invocations* still count per request: at an
optimistic 30k show-day users polling every 2 minutes while visible, that is
a few hundred thousand requests/day against the free tier's 100k/day cap.
**Either enable Workers Paid ($5/mo, 10M included) for show week, or accept
the free cap and poll only on demand** — cost question is open question 5.

## 5. Client surface

**Reporting.** The report control lives where the visitor already is: on the
exhibitor card (and later the map popover), a small button near the queue
meter — "Queue right now?". It opens a chip row, one tap reports:

```
No queue · ~15 · ~30 · ~45 · ~1 h · ~1½ h · 2 h+ · Queue closed
```

Buckets, not a number field: nobody times a queue to the minute, chips are
one-handed in a crowd, and the vocabulary doubles as input validation.
"Queue closed" is a real gamescom mechanic (capped queues close for the day)
and is arguably the single most valuable report — it saves someone a walk
across two halls. After reporting: a toast confirms, the button shows "you
reported ~30 min" and re-arms after the 5-minute per-booth throttle.

The control renders only when online, only during show days/hours (from
`event.json`, which the client already has), and never for business booths.
Before Aug 26 the whole feature is invisible — no dead UI to explain.
Reports made offline are **dropped, not queued**: a Background-Sync'd report
delivered 40 minutes later is precisely the garbage the server exists to
discard, so it is not collected. (Rejected alternative, recorded.)

**Displaying.** A live chip beside the existing forecast, visually distinct
from it (the meter is a *prediction*, the chip is a *measurement* — the two
must not blur):

- cards: `Live: ~45 min · 6 reports · 4 min ago`
- queue-priority table and plan rows: a compact live figure next to the
  forecast where one exists
- map popovers: same chip (phase 2 — `map.js` is a separate page and script;
  the MVP can ship without it)

**Fetching.** `GET /api/queue/live` on boot (after core data — it must never
gate first render), then every ~2 minutes while the tab is visible
(`visibilitychange` + interval), plus on regaining focus. No polling when
hidden, no polling outside show hours. The existing `?v=Date.now()`
cache-bust pattern is *not* used here — the endpoint's own `max-age=30` is
the freshness contract, and busting it would defeat the edge cache that makes
the feature cheap.

**Offline.** No live data, no lie: the chip shows "live queue needs a
connection" or the age of the last in-memory fetch if it is still inside the
window. The SW never serves API responses (§7), so there is no stale-cache
path to guard.

**i18n**: every string above lands in `js/i18n/en.js` *and* `de.js`
(`tools/check-i18n.mjs` enforces parity).

## 6. Abuse, identity, privacy

No accounts — the guide has none and show week is not the moment to add them.
The defense is layered cheapness:

- **Anonymous client id**: a random UUID minted into localStorage on first
  report, sent with each one. It is the dedup and throttle key: 1 report per
  booth per 5 min, ~30/day per client. Trivially resettable, which is fine —
  it is a speed bump, not an identity.
- **Per-IP limits exist but must be loose** (~20/min): the entire audience
  sits behind Koelnmesse wifi NAT and a handful of carrier CGNAT exits, so a
  tight IP limit would throttle the honest crowd, not the troll. The client
  id does the fine-grained work; the IP limit only catches raw scripted
  floods.
- **Everything in §3–4**: bucket vocabulary, show-hours gate, id allowlist,
  server timestamps, median + dedup.
- **Escalation path, not default**: if show week brings a real flood,
  Turnstile on the report endpoint is the next dial — deliberately *not* in
  the MVP, because it would be the site's first third-party script and its
  first external runtime dependency, traded away for abuse that may never
  come. A D1 table also makes the manual fallback real: identify the client
  id, delete its rows, add it to a deny list.

**Privacy page** (`privacy.html`, both languages): this is the site's first
feature where a visitor action leaves the browser, and the page currently
promises the opposite ("what stays in your browser"). It needs an honest new
section: what a report contains (booth, bucket, random id, server time —
no name, no account, no location), that the IP is used transiently for rate
limiting and not stored with reports, retention (pruned within 24h; the whole
database is deleted after the show), and that reporting is entirely optional.
GDPR framing: legitimate interest, anonymous-by-design data.

## 7. Service worker and deploy mechanics

Two things will bite if not done deliberately:

1. **`sw.js` must bypass `/api/`.** The fetch handler's final fallthrough is
   stale-while-revalidate for *any* same-origin GET it doesn't otherwise
   route — a live-queue GET would be served from cache first and refreshed
   behind the reader's back, showing hour-old queues as current. One early
   return (`url.pathname.includes("/api/")` → let the network handle it)
   before the strategy dispatch. POSTs already pass through (`method !==
   "GET"` returns first).
2. **Cache `VERSION` bump.** The report UI spans `index.html`
   (network-first) and `js/app.js` + `sw.js` (stale-while-revalidate) — the
   known first-load-after-deploy mismatch. Same reasoning as rev 21's share
   dialog: bump, let the update toast land a coherent shell. And the SW
   change here is load-bearing (point 1), which is exactly the "must be
   believed rather than eventually refreshed" rule the VERSION comment sets.

Deploy order: D1 database created and migrated first, `wrangler.toml` gains
`main` + `run_worker_first` + `[[d1_databases]]` + `[triggers]`, then one
normal deploy carries site and API together. Rollback is equally one motion:
removing `main` returns the Worker to assets-only. `workers.dev` stays true,
which gives a staging URL where the full loop can be tested against the real
D1 before the domains see it.

## 8. Phasing

**MVP (must ship before Aug 26):** worker + D1 + both endpoints, aggregation,
rate limits, report chips + live chip on cards, queue-priority integration,
SW bypass, i18n, privacy page, changelog/meta bump.

**Phase 2 (shippable mid-show — the PWA updates itself):** map popover
integration, per-game reporting if wanted (schema is ready), tuning knobs
(window, weights) informed by real day-1 data, deny list if needed.

**After the show:** the endpoints return 410, the worker (or just the
feature flag in `event.json` terms — show days are over) goes quiet, D1 is
deleted per the privacy promise.

## Open questions (deliberately unresolved)

1. **Granularity: booth or game?** A booth-level number is nearly meaningless
   at Xbox (12+ playable titles, each its own line). Per-game reporting is
   more honest and splits already-thin data thinner. Schema supports both;
   the UI choice is the real decision.
2. **Bucket vocabulary** — the eight chips in §5 are a proposal. Fewer chips
   = more taps land, coarser data.
3. **Seeding the display**: should the live chip fall back to showing the
   static forecast when there are no reports, or is blank more honest?
4. **Polling cadence vs cost** (§4): 2-minute polling with Workers Paid for
   show week, or fetch-on-demand (boot + manual refresh) inside the free tier?
5. **Prompting**: nudge people to report ("been here a while? report the
   queue") or keep it strictly pull? Nudges raise volume and annoyance
   together.
6. **Trust display**: is "n reports · age" enough signal, or is a
   confidence tint (solid at n≥3, hollow below) worth the pixels?

## Files (when implemented)

| file | change |
|---|---|
| `worker/index.js` | new — routing, validation, rate limits, aggregation, cron prune |
| `worker/schema.sql` | new — D1 migration |
| `wrangler.toml` | `main`, `run_worker_first`, D1 binding, cron trigger |
| `js/app.js` | report control, live chip, polling, state |
| `index.html` | report chips markup, live chip slots |
| `css/style.css` | chips, live chip, reported state |
| `js/i18n/en.js`, `de.js` | all new UI strings |
| `sw.js` | `/api/` bypass + `VERSION` bump |
| `privacy.html` (en/de) | new section: queue reports |
| `README.md` | feature paragraph |
| `data/changelog.json`, `data/meta.json` | revision entry |
| `docs/DEPLOYING.md` | D1 setup, staging-first API deploy, teardown |
| `js/map.js`, `map.html` | phase 2 — popover chip |

## Verification (sketch, to be expanded at implementation)

Local: `wrangler dev` serves assets + worker + local D1 together — the full
loop (report → D1 row → aggregate → chip) runs on one laptop, including the
SW bypass. Then on workers.dev against real D1: two devices report and read
each other within the cache window; a third device's throttled repeat is
rejected; a report for a trade id and an out-of-hours report both 4xx; median
survives one planted garbage report; offline shows the honest fallback and
the report control disappears; free-tier request math is checked against real
polling traffic for an hour.
