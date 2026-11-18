'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.value = 'all';
    this.disabled = false;
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {}
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { return this.listeners.click?.(); }
}

const source = fs.readFileSync('dashboard.html', 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Dashboard inline script must exist');

test('one pending application cannot submit duplicate decisions', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let postCount = 0;
  let releasePost;
  const postGate = new Promise(resolve => { releasePost = resolve; });
  const application = {
    id: 7, business_name: 'Isolated test', contact_email: 'test@example.invalid',
    plan: 'pilot', status: 'pending', created_at: '2026-11-18'
  };
  const data = { total: 0, last7: 0, last30: 0, recent: [], applications: [application] };
  const fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      postCount++;
      await postGate;
      return { ok: true, json: async () => ({ email: { sent: false, reason: 'disabled' } }) };
    }
    return { ok: true, json: async () => data };
  };
  const context = {
    document: { getElementById: get, createElement: tag => new Element(tag) },
    fetch,
    confirm: () => true,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    Number, String, Set, Error
  };
  vm.runInNewContext(script, context, { filename: 'dashboard.html' });
  // Initial load is asynchronous. Wait for the GET response and DOM render.
  for (let i = 0; i < 20 && !get('application-rows').children.length; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  const row = get('application-rows').children[0];
  assert.ok(row, 'Pending application row rendered');
  const actions = row.children.at(-1).children[0];
  const [approve, reject] = actions.children;
  const first = approve.click();
  assert.equal(postCount, 1, 'First confirmation submits once');
  assert.equal(approve.disabled, false, 'Old detached button object is not authoritative');
  // Clicking the old reference simulates a rapid event queued before rerender.
  await approve.click();
  assert.equal(postCount, 1, 'Second click must not submit another request');
  const activeActions = get('application-rows').children[0].children.at(-1).children[0];
  assert.ok(activeActions.children.every(button => button.disabled), 'Both controls disabled in-flight');
  await activeActions.children[1].click();
  assert.equal(postCount, 1, 'Reject cannot race an in-flight approval');
  releasePost();
  await first;
  assert.equal(postCount, 1);
});

test('confirmation cancellation never submits a review', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let posts = 0;
  const context = {
    document: { getElementById: get, createElement: tag => new Element(tag) },
    fetch: async (_url, options = {}) => {
      if (options.method === 'POST') posts++;
      return { ok: true, json: async () => ({
        total: 0, last7: 0, last30: 0, recent: [],
        applications: [{ id: 8, business_name: 'Test', contact_email: 'test@example.invalid', status: 'pending' }]
      }) };
    },
    confirm: () => false,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    Number, String, Set, Error
  };
  vm.runInNewContext(script, context, { filename: 'dashboard.html' });
  for (let i = 0; i < 20 && !get('application-rows').children.length; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  const button = get('application-rows').children[0].children.at(-1).children[0].children[0];
  await button.click();
  assert.equal(posts, 0);
});
