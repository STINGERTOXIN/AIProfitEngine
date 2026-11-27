// Internal transport; caller must authorize invitation issuance and recipient.
export async function sendActivationEmail(env, {email, token, expires}) {
  if (env.ONBOARDING_ENABLED !== 'true') return {sent:false, reason:'disabled'};
  const origin = String(env.ONBOARDING_ORIGIN || '');
  if (origin !== 'https://aiprofitengine.ai') return {sent:false, reason:'invalid_origin'};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now()/1000)) return {sent:false, reason:'invalid_invitation'};
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return {sent:false, reason:'not_configured'};
  const url = origin + '/activate#token=' + token;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
      headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[email],subject:'AI Profit Engine — Activate your pilot account',text:'Your pilot application has been approved. To activate your account, open '+url+' and confirm activation before the invitation expires. This invitation does not start a paid service. If you did not request this, ignore this email.'})
    });
    if (!response.ok) return {sent:false, reason:'provider_rejected'};
    return {sent:true};
  } catch { return {sent:false, reason:'transport_failure'}; }
}
