# Live queue times — crowd-sourced wait reports

**Status: MVP implemented and reviewed, revision 7 — 21 August 2026. The
Worker, D1 migration, client surfaces, offline completion flow, moderation
page, tests, privacy copy and deployment runbook are in the repository. Four
things below were changed after the first implementation rather than as first
written, and are marked where they apply: the closure quorum and the estimate
ceiling (§4), reporting moving off the exhibitor cards into its own tab (§5),
and the API becoming a Worker of its own, separate from the site (§1). Phase 2
remains deliberately deferred; real staging/production databases and on-device
checks are deployment work, not completed by this implementation.**

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
2. **The clock.** The show runs Aug 26–30; implementation started Aug 17. Whatever ships
   must be buildable in days and only has to survive five of them. The
   architecture below is tiered so the estimator can start simple and grow
   mid-show — the PWA's update path makes that a real option, not a wish.

## 1. Where the backend lives

Before this feature the site deployed as an **assets-only Cloudflare Worker** —
`wrangler.toml` had no `main` script, just `[assets]`. The API is a **second
Worker**, `gc2026-queues-api`, configured by `wrangler-api.toml`:

```toml
name = "gc2026-queues-api"
main = "worker/index.js"

[[routes]]
pattern = "hallgui.de/api/*"
zone_name = "hallgui.de"
# …and one for each other hostname the guide answers on
```

The two meet at the edge rather than inside one script. The site holds each
hostname as a **Custom Domain**; the API holds `<host>/api/*` on it as a
**route**, and a route is matched ahead of a Custom Domain for the paths it
covers. So the guide keeps **one origin on every production hostname** —
hallgui.de and the three draining legacy domains — with no CORS, no per-host
API URL, and a client that still asks for `/api/…` relative to wherever it was
loaded from. `_headers` needs nothing (there is no CSP to extend; `/api/*`
response headers are set by the script).

**This was originally one Worker, and the change is worth recording.** The
first implementation added `main` to `wrangler.toml` and used
`run_worker_first = ["/api", "/api/*"]` to route inside a single script. A
separate Worker on an `api.` subdomain had been considered and rejected: it
buys independent deploys at the cost of CORS preflights on every report, a
second runbook, and a hardcoded origin in a client that has none.

What that reasoning missed is that the two can be separate Workers *without*
being separate origins — which is exactly what routes-over-Custom-Domains
gives. And there turned out to be a reason to want it. PR previews upload each
pull request as a **version** of a Worker, and a version inherits that Worker's
bindings and secrets. While the API lived in the site Worker, previewing any
client change — a CSS fix — meant running unreviewed code against the
production database holding the show's live data, with the real admin token
bound. The site Worker now has no database to inherit, and the API is previewed
through its own staging environment. Neither half can reach production data
from a preview, by construction rather than by a check somebody has to
remember. The rejected trade-off was never actually on the table; the cost of
the split is one more config file and one more deploy step.

Two consequences follow from the API no longer sitting behind the site:

- **It has no `ASSETS` binding**, so it cannot read `data/exhibitors.json` and
  `data/event.json` off the site at runtime. It imports them instead, which
  bundles them into the script — the queue allowlist and the event calendar are
  now built once at module scope rather than fetched and cached per isolate.
  Faster, and one less failure mode; the cost is that a data-only change needs
  an API deploy to reach the allowlist, which the deploy workflow does anyway.
- **A non-`/api` path reaching it is a mistake**, not a page request, so it
  answers 404 rather than falling through to the site. In production nothing
  routes there; on its own `workers.dev` address it is reachable and should say
  plainly that it is not the guide.

Locally the two are two processes with no edge to arrange them, so
`tools/dev-proxy.mjs` serves the repository and forwards `/api/*` to
`wrangler dev`. It exists only for that; nothing in `dist/` or either Worker
refers to it.

`worker/` sits outside `dist/`; `tools/build-site.sh` classifies the Worker,
its config, tests and package metadata as non-site files so its deliberate
top-level leakage check still passes. The rate-limit bindings need Wrangler
≥ 4.36.0; the repository pins 4.123.0.

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
that pair, no session id on the wire. An outcome closes a session, and one with
no update for 4 hours expires as `abandoned` (forgotten phones must not become
99-minute "waits").

**A device holds one open session in total** — revised after review; see §5.
A `joined` report closes whatever else was open for that client: `abandoned`
for the same queue, which is a re-queue rather than a move, and `left` for a
different one, which is what walking off to another line is.

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

The tracked implementation is in `worker/migrations/`. The initial schema and
the transactional outcome-event trigger expand the early sketch
with creation/update timestamps, an explicit `_booth` key (rather than SQL
`NULL`), initial-update markers, closure reports, short-lived queue overrides,
settings, denylist, audit and compact report-event tables. Those additions are
required for retention, session-less closure reports and the moderation actions
described later; those migrations are the authoritative schema.

The main relationships are `sessions → updates` (with cascading deletion),
one mechanics vote and one closure vote per device/queue, expiring moderator
overrides per queue, and a small report-event stream for rate checks and the
phone console. Partial and covering indexes enforce one open session per
device/queue and keep every rolling-window query bounded.

Every timestamp is stamped from the **server** clock; the client's opinion of
the time is never trusted (a phone that just left airplane mode after two
hours in Hall 7 will happily claim any time). Rows older than ~24h are
pruned by a Cron Trigger; `queue_meta` alone survives the whole show, because
a booth's mechanics on Wednesday still hold on Sunday.

### Which queues exist

One tracker per **playable game** (104 at revision 26). Exhibitors with a
lineup get *only* per-game trackers — no separate booth-level queue, settled
in review: past shows haven't really had global entry queues in front of the
per-station lines, and an extra "the booth itself" option on every Xbox
report would be a chooser step paid for a queue that mostly doesn't exist.
The 41 active entertainment exhibitors with **no playable lineup** (merch
halls, signing lines and similar experiences) get a single tracker each — not
an extra queue beside game queues but their only one, and some of those lines
are among the longest at the show. Four records currently tagged
`not exhibiting` are excluded on both client and Worker, just like business
(`trade`) exhibitors, which get none:
appointments, not queues, and the app already excludes them from every queue
surface. The worker validates ids against the deployed
`data/exhibitors.json` through its own `ASSETS` binding — no build step, and
the allowlist can never drift from the data actually being served.

## 3. API

**`POST /api/queue/report`** — one endpoint, a `kind` field, strict UUIDv4 in
`X-GC-Queue-Client` on everything. Validation on every kind: known queue (§2), show-hours
gate (server time inside `event.days` open–close ±30 min, from the same
ASSETS binding — kills the entire category of bored-at-home garbage), rate
limits (§6). Kinds:

| kind | payload | effect |
|---|---|---|
| `joined` | optional `claimed` bucket, optional `ahead` bucket | opens (or replaces) the session, anchor = now − claimed; returns `serverAt` and `joinedAt` |
| `update` | optional `ahead` bucket | "still in line", feeds elapsed + throughput |
| `entered` | optional reconnect-only `deferred: true`, server-issued `joinedAt`, `elapsed` seconds | closes session → completed wait sample; deferred time is matched to and checked against that exact anchor |
| `left` | — | closes session, excluded from wait stats |
| `closed` | — | "they shut the queue" — attaches to the queue, not the session |
| `meta` | `qtype`, optional `batch` bucket | upserts this client's row in `queue_meta` |

All numeric inputs are **chip vocabularies, not free numbers** — elapsed
claims reuse the wait buckets (§5), people-ahead comes as ~10 / ~20 / ~30 /
~50 / ~75 / ~100 / ~150 / 200+ (settled in review, top bucket included:
wave and group queues genuinely hold hundreds — four waves of 50 is 200
people — and being bad at estimating big crowds is exactly why the top
buckets only need to be right to the nearest hundred). Nobody counts a
switchback to the person, buckets are one-handed in a crowd, and the fixed
vocabulary is the first and cheapest garbage filter: the wire rejects
everything else.

**`GET /api/queue/live`** — the whole show in one blob, no per-queue fan-out:

```json
{ "at": 1756202400,
  "queues": {
    "xbox": {
      "call of duty: modern warfare 4":
                             { "est": 90, "how": "done", "n": 6, "newest": 1756202100,
                               "qtype": "group", "batch": 10 },
      "fable":               { "closed": true, "n": 3, "newest": 1756201800 } },
    "cdpr": {
      "_booth":              { "est": 25, "how": "flow", "n": 4, "newest": 1756202220 } } } }

(`_booth` appears only for lineup-less exhibitors — see §2.)
```

`how` is the estimator tier that produced the number (§4) — the client
renders each differently, because they mean different things.

**Read cost**: the response is held in the edge cache (`caches.default`) for
**60 seconds** plus `Cache-Control: max-age=30` for the browser. D1 is touched
at most about once a minute per active Cloudflare cache location and hostname,
rather than once per polling phone. The account is on Workers Paid, so request
volume from 2-minute polling is a non-issue (§5).

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
- **`closed`** overrides the number when ≥2 devices report it and fewer than 2
  *other* devices have newly joined since the most recent of those reports —
  "they shut the queue" outranks any wait, and at gamescom (capped queues,
  full-for-the-day boards) it is arguably the single most valuable report in
  the system.

  Revised after review; the rule this plan originally specified was wrong.
  It compared the closure reports against the **median of every client's
  newest activity** in the past hour, and that median sits well behind the
  present on any queue with normal turnover — everyone who finished earlier in
  the window drags it back — so two devices could close a busy queue. Rebutting
  now takes the same quorum as claiming, and only a *new arrival* counts: a
  gamescom queue closes to new entrants while the line already standing in it
  keeps being served, so `update` and `entered` from inside the line are what a
  real closure looks like, not evidence against it. A claimant cannot rebut
  their own claim.

  Known residual, accepted: on a queue quiet enough that two people do not join
  within the hour, two coordinated devices can still show it closed. Votes age
  out after an hour and the moderator has Force open, so the exposure is a
  short-lived wrong answer about a queue that was not worth queueing for.
- **A four-hour ceiling**, added after review. The per-pair filters bound the
  fast end only, so one slow-but-legal speed sample — a single bucket step
  across forty minutes is 0.25 people/min — divided into a long line projected
  to ten hours, and the card would have printed it. The two cases differ and
  are treated differently: a **derived** figure past the ceiling is discarded
  in favour of a measured tier, because its divisor is what is at fault, while
  a **measured** wait is clamped and flagged, reading as a floor ("4 h+", the
  way the top report bucket says "2 h+"). The flag travels in the payload, so
  the client never holds a second copy of the ceiling to drift out of step.
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
never enter wait stats; expiry keeps forgotten phones out of "sofar".
Abandonment itself is **captured but not displayed** in the MVP — settled
in review: "~40% gave up on this line" is real signal but demoralising and
jumpy on thin data, so the call on showing it waits for day-1 numbers,
shippable mid-show if they argue for it. With
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

**Where reporting lives — revised after the MVP shipped.** The original design
put the controls on the card, per game row. Built out, that is two buttons
under every playable title and three more once you are in a line: twenty-four
controls on Xbox's card alone, under a lineup that is the reason anyone opened
it. Reading and reporting were competing for the same space and reading lost.

So they are separated. **The cards read**: each game row keeps its live figure
and nothing else, the card foot keeps the worst-queue summary beside the
forecast meter, and one link — *Report a queue →* — sits with them, carrying
the exhibitor id (`#queues?ex=xbox`). **A fifth tab reports**: *Live queues*,
appended as 05 so the other four keep the numbers regulars know, and hidden
outside the show days like every other queue surface.

The tab holds, in order: the queues you are in, with their timers and the three
session actions; then a search box over all 162 queue identities. Untyped it
shows the queues at booths on your saved list, which is where most reports come
from and often removes the typing entirely. Arriving from a card link narrows
it to that booth with a chip that clears back to the whole show. Matching is
ranked — exact title, title prefix, word start, then substring — and
deliberately not fuzzy: "hlo" should not offer Halo to somebody standing in
front of a sign.

Two consequences worth stating. The card no longer says *why* a figure is
missing; "no reports yet" and "reported, now stale" are told apart only in the
queues view, where the difference changes what you would do, and the offline
case is stated once at the top of that view rather than under all seventy-six
cards. And with the controls gone from the card, "I'm in!" at the booth is two
taps rather than one — the reopen prompt bar (below) is what keeps the common
case at one, and it is the reason that bar is load-bearing rather than a nicety.

**Starting a session.** From a row in the queues view, tap "I'm in this
queue" →

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
open, its row in the queues view is a live timer with three buttons — **Still
waiting** (optionally re-asking the ahead bucket), **I'm in!**, **I left** —
its booth's card link reads "You're in 1 line here", and, the load-bearing
nudge: whenever the app is reopened or the tab
refocuses with a session past ~10 min, a quiet prompt bar surfaces it:
"Still queueing for Fable? 23 min · [Still waiting] [I'm in!] [I left]".
That reopen moment is when ground truth gets captured or lost — no
notifications, no background anything, just meeting the visitor at the
moment they already came back to their phone. **One line at a time**, revised after review: the
original plan allowed parallel sessions on the theory that you might hold a
place in two, but a single device cannot physically stand in two lines, and the
sessions left behind were not harmless — an open one counts toward its queue's
"so far" bound for four hours, so a line you wandered away from quietly
inflates a number somebody else is reading. Joining now closes whatever else
was open. The dialog says which line that is and how long you have been in it
before it happens; the Worker enforces it either way, since two tabs or a
replayed request would otherwise slip past a prompt.

**Reporting "queue closed"** stays a session-less one-tap, now on the queue's
row in the queues view — you see the sign, you report it, you walk away.

**Displaying.** A live chip beside the existing forecast, visually distinct
from it (the meter is a *prediction*, the chip is a *measurement* — the two
must not blur). Tier shapes the wording: flow → "Live: ~45 min", done →
"~50 min for people just in", sofar → "30+ min so far", each with
"· n reports · age". Game rows carry their own chips; the card foot
summarises the worst of them next to the forecast meter; the queue-priority
table and plan rows get the compact figure where one exists. A queue with
**no live reports shows nothing** on a card — settled in review: the forecast
meter already sits beside the chip's slot, so a fallback would render the same
expectation twice and blur the prediction/measurement line. (In the queues
view the empty state is spelled out instead, because there it is the thing you
might act on.) Map popovers are **phase 2** (`map.js` is a separate page and
script; it can now reuse the card's one link rather than growing controls of
its own).

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

- **Random, pseudonymous client id**: a resettable UUID minted into localStorage on first
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

  It is written, if it turns out to be needed: branch
  `claude/queue-turnstile-bot-check` carries an invisible Turnstile on all six
  report kinds — lazily loaded, inert until a secret is bound, with a kill
  switch on the moderation page and a bounded token wait so a blocked script
  costs a report ~2s rather than hanging it. Held off this branch on the same
  reasoning as above. It will need rebasing onto whatever lands here first,
  and its one unverified piece is the widget's own happy path, which needs the
  staging pass in docs/DEPLOYING.md.

### Moderation from a phone

The operator is at the show, phone-only — no laptop, no checkout, no SSH box
with the repo on it. Anything that assumes `wrangler` mid-show is a plan
that fails on day 1, so moderation is part of the *product*, not a runbook:

- **The worker serves its own admin page** at `/api/admin/` — a public,
  no-data login shell rendered by the script; its data and action endpoints
  are guarded by a bearer token (`wrangler secret put ADMIN_TOKEN` once at
  deploy time, pasted into the phone once, kept in that page's localStorage). Serving it from the worker
  rather than `dist/` keeps it off the public site, outside the service
  worker's caches, and means the page can never exist half-updated — it
  ships inside the same script that implements its actions.
- **What it shows**: report volume per queue and per hour; the estimator's
  current answer next to its inputs for any queue that looks wrong; top
  clients by report count; cheap anomaly lists (clients touching many queues
  at once, flip-flopping `ahead` values). Closure claims get their own list,
  every recent one with the rebutting arrivals counted exactly as §4's rule
  counts them and the verdict that rule reaches — so a claim one arrival away
  from closing a queue is as visible as one already overturned, and the page
  can never disagree with the chip a visitor is reading.
- **It names its own inputs.** The two ids the queue actions need — the
  exhibitor id and the game key — are not values anybody carries in their head,
  so the page offers every one currently in use as a tap target drawn from the
  data it has just loaded, with the busiest devices likewise. Typing still
  works, with autocomplete and a line under each field saying where the value
  comes from (the `?ex=` in the guide's own link; the game title lowercased;
  `_booth` for a booth with no lineup). Every action says what it destroys.
  This is the difference between a console you can use in a crowded hall and
  one you can only use with the repository open next to you.
- **What it does, as buttons**: delete a client's rows and deny-list the id
  (a `denylist` table, checked immediately on every write); purge one queue's last N minutes (one bad
  actor cleaned without losing the day); clear or force a `closed` state;
  and a global **pause writes** switch (reads keep serving) as the break-
  glass control while thinking.
- **Every admin action is logged** to an `admin_log` table — mostly so that
  day-3 Haylee can see what day-2 Haylee already tried.
- Protected admin attempts are rate-limited with enough room for the phone
  console's action-and-refresh workflow, and never distinguish "wrong token"
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
privacy-minimised and pseudonymous by design.

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

Deploy order: separate staging and production D1 databases are created and
migrated first, and independent `ADMIN_TOKEN` secrets are set via
`wrangler secret put --config wrangler-api.toml`; `wrangler-api.toml` carries
`main`, the `/api/*` routes, D1, cron and rate-limit bindings, none of which
the site Worker has any longer. A deploy is site, then migration, then API —
the site never waits on the API, and the schema is in place before the code
that reads it. The explicit `staging` environment has no routes at all, so its
workers.dev URL can verify isolation and moderation before production deploys;
it is also where PR previews of the API land. The
time-controlled two-profile behavioral loop runs locally before Aug 26, and
the real two-device staging loop runs once an event access window opens. The
ordinary production workers.dev URL is not staging. The detailed safe order
and teardown live in `docs/DEPLOYING.md`.

## 8. Phasing

**MVP (must ship before Aug 26):** worker + D1 + both endpoints; sessions
with `joined`/`update`/`entered`/`left`/`closed`; all three estimator tiers;
mechanics capture (`meta`) and label display; report flow + live chips on
cards; queue-priority integration; the reopen prompt bar; the phone admin
surface with deny-list, purge and pause (it exists *for* show week, so it
cannot be phase 2); SW bypass; i18n; privacy page; changelog/meta bump.

**Phase 2 (shippable mid-show — the PWA updates itself):** map popover
chips; wave-aware range display from observed cycle times; estimator tuning
informed by real day-1 data; additional anomaly heuristics if needed.

**After the show:** the endpoints return 410, the feature sleeps on its own
show-days check, D1 is deleted per the privacy promise.

## Settled in review (2026-08-16)

The six questions this plan left open were walked through and closed; the
decisions are folded into the sections above and recorded here so the
reasoning survives:

1. **Ahead buckets**: the 8-chip vocabulary, 200+ top bucket kept — big
   wave/group queues genuinely reach hundreds, and the coarse top end is
   the accommodation for nobody being good at estimating crowds (§3).
2. **Queue granularity**: strictly per-game on exhibitors with a lineup —
   no booth-level entry-queue tracker, which past shows suggest mostly
   doesn't exist as a thing. Lineup-less exhibitors get a single tracker as
   their only queue (§2).
3. **No-data chip**: hidden, no forecast fallback — the forecast meter
   already sits next to it (§5).
4. **Nudges**: reopen/refocus prompt only; no in-page reminders, and
   "Still waiting" keeps the ahead re-ask optional (§5).
5. **Abandonment**: captured, not displayed; revisit mid-show against real
   day-1 numbers (§4).
6. **Wave ranges**: phase 2, built against observed cycle times rather than
   blind (§4, §8).

## Files (implemented)

| file | change |
|---|---|
| `worker/index.js` | new — routing, validation, session logic, rate limits, estimator, cron prune |
| `worker/admin.js` | new — phone-first admin page + actions, token guard, audit log |
| `worker/core.js` | new — queue vocabulary, show-hour gate and pure estimator |
| `worker/migrations/` | new — tracked D1 schema, outcome trigger, revision guard and rolling-window indexes |
| `wrangler-api.toml` | new — the API Worker: `main`, `/api/*` routes on every hostname, D1, cron trigger, rate limits, staging environment |
| `wrangler.toml` | unchanged in shape — still assets-only, and now deliberately holds no bindings at all |
| `tools/dev-proxy.mjs` | new — dev-only single origin: serves the repo, forwards `/api/*` to `wrangler dev` |
| `js/app.js` | report dialog + prompt bar and live chips across cards/planner/route |
| `js/queue.js` | local session/pending state, polling, freshness and API transport |
| `index.html` | chip rows, disclosure, prompt bar, live chip slots |
| `css/style.css` | chips, timer state, live chip tiers, prompt bar |
| `js/i18n/en.js`, `de.js` | all new UI strings |
| `sw.js` | `/api/` bypass + `VERSION` bump |
| `privacy.html` (en/de) | new section: queue reports |
| `README.md` | feature paragraph |
| `data/changelog.json`, `data/meta.json` | revision entry |
| `docs/DEPLOYING.md` | D1 setup, staging-first API deploy, teardown |
| `package.json`, `vitest.config.mjs`, `test/` | pinned Worker tooling and estimator/API regressions |
| `.github/workflows/cloudflare.yml` | Node 22 build/test/dry-run gate, then site → migrate → API |
| `.github/workflows/cloudflare-preview.yml` | site preview, plus a path-filtered API preview against staging |
| `js/map.js`, `map.html` | phase 2 — popover chip |

## Verification

Implemented automated checks cover all 145 active queue identities and exact game
keys, Berlin show-hour boundaries, estimator tiers/closure/mechanics, the
joined → immediate first update flow and later throttle, strict UUIDs and rate
limits, deferred completion validation/replay, retention, admin auth/actions,
anomaly output, teardown behavior, and that the API answers only `/api` and
needs no asset binding to do it. The Node 22 Worker
suite passes, both Wrangler production and staging dry-runs pass, the i18n
checker reports parity, the static staging build excludes server files, and
client syntax plus focused state-machine smokes pass. The two-Worker split was
additionally driven end to end locally through `tools/dev-proxy.mjs`: joins,
a completed wait, mechanics metadata, the estimator's response through the
60-second edge cache, and the app rendering it — all on one origin, with the
API returning 404 for every non-`/api` path.

Still required before production: create the two real D1 databases, replace
the draft UUIDs, set independent admin secrets, apply remote migrations, run
the documented time-controlled two-profile behavior loop locally, and complete
the pre-show staging routing/admin checks. Repeat the real two-device/cache loop
on staging once an Aug 26–30 access window opens. Those external checks are
intentionally not claimed by the repository implementation.
