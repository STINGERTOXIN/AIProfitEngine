const respond=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const enc=new TextEncoder();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
async function actor(request,db){
 const token=(request.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("ape_pilot_session="))?.slice("ape_pilot_session=".length);
 if(!token||!/^[a-f0-9-]{72}$/.test(token))return null;
 const record=await db.prepare("SELECT email FROM ape_login_sessions WHERE token_hash=? AND expires_at>?").bind(await sha(token),Math.floor(Date.now()/1000)).first();
 if(!record)return null;
 const business=await db.prepare("SELECT id,business_name FROM ape_businesses WHERE lower(contact_email)=? AND status='approved' ORDER BY id DESC LIMIT 1").bind(record.email).first();
 return business?{id:business.id,name:business.business_name}:null;
}
const statuses=["new","contacted","follow_up","won","lost"];
export async function onRequest({request,env}){
 if(!env.DB)return respond({error:"Database unavailable"},503);
 const origin=request.headers.get("Origin"),url=new URL(request.url);
 if(origin&&origin!==url.origin)return respond({error:"Invalid origin"},403);
 try{
 const db=env.DB,user=await actor(request,db);
 if(!user)return respond({error:"Sign in to access your leads"},401);
 await db.prepare("CREATE TABLE IF NOT EXISTS ape_leads (id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER NOT NULL,customer_name TEXT NOT NULL,contact TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'new',follow_up_date TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 if(request.method==="GET"){
 const data=await db.prepare("SELECT id,customer_name,contact,notes,status,follow_up_date,created_at FROM ape_leads WHERE business_id=? ORDER BY id DESC LIMIT 100").bind(user.id).all();
 return respond({business:user.name,leads:data.results||[]});
 }
 if(request.method!=="POST")return respond({error:"Method not allowed"},405);
 if((Number(request.headers.get("content-length"))||0)>8192)return respond({error:"Request too large"},413);
 let body;try{body=await request.json()}catch{return respond({error:"Invalid request"},400)}
 if(body?.action==="add"){
 const name=String(body.customer_name||"").trim(),contact=String(body.contact||"").trim(),notes=String(body.notes||"").trim();
 if(!name||name.length>120||!contact||contact.length>254||notes.length>2000)return respond({error:"Enter a name and contact details; keep notes under 2000 characters"},400);
 await db.prepare("INSERT INTO ape_leads (business_id,customer_name,contact,notes) VALUES (?,?,?,?)").bind(user.id,name,contact,notes).run();
 return respond({ok:true});
 }
 if(body?.action==="update"){
 const id=Number(body.id),status=String(body.status||""),date=body.follow_up_date==null||body.follow_up_date===""?null:String(body.follow_up_date);
 if(!Number.isSafeInteger(id)||id<1||!statuses.includes(status)||date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return respond({error:"Invalid lead update"},400);
 const result=await db.prepare("UPDATE ape_leads SET status=?,follow_up_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=?").bind(status,date,id,user.id).run();
 return respond({ok:true,updated:result.meta?.changes||0});
 }
 return respond({error:"Unknown action"},400);
 }catch(e){console.error("Pilot leads request failed",String(e));return respond({error:"Could not complete request"},503)}
}