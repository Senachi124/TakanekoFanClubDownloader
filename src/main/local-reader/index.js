'use strict';
// Read-only archive adapter. Indexes live in userData, never in the selected archive.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadCatalog} = require('./catalog');
const id = value => crypto.createHash('sha256').update(value).digest('hex');
const mime = file => ({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'}[path.extname(file).toLowerCase()]);
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
async function safeFile(root, filename) {
  const file = path.resolve(filename);
  if (!inside(root, file)) throw new Error('Archive path outside selected root');
  const real = await fs.realpath(file);
  if (!inside(root, real)) throw new Error('Archive symlink outside selected root');
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error('Not an archive file');
  return {file: real, stat};
}
function dateFromBody(body) {
  const raw = body.match(/\*\*Date\*\*:\s*([^\n]+)/)?.[1]?.trim();
  if (!raw) return null;
  const normalized = raw.replace(/\//g, '-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})/,(_m,y,mo,d,h,mi,s)=>`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi.padStart(2,'0')}:${s.padStart(2,'0')}`);
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : normalized + '+09:00');
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
class ArchiveReader {
  constructor(cacheDirectory) { this.cacheDirectory = cacheDirectory; this.root = ''; this.posts = []; this.media = new Map(); this.busy = null; this.offline = false; }
  async select(root) {
    if (this.busy) await this.busy;
    this.root = path.resolve(root); this.posts = []; this.media.clear(); this.source = 'scan'; this.warnings = 0;
    try { this.root = await fs.realpath(this.root); } catch { /* Retain offline mount selection. */ }
    this.cachePath = path.join(this.cacheDirectory, id(this.root) + '.json');
    try { const cache = JSON.parse(await fs.readFile(this.cachePath, 'utf8')); this.posts = cache.posts; this.media = new Map(cache.media); } catch { /* First use. */ }
    return this.scan();
  }
  async scan() {
    if (this.busy) return this.busy;
    this.busy = this.performScan().finally(() => { this.busy = null; });
    return this.busy;
  }
  async performScan() {
    if (!this.root) return this.summary();
    try {
      await fs.access(this.root);
      const catalog = await loadCatalog(this.root, safeFile, mime);
      if (catalog) {
        this.posts = catalog.posts.sort((a,b)=>(b.date || '').localeCompare(a.date || '') || a.key.localeCompare(b.key));
        this.media = catalog.media; this.offline = false; this.warnings = 0; this.source = 'catalog';
        await this.saveCache();
        return this.summary();
      }
    } catch {
      // A bad or partially mounted catalog never triggers a costly recursive NAS scan.
      this.warnings = 1;
      try { await fs.access(this.root); this.offline = false; } catch { this.offline = true; }
      return this.summary();
    }
    this.source = 'scan';
    const posts = new Map(), media = new Map(); let failures = 0;
    try {
      await fs.readdir(this.root);
      const walk = async (directory, depth = 0) => {
        if (depth > 30) return;
        let entries;
        try { entries = await fs.readdir(directory, {withFileTypes:true}); } catch { failures++; return; }
        const names = new Set(entries.map(e => e.name));
        if (names.has('record.json') || (names.has('index.md') && names.has('.post-id'))) {
          try {
            const record = names.has('record.json') ? JSON.parse(await fs.readFile((await safeFile(this.root, path.join(directory,'record.json'))).file, 'utf8')) : null;
            if (record && ![1,2].includes(record.schema_version)) throw new Error('Unsupported archive record');
            const body = await fs.readFile((await safeFile(this.root, path.resolve(directory, record?.text || 'index.md'))).file, 'utf8');
            const parts = path.relative(this.root, directory).split(path.sep);
            const category = parts.includes('GALLERY') ? 'gallery' : parts.includes('MOVIE') ? 'movie' : parts.some(p => /BLOG|TOPICS|マネージャーブログ/i.test(p)) ? 'blog' : 'post';
            const sourceId = record?.source_id || (await fs.readFile((await safeFile(this.root,path.join(directory,'.post-id'))).file,'utf8')).trim();
            const key = record?.resource_key || `takaneko:${category}:${sourceId}:v1`;
            const post = {key, sourceId, kind:record?.kind || category, title:record?.title || body.match(/^# (.+)$/m)?.[1] || path.basename(directory), member:record?.member || body.match(/\*\*Sender\*\*:\s*([^\n]+)/)?.[1]?.trim() || parts[0], date:record?.published_at || dateFromBody(body), textFilename:path.resolve(directory,record?.text || 'index.md'), body, media:[]};
            const candidates = record ? record.media || [] : entries.filter(e => e.isFile() && mime(e.name)).map(e => ({path:e.name,variant:'original'}));
            for (const item of candidates) {
              const relative = item.path || item.local_path;
              if (typeof relative !== 'string' || path.isAbsolute(relative)) continue;
              const filename = path.resolve(directory, relative);
              if (!inside(this.root, filename) || !mime(filename)) continue;
              const mediaId = id(this.root + ':' + key + ':' + relative);
              let available = false;
              try { available = (await safeFile(this.root,filename)).stat.size > 0; } catch { /* Missing / NAS-only original. */ }
              const entry = {id:mediaId, postKey:key, mime:mime(filename), variant:item.variant || 'original', available, filename};
              media.set(mediaId, entry); post.media.push(mediaId);
            }
            // Prefer a record sidecar over the duplicate legacy index inside files/.
            if (!posts.has(key) || record) posts.set(key, post);
          } catch { failures++; }
          if (names.has('record.json')) return;
        }
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.isSymbolicLink() || /^(staging|nas-outbox|pictures|\.git|node_modules)$/.test(entry.name) || entry.name.startsWith('.') || /\.part(?:-|$)/.test(entry.name)) continue;
          await walk(path.join(directory,entry.name), depth + 1);
        }
      };
      await walk(this.root);
      // A partial network scan must not erase previously indexed content.
      if (failures) for (const old of this.posts) if (!posts.has(old.key)) { posts.set(old.key, old); for (const mid of old.media) if (this.media.has(mid)) media.set(mid,{...this.media.get(mid),available:false}); }
      this.posts = [...posts.values()].sort((a,b) => (b.date || '').localeCompare(a.date || '') || a.key.localeCompare(b.key));
      this.media = media; this.offline = false; this.warnings = failures;
      await this.saveCache();
    } catch { this.offline = true; }
    return this.summary();
  }
  async saveCache() {
    await fs.mkdir(this.cacheDirectory,{recursive:true});
    await fs.writeFile(this.cachePath + '.tmp', JSON.stringify({posts:this.posts,media:[...this.media]}));
    await fs.rename(this.cachePath + '.tmp',this.cachePath);
  }
  summary() { return {root:this.root, count:this.posts.length, offline:this.offline, warnings:this.warnings || 0, source:this.source}; }
  query({member='',kind='',type='all',offset=0,multimedia=false} = {}) {
    const selected = this.posts.filter(p => (!member || p.member===member) && (!kind || p.kind===kind));
    const rows = multimedia ? selected.flatMap(p => p.media.map(mid=>this.publicMedia(mid)).filter(m=>m.variant==='original' && (type==='all' || m.mime.startsWith(type+'/'))).map(m=>({...m,title:p.title,member:p.member,date:p.date,key:p.key}))) : selected.map(({body,media,textFilename,...p})=>({...p,cover:media.map(mid=>this.publicMedia(mid)).find(m=>m.mime.startsWith('image/') && m.available)?.url || null}));
    offset = Math.max(0, Number(offset) || 0);
    return {...this.summary(), rows:rows.slice(offset,offset+48), total:rows.length, hasMore:offset+48<rows.length, members:[...new Set(this.posts.map(p=>p.member))].sort()};
  }
  publicMedia(mid) { const {filename,...entry} = this.media.get(mid); return {...entry,available:!this.offline && entry.available,url:`archive://media/${mid}`}; }
  async detail(key) {
    const post = this.posts.find(p=>p.key===key); if (!post) return null;
    const {textFilename,...result} = post;
    if (textFilename) {
      try { result.body = await fs.readFile((await safeFile(this.root,textFilename)).file,'utf8'); result.bodyAvailable = true; }
      catch { result.body = ''; result.bodyAvailable = false; }
      await Promise.all(post.media.map(async mid=>{
        const item=this.media.get(mid);
        try { item.available=(await safeFile(this.root,item.filename)).stat.size>0; } catch { item.available=false; }
      }));
    }
    return {...result,media:post.media.map(mid=>this.publicMedia(mid)).filter(m=>m.variant==='original')};
  }
  async resolve(mid) { const item=this.media.get(mid); if (!item) throw new Error('Unknown media'); return {...await safeFile(this.root,item.filename),mime:item.mime}; }
  async resolvePost(key) {
    const post=this.posts.find(p=>p.key===key);
    if(!post?.textFilename) throw new Error('Post unavailable; refresh the index');
    return {...await safeFile(this.root,post.textFilename),post};
  }
}
module.exports = {ArchiveReader,safeFile,inside,dateFromBody};
