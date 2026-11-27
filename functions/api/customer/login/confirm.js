import {exchangeLoginChallenge} from '../../../../lib/customer-login.mjs';
import {sessionCookie} from '../../../../lib/customer-sessions.mjs';
const reply=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
export async function onRequestPost({request,env}){
 if(env.CUSTOMER_LOGIN_ENABLED!=='true'||!env.DB)return reply({error:'Sign-in unavailable'},503);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Forbidden'},403);
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return reply({error:'JSON required'},415);
 const reader=request.body?.getReader();
 if(!reader)return reply({error:'Invalid request'},400);
 let timer,size=0,chunks=[];
 try{
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000)});
 while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>256)return reply({error:'Invalid request'},413);chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const {token}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return reply({error:'Invalid sign-in link'},400);
 try{const session=await exchangeLoginChallenge(env.DB,token);if(!session)return reply({error:'Invalid or expired sign-in link'},400);return reply({ok:true},200,{'Set-Cookie':sessionCookie(session.token,session.maxAge)});}catch{return reply({error:'Sign-in unavailable'},503);}
 }catch{return reply({error:'Invalid request'},400);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function onRequestGet(){return reply({error:'POST required'},405);}
