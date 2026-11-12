# AI Profit Engine — Automation-first launch checklist

Status: planning and incremental implementation. No paid customer product is live yet.

## Gate 1: dependable inbound communications
- Verify that hello@aiprofitengine.ai can receive and send messages using a real external test inbox.
- Verify Cloudflare DNS MX/SPF/DKIM/DMARC against the actual mailbox provider.
- Test Resend with a fresh opted-in address; check delivery and error logs.
- Add unsubscribe processing and suppression before marketing sequences.
- Keep application email marked unverified until tested. Pilot page links to the existing early-access form as primary interest capture.

## Gate 2: secure product foundation
- Implement server-side authenticated business accounts and business-level data isolation.
- Create D1 migrations for organizations, members, leads, lead events, follow-up drafts, consent, and audit history.
- Authorize every query by organization; never trust client-supplied organization IDs.
- Rate-limit endpoints, validate inputs, minimize retention, implement deletion/export.
- Keep Cloudflare Access protection and admin JWT checks on administrator routes; never reuse administrator endpoints for customers.
- Test cross-tenant access, unauthenticated access, and login/logout before live customer data.

## Gate 3: customer workflow
- Capture leads from an authenticated dashboard and optional consent-aware form.
- Generate follow-up drafts using an AI API with server-side secret and budget limits.
- Require human review/approval before sending until the business has verified consent, compliance and sending reputation.
- Store delivery and failure statuses; queue retries safely without duplicates.

## Gate 4: subscription and affiliates
- Integrate subscription billing only after product tests; use payment provider hosted checkout and verified webhooks.
- Handle cancellation, retries, invoices and access expiration.
- Add vetted, clearly disclosed affiliate recommendations; do not claim unverified results.

## Gate 5: automation and owner oversight
- Automate opt-in acknowledgments, lead assignment, follow-up reminders, billing receipts, monitoring and daily summaries.
- Escalate refunds, complaints, ambiguous requests, security alerts, consent questions and low-confidence AI output.
- Add a daily owner digest with signups, qualified leads, paid conversions, failed jobs and exceptions.
- Measure conversion and churn before spending on ads.

## Deployment rules
- Never store secrets in GitHub. Use Cloudflare secrets and bindings.
- Keep administrator subscriber API protected by Cloudflare Access and server-side verification.
- Do not treat a successful deployment as proof of working email, payments or security.
- Start with test users and fictional leads; use real customer information only after authentication and privacy controls are validated.
