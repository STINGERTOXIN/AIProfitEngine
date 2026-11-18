# Phase 7 — Durable pilot review audit trail (design gate)

## Existing behavior verified in `functions/api/admin/subscribers.js`
- Administrator POST verifies Cloudflare Access JWT, checks same-origin JSON, and accepts an integer application ID plus `approved` or `rejected`.
- Current D1 statement updates `ape_businesses` only when its status is `pending`.
- Resend email is attempted **after** the D1 update; provider failure does not roll back the decision.
- Current code does **not** write a durable decision audit event.

## Proposed schema (migration must be reviewed before application)
Create `ape_application_review_events` in the **same D1 database** as `ape_businesses`:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `application_id INTEGER NOT NULL`
- `actor_email TEXT NOT NULL`
- `old_status TEXT NOT NULL`
- `new_status TEXT NOT NULL CHECK(new_status IN ('approved','rejected'))`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `request_id TEXT` (diagnostics only; no authentication value)
- index on `(application_id, created_at)`

Do not record raw JWTs, API keys, or applicant message bodies. Decide retention and authorized visibility before launch.

## Atomicity and authorization
1. Preserve the current Access JWT signature, issuer, audience, expiry and administrator-email checks.
2. Use a single D1 transaction/atomic batch to conditionally transition only a pending application **and** insert the event. Do not rely on a standalone update followed by an independent insert.
3. Ensure the event is inserted **only** if the pending-to-final transition actually happened; SQLite `changes()` or an equivalent transaction-scoped condition must be verified in D1. If either operation fails, both must roll back.
4. Repeated/concurrent requests must not create additional decision events or send another decision email.
5. Read audit history only after the same administrator authentication, with bounded pagination and no-store response headers.
6. Treat email delivery separately from decision atomicity: an email provider failure must be visible for operational recovery, not silently retried as another decision.

## Required tests before merge
- Synthetic pending application -> one status transition and one matching audit event.
- Duplicate/concurrent submissions -> exactly one decision event and no duplicate send.
- Missing application or already-reviewed application -> 409 and no event.
- Simulated audit insert failure -> status remains pending and no email.
- Unauthorized/forged token, wrong origin, invalid JSON -> no writes.
- Audit history cannot be fetched without administrator authorization.
- Email failure after a successful decision -> decision/event remain consistent and notification failure is surfaced.
- Run tests against an isolated D1 database with Resend disabled/mocked; never click through real production decisions.

## Release gates
- Confirm which D1 binding contains `ape_businesses`; inspect its current schema and backup/recovery status.
- Review and test the migration against isolated D1, including rollback behavior.
- Verify deployed Cloudflare Pages runtime behavior and Access policies.
- Apply production migration only after an explicit deployment approval and a verified backup.
- No production migration or decision email is authorized by this design PR.
