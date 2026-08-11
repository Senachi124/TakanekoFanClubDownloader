const { net } = require('electron');
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 32;
const POST_ID_FILENAME = '.post-id';

/**
 * Helper: Check pause/cancel state
 * Stops the loop if paused, throws error if cancelled.
 */
async function checkState(state) {
  if (state && state.isCancelled) {
    throw new Error('Process cancelled by user');
  }
  
  if (state && state.isPaused) {
    console.log('⏸️ [Step 2] Process PAUSED. Waiting for resume...');
    // Poll every 500ms
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
    
    // 15s timeout per request
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
          // Attempt to parse JSON. If response is empty or invalid, return null data.
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

/**
 * Find exported post folders once before making detail requests.
 * Each new export writes a .post-id marker, so existing posts can be skipped
 * without calling the remote detail endpoint again.
 */
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

/**
 * Read .post-id markers with AIMD concurrency.
 * Successful checks add one worker; an I/O failure halves the worker count.
 */
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
        // A missing marker is expected for exports created before this index
        // was introduced, so it should not reduce AIMD concurrency.
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
 * @param {string} token - Auth token
 * @param {Array} notifications - List of IDs
 * @param {string} exportedPath - Root directory containing previous exports
 * @param {Object} state - Control state { isPaused, isCancelled }
 * @param {Function} onProgress - Callback (percent, current, total)
 * @param {number} concurrency - Maximum concurrent detail requests
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

  // Only posts that are not already exported are processed in fixed-size batches.
  const requestConcurrency = normalizeConcurrency(concurrency);
  for (let i = 0; i < pendingNotifications.length; i += requestConcurrency) {
    
    // 1. Check if user paused or cancelled
    await checkState(state);

    const chunk = pendingNotifications.slice(i, i + requestConcurrency);
    
    // 2. Process current batch in parallel
    const promises = chunk.map(async (entry) => {
      const id = entry.notificationReservationId;
      if (!id) return null;

      try {
        const response = await makeRequest(apiUrl + id, headers);
        if (response.status === 200 && response.data) {
          // Basic validation
          if (response.data.sendingOfficialUserId) {
            return { ...response.data, notificationReservationId: id };
          }
        }
      } catch (err) {
        console.warn(`[Step 2] Failed to fetch ID ${id}: ${err.message}`);
      }
      return null;
    });

    // Wait for batch to finish
    const results = await Promise.all(promises);

    // Filter valid results
    results.forEach(res => {
      if (res) validPosts.push(res);
    });

    processedCount += chunk.length;

    // 3. Report Progress to UI
    if (onProgress) {
      const percentage = Math.round((processedCount / total) * 100);
      onProgress(percentage, processedCount, total, {
        skipped: total - pendingNotifications.length,
        pending: pendingNotifications.length
      });
    }

    // 4. Important: Yield to Event Loop
    // This small delay prevents the UI from freezing entirely
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`[Step 2] Completed. Successfully fetched ${validPosts.length}/${pendingNotifications.length} new posts.`);
  return validPosts;
}

module.exports = { handleGetPostDetails };
