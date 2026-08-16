# Live queue times — crowd-sourced wait reports

**Status: research/plan only, revision 2 — reworked around session-based
reporting after design discussion. Nothing here is implemented; the open
questions at the end are genuinely open.**

## Context

The guide already talks about queues everywhere — it just does it in the past
tense. Every entertainment exhibitor carries a static `crowd` forecast (1–5),
rendered as the queue meter on cards, ranked in the planner's queue-priority
list, echoed in plan rows, route stops and calendar exports. What it cannot
say is what the queue for *Call of Duty* is right now, and on the show floor
that is the question. The official Wartezeit boards answer it per booth, but
only when you are standing in front of one.

The ask: let a visitor standing in a queue report it with a couple of taps,
aggregate those reports server-side, discard garbage, and show every other
visitor a live status alongside the forecast.

This is the first feature that cannot be static. Everything the guide does
today ships as files; a live report has to land somewhere all visitors can
read within a minute or two. So the plan splits into a small backend (new
territory for this repo) and a client surface (routine, follows existing
patterns).

Three design decisions were settled in discussion and shape revision 2:

- **One tracker per individual queue, not per booth.** A single number for
  Xbox — twelve playable titles, each its own line — is meaningless.
- **Reports are facts, not estimates.** Revision 1 asked "how long is the
  queue?", which nobody actually knows — it invited guesses. What a person in
  a queue *does* know: how long they have been standing in it, and roughly
  how many people are ahead. Facts aggregate honestly; and successive facts
  from the same person turn into measurements nobody reported directly — the
  queue's actual speed.
- **Queue mechanics are data, but optional data.** Queues move one-by-one,
  in pairs (co-op stations), in squads of 5–10 (team games), or in
  presentation waves that swallow 50 people at once. Knowing which changes
  both the estimate and the reader's expectations — but someone twenty
  minutes into a wave queue may not yet know it *is* one. So mechanics are a
  detail you can add when you know it, never a gate in front of "I've been
  waiting this long".

Two constraints shape everything below:

1. **The halls eat mobile reception.** The whole PWA exists because
   Koelnmesse kills phones. A live feature degrades by nature when offline —
   the plan's job is to make it degrade honestly (age labels, "live
   unavailable") rather than silently show stale numbers as current.
2. **The clock.** The show runs Aug 26–30; today is Aug 16. Whatever ships
   must be buildable in days and only has to survive five of them. The
   architecture below is tiered so the estimator can start simple and grow
   mid-show — the PWA's update path makes that a real option, not a wish.

## 1. Where the backend lives

The site deploys as an **assets-only Cloudflare Worker** — `wrangler.toml`
has no `main` script, just `[assets]`. Cloudflare's supported path for
exactly this situation is to add a script to the same Worker and route
selected paths to it:

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
header. The array opts out of that inference: `/api/*` always runs the
script, everything else keeps today's behaviour byte for byte. (Needs
wrangler ≥ 4.20.0.)

Same Worker means **same origin on every hostname** — hallgui.de, the three
draining legacy domains, workers.dev — so no CORS, no per-environment API
URL in the client, and `_headers` needs nothing (there is no CSP to extend;
`/api/*` response headers are set by the script). `worker/` sits outside
`dist/`, so `tools/build-site.sh` needs no change — wrangler picks `main` up
from the repo root.

A separate Worker on an api. subdomain was considered and rejected: it buys
independent deploys at the cost of CORS preflights on every report, a second
runbook, and a hardcoded origin in a client that currently has none.

## 2. The session model

The unit of reporting is a **queue session**: one person, in one queue, over
the time they stand in it. A session is opened by the first report, fed by
updates, and closed by an outcome. That gives the server:

- **completed waits** — "joined at 11:02 (server clock), entered at 11:49" is
  a 47-minute ground-truth sample, and the reporter never estimated anything;
  the client's own timer did the remembering.
- **queue speed** — the same person reporting "~100 ahead" and, twenty
  minutes later, "~50 ahead" has measured ≈2.5 people/min. Nobody can report
  throughput directly; paired counts yield it for free.
- **dedup by construction** — one person is one session, however many
  updates they send. The revision-1 "newest report per client wins" rule
  falls out naturally instead of being bolted on.

Sessions live server-side keyed by `(client, queue)` — the open session for
that pair, no session id on the wire. A `joined` report replaces any open
session (you re-queued), an outcome closes it, and a session with no update
for 4 hours expires as `abandoned` (forgotten phones must not become
99-minute "waits").

Late starters are first-class: someone who discovers the tracker twenty
minutes into the line opens their session with a claimed elapsed bucket
("waiting ~20 min already"), which back-dates the join anchor. The claim is
coarser than a timer but it is still a fact about themselves, not a guess
about the queue.

### Storage

Four Cloudflare options, one honest fit. **KV** is last-write-wins and
eventually consistent — concurrent updates from two phones at the same booth
eat each other. **Durable Objects** serializing per-queue state is the
elegant year-round answer, but it is a second new platform concept in a repo
that currently has zero, and mid-show debugging means talking to an opaque
object. **Analytics Engine** samples reads; a queue with 4 sessions can
answer with 2 of them. **D1** makes the sessions table a table: aggregation
is SQL, ad-hoc questions are queries, and the moderation surface (§6) is a
handful of SELECTs and DELETEs rather than bespoke storage traversal. D1 it
is, on debuggability during the five days that matter — with the proviso
that the debugging interface has to fit in a pocket, which §6 takes
seriously.

```sql
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  exhibitor   TEXT    NOT NULL,  -- ex.id, validated against exhibitors.json
  game        TEXT,              -- gameKey(title); NULL = booth-level queue
  client      TEXT    NOT NULL,  -- anonymous per-device id (§6)
  joined_at   INTEGER NOT NULL,  -- server clock, possibly back-dated by claim
  claimed     INTEGER NOT NULL DEFAULT 0,  -- minutes of back-dating (audit)
  outcome     TEXT,              -- NULL=open | entered | left | closed | abandoned
  closed_at   INTEGER
);
CREATE TABLE updates (
  session     INTEGER NOT NULL REFERENCES sessions(id),
  ahead       INTEGER,           -- people-ahead bucket value, NULL = "still here" ping
  reported_at INTEGER NOT NULL   -- server clock only
);
CREATE TABLE queue_meta (        -- mechanics: slow-changing, separately aggregated
  exhibitor   TEXT    NOT NULL,
  game        TEXT,
  client      TEXT    NOT NULL,
  qtype       TEXT    NOT NULL,  -- single | pairs | group | wave
  batch       INTEGER,           -- rough batch/wave size bucket, NULL = unknown
  reported_at INTEGER NOT NULL
);
-- moderation (§6): denylist checked on every write; admin actions logged
CREATE TABLE denylist  (client TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
CREATE TABLE admin_log (action TEXT NOT NULL, detail TEXT, at INTEGER NOT NULL);
```

Every timestamp is stamped from the **server** clock; the client's opinion of
the time is never trusted (a phone that just left airplane mode after two
hours in Hall 7 will happily claim any time). Rows older than ~24h are
pruned by a Cron Trigger; `queue_meta` alone survives the whole show, because
a booth's mechanics on Wednesday still hold on Sunday.

### Which queues exist

One tracker per **playable game** (104 at revision 26), plus one
**booth-level tracker** per entertainment exhibitor — that covers the 45
exhibitors with no playable lineup (the PlayStation experience, merch halls,
signing lines) and doubles as "the entry queue to the booth itself", which
big booths have in front of their per-station lines. Business (`trade`)
exhibitors get none: appointments, not queues, and the app already excludes
them from every queue surface. The worker validates ids against the deployed
`data/exhibitors.json` through its own `ASSETS` binding — no build step, and
the allowlist can never drift from the data actually being served.

## 3. API

**`POST /api/queue/report`** — one endpoint, a `kind` field, client id
header on everything. Validation on every kind: known queue (§2), show-hours
gate (server time inside `event.days` open–close ±30 min, from the same
ASSETS binding — kills the entire category of bored-at-home garbage), rate
limits (§6). Kinds:

| kind | payload | effect |
|---|---|---|
| `joined` | optional `claimed` bucket, optional `ahead` bucket | opens (or replaces) the session, anchor = now − claimed |
| `update` | optional `ahead` bucket | "still in line", feeds elapsed + throughput |
| `entered` | — | closes session → completed wait sample |
| `left` | — | closes session, excluded from wait stats |
| `closed` | — | "they shut the queue" — attaches to the queue, not the session |
| `meta` | `qtype`, optional `batch` bucket | upserts this client's row in `queue_meta` |

All numeric inputs are **chip vocabularies, not free numbers** — elapsed
claims reuse the wait buckets (§5), people-ahead comes as ~10 / ~20 / ~30 /
~50 / ~75 / ~100 / ~150 / 200+. Nobody counts a switchback to the person,
buckets are one-handed in a crowd, and the fixed vocabulary is the first and
cheapest garbage filter: the wire rejects everything else.

**`GET /api/queue/live`** — the whole show in one blob, no per-queue fan-out:

```json
{ "at": 1756202400,
  "queues": {
    "xbox": {
      "_booth":              { "est": 10, "how": "flow", "n": 4, "newest": 1756202220 },
      "call-of-duty-modern-warfare-4":
                             { "est": 90, "how": "done", "n": 6, "newest": 1756202100,
                               "qtype": "group", "batch": 10 },
      "fable":               { "closed": true, "n": 3, "newest": 1756201800 } } } }
```

`how` is the estimator tier that produced the number (§4) — the client
renders each differently, because they mean different things.

**Read cost**: the response is held in the edge cache (`caches.default`) for
**60 seconds** plus `Cache-Control: max-age=30` for the browser. D1 is
touched about once a minute total — the entire audience stands in one city,
one colo — regardless of how many phones poll. The account is on Workers
Paid, so request volume from 2-minute polling is a non-issue (§5).

## 4. Estimation

Read-time, per queue, over rolling windows. The tiers degrade gracefully —
each exists because show-floor data will be thin, and a thin-data answer that
is honest about *what kind* of answer it is beats a confident blend:

- **Tier "flow"** — the live one. Queue length now = median `ahead` from
  recently-opened sessions (last ~15 min); speed = within-session pairs of
  `ahead` reports, `(a₁−a₂)/(t₂−t₁)`, pooled median over ~45 min. Estimate =
  length / speed. This is the only tier that measures the queue *as it is
  now* — and wave queues average out correctly here, because a 50-person
  lurch every 15 minutes is still ≈3.3 people/min across pairs spanning a
  wave or two.
- **Tier "done"** — median of completed waits from sessions that `entered`
  in the last hour. Ground truth, but lagged: a 50-minute sample describes
  the queue as it stood 50 minutes ago. Rendered as what it is: "people just
  getting in waited ~50 min".
- **Tier "sofar"** — open sessions only: the upper quartile of current
  elapsed times. Not an estimate at all, a bound: "people in line have been
  waiting 30+ min". First minutes of the show, this is often all there is,
  and it is already worth showing.
- **`closed`** overrides the number when ≥2 devices report it more recently
  than the median counter-evidence — "they shut the queue" outranks any wait,
  and at gamescom (capped queues, full-for-the-day boards) it is arguably the
  single most valuable report in the system.
- **Mechanics ride alongside, not inside**: `qtype`/`batch` come from
  `queue_meta` by majority vote across the whole show and render as a label —
  "moves in waves of ~50". For wave/group queues the honest display is a
  range (miss the wave, wait a full cycle), which needs observed cycle time;
  that refinement is explicitly **phase 2**, informed by real day-1 data. The
  MVP shows the flow-tier average, which is correct *on average* even for
  waves.

Garbage handling beyond the bucket vocabulary: pairs with rising `ahead` are
excluded from speed (a correction, not movement — people ahead of you cannot
multiply); pairs spanning < 3 min are ignored (bucket noise dominates);
speeds above a sanity cap (~100 people/min) are dropped; `left` sessions
never enter wait stats; expiry keeps forgotten phones out of "sofar". With
bucketed inputs bounding the range, per-session dedup bounding repetition,
and medians throughout, a lone troll cannot move any tier — explicit IQR/MAD
trimming was considered and adds nothing a median over buckets doesn't
already do (noted so it isn't re-invented later).

**No minimum count, but the count always shows.** The guide's house pattern
is provenance over suppression (source markers, "unconfirmed" flags). A
single session renders as "~30 min · 1 report · 5 min ago" and the reader
weighs it — at a fan guide's scale, hiding n<3 could mean hiding the feature.
Staleness is display-side: the client renders age from `newest` and fades to
"no recent reports" past the window. Nothing pretends 9 a.m. data is current
at noon.

## 5. Client surface

**Starting a session.** The control lives where the visitor already is: on
the exhibitor card, per game row (and the booth-level line in the card foot),
later the map popover. Tap "I'm in this queue" →

```
Just joined · waiting ~10 · ~20 · ~30 · ~45 · ~1 h · ~1½ h · 2 h+
```

one tap opens the session (the non-first chips are the late-starter claim),
then an optional second row — "roughly how many ahead of you?" — and, tucked
behind a "queue details" disclosure for those who know: mechanics chips
(one-by-one / pairs / groups / waves) and batch size. The disclosure ordering
*is* the settled design decision: elapsed first, mechanics only ever
optional, because you can be twenty minutes into a wave queue before
learning it moves in waves.

**Living with a session.** The client keeps the active session in
localStorage (`gc2026.queue.v1`): queue, joined-at, last-ahead. While it is
open, the card control becomes a live timer with three buttons — **Still
waiting** (optionally re-asking the ahead bucket), **I'm in!**, **I left** —
and, the load-bearing nudge: whenever the app is reopened or the tab
refocuses with a session past ~10 min, a quiet prompt bar surfaces it:
"Still queueing for Fable? 23 min · [Still waiting] [I'm in!] [I left]".
That reopen moment is when ground truth gets captured or lost — no
notifications, no background anything, just meeting the visitor at the
moment they already came back to their phone. One active session per queue,
multiple parallel sessions allowed (you *will* stand in a merch line while a
friend holds your spot elsewhere), each rendered on its own card.

**Reporting "queue closed"** stays a session-less one-tap on the same chip
row — you see the sign, you report it, you walk away.

**Displaying.** A live chip beside the existing forecast, visually distinct
from it (the meter is a *prediction*, the chip is a *measurement* — the two
must not blur). Tier shapes the wording: flow → "Live: ~45 min", done →
"~50 min for people just in", sofar → "30+ min so far", each with
"· n reports · age". Game rows carry their own chips; the card foot
summarises the worst of them next to the forecast meter; the queue-priority
table and plan rows get the compact figure where one exists. Map popovers
are **phase 2** (`map.js` is a separate page and script; the MVP ships
without it).

**Fetching.** `GET /api/queue/live` on boot (after core data — it must never
gate first render), then every ~2 minutes while the tab is visible
(`visibilitychange` + interval), plus on regaining focus; nothing when
hidden, nothing outside show hours. The existing `?v=Date.now()` cache-bust
pattern is deliberately *not* used here — the endpoint's `max-age=30` is the
freshness contract, and busting it would defeat the edge cache that makes
polling cheap. Workers Paid is already on the account, so 2-minute polling
is settled.

**Offline.** No live data, no lie: the chip shows "live queue needs a
connection", or the age of the last in-memory fetch while it is still inside
the window. An open session's *timer* keeps running offline — it is local —
and "I'm in!" tapped offline is worth special-casing: the elapsed time was
measured client-side, so the completion is queued and submitted with its
locally-recorded duration on reconnect, flagged `deferred` for the server to
sanity-check (the one place client timing is accepted, because the session
anchor still came from the server). All other report kinds are dropped when
offline, not queued — a 40-minute-late "~100 ahead" is precisely the garbage
the server exists to discard.

**Lifecycle.** Before Aug 26 the whole feature is invisible — show days come
from `event.json`, which the client already has; no dead UI to explain.
After the show it goes quiet the same way.

**i18n**: every string lands in `js/i18n/en.js` *and* `de.js`
(`tools/check-i18n.mjs` enforces parity).

## 6. Abuse, identity, privacy

No accounts — the guide has none and show week is not the moment to add
them. The defense is layered cheapness:

- **Anonymous client id**: a random UUID minted into localStorage on first
  report, sent with each one — the session key and throttle key. Trivially
  resettable, which is fine: it is a speed bump, not an identity.
- **Throttles shaped like queueing, not like spam**: one open session per
  (client, queue); updates ≥ 2 min apart; ~10 sessions per client per hour,
  ~40/day (nobody stands in more lines than that); `meta` once per (client,
  queue) per day.
- **Per-IP limits exist but must be loose** (~20 writes/min): the entire
  audience sits behind Koelnmesse wifi NAT and a handful of carrier CGNAT
  exits, so a tight IP limit throttles the honest crowd, not the troll. The
  client id does the fine-grained work; the IP limit only catches raw
  scripted floods.
- **Everything in §3–4**: chip vocabularies, show-hours gate, id allowlist,
  server timestamps, medians over deduped sessions.
- **Escalation path, not default**: if show week brings a real flood,
  Turnstile on the write endpoint is the next dial — deliberately *not* in
  the MVP, because it would be the site's first third-party script, traded
  away for abuse that may never come. The manual fallback — identify the
  client id, delete its rows, deny-list it — is real because the moderation
  surface below makes it a button, not a laptop.

### Moderation from a phone

The operator is at the show, phone-only — no laptop, no checkout, no SSH box
with the repo on it. Anything that assumes `wrangler` mid-show is a plan
that fails on day 1, so moderation is part of the *product*, not a runbook:

- **The worker serves its own admin page** at `/api/admin/` — a single
  phone-first HTML page rendered by the script, guarded by a bearer token
  (`wrangler secret put ADMIN_TOKEN` once at deploy time, pasted into the
  phone once, kept in that page's localStorage). Serving it from the worker
  rather than `dist/` keeps it off the public site, outside the service
  worker's caches, and means the page can never exist half-updated — it
  ships inside the same script that implements its actions.
- **What it shows**: report volume per queue and per hour; the estimator's
  current answer next to its inputs for any queue that looks wrong; top
  clients by report count; cheap anomaly lists (clients touching many queues
  at once, flip-flopping `ahead` values, `closed` reports contradicted by
  everyone else).
- **What it does, as buttons**: delete a client's rows and deny-list the id
  (a `denylist` table, checked on every write — one indexed lookup, cached
  in the isolate for a minute); purge one queue's last N minutes (one bad
  actor cleaned without losing the day); clear or force a `closed` state;
  and a global **pause writes** switch (reads keep serving) as the break-
  glass control while thinking.
- **Every admin action is logged** to an `admin_log` table — mostly so that
  day-3 Haylee can see what day-2 Haylee already tried.
- Failed token attempts are rate-limited and never distinguish "wrong token"
  from "no such route" beyond a plain 404.

Two fallbacks exist without any of this and are worth knowing about, but
neither is the plan: the Cloudflare dashboard's D1 console runs SQL from a
phone browser (clunky, no guardrails, real), and a claude.ai/code cloud
session with the repo can run `wrangler` on Haylee's behalf from a phone.
Good escape hatches; bad primary interfaces for minute two of an incident in
a crowded hall.

**Privacy page** (`privacy.html`, both languages): this is the site's first
feature where a visitor action leaves the browser, and the page currently
promises the opposite ("what stays in your browser"). It needs an honest new
section: what a session contains (queue, coarse counts, random id, server
timestamps — no name, no account, no location), that the IP is used
transiently for rate limiting and not stored with reports, retention
(sessions pruned within 24h, mechanics votes kept for the show, everything
deleted after it), and that reporting is entirely optional. Worth saying
plainly in the plan: a day of sessions from one client id *is* a sketch of
that person's day at the show — the 24-hour prune and the resettable id are
what keep that a sketch nobody retains. GDPR framing: legitimate interest,
anonymous-by-design.

## 7. Service worker and deploy mechanics

Two things will bite if not done deliberately:

1. **`sw.js` must bypass `/api/`.** The fetch handler's final fallthrough is
   stale-while-revalidate for *any* same-origin GET it doesn't otherwise
   route — a live-queue GET would be served from cache first and refreshed
   behind the reader's back, showing hour-old queues as current. One early
   return before the strategy dispatch; POSTs already pass through
   (`method !== "GET"` returns first).
2. **Cache `VERSION` bump.** The feature spans `index.html` (network-first)
   and `js/app.js` + `sw.js` (stale-while-revalidate) — the known
   first-load-after-deploy mismatch. Same reasoning as rev 21's share
   dialog; and the SW change here is load-bearing (point 1), which is
   exactly the "must be believed rather than eventually refreshed" rule the
   VERSION comment sets.

Deploy order: D1 database created and migrated first, `ADMIN_TOKEN` set via
`wrangler secret put`; `wrangler.toml` gains `main` + `run_worker_first` +
`[[d1_databases]]` + `[triggers]`; one normal deploy then carries site and
API together. Rollback is one motion — removing
`main` returns the Worker to assets-only. `workers_dev` stays true, which
gives a staging URL where the full loop runs against real D1 before the
domains see it.

## 8. Phasing

**MVP (must ship before Aug 26):** worker + D1 + both endpoints; sessions
with `joined`/`update`/`entered`/`left`/`closed`; all three estimator tiers;
mechanics capture (`meta`) and label display; report flow + live chips on
cards; queue-priority integration; the reopen prompt bar; the phone admin
surface with deny-list, purge and pause (it exists *for* show week, so it
cannot be phase 2); SW bypass; i18n; privacy page; changelog/meta bump.

**Phase 2 (shippable mid-show — the PWA updates itself):** map popover
chips; wave-aware range display from observed cycle times; estimator tuning
informed by real day-1 data; deny list if needed.

**After the show:** the endpoints return 410, the feature sleeps on its own
show-days check, D1 is deleted per the privacy promise.

## Open questions (deliberately unresolved)

1. **The ahead-bucket vocabulary** — proposed ~10/~20/~30/~50/~75/~100/
   ~150/200+. Coarser = more taps land; finer = better speed math.
2. **Booth-level tracker on every booth, or only where there's no lineup?**
   Everywhere doubles as the entry-gate queue but adds a chooser step to the
   report flow on multi-game booths.
3. **Forecast fallback**: when a queue has no live data, should the chip
   show the static 1–5 forecast in its place, or is blank more honest?
4. **Nudge aggressiveness**: reopen/refocus prompt only (planned), or also a
   gentle in-page reminder after N minutes with the tab open?
5. **Abandonment as signal**: `left` sessions are captured but unused —
   "40% of people give up on this line" is genuinely useful and slightly
   demoralising. Show it?
6. **Wave range display** (phase 2 by default) — worth pulling into MVP for
   the handful of big presentation booths if day-1 data is rich enough?

## Files (when implemented)

| file | change |
|---|---|
| `worker/index.js` | new — routing, validation, session logic, rate limits, estimator, cron prune |
| `worker/admin.js` | new — phone-first admin page + actions, token guard, audit log |
| `worker/schema.sql` | new — D1 migration |
| `wrangler.toml` | `main`, `run_worker_first`, D1 binding, cron trigger |
| `js/app.js` | report flow, session state + prompt bar, live chips, polling |
| `js/marks.js` | (or app.js) localStorage session store alongside existing keys |
| `index.html` | chip rows, disclosure, prompt bar, live chip slots |
| `css/style.css` | chips, timer state, live chip tiers, prompt bar |
| `js/i18n/en.js`, `de.js` | all new UI strings |
| `sw.js` | `/api/` bypass + `VERSION` bump |
| `privacy.html` (en/de) | new section: queue reports |
| `README.md` | feature paragraph |
| `data/changelog.json`, `data/meta.json` | revision entry |
| `docs/DEPLOYING.md` | D1 setup, staging-first API deploy, teardown |
| `js/map.js`, `map.html` | phase 2 — popover chip |

## Verification (sketch, to be expanded at implementation)

Local: `wrangler dev` serves assets + worker + local D1 together — the full
loop (join → updates → entered → estimate → chip) runs on one laptop,
including the SW bypass. A small script drives synthetic sessions against
local D1 to check the estimator: a steady queue, a wave queue, a troll
client, a rising-`ahead` correction, a forgotten session hitting expiry.
Then on workers.dev against real D1: two devices see each other's sessions
inside the cache window; throttled repeats reject; trade-id and
out-of-hours reports 4xx; "I'm in!" fired offline lands after reconnect
with its deferred duration; the reopen prompt resurfaces a 20-minute
session; offline shows the honest fallback and the report control
disappears. The admin surface is verified **on a phone, from scratch**:
paste the token, find a planted troll client in the anomaly list, deny-list
it, watch its rows vanish from the estimate within the cache window, pause
and unpause writes — the whole loop the show floor will actually demand,
on the device it will be demanded from.
