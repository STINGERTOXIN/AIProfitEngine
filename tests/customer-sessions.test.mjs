import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {verifyCustomerSession,revokeCustomerSession,sessionCookie,clearSessionCookie} from '../lib/customer-sessions.mjs';
import {hashToken} from '../lib/onboarding.mjs';
test('session cookie security attributes and invalid input',()=>{
 const token='a'.repeat(64);
 assert.equal(sessionCookie(token,28800),'__Host-ape_customer='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800');
 assert.match(clearSessionCookie(),/Max-Age=0$/);
 assert.throws(()=>sessionCookie(token,28801));
 assert.throws(()=>sessionCookie('invalid',60));
});
test('isolated SQLite sessions reject expiry, revocation and disabled accounts',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec("CREATE TABLE ape_businesses(id INTEGER PRIMARY KEY,status TEXT); INSERT INTO ape_businesses VALUES(1,'approved'),(2,'approved');");
 for(const file of ['phase8-onboarding-foundation.sql','phase8-customer-sessions.sql'])db.exec(readFileSync(new URL('../docs/'+file,import.meta.url),'utf8'));
 db.exec("INSERT INTO ape_customer_accounts(id,application_id,email,status) VALUES(1,1,'a@example.invalid','active'),(2,2,'b@example.invalid','active')");
 const insert=db.prepare('INSERT INTO ape_customer_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)');
 const a='a'.repeat(64),b='b'.repeat(64),expired='c'.repeat(64),now=Math.floor(Date.now()/1000);
 insert.run(await hashToken(a),1,now+3600);insert.run(await hashToken(b),2,now+3600);insert.run(await hashToken(expired),1,now-1);
 const adapter={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args)}}}}};
 assert.deepEqual(await verifyCustomerSession(adapter,a),{accountId:1,applicationId:1});
 assert.deepEqual(await verifyCustomerSession(adapter,b),{accountId:2,applicationId:2});
 assert.equal(await verifyCustomerSession(adapter,expired),null);
 assert.equal(await verifyCustomerSession(adapter,'invalid'),null);
 await revokeCustomerSession(adapter,a);
 assert.equal(await verifyCustomerSession(adapter,a),null);
 assert.deepEqual(await verifyCustomerSession(adapter,b),{accountId:2,applicationId:2});
 db.exec("UPDATE ape_customer_accounts SET status='disabled' WHERE id=2");
 assert.equal(await verifyCustomerSession(adapter,b),null);
 }finally{db.close();}
});
