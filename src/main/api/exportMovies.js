const net = require('../utils/network');
const { safeTitle, formatDateForFilename, formatTimestamp } = require('../utils/officialMedia');
const { downloadToFile } = require('./downloadToFile');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getYtDlpConfig } = require('../utils/mediaTools');
const { withVideoSlot } = require('../utils/videoQueue');

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    if (token) {
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

const IMAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://takanekofc.com/'
};

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false, windowsHide: true });

    proc.stdout.on('data', d => process.stdout.write(d.toString()));
    proc.stderr.on('data', d => process.stderr.write(d.toString()));

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Command '${cmd}' not found. Please ensure it is installed and added to PATH.`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * 直接下載原生最高畫質，並以 remux (無損直通) 封裝為 MP4
 */
async function downloadWithYtDlp(vimeoId, destPath) {
  if (!/^[0-9]+(?:[/?]h?=?[a-f0-9]+)?$/i.test(String(vimeoId))) throw new Error('Invalid Vimeo ID');
  const videoUrl = `https://player.vimeo.com/video/${vimeoId}`;

  console.log(`\n[Movie yt-dlp] Downloading source quality (remux to mp4): ${videoUrl}`);
  const ytdlpArgs = [
    '--referer', 'https://takanekofc.com/',
    '--concurrent-fragments', '5',
    '-S', 'res,fps',
    '-f', 'bestvideo+bestaudio/best',
    '--remux-video', 'mp4',
    '-o', destPath,
    videoUrl
  ];
  const tools = getYtDlpConfig();
  if(tools.ffmpegLocation) ytdlpArgs.unshift('--ffmpeg-location',tools.ffmpegLocation);
  await withVideoSlot(()=>runCommand(tools.command, ytdlpArgs));
  console.log(`[Movie] Saved original quality video: ${destPath}\n`);
}

async function handleBackupMovies(token, rootExportPath, state, onProgress, selectedItem = null) {
  const moviesDir = path.join(rootExportPath, 'MOVIE');
  await fs.mkdir(moviesDir, { recursive: true });

  console.log('[Movie Backup] Fetching movie list...');
  let allMovies = selectedItem ? [selectedItem] : [];
  let failed = 0;
  let page = 1;
  let totalPages = 1;

  while (!selectedItem && page <= totalPages) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    const listUrl = `https://api.takanekofc.com/movie/queries/getMovieList?page=${page}&pageSize=20`;
    const res = await fetchJson(listUrl, token);

    if (!Array.isArray(res.movieList)) throw new Error('Invalid movie list');
    totalPages = res.totalPages || 1;
    if (res.movieList && Array.isArray(res.movieList)) {
      allMovies.push(...res.movieList);
    }
    page++;
  }

  console.log(`[Movie Backup] Total movies found: ${allMovies.length}`);
  const total = allMovies.length;
  let count = 0;

  for (const item of allMovies) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    while (state && state.isPaused) {
      if (state.isCancelled) throw new Error('Cancelled by user');
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const detailUrl = `https://api.takanekofc.com/movie/queries/getMovieDetail/${encodeURIComponent(item.id)}`;
      const detail = await fetchJson(detailUrl, token);
      state?.onDetails?.();

      const releaseStr = formatDateForFilename(detail.displayDate || detail.createdAt);
      const title = detail.title || item.title || 'untitled';
      const folderTitle = safeTitle(title);
      const safeId = require('crypto').createHash('sha256').update(String(item.id)).digest('hex').slice(0,12);
      const movieFolder = path.join(moviesDir, `${releaseStr}_${folderTitle}__${safeId}`);
      await fs.mkdir(movieFolder, { recursive: true });
      const marker = path.join(movieFolder, '.post-id');
      try { if ((await fs.readFile(marker,'utf8')).trim() === String(item.id)) { count++; if(onProgress) onProgress(count,total); continue; } } catch(e) { if(e.code !== 'ENOENT') throw e; }
      let incomplete = false;

      // 封面圖
      let thumbMd = '';
      if (detail.thumbnail) {
        const thumbUrl = detail.thumbnail.startsWith('http')
          ? detail.thumbnail
          : `https://takanekofc.com/${detail.thumbnail.replace(/^\//, '')}`;
        const thumbExt = path.extname(thumbUrl.split('?')[0]) || '.png';
        const localThumb = path.join(movieFolder, `cover${thumbExt}`);
        if (!fsSync.existsSync(localThumb)) {
          try {
            await downloadToFile(thumbUrl, localThumb, IMAGE_HEADERS);
          } catch (e) {
            incomplete = true;
            console.warn(`[Movie Backup] Failed to download thumbnail:`, e.message);
          }
        }
        thumbMd = `![Thumbnail](cover${thumbExt})\n\n`;
      }

      // 影片下載 (最高原生畫質)
      const vimeoId = detail.videoId;
      if (!vimeoId) throw new Error('Missing video ID');
      const videoFilename = 'video.mp4';
      const localVideoPath = path.join(movieFolder, videoFilename);

      if (vimeoId && !fsSync.existsSync(localVideoPath)) {
        console.log(`[Movie Backup] Starting download for: ${folderTitle} (${vimeoId})`);
        await downloadWithYtDlp(vimeoId, localVideoPath);
      }

      if (!(await fs.stat(localVideoPath)).size) throw new Error('Empty movie download');

      // 建立 Markdown
      const desc = detail.description || item.description || '';
      const mdContent = `# ${title}\n\n` +
        `**Date**: ${formatTimestamp(detail.displayDate || detail.createdAt)}\n` +
        `**Vimeo ID**: ${vimeoId || 'N/A'}\n\n` +
        `---\n\n` +
        `${desc}\n\n` +
        `<video controls src="${videoFilename}" style="max-width: 100%; border-radius: 8px;"></video>\n\n` +
        `---\n\n` +
        `${thumbMd}`;

      await fs.writeFile(path.join(movieFolder, 'index.md'), mdContent, 'utf-8');
      if (incomplete) throw new Error('One or more movie media downloads failed');
      await fs.writeFile(marker,String(item.id),'utf8');
      if (selectedItem) return movieFolder;

    } catch (err) {
      if (selectedItem || state?.isCancelled) throw err;
      failed++;
      console.error(`[Movie Backup] Error processing movie ${item.id}:`, err.message);
    }

    count++;
    if (onProgress) {
      onProgress(count, total);
    }
  }

  if (failed) throw new Error(`${failed} movie items incomplete; retry to finish`);
  console.log('[Movie Backup] All movies backup completed.');
}

module.exports = { handleBackupMovies };
