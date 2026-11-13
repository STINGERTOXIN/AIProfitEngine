const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const equal=(a,b)=>{if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0};
export async function onRequestPost({request,env}){
 if(!env.DB||!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL||!env.REMINDER_CRON_SECRET||env.REMINDER_CRON_SECRET.length<32)return json({error:"Reminder configuration incomplete"},503);
 const auth=request.headers.get("authorization")||"";
 if(!equal(auth,"Bearer "+env.REMINDER_CRON_SECRET))return json({error:"Unauthorized"},401);
 const db=env.DB;
 try{
  await db.prepare("CREATE TABLE IF NOT EXISTS ape_reminder_sent (lead_id INTEGER NOT NULL,follow_up_date TEXT NOT NULL,recipient TEXT NOT NULL,sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(lead_id,follow_up_date,recipient))").run();
  const today=new Date().toISOString().slice(0,10);
  const leads=(await db.prepare("SELECT l.id,l.customer_name,l.follow_up_date,l.status,b.business_name,b.contact_email FROM ape_leads l JOIN ape_businesses b ON b.id=l.business_id WHERE b.status='approved' AND l.follow_up_date IS NOT NULL AND l.follow_up_date<=? AND l.status IN ('new','contacted','follow_up') AND trim(coalesce(b.contact_email,''))<>'' AND NOT EXISTS (SELECT 1 FROM ape_reminder_sent s WHERE s.lead_id=l.id AND s.follow_up_date=l.follow_up_date AND s.recipient=lower(trim(b.contact_email))) ORDER BY l.follow_up_date,l.id LIMIT 50").bind(today).all()).results||[];
  let sent=0,failed=0;
  for(const lead of leads){
   const recipient=String(lead.contact_email||"").trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){failed++;console.error("Invalid business contact email for lead",lead.id);continue}

   const html="<h2>A.P.E. lead follow-up reminder</h2><p><b>Business:</b> "+escape(lead.business_name)+"</p><p><b>Customer:</b> "+escape(lead.customer_name)+"</p><p><b>Due:</b> "+escape(lead.follow_up_date)+"</p><p><b>Status:</b> "+escape(lead.status)+"</p><p><a href='https://aiprofitengine.ai/leads'>Open lead manager</a></p>";
   const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[recipient],subject:"A.P.E. follow-up due: "+lead.customer_name,text:"A.P.E. follow-up reminder\nBusiness: "+lead.business_name+"\nCustomer: "+lead.customer_name+"\nDue: "+lead.follow_up_date+"\nStatus: "+lead.status+"\nhttps://aiprofitengine.ai/leads",html})});
   if(result.ok){await db.prepare("INSERT OR IGNORE INTO ape_reminder_sent (lead_id,follow_up_date,recipient) VALUES (?,?,?)").bind(lead.id,lead.follow_up_date,recipient).run();sent++}else{failed++;console.error("Resend reminder failed",result.status)}
  }
  return json({ok:true,checked:leads.length,sent,failed});
 }catch(e){console.error("Reminder run failed",String(e));return json({error:"Reminder run failed"},503)}
}
