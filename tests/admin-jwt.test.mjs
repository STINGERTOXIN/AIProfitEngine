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

test('future nbf and wrong issuer are rejected before fetching keys', async () => {
  assert.equal(await check(jwt({ ...validClaims(), nbf: now + 600 })), 0);
  assert.equal(await check(jwt({ ...validClaims(), iss: 'https://attacker.example.invalid' })), 0);
});
test('JWKS redirects, incorrect signing metadata, and oversized key responses fail closed', async () => {
  const token = jwt();
  const responses = [
    () => new Response('', { status: 302, headers: { Location: 'https://attacker.example.invalid' } }),
    () => Response.json({ keys: [{ ...jwk, alg: 'HS256' }] }),
    () => Response.json({ keys: [{ ...jwk, use: 'enc' }] }),
    () => Response.json({ keys: [{ ...jwk, kid: 'different-key' }] }),
    () => new Response(' '.repeat(65537), { status: 200 })
  ];
  for (const respond of responses) {
    globalThis.fetch = async () => respond();
    try {
      const response = await onRequestGet({
        request: new Request('https://preview.example.invalid/api/admin/subscribers', {
          headers: { 'Cf-Access-Jwt-Assertion': token }
        }),
        env
      });
      assert.equal(response.status, 403);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test('Access signing-key timeout or network rejection fails closed', async () => {
  const token = jwt();
  for (const error of [
    new DOMException('The operation was aborted', 'AbortError'),
    new TypeError('Network connection failed')
  ]) {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal, 'JWKS request must have an abort signal');
      throw error;
    };
    try {
      const response = await onRequestGet({
        request: new Request('https://preview.example.invalid/api/admin/subscribers', {
          headers: { 'Cf-Access-Jwt-Assertion': token }
        }),
        env
      });
      assert.equal(response.status, 403);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test('unauthenticated POST cannot mutate applications or send decision emails', async () => {
  let dbCalls = 0;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw Error('Unexpected external request'); };
  try {
    for (const token of [null, 'invalid.jwt.token']) {
      const headers = { 'Content-Type': 'application/json', Origin: 'https://preview.example.invalid' };
      if (token) headers['Cf-Access-Jwt-Assertion'] = token;
      const response = await onRequestPost({
        request: new Request('https://preview.example.invalid/api/admin/subscribers', {
          method: 'POST', headers, body: JSON.stringify({ id: 1, status: 'approved' })
        }),
        env: { ...env, DB: { prepare() { dbCalls++; throw Error('Unauthorized DB write'); } } }
      });
      assert.equal(response.status, 403);
    }
    assert.equal(dbCalls, 0);
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
test('authorized POST rejects oversized JSON without database writes or emails', async () => {
  let dbCalls = 0;
  let emailCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('resend.com')) { emailCalls++; throw Error('Email prohibited'); }
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
          Origin: 'https://preview.example.invalid'
        },
        body: JSON.stringify({ id: 1, status: 'approved', padding: 'x'.repeat(2200) })
      }),
      env: { ...env, DB: { prepare() { dbCalls++; throw Error('Oversized request reached DB'); } } }
    });
    assert.equal(response.status, 413);
    assert.equal(dbCalls, 0);
    assert.equal(emailCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});


test('isolated approval and rejection transitions update only pending records without email', async () => {
  const rows = new Map([
    [101, { status: 'pending', business_name: 'Synthetic One', contact_email: 'one@example.invalid' }],
    [102, { status: 'pending', business_name: 'Synthetic Two', contact_email: 'two@example.invalid' }]
  ]);
  const updates = [];
  let emailCalls = 0;
  const fakeDB = {
    prepare(sql) {
      assert.match(sql, /^UPDATE ape_businesses SET status = \? WHERE id = \? AND status = 'pending'$/);
      return {
        bind(status, id) {
          return {
            async run() {
              const row = rows.get(id);
              if (!row || row.status !== 'pending') return { meta: { changes: 0 } };
              row.status = status;
              updates.push({ id, status });
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  globalThis.fetch = async url => {
    if (String(url).includes('resend.com')) {
      emailCalls++;
      throw Error('Email must never be sent in isolated tests');
    }
    assert.equal(url, 'https://' + domain + '/cdn-cgi/access/certs');
    return Response.json({ keys: [jwk] });
  };
  const isolatedEnv = { ...env, DB: fakeDB, RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' };
  async function submit(id, status) {
    const response = await onRequestPost({
      request: new Request('https://preview.example.invalid/api/admin/subscribers', {
        method: 'POST',
        headers: {
          'Cf-Access-Jwt-Assertion': jwt(),
          'Content-Type': 'application/json',
          Origin: 'https://preview.example.invalid'
        },
        body: JSON.stringify({ id, status })
      }),
      env: isolatedEnv
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const approved = await submit(101, 'approved');
    assert.equal(approved.status, 200);
    assert.equal(approved.body.ok, true);
    assert.equal(approved.body.status, 'approved');
    assert.equal(approved.body.email.sent, false);
    const rejected = await submit(102, 'rejected');
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.ok, true);
    assert.equal(rejected.body.status, 'rejected');
    assert.equal(rejected.body.email.sent, false);
    for (const [id, status] of [[101, 'rejected'], [102, 'approved'], [999, 'approved']]) {
      const result = await submit(id, status);
      assert.equal(result.status, 409);
    }
    assert.deepEqual(updates, [{ id: 101, status: 'approved' }, { id: 102, status: 'rejected' }]);
    assert.equal(rows.get(101).status, 'approved');
    assert.equal(rows.get(102).status, 'rejected');
    assert.equal(emailCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('isolated authorized POST rejects invalid status and application ID without writes or emails', async () => {
  let dbCalls = 0;
  let emailCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('resend.com')) {
      emailCalls++;
      throw Error('Email must never be sent');
    }
    assert.equal(url, 'https://' + domain + '/cdn-cgi/access/certs');
    return Response.json({ keys: [jwk] });
  };
  try {
    for (const body of [
      { id: 1, status: 'pending' },
      { id: 1, status: 'deleted' },
      { id: -1, status: 'approved' },
      { id: '1', status: 'approved' },
      { id: 1.5, status: 'rejected' },
      { id: Number.MAX_SAFE_INTEGER + 1, status: 'approved' }
    ]) {
      const response = await onRequestPost({
        request: new Request('https://preview.example.invalid/api/admin/subscribers', {
          method: 'POST',
          headers: {
            'Cf-Access-Jwt-Assertion': jwt(),
            'Content-Type': 'application/json',
            Origin: 'https://preview.example.invalid'
          },
          body: JSON.stringify(body)
        }),
        env: { ...env, DB: { prepare() { dbCalls++; throw Error('Invalid request reached DB'); } }, RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' }
      });
      assert.equal(response.status, 400);
    }
    assert.equal(dbCalls, 0);
    assert.equal(emailCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
