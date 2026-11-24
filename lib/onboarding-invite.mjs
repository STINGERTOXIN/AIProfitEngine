import {issueInvitation} from './onboarding.mjs';
import {sendActivationEmail} from './onboarding-mail.mjs';
// Caller must already have authenticated administrator authorization.
export async function inviteApprovedCustomer(env, applicationId, requestOrigin) {
 if(env.ONBOARDING_ENABLED!=='true'||env.AUTO_INVITATIONS_ENABLED!=='true') return {sent:false,reason:'disabled'};
 // Preview deployments must not issue real customer invitations.
 if(requestOrigin!=='https://aiprofitengine.ai'||env.ONBOARDING_ORIGIN!==requestOrigin||!env.DB) return {sent:false,reason:'environment_blocked'};
 try {
  const applicant=await env.DB.prepare("SELECT contact_email FROM ape_businesses WHERE id=? AND status='approved'").bind(applicationId).first();
  if(!applicant||typeof applicant.contact_email!=='string'||applicant.contact_email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.contact_email)) return {sent:false,reason:'invalid_applicant'};
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL) return {sent:false,reason:'not_configured'};
  const invitation=await issueInvitation(env.DB,applicationId);
  if(!invitation) return {sent:false,reason:'not_eligible'};
  return await sendActivationEmail(env,{email:applicant.contact_email,...invitation});
 } catch {return {sent:false,reason:'invitation_failed'};}
}
