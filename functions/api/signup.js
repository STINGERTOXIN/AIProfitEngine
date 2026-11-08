const headers = { 'Cache-Control': 'no-store' };
function reply(data, status=200) { return Response.json(data,{status,headers}); }
export async function onRequestPost({request,env}) {
 if (!env.DB || !env.TURNSTILE_SECRET_KEY) return reply({error:'Signup is not available yet.'},503);
 if ((Number(request.headers.get('content-length'))||0)>4096) return reply({error:'Request too large.'},413);
 let data;
 try { data=await request.json(); } catch { return reply({error:'Invalid request.'},400); }
 const email=String(data?.email||'').trim().toLowerCase();
 if (email.length>254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || data?.consent!==true || typeof data?.token!=='string' || data.token.length>2048) return reply({error:'Enter a valid email, agree to updates, and complete verification.'},400);
 try {
  const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:data.token,remoteip:request.headers.get('CF-Connecting-IP')})});
  const result=await verification.json();
  if (!result.success) return reply({error:'Verification failed. Please try again.'},400);
  const host=new URL(request.url).hostname;
  if (result.hostname!==host) return reply({error:'Verification hostname mismatch.'},400);
  await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email,consent_at,consent_version) VALUES (?, ?, ?)').bind(email,new Date().toISOString(),'early-access-v1').run();
  return reply({ok:true});
 } catch { return reply({error:'Signup temporarily unavailable.'},503); }
}
export function onRequestGet() { return reply({error:'Method not allowed.'},405); }
