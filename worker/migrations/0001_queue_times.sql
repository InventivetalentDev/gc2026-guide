PRAGMA foreign_keys = ON;

-- A session represents one anonymous device waiting in one concrete queue.
-- Booth-only queues use the reserved game key `_booth`; game is never NULL so
-- SQLite can enforce one open session per client and queue reliably.
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  exhibitor  TEXT    NOT NULL,
  game       TEXT    NOT NULL,
  client     TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  joined_at  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  claimed    INTEGER NOT NULL DEFAULT 0
             CHECK (claimed IN (0, 10, 20, 30, 45, 60, 90, 120)),
  outcome    TEXT
             CHECK (outcome IS NULL OR outcome IN ('entered', 'left', 'abandoned')),
  closed_at  INTEGER,
  deferred   INTEGER NOT NULL DEFAULT 0 CHECK (deferred IN (0, 1))
);

CREATE UNIQUE INDEX sessions_one_open_per_client_queue
  ON sessions (client, exhibitor, game)
  WHERE outcome IS NULL;
CREATE INDEX sessions_queue_outcome_closed_at
  ON sessions (exhibitor, game, outcome, closed_at);
CREATE INDEX sessions_outcome_updated_at
  ON sessions (outcome, updated_at);
CREATE INDEX sessions_client_created_at
  ON sessions (client, created_at);

CREATE TABLE updates (
  id          INTEGER PRIMARY KEY,
  session     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ahead       INTEGER
              CHECK (ahead IS NULL OR ahead IN (10, 20, 30, 50, 75, 100, 150, 200)),
  reported_at INTEGER NOT NULL,
  initial     INTEGER NOT NULL DEFAULT 0 CHECK (initial IN (0, 1))
);

CREATE INDEX updates_session_reported_at
  ON updates (session, reported_at);
CREATE INDEX updates_initial_reported_at
  ON updates (initial, reported_at);
CREATE UNIQUE INDEX updates_one_initial_per_session
  ON updates (session)
  WHERE initial = 1;

-- Queue mechanics are a per-device vote retained for the duration of the show.
CREATE TABLE queue_meta (
  exhibitor  TEXT    NOT NULL,
  game       TEXT    NOT NULL,
  client     TEXT    NOT NULL,
  qtype      TEXT    NOT NULL CHECK (qtype IN ('single', 'pairs', 'group', 'wave')),
  batch      INTEGER CHECK (batch IS NULL OR batch IN (2, 5, 10, 20, 50, 100)),
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (exhibitor, game, client)
);

CREATE INDEX queue_meta_queue_reported_at
  ON queue_meta (exhibitor, game, reported_at);

-- A client contributes at most one current closure vote to a queue.
CREATE TABLE closure_reports (
  exhibitor  TEXT    NOT NULL,
  game       TEXT    NOT NULL,
  client     TEXT    NOT NULL,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (exhibitor, game, client)
);

CREATE INDEX closure_reports_queue_reported_at
  ON closure_reports (exhibitor, game, reported_at);

-- Short-lived moderator decisions override crowd closure votes.
CREATE TABLE queue_overrides (
  exhibitor     TEXT    NOT NULL,
  game          TEXT    NOT NULL,
  forced_closed INTEGER NOT NULL CHECK (forced_closed IN (0, 1)),
  expires_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (exhibitor, game)
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE denylist (
  client   TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);

CREATE TABLE admin_log (
  id     INTEGER PRIMARY KEY,
  action TEXT    NOT NULL,
  detail TEXT,
  at     INTEGER NOT NULL
);

-- A compact audit stream supports hourly volume and anomaly views without
-- retaining IP addresses or unbounded request payloads.
CREATE TABLE report_events (
  id        INTEGER PRIMARY KEY,
  client    TEXT    NOT NULL,
  exhibitor TEXT    NOT NULL,
  game      TEXT    NOT NULL,
  kind      TEXT    NOT NULL
            CHECK (kind IN ('joined', 'update', 'entered', 'left', 'closed', 'meta')),
  ahead     INTEGER
            CHECK (ahead IS NULL OR ahead IN (10, 20, 30, 50, 75, 100, 150, 200)),
  at        INTEGER NOT NULL
);

CREATE INDEX report_events_at
  ON report_events (at);
CREATE INDEX report_events_queue_at
  ON report_events (exhibitor, game, at);
CREATE INDEX report_events_client_at
  ON report_events (client, at);
