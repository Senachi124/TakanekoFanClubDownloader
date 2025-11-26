const { net } = require('electron');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// CONFIG: Batch size for file operations
const EXPORT_BATCH_SIZE = 5;

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

// --- Helper Functions ---

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

function htmlToMarkdown(htmlContent) {
  if (!htmlContent) return { text: '', images: [] };
  const $ = cheerio.load(htmlContent);
  const images = [];
  $('img').each((_, img) => {
    const src = $(img).attr('src');
    if (src && src.trim()) images.push(src);
  });
  $('br').replaceWith('\n');
  let text = '';
  $('p').each((_, p) => text += $(p).text().trim() + '\n\n');
  return { text: decodeHtmlEntities(text.trim()), images };
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
 * Step 3: Export posts to files
 */
async function handleExportPosts(postDetails, exportedPath, state, onProgress) {
  // Ensure root directory exists
  if (!fsSync.existsSync(exportedPath)) {
    await fs.mkdir(exportedPath, { recursive: true });
  }

  const total = postDetails.length;
  let processedCount = 0;

  console.log(`[Step 3] Exporting ${total} posts to disk...`);

  // Batch Processing
  for (let i = 0; i < total; i += EXPORT_BATCH_SIZE) {
    
    // 1. Check State
    await checkState(state);

    const chunk = postDetails.slice(i, i + EXPORT_BATCH_SIZE);
    
    // 2. Process chunk
    await Promise.all(chunk.map(async (data) => {
      try {
        await processSinglePost(data, exportedPath);
      } catch (err) {
        console.error(`Error processing post ${data.title}:`, err.message);
      }
    }));

    processedCount += chunk.length;

    // 3. Report Progress
    if (onProgress) {
      const percentage = Math.round((processedCount / total) * 100);
      onProgress(percentage, processedCount, total);
    }
    
    // 4. Yield
    await new Promise(r => setTimeout(r, 10));
  }
}

/**
 * Process a single post: Write MD and download images
 */
async function processSinglePost(data, rootPath) {
  const senderId = data.sendingOfficialUserId;
  if (!senderId) return;

  const senderName = (userMap[senderId] || senderId).replace(/ /g, '');
  const senderDir = path.join(rootPath, senderName);
  const picturesDir = path.join(senderDir, 'pictures');
  const releaseStr = formatDateForFilename(data.releaseDate);
  const title = (data.title || 'untitled').replace(/[/\\:*?"<>|]/g, '_');
  const postDir = path.join(senderDir, `${releaseStr}_${title}`);

  // Create dirs
  await fs.mkdir(senderDir, { recursive: true });
  await fs.mkdir(picturesDir, { recursive: true });
  await fs.mkdir(postDir, { recursive: true });

  // Extract content
  let bodyMd = '';
  let imageUrls = [];

  // Body images
  Object.keys(data).sort().forEach(k => {
    if (k.startsWith('body') && data[k]) {
      const res = htmlToMarkdown(data[k]);
      bodyMd += res.text + '\n\n';
      imageUrls.push(...res.images);
    }
  });

  // Header images
  Object.keys(data).sort().forEach(k => {
    if (k.startsWith('image') && data[k]) {
      imageUrls.push(`https://takanekofc.com/${data[k]}`);
    }
  });

  // Download Images (Sequential within a post to avoid EMFILE)
  let imageMd = '';
  let count = 1;

  for (const url of imageUrls) {
    const ext = path.extname(url.split('/').pop()) || '.jpg';
    const filename = `${releaseStr}_${String(count).padStart(2, '0')}${ext}`;
    const localPath = path.join(postDir, filename);
    const galleryPath = path.join(picturesDir, filename);

    if (!fsSync.existsSync(localPath)) {
      try {
        const buffer = await downloadBinary(url);
        await fs.writeFile(localPath, buffer);
        await fs.writeFile(galleryPath, buffer);
      } catch (e) {
        // console.warn(`Failed to download ${url}`);
      }
    } else {
      // Ensure gallery copy exists
      if (!fsSync.existsSync(galleryPath)) {
        await fs.copyFile(localPath, galleryPath).catch(()=>{});
      }
    }

    imageMd += `![image](${filename})\n`;
    count++;
  }

  // Write Markdown
  const mdContent = `# ${title}\n\n` +
    `**Sender**: ${senderName}\n` +
    `**Date**: ${formatTimestamp(data.releaseDate)}\n\n` +
    `---\n\n${bodyMd}\n\n---\n\n${imageMd}`;

  await fs.writeFile(path.join(postDir, 'index.md'), mdContent, 'utf-8');
}

module.exports = { handleExportPosts };