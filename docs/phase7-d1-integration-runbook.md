# Phase 7 isolated Cloudflare D1 integration runbook

**Release gate: BLOCKED until these checks are run against a disposable Cloudflare D1 database and evidence is attached to PR #37.** The existing four Python SQLite tests are not a substitute for D1 integration tests.

## Safety boundary

- Never run these commands against `ai-profit-engine-db`, `ape-subscribers`, or any production database ID.
- Do not change production `ADMIN_REVIEW_AUDIT_ENABLED` to `true`. Verify it is `false` before releasing review decisions.
- Do not use production Cloudflare Access credentials, Resend keys, applicant emails, or actual application IDs.
- Create a separate D1 database and use a temporary Wrangler configuration explicitly bound to its database ID. Prefer local or preview Workers for endpoint tests.
- Stop immediately if any identifier or binding is ambiguous.

## Preparation (manual, non-production)

1. Record the PR commit SHA and the Wrangler version (`npx wrangler --version`).
2. Create a disposable D1 database in Cloudflare and record its exact ID in the private test record.
3. Create a **separate** Wrangler config referencing that disposable database as `BUSINESS_DB`; do not reuse the production config. Inspect the resolved binding before running any remote commands.
4. Apply the application's exact `ape_businesses` migration and `migrations/phase7_review_audit_events.sql` to the disposable database only.
5. Seed synthetic pending applications with addresses at `example.invalid`. Ensure Resend is absent or mocked and record zero external email sends.

## Mandatory checks and evidence

| Case | Expected outcome |
| --- | --- |
| One pending-to-approved transition using the exact two-statement D1 `batch()` | UPDATE changes=1, audit INSERT changes=1, one approved row and one audit event |
| Repeat decision on same ID | UPDATE changes=0, audit changes=0, HTTP 409, no second event or email |
| Two concurrent decisions on same ID | Exactly one success, one conflict, one event, at most one mocked send |
| Force audit INSERT to fail with a disposable trigger | Batch rejects; application remains pending; zero audit events and sends |
| Missing ID and already-final ID | HTTP 409, no event or email |
| Invalid/forged/expired/wrong-audience Access JWT; wrong Origin; invalid JSON | Rejected; zero writes |
| Resend mock failure after committed decision | Decision and audit persist; failure reported; retry returns 409 |
| Unauthorized audit-history GET | Rejected with `Cache-Control: private, no-store` |
| Authorized audit-history GET | Authenticated, paginated with bounded limits and no-store; if route does not exist, mark INCOMPLETE |

Capture request/response statuses, batch result metadata, database counts, and any exceptions **without recording tokens, secrets, or personal data**. A post-batch JavaScript exception cannot roll back a batch already committed; verify atomicity by forcing a SQL-level audit failure.

## Go/no-go

Keep the release gate **BLOCKED** if any mandatory check fails, is unrun, or the audit-history endpoint is absent. Review the results and obtain explicit approval before enabling the production feature. Delete the disposable D1 database only after the evidence has been saved.
