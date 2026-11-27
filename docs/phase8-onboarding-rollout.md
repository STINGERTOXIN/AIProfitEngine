# Phase 8 onboarding rollout

The SQL foundation is a proposed migration, not a deployed feature.
Use the canonical application binding DB. Verify preview DB isolation before applying SQL.

## Implementation gates
- Keep existing approval behavior unchanged until onboarding passes preview tests.
- Require verified administrator authorization for invitations; only approved applications qualify.
- Generate 32 random bytes using Web Crypto; store only SHA-256 token hashes.
- Expire invitations after 24 hours. Reissue by revoking earlier tokens atomically.
- GET must not consume tokens (email scanners may follow links). Require explicit POST confirmation.
- Consume the token and activate its matching invited account in one guarded transaction.
- Do not treat activation as a reusable login session. Implement separate authenticated customer sessions before exposing private data.
- Use fixed trusted HTTPS activation origin, no third-party resources on activation page, no token logging, no-store and no-referrer headers.
- Disable onboarding by default; never send preview invitations to real customers.
- Do not automatically backfill or invite historical applicants.
- Test invalid, expired, revoked, replayed and concurrent tokens; rejected applications; email failures; unauthorized access and cross-account isolation.
- Verify backups and rollback before production migration.
- No billing or paid-service activation in this phase.

## Current scope
Schema and rollout plan only. No runtime routes, email delivery, or customer sessions are implemented yet.
