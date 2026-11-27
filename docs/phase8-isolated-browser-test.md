# Phase 8 isolated browser acceptance gates

## Observed preview smoke tests
- Cloudflare Access login displayed in a fresh private browser.
- Customer sign-in and portal pages rendered.
- Direct unauthenticated account API returned HTTP 401.
- Activation page without invitation displayed invalid invitation.
- Activation GET returned POST required (status not captured).
- Login request returned HTTP 503, consistent with production-only origin guard.
- Activation POST encountered a Cloudflare Access 302; this is unresolved, not an activation pass.

## Isolation prerequisites
- Use a disposable D1 database with synthetic approved applications only; verify binding identity before any migration or write.
- Apply onboarding, customer sessions, rate limits and recovery migrations to the disposable database only, after prerequisite application schema.
- Keep production flags unchanged; no production Resend credentials in test environment.
- Use a local Workers runtime or dedicated protected test deployment with a test-only mail sink. Do not relax the production origin guard to make preview email work.
- Verify Access session on the exact preview hostname; inspect POST redirect destination and cookie scope without copying cookie values or tokens into logs. Do not bypass wildcard preview protection.
- A test harness for successful browser login is still required; the existing preview cannot exercise the production-only login request.

## Acceptance
1. Create synthetic approved and pending applicants; only approved qualifies.
2. Issue invitation to synthetic approved applicant; GET does not consume it.
3. Explicit POST activates once; replay and expired/revoked invitations fail.
4. Request sign-in through isolated mail sink; unknown email has equivalent public response.
5. Confirm login once; replay fails; verify Secure HttpOnly SameSite cookie.
6. Portal returns only the matching account; test a second independent account and anonymous request.
7. Logout revokes session; expired/disabled sessions fail; no private data on back navigation.
8. Verify rate limits and recovery queue with no real delivery.
9. Record HTTP statuses and sanitized results; never record raw tokens or cookie values.
10. Review CI and rollback plan before any production rollout.

No production migration, feature enablement, historical backfill or billing is authorized by this checklist.
