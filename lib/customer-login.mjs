import {hashToken} from './onboarding.mjs';
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
// Internal only. Caller must enforce rate limits before issuing challenges.
export async function issueLoginChallenge(db,accountId){
 if(!Number.isSafeInteger(accountId)||accountId<1)return null;
 const token=randomToken(),hash=await hashToken(token);
 const expires=Math.floor(Date.now()/1000)+900;
 const result=await db.prepare("INSERT INTO ape_customer_login_challenges(token_hash,account_id,expires_at) SELECT ?,a.id,? FROM ape_customer_accounts a JOIN ape_businesses b ON b.id=a.application_id WHERE a.id=? AND a.status='active' AND b.status='approved'").bind(hash,expires,accountId).run();
 return result.meta.changes===1?{token,expires}:null;
}
export async function exchangeLoginChallenge(db,token){
 const hash=await hashToken(token);
 if(!hash)return null;
 const session=randomToken(),sessionHash=await hashToken(session);
 const maxAge=28800,expires=Math.floor(Date.now()/1000)+maxAge;
 const results=await db.batch([
  db.prepare("INSERT INTO ape_customer_sessions(token_hash,account_id,expires_at) SELECT ?,c.account_id,? FROM ape_customer_login_challenges c JOIN ape_customer_accounts a ON a.id=c.account_id JOIN ape_businesses b ON b.id=a.application_id WHERE c.token_hash=? AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at>unixepoch() AND a.status='active' AND b.status='approved'").bind(sessionHash,expires,hash),
  db.prepare("UPDATE ape_customer_login_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE token_hash=? AND changes()=1 AND consumed_at IS NULL AND revoked_at IS NULL").bind(hash)
 ]);
 return results[0].meta.changes===1&&results[1].meta.changes===1?{token:session,maxAge}:null;
}
