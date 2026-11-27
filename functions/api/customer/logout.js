import {SESSION_COOKIE,clearSessionCookie,revokeCustomerSession} from '../../../lib/customer-sessions.mjs';
const reply=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Forbidden'},403);
 const tokens=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(SESSION_COOKIE+'=')).map(x=>x.slice(SESSION_COOKIE.length+1));
 if(tokens.length>1)return reply({error:'Ambiguous session'},400,{'Set-Cookie':clearSessionCookie()});
 try{
 if(tokens.length===1){if(!env.DB)return reply({error:'Logout unavailable'},503,{'Set-Cookie':clearSessionCookie()});await revokeCustomerSession(env.DB,tokens[0]);}
 return reply({ok:true},200,{'Set-Cookie':clearSessionCookie()});
 }catch{return reply({error:'Server-side logout could not be confirmed'},503,{'Set-Cookie':clearSessionCookie()});}
}
export function onRequestGet(){return reply({error:'POST required'},405);}
