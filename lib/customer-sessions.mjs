import {hashToken} from './onboarding.mjs';
// Internal only: no session creation from unverified account identifiers.
export const SESSION_COOKIE='__Host-ape_customer';
export async function verifyCustomerSession(db,token){
 const hash=await hashToken(token);
 if(!hash)return null;
 const row=await db.prepare("SELECT a.id AS account_id,a.application_id FROM ape_customer_sessions s JOIN ape_customer_accounts a ON a.id=s.account_id JOIN ape_businesses b ON b.id=a.application_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch() AND a.status='active' AND b.status='approved'").bind(hash).first();
 return row?{accountId:row.account_id,applicationId:row.application_id}:null;
}
export async function revokeCustomerSession(db,token){
 const hash=await hashToken(token);
 if(!hash)return;
 await db.prepare("UPDATE ape_customer_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL").bind(hash).run();
}
export function sessionCookie(token,maxAge){
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)||!Number.isSafeInteger(maxAge)||maxAge<1||maxAge>28800)throw Error('Invalid session');
 return SESSION_COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+maxAge;
}
export function clearSessionCookie(){
 return SESSION_COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
}
