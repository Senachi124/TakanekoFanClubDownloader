// src/main/api/getAllPosts.js
const { net } = require('electron');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    
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
 * Step 1: Fetch all notifications from the API (without restricting to message type)
 */
async function handleGetAllPosts(token) {
  const headers = { Authorization: token };

  try {
    console.log('[Step 1] Fetching total count...');
    
    // 拿走 notificationType=message，改撈全部通知
    const countUrl = 'https://api.takanekofc.com/auth/notifications/count';
    const countData = await httpGet(countUrl, headers);
    const count = countData.count || countData.total || 1000;

    console.log(`[Step 1] Total notification count found: ${count}`);

    // 取得全部通知清單
    const notifUrl = `https://api.takanekofc.com/auth/notifications?offset=0&limit=${count}&orderType=2&readType=all`;
    const notifications = await httpGet(notifUrl, headers);

    const list = Array.isArray(notifications) ? notifications : (notifications.items || notifications.data || []);
    return list;
  } catch (error) {
    console.error('[Step 1] Error:', error.message);
    throw error;
  }
}

module.exports = { handleGetAllPosts };