const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { notifications, blogs, gallery, movies } = require('../src/main/api/takaneko');
const { getJson } = require('../src/main/api/takaneko/client');
const { API_REQUEST_PATTERN } = require('../src/main/api/takaneko/config');

test('Fanclub resources route all endpoints with encoded IDs, queries and one Bearer header', async () => {
  const previous = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return Response.json({ fixture: true });
  };
  try {
    const id = 'example/id?part=2#fragment';
    const cases = [
      [() => notifications.count('fixture'), '/auth/notifications/count', {}],
      [() => notifications.list('Bearer fixture', 42), '/auth/notifications', { offset: '0', limit: '42', orderType: '2', readType: 'all' }],
      [() => notifications.detail('fixture', id), '/auth/notifications/' + encodeURIComponent(id), {}],
      [() => blogs.list('Bearer fixture', 3), '/blog/queries/getArticleList', { blogId: 'topics', page: '3', categories: 'nuzufcwpxr5s3iip' }],
      [() => blogs.detail('fixture', id), '/blog/queries/getArticleDetail/' + encodeURIComponent(id), {}],
      [() => gallery.list('fixture', 2), '/gallery/queries/getGalleryAlbumList', { page: '2', pageSize: '20' }],
      [() => gallery.detail('Bearer fixture', id), '/gallery/queries/getGalleryAlbumDetail/' + encodeURIComponent(id), {}],
      [() => movies.list('fixture', 4), '/movie/queries/getMovieList', { page: '4', pageSize: '20' }],
      [() => movies.detail('Bearer fixture', id), '/movie/queries/getMovieDetail/' + encodeURIComponent(id), {}]
    ];
    for (const [call, pathname, query] of cases) {
      assert.deepEqual(await call(), { fixture: true });
      const { url, options } = requests.at(-1);
      assert.equal(url.origin, 'https://api.takanekofc.com');
      assert.equal(url.pathname, pathname);
      assert.deepEqual(Object.fromEntries(url.searchParams), query);
      assert.equal(url.hash, '');
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.ok(options.headers.Accept.includes('application/json'));
      assert.equal(options.signal.aborted, false);
      if (/gallery|movie/.test(pathname)) assert.ok(options.headers['User-Agent']);
    }
    assert.equal(API_REQUEST_PATTERN, 'https://api.takanekofc.com/*');
  } finally { global.fetch = previous; }
});

test('notification listing preserves count fallbacks and array/items/data envelopes', async () => {
  const previous = global.fetch;
  const post = { notificationReservationId: 'example-post' };
  try {
    for (const [totals, envelope, limit] of [
      [{ count: 2 }, [post], '2'],
      [{ total: 7 }, { items: [post] }, '7'],
      [{}, { data: [post] }, '1000'],
      [{ count: 0 }, {}, '1000']
    ]) {
      global.fetch = async url => {
        const target = new URL(url);
        if (target.pathname.endsWith('/count')) return Response.json(totals);
        assert.equal(target.searchParams.get('limit'), limit);
        assert.equal(target.searchParams.has('notificationType'), false);
        return Response.json(envelope);
      };
      assert.deepEqual(await notifications.listAll('fixture'), Object.keys(envelope).length ? [post] : []);
    }
  } finally { global.fetch = previous; }
});

test('Fanclub client rejects foreign origins and reports HTTP/JSON failures without response contents', async () => {
  const previous = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('synthetic private body', { status: 403 }); };
  try {
    for (const endpoint of ['https://example.com/api', '//example.com/api', 'https://user:password@api.takanekofc.com/api']) {
      await assert.rejects(getJson(endpoint, 'fixture'), /Invalid Fanclub API endpoint/);
    }
    assert.equal(calls, 0);
    await assert.rejects(notifications.count('fixture'), error => error.message === 'Fanclub HTTP 403');
    global.fetch = async () => new Response('synthetic invalid JSON');
    await assert.rejects(blogs.detail('fixture', 'example'), error => error.message === 'Invalid Fanclub JSON response');
    const failure = new Error('fixture network failure');
    global.fetch = async () => { throw failure; };
    await assert.rejects(movies.detail('fixture', 'example'), error => error === failure);
  } finally { global.fetch = previous; }
});

test('Fanclub timeout covers both response headers and JSON body reading', async () => {
  const previous = global.fetch;
  const untilAbort = signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    global.fetch = async (url, { signal }) => untilAbort(signal);
    await assert.rejects(notifications.detail('fixture', 'example', { timeoutMs: 15 }), { code: 'TIMEOUT' });
    global.fetch = async (url, { signal }) => ({ status: 200, json: () => untilAbort(signal) });
    await assert.rejects(notifications.detail('fixture', 'example', { timeoutMs: 15 }), { code: 'TIMEOUT' });
  } finally { global.fetch = previous; }
});

test('engine and legacy notification helpers use the resource layer without changing archive output', async () => {
  const { run } = require('../src/main/api/archiveEngine');
  const { handleGetAllPosts } = require('../src/main/api/getAllPosts');
  const { handleGetPostDetails } = require('../src/main/api/getPostDetails');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'takaneko-api-'));
  const previous = global.fetch;
  const seen = [];
  global.fetch = async (url, { headers }) => {
    const target = new URL(url); seen.push(target.pathname);
    assert.equal(headers.Authorization, 'Bearer fixture');
    if (target.pathname.endsWith('/count')) return Response.json({ count: 1 });
    if (target.pathname === '/auth/notifications') return Response.json([{ notificationReservationId: 'example-post' }]);
    if (target.pathname === '/auth/notifications/example-post') return Response.json({ title: 'Example', body: '<p>Example text</p>' });
    throw new Error('Unexpected fixture endpoint');
  };
  try {
    const list = await handleGetAllPosts('fixture');
    assert.equal((await handleGetPostDetails('fixture', list, root, {}))[0].notificationReservationId, 'example-post');
    const items = await run({ action: 'list', token: 'fixture' });
    let details = 0;
    const result = await run({ action: 'download', token: 'fixture', item: items[0], directory: root }, {}, () => details++);
    assert.equal(details, 1);
    assert.equal(await fs.readFile(path.join(result.folder, '.post-id'), 'utf8'), 'example-post');
    assert.match(await fs.readFile(path.join(result.folder, 'index.md'), 'utf8'), /Example text/);
    const requestCount = seen.length;
    assert.deepEqual(await handleGetPostDetails('fixture', list, root, {}), []);
    assert.equal(seen.length, requestCount);
  } finally {
    global.fetch = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
