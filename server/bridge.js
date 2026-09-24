// Line-delimited private worker protocol. Tokens arrive over stdin, never argv/logs.
const readline = require('readline');
const fs = require('fs/promises');
const path = require('path');
const output = process.stdout.write.bind(process.stdout);
const write = value => output(JSON.stringify(value) + '\n');
process.stdout.write = () => true;
console.log = console.warn = console.error = () => {};
const { handleGetAllPosts } = require('../src/main/api/getAllPosts');
const { processSinglePost } = require('../src/main/api/exportPosts');
const { handleBackupTopicsBlogs } = require('../src/main/api/exportBlogs');

async function json(url, token) {
  const r = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Fanclub HTTP ${r.status}`);
  return r.json();
}

async function run(input) {
  if (input.action === 'list') {
    const posts = await handleGetAllPosts(input.token);
    const items = posts.filter(p => p.notificationReservationId).map(p => ({
      kind: 'post', id: String(p.notificationReservationId), title: p.title || p.subject || ''
    }));
    if (input.blogs) {
      for (let page = 1, pages = 1; page <= pages; page++) {
        const r = await json(`https://api.takanekofc.com/blog/queries/getArticleList?blogId=topics&page=${page}&categories=nuzufcwpxr5s3iip`, input.token);
        if (!Array.isArray(r.articleList)) throw new Error('Invalid blog list');
        pages = r.totalPages || 1;
        items.push(...r.articleList.map(p => ({ kind: 'blog', id: String(p.id), title: p.title || '' })));
      }
    }
    return items;
  }
  if (input.action !== 'download') throw new Error('Unknown operation');
  const item = input.item;
  if (item.kind === 'blog') {
    await handleBackupTopicsBlogs(input.token, input.directory, {}, null, item);
  } else {
    const data = await json('https://api.takanekofc.com/auth/notifications/' + encodeURIComponent(item.id), input.token);
    await processSinglePost({ ...data, notificationReservationId: item.id }, input.directory, true);
  }
  // A completion marker must exist before Python can publish any output.
  for (const member of await fs.readdir(input.directory, { withFileTypes: true })) {
    if (!member.isDirectory()) continue;
    for (const post of await fs.readdir(path.join(input.directory, member.name), { withFileTypes: true })) {
      if (!post.isDirectory() || post.name === 'pictures') continue;
      const folder = path.join(input.directory, member.name, post.name);
      try {
        if ((await fs.readFile(path.join(folder, '.post-id'), 'utf8')).trim() === item.id) {
          return { folder, member: member.name, title: item.title || post.name };
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  throw new Error('Download incomplete');
}

readline.createInterface({ input: process.stdin }).on('line', line => {
  let input;
  try { input = JSON.parse(line); } catch { return; }
  run(input).then(result => write({ id: input.requestId, result })).catch(error => {
    const http = String(error.message).match(/HTTP (\d{3})/);
    write({ id: input.requestId, error: http ? `Fanclub HTTP ${http[1]}` : 'Download failed; retry or check Fanclub token.' });
  });
});
