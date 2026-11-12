-- A.P.E. Lead Flow tenant-aware schema, additive and safe to apply to D1.
-- Does not modify the existing subscribers table.
-- Do not accept real customer leads until authenticated tenant isolation is implemented and tested.
CREATE TABLE IF NOT EXISTS ape_accounts (
 id TEXT PRIMARY KEY,
 owner_email TEXT NOT NULL COLLATE NOCASE,
 business_name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','suspended','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ape_accounts_owner_email_idx ON ape_accounts(owner_email);
CREATE TABLE IF NOT EXISTS ape_leads (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES ape_accounts(id) ON DELETE CASCADE,
 customer_name TEXT NOT NULL,
 customer_email TEXT,
 inquiry TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','contacted','won','lost','archived')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ape_leads_account_idx ON ape_leads(account_id,created_at);
CREATE TABLE IF NOT EXISTS ape_followups (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES ape_accounts(id) ON DELETE CASCADE,
 lead_id TEXT NOT NULL REFERENCES ape_leads(id) ON DELETE CASCADE,
 due_at TEXT NOT NULL,
 channel TEXT NOT NULL DEFAULT 'email' CHECK(channel IN ('email','manual')),
 draft TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sending','sent','failed','cancelled')),
 approved_at TEXT,
 sent_at TEXT,
 provider_message_id TEXT,
 attempt_count INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ape_followups_due_idx ON ape_followups(status,due_at);
CREATE INDEX IF NOT EXISTS ape_followups_account_idx ON ape_followups(account_id,lead_id);
CREATE TABLE IF NOT EXISTS ape_delivery_events (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES ape_accounts(id) ON DELETE CASCADE,
 followup_id TEXT NOT NULL REFERENCES ape_followups(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL,
 provider_event_id TEXT UNIQUE,
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ape_billing (
 account_id TEXT PRIMARY KEY REFERENCES ape_accounts(id) ON DELETE CASCADE,
 provider TEXT NOT NULL,
 provider_customer_id TEXT UNIQUE,
 provider_subscription_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'inactive',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
