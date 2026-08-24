# Queue check-in

A read-only sweep of the live queue database, run every two hours while the
show is open. It answers two questions — *is the crowd-sourced wait data
healthy*, and *is anything in it wrong enough to act on* — and reports in a few
lines someone can read on a phone between halls.

A Routine fires this on show days at 09:00, 11:00, 13:00, 15:00, 17:00 and
19:00 Europe/Berlin. Each firing starts a fresh session with no memory of the
last one, so everything it needs is here.

---

## The database

Production is the D1 database **`gc2026-queues`**, id
`424b7933-9013-471a-8bae-e8927f406ede` (the same id in `wrangler-api.toml`).
Read it with the Cloudflare Developer Platform connector:

```
d1_database_query(database_id="424b7933-9013-471a-8bae-e8927f406ede", sql="…")
```

`gc2026-queues-staging` (`1cfa05b9-…`) is the preview database. Never report on
it; PR previews write junk there on purpose.

**Read only.** Every query in this document is a `SELECT`. Do not `INSERT`,
`UPDATE`, `DELETE` or `ALTER` anything, even to fix something obviously broken —
the fixes belong in the admin page (see [Escalating](#escalating)), which
records who did what in `admin_log`. A repair made directly in D1 leaves no
trace and can contradict a Worker holding the same rows in flight.

Times are Unix seconds. `unixepoch()` gives the current one, so no query below
needs a bound parameter. The show runs in Europe/Berlin (UTC+2 in August) —
convert before quoting a clock time in the report.

### What is in there, and for how long

`report_events` is the audit stream: one row per action, with `kind` in
`joined`, `update`, `entered`, `left`, `closed`, `meta`. `sessions` is one
anonymous device waiting in one queue, `outcome` `NULL` while it waits, then
`entered`, `left` or `abandoned`. `closure_reports` and `queue_meta` are
per-device votes: this queue is closed, this queue admits people in pairs.
`queue_overrides`, `settings`, `denylist` and `admin_log` are the moderation
surface.

An hourly cron in the Worker abandons sessions untouched for four hours and
deletes everything older than 23 hours, which is how the 24-hour retention
promise in the privacy notice is kept. **Nothing older than a day exists**, so
"compared with yesterday" is not a question this database can answer, and an
empty result usually means nothing happened rather than something failed.

`ahead` is a bucket, never a free number: 10, 20, 30, 50, 75, 100, 150, 200.
`claimed` is 0, 10, 20, 30, 45, 60, 90, 120. A value outside those sets cannot
be stored, so do not go looking for one.

---

## The sweep

Run all of it — the checks are small and the whole set costs less than a
second. Two of them mirror rules that live in `worker/admin.js`; where a query
says so, keep it in step with the Worker rather than inventing a new threshold.

### 1. Pulse — is anything arriving?

```sql
SELECT CAST((unixepoch() - at) / 3600 AS INTEGER) AS hours_ago,
       COUNT(*) AS reports,
       COUNT(DISTINCT client) AS clients,
       COUNT(DISTINCT exhibitor || char(0) || game) AS queues
FROM report_events
WHERE at >= unixepoch() - 6 * 3600
GROUP BY hours_ago
ORDER BY hours_ago
```

The shape of the day, six hours back. Expect the current hour to be busy while
the halls are open and to fall away near closing.

**Report if:** the current hour is zero or near-zero during opening hours and
the hour before it was not. That is the one finding worth interrupting someone
for — it means reporting has stopped, not that queues are empty. Confirm it
with the health checks in §7 before saying so.

### 2. Where the crowd is

```sql
SELECT exhibitor, game,
       COUNT(*) AS reports,
       COUNT(DISTINCT client) AS clients,
       SUM(kind = 'joined') AS joins,
       SUM(kind = 'entered') AS entered,
       SUM(kind = 'left') AS gave_up,
       SUM(kind = 'closed') AS closure_votes,
       MAX(at) AS newest
FROM report_events
WHERE at >= unixepoch() - 2 * 3600
GROUP BY exhibitor, game
ORDER BY reports DESC
LIMIT 12
```

The two hours since the last check-in. This is the summary — name the top few
in the report.

### 3. Waits people actually measured

```sql
SELECT exhibitor, game,
       COUNT(*) AS entered,
       MIN((closed_at - joined_at) / 60) AS min_wait,
       CAST(AVG((closed_at - joined_at) / 60.0) AS INTEGER) AS avg_wait,
       MAX((closed_at - joined_at) / 60) AS max_wait
FROM sessions
WHERE outcome = 'entered' AND closed_at >= unixepoch() - 3 * 3600
GROUP BY exhibitor, game
HAVING entered >= 2
ORDER BY avg_wait DESC
LIMIT 12
```

Completed waits, not estimates. The estimator caps what it shows at 240
minutes (`MAX_ESTIMATE_MINUTES`), so a measured wait above that is real but
will read as "4h+" in the app.

**Report if:** an average is absurd for the booth — a headline game at eight
minutes, a quiet booth at three hours. Cross-check the count: two sessions
prove nothing.

### 4. One device, many answers

```sql
SELECT client, exhibitor, game, COUNT(*) AS reports,
       COUNT(DISTINCT ahead) AS ahead_values,
       MIN(ahead) AS min_ahead, MAX(ahead) AS max_ahead,
       (MAX(at) - MIN(at)) / 60 AS span_minutes, MAX(at) AS newest
FROM report_events
WHERE at >= unixepoch() - 24 * 3600
  AND kind IN ('joined', 'update') AND ahead IS NOT NULL
GROUP BY client, exhibitor, game
HAVING COUNT(DISTINCT ahead) >= 3
ORDER BY ahead_values DESC, reports DESC
LIMIT 20
```

The admin page's `aheadAnomalies`, plus the span the values were posted over.
Expect this list to be mostly innocent: someone updating an honest estimate as
the line moves is the *normal* case and shows three or four descending values —
100, 75, 50, 30 over half an hour is a person shuffling forward. The ordering
puts the worst first, so read from the top and stop when the rows look human.

**Report if:** the values swing rather than settle (10 → 200 → 20), or
`ahead_values` is five or more with a small `span_minutes`. That is a device
playing with the buttons, and its reports are steering a booth card.

### 5. One device, many queues

```sql
SELECT client, COUNT(DISTINCT exhibitor || char(0) || game) AS queues,
       COUNT(*) AS reports, MAX(at) AS newest
FROM report_events
WHERE at >= unixepoch() - 15 * 60
GROUP BY client
HAVING queues >= 3
ORDER BY queues DESC, reports DESC
LIMIT 20
```

Nobody stands in four lines at once in a quarter of an hour. Three is
believable — walking a hall, glancing at three booths, backing out of two.

**Report if:** a client is in five or more queues, or in three or more with a
report count far above the number of queues. Give the client id; that is what
`deny_client` takes.

### 6. Closure claims about to take a queue down

```sql
WITH recent_closures AS (
  SELECT exhibitor, game, COUNT(DISTINCT client) AS closure_clients,
         MAX(reported_at) AS newest_closure
  FROM closure_reports WHERE reported_at >= unixepoch() - 3600
  GROUP BY exhibitor, game
), rebuttals AS (
  SELECT c.exhibitor, c.game, COUNT(DISTINCT e.client) AS rebuttal_clients,
         MAX(e.at) AS newest_rebuttal
  FROM recent_closures c JOIN report_events e
    ON e.exhibitor = c.exhibitor AND e.game = c.game
   AND e.kind = 'joined' AND e.at > c.newest_closure
   AND NOT EXISTS (
     SELECT 1 FROM closure_reports x
     WHERE x.exhibitor = e.exhibitor AND x.game = e.game
       AND x.client = e.client AND x.reported_at >= unixepoch() - 3600
   )
  GROUP BY c.exhibitor, c.game
)
SELECT c.exhibitor, c.game, c.closure_clients, c.newest_closure,
       COALESCE(r.rebuttal_clients, 0) AS rebuttal_clients, r.newest_rebuttal,
       CASE WHEN c.closure_clients >= 2 AND COALESCE(r.rebuttal_clients, 0) < 2
            THEN 1 ELSE 0 END AS would_close
FROM recent_closures c
LEFT JOIN rebuttals r ON r.exhibitor = c.exhibitor AND r.game = c.game
ORDER BY would_close DESC, c.newest_closure DESC
LIMIT 20
```

Two devices saying a queue is closed shuts it, unless two later arrivals join
and contradict them. This is the estimator's own rule, copied from
`worker/admin.js` so the check-in never disagrees with the chip a visitor is
looking at — if you change one, change both.

**Report if:** `would_close = 1` on a booth that §2 shows is busy. A queue
being reported closed while people are visibly still joining it is either a
booth that genuinely stopped admitting (fine, and it expires on its own) or two
devices shutting down a line that is still running (not fine).

### 7. Health of the plumbing

```sql
SELECT 'oldest_event' AS check_name, MIN(at) AS value FROM report_events
UNION ALL SELECT 'open_sessions',
  COUNT(*) FROM sessions WHERE outcome IS NULL
UNION ALL SELECT 'open_over_4h',
  COUNT(*) FROM sessions
  WHERE outcome IS NULL AND joined_at < unixepoch() - 4 * 3600
UNION ALL SELECT 'denylisted', COUNT(*) FROM denylist
UNION ALL SELECT 'live_overrides',
  COUNT(*) FROM queue_overrides WHERE expires_at > unixepoch()
```

- `oldest_event` is `NULL` when the table is empty, which before the show and
  in the first minutes of a day is simply true. Older than 24 hours means the
  hourly cleanup cron has stopped
  and the retention promise is being broken. **Report this every time it is
  true** — it is a privacy commitment, not a nicety.
- `open_over_4h` should be near zero: the same cron abandons sessions that go
  four hours without an update. A handful is a normal race with the cron; dozens
  means it is not running.
- Any row in `denylist` or `queue_overrides` that nobody remembers creating is
  worth a line in the report. Overrides expire an hour after they are set.

```sql
SELECT key, value, updated_at FROM settings ORDER BY key
```

**Report if:** `writes_paused` is `1`. Reporting is switched off site-wide and
somebody needs to know it is still off.

```sql
SELECT id, action, detail, at FROM admin_log
WHERE at >= unixepoch() - 3 * 3600 ORDER BY at DESC LIMIT 20
```

Moderation done since the last sweep. Usually empty. Repeat this back so the
report shows the actions taken as well as the problems found.

### 8. The public endpoint

```
curl -sS --max-time 20 https://gc2026.inventivetalent.org/api/queue/live
```

What a visitor's phone actually receives, through the real routes and the edge
cache. It answers `{"error":"outside_show_hours"}` outside opening hours, which
is correct behaviour and not a fault — check it against the day's hours in
`data/event.json` (Wednesday is 13:00–19:00 and the rest are 10:00 or 09:00 to
20:00, with trade badges admitted from 09:00 Wednesday to Friday).

**Report if:** it errors, times out, or returns no queues while §1 shows
reports arriving. That gap is the difference between "the data is fine" and
"the data is fine and nobody can see it".

---

## Reporting

Write for someone standing in a hall with a phone. Lead with the verdict, keep
it under roughly ten lines, and put numbers in it rather than adjectives.

A quiet sweep is one line and a little context:

> **Queues normal.** 412 reports from 180 devices across 24 queues this hour.
> Busiest: Nintendo *Zelda* (62), Xbox *Fable* (48), Riot booth (31). Longest
> measured wait 95 min at Nintendo. No anomalies, cleanup cron current.

A sweep with a finding names the queue or the client, says what the rule saw,
and says what would fix it:

> **One device to look at.** Client `a1b2…` posted 7 different ahead values on
> Xbox *Fable* in 40 minutes (10 → 200 → 20 → 150 …) and is in 6 queues at
> once. Its reports are moving that booth's estimate. Admin page → deny_client
> `a1b2c3d4-…`. Everything else normal: 380 reports, 165 devices.

Do not pad a clean sweep to look thorough, and do not hedge a real finding into
something ignorable. If a query fails or the connector is unavailable, say
exactly that — a sweep that could not run is not a sweep that found nothing.

## Escalating

Nothing here is fixed from the check-in session. Fixes are made by a human on
the admin page at `https://gc2026.inventivetalent.org/api/admin/`, which needs
`ADMIN_TOKEN` and logs every action:

| What you found | Action to name in the report |
| --- | --- |
| A device posting nonsense | `deny_client` — removes the device's reports and blocks it |
| A queue's data poisoned in the last N minutes | `purge_queue`, with the minutes to roll back |
| A queue wrongly shown open | `force_closure` — expires after 1 hour |
| A queue wrongly shown closed | `clear_closure` — drops the closure votes too |
| An override that should stop | `auto_closure` — hands the queue back to the crowd |
| Something systemically wrong | `pause_writes` — stops all reporting site-wide |

Name the action and the argument it needs. Deciding to take it is the human's
call, at a booth, with eyes on the actual line.
