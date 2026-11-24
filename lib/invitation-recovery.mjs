import {inviteApprovedCustomer} from './onboarding-invite.mjs';
const delays=[300,1800,7200,21600];
export async function enqueueInvitation(db,applicationId){
 await db.prepare("INSERT INTO ape_invitation_delivery_jobs(application_id) SELECT id FROM ape_businesses WHERE id=? AND status='approved' ON CONFLICT(application_id) DO NOTHING").bind(applicationId).run();
}
export async function processInvitationRecovery(env){
 if(env.INVITATION_RECOVERY_ENABLED!=='true'||env.ONBOARDING_ENABLED!=='true'||env.AUTO_INVITATIONS_ENABLED!=='true'||env.ONBOARDING_ORIGIN!=='https://aiprofitengine.ai'||!env.DB)return {processed:0,disabled:true};
 const db=env.DB;
 // Ambiguous interrupted sends require review rather than invalidating a possibly delivered link.
 await db.prepare("UPDATE ape_invitation_delivery_jobs SET status='failed',last_error_code='interrupted_delivery_review',lease_id=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='processing' AND lease_until<=unixepoch()").run();
 let processed=0;
 for(let i=0;i<10;i++){
 const lease=crypto.randomUUID();
 const job=await db.prepare("UPDATE ape_invitation_delivery_jobs SET status='processing',attempts=attempts+1,lease_id=?,lease_until=unixepoch()+300,updated_at=CURRENT_TIMESTAMP WHERE application_id=(SELECT application_id FROM ape_invitation_delivery_jobs WHERE status='pending' AND attempts<5 AND next_attempt_at<=unixepoch() ORDER BY next_attempt_at,application_id LIMIT 1) RETURNING application_id,attempts").bind(lease).first();
 if(!job)break;
 let result;
 try{result=await inviteApprovedCustomer(env,job.application_id,env.ONBOARDING_ORIGIN);}catch{result={sent:false,reason:'unknown'};}
 const reason=String(result?.reason||'unknown');
 const permanent=['invalid_applicant','not_eligible'].includes(reason);
 // Only retry failures known to precede sending; ambiguous provider outcomes require review.
 const retryable=['not_configured','disabled','environment_blocked'].includes(reason);
 const status=result?.sent?'sent':permanent?'cancelled':retryable&&job.attempts<5?'pending':'failed';
 const code=result?.sent?null:permanent||retryable?reason:'delivery_review_required';
 await db.prepare("UPDATE ape_invitation_delivery_jobs SET status=?,next_attempt_at=unixepoch()+?,last_error_code=?,lease_id=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE application_id=? AND status='processing' AND lease_id=?").bind(status,delays[Math.min(job.attempts-1,3)],code,job.application_id,lease).run();
 processed++;
 }
 return {processed};
}
