const { net } = require('electron');
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 32;
const POST_ID_FILENAME = '.post-id';
const DEFAULT_SYSTEM_USER_ID = '6lToHXxrSpkyDT9jmPUOE'; // たかねこファンクラブ運営

/**
 * Helper: Check pause/cancel state
 */
async function checkState(state) {
  if (state && state.isCancelled) {
    throw new Error('Process cancelled by user');
  }
  
  if (state && state.isPaused) {
    console.log('⏸️ [Step 2] Process PAUSED. Waiting for resume...');
    while (state.isPaused) {
      if (state.isCancelled) throw new Error('Process cancelled by user');
      await new Promise(r => setTimeout(r, 500));
    }
    console.log('▶️ [Step 2] Process RESUMED.');
  }
}

/**
 * Helper: Make request with timeout handling
 */
function makeRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    
    const timeout = setTimeout(() => {
      request.abort();
      reject(new Error('Timeout'));
    }, 15000);

    Object.entries(headers).forEach(([key, value]) => {
      request.setHeader(key, value);
    });

    let data = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => data += chunk.toString());
      
      response.on('end', () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(data);
          resolve({ status: response.statusCode, data: json });
        } catch (e) {
          resolve({ status: response.statusCode, data: null, error: 'JSON Parse Error' });
        }
      });
    });

    request.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    request.end();
  });
}

function normalizeConcurrency(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENCY;
  return Math.min(Math.max(parsed, 1), MAX_CONCURRENCY);
}

async function collectPostFolders(exportedPath) {
  try {
    const members = await fs.readdir(exportedPath, { withFileTypes: true });
    const folders = [];

    await Promise.all(members.filter(entry => entry.isDirectory()).map(async (member) => {
      const memberPath = path.join(exportedPath, member.name);
      const entries = await fs.readdir(memberPath, { withFileTypes: true });

      entries
        .filter(entry => entry.isDirectory() && entry.name !== 'pictures')
        .forEach(entry => folders.push(path.join(memberPath, entry.name)));
    }));

    return folders;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadExistingPostIds(exportedPath, state, initialConcurrency) {
  const postFolders = await collectPostFolders(exportedPath);
  const existingIds = new Set();

  let cursor = 0;
  let concurrency = normalizeConcurrency(initialConcurrency);

  while (cursor < postFolders.length) {
    await checkState(state);

    const batch = postFolders.slice(cursor, cursor + concurrency);
    const results = await Promise.all(batch.map(async (postFolder) => {
      try {
        const postId = (await fs.readFile(path.join(postFolder, POST_ID_FILENAME), 'utf8')).trim();
        return { postId, success: true };
      } catch (error) {
        if (error.code === 'ENOENT') return { postId: null, success: true };
        return { postId: null, success: false };
      }
    }));

    const hadFailure = results.some(result => !result.success);
    results.forEach(({ postId }) => {
      if (postId) existingIds.add(postId);
    });

    cursor += batch.length;
    concurrency = hadFailure
      ? Math.max(1, Math.floor(concurrency / 2))
      : Math.min(MAX_CONCURRENCY, concurrency + 1);
  }

  return existingIds;
}

/**
 * Step 2: Fetch detailed content for each notification
 */
async function handleGetPostDetails(token, notifications, exportedPath, state, onProgress, concurrency = DEFAULT_CONCURRENCY) {
  const headers = { Authorization: token };
  const apiUrl = 'https://api.takanekofc.com/auth/notifications/';

  const validPosts = [];
  const total = notifications.length;
  const existingPostIds = await loadExistingPostIds(exportedPath, state, concurrency);
  const pendingNotifications = notifications.filter((entry) => {
    const id = entry.notificationReservationId;
    return !id || !existingPostIds.has(id);
  });
  let processedCount = total - pendingNotifications.length;

  console.log(`[Step 2] Found ${existingPostIds.size} existing posts. ${pendingNotifications.length} posts need details.`);

  if (onProgress) {
    onProgress(
      total === 0 ? 100 : Math.round((processedCount / total) * 100),
      processedCount,
      total,
      { skipped: processedCount, pending: pendingNotifications.length }
    );
  }

  const requestConcurrency = normalizeConcurrency(concurrency);
  for (let i = 0; i < pendingNotifications.length; i += requestConcurrency) {
    
    await checkState(state);

    const chunk = pendingNotifications.slice(i, i + requestConcurrency);
    
    const promises = chunk.map(async (entry) => {
      const id = entry.notificationReservationId;
      if (!id) return null;

      try {
        const response = await makeRequest(apiUrl + id, headers);
        if (response.status === 200 && response.data) {
          // Allow system messages with missing sendingOfficialUserId
          const senderId = response.data.sendingOfficialUserId || DEFAULT_SYSTEM_USER_ID;
          return { 
            ...response.data, 
            sendingOfficialUserId: senderId,
            notificationReservationId: id 
          };
        }
      } catch (err) {
        console.warn(`[Step 2] Failed to fetch ID ${id}: ${err.message}`);
      }
      return null;
    });

    const results = await Promise.all(promises);

    results.forEach(res => {
      if (res) validPosts.push(res);
    });

    processedCount += chunk.length;

    if (onProgress) {
      const percentage = Math.round((processedCount / total) * 100);
      onProgress(percentage, processedCount, total, {
        skipped: total - pendingNotifications.length,
        pending: pendingNotifications.length
      });
    }

    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`[Step 2] Completed. Successfully fetched ${validPosts.length}/${pendingNotifications.length} new posts.`);
  return validPosts;
}

module.exports = { handleGetPostDetails };