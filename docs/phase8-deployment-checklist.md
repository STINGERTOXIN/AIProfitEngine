# Phase 8 deployment checklist

Do not merge or enable customer features until the isolated preview checks are complete. Never point preview at production D1. Production canonical DB is ape-subscribers; BUSINESS_DB is legacy and must remain untouched.

## Database preparation
1. Verify preview DB binding ID and confirm ape_businesses exists with id, status and contact_email. Use synthetic applicants only.
2. Capture recovery bookmarks for the target database before applying changes.
3. Apply these SQL files in order:
   - phase8-onboarding-foundation.sql
   - phase8-customer-sessions.sql
   - phase8-login-rate-limits.sql
   - phase8-invitation-recovery.sql
4. Inspect sqlite_master and PRAGMA table_info for each new table; IF NOT EXISTS does not validate an existing schema.
5. Verify foreign keys with PRAGMA foreign_key_check. Stop on unexpected results. Confirm existing application and audit counts remain unchanged.

## Configuration
Keep ONBOARDING_ENABLED, AUTO_INVITATIONS_ENABLED, CUSTOMER_LOGIN_ENABLED and INVITATION_RECOVERY_ENABLED false initially. Set LOGIN_RATE_LIMIT_SECRET as a Cloudflare secret using 32 cryptographically random bytes encoded as 64 lowercase hex characters. Never commit or paste it into chat. Use a separate secret for each environment. Rotation resets effective rate-limit buckets.
ONBOARDING_ORIGIN must be https://aiprofitengine.ai for production. Current email and login request guards intentionally reject preview origins. Do not weaken them to test with real customer emails. Use isolated runtime tests with mocked email before a controlled production smoke test.
Configure the recovery Worker separately using workers/wrangler.invitation-recovery.example.toml and the same canonical production DB only after approval. Keep flags false until coordinated rollout.

## Release gates
- All CI checks green on exact candidate commit.
- Isolated D1 migrations and transaction behavior verified.
- Preview UI and disabled API behavior verified; no production data or mail.
- Review rate-limit retention, recovery monitoring and administrator visibility.
- Production backup and recovery bookmark confirmed immediately before migration.
- Apply additive migrations with all new features disabled; verify schema and existing admin behavior.
- Controlled synthetic production activation, login, logout and email delivery checks with explicit approval before broader enablement.
- Do not backfill historical applications or enable billing.

## Rollback
Disable all new feature flags and recovery Worker processing first. Revert application deployment if necessary. Preserve additive tables and audit records; do not drop tables or restore the whole database without reviewing subsequent writes. Ambiguous email deliveries require review, not blind retries.
