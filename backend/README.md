# A.P.E. secure inquiry backend (not deployed)

This is a starter backend, **not a functioning public contact form**. GitHub Pages cannot execute this Worker. Do not collect real customer information through the demo.

## Required setup
1. Create a free Cloudflare account, a D1 database, and a Worker.
2. Apply `schema.sql` to the D1 database and bind it to the Worker as `DB`.
3. Create a Cloudflare Turnstile widget for your public site, configure the site key on the frontend, and set its secret as the Worker secret `TURNSTILE_SECRET`.
4. Set `ALLOWED_ORIGIN` to the exact browser origin (e.g. `https://stingertoxin.github.io` for GitHub Pages; origins have no path).
5. Deploy `worker.js` to the Worker and configure the website form endpoint.
6. Add a secure authenticated administration workflow for reading and deleting inquiries. **Never expose the D1 database or submissions in a public repository or unauthenticated endpoint.**
7. Publish a real privacy notice (purpose, retention, contact, data deletion requests) and decide how long to retain submissions before enabling the form.
8. Set up owner notifications with a verified destination and a provider. No email notifications or autoresponder are implemented in this starter.

## Security notes
- Cloudflare Turnstile is verified server-side. Origin checks are defense in depth, not authentication.
- Restrict Worker access to the intended route; add rate limiting, logging that excludes personal data, and operational monitoring before launch.
- A real production form must be tested end-to-end before displaying a public submission button.
- Do not commit secrets, credentials, or customer submissions.
