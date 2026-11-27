const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseJwtExp,
  isTokenExpired,
  hasUsableCredentials,
  ensureFreshToken, replaceCredentials
} = require('../src/main/utils/fanclubAuth');
const { run } = require('../src/main/api/archiveEngine');

function makeJwt(exp) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.sig`;
}

function makeStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: (k, fallback) => (data.has(k) ? data.get(k) : fallback),
    set: fields => { for (const [key, value] of Object.entries(fields)) data.set(key, value); },
    get store() { return Object.fromEntries(data); },
    set store(fields) { data.clear(); this.set(fields); },
    has: k => data.has(k)
  };
}

test('JWT expiry detection and credential usability reject expired access tokens without refreshToken', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = `Bearer ${makeJwt(nowSec - 60)}`;
  const fresh = `Bearer ${makeJwt(nowSec + 600)}`;

  assert.equal(parseJwtExp(expired), nowSec - 60);
  assert.equal(isTokenExpired(expired), true);
  assert.equal(isTokenExpired(fresh), false);
  assert.equal(isTokenExpired('opaque-token'), false);

  assert.equal(hasUsableCredentials(makeStore({ token: expired })), false);
  assert.equal(hasUsableCredentials(makeStore({ token: expired, refreshToken: 'rt-1' })), true);
  assert.equal(hasUsableCredentials(makeStore({ token: fresh })), true);
});

test('ensureFreshToken refreshes expired JWT via /auth/refresh and clears dead credentials on 403', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = `Bearer ${makeJwt(nowSec - 10)}`;
  const freshJwt = makeJwt(nowSec + 900);
  const store = makeStore({ token: expired, refreshToken: 'rt-valid' });

  let calls = 0;
  const fetchMock = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.takanekofc.com/auth/refresh');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Origin, 'https://takanekofc.com');
    assert.equal(options.headers.Referer, 'https://takanekofc.com/');
    assert.deepEqual(JSON.parse(options.body), { refreshToken: 'rt-valid' });
    return Response.json({ accessToken: freshJwt });
  };

  const [t1, t2] = await Promise.all([
    ensureFreshToken(store, { fetchImpl: fetchMock }),
    ensureFreshToken(store, { fetchImpl: fetchMock })
  ]);
  assert.equal(calls, 1);
  assert.equal(t1, `Bearer ${freshJwt}`);
  assert.equal(t2, `Bearer ${freshJwt}`);
  assert.equal(store.get('token'), `Bearer ${freshJwt}`);

  const deadStore = makeStore({ token: expired, refreshToken: 'rt-dead' });
  const deadToken = await ensureFreshToken(deadStore, {
    fetchImpl: async () => new Response('{"code":"AccessDenied"}', { status: 403 })
  });
  assert.equal(deadToken, null);
  assert.equal(deadStore.has('token'), false);
  assert.equal(deadStore.has('refreshToken'), false);

  const noRefreshStore = makeStore({ token: expired });
  assert.equal(await ensureFreshToken(noRefreshStore), null);
  assert.equal(noRefreshStore.has('token'), false);
});

test('post listing sends Fanclub Origin/Referer headers and falls back if /count returns 403', async () => {
  const previous = global.fetch;
  const seen = [];
  global.fetch = async (url, options) => {
    const u = new URL(url);
    seen.push({ path: u.pathname, query: u.search, headers: options.headers });
    if (u.pathname === '/auth/notifications/count') {
      return new Response('{"code":"AccessDenied"}', { status: 403 });
    }
    if (u.pathname === '/auth/notifications') {
      return Response.json([{ notificationReservationId: 'post-42', title: 'Hi' }]);
    }
    throw new Error('Unexpected URL: ' + url);
  };
  try {
    const items = await run({ action: 'list', token: 'fixture-token', blogs: false, gallery: false, movies: false });
    assert.deepEqual(items, [{ kind: 'post', id: 'post-42', title: 'Hi' }]);
    assert.equal(seen.length, 2);
    assert.equal(seen[1].headers.Origin, 'https://takanekofc.com');
    assert.equal(seen[1].headers.Referer, 'https://takanekofc.com/');
    assert.equal(seen[1].headers.Authorization, 'Bearer fixture-token');
  } finally {
    global.fetch = previous;
  }
});

test('refresh completion belongs to the account that started it', async () => {
  for (const status of [200, 403]) {
    const store = makeStore({ refreshToken: 'fixture-old' });
    const response = Promise.withResolvers();
    const pending = ensureFreshToken(store, { fetchImpl: () => response.promise });
    replaceCredentials(store, { token: 'fixture-new-access' });
    response.resolve(Response.json({ accessToken: 'fixture-stale' }, { status }));
    assert.equal(await pending, null);
    assert.equal(store.get('token'), 'fixture-new-access');
    assert.equal(store.get('refreshToken'), null);
  }
});

test('page two refreshes a rejected access token once and retains the rotated refresh token', async t => {
  const store = makeStore({ token: 'fixture-old', refreshToken: 'fixture-refresh' });
  const pages = [];
  let refreshes = 0;
  t.mock.method(global, 'fetch', async (url, options) => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith('/count')) return Response.json({ count: 51 });
    if (endpoint.pathname === '/auth/refresh') {
      refreshes++;
      return Response.json({ accessToken: 'fixture-new', refreshToken: 'fixture-rotated' });
    }
    const offset = Number(endpoint.searchParams.get('offset'));
    pages.push([offset, options.headers.Authorization]);
    if (offset && options.headers.Authorization === 'Bearer fixture-old') return new Response(null, { status: 401 });
    const length = offset ? 1 : 50;
    return Response.json(Array.from({ length }, (_,i) => ({ notificationReservationId: String(offset+i+1) })));
  });
  const items = await run({ action: 'list', getToken: rejectedToken => ensureFreshToken(store, { rejectedToken }) });
  assert.equal(items.length, 51);
  assert.deepEqual(pages, [[0,'Bearer fixture-old'],[50,'Bearer fixture-old'],[50,'Bearer fixture-new']]);
  assert.equal(refreshes, 1);
  assert.equal(store.get('refreshToken'), 'fixture-rotated');
});
