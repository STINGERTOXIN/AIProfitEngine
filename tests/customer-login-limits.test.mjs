import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequestPost} from '../functions/api/customer/login/request.js';
test('login limits reject abuse and hide unknown email ownership',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec("CREATE TABLE ape_businesses(id INTEGER PRIMARY KEY,status TEXT); CREATE TABLE ape_customer_accounts(id INTEGER PRIMARY KEY,application_id INTEGER,email TEXT,status TEXT);");
 db.exec(readFileSync(new URL('../docs/phase8-login-rate-limits.sql',import.meta.url),'utf8'));
 let lookups=0;
 const adapter={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),all:async()=>{lookups++;return {results:db.prepare(sql).all(...args)}}}}}}};
 const env={DB:adapter,CUSTOMER_LOGIN_ENABLED:'true',LOGIN_RATE_LIMIT_SECRET:'a'.repeat(64),ONBOARDING_ORIGIN:'https://aiprofitengine.ai'};
 const tasks=[];
 const invoke=async args=>{const response=await onRequestPost({...args,waitUntil:p=>tasks.push(p)});await Promise.all(tasks.splice(0));return response;};
 const request=(email,ip='192.0.2.1',origin=env.ONBOARDING_ORIGIN)=>new Request(env.ONBOARDING_ORIGIN+'/api/customer/login/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({email})});
 assert.equal((await invoke({request:request('a@example.invalid','192.0.2.1','https://other.invalid'),env})).status,403);
 assert.equal((await invoke({request:request('a@example.invalid'),env:{...env,LOGIN_RATE_LIMIT_SECRET:undefined}})).status,503);
 for(let i=0;i<10;i++){const r=await invoke({request:request('a@example.invalid'),env});assert.equal(r.status,202);assert.deepEqual(await r.json(),{ok:true});}
 assert.equal(lookups,3);
 assert.equal((await invoke({request:request('b@example.invalid'),env})).status,429);
 db.exec('UPDATE ape_login_rate_limits SET window_start=0');
 assert.equal((await invoke({request:request('a@example.invalid'),env})).status,202);
 assert.equal(lookups,4);
 db.exec('DELETE FROM ape_login_rate_limits');
 for(let i=0;i<100;i++){assert.equal((await invoke({request:request('a@example.invalid','192.0.2.'+(i+1)),env})).status,202);}
 assert.equal((await invoke({request:request('a@example.invalid','192.0.2.101'),env})).status,429);
 }finally{db.close();}
});
