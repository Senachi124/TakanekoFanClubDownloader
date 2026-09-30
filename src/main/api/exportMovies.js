const net = require('../utils/network');
const { safeTitle, formatDateForFilename, formatTimestamp } = require('../utils/officialMedia');
const { downloadToFile } = require('./downloadToFile');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getYtDlpConfig } = require('../utils/mediaTools');
const { withVideoSlot } = require('../utils/videoQueue');
const {failure, diagnostic} = require('../utils/downloadErrors');

function movieSource(detail) {
  const type=String(detail.movieType || 'vimeo').toLowerCase();
  const id=String(detail.videoId || '');
  if(!id) throw failure('VIDEO_ID_MISSING','Missing video ID');
  if(type==='youtube') {
    if(!/^[a-zA-Z0-9_-]{11}$/.test(id)) throw failure('VIDEO_ID_INVALID','Invalid YouTube ID');
    return {type,id,url:`https://www.youtube.com/watch?v=${id}`,label:'YouTube'};
  }
  if(type!=='vimeo') throw failure('MOVIE_TYPE_UNSUPPORTED','Unsupported movie type');
  const match=/^(\d+)(?:\/([a-f0-9]+)|\?h=([a-f0-9]+))?$/i.exec(id);
  if(!match) throw failure('VIDEO_ID_INVALID','Invalid Vimeo ID');
  const hash=match[2] || match[3];
  return {type,id,url:`https://player.vimeo.com/video/${match[1]}${hash?'?h='+hash:''}`,label:'Vimeo'};
}

function movieThumbnail(value) {
  const url=new URL(value,'https://takanekofc.com/');
  if(url.protocol==='http:' && ['img.youtube.com','i.ytimg.com'].includes(url.hostname) && !url.port && !url.username && !url.password) url.protocol='https:';
  if(url.protocol!=='https:' || url.username || url.password) throw failure('HTTPS_REQUIRED','HTTPS required');
  return url.href;
}

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

    // Tool output may contain signed URLs. Retain a bounded tail only to classify failures.
    let stderr='';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => {stderr=(stderr+d.toString()).slice(-8192);});

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(failure(/sign in|private video|not available|unavailable|HTTP Error 403|login required|confirm.*bot/i.test(stderr)?'MEDIA_ACCESS_DENIED':'MEDIA_TOOL_FAILED'));
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(failure('MEDIA_TOOL_NOT_FOUND'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * 直接下載原生最高畫質，並以 remux (無損直通) 封裝為 MP4
 */
async function downloadWithYtDlp(source, destPath) {
  const ytdlpArgs = [
    '--referer', 'https://takanekofc.com/',
    '--concurrent-fragments', '5',
    '-S', 'res,fps',
    '-f', 'bestvideo+bestaudio/best',
    '--remux-video', 'mp4',
    '-o', destPath,
    source.url
  ];
  const tools = getYtDlpConfig();
  if(tools.ffmpegLocation) ytdlpArgs.unshift('--ffmpeg-location',tools.ffmpegLocation);
  await withVideoSlot(()=>runCommand(tools.command, ytdlpArgs));
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

    let stage='details';const issues=[];
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

      // 封面圖
      let thumbMd = '';
      if (detail.thumbnail) {
        try {
        const thumbUrl = movieThumbnail(detail.thumbnail);
        const thumbExt = path.extname(thumbUrl.split('?')[0]) || '.png';
        const localThumb = path.join(movieFolder, `cover${thumbExt}`);
        if (!fsSync.existsSync(localThumb)) {
          try {
            await downloadToFile(thumbUrl, localThumb, IMAGE_HEADERS);
          } catch (e) {
            issues.push(diagnostic(e,{id:item.id,kind:'movie'},'cover'));
          }
        }
        thumbMd = `![Thumbnail](cover${thumbExt})\n\n`;
        } catch(error) {issues.push(diagnostic(error,{id:item.id,kind:'movie'},'cover'));}
      }

      // 影片下載 (最高原生畫質)
      stage='video';
      const source=movieSource(detail);
      const videoFilename = 'video.mp4';
      const localVideoPath = path.join(movieFolder, videoFilename);

      if (!fsSync.existsSync(localVideoPath)) {
        await downloadWithYtDlp(source, localVideoPath);
      }

      if (!(await fs.stat(localVideoPath)).size) throw failure('EMPTY_MEDIA');

      // 建立 Markdown
      stage='save';
      const desc = detail.description || item.description || '';
      const mdContent = `# ${title}\n\n` +
        `**Date**: ${formatTimestamp(detail.displayDate || detail.createdAt)}\n` +
        `**${source.label} ID**: ${source.id}\n\n` +
        `---\n\n` +
        `${desc}\n\n` +
        `<video controls src="${videoFilename}" style="max-width: 100%; border-radius: 8px;"></video>\n\n` +
        `---\n\n` +
        `${thumbMd}`;

      await fs.writeFile(path.join(movieFolder, 'index.md'), mdContent, 'utf-8');
      if (issues.length) {const error=failure('DOWNLOAD_FAILED');error.diagnostics=issues;throw error;}
      await fs.writeFile(marker,String(item.id),'utf8');
      if (selectedItem) return movieFolder;

    } catch (err) {
      if(!err.diagnostics) err.diagnostics=[...issues,diagnostic(err,{id:item.id,kind:'movie'},stage)];
      if (selectedItem || state?.isCancelled) throw err;
      failed++;
      console.error('[Movie Backup]',JSON.stringify(err.diagnostics));
    }

    count++;
    if (onProgress) {
      onProgress(count, total);
    }
  }

  if (failed) throw new Error(`${failed} movie items incomplete; retry to finish`);
  console.log('[Movie Backup] All movies backup completed.');
}

module.exports = { handleBackupMovies, movieSource, movieThumbnail };
