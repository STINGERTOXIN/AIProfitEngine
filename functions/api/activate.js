import {activateInvitation} from '../../lib/onboarding.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function onRequestPost({request,env}) {
 if(env.ONBOARDING_ENABLED!=='true'||!env.DB) return reply({error:'Activation unavailable'},503);
 if(request.headers.get('Origin')!==new URL(request.url).origin) return reply({error:'Forbidden'},403);
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') return reply({error:'JSON required'},415);
 const reader=request.body?.getReader();
 if(!reader) return reply({error:'Invalid request'},400);
 let size=0, chunks=[], timer;
 try {
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000)});
  while(true){
   const {done,value}=await Promise.race([reader.read(),deadline]);
   if(done) break;
   size+=value.byteLength;
   if(size>256) return reply({error:'Invalid request'},413);
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const {token}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)) return reply({error:'Invalid invitation'},400);
  try {
   return await activateInvitation(env.DB,token)?reply({ok:true}):reply({error:'Invitation invalid or expired'},400);
  } catch {return reply({error:'Activation unavailable'},503);}
 } catch {return reply({error:'Invalid request'},400);}
 finally {clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function onRequestGet(){return reply({error:'POST required'},405);}
