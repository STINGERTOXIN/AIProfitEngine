// Internal transport. Public callers must enforce rate limits and account lookup.
export async function sendLoginEmail(env,{email,token,expires},requestOrigin){
 if(env.CUSTOMER_LOGIN_ENABLED!=='true'||env.ONBOARDING_ORIGIN!=='https://aiprofitengine.ai'||requestOrigin!==env.ONBOARDING_ORIGIN)return {sent:false,reason:'disabled'};
 if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)||!Number.isSafeInteger(expires)||expires<=Math.floor(Date.now()/1000))return {sent:false,reason:'invalid'};
 if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)return {sent:false,reason:'not_configured'};
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[email],subject:'AI Profit Engine — Your secure sign-in link',text:'Open https://aiprofitengine.ai/customer-sign-in#token='+token+' and confirm sign-in. This link expires in 15 minutes and can be used only once. If you did not request it, ignore this email.'})});
  return response.ok?{sent:true}:{sent:false,reason:'provider_rejected'};
 }catch{return {sent:false,reason:'transport_failure'};}
}
