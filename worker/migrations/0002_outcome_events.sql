-- Record completed outcomes in the same SQLite transaction as the guarded
-- session transition. Two tabs can race different outcome buttons; a trigger
-- ensures only the UPDATE that actually wins contributes estimator evidence.
CREATE TRIGGER sessions_record_outcome_event
AFTER UPDATE OF outcome ON sessions
WHEN NEW.outcome IN ('entered', 'left')
  AND (OLD.outcome IS NULL OR OLD.outcome = 'abandoned')
BEGIN
  INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
  VALUES (NEW.client, NEW.exhibitor, NEW.game, NEW.outcome, NULL, NEW.closed_at);
END;
