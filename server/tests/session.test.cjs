const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const publicDir = process.env.TAKANEKO_PUBLIC || path.join(__dirname, '../../server/public');
const source = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const api = source.slice(source.indexOf('async function api('), source.indexOf('function notice('));
const showLogin = source.slice(source.indexOf('function showLogin('), source.indexOf('async function refresh('));
const loadSession = source.slice(source.indexOf('async function loadSession('), source.indexOf("$('authRetry').addEventListener"));

function setup(response) {
  const elements = new Map();
  for (const id of ['login', 'workspace', 'authLoading', 'authRetry', 'logout']) {
    const tag = html.match(new RegExp('<[^>]+id="' + id + '"[^>]*>'))[0];
    elements.set(id, { hidden: /\bhidden\b/.test(tag), setAttribute(k, v) { this[k] = v; } });
  }
  const $ = id => { if (!elements.has(id)) elements.set(id, { replaceChildren() {}, close() {} }); return elements.get(id); };
  const context = vm.createContext({ $, basePath: '/takaneko', csrf: '', requestSerial: 0, activitySerial: 0,
    lastCount: -1, mediaItems: [], youtubeSettings: { clear() {} }, fetch: response, notice() {} });
  vm.runInContext(api + showLogin + loadSession, context);
  context.refresh = async () => {
    await context.api('/api/status');
    $('authLoading').hidden = true; $('login').hidden = true; $('workspace').hidden = false;
  };
  return { $, context };
}

test('initial HTML shows loading and hides both login and private workspace', () => {
  const { $ } = setup();
  assert.equal($('login').hidden, true);
  assert.equal($('workspace').hidden, true);
  assert.equal($('authLoading').hidden, false);
});
test('delayed valid session never reveals the login form', async () => {
  let resolve;
  const { $, context } = setup(() => new Promise(r => { resolve = r; }));
  const pending = context.loadSession();
  assert.equal($('login').hidden, true);
  assert.equal($('workspace').hidden, true);
  resolve({ status: 200, ok: true, json: async () => ({ csrf: 'test' }) });
  await pending;
  assert.equal($('login').hidden, true);
  assert.equal($('workspace').hidden, false);
  assert.equal($('authLoading').hidden, true);
});
test('401 reveals login and clears private views', async () => {
  const { $, context } = setup(async () => ({ status: 401, ok: false, json: async () => ({ error: 'Login required' }) }));
  await context.loadSession();
  assert.equal($('login').hidden, false);
  assert.equal($('workspace').hidden, true);
  assert.equal($('authLoading').hidden, true);
});
for (const failure of ['network', '503']) {
  test(`${failure} offers retry without pretending the session is invalid`, async () => {
    const { $, context } = setup(async () => {
      if (failure === 'network') throw new Error('offline');
      return { status: 503, ok: false, json: async () => ({ error: 'unavailable' }) };
    });
    await context.loadSession();
    assert.equal($('login').hidden, true);
    assert.equal($('workspace').hidden, true);
    assert.equal($('authRetry').hidden, false);
    assert.equal($('authLoading')['aria-busy'], 'false');
    context.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) });
    await context.loadSession();
    assert.equal($('workspace').hidden, false);
    assert.equal($('authLoading').hidden, true);
  });
}
