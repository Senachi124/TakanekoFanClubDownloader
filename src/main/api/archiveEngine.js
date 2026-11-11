const fs = require('fs/promises');
const path = require('path');
const { notifications, blogs, gallery, movies } = require('./takaneko');
const { processSinglePost } = require('./exportPosts');
const { handleBackupTopicsBlogs } = require('./exportBlogs');
const { handleBackupGallery } = require('./exportGallery');
const { handleBackupMovies } = require('./exportMovies');

async function run(input, state = {}, onEvent = () => {}) {
  if (input.action === 'list') {
    const posts = await notifications.listAll(input.token);
    const items = posts.filter(p => p.notificationReservationId).map(p => ({
      kind: 'post', id: String(p.notificationReservationId), title: p.title || p.subject || ''
    }));
    if (input.blogs) {
      for (let page = 1, pages = 1; page <= pages; page++) {
        const r = await blogs.list(input.token, page);
        if (!Array.isArray(r.articleList)) throw new Error('Invalid blog list');
        pages = r.totalPages || 1;
        items.push(...r.articleList.map(p => ({ kind: 'blog', id: String(p.id), title: p.title || '' })));
      }
    }
    for (const [enabled,kind,listName] of [[input.gallery,'gallery','galleryAlbumList'],[input.movies,'movie','movieList']]) {
      if (!enabled) continue;
      const source = kind === 'gallery' ? gallery : movies;
      for (let page=1,pages=1; page<=pages; page++) {
        const result=await source.list(input.token, page);
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
    const data = await notifications.detail(input.token, item.id);
    state.onDetails();
    completedFolder = await processSinglePost({ ...data, notificationReservationId: item.id }, input.directory, true);
  }
  if (completedFolder && (await fs.readFile(path.join(completedFolder,'.post-id'),'utf8')).trim() === item.id) {
    return {folder:completedFolder,member:path.basename(path.dirname(completedFolder)),title:item.title || path.basename(completedFolder)};
  }
  // A completion marker must exist before the download can be reported as complete.
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
