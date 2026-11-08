export async function onRequestGet({ env }) {
 const ready = Boolean(env.DB && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
 return Response.json({ ready, siteKey: ready ? env.TURNSTILE_SITE_KEY : null }, { headers: { 'Cache-Control': 'no-store' } });
}
