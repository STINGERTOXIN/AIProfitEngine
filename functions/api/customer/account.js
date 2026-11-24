import {SESSION_COOKIE,verifyCustomerSession} from '../../../lib/customer-sessions.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
export async function onRequestGet({request,env}){
 if(env.CUSTOMER_LOGIN_ENABLED!=='true'||!env.DB)return reply({error:'Customer account unavailable'},503);
 const tokens=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(SESSION_COOKIE+'=')).map(x=>x.slice(SESSION_COOKIE.length+1));
 if(tokens.length!==1)return reply({error:'Sign-in required'},401);
 try{
 const session=await verifyCustomerSession(env.DB,tokens[0]);
 if(!session)return reply({error:'Sign-in required'},401);
 const account=await env.DB.prepare("SELECT a.email,a.status,a.activated_at,b.business_name,b.plan FROM ape_customer_accounts a JOIN ape_businesses b ON b.id=a.application_id JOIN ape_customer_sessions s ON s.account_id=a.id WHERE a.id=? AND a.application_id=? AND a.status='active' AND b.status='approved' AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch()").bind(session.accountId,session.applicationId,await (await import('../../../lib/onboarding.mjs')).hashToken(tokens[0])).first();
 if(!account)return reply({error:'Sign-in required'},401);
 return reply({account:{email:account.email,status:account.status,activatedAt:account.activated_at,businessName:account.business_name,plan:account.plan}});
 }catch{return reply({error:'Customer account unavailable'},503);}
}
