const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { normalizeConcurrency } = require('../src/main/utils/concurrency');
const net = require('../src/main/utils/network');
const { withVideoSlot } = require('../src/main/utils/videoQueue');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { processSinglePost } = require('../src/main/api/exportPosts');

test('concurrency accepts 100 and bounds invalid input', () => {
  assert.equal(normalizeConcurrency(100), 100);
  assert.equal(normalizeConcurrency(500), 100);
  assert.equal(normalizeConcurrency(0), 1);
  assert.equal(normalizeConcurrency('invalid'), 5);
});

test('headless network adapter carries auth and preserves response bytes', async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url.href, 'https://example.test/image');
    assert.equal(options.headers.Authorization, 'test-only');
    return new Response(Buffer.from([0, 1, 128, 255]), { status: 200 });
  };
  try {
    const request = net.request('https://example.test/image');
    request.setHeader('Authorization', 'test-only');
    const responsePromise = once(request, 'response');
    request.end();
    const [response] = await responsePromise;
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from([0, 1, 128, 255]));
  } finally { global.fetch = original; }
});

test('video queue releases slots after failure without exceeding two processes', async () => {
  let active = 0, peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => withVideoSlot(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (index === 2) throw new Error('simulated encoder failure');
  })));
  assert.equal(peak, 2);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});

test('headless exporter completes text posts and refuses partial media publication', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'takaneko-export-'));
  const originalFetch = global.fetch;
  try {
    await processSinglePost({ title: 'Fixture', message: '<p>Saved text</p>', notificationReservationId: 'text-fixture', createdAt: 1700000000000 }, root, true);
    const member = (await fs.readdir(root))[0];
    const folders = (await fs.readdir(path.join(root, member))).filter(name => name !== 'pictures');
    const post = path.join(root, member, folders[0]);
    assert.equal(await fs.readFile(path.join(post, '.post-id'), 'utf8'), 'text-fixture');
    assert.match(await fs.readFile(path.join(post, 'index.md'), 'utf8'), /Saved text/);
    global.fetch = async () => new Response('Unavailable', { status: 503 });
    await assert.rejects(processSinglePost({ title: 'Incomplete', image01: 'https://example.test/image.jpg', notificationReservationId: 'failed-fixture', createdAt: 1700000000000 }, root, true), /media downloads failed/);
    const incomplete = (await fs.readdir(path.join(root, member))).find(name => name.endsWith('_Incomplete'));
    await assert.rejects(fs.access(path.join(root, member, incomplete, '.post-id')), { code: 'ENOENT' });
  } finally {
    global.fetch = originalFetch;
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('takaneko-export-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
