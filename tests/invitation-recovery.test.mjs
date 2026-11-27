import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {enqueueInvitation,processInvitationRecovery} from '../lib/invitation-recovery.mjs';
test('disabled worker does not access database',async()=>{
 assert.deepEqual(await processInvitationRecovery({}),{processed:0,disabled:true});
});
test('queue deduplicates, excludes pending applications, retries configuration failures and quarantines interrupted sends',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec("CREATE TABLE ape_businesses(id INTEGER PRIMARY KEY,status TEXT,contact_email TEXT); INSERT INTO ape_businesses VALUES(1,'approved','a@example.invalid'),(2,'pending','b@example.invalid'),(3,'approved','c@example.invalid');");
 db.exec(readFileSync(new URL('../docs/phase8-invitation-recovery.sql',import.meta.url),'utf8'));
 const adapter={prepare(sql){const bind=(...args)=>({first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:db.prepare(sql).run(...args)})});return {...bind(),bind};}};
 await enqueueInvitation(adapter,1);await enqueueInvitation(adapter,1);await enqueueInvitation(adapter,2);await enqueueInvitation(adapter,3);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ape_invitation_delivery_jobs').get().n,2);
 db.exec("UPDATE ape_invitation_delivery_jobs SET status='processing',lease_id='interrupted',lease_until=0 WHERE application_id=3");
 const env={DB:adapter,INVITATION_RECOVERY_ENABLED:'true',ONBOARDING_ENABLED:'true',AUTO_INVITATIONS_ENABLED:'true',ONBOARDING_ORIGIN:'https://aiprofitengine.ai'};
 const job=id=>db.prepare('SELECT * FROM ape_invitation_delivery_jobs WHERE application_id=?').get(id);
 for(let i=1;i<=5;i++){
 assert.equal((await processInvitationRecovery(env)).processed,1);
 assert.equal(job(1).attempts,i);
 assert.equal(job(1).status,i===5?'failed':'pending');
 if(i<5){assert.ok(job(1).next_attempt_at>Math.floor(Date.now()/1000));db.exec('UPDATE ape_invitation_delivery_jobs SET next_attempt_at=0 WHERE application_id=1');}
 }
 assert.equal(job(3).status,'failed');
 assert.equal(job(3).last_error_code,'interrupted_delivery_review');
 assert.equal((await processInvitationRecovery(env)).processed,0);
 }finally{db.close();}
});
