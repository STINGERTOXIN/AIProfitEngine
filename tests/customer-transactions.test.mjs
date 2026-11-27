import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {issueInvitation,activateInvitation,hashToken} from '../lib/onboarding.mjs';
import {issueLoginChallenge,exchangeLoginChallenge} from '../lib/customer-login.mjs';
import {verifyCustomerSession} from '../lib/customer-sessions.mjs';
test('activation and login links are single-use, expired links fail',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec("CREATE TABLE ape_businesses(id INTEGER PRIMARY KEY,status TEXT,contact_email TEXT); INSERT INTO ape_businesses VALUES(1,'approved','a@example.invalid'),(2,'pending','b@example.invalid');");
 for(const file of ['phase8-onboarding-foundation.sql','phase8-customer-sessions.sql'])db.exec(readFileSync(new URL('../docs/'+file,import.meta.url),'utf8'));
 const adapter={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:db.prepare(sql).run(...args)}),execute:()=>({meta:db.prepare(sql).run(...args)})}}}},async batch(stmts){db.exec('BEGIN');try{const results=stmts.map(s=>s.execute());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 assert.equal(await issueInvitation(adapter,2),null);
 const old=await issueInvitation(adapter,1);
 const expired=await issueInvitation(adapter,1);
 assert.equal(await activateInvitation(adapter,old.token),false);
 db.prepare('UPDATE ape_activation_tokens SET expires_at=0 WHERE token_hash=?').run(await hashToken(expired.token));
 assert.equal(await activateInvitation(adapter,expired.token),false);
 const fresh=await issueInvitation(adapter,1);
 assert.equal(await activateInvitation(adapter,fresh.token),true);
 assert.equal(await activateInvitation(adapter,fresh.token),false);
 assert.equal(await issueInvitation(adapter,1),null);
 const account=db.prepare('SELECT id FROM ape_customer_accounts WHERE application_id=1').get().id;
 const stale=await issueLoginChallenge(adapter,account);
 db.prepare('UPDATE ape_customer_login_challenges SET expires_at=0 WHERE token_hash=?').run(await hashToken(stale.token));
 assert.equal(await exchangeLoginChallenge(adapter,stale.token),null);
 const login=await issueLoginChallenge(adapter,account);
 const session=await exchangeLoginChallenge(adapter,login.token);
 assert.ok(session);
 assert.equal(await exchangeLoginChallenge(adapter,login.token),null);
 assert.deepEqual(await verifyCustomerSession(adapter,session.token),{accountId:account,applicationId:1});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ape_customer_sessions').get().n,1);
 }finally{db.close();}
});
