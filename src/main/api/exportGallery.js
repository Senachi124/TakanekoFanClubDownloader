const { gallery } = require('./takaneko');
const { safeTitle, formatDateForFilename, formatTimestamp } = require('../utils/officialMedia');
const { downloadToFile } = require('./downloadToFile');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const IMAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://takanekofc.com/'
};

async function handleBackupGallery(token, rootExportPath, state, onProgress, selectedItem = null) {
  const galleryDir = path.join(rootExportPath, 'GALLERY');
  await fs.mkdir(galleryDir, { recursive: true });

  console.log('[Gallery Backup] Fetching album list...');
  let allAlbums = selectedItem ? [selectedItem] : [];
  let failed = 0;
  let page = 1;
  let totalPages = 1;

  while (!selectedItem && page <= totalPages) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    const res = await gallery.list(token, page);

    if (!Array.isArray(res.galleryAlbumList)) throw new Error('Invalid gallery list');
    totalPages = res.totalPages || 1;
    if (res.galleryAlbumList && Array.isArray(res.galleryAlbumList)) {
      allAlbums.push(...res.galleryAlbumList);
    }
    page++;
  }

  console.log(`[Gallery Backup] Total albums found: ${allAlbums.length}`);
  const total = allAlbums.length;
  let count = 0;

  for (const item of allAlbums) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    while (state && state.isPaused) {
      if (state.isCancelled) throw new Error('Cancelled by user');
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const detail = await gallery.detail(token, item.id);
      state?.onDetails?.();

      const releaseStr = formatDateForFilename(detail.displayDate || detail.createdAt);
      const title = detail.title || item.title || 'untitled';
      const folderTitle = safeTitle(title);
      const safeId = require('crypto').createHash('sha256').update(String(item.id)).digest('hex').slice(0,12);
      const albumFolder = path.join(galleryDir, `${releaseStr}_${folderTitle}__${safeId}`);
      await fs.mkdir(albumFolder, { recursive: true });
      const marker = path.join(albumFolder, '.post-id');
      try { if ((await fs.readFile(marker,'utf8')).trim() === String(item.id)) { count++; if(onProgress) onProgress(count,total); continue; } } catch(e) { if(e.code !== 'ENOENT') throw e; }
      let incomplete = false;

      // 封面下載
      let coverMd = '';
      if (detail.thumbnail) {
        const thumbUrl = detail.thumbnail.startsWith('http')
          ? detail.thumbnail
          : `https://takanekofc.com/${detail.thumbnail.replace(/^\//, '')}`;
        const localThumb = path.join(albumFolder, 'cover.jpg');
        if (!fsSync.existsSync(localThumb)) {
          try {
            await downloadToFile(thumbUrl, localThumb, IMAGE_HEADERS);
          } catch (e) {
            incomplete = true;
            console.warn(`[Gallery Backup] Failed to download cover for ${folderTitle}:`, e.message);
          }
        }
        coverMd = `![Cover](cover.jpg)\n\n`;
      }

      // 相片下載
      let imagesMd = '';
      if (!Array.isArray(detail.galleryAlbumItems)) throw new Error('Invalid gallery photos');
      const items = detail.galleryAlbumItems;
      console.log(`[Gallery Backup] Downloading ${items.length} photos for: ${folderTitle}`);

      for (let i = 0; i < items.length; i++) {
        const photo = items[i];
        if (state?.isCancelled) throw new Error('Cancelled by user');
        while (state?.isPaused) { if(state.isCancelled) throw new Error('Cancelled by user'); await new Promise(r=>setTimeout(r,500)); }
        if (!photo.file) throw new Error('Missing gallery photo');

        const photoUrl = photo.file.startsWith('http')
          ? photo.file
          : `https://takanekofc.com/${photo.file.replace(/^\//, '')}`;

        const filename = `${String(i + 1).padStart(3, '0')}${path.extname(new URL(photoUrl).pathname).match(/^\.(?:jpe?g|png|webp|gif)$/i)?.[0] || '.jpg'}`;
        const localPhotoPath = path.join(albumFolder, filename);

        if (!fsSync.existsSync(localPhotoPath)) {
          try {
            await downloadToFile(photoUrl, localPhotoPath, IMAGE_HEADERS);
          } catch (e) {
            incomplete = true;
            console.warn(`[Gallery Backup] Failed photo ${filename}:`, e.message);
          }
        }
        imagesMd += `![${filename}](${filename})\n\n`;
      }

      // 產生 Markdown
      const desc = detail.description || item.description || '';
      const mdContent = `# ${title}\n\n` +
        `**Date**: ${formatTimestamp(detail.displayDate || detail.createdAt)}\n` +
        `**Photos Count**: ${items.length}\n\n` +
        `---\n\n` +
        `${desc}\n\n` +
        `---\n\n` +
        `${coverMd}` +
        `${imagesMd}`;

      await fs.writeFile(path.join(albumFolder, 'index.md'), mdContent, 'utf-8');
      if (incomplete) throw new Error('One or more gallery media downloads failed');
      await fs.writeFile(marker,String(item.id),'utf8');
      if (selectedItem) return albumFolder;

    } catch (err) {
      if (selectedItem || state?.isCancelled) throw err;
      failed++;
      console.error(`[Gallery Backup] Error processing album ${item.id}:`, err.message);
    }

    count++;
    if (onProgress) {
      onProgress(count, total);
    }
  }

  if (failed) throw new Error(`${failed} gallery items incomplete; retry to finish`);
  console.log('[Gallery Backup] All albums backup completed.');
}

module.exports = { handleBackupGallery };
