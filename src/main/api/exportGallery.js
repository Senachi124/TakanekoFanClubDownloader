const { net } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

function formatDateForFilename(ms) {
  const d = new Date(ms || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function formatTimestamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '-');
}

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET'
    });
    if (token) {
      // 修正：避免重複加上 Bearer
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      request.setHeader('Authorization', authHeader);
    }
    request.setHeader('Accept', 'application/json, text/plain, */*');
    request.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    let body = '';
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} while fetching ${url}`));
        return;
      }
      response.on('data', chunk => body += chunk.toString('utf-8'));
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET'
    });
    request.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    request.setHeader('Referer', 'https://takanekofc.com/');

    const chunks = [];
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} while downloading ${url}`));
        return;
      }
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
    request.end();
  });
}

async function handleBackupGallery(token, rootExportPath, state, onProgress) {
  const galleryDir = path.join(rootExportPath, 'GALLERY');
  await fs.mkdir(galleryDir, { recursive: true });

  console.log('[Gallery Backup] Fetching album list...');
  let allAlbums = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    const listUrl = `https://api.takanekofc.com/gallery/queries/getGalleryAlbumList?page=${page}&pageSize=20`;
    const res = await fetchJson(listUrl, token);

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
      const detailUrl = `https://api.takanekofc.com/gallery/queries/getGalleryAlbumDetail/${item.id}`;
      const detail = await fetchJson(detailUrl, token);

      const releaseStr = formatDateForFilename(detail.displayDate || detail.createdAt);
      const safeTitle = (detail.title || item.title || 'untitled').replace(/[/\\:*?"<>|]/g, '_').trim();
      const albumFolder = path.join(galleryDir, `${releaseStr}_${safeTitle}`);
      await fs.mkdir(albumFolder, { recursive: true });

      // 封面下載
      let coverMd = '';
      if (detail.thumbnail) {
        const thumbUrl = detail.thumbnail.startsWith('http')
          ? detail.thumbnail
          : `https://takanekofc.com/${detail.thumbnail.replace(/^\//, '')}`;
        const localThumb = path.join(albumFolder, 'cover.jpg');
        if (!fsSync.existsSync(localThumb)) {
          try {
            const buf = await downloadBinary(thumbUrl);
            await fs.writeFile(localThumb, buf);
          } catch (e) {
            console.warn(`[Gallery Backup] Failed to download cover for ${safeTitle}:`, e.message);
          }
        }
        coverMd = `![Cover](cover.jpg)\n\n`;
      }

      // 相片下載
      let imagesMd = '';
      const items = detail.galleryAlbumItems || [];
      console.log(`[Gallery Backup] Downloading ${items.length} photos for: ${safeTitle}`);

      for (let i = 0; i < items.length; i++) {
        const photo = items[i];
        if (!photo.file) continue;

        const photoUrl = photo.file.startsWith('http')
          ? photo.file
          : `https://takanekofc.com/${photo.file.replace(/^\//, '')}`;

        const filename = `${String(photo.displayOrder || (i + 1)).padStart(3, '0')}.jpg`;
        const localPhotoPath = path.join(albumFolder, filename);

        if (!fsSync.existsSync(localPhotoPath)) {
          try {
            const buf = await downloadBinary(photoUrl);
            await fs.writeFile(localPhotoPath, buf);
          } catch (e) {
            console.warn(`[Gallery Backup] Failed photo ${filename}:`, e.message);
          }
        }
        imagesMd += `![${filename}](${filename})\n\n`;
      }

      // 產生 Markdown
      const desc = detail.description || item.description || '';
      const mdContent = `# ${detail.title}\n\n` +
        `**Release Date**: ${formatTimestamp(detail.displayDate || detail.createdAt)}\n` +
        `**Photos Count**: ${items.length}\n\n` +
        `---\n\n` +
        `${desc}\n\n` +
        `---\n\n` +
        `${coverMd}` +
        `${imagesMd}`;

      await fs.writeFile(path.join(albumFolder, 'index.md'), mdContent, 'utf-8');

    } catch (err) {
      console.error(`[Gallery Backup] Error processing album ${item.id}:`, err.message);
    }

    count++;
    if (onProgress) {
      onProgress(count, total);
    }
  }

  console.log('[Gallery Backup] All albums backup completed.');
}

module.exports = { handleBackupGallery };