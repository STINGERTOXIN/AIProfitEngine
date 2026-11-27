import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendLoginEmail} from '../lib/customer-login-mail.mjs';
test('login transport gates and delivery',async()=>{
 const env={CUSTOMER_LOGIN_ENABLED:'true',ONBOARDING_ORIGIN:'https://aiprofitengine.ai',RESEND_API_KEY:'fake',RESEND_FROM_EMAIL:'test@example.com'};
 const invite={email:'test@example.com',token:'a'.repeat(64),expires:Math.floor(Date.now()/1000)+900};
 const original=globalThis.fetch;
 let calls=0;
 try{
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);assert.deepEqual(body.to,[invite.email]);assert.ok(body.text.includes('/customer-sign-in#token='+invite.token));return {ok:true};};
 assert.equal((await sendLoginEmail({},invite,env.ONBOARDING_ORIGIN)).sent,false);
 assert.equal((await sendLoginEmail(env,invite,'https://preview.pages.dev')).sent,false);
 assert.equal((await sendLoginEmail(env,{...invite,expires:0},env.ONBOARDING_ORIGIN)).sent,false);
 assert.equal(calls,0);
 assert.equal((await sendLoginEmail(env,invite,env.ONBOARDING_ORIGIN)).sent,true);
 assert.equal(calls,1);
 globalThis.fetch=async()=>({ok:false});
 assert.equal((await sendLoginEmail(env,invite,env.ONBOARDING_ORIGIN)).reason,'provider_rejected');
 }finally{globalThis.fetch=original;}
});
