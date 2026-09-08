const { net } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const proc = spawn(cmd, args, { shell: isWin });

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
  await runCommand('yt-dlp', ytdlpArgs);
  console.log(`[Movie] Saved original quality video: ${destPath}\n`);
}

async function handleBackupMovies(token, rootExportPath, state, onProgress) {
  const moviesDir = path.join(rootExportPath, 'MOVIE');
  await fs.mkdir(moviesDir, { recursive: true });

  console.log('[Movie Backup] Fetching movie list...');
  let allMovies = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (state && state.isCancelled) throw new Error('Cancelled by user');
    const listUrl = `https://api.takanekofc.com/movie/queries/getMovieList?page=${page}&pageSize=20`;
    const res = await fetchJson(listUrl, token);

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
      const detailUrl = `https://api.takanekofc.com/movie/queries/getMovieDetail/${item.id}`;
      const detail = await fetchJson(detailUrl, token);

      const releaseStr = formatDateForFilename(detail.displayDate || detail.createdAt);
      const safeTitle = (detail.title || item.title || 'untitled').replace(/[/\\:*?"<>|]/g, '_').trim();
      const movieFolder = path.join(moviesDir, `${releaseStr}_${safeTitle}`);
      await fs.mkdir(movieFolder, { recursive: true });

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
            const buf = await downloadBinary(thumbUrl);
            await fs.writeFile(localThumb, buf);
          } catch (e) {
            console.warn(`[Movie Backup] Failed to download thumbnail:`, e.message);
          }
        }
        thumbMd = `![Thumbnail](cover${thumbExt})\n\n`;
      }

      // 影片下載 (最高原生畫質)
      const vimeoId = detail.videoId;
      const videoFilename = `${safeTitle}.mp4`;
      const localVideoPath = path.join(movieFolder, videoFilename);

      if (vimeoId && !fsSync.existsSync(localVideoPath)) {
        console.log(`[Movie Backup] Starting download for: ${safeTitle} (${vimeoId})`);
        await downloadWithYtDlp(vimeoId, localVideoPath);
      }

      // 建立 Markdown
      const desc = detail.description || item.description || '';
      const mdContent = `# ${detail.title}\n\n` +
        `**Release Date**: ${formatTimestamp(detail.displayDate || detail.createdAt)}\n` +
        `**Vimeo ID**: ${vimeoId || 'N/A'}\n\n` +
        `---\n\n` +
        `${desc}\n\n` +
        `<video controls src="${videoFilename}" style="max-width: 100%; border-radius: 8px;"></video>\n\n` +
        `---\n\n` +
        `${thumbMd}`;

      await fs.writeFile(path.join(movieFolder, 'index.md'), mdContent, 'utf-8');

    } catch (err) {
      console.error(`[Movie Backup] Error processing movie ${item.id}:`, err.message);
    }

    count++;
    if (onProgress) {
      onProgress(count, total);
    }
  }

  console.log('[Movie Backup] All movies backup completed.');
}

module.exports = { handleBackupMovies };