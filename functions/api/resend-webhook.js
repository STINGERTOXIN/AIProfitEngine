// Resend/Svix signed webhook receiver. No unauthenticated database writes.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
function decodeBase64(s){const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0}
async function verify(raw,headers,secret){
 const id=headers.get("svix-id"),stamp=headers.get("svix-timestamp"),signature=headers.get("svix-signature");
 if(!id||!stamp||!signature||!/^[0-9]{10,13}$/.test(stamp))return false;
 const timestamp=Number(stamp);if(!Number.isSafeInteger(timestamp)||Math.abs(Date.now()/1000-(stamp.length===13?timestamp/1000:timestamp))>300)return false;
 let key;try{key=decodeBase64(secret.startsWith("whsec_")?secret.slice(6):secret)}catch{return false}
 const encoder=new TextEncoder();
 const cryptoKey=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,encoder.encode(id+"."+stamp+"."+raw)));
 return signature.split(" ").some(part=>{const [version,value]=part.split(",");if(version!=="v1"||!value)return false;try{return equal(digest,decodeBase64(value))}catch{return false}});
}
const eventStatuses={"email.delivered":"delivered","email.bounced":"bounced","email.failed":"failed","email.complained":"complained"};
const priority={delivered:1,failed:2,bounced:3,complained:4};
export async function onRequestPost({request,env}){
 if(!env.DB||!env.RESEND_WEBHOOK_SECRET)return json({error:"Webhook not configured"},503);
 if((Number(request.headers.get("content-length"))||0)>65536)return json({error:"Payload too large"},413);
 const raw=await request.text();if(raw.length>65536)return json({error:"Payload too large"},413);
 if(!await verify(raw,request.headers,env.RESEND_WEBHOOK_SECRET))return json({error:"Invalid signature"},401);
 let event;try{event=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
 const status=eventStatuses[event?.type];if(!status)return json({ok:true,ignored:true});
 const emailId=event?.data?.email_id;
 if(typeof emailId!=="string"||emailId.length>150)return json({ok:true,ignored:true});
 const db=env.DB;
 try{
  const table=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ape_customer_followup_sent'").first());
  if(!table)return json({error:"Tracking table not ready"},503);
  const columns=(await db.prepare("PRAGMA table_info(ape_customer_followup_sent)").all()).results||[];
  if(!columns.some(c=>c.name==="provider_email_id"))return json({error:"Message ID tracking not deployed"},503);
  if(!columns.some(c=>c.name==="delivery_status"))await db.prepare("ALTER TABLE ape_customer_followup_sent ADD COLUMN delivery_status TEXT").run();
  if(!columns.some(c=>c.name==="delivery_updated_at"))await db.prepare("ALTER TABLE ape_customer_followup_sent ADD COLUMN delivery_updated_at TEXT").run();
  // Terminal negative events take precedence over later/out-of-order delivery notifications.
  const updated=await db.prepare("UPDATE ape_customer_followup_sent SET delivery_status=?,delivery_updated_at=CURRENT_TIMESTAMP WHERE provider_email_id=? AND (delivery_status IS NULL OR CASE delivery_status WHEN 'delivered' THEN 1 WHEN 'failed' THEN 2 WHEN 'bounced' THEN 3 WHEN 'complained' THEN 4 ELSE 0 END < ?)").bind(status,emailId,priority[status]).run();
  if(["bounced","complained"].includes(status)){
   // Suppress only the matching lead, never unrelated customers.
   await db.prepare("UPDATE ape_leads SET email_opt_in=0,email_unsubscribed=1,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT lead_id FROM ape_customer_followup_sent WHERE provider_email_id=?)").bind(emailId).run();
  }
  return json({ok:true,matched:(updated.meta?.changes||0)>0});
 }catch(error){console.error("Resend webhook storage failure",String(error));return json({error:"Webhook processing unavailable"},503)}
}
export async function onRequestGet(){return json({error:"Method not allowed"},405)}
