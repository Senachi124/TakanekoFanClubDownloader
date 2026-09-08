const { net } = require('electron');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 32;
const POST_ID_FILENAME = '.post-id';

// User ID Mapping
const userMap = {
  '0Tg8s7vP15A90NeUM4rnC': '籾山ひめり',
  'Ga_ddM7JhAnlRnkYXsDHG': '春野莉々',
  'WjMBMFAFdQ6zmzm34dpj5': '葉月紗蘭',
  'NSTLZy-J08YuwqPkkVpb2': '城月菜央',
  '6lToHXxrSpkyDT9jmPUOE': 'たかねこファンクラブ運営',
  'jv8afDOWLZqPpdJ6Mlymq': '星谷美来',
  'a4npPurePgMCD5wEmekQO': '東山恵里沙',
  '2Ssu8-WzAOXlFZkeD01VU': '松本ももな',
  'SKuzAY-gIlD25a5-yGmhZ': '日向端ひな',
  '3-3vzS6FMV9lCvNjGscEg': '橋本桃呼',
  'VaKS0gcqUZTDi_asf5Xn2': '涼海すう'
};

const DEFAULT_FALLBACK_USER_ID = '6lToHXxrSpkyDT9jmPUOE';

/**
 * Helper: Detect member name from title or body when senderId is missing
 */
function inferSenderName(title = '', body = '') {
  const content = `${title} ${body}`;
  for (const name of Object.values(userMap)) {
    if (name !== 'たかねこファンクラブ運営' && content.includes(name)) {
      return name;
    }
  }
  return 'たかねこファンクラブ運営';
}

/**
 * Helper: Check pause/cancel state
 */
async function checkState(state) {
  if (state && state.isCancelled) throw new Error('Process cancelled by user');
  if (state && state.isPaused) {
    console.log('⏸️ [Step 3] Export PAUSED.');
    while (state.isPaused) {
      if (state.isCancelled) throw new Error('Process cancelled by user');
      await new Promise(r => setTimeout(r, 500));
    }
    console.log('▶️ [Step 3] Export RESUMED.');
  }
}

function formatTimestamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '-');
}

function formatDateForFilename(ms) {
  const d = new Date(ms || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function decodeHtmlEntities(text) {
  const entities = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' '};
  return text.replace(/&[a-zA-Z0-9#]+;/g, m => entities[m] || m);
}

/**
 * Parse HTML content: extract text, images, and embedded Vimeo IDs
 */
function htmlToMarkdown(htmlContent) {
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

function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    const chunks = [];
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * Download Vimeo videos using yt-dlp with H.265 (HEVC) hardware encoding
 */
function downloadWithYtDlp(vimeoId, destPath) {
  return new Promise((resolve, reject) => {
    const videoUrl = `https://player.vimeo.com/video/${vimeoId}`;

    const isMac = process.platform === 'darwin';
    const videoCodecArgs = isMac
      ? 'VideoConvertor:-c:v hevc_videotoolbox -q:v 60 -c:a aac'
      : 'VideoConvertor:-c:v libx265 -crf 23 -preset fast -c:a aac';

    const args = [
      '--referer', 'https://takanekofc.com/',
      '--concurrent-fragments', '5',
      '-f', 'bv*[vcodec^=hev]+ba/bv*[vcodec^=h265]+ba/bv*+ba/b',
      '--recode-video', 'mp4',
      '--postprocessor-args', videoCodecArgs,
      '-o', destPath,
      videoUrl
    ];

    console.log(`[yt-dlp] Starting video download (H.265 mode): ${videoUrl}`);
    const proc = spawn('yt-dlp', args);

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
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp not found. Please install it via "brew install yt-dlp ffmpeg"'));
      } else {
        reject(err);
      }
    });
  });
}

function normalizeConcurrency(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENCY;
  return Math.min(Math.max(parsed, 1), MAX_CONCURRENCY);
}

/**
 * Step 3: Export posts to files
 */
async function handleExportPosts(postDetails, exportedPath, state, onProgress, concurrency = DEFAULT_CONCURRENCY) {
  if (!fsSync.existsSync(exportedPath)) {
    await fs.mkdir(exportedPath, { recursive: true });
  }

  const total = postDetails.length;
  let processedCount = 0;

  console.log(`[Step 3] Exporting ${total} posts to disk...`);
  const exportConcurrency = normalizeConcurrency(concurrency);

  for (let i = 0; i < total; i += exportConcurrency) {
    await checkState(state);

    const chunk = postDetails.slice(i, i + exportConcurrency);
    
    await Promise.all(chunk.map(async (data) => {
      try {
        await processSinglePost(data, exportedPath);
      } catch (err) {
        console.error(`Error processing post ${data.title}:`, err.message);
      }
    }));

    processedCount += chunk.length;

    if (onProgress) {
      const percentage = Math.round((processedCount / total) * 100);
      onProgress(percentage, processedCount, total);
    }
    
    await new Promise(r => setTimeout(r, 10));
  }
}

/**
 * Process a single post: Write MD, download images, and fetch embedded H.265 videos
 */
async function processSinglePost(data, rootPath) {
  const rawTitle = data.title || data.subject || (data.message ? data.message.slice(0, 20) : 'untitled');

  // Determine sender: Map ID -> infer from content -> fallback to management
  let senderName;
  if (data.sendingOfficialUserId && userMap[data.sendingOfficialUserId]) {
    senderName = userMap[data.sendingOfficialUserId];
  } else {
    const rawContent = `${rawTitle} ${data.body01 || data.body || data.message || ''}`;
    senderName = inferSenderName(rawTitle, rawContent);
  }

  senderName = senderName.replace(/ /g, '');
  const senderDir = path.join(rootPath, senderName);
  const picturesDir = path.join(senderDir, 'pictures');

  const releaseTime = data.releaseDate || data.displayDate || data.publishedAt || data.createdAt || data.sentAt || Date.now();
  const releaseStr = formatDateForFilename(releaseTime);
  const title = String(rawTitle).replace(/[/\\:*?"<>|]/g, '_').trim();
  const postDir = path.join(senderDir, `${releaseStr}_${title}`);

  await fs.mkdir(senderDir, { recursive: true });
  await fs.mkdir(picturesDir, { recursive: true });
  await fs.mkdir(postDir, { recursive: true });

  let bodyMd = '';
  let imageUrls = [];
  let vimeoIds = [];

  // Parse HTML bodies
  Object.keys(data).sort().forEach(k => {
    if (k.startsWith('body') && data[k]) {
      const res = htmlToMarkdown(data[k]);
      bodyMd += res.text + '\n\n';
      imageUrls.push(...res.images);
      vimeoIds.push(...res.vimeoIds);
    }
  });

  // Fallback text fields
  if (!bodyMd.trim()) {
    const fallbackText = data.message || data.content || data.text || '';
    if (fallbackText) {
      const res = htmlToMarkdown(fallbackText);
      bodyMd += res.text + '\n\n';
      imageUrls.push(...res.images);
      vimeoIds.push(...res.vimeoIds);
    }
  }

  // Header image fields
  Object.keys(data).sort().forEach(k => {
    if (k.startsWith('image') && data[k]) {
      const imgPath = data[k].startsWith('http') ? data[k] : `https://takanekofc.com/${data[k].replace(/^\//, '')}`;
      imageUrls.push(imgPath);
    }
  });

  let hasDownloadFailure = false;

  // --- A. Download Images ---
  let imageMd = '';
  let count = 1;

  for (const url of imageUrls) {
    const ext = path.extname(url.split('?')[0].split('/').pop()) || '.jpg';
    const filename = `${releaseStr}_${String(count).padStart(2, '0')}${ext}`;
    const localPath = path.join(postDir, filename);
    const galleryPath = path.join(picturesDir, filename);

    if (!fsSync.existsSync(localPath)) {
      try {
        const buffer = await downloadBinary(url);
        await fs.writeFile(localPath, buffer);
        await fs.writeFile(galleryPath, buffer);
      } catch (e) {
        hasDownloadFailure = true;
        console.warn(`[Step 3] Failed to download image for ${title}: ${e.message}`);
      }
    } else {
      if (!fsSync.existsSync(galleryPath)) {
        await fs.copyFile(localPath, galleryPath).catch(()=>{});
      }
    }

    imageMd += `![image](${filename})\n`;
    count++;
  }

  // --- B. Download Embedded Videos (yt-dlp H.265) ---
  let videoMd = '';
  let vCount = 1;

  for (const vId of vimeoIds) {
    const videoFilename = `${releaseStr}_video_${String(vCount).padStart(2, '0')}.mp4`;
    const localVideoPath = path.join(postDir, videoFilename);

    if (!fsSync.existsSync(localVideoPath)) {
      try {
        console.log(`[Step 3] Downloading video (${vId}) for ${title}...`);
        await downloadWithYtDlp(vId, localVideoPath);
        console.log(`[Step 3] Video saved: ${videoFilename}`);
      } catch (e) {
        hasDownloadFailure = true;
        console.warn(`[Step 3] Failed to download video (${vId}): ${e.message}`);
      }
    }

    if (fsSync.existsSync(localVideoPath)) {
      videoMd += `\n<video controls src="${videoFilename}" style="max-width: 100%; border-radius: 8px; margin: 15px 0;"></video>\n`;
    }
    vCount++;
  }

  // --- C. Write Markdown File ---
  const mdContent = `# ${rawTitle}\n\n` +
    `**Sender**: ${senderName}\n` +
    `**Date**: ${formatTimestamp(releaseTime)}\n\n` +
    `---\n\n${bodyMd}\n\n${videoMd}\n\n---\n\n${imageMd}`;

  await fs.writeFile(path.join(postDir, 'index.md'), mdContent, 'utf-8');

  if (data.notificationReservationId && !hasDownloadFailure) {
    await fs.writeFile(
      path.join(postDir, POST_ID_FILENAME),
      String(data.notificationReservationId),
      'utf-8'
    );
  }
}

module.exports = { handleExportPosts };