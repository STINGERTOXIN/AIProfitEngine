import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';

// Miniflare executes this code inside Cloudflare's workerd runtime, not Node.
// No credentials, network fetches, D1 bindings, or email providers are used.
test('workerd supports AbortSignal.timeout and rejects timed-out work', async () => {
  const mf = new Miniflare({
    modules: true,
    script: `
      export default {
        async fetch() {
          if (typeof AbortSignal.timeout !== 'function')
            return Response.json({ supported: false }, { status: 500 });
          const signal = AbortSignal.timeout(30);
          const started = Date.now();
          const outcome = await Promise.race([
            new Promise(resolve => signal.addEventListener('abort', () => resolve('aborted'), { once: true })),
            new Promise(resolve => setTimeout(() => resolve('not-aborted'), 1000))
          ]);
          return Response.json({
            supported: true,
            outcome,
            signalAborted: signal.aborted,
            reasonName: signal.reason?.name,
            elapsedMs: Date.now() - started
          });
        }
      };
    `,
  });
  try {
    const response = await mf.dispatchFetch('http://local.test/');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.supported, true);
    assert.equal(result.outcome, 'aborted');
    assert.equal(result.signalAborted, true);
    assert.equal(result.reasonName, 'TimeoutError');
    assert.ok(result.elapsedMs < 1000);
  } finally {
    await mf.dispose();
  }
});
