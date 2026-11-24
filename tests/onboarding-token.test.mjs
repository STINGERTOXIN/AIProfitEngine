import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { hashToken } from '../lib/onboarding.mjs';
if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{value:webcrypto});
test('hash matches SHA-256', async () => {
  const token = 'ab'.repeat(32);
  assert.equal(await hashToken(token), createHash('sha256').update(token).digest('hex'));
});
test('malformed tokens rejected', async () => {
  for (const token of [null, undefined, 123, '', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)]) {
    assert.equal(await hashToken(token), null);
  }
});
test('different tokens have different hashes', async () => {
  assert.notEqual(await hashToken('a'.repeat(64)), await hashToken('b'.repeat(64)));
});
