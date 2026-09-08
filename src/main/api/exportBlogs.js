// src/main/api/exportBlogs.js
const { net } = require('electron');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getYtDlpConfig } = require('../utils/mediaTools');

const POST_ID_FILENAME = '.post-id';

/**
 * Helper: Send HTTP GET request using Electron net module
 */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('Request timed out'));
    }, 30000);

    Object.entries(headers).forEach(([k, v]) => request.setHeader(k, v));
    let data = '';
    request.on('response', (res) => {
      res.on('data', chunk => data += chunk.toString());
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    request.on('error', (err) => { clearTimeout(timer); reject(err); });
    request.end();
  });
}

/**
 * Helper: Download binary files (images/attachments)
 */
function downloadBinary(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    Object.entries(headers).forEach(([k, v]) => request.setHeader(k, v));

    const chunks = [];
    request.on('response', (response) => {
      if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * Download Vimeo videos using yt-dlp with H.265 (HEVC) preference
 */
function downloadWithYtDlp(vimeoId, destPath) {
  return new Promise((resolve, reject) => {
    const videoUrl = `https://player.vimeo.com/video/${vimeoId}`;

    // Select hardware acceleration for macOS, fallback to libx265 for other platforms
    const isMac = process.platform === 'darwin';
    const videoCodecArgs = isMac
      ? 'VideoConvertor:-c:v hevc_videotoolbox -q:v 60 -c:a aac'
      : 'VideoConvertor:-c:v libx265 -crf 23 -preset fast -c:a aac';

    const { command, ffmpegLocation } = getYtDlpConfig();
    const args = [
      '--referer', 'https://takanekofc.com/',
      '--concurrent-fragments', '5',
      // Prioritize native H.265/HEVC stream if available, otherwise best quality
      '-f', 'bv*[vcodec^=hev]+ba/bv*[vcodec^=h265]+ba/bv*+ba/b',
      '--recode-video', 'mp4',
      '--postprocessor-args', videoCodecArgs,
      '-o', destPath,
      videoUrl
    ];
    if (ffmpegLocation) args.unshift('--ffmpeg-location', ffmpegLocation);

    console.log(`[yt-dlp] Starting download (H.265 mode): ${videoUrl}`);
    const proc = spawn(command, args);

    proc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('%')) {
        process.stdout.write(`\r[yt-dlp] ${msg}`);
      }
    });

    proc.stderr.on('data', (data) => {
      const errStr = data.toString();
      if (!errStr.includes('WARNING')) {
        console.warn(`\n[yt-dlp warn] ${errStr.trim()}`);
      }
    });

    proc.on('close', (code) => {
      process.stdout.write('\n');
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp exited with status code: ${code}`));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp is not available. Please reinstall the app or install yt-dlp and ffmpeg manually.'));
      } else {
        reject(err);
      }
    });
  });
}

function formatDateForFilename(ms) {
  const d = new Date(ms || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function formatTimestamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '-');
}

function decodeHtmlEntities(text) {
  const entities = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' '};
  return text.replace(/&[a-zA-Z0-9#]+;/g, m => entities[m] || m);
}

/**
 * Extract text, image URLs, and embedded Vimeo IDs from blog HTML
 */
function parseBlogBody(htmlContent) {
  if (!htmlContent) return { text: '', images: [], vimeoIds: [] };
  const $ = cheerio.load(htmlContent);
  const images = [];
  const vimeoIds = [];

  $('img').each((_, img) => {
    const src = $(img).attr('src');
    if (src && src.trim()) images.push(src.trim());
  });

  $('iframe').each((_, iframe) => {
    const src = $(iframe).attr('src') || '';
    const match = src.match(/video\/(\d+)/);
    if (match && match[1]) {
      vimeoIds.push(match[1]);
    }
    $(iframe).replaceWith(`\n[Vimeo Video: ${match ? match[1] : src}]\n`);
  });

  $('br').replaceWith('\n');
  let text = '';
  $('p').each((_, p) => text += $(p).text().trim() + '\n\n');
  return { text: decodeHtmlEntities(text.trim()), images, vimeoIds };
}

/**
 * Main export handler: Back up Manager Blogs (text, images, and H.265 videos)
 */
async function handleBackupTopicsBlogs(token, rootPath, state, onProgress) {
  const headers = { Authorization: token };
  const senderName = 'マネージャーブログ';
  const senderDir = path.join(rootPath, senderName);
  const picturesDir = path.join(senderDir, 'pictures');

  await fs.mkdir(senderDir, { recursive: true });
  await fs.mkdir(picturesDir, { recursive: true });

  // 1. Read existing post IDs to avoid duplicate downloads
  const existingIds = new Set();
  const dirEntries = await fs.readdir(senderDir, { withFileTypes: true });
  for (const entry of dirEntries) {
    if (entry.isDirectory() && entry.name !== 'pictures') {
      const idFile = path.join(senderDir, entry.name, POST_ID_FILENAME);
      try {
        const id = (await fs.readFile(idFile, 'utf8')).trim();
        if (id) existingIds.add(id);
      } catch (_) {}
    }
  }

  // 2. Fetch all paginated articles
  let currentPage = 1;
  let totalPages = 1;
  const allArticles = [];

  console.log('[Blog Backup] Fetching Manager Blog list...');

  while (currentPage <= totalPages) {
    if (state && state.isCancelled) throw new Error('Process cancelled by user');

    const listUrl = `https://api.takanekofc.com/blog/queries/getArticleList?blogId=topics&page=${currentPage}&categories=nuzufcwpxr5s3iip`;
    const res = await httpGet(listUrl, headers);

    if (res && res.articleList) {
      allArticles.push(...res.articleList);
      totalPages = res.totalPages || 1;
    } else {
      break;
    }
    currentPage++;
  }

  const pending = allArticles.filter(item => !existingIds.has(String(item.id)));
  console.log(`[Blog Backup] Total: ${allArticles.length} articles, Pending: ${pending.length}`);

  // 3. Process each article
  for (let i = 0; i < pending.length; i++) {
    if (state && state.isCancelled) throw new Error('Process cancelled by user');

    const summary = pending[i];
    const articleId = String(summary.id);

    let detail;
    try {
      detail = await httpGet(`https://api.takanekofc.com/blog/queries/getArticleDetail/${articleId}`, headers);
    } catch (err) {
      console.warn(`[Blog Backup] Failed to fetch article details (${articleId}): ${err.message}`);
      continue;
    }

    const releaseTime = detail.displayDate || detail.createdAt || summary.displayDate || Date.now();
    const releaseStr = formatDateForFilename(releaseTime);
    const safeTitle = (detail.title || 'untitled').replace(/[/\\:*?"<>|]/g, '_');
    const postDir = path.join(senderDir, `${releaseStr}_${safeTitle}`);

    await fs.mkdir(postDir, { recursive: true });

    const { text: bodyMd, images: inlineImages, vimeoIds } = parseBlogBody(detail.body || '');

    // --- A. Image Download ---
    const rawImageUrls = [];
    if (detail.thumbnail) rawImageUrls.push(detail.thumbnail);
    rawImageUrls.push(...inlineImages);

    let imageMd = '';
    let count = 1;
    let hasDownloadError = false;

    for (const rawUrl of rawImageUrls) {
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://takanekofc.com/${rawUrl.replace(/^\//, '')}`;
      const cleanPath = fullUrl.split('?')[0];
      const ext = path.extname(cleanPath) || '.jpg';
      const filename = `${releaseStr}_${String(count).padStart(2, '0')}${ext}`;
      const localPath = path.join(postDir, filename);
      const galleryPath = path.join(picturesDir, filename);

      if (!fsSync.existsSync(localPath)) {
        try {
          const buffer = await downloadBinary(fullUrl);
          await fs.writeFile(localPath, buffer);
          await fs.writeFile(galleryPath, buffer);
        } catch (e) {
          hasDownloadError = true;
          console.warn(`[Blog Backup] Image download failed (${fullUrl}): ${e.message}`);
        }
      } else {
        if (!fsSync.existsSync(galleryPath)) {
          await fs.copyFile(localPath, galleryPath).catch(() => {});
        }
      }

      imageMd += `![image](${filename})\n`;
      count++;
    }

    // --- B. Video Download (yt-dlp H.265) ---
    let videoMd = '';
    let vCount = 1;

    for (const vId of vimeoIds) {
      const videoFilename = `${releaseStr}_video_${String(vCount).padStart(2, '0')}.mp4`;
      const localVideoPath = path.join(postDir, videoFilename);

      if (!fsSync.existsSync(localVideoPath)) {
        try {
          console.log(`[Blog Backup] Starting yt-dlp download (${vId}) -> ${videoFilename}`);
          await downloadWithYtDlp(vId, localVideoPath);
          console.log(`[Blog Backup] Video download completed: ${videoFilename}`);
        } catch (e) {
          hasDownloadError = true;
          console.warn(`[Blog Backup] Video download failed (${vId}): ${e.message}`);
        }
      }

      if (fsSync.existsSync(localVideoPath)) {
        videoMd += `\n<video controls src="${videoFilename}" style="max-width: 100%; border-radius: 8px; margin: 15px 0;"></video>\n`;
      }
      vCount++;
    }

    // --- C. Write index.md ---
    const mdContent = `# ${detail.title}\n\n` +
      `**Sender**: ${senderName}\n` +
      `**Date**: ${formatTimestamp(releaseTime)}\n\n` +
      `---\n\n${bodyMd}\n\n${videoMd}\n\n---\n\n${imageMd}`;

    await fs.writeFile(path.join(postDir, 'index.md'), mdContent, 'utf-8');

    // Only write .post-id marker if all files were downloaded successfully
    if (!hasDownloadError) {
      await fs.writeFile(path.join(postDir, POST_ID_FILENAME), articleId, 'utf-8');
    }

    if (onProgress) {
      onProgress(i + 1, pending.length);
    }
  }
}

module.exports = { handleBackupTopicsBlogs };
