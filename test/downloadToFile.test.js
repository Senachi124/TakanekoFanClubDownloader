const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

async function fixture(t, fetch) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'takaneko-download-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filename = path.resolve(__dirname, '../src/main/api/downloadToFile.js');
  const source = await fs.readFile(filename, 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, require: name => name === 'electron' ? { net: { fetch } } : require(name),
    AbortController, setTimeout, clearTimeout
  }, { filename });
  return { dir, target: path.join(dir, 'image.jpg'), download: module.exports.downloadToFile };
}

test('streams content and forwards headers, leaving only the complete file', async t => {
  const f = await fixture(t, async (url, init) => {
    assert.equal(url, 'https://example.test/image');
    assert.equal(init.headers.Referer, 'https://takanekofc.com/');
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('first'));
        controller.enqueue(Buffer.from('second'));
        controller.close();
      }
    }));
  });
  await f.download('https://example.test/image', f.target, { Referer: 'https://takanekofc.com/' });
  assert.equal(await fs.readFile(f.target, 'utf8'), 'firstsecond');
  assert.deepEqual(await fs.readdir(f.dir), ['image.jpg']);
});

test('HTTP error preserves an existing destination and cancels response', async t => {
  let cancelled = false;
  const f = await fixture(t, async () => new Response(new ReadableStream({
    cancel() { cancelled = true; }
  }), { status: 403 }));
  await fs.writeFile(f.target, 'original');
  await assert.rejects(f.download('https://example.test/image', f.target), /HTTP 403/);
  assert.equal(cancelled, true);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'original');
  assert.deepEqual(await fs.readdir(f.dir), ['image.jpg']);
});

test('rejects declared oversized files before creating output', async t => {
  const f = await fixture(t, async () => new Response('small', { headers: { 'content-length': '101' } }));
  await assert.rejects(f.download('https://example.test/image', f.target, {}, { maxBytes: 100 }), /byte limit/);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('enforces size limit on streamed bytes without Content-Length', async t => {
  const f = await fixture(t, async () => new Response('too large'));
  await assert.rejects(f.download('https://example.test/image', f.target, {}, { maxBytes: 3 }), /byte limit/);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('times out before response headers arrive', async t => {
  const f = await fixture(t, (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  await assert.rejects(f.download('https://example.test/image', f.target, {}, { timeoutMs: 30 }), /timeout/);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('times out a stalled body, cancels stream and removes partial file', async t => {
  let cancelled = false;
  const f = await fixture(t, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(Buffer.from('partial')); },
    cancel() { cancelled = true; }
  })));
  await assert.rejects(f.download('https://example.test/image', f.target, {}, { timeoutMs: 30 }), /timeout/);
  assert.equal(cancelled, true);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('interrupted response removes partial file', async t => {
  const f = await fixture(t, async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('partial'));
      setTimeout(() => controller.error(new Error('connection reset')), 20);
    }
  })));
  await assert.rejects(f.download('https://example.test/image', f.target), /connection reset/);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('disk rename error cleans up temporary file', async t => {
  const f = await fixture(t, async () => new Response('complete'));
  await fs.mkdir(f.target);
  await assert.rejects(f.download('https://example.test/image', f.target));
  assert.deepEqual(await fs.readdir(f.dir), ['image.jpg']);
  assert.equal((await fs.stat(f.target)).isDirectory(), true);
});
