import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto, generateKeyPairSync, sign } from 'node:crypto';

// Import the actual Pages Function as an ES module, without changing package settings.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = await readFile(new URL('../functions/api/admin/subscribers.js', import.meta.url), 'utf8');
const { onRequestGet, onRequestPost } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const domain = 'test-team.cloudflareaccess.com';
const env = {
  ADMIN_SUBSCRIBERS_ENABLED: 'true',
  ACCESS_TEAM_DOMAIN: domain,
  ACCESS_AUD: 'test-audience',
  ADMIN_EMAIL: 'admin@example.invalid',
  DB: {
    prepare() { throw Error('Unauthorized request reached the database'); }
  }
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';
const b64 = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const validClaims = () => ({ iss: 'https://' + domain, aud: env.ACCESS_AUD, email: env.ADMIN_EMAIL, exp: now + 300, nbf: now - 30 });
function jwt(claims = validClaims(), header = { alg: 'RS256', kid: 'test-key' }, key = privateKey) {
  const body = b64(header) + '.' + b64(claims);
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}
const originalFetch = globalThis.fetch;
async function check(token, options = {}) {
  let fetches = 0;
  globalThis.fetch = async url => {
    fetches++;
    assert.equal(url, 'https://' + domain + '/cdn-cgi/access/certs');
    return Response.json({ keys: [jwk] });
  };
  try {
    const headers = token === null ? {} : { 'Cf-Access-Jwt-Assertion': token };
    const response = await onRequestGet({ request: new Request('https://preview.example.invalid/api/admin/subscribers', { headers }), env: { ...env, ...options } });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Administrator authentication required.' });
    return fetches;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
test('missing assertion fails before key fetch and D1', async () => {
  assert.equal(await check(null), 0);
});
test('malformed assertions fail before key fetch and D1', async () => {
  for (const token of ['not-a-jwt', 'a.b.c.d', '!.a.b', 'a'.repeat(8193), b64('{') + '.' + b64(validClaims()) + '.abc']) {
    assert.equal(await check(token), 0);
  }
});
test('expired JWT is rejected before key fetch', async () => {
  assert.equal(await check(jwt({ ...validClaims(), exp: now - 60 })), 0);
});
test('wrong audience and admin identity are rejected', async () => {
  assert.equal(await check(jwt({ ...validClaims(), aud: 'other-app' })), 0);
  assert.equal(await check(jwt({ ...validClaims(), email: 'intruder@example.invalid' })), 0);
});
test('unsigned and algorithm-confusion JWTs are rejected', async () => {
  assert.equal(await check(jwt(validClaims(), { alg: 'none', kid: 'test-key' })), 0);
  assert.equal(await check(jwt(validClaims(), { alg: 'HS256', kid: 'test-key' })), 0);
});
test('forged signature with a different RSA private key is rejected', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal(await check(jwt(validClaims(), { alg: 'RS256', kid: 'test-key' }, other.privateKey)), 1);
});
test('tampered claims with unchanged signature are rejected', async () => {
  const original = jwt();
  const [head, , signature] = original.split('.');
  assert.equal(await check(head + '.' + b64({ ...validClaims(), email: env.ADMIN_EMAIL, exp: now + 500 }) + '.' + signature), 1);
});
test('missing admin configuration fails closed before authentication', async () => {
  const response = await onRequestGet({ request: new Request('https://preview.example.invalid/api/admin/subscribers'), env: { ...env, ACCESS_AUD: '' } });
  assert.equal(response.status, 503);
});
test('disabled administrator endpoint fails closed', async () => {
  const response = await onRequestGet({ request: new Request('https://preview.example.invalid/api/admin/subscribers'), env: { ...env, ADMIN_SUBSCRIBERS_ENABLED: 'false' } });
  assert.equal(response.status, 503);
});
test('invalid JWKS and key fetch failures are rejected', async () => {
  const token = jwt();
  for (const implementation of [
    async () => { throw Error('offline'); },
    async () => Response.json({ keys: [] }),
    async () => new Response('not-json', { status: 200 })
  ]) {
    globalThis.fetch = implementation;
    try {
      const response = await onRequestGet({ request: new Request('https://preview.example.invalid/api/admin/subscribers', { headers: { 'Cf-Access-Jwt-Assertion': token } }), env });
      assert.equal(response.status, 403);
    } finally { globalThis.fetch = originalFetch; }
  }
});

test('valid signed Access JWT permits read-only dashboard queries', async () => {
  const queries = [];
  const fakeDB = {
    prepare(sql) {
      queries.push(sql);
      return {
        async first() { return { total: 2, last7: 1, last30: 2 }; },
        async all() { return { results: [] }; }
      };
    }
  };
  globalThis.fetch = async url => {
    assert.equal(url, 'https://' + domain + '/cdn-cgi/access/certs');
    return Response.json({ keys: [jwk] });
  };
  try {
    const response = await onRequestGet({
      request: new Request('https://preview.example.invalid/api/admin/subscribers', {
        headers: { 'Cf-Access-Jwt-Assertion': jwt() }
      }),
      env: { ...env, DB: fakeDB }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      total: 2, last7: 1, last30: 2, recent: [], applications: []
    });
    assert.equal(queries.length, 3);
    assert.ok(queries.every(sql => /^SELECT\s/i.test(sql)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('valid signed token does not bypass POST origin validation or trigger email', async () => {
  let dbCalls = 0;
  let resendCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('resend.com')) { resendCalls++; throw Error('Email must not be sent'); }
    assert.equal(url, 'https://' + domain + '/cdn-cgi/access/certs');
    return Response.json({ keys: [jwk] });
  };
  try {
    const response = await onRequestPost({
      request: new Request('https://preview.example.invalid/api/admin/subscribers', {
        method: 'POST',
        headers: {
          'Cf-Access-Jwt-Assertion': jwt(),
          'Content-Type': 'application/json',
          Origin: 'https://untrusted.example.invalid'
        },
        body: JSON.stringify({ id: 1, status: 'approved' })
      }),
      env: { ...env, DB: { prepare() { dbCalls++; throw Error('DB must not be touched'); } } }
    });
    assert.equal(response.status, 403);
    assert.equal(dbCalls, 0);
    assert.equal(resendCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
