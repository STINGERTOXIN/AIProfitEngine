-- Phase 7: review decision audit trail.
-- Apply ONLY to the D1 database containing ape_businesses, after verified backup.
-- Additive schema; does not alter existing applications or decisions.
CREATE TABLE IF NOT EXISTS ape_application_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  old_status TEXT NOT NULL CHECK (old_status = 'pending'),
  new_status TEXT NOT NULL CHECK (new_status IN ('approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS ape_review_events_application_time_idx
  ON ape_application_review_events(application_id, created_at);
CREATE INDEX IF NOT EXISTS ape_review_events_time_idx
  ON ape_application_review_events(created_at, id);
