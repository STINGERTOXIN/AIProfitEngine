-- Run against the production D1 database before enabling signup.
CREATE TABLE IF NOT EXISTS subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 consent_at TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','unsubscribed'))
);
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers(status);
