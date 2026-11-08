-- Apply to a Cloudflare D1 database before deploying the Worker.
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  business TEXT NOT NULL DEFAULT '',
  challenge TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
-- Configure a retention/deletion policy before accepting real submissions.
