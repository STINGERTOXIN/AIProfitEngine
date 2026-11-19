# Phase 7 — D1 transaction integration gate

Status: **not yet verified against Cloudflare D1**. The earlier SQLite unit tests do not prove D1 behavior.

## Safety requirements

- Do not run these experiments against production `ai-profit-engine-db`.
- Create a disposable D1 database and bind it to a separate preview/test Worker as `BUSINESS_DB`.
- Do not enable `ADMIN_REVIEW_AUDIT_ENABLED` in production.
- Do not use live applicant emails or a live Resend API key in the test environment.
- Apply the existing `migrations/phase7_review_audit_events.sql` only to the disposable database.
- Confirm the preview Worker is bound to the disposable database before testing. Preview Pages deployments may inherit production bindings; a preview URL by itself is **not** isolation.

## Contract under test

The current handler in `functions/api/admin/subscribers.js` calls `BUSINESS_DB.batch` with:

```sql
UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending';
INSERT INTO ape_application_review_events
  (application_id, actor_email, old_status, new_status)
  SELECT ?, ?, 'pending', ? WHERE changes() = 1;
```

**Critical open question:** verify whether D1's `batch` API preserves the SQLite `changes()` value across the two prepared statements. If it does not, do not enable the flag. Replace the dependency with a D1-supported, explicitly verified atomic design.

## Test matrix (disposable database only)

1. **Success:** insert one pending application; run the actual handler or the exact two prepared statements through D1 `batch`. Expect status approved and exactly one matching audit row.
2. **Duplicate:** repeat the same approval. Expect conflict, unchanged status, and no second audit row.
3. **Missing ID:** attempt an unknown ID. Expect no application or audit changes.
4. **Audit failure rollback:** force a database constraint failure on the audit insert. Expect the pending status to remain pending and no audit row.
5. **Rejection:** repeat success on a new pending record with rejected status. Expect one rejected audit event.
6. **Authorization:** absent, malformed, expired, wrong-audience, and wrong-email Access assertions must fail before D1 writes.
7. **Origin and payload:** cross-origin POST, invalid status, and oversized JSON must fail before D1 writes.
8. **Email sequencing:** verify no Resend request on failed/duplicate decisions; only a successful committed decision can attempt a notification.

After every case, query both tables and record actual row counts and statuses. A successful HTTP response alone is insufficient evidence.

## Release gates

- [ ] Disposable D1 environment and bindings verified
- [ ] All transaction and rollback cases pass on D1 (not just SQLite)
- [ ] Authentication and request-validation cases pass
- [ ] Email behavior verified with a stub or sandbox
- [ ] No production D1 data changed
- [ ] Test evidence attached to PR
- [ ] Production rollout separately reviewed; flag remains off until then

If the `changes()` assumption fails, stop deployment and fix the implementation in a separate reviewed commit. Do not substitute an unguarded update plus insert.
