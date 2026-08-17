-- Optimistic revision lets a transactional batch accept exactly one of two
-- concurrent updates that both observed the same throttle state.
ALTER TABLE sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

-- Live estimation and retention scan by time across every queue. Give those
-- global rolling windows a time-leading index rather than relying on indexes
-- whose first columns are client, session, or queue identity.
CREATE INDEX sessions_created_at ON sessions (created_at);
CREATE INDEX sessions_outcome_closed_at ON sessions (outcome, closed_at);
CREATE INDEX updates_reported_at ON updates (reported_at);
CREATE INDEX closure_reports_reported_at ON closure_reports (reported_at);
