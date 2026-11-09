const headers = { 'Cache-Control': 'no-store' };
function reply(data, status=200) { return Response.json(data,{status,headers}); }
export async function onRequestPost({request,env}) {
 if (!env.DB || !env.TURNSTILE_SECRET_KEY) return reply({error:'Signup is not available yet.'},503);
 if ((Number(request.headers.get('content-length'))||0)>4096) return reply({error:'Request too large.'},413);
 let data;
 try { data=await request.json(); } catch { return reply({error:'Invalid request.'},400); }
 const email=String(data?.email||'').trim().toLowerCase();
 if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data?.consent!==true || typeof data?.token!=='string' || data.token.length>2048) return reply({error:'Enter a valid email, agree to updates, and complete verification.'},400);
 try {
  const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:data.token,remoteip:request.headers.get('CF-Connecting-IP')})});
  const result=await verification.json();
  if (!result.success) return reply({error:'Verification failed. Please try again.'},400);
  const host=new URL(request.url).hostname;
  if (result.hostname!==host) return reply({error:'Verification hostname mismatch.'},400);
  const insertion=await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email,consent_at,consent_version) VALUES (?, ?, ?)').bind(email,new Date().toISOString(),'early-access-v1').run();
  // Send once for newly inserted subscribers, never for duplicate signups.
  // Email delivery is separate from signup persistence: an email outage must not lose the signup.
  if (insertion.meta?.changes > 0 && env.RESEND_API_KEY) {
   try {
    const sent=await fetch('https://api.resend.com/emails',{
     method:'POST',
     headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
     body:JSON.stringify({
      from:'AI Profit Engine <welcome@aiprofitengine.ai>',
      to:[email],
      subject:'Welcome to AI Profit Engine',
      text:"Thanks for joining the AI Profit Engine early-access list!\n\nYou're on the list. We're developing practical tools to help small businesses manage inquiries and follow up faster. We'll share updates as the project develops.\n\nYou can learn more at https://aiprofitengine.ai\n\nAI Profit Engine\nAutomate. Earn. Repeat."
     })
    });
    if (!sent.ok) console.error('Resend welcome email failed:',sent.status);
    // Notify the site owner only after a new subscriber has been stored.
    try {
     const notice=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
       from:'AI Profit Engine <welcome@aiprofitengine.ai>',
       to:['staffnebrian@gmail.com'],
       subject:'New AI Profit Engine early-access subscriber',
       text:`A new subscriber joined the AI Profit Engine early-access list.\n\nEmail: ${email}\nDate: ${new Date().toISOString()}\n\nView subscribers in your Cloudflare D1 dashboard.`
      })
     });
     if (!notice.ok) console.error('Resend owner notification failed:',notice.status);
    } catch(error) { console.error('Resend owner notification request failed:',String(error)); }
   } catch (error) { console.error('Resend welcome email request failed:',String(error)); }
  }
  return reply({ok:true});
 } catch { return reply({error:'Signup temporarily unavailable.'},503); }
}
export function onRequestGet() { return reply({error:'Method not allowed.'},405); }
