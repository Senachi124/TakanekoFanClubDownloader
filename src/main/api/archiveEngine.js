const fs = require('fs/promises');
const path = require('path');
const { handleGetAllPosts } = require('./getAllPosts');
const { processSinglePost } = require('./exportPosts');
const { handleBackupTopicsBlogs } = require('./exportBlogs');
const { handleBackupGallery } = require('./exportGallery');
const { handleBackupMovies } = require('./exportMovies');

async function json(url, token) {
  const r = await fetch(url, { headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Fanclub HTTP ${r.status}`);
  return r.json();
}

async function run(input, state = {}, onEvent = () => {}) {
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
    for (const [enabled,kind,listName] of [[input.gallery,'gallery','galleryAlbumList'],[input.movies,'movie','movieList']]) {
      if (!enabled) continue;
      const endpoint = kind === 'gallery' ? 'getGalleryAlbumList' : 'getMovieList';
      for (let page=1,pages=1; page<=pages; page++) {
        const result=await json(`https://api.takanekofc.com/${kind}/queries/${endpoint}?page=${page}&pageSize=20`,input.token);
        if (!Array.isArray(result[listName])) throw new Error(`Invalid ${kind} list`);
        pages=result.totalPages || 1;
        items.push(...result[listName].map(item=>({kind,id:String(item.id),title:item.title || ''})));
      }
    }
    return items;
  }
  if (input.action !== 'download') throw new Error('Unknown operation');
  const item = input.item;
  let completedFolder;
  state = Object.assign(Object.create(state), {onDetails: () => onEvent({stage:'details'})});
  if (item.kind === 'gallery' || item.kind === 'movie') {
    const exporter = item.kind === 'gallery' ? handleBackupGallery : handleBackupMovies;
    completedFolder = await exporter(input.token,input.directory,state,null,item);
  } else if (item.kind === 'blog') {
    completedFolder = await handleBackupTopicsBlogs(input.token, input.directory, state, null, item);
  } else {
    const data = await json('https://api.takanekofc.com/auth/notifications/' + encodeURIComponent(item.id), input.token);
    state.onDetails();
    completedFolder = await processSinglePost({ ...data, notificationReservationId: item.id }, input.directory, true);
  }
  if (completedFolder && (await fs.readFile(path.join(completedFolder,'.post-id'),'utf8')).trim() === item.id) {
    return {folder:completedFolder,member:path.basename(path.dirname(completedFolder)),title:item.title || path.basename(completedFolder)};
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


module.exports = {run};
