# A.P.E. Lead Flow — hosted rollout checklist

Current production `/followup` is a browser-only fictional-data prototype. Do not put real customer personal information into it.

## Phase 1: secure foundation (not yet enabled)
1. Back up the existing production D1 database and verify its database binding name in Cloudflare Pages.
2. Apply `migrations/0002_ape_leadflow.sql` to the bound D1 database using Cloudflare's D1 console or Wrangler, after reviewing the SQL. This migration does not modify `subscribers`.
3. Implement customer authentication with verified identity tokens and account membership checks on every API request. Never accept `account_id` from a browser as authorization. Fail closed on missing configuration.
4. Implement server-side tenant-scoped CRUD for leads and follow-ups, with input validation, pagination, rate limits, audit logs and retention/deletion controls.
5. Add CSRF protection if using cookies; avoid storing bearer tokens in localStorage. Add secure response headers and no-store for personal data.
6. Test isolation using two separate customer accounts and negative tests for cross-account access.

## Phase 2: opt-in automation (not yet enabled)
1. Connect a verified outbound email provider, with per-customer consent, verified sender identity, suppression and unsubscribe handling.
2. Create an idempotent scheduled delivery Worker (cron), using approved follow-ups only, atomic claim/lease logic, retry limits and deduplication.
3. Record delivery events; alert the owner on failures. Never auto-send unreviewed AI-generated messages.
4. Start with test addresses and a small pilot; only enable real customer sending after deliverability and compliance checks.

## Phase 3: subscription billing (not yet enabled)
1. Choose payment processor and configure a test-mode product, checkout and billing portal.
2. Verify webhook signatures and event replay/idempotency. Grant access based on verified billing state, not redirect URLs.
3. Test trial, payment failure, cancellation and refund behavior before switching to live payments.

## Operational principle
Aim for automated signup, onboarding, scheduling, delivery, billing and alerts. Keep explicit owner approval for exceptions and risky outbound content. No guarantee of hands-off operation or revenue.
