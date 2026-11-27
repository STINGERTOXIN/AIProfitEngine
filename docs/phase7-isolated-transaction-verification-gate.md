# Phase 7: isolated D1 transaction verification gate

This is a **test plan**, not evidence that the tests have passed. Do not run against production or use a production D1 binding. Keep Resend disabled/mocked.

## Existing implementation
`functions/api/admin/subscribers.js` uses `BUSINESS_DB.batch([UPDATE, INSERT ... WHERE changes() = 1])`. D1 documents batch execution as transactional. The application also checks both result metadata after batch completion. **A post-batch JavaScript exception cannot undo a committed batch.** The correctness of the `changes()` condition and metadata must be established on the target D1 runtime.

## Preconditions
1. Create a separate disposable D1 database, never `ai-profit-engine-db` or `ape-subscribers`.
2. Apply the exact application and audit schemas from repository migrations to the disposable database only.
3. Use a distinct test deployment or local Wrangler environment with its `BUSINESS_DB` bound exclusively to that disposable database; no production secrets, no Resend API key, no real applicant addresses.
4. Record Wrangler version, database identifier, migration hashes, and results in the PR.

## Tests (all mandatory)
- Seed a synthetic pending application. Execute the **same prepared UPDATE and INSERT in one D1 batch** as the application code. Assert update changes=1, audit changes=1, final status approved, exactly one matching audit event.
- Repeat the batch with the same ID. Assert update changes=0, audit changes=0, exactly one existing event. API response should be 409 and send count remain zero.
- Issue two concurrent review requests for the same synthetic pending ID. Assert exactly one success, one conflict, one event, one mocked notification attempt.
- Force audit INSERT failure (for example, create an isolated trigger that aborts audit insertion). Assert the whole batch rejects, status stays pending, event count zero, send count zero.
- Test nonexistent ID and already-final ID; both must return 409 with no new event or email.
- Test forged/expired/wrong-audience Access tokens, wrong Origin, invalid JSON; assert no writes. Ensure unauthorized audit-history GET is rejected with no-store headers.
- Mock Resend failure after a committed decision. Assert decision and event remain, failure is reported, and retrying the decision returns 409 without a second send.
- Confirm an audit-history GET exists, is authenticated, paginated with strict bounds, and no-store; otherwise mark this requirement incomplete.

## Release blocker
Do **not** enable review decisions merely because `ADMIN_REVIEW_AUDIT_ENABLED=true` is present. The currently deployed flag must be turned off until the above tests pass and an explicit deployment approval is given. A setting displayed in the Cloudflare UI does not establish that the runtime tests passed.

## Review notes
- Confirm `changes()` reflects the immediately preceding UPDATE on the same D1 batch connection. Do not substitute an unbound SQL console statement with `?` placeholders; the console does not supply prepared-statement bindings.
- If metadata ever reports an UPDATE succeeded but audit insert did not, treat that as a failed release gate. A JavaScript throw after `batch()` cannot restore atomicity.
- No production SQL, real application decision, or email is authorized by this document.
