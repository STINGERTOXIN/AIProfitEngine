import {issueLoginChallenge} from '../../../../lib/customer-login.mjs';
import {sendLoginEmail} from '../../../../lib/customer-login-mail.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const accepted=()=>reply({ok:true},202);
async function limit(db,secret,key,max){
 const encoder=new TextEncoder();
 const signingKey=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',signingKey,encoder.encode(key));
 const bucket=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const window=Math.floor(Date.now()/900000)*900;
 const row=await db.prepare("INSERT INTO ape_login_rate_limits(bucket,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN MIN(attempts+1,1000000) ELSE 1 END,window_start=excluded.window_start RETURNING attempts").bind(bucket,window).first();
 return !!row&&row.attempts<=max;
}
export async function onRequestPost({request,env,waitUntil}){
 if(typeof waitUntil!=='function'||env.CUSTOMER_LOGIN_ENABLED!=='true'||!env.DB||env.ONBOARDING_ORIGIN!=='https://aiprofitengine.ai'||new URL(request.url).origin!==env.ONBOARDING_ORIGIN)return reply({error:'Sign-in unavailable'},503);
 if(request.headers.get('Origin')!==env.ONBOARDING_ORIGIN)return reply({error:'Forbidden'},403);
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return reply({error:'JSON required'},415);
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||ip.length>64||typeof env.LOGIN_RATE_LIMIT_SECRET!=='string'||! /^[a-f0-9]{64}$/.test(env.LOGIN_RATE_LIMIT_SECRET))return reply({error:'Sign-in unavailable'},503);
 const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid request'},400);
 let timer,size=0,chunks=[],email;
 try{
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000)});
 while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>1024)return reply({error:'Invalid request'},413);chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 email=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))?.email;
 }catch{return reply({error:'Invalid request'},400);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
 if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Invalid request'},400);
 email=email.trim().toLowerCase();
 try{
 if(!await limit(env.DB,env.LOGIN_RATE_LIMIT_SECRET,'ip:'+ip,10))return reply({error:'Try again later'},429);
 if(!await limit(env.DB,env.LOGIN_RATE_LIMIT_SECRET,'global',100))return reply({error:'Try again later'},429);
 if(!await limit(env.DB,env.LOGIN_RATE_LIMIT_SECRET,'email:'+email,3))return accepted();
 // Keep account-dependent work outside the public response path.
 waitUntil((async()=>{
 try{
 const rows=await env.DB.prepare("SELECT a.id,a.email FROM ape_customer_accounts a JOIN ape_businesses b ON b.id=a.application_id WHERE a.email=? COLLATE NOCASE AND a.status='active' AND b.status='approved' LIMIT 2").bind(email).all();
 // Ambiguous email ownership fails closed until account selection is designed.
 if(rows.results?.length!==1)return;
 const account=rows.results[0],challenge=await issueLoginChallenge(env.DB,account.id);
 if(challenge)await sendLoginEmail(env,{email:account.email,...challenge},env.ONBOARDING_ORIGIN);
 }catch{console.error('Customer login delivery task failed');}
 })());
 return accepted();
 }catch{return reply({error:'Sign-in unavailable'},503);}
}
export function onRequestGet(){return reply({error:'POST required'},405);}
