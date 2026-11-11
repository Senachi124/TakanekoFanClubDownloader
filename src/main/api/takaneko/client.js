const net = require('../../utils/network');
const { API_ORIGIN } = require('./config');

// Fanclub JSON only. Images and third-party videos use their own download paths.
async function getJson(endpoint, token, { timeoutMs = 30_000, headers = {} } = {}) {
  const url = new URL(endpoint, API_ORIGIN);
  if (url.origin !== API_ORIGIN || url.username || url.password) {
    throw new Error('Invalid Fanclub API endpoint');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid Fanclub API timeout');
  }
  const authorization = /^Bearer /i.test(token) ? token : `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await net.fetch(url.href, {
      headers: { Accept: 'application/json, text/plain, */*', ...headers, Authorization: authorization },
      signal: controller.signal
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Fanclub HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (!(error instanceof SyntaxError)) throw error;
      // Do not expose an upstream response body in diagnostics or logs.
      throw new Error('Invalid Fanclub JSON response');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error('Fanclub request timeout');
      timeout.code = 'TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getJson };
