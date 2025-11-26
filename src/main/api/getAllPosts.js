const { net } = require('electron');

/**
 * Helper: Make a simple HTTP GET request with timeout
 * @param {string} url - Target URL
 * @param {object} headers - Request headers
 * @returns {Promise<any>} - Parsed JSON or Error
 */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    
    // Timeout protection (30 seconds)
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('Request timed out'));
    }, 30000);

    Object.entries(headers).forEach(([key, value]) => {
      request.setHeader(key, value);
    });

    let data = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        data += chunk.toString();
      });

      response.on('end', () => {
        clearTimeout(timer);
        try {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    request.end();
  });
}

/**
 * Step 1: Fetch all notification IDs from the API
 * @param {string} token - Bearer token
 * @returns {Promise<Array>} - Array of notification objects
 */
async function handleGetAllPosts(token) {
  const headers = { Authorization: token };

  try {
    console.log('[Step 1] Fetching total count...');
    
    // 1. Get the total count of messages
    const countUrl = 'https://api.takanekofc.com/auth/notifications/count?notificationType=message';
    const countData = await httpGet(countUrl, headers);
    const count = countData.count;

    console.log(`[Step 1] Total message count found: ${count}`);

    // 2. Fetch all notifications in one go (Pagination limit set to count)
    // Note: If API fails with 7000 items, we might need to paginate this too,
    // but usually the list endpoint is lighter than details.
    const notifUrl = `https://api.takanekofc.com/auth/notifications?notificationType=message&offset=0&limit=${count}&orderType=2&readType=all`;
    const notifications = await httpGet(notifUrl, headers);

    return notifications;
  } catch (error) {
    console.error('[Step 1] Error:', error.message);
    throw error;
  }
}

module.exports = { handleGetAllPosts };