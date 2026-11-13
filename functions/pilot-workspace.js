// Private, read-only pilot workspace. Never serve customer details without a valid session.
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=(status,message)=>new Response(message,{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
async function hash(value){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export async function onRequestGet({request,env}){
 if(!env.DB||!env.AUTH_SECRET||String(env.AUTH_SECRET).length<32)return fail(503,'Pilot workspace is not configured.');
 try{
  const value=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ape_pilot_session='))?.slice('ape_pilot_session='.length);
  if(!value||!/^[a-f0-9-]{72}$/.test(value))return Response.redirect(new URL('/pilot-login.html',request.url),302);
  const session=await env.DB.prepare('SELECT email FROM ape_login_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(value),Math.floor(Date.now()/1000)).first();
  if(!session)return Response.redirect(new URL('/pilot-login.html',request.url),302);
  const business=await env.DB.prepare("SELECT id,business_name,contact_email FROM ape_businesses WHERE lower(contact_email)=? AND status='approved' ORDER BY id DESC LIMIT 1").bind(String(session.email).toLowerCase()).first();
  if(!business)return fail(403,'Your pilot access is not currently approved.');
  const name=escapeHTML(business.business_name),email=escapeHTML(session.email);
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pilot Workspace | AI Profit Engine</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0%,#35131d,#090b10 60%);color:#f7f7fa;font:16px/1.6 system-ui,sans-serif}main{max-width:900px;margin:6vh auto;padding:24px}.eyebrow{color:#ff8991;letter-spacing:.16em;font-weight:800}h1{font-size:clamp(34px,6vw,58px);line-height:1.15}p{color:#c1c3ce}.card{padding:28px;background:#181a25;border:1px solid #404350;border-radius:16px;margin:20px 0}.status{color:#9ce4ba;font-weight:800}a{color:#ff8991}.muted{font-size:14px}</style></head><body><main><p class="eyebrow">A.P.E. · APPROVED PILOT</p><h1>Welcome, ${name}</h1><p>You're securely signed in to your AI Profit Engine pilot workspace.</p><div class="card"><p class="status">✓ Approved pilot access</p><p><strong>Business:</strong> ${name}</p><p><strong>Account email:</strong> ${email}</p><p>Your application is approved. We're preparing the first pilot tools and will share next steps as they become available.</p></div><div class="card"><h2>What's next?</h2><p>Lead tracking and follow-up tools are still being developed. No customer records or live automation are available in this workspace yet.</p><p class="muted">This is a private onboarding preview, not an active paid service.</p></div><p><a href="/pilot-login.html">Account and sign out</a> · <a href="/">Main website</a></p></main></body></html>`;
  return new Response(html,{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 }catch(error){console.error('Pilot workspace access failed',String(error));return fail(503,'Pilot workspace temporarily unavailable.');}
}
