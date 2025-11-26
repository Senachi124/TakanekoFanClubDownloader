const { net } = require('electron');

// CONFIG: Number of concurrent requests. 
const BATCH_SIZE = 5;

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

/**
 * Step 2: Fetch detailed content for each notification
 * @param {string} token - Auth token
 * @param {Array} notifications - List of IDs
 * @param {Object} state - Control state { isPaused, isCancelled }
 * @param {Function} onProgress - Callback (percent, current, total)
 */
async function handleGetPostDetails(token, notifications, state, onProgress) {
  const headers = { Authorization: token };
  const apiUrl = 'https://api.takanekofc.com/auth/notifications/';
  
  const validPosts = [];
  const total = notifications.length;
  let processedCount = 0;

  console.log(`[Step 2] Starting batch processing for ${total} items...`);

  // Loop through data in chunks (Batches)
  for (let i = 0; i < total; i += BATCH_SIZE) {
    
    // 1. Check if user paused or cancelled
    await checkState(state);

    const chunk = notifications.slice(i, i + BATCH_SIZE);
    
    // 2. Process current batch in parallel
    const promises = chunk.map(async (entry) => {
      const id = entry.notificationReservationId;
      if (!id) return null;

      try {
        const response = await makeRequest(apiUrl + id, headers);
        if (response.status === 200 && response.data) {
          // Basic validation
          if (response.data.sendingOfficialUserId) {
            return response.data;
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
      onProgress(percentage, processedCount, total);
    }

    // 4. Important: Yield to Event Loop
    // This small delay prevents the UI from freezing entirely
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`[Step 2] Completed. Successfully fetched ${validPosts.length}/${total} posts.`);
  return validPosts;
}

module.exports = { handleGetPostDetails };