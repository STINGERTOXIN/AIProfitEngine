const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
async function signature(secret,id,email){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,enc.encode(id+":"+email.toLowerCase())))}
const page=(message,status=200)=>new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>A.P.E. email preferences</title><body style="font:18px system-ui;background:#101018;color:white;max-width:650px;margin:80px auto;padding:20px"><h1>AI Profit Engine</h1><p>'+message+'</p></body></html>',{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function onRequestGet({request,env}){
 if(!env.DB||!env.REMINDER_CRON_SECRET)return page("Email preferences are temporarily unavailable.",503);
 const url=new URL(request.url),id=url.searchParams.get("id")||"",token=url.searchParams.get("token")||"";
 if(!/^\\d{1,15}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return page("This unsubscribe link is invalid.",400);
 try{
  const lead=await env.DB.prepare("SELECT id,contact FROM ape_leads WHERE id=?").bind(Number(id)).first();
  if(!lead)return page("This unsubscribe link is invalid.",400);
  const expected=await signature(env.REMINDER_CRON_SECRET,id,String(lead.contact||"").trim());
  if(expected!==token)return page("This unsubscribe link is invalid.",400);
  await env.DB.prepare("UPDATE ape_leads SET email_unsubscribed=1,email_opt_in=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number(id)).run();
  return page("You have been unsubscribed from automated follow-up emails about this inquiry.");
 }catch(e){console.error("Unsubscribe failed",String(e));return page("Email preferences are temporarily unavailable.",503)}
}
