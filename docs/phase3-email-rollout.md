# Phase 3 — email automation rollout

## Current behavior
- A newly consented early-access signup is stored in D1 after Turnstile verification.
- The existing signup handler attempts one welcome email via Resend for a newly inserted row only.
- A separate optional owner notification is sent when the welcome request succeeds.
- Duplicate signups do not trigger new welcome emails.

## Configuration (Cloudflare Pages environment)
- `RESEND_API_KEY` (secret): active Resend API key.
- `RESEND_FROM_EMAIL`: verified sender, for example `AI Profit Engine <welcome@aiprofitengine.ai>`.
- `SUBSCRIBER_NOTIFICATION_EMAIL` (optional): destination for owner signup notices.
- Existing D1 and Turnstile bindings remain required.

Never commit secrets or customer email addresses to GitHub.

## Before enabling scheduled follow-ups
1. Implement a signed, one-click unsubscribe endpoint and persistent suppression status.
2. Add accurate mailing address and unsubscribe instructions to all marketing emails.
3. Add a D1-backed email outbox with delivery state, idempotency keys, retry limits, and Resend webhook verification.
4. Add explicit timing and consent-based targeting, plus rate limits and test-mode sending.
5. Test opt-out, retries, duplicate signups, bounced mail, and unsubscribe handling before any bulk sending.

**No scheduled follow-up sending is enabled by this change.** No existing subscriber is emailed by merging this PR.

## Manual smoke test
- Set environment variables in a non-production Pages deployment.
- Submit one new consented test signup; confirm D1 insert and Resend acceptance.
- Submit the same address again; confirm no second welcome email.
- Verify owner notification only when configured.
- Temporarily unset the sender; confirm signup still persists and no email request is made.
- Review Cloudflare logs for delivery failures without logging secrets.
