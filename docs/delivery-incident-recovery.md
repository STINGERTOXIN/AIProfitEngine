# A.P.E. delivery reconciliation incident runbook

## What the audit does
The GitHub Actions workflow `.github/workflows/delivery-reconciliation-audit.yml` runs daily at 15:45 UTC and can be dispatched manually. Scheduled runs query the production `/api/delivery-audit` endpoint. Manual runs default to **dry run**, which uses synthetic counters and does not query production. A green workflow means the audit completed; review its **Mode** and counters before claiming production health.

## Triage an alert
1. Open the linked GitHub Actions run and read the **Mode** and all five counters: `total`, `pendingUnresolved`, `missingProviderId`, `deliveryUnconfirmed`, `negativeDelivery`.
2. If the mode is **SIMULATION**, treat the incident as a test. Do not modify production records. Confirm the issue title begins `TEST:` for a synthetic unresolved-record alert.
3. If the mode is **PRODUCTION**, inspect Cloudflare request logs and D1 records using the least-privileged administrative access. Do not paste customer addresses, tokens, or webhook payloads into public issues.
4. Match the affected record's `provider_email_id` to the corresponding Resend message and event history. Check whether the message was accepted, delivered, bounced, complained about, or has an unknown outcome. Distinguish an internal reminder from a customer follow-up.
5. Document the finding in the issue without personal data, including the workflow run URL, affected count, and next action. Escalate webhook/authentication failures and unexplained missing IDs.

## Duplicate-prevention rules
- **Never blindly resend** an email whose delivery outcome is uncertain, including a `pending` row left after a timeout.
- A successful API response or accepted send is **not** proof of inbox delivery.
- Resend idempotency keys may expire; do not assume a retry days later is duplicate-safe.
- Do not delete a pending claim, clear a send record, or reset a customer follow-up status merely to force another attempt.
- Respect unsubscribed, bounced, and complained recipients. Do not re-enable opt-in without a new valid consent event.
- Any repair that changes production D1 records must be reviewed, backed up, scoped to verified message IDs, and checked for concurrent scheduled jobs.

## Safe verification of GitHub incident reporting
1. In **Actions → APE delivery reconciliation audit → Run workflow**, choose `main`.
2. Keep **Check parsing and summary without calling production** checked (`dry_run=true`).
3. Check **Dry run only: simulate one unresolved record and test incident creation** (`test_issue_alert=true`).
4. Run the workflow. Confirm the log says `Audit mode: SIMULATION`, reports `missingProviderId=1`, and the **Open or update unresolved delivery issue** step runs.
5. Verify GitHub created or updated the issue titled `TEST: A.P.E. unresolved email delivery records`. Close the test issue after confirming the result.
6. Do not enable `test_issue_alert` with `dry_run=false`; the workflow intentionally refuses that combination.

## Scheduled-run verification
After the next 15:45 UTC schedule, confirm a run whose **Event** is `schedule` (not `workflow_dispatch`), that its log says **PRODUCTION**, and that counters are valid. GitHub's schedule is best effort and can be delayed. If no scheduled run appears, investigate Actions settings, the default branch, and workflow status before claiming unattended monitoring is operational.

## Recovery and closure
For an actual issue, close only after the provider outcome is verified, the underlying cause is fixed, and a subsequent **PRODUCTION** audit reports the expected counters. For a simulated issue, close after checking the issue-creation path. Record any unresolved unknown-delivery cases for manual investigation rather than attempting automatic resend.
