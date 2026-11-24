// Internal primitives only. No public route or session issuance.
export async function hashToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
export async function issueInvitation(db, applicationId) {
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) throw new Error('Invalid application');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
  const hash = await hashToken(token);
  const expires = Math.floor(Date.now()/1000)+86400;
  const results = await db.batch([
    db.prepare("INSERT INTO ape_customer_accounts(application_id,email) SELECT id,contact_email FROM ape_businesses WHERE id=? AND status='approved' ON CONFLICT(application_id) DO NOTHING").bind(applicationId),
    db.prepare("UPDATE ape_activation_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE consumed_at IS NULL AND revoked_at IS NULL AND account_id IN (SELECT a.id FROM ape_customer_accounts a JOIN ape_businesses b ON b.id=a.application_id WHERE a.application_id=? AND a.status='invited' AND b.status='approved')").bind(applicationId),
    db.prepare("INSERT INTO ape_activation_tokens(token_hash,account_id,expires_at) SELECT ?,a.id,? FROM ape_customer_accounts a JOIN ape_businesses b ON b.id=a.application_id WHERE a.application_id=? AND a.status='invited' AND b.status='approved'").bind(hash,expires,applicationId)
  ]);
  if (results[2].meta.changes !== 1) return null;
  return {token, expires};
}
export async function activateInvitation(db, token) {
  const hash = await hashToken(token);
  if (!hash) return false;
  const results = await db.batch([
    db.prepare("UPDATE ape_customer_accounts SET status='active',activated_at=CURRENT_TIMESTAMP WHERE status='invited' AND id IN (SELECT t.account_id FROM ape_activation_tokens t JOIN ape_customer_accounts a ON a.id=t.account_id JOIN ape_businesses b ON b.id=a.application_id WHERE t.token_hash=? AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>unixepoch() AND b.status='approved')").bind(hash),
    db.prepare("UPDATE ape_activation_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE token_hash=? AND changes()=1 AND consumed_at IS NULL AND revoked_at IS NULL").bind(hash)
  ]);
  return results[0].meta.changes === 1 && results[1].meta.changes === 1;
}
