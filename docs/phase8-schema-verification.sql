-- Read-only checks. Run against isolated preview DB first.
SELECT name, type FROM sqlite_master WHERE name IN (
 'ape_businesses','ape_customer_accounts','ape_activation_tokens',
 'ape_customer_login_challenges','ape_customer_sessions',
 'ape_login_rate_limits','ape_invitation_delivery_jobs',
 'ape_activation_account_idx','ape_customer_login_account_idx',
 'ape_customer_session_account_idx','ape_login_rate_window_idx',
 'ape_invitation_delivery_due_idx'
) ORDER BY type,name;
PRAGMA table_info(ape_customer_accounts);
PRAGMA table_info(ape_activation_tokens);
PRAGMA table_info(ape_customer_login_challenges);
PRAGMA table_info(ape_customer_sessions);
PRAGMA table_info(ape_login_rate_limits);
PRAGMA table_info(ape_invitation_delivery_jobs);
PRAGMA foreign_key_check;
SELECT COUNT(*) AS application_count FROM ape_businesses;
SELECT COUNT(*) AS customer_count FROM ape_customer_accounts;
SELECT COUNT(*) AS invitation_job_count FROM ape_invitation_delivery_jobs;
-- Expect six new tables, five named indexes, no foreign key violations.
-- On a fresh isolated migration, customer and invitation job counts are zero.
-- Compare application count with pre-migration baseline.
