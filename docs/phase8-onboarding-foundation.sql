-- Proposed migration for canonical application DB (DB / ape-subscribers).
-- Apply to isolated preview first. Do not execute in production yet.
CREATE TABLE IF NOT EXISTS ape_customer_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL UNIQUE REFERENCES ape_businesses(id),
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT
);
CREATE TABLE IF NOT EXISTS ape_activation_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64),
  account_id INTEGER NOT NULL REFERENCES ape_customer_accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ape_activation_account_idx ON ape_activation_tokens(account_id);
-- No raw tokens, passwords, or automatic account activation are stored here.
