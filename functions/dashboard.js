// Server-side gate for the canonical /dashboard URL.
// Cloudflare Access must still protect /dashboard, /dashboard/* and /api/admin/*
// at the edge. This is an independent, fail-closed defense in depth.
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
const deny = (status, message) => new Response(message, {
  status, headers: {...headers, 'Content-Type': 'text/plain; charset=utf-8'}
});
function base64url(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function verify(request, env) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
      !env.ACCESS_AUD || !env.ADMIN_EMAIL) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64url(parts[1])));
  } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid ||
      typeof payload.exp !== 'number' || payload.exp <= now ||
      (typeof payload.nbf === 'number' && payload.nbf > now) ||
      payload.iss !== 'https://' + domain ||
      !(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(env.ACCESS_AUD) ||
      String(payload.email || '').toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) return false;
  const response = await fetch('https://' + domain + '/cdn-cgi/access/certs');
  if (!response.ok) return false;
  const jwks = await response.json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk,
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    base64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
}
export async function onRequestGet({request, env}) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    return deny(503, 'Private dashboard unavailable: administrator authentication is not configured.');
  try {
    if (!await verify(request, env))
      return deny(403, 'Private dashboard: authentication required. Contact the administrator.');
    // The subscriber API has a separate emergency lock; never bypass it here.
    const asset = await env.ASSETS.fetch(new URL('/dashboard.html', request.url));
    if (!asset.ok) return deny(503, 'Dashboard temporarily unavailable.');
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  } catch (error) {
    console.error('Dashboard authentication failed', String(error));
    return deny(503, 'Private dashboard temporarily unavailable.');
  }
}
