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
// Read at most maxBytes, including streams with absent or incorrect Content-Length.
// A deadline applies to every read, not only to response headers.
async function readBounded(stream, maxBytes, signal) {
  if (!stream) throw Error('Missing stream');
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  let completed = false;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(Error('Stream deadline exceeded'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, {once: true});
  });
  try {
    while (true) {
      const {done, value} = await (signal ? Promise.race([reader.read(), aborted]) : reader.read());
      if (done) { completed = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw Error('Stream size exceeded');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (!completed) {
      // Do not await cancellation: a stalled upstream must not hold this request.
      void reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}
async function authorized(request, env) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const aud = String(env.ACCESS_AUD || '');
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !aud || !email) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  // Reject oversized or malformed assertions before parsing or fetching signing keys.
  if (!token || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0].length > 2048 || parts[1].length > 4096) return false;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decode64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode64url(parts[1])));
  } catch { return false; }
  if (!header || typeof header !== 'object' || Array.isArray(header) ||
      !claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256 ||
      claims.iss !== 'https://' + domain ||
      !((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(aud)) ||
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now ||
      (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) ||
      typeof claims.email !== 'string' || claims.email.toLowerCase() !== email) return false;
  // Bound the external signing-key lookup so unavailable Access infrastructure
  // fails closed instead of tying up a worker request indefinitely.
  let certResponse;
  const deadline = AbortSignal.timeout(5000);
  try {
    certResponse = await fetch('https://' + domain + '/cdn-cgi/access/certs', {
      redirect: 'manual', signal: deadline
    });
  } catch {
    return false;
  }
  // Never follow redirects when fetching Cloudflare Access signing keys.
  if (certResponse.status >= 300 && certResponse.status < 400) return false;
  if (!certResponse.ok) return false;
  // Treat malformed, oversized, or unusable JWKS as an authentication failure.
  // No database access occurs unless a valid signing key verifies the assertion.
  try {
    const rawKeys = new TextDecoder('utf-8', {fatal: true}).decode(
      await readBounded(certResponse.body, 65536, deadline)
    );
    const keys = JSON.parse(rawKeys);
    if (!keys || !Array.isArray(keys.keys)) return false;
    const jwk = keys.keys.find(key =>
      key && key.kid === header.kid && key.kty === 'RSA' &&
      (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk,
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
      decode64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch {
    return false;
  }
}
export async function onRequestGet({request, env}) {
  if (env.ADMIN_SUBSCRIBERS_ENABLED !== 'true')
    return reply({error:'Subscriber administration temporarily unavailable pending security verification.'}, 503);
  if (!env.DB || !env.BUSINESS_DB || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    return reply({error:'Subscriber administration is not fully configured.'}, 503);
  try {
    if (!await authorized(request, env))
      return reply({error:'Administrator authentication required.'}, 403);
    // Temporary, read-only diagnostic. Requires the same verified administrator JWT
    // as the subscriber API. Never disclose the configured value or any secrets.
    if (new URL(request.url).searchParams.get('audit_diagnostic') === '1') {
      const flag = env.ADMIN_REVIEW_AUDIT_ENABLED;
      const state = flag === undefined ? 'missing'
        : flag === 'true' ? 'enabled'
        : typeof flag !== 'string' ? 'unexpected_type'
        : flag.trim() === 'true' ? 'whitespace'
        : flag.toLowerCase() === 'true' ? 'case_mismatch'
        : 'disabled_or_other';
      return reply({auditFlagState: state, auditDatabaseBound: Boolean(env.BUSINESS_DB)});
    }
    const [totals, recent, applications] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last30
        FROM subscribers`).first(),
      env.DB.prepare('SELECT email, status, created_at FROM subscribers ORDER BY created_at DESC, id DESC LIMIT 100').all(),
      env.BUSINESS_DB.prepare('SELECT id, business_name, contact_email, plan, status, created_at FROM ape_businesses ORDER BY id DESC LIMIT 100').all()
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
  if (env.ADMIN_SUBSCRIBERS_ENABLED !== 'true' || !env.BUSINESS_DB || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    return reply({error:'Administrator controls are not configured.'}, 503);
  try {
    if (!await authorized(request, env)) return reply({error:'Administrator authentication required.'}, 403);
    if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json'))
      return reply({error:'JSON request required.'}, 415);
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin)
      return reply({error:'Request origin rejected.'}, 403);
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 2048)
      return reply({error:'Request too large.'}, 413);
    let raw;
    try {
      const bytes = await readBounded(request.body, 2048, AbortSignal.timeout(5000));
      raw = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
      return reply({error:'Request too large or invalid encoding.'}, 413);
    }
    let body;
    try { body = JSON.parse(raw); }
    catch { return reply({error:'Invalid JSON request.'}, 400); }
    const id = body?.id;
    const status = body?.status;
    if (!Number.isSafeInteger(id) || id <= 0 || !['approved','rejected'].includes(status))
      return reply({error:'Invalid application or status.'}, 400);
    // Fail closed until the audit migration is applied and explicitly enabled.
    // Do not permit unaudited application decisions during rollout.
    if (env.ADMIN_REVIEW_AUDIT_ENABLED !== 'true')
      return reply({error:'Application review temporarily unavailable pending audit verification.'}, 503);
    // D1 batch executes on one SQLite connection in a transaction. The second
    // statement observes changes() from the conditional UPDATE, so it writes
    // an audit event only for a successful pending-to-final transition.
    // An INSERT error rolls the entire batch back, including the UPDATE.
    const [transition, audit] = await env.BUSINESS_DB.batch([
      env.BUSINESS_DB.prepare(
        "UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending'"
      ).bind(status, id),
      env.BUSINESS_DB.prepare(
        "INSERT INTO ape_application_review_events (application_id, actor_email, old_status, new_status) SELECT ?, ?, 'pending', ? WHERE changes() = 1"
      ).bind(id, String(env.ADMIN_EMAIL).trim().toLowerCase(), status)
    ]);
    if (transition.meta?.changes !== 1)
      return reply({error:'Application is no longer pending or does not exist. Refresh to see its status.'}, 409);
    if (audit.meta?.changes !== 1)
      throw Error('Audit event was not recorded; review transaction cannot be confirmed.');
    // Send a transactional decision notice only after the database update succeeds.
    // Email delivery requires a verified Resend sender configured as RESEND_FROM_EMAIL.
    let email = {sent:false, reason:'Email notification is not configured.'};
    const sender = String(env.RESEND_FROM_EMAIL || '').trim();
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    if (sender && apiKey) {
      try {
        const applicant = await env.BUSINESS_DB.prepare(
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
