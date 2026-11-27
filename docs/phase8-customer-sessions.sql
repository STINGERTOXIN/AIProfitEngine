-- Proposed migration; apply only after onboarding foundation in isolated preview.
CREATE TABLE IF NOT EXISTS ape_customer_login_challenges (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 account_id INTEGER NOT NULL REFERENCES ape_customer_accounts(id),
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ape_customer_login_account_idx ON ape_customer_login_challenges(account_id);
CREATE TABLE IF NOT EXISTS ape_customer_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 account_id INTEGER NOT NULL REFERENCES ape_customer_accounts(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at INTEGER NOT NULL,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ape_customer_session_account_idx ON ape_customer_sessions(account_id);
