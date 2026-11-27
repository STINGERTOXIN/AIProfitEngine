# Cloudflare scheduled recovery evidence — 2026-11-25

Source: operator-provided Cloudflare dashboard screenshots, not an independent API inspection.

- Test Worker: `ape-phase8-invitation-test`, active version `c70b067a`.
- D1 binding `DB` points to `ape-phase8-test-db`.
- Cron `*/5 * * * *`; scheduled invocation at 19:20:48 CST reported outcome `ok`.
- Operator simulated an expired processing lease for synthetic application 1. D1 subsequently showed status `failed`, attempts 2, both lease fields NULL, and `last_error_code=interrupted_delivery_review`.
- Matching scheduled application log: `test=phase8-invitation-recovery`, `recovered=1`, `emails_sent=0`. Observability showed 24 successful log events and zero errors in the displayed hour.

Result: PASS for isolated scheduled expired-lease quarantine. This is not evidence of live provider delivery, full production Worker execution, or end-to-end onboarding. The test Worker intentionally does not send email.

## Closeout and release gates
- Remove the temporary test Worker's cron trigger and save; verify no trigger remains. Preserve test evidence.
- Verify current PR checks and review migration compatibility and production bindings before any production migration.
- Keep production invitation and recovery flags disabled until isolated end-to-end tests and controlled delivery verification are complete.
- Do not reset ambiguous delivery jobs or backfill historical customers automatically.
