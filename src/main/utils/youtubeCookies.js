const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Accept only domain-scoped Netscape cookies, never arbitrary headers or tool options.
function normalize(text, now = Date.now() / 1000) {
  const invalid = () => { throw new Error('YOUTUBE_COOKIES_INVALID'); };
  if (typeof text !== 'string' || Buffer.byteLength(text) > 512 * 1024) invalid();
  const rows = [];
  for (let line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.startsWith('#HttpOnly_')) line = line.slice(10);
    else if (!line.trim() || line.startsWith('#')) continue;
    const p = line.split('\t');
    if (p.length !== 7) invalid();
    const [domain, include, cookiePath, secure, expires, name, value] = p;
    if (!/^(?:\.?youtube\.com|www\.youtube\.com)$/.test(domain)) continue;
    if (!['TRUE','FALSE'].includes(include) || !['TRUE','FALSE'].includes(secure)
        || !/^\d+$/.test(expires) || !Number.isSafeInteger(Number(expires))
        || !cookiePath.startsWith('/') || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
        || p.some(v => /[\x00-\x1f\x7f]/.test(v)) || value.length > 16384) invalid();
    if (Number(expires) > 0 && Number(expires) <= now) continue;
    rows.push(p.join('\t'));
    if (rows.length > 1000) invalid();
  }
  if (!rows.length) invalid();
  return '# Netscape HTTP Cookie File\n' + rows.join('\n') + '\n';
}
function credentialPath() {
  if (process.versions.electron) return path.join(require('electron').app.getPath('userData'), 'youtube-cookies.txt');
  return process.env.TAKANEKO_YOUTUBE_COOKIES || null;
}
function status(file = credentialPath()) { return {configured: !!file && fs.existsSync(file)}; }
function save(text, file = credentialPath()) {
  const value = normalize(text);
  if (!file) throw new Error('YOUTUBE_COOKIES_UNAVAILABLE');
  const temp = file + '.' + crypto.randomBytes(12).toString('hex');
  try { fs.writeFileSync(temp, value, {mode:0o600, flag:'wx'}); fs.renameSync(temp, file); }
  finally { fs.rmSync(temp, {force:true}); }
  return status(file);
}
function remove(file = credentialPath()) { if (file) fs.rmSync(file, {force:true}); return {configured:false}; }
async function withSnapshot(source, run, file = credentialPath()) {
  if (source.type !== 'youtube' || !file) return run([]);
  let value;
  try { value = normalize(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return run([]); throw new Error('YOUTUBE_COOKIES_INVALID'); }
  // yt-dlp rewrites its cookie jar: give each invocation a private disposable copy.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'takaneko-youtube-'));
  try {
    const snapshot = path.join(directory, 'cookies.txt');
    fs.writeFileSync(snapshot, value, {mode:0o600, flag:'wx'});
    return await run(['--cookies', snapshot]);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
}
module.exports = {normalize, credentialPath, status, save, remove, withSnapshot};
if (require.main === module) {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { text += chunk; if (Buffer.byteLength(text) > 512*1024) process.exit(2); });
  process.stdin.on('end', () => { try { process.stdout.write(normalize(text)); } catch { process.exitCode = 2; } });
}
