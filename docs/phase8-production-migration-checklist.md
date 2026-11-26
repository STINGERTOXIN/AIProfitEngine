# Phase 8 production migration checklist

## Evidence recorded November 25, 2026
Operator screenshots show isolated Worker ape-phase8-invitation-test scheduled every five minutes, 24 successful observability events and zero errors in the displayed hour. The 19:20 CST structured log reports recovered=1 and emails_sent=0. D1 ape-phase8-test-db shows application 1 failed with interrupted_delivery_review and cleared lease fields. The temporary Cron trigger was subsequently removed and saved. This validates the isolated interrupted-delivery scenario, not the complete production mail pipeline.

## Before production migration
- Verify Pages production DB binding points to ape-subscribers, not BUSINESS_DB or any preview database.
- Confirm a fresh Time Travel bookmark and successful backup for the canonical database; record recovery procedure.
- Run read-only schema inspection: SELECT name, type FROM sqlite_master WHERE name LIKE 'ape_%' ORDER BY type,name;
- Inspect existing application schema: PRAGMA table_info(ape_businesses);
- If any proposed table already exists, inspect its columns, constraints and indexes; stop on mismatch. IF NOT EXISTS is not a schema validation mechanism.
- Confirm onboarding, automatic invitations, customer login and recovery flags are disabled or absent in production Pages and Worker.
- Verify current PR head checks and review all changes before merging.

## Migration order (after explicit production approval)
1. docs/phase8-onboarding-foundation.sql
2. docs/phase8-customer-sessions.sql
3. docs/phase8-login-rate-limits.sql
4. docs/phase8-invitation-recovery.sql

Verify six new tables, their indexes, foreign keys and unchanged existing application/subscriber counts. Do not backfill accounts or enqueue historical invitations. Keep flags disabled during migration and deployment. Never drop tables as routine rollback; disable features and assess recovery with preservation of subsequent writes.

## Launch gates
Verify deployed disabled behavior, Worker binding and secrets, controlled invitation delivery to an operator-owned test address, explicit activation, single-use login, session isolation and logout. Enable coordinated flags only after approval. Keep ambiguous sends quarantined for manual review. No billing in this phase.
