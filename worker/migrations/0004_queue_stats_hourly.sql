-- Anonymous per-queue, per-hour aggregates, written by the hourly job just
-- before the retention sweep deletes the raw rows behind them. Two consumers:
-- the estimator's "yesterday around this time" fallback for queues with no
-- current reports, and show-long metrics that would otherwise die at the
-- 24-hour horizon.
--
-- Deliberately no client column anywhere. The privacy page's 24-hour promise
-- is about device-linked rows; what may outlive it is exactly this — counts
-- and medians per queue and hour that identify nobody. The table is kept
-- through the show and goes down with the rest of the database at teardown
-- (docs/DEPLOYING.md), which also makes it the "aggregate, non-device-linked
-- postmortem" export that runbook already calls for.
CREATE TABLE queue_stats_hourly (
  hour        INTEGER NOT NULL,  -- epoch seconds of the UTC hour start
  exhibitor   TEXT    NOT NULL,
  game        TEXT    NOT NULL,
  joined_n    INTEGER NOT NULL DEFAULT 0,
  update_n    INTEGER NOT NULL DEFAULT 0,
  entered_n   INTEGER NOT NULL DEFAULT 0,
  left_n      INTEGER NOT NULL DEFAULT 0,
  closed_n    INTEGER NOT NULL DEFAULT 0,
  meta_n      INTEGER NOT NULL DEFAULT 0,
  clients_n   INTEGER NOT NULL DEFAULT 0,  -- distinct devices, count only
  ahead_n     INTEGER NOT NULL DEFAULT 0,
  ahead_med   INTEGER,                     -- median reported people-ahead
  wait_n      INTEGER NOT NULL DEFAULT 0,
  wait_med    INTEGER,                     -- median measured wait, seconds
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (hour, exhibitor, game)
);

-- The estimator reads a day of hours across every queue (the primary key
-- serves that); metrics read one queue across the show, which wants the
-- queue-leading order instead.
CREATE INDEX queue_stats_hourly_queue
  ON queue_stats_hourly (exhibitor, game, hour);
