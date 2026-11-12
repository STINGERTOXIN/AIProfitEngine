const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const sha=async value=>hex(await crypto.subtle.digest("SHA-256",enc.encode(value)));
const random=()=>crypto.randomUUID()+crypto.randomUUID();
const normalize=value=>String(value||"").trim().toLowerCase();
const cookie=(value,maxAge)=>"ape_pilot_session="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
const safeEq=(a,b)=>{if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
async function init(db){await db.batch([
 db.prepare("CREATE TABLE IF NOT EXISTS ape_login_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, sent_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)"),
 db.prepare("CREATE TABLE IF NOT EXISTS ape_login_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)"),
 db.prepare("CREATE TABLE IF NOT EXISTS ape_login_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)")
]);}
async function approved(db,email){return db.prepare("SELECT id, business_name FROM ape_businesses WHERE lower(contact_email)=? AND status='approved' ORDER BY id DESC LIMIT 1").bind(email).first();}
async function limit(db,key,max,windowSec){const now=Math.floor(Date.now()/1000);const row=await db.prepare("SELECT count,expires_at FROM ape_login_limits WHERE key=?").bind(key).first();if(row&&row.expires_at>now&&row.count>=max)return false;if(!row||row.expires_at<=now){await db.prepare("INSERT INTO ape_login_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires_at=excluded.expires_at").bind(key,now+windowSec).run()}else{await db.prepare("UPDATE ape_login_limits SET count=count+1 WHERE key=?").bind(key).run()}return true;}
async function session(request,db){const value=(request.headers.get("cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("ape_pilot_session="))?.slice(18);if(!value||!/^[a-f0-9-]{72}$/.test(value))return null;const hash=await sha(value);const row=await db.prepare("SELECT email FROM ape_login_sessions WHERE token_hash=? AND expires_at>?").bind(hash,Math.floor(Date.now()/1000)).first();if(!row)return null;const business=await approved(db,row.email);return business?{email:row.email,business_name:business.business_name,business_id:business.id,hash}:null;}
export async function onRequest({request,env}){
 if(!env.DB)return json({error:"Database binding is missing."},503);
 if(!env.AUTH_SECRET||env.AUTH_SECRET.length<32)return json({error:"Pilot login is not configured."},503);
 const url=new URL(request.url);const origin=request.headers.get("origin");if(origin&&origin!==url.origin)return json({error:"Invalid origin."},403);
 const db=env.DB;try{await init(db)}catch{return json({error:"Pilot login database unavailable."},503)}
 if(request.method==="GET"){const user=await session(request,db);return json({authenticated:!!user,...(user?{email:user.email,business_name:user.business_name}: {})})}
 if(request.method!=="POST")return json({error:"Method not allowed."},405);
 let body;try{body=await request.json()}catch{return json({error:"Invalid request."},400)}
 const action=body?.action;const now=Math.floor(Date.now()/1000);
 if(action==="logout"){const user=await session(request,db);if(user)await db.prepare("DELETE FROM ape_login_sessions WHERE token_hash=?").bind(user.hash).run();return json({ok:true},200,{"set-cookie":cookie("",0)})}
 const email=normalize(body?.email);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:"Enter a valid email address."},400);
 const ip=request.headers.get("cf-connecting-ip")||"unknown";const ipKey=await sha(env.AUTH_SECRET+":ip:"+ip);const emailKey=await sha(env.AUTH_SECRET+":email:"+email);
 if(action==="request"){
  if(!await limit(db,"req-ip:"+ipKey,15,3600))return json({error:"Too many requests. Try again later."},429);
  if(!await limit(db,"req-email:"+emailKey,5,3600))return json({ok:true,message:"If this email has an approved pilot application, a code will be sent."});
  const business=await approved(db,email);
  if(business&&env.RESEND_API_KEY&&env.RESEND_FROM_EMAIL){
   const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
   const hash=await sha(env.AUTH_SECRET+":"+email+":"+code);
   const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"authorization":"Bearer "+env.RESEND_API_KEY,"content-type":"application/json"},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[email],subject:"Your AI Profit Engine sign-in code",text:"Your AI Profit Engine sign-in code is "+code+". It expires in 10 minutes. If you did not request it, ignore this email."})});
   if(sent.ok)await db.prepare("INSERT INTO ape_login_codes(email,code_hash,expires_at,sent_at,attempts) VALUES(?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0").bind(email,hash,now+600,now).run();
  }
  return json({ok:true,message:"If this email has an approved pilot application, a code will be sent."});
 }
 if(action==="verify"){
  if(!await limit(db,"verify-ip:"+ipKey,30,3600))return json({error:"Too many attempts. Try again later."},429);
  const code=String(body.code||"");if(!/^\d{6}$/.test(code))return json({error:"Enter the six-digit code."},400);
  const row=await db.prepare("SELECT code_hash,expires_at,attempts FROM ape_login_codes WHERE email=?").bind(email).first();
  const hash=await sha(env.AUTH_SECRET+":"+email+":"+code);
  if(!row||row.expires_at<now||row.attempts>=5||!safeEq(hash,row.code_hash)){if(row)await db.prepare("UPDATE ape_login_codes SET attempts=attempts+1 WHERE email=?").bind(email).run();return json({error:"Invalid or expired code."},401)}
  if(!await approved(db,email))return json({error:"Account not approved."},403);
  await db.prepare("DELETE FROM ape_login_codes WHERE email=?").bind(email).run();
  const token=random();await db.prepare("INSERT INTO ape_login_sessions(token_hash,email,expires_at) VALUES(?,?,?)").bind(await sha(token),email,now+43200).run();
  return json({ok:true},200,{"set-cookie":cookie(token,43200)});
 }
 return json({error:"Unknown action."},400);
 }