const net = require('../../utils/network');
const { API_ORIGIN, SITE_ORIGIN } = require('./config');

// Fanclub JSON only. Images and third-party videos use their own download paths.
async function requestJson(endpoint, { token, body, timeoutMs = 30_000, headers = {}, fetchImpl = net.fetch.bind(net) } = {}) {
  const url = new URL(endpoint, API_ORIGIN);
  if (url.origin !== API_ORIGIN || url.username || url.password) {
    throw new Error('Invalid Fanclub API endpoint');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid Fanclub API timeout');
  }
  const requestHeaders = { Origin: SITE_ORIGIN, Referer: `${SITE_ORIGIN}/`, Accept: 'application/json, text/plain, */*', ...headers };
  if (token) requestHeaders.Authorization = /^Bearer /i.test(token) ? token : `Bearer ${token}`;
  const options = { headers: requestHeaders };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    Object.assign(options, { method: 'POST', body: JSON.stringify(body), redirect: 'error' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url.href, { ...options, signal: controller.signal });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`Fanclub HTTP ${response.status}`), { status: response.status });
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

async function getJson(endpoint, credentials, options) {
  const getToken = typeof credentials === 'function' ? credentials : null;
  const token = getToken ? await getToken() : credentials;
  if (!token) throw Object.assign(new Error('Login required'), { code: 'LOGIN_REQUIRED' });
  try {
    return await requestJson(endpoint, { ...options, token });
  } catch (error) {
    if (!getToken || error.status !== 401) throw error;
    const fresh = await getToken(token);
    if (!fresh) throw Object.assign(new Error('Login required'), { code: 'LOGIN_REQUIRED' });
    if (fresh === token) throw error;
    return requestJson(endpoint, { ...options, token: fresh });
  }
}

module.exports = { getJson, requestJson };
