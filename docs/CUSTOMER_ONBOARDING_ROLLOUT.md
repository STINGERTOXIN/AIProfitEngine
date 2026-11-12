# AI Profit Engine — Customer onboarding and portal rollout

## Current state (November 2026)
- Administrator dashboard uses Cloudflare Access and a server-side verified admin identity.
- Pilot applications and decision notification emails work.
- Pilot approval is **not** customer account creation.
- `migrations/0002_ape_leadflow.sql` defines tenant-aware account, lead, follow-up, and billing tables. Confirm whether this migration has been applied to production D1 before relying on it.

## Security requirements before enabling customer access
1. Create a **separate** Cloudflare Access self-hosted application for `aiprofitengine.ai/customer/*` and `aiprofitengine.ai/api/customer/*`. Do not reuse the admin application's audience.
2. Configure an identity provider / login method suitable for customers, and explicitly verify that an unauthorized user cannot access a customer route.
3. Set `CUSTOMER_ACCESS_AUD` to the customer application's Access audience. The backend must validate the JWT signature, issuer, audience, expiry and verified email on every request.
4. Map the verified email to an active, provisioned `ape_accounts.owner_email` record. Never accept an account ID or email from browser input as proof of identity.
5. Query every lead and follow-up with a server-derived account ID and use account-scoped mutations. Cross-account access tests are mandatory.
6. Use HTTPS, no-store responses, CSRF protections for state-changing endpoints, input validation, and rate limiting.
7. Do not activate the customer portal until the backend and Access policy have been tested together. A static page alone is not authentication.

## Proposed approval-to-onboarding flow
1. An applicant submits the pilot form; its record remains pending.
2. Admin approves an application. Existing approval email still confirms review only.
3. An admin-only provisioning action checks the approved application and verified contact email, creates the tenant account idempotently, and records the application/account linkage. No automatic access until this step succeeds.
4. Send a transactional onboarding invitation with a link to the protected customer portal; do not email passwords or secrets.
5. Customer signs in through the customer-specific Cloudflare Access application. The backend independently validates identity and tenant membership.
6. The customer sees only their own account, leads, and follow-up tasks.
7. Enable sending follow-up messages only after consent, sender-domain verification, and review controls are in place.

## Implementation milestones
- [x] Existing tenant-aware schema draft committed (`0002_ape_leadflow.sql`).
- [ ] Confirm production D1 migration state and test on staging.
- [ ] Configure customer-specific Cloudflare Access app and policy.
- [ ] Implement verified customer identity middleware and account lookup.
- [ ] Add authenticated `/api/customer/me` and account-scoped lead APIs.
- [ ] Add customer portal UI with real authenticated API state.
- [ ] Add admin-only idempotent provisioning and invitation email.
- [ ] Test unauthorized access, tenant isolation, duplicate approval, email mismatch, and account suspension.
- [ ] Enable a limited pilot for one test account, then expand.

## Rollout guardrail
Do **not** expose subscriber or pilot applicant records in the customer portal. Those are administrator-only. Keep admin routes protected under their existing Cloudflare Access application.
