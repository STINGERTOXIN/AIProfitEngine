const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}});
function decode64url(s){const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function authorized(request,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.ADMIN_EMAIL)return false;
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 let head,payload;
 try{head=JSON.parse(new TextDecoder().decode(decode64url(parts[0])));payload=JSON.parse(new TextDecoder().decode(decode64url(parts[1])));}catch{return false;}
 if(head.alg!=='RS256'||!head.kid||!payload.exp||payload.exp*1000<=Date.now()||!payload.nbf&&false)return false;
 const domain=String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//,'').replace(/\/$/,'');
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain))return false;
 if(payload.iss!==`https://${domain}`||!(Array.isArray(payload.aud)?payload.aud:[payload.aud]).includes(env.ACCESS_AUD)||String(payload.email||'').toLowerCase()!==String(env.ADMIN_EMAIL).toLowerCase())return false;
 if(payload.nbf&&payload.nbf*1000>Date.now())return false;
 const keysResponse=await fetch(`https://${domain}/cdn-cgi/access/certs`);
 if(!keysResponse.ok)return false;
 const jwks=await keysResponse.json();
 const jwk=(jwks.keys||[]).find(k=>k.kid===head.kid&&k.kty==='RSA');
 if(!jwk)return false;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({error:'Database not configured'},503);
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.ADMIN_EMAIL)return json({error:'Dashboard access not configured. Set ACCESS_TEAM_DOMAIN, ACCESS_AUD, and ADMIN_EMAIL.'},503);
 try{
  if(!await authorized(request,env))return json({error:'Unauthorized. Sign in through Cloudflare Access with the administrator email.'},403);
  const [totals,trend,recent]=await Promise.all([
   env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= datetime(\'now\',\'-7 days\') THEN 1 ELSE 0 END) AS last7, SUM(CASE WHEN created_at >= datetime(\'now\',\'-30 days\') THEN 1 ELSE 0 END) AS last30 FROM subscribers').first(),
   env.DB.prepare("SELECT substr(created_at,1,10) AS day,COUNT(*) AS total FROM subscribers WHERE created_at >= datetime('now','-30 days') GROUP BY substr(created_at,1,10) ORDER BY day").all(),
   env.DB.prepare('SELECT email,status,created_at FROM subscribers ORDER BY created_at DESC LIMIT 100').all()
  ]);
  return json({total:totals?.total||0,last7:totals?.last7||0,last30:totals?.last30||0,trend:trend.results||[],recent:recent.results||[]});
 }catch(e){console.error('Dashboard request failed',String(e));return json({error:'Dashboard temporarily unavailable'},503);}
}
