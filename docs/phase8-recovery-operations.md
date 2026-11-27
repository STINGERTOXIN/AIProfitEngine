# Invitation recovery operations
Deploy the example Worker configuration only after verifying the canonical D1 binding and applying the proposed migrations in an isolated environment. Keep all feature flags false initially. Never copy production customer data into preview.
## Monitoring
Enable Worker observability in Cloudflare. Inspect APE_INVITATION_RECOVERY and APE_INVITATION_RECOVERY_FAILED events. The following read-only D1 queries expose aggregate operational status without customer email or tokens.
```sql
SELECT status, COUNT(*) AS jobs FROM ape_invitation_delivery_jobs GROUP BY status;
SELECT COUNT(*) AS overdue FROM ape_invitation_delivery_jobs WHERE status='pending' AND next_attempt_at < unixepoch()-600;
SELECT COUNT(*) AS review_required FROM ape_invitation_delivery_jobs WHERE status='failed';
SELECT COUNT(*) AS expired_leases FROM ape_invitation_delivery_jobs WHERE status='processing' AND lease_until <= unixepoch();
```
Investigate failed executions, overdue jobs and ambiguous sends. Never blindly reset a failed delivery: confirm provider acceptance and account status first.
## Rollout
Test transactional approval and queue insertion, concurrent claims, lease expiry, retry exhaustion, disabled flags and private data isolation. Use synthetic addresses and a mocked mail transport. Confirm preview cannot send production email. Configure verified sender and Worker secret separately. Deploy disabled, verify logs and database binding, then enable coordinated flags only after explicit launch approval. Disable recovery and automatic invitations together to halt new sends; preserve queued records. No historical backfill without review.
