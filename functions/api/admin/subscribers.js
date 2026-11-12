// Private subscriber API. Cloudflare Access must protect /api/admin/* at the edge.
// Independently verify the Access JWT before reading D1. Disabled until the
// administrator explicitly enables it after confirming edge protection.
const secureHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
const reply = (body, status = 200) => Response.json(body, {status, headers: secureHeaders});
function decode64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function authorized(request, env) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const aud = String(env.ACCESS_AUD || '');
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !aud || !email) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decode64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode64url(parts[1])));
  } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.iss !== 'https://' + domain ||
      !((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(aud)) ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      (typeof claims.nbf === 'number' && claims.nbf > now) ||
      String(claims.email || '').toLowerCase() !== email) return false;
  const certResponse = await fetch('https://' + domain + '/cdn-cgi/access/certs', {redirect: 'manual'});
  // Never follow redirects when fetching Cloudflare Access signing keys.
  if (certResponse.status >= 300 && certResponse.status < 400) return false;
  if (!certResponse.ok) return false;
  const keys = await certResponse.json();
  const jwk = (keys.keys || []).find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk,
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    decode64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
}
export async function onRequestGet({request, env}) {
  if (env.ADMIN_SUBSCRIBERS_ENABLED !== 'true')
    return reply({error:'Subscriber administration temporarily unavailable pending security verification.'}, 503);
  if (!env.DB || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    return reply({error:'Subscriber administration is not fully configured.'}, 503);
  try {
    if (!await authorized(request, env))
      return reply({error:'Administrator authentication required.'}, 403);
    const [totals, recent, applications] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last30
        FROM subscribers`).first(),
      env.DB.prepare('SELECT email, status, created_at FROM subscribers ORDER BY created_at DESC, id DESC LIMIT 100').all(),
      env.DB.prepare('SELECT id, business_name, contact_email, plan, status, created_at FROM ape_businesses ORDER BY id DESC LIMIT 100').all()
    ]);
    return reply({
      total: Number(totals?.total || 0),
      last7: Number(totals?.last7 || 0),
      last30: Number(totals?.last30 || 0),
      recent: (recent.results || []).map(({email, status, created_at}) => ({email, status, created_at})),
      applications: (applications.results || []).map(({id, business_name, contact_email, plan, status, created_at}) => ({id, business_name, contact_email, plan, status, created_at}))
    });
  } catch (error) {
    console.error('Private subscriber API failed:', String(error));
    return reply({error:'Subscriber administration temporarily unavailable.'}, 503);
  }
}

export async function onRequestPost({request, env}) {
  if (env.ADMIN_SUBSCRIBERS_ENABLED !== 'true' || !env.DB || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    return reply({error:'Administrator controls are not configured.'}, 503);
  try {
    if (!await authorized(request, env)) return reply({error:'Administrator authentication required.'}, 403);
    if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json'))
      return reply({error:'JSON request required.'}, 415);
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin)
      return reply({error:'Request origin rejected.'}, 403);
    const raw = await request.text();
    if (raw.length > 2048) return reply({error:'Request too large.'}, 413);
    const body = JSON.parse(raw);
    const id = body?.id;
    const status = body?.status;
    if (!Number.isSafeInteger(id) || id <= 0 || !['approved','rejected'].includes(status))
      return reply({error:'Invalid application or status.'}, 400);
    const result = await env.DB.prepare(
      "UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending'"
    ).bind(status, id).run();
    if (result.meta?.changes !== 1) return reply({error:'Application is no longer pending or does not exist. Refresh to see its status.'}, 409);
    // Send a transactional decision notice only after the database update succeeds.
    // Email delivery requires a verified Resend sender configured as RESEND_FROM_EMAIL.
    let email = {sent:false, reason:'Email notification is not configured.'};
    const sender = String(env.RESEND_FROM_EMAIL || '').trim();
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    if (sender && apiKey) {
      try {
        const applicant = await env.DB.prepare(
          'SELECT business_name, contact_email FROM ape_businesses WHERE id = ?'
        ).bind(id).first();
        if (applicant && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(applicant.contact_email || ''))) {
          const approved = status === 'approved';
          const subject = approved ? 'AI Profit Engine — Pilot application approved' : 'AI Profit Engine — Pilot application update';
          const bodyText = approved
            ? `Hello,\n\nYour AI Profit Engine pilot application for ${applicant.business_name || 'your business'} has been approved for review. We will contact you with next steps when onboarding is available. Approval does not create an account or activate a paid service.\n\nAI Profit Engine`
            : `Hello,\n\nThank you for applying to the AI Profit Engine pilot for ${applicant.business_name || 'your business'}. We are unable to accept this application at this time.\n\nAI Profit Engine`;
          const mailResponse = await fetch('https://api.resend.com/emails', {
            method:'POST',
            headers:{Authorization:'Bearer ' + apiKey,'Content-Type':'application/json'},
            body:JSON.stringify({from:sender,to:[applicant.contact_email],subject,text:bodyText})
          });
          if (mailResponse.ok) {
            const receipt = await mailResponse.json();
            email = {sent:true, id:receipt.id || null};
          } else {
            console.error('Resend decision notification failed with status:', mailResponse.status);
            email = {sent:false,reason:'Email provider rejected the notification.'};
          }
        } else {
          email = {sent:false,reason:'Application contact email is invalid.'};
        }
      } catch (mailError) {
        console.error('Decision email failed:', String(mailError));
        email = {sent:false,reason:'Email notification could not be sent.'};
      }
    }
    return reply({ok:true,id,status,email});
  } catch (error) {
    console.error('Application status update failed:', String(error));
    return reply({error:'Unable to update application.'}, 503);
  }
}
