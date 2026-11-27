import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendActivationEmail} from '../lib/onboarding-mail.mjs';
const env={ONBOARDING_ENABLED:'true',ONBOARDING_ORIGIN:'https://aiprofitengine.ai',RESEND_API_KEY:'fake',RESEND_FROM_EMAIL:'test@example.com'};
const invite={email:'test@example.com',token:'a'.repeat(64),expires:Math.floor(Date.now()/1000)+3600};
test('disabled and invalid invitations never reach provider',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('Unexpected fetch');};
 try {
  assert.equal((await sendActivationEmail({},invite)).reason,'disabled');
  assert.equal((await sendActivationEmail({...env,ONBOARDING_ORIGIN:'https://example.com'},invite)).reason,'invalid_origin');
  assert.equal((await sendActivationEmail(env,{...invite,expires:0})).reason,'invalid_invitation');
 } finally {globalThis.fetch=original;}
});
test('valid invitation uses fixed HTTPS link and handles provider failures',async()=>{
 const original=globalThis.fetch;
 try {
  let body;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');body=JSON.parse(options.body);return {ok:true};};
  assert.equal((await sendActivationEmail(env,invite)).sent,true);
  assert.deepEqual(body.to,[invite.email]);
  assert.ok(body.text.includes('https://aiprofitengine.ai/activate#token='+invite.token));
  globalThis.fetch=async()=>({ok:false});
  assert.equal((await sendActivationEmail(env,invite)).reason,'provider_rejected');
  globalThis.fetch=async()=>{throw Error('network');};
  assert.equal((await sendActivationEmail(env,invite)).reason,'transport_failure');
 } finally {globalThis.fetch=original;}
});
