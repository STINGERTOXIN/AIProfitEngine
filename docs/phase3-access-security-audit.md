# Phase 3 — Cloudflare Access security verification

## Objective
Verify that the subscriber dashboard and its underlying API cannot be accessed without an authorized Cloudflare Access session. **A protected HTML page alone does not protect its API.**

## Scope and safety
- Do not change production DNS, Access policies, Workers routes, or credentials as part of this audit.
- Do not put tokens, one-time codes, subscriber records, or API responses in issues or screenshots.
- Treat any unauthenticated access to subscriber data as a release blocker.

## Manual verification checklist
1. In Cloudflare Zero Trust, inspect the Access application hostname and path. Confirm they match the actual production dashboard URL (including `/dashboard` versus `/dashboard.html`) and all relevant aliases.
2. Confirm the policy is **Allow** for only intended identities and that the application is enabled. Check whether a broader Bypass policy or another overlapping application takes precedence.
3. In a fresh private/incognito browser with no Access cookies, open the **exact production dashboard URL**. Expected: Access login/one-time PIN or an explicit deny; never subscriber data.
4. Still unauthenticated, directly request the actual subscribers API URL (identified from the dashboard's Network tab). Expected: denied before any private data is returned. If the API is hosted on a different hostname, protect that hostname independently or enforce authorization inside the Worker.
5. Authenticate with an allowed identity; confirm dashboard and API work. Sign out and repeat the unauthenticated checks.
6. Test an identity that is not allowed, if available. Expected: denied.
7. Record only the tested hostnames, paths, HTTP status codes, redirect-to-login behavior, and pass/fail outcome. Redact private data.

## Stop conditions
If the dashboard or API exposes subscriber information without authentication, stop the rollout and restrict the affected endpoint immediately using Cloudflare Access and/or server-side authorization. Do not assume hiding navigation links provides security.

## Follow-up
Once protection is confirmed, add failure alerting for backup jobs and subscriber/webhook delivery. Keep secrets in platform secret stores, never in repository files.
