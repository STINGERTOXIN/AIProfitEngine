const headers={'Cache-Control':'no-store'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
export async function onRequestPost({request,env}){
 if(!env.DB||!env.TURNSTILE_SECRET_KEY)return reply({error:'Applications are temporarily unavailable.'},503);
 if((Number(request.headers.get('content-length'))||0)>4096)return reply({error:'Request too large.'},413);
 let data;try{data=await request.json();}catch{return reply({error:'Invalid application.'},400);}
 const business=String(data?.business_name||'').trim();
 const email=String(data?.contact_email||'').trim().toLowerCase();
 const token=data?.token;
 if(business.length<2||business.length>120||/[<>\x00-\x1f]/.test(business)||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof token!=='string'||!token||token.length>2048)return reply({error:'Enter a valid business name and email, then complete verification.'},400);
 try{
 const verify=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('CF-Connecting-IP')})});
 const result=await verify.json();
 if(!result.success||result.hostname!==new URL(request.url).hostname)return reply({error:'Verification failed. Please try again.'},400);
 await env.DB.prepare("INSERT INTO ape_businesses (business_name,contact_email,plan,status) VALUES (?,?,'pilot','pending')").bind(business,email).run();
 return reply({ok:true});
 }catch(e){console.error('Pilot application failed',String(e));return reply({error:'Could not save your application. Please try again later.'},503);}
}
export function onRequestGet(){return reply({error:'Method not allowed.'},405);}
