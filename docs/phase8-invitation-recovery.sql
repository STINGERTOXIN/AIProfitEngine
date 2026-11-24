-- Proposed migration: isolated preview only until reviewed.
CREATE TABLE IF NOT EXISTS ape_invitation_delivery_jobs (
 application_id INTEGER PRIMARY KEY REFERENCES ape_businesses(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
 lease_id TEXT,
 lease_until INTEGER,
 last_error_code TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ape_invitation_delivery_due_idx ON ape_invitation_delivery_jobs(status,next_attempt_at);
-- Never store raw invitation tokens or email provider credentials in this queue.
