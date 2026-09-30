'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 128 * 1024 * 1024;
const candidates = ['catalog.json', 'members/catalog.json', 'media/members/catalog.json', 'takaneko/media/members/catalog.json'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function relativeFile(base, value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/') ||
      value.split('/').some(p => !p || p === '.' || p === '..' || /^(staging|nas-outbox)$|\.part(?:-|$)/.test(p))) {
    throw new Error('Invalid catalog relative path');
  }
  return path.resolve(base, ...value.split('/'));
}

async function readBounded(root, filename, safeFile) {
  const {file, stat} = await safeFile(root, filename);
  if (stat.size > MAX_BYTES) throw new Error('Catalog exceeds size limit');
  // A bounded read also handles files which grow after stat.
  const stream = await fs.open(file, 'r');
  try {
    const chunks = []; let size = 0;
    for await (const chunk of stream.createReadStream({autoClose:false})) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('Catalog exceeds size limit');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally { await stream.close(); }
}

async function loadCatalog(root, safeFile, mime) {
  for (const candidate of candidates) {
    const filename = path.join(root, ...candidate.split('/'));
    try { await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const base = path.dirname(filename);
    let raw = await readBounded(root, filename, safeFile);
    let catalog = JSON.parse(raw.toString('utf8'));
    if (catalog.format === 'takaneko-catalog-pointer') {
      if (catalog.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(catalog.sha256) ||
          catalog.catalog !== `.catalog/${catalog.sha256}.json` || !Number.isInteger(catalog.size) || catalog.size < 0 || catalog.size > MAX_BYTES) {
        throw new Error('Invalid catalog pointer');
      }
      raw = await readBounded(root, relativeFile(base, catalog.catalog), safeFile);
      if (raw.length !== catalog.size || hash(raw) !== catalog.sha256) throw new Error('Catalog checksum mismatch');
      catalog = JSON.parse(raw.toString('utf8'));
    }
    if (catalog.format !== 'takaneko-catalog' || catalog.schema_version !== 1 || !Array.isArray(catalog.posts) || catalog.total !== catalog.posts.length) {
      throw new Error('Unsupported catalog');
    }
    const posts = [], media = new Map(), keys = new Set();
    for (const record of catalog.posts) {
      for (const key of ['resource_key','source_id','member','kind','title','version']) {
        if (typeof record[key] !== 'string') throw new Error('Invalid catalog metadata');
      }
      if (!record.resource_key || keys.has(record.resource_key) || !Array.isArray(record.media) ||
          (record.published_at !== null && typeof record.published_at !== 'string')) throw new Error('Invalid catalog post');
      keys.add(record.resource_key);
      const post = {key:record.resource_key, sourceId:record.source_id, member:record.member, kind:record.kind,
        title:record.title, date:record.published_at, textFilename:relativeFile(base, record.text), media:[]};
      for (const item of record.media) {
        const filename = relativeFile(base, item.path), type = mime(filename);
        if (!type) continue;
        const mid = hash(root + ':' + post.key + ':' + item.path);
        if (media.has(mid)) throw new Error('Duplicate catalog media');
        media.set(mid, {id:mid,postKey:post.key,mime:type,variant:item.variant || 'original',available:true,filename});
        post.media.push(mid);
      }
      posts.push(post);
    }
    return {posts, media};
  }
  return null;
}
module.exports = {loadCatalog, relativeFile};
