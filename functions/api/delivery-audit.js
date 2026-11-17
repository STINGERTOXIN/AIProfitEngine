// Read-only delivery reconciliation audit, protected by the existing reminder cron secret.
// Does not send email or alter D1 records.
const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
export async function onRequestPost({request,env}){
 if(!env.DB||!env.REMINDER_CRON_SECRET||env.REMINDER_CRON_SECRET.length<32)return reply({error:"Audit configuration incomplete"},503);
 if(!equal(request.headers.get("authorization")||"","Bearer "+env.REMINDER_CRON_SECRET))return reply({error:"Unauthorized"},401);
 try{
  const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ape_customer_followup_sent'").first();
  if(!table)return reply({error:"Follow-up tracking table missing"},503);
  const columns=(await env.DB.prepare("PRAGMA table_info(ape_customer_followup_sent)").all()).results||[];
  if(!["status","sent_at","provider_email_id","delivery_status"].every(name=>columns.some(c=>c.name===name)))return reply({error:"Follow-up tracking columns missing"},503);
  // Allow recent sends to settle before alerting. Older unresolved sends are never resent.
  const result=await env.DB.prepare(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN status='pending' AND datetime(COALESCE(sent_at, follow_up_date)) <= datetime('now','-1 hour') THEN 1 ELSE 0 END),0) AS stalePending,
    COALESCE(SUM(CASE WHEN status='sent' AND (provider_email_id IS NULL OR trim(provider_email_id)='') AND datetime(sent_at) <= datetime('now','-1 hour') THEN 1 ELSE 0 END),0) AS missingProviderId,
    COALESCE(SUM(CASE WHEN status='sent' AND provider_email_id IS NOT NULL AND trim(provider_email_id)<>'' AND delivery_status IS NULL AND datetime(sent_at) <= datetime('now','-24 hours') THEN 1 ELSE 0 END),0) AS deliveryUnconfirmed,
    COALESCE(SUM(CASE WHEN delivery_status IN ('failed','bounced','complained') THEN 1 ELSE 0 END),0) AS negativeDelivery
   FROM ape_customer_followup_sent`).first();
  const fields=["total","stalePending","missingProviderId","deliveryUnconfirmed","negativeDelivery"];
  const metrics=Object.fromEntries(fields.map(k=>[k,Number(result?.[k]??0)]));
  if(fields.some(k=>!Number.isSafeInteger(metrics[k])||metrics[k]<0))return reply({error:"Invalid audit counters"},503);
  return reply({ok:true,...metrics,needsReview:metrics.stalePending+metrics.missingProviderId+metrics.deliveryUnconfirmed+metrics.negativeDelivery>0});
 }catch(e){console.error("Delivery audit query failed",String(e));return reply({error:"Audit unavailable"},503)}
}
export async function onRequestGet(){return reply({error:"Method not allowed"},405)}
