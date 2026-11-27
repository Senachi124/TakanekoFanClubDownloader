const { API_ORIGIN, SITE_ORIGIN } = require('../api/takaneko/config');

let inflightRefresh = null;

function fanclubHeaders(token) {
  const headers = {
    Origin: SITE_ORIGIN,
    Referer: `${SITE_ORIGIN}/`,
    Accept: 'application/json'
  };
  if (typeof token === 'string' && token.trim()) {
    const raw = token.trim();
    headers.Authorization = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
  }
  return headers;
}

function parseJwtExp(token) {
  if (typeof token !== 'string') return null;
  const raw = token.trim().replace(/^Bearer\s+/i, '');
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload?.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token, skewSeconds = 30, nowMs = Date.now()) {
  if (typeof token !== 'string' || !token.trim()) return true;
  const exp = parseJwtExp(token);
  if (exp === null) return false;
  return exp <= nowMs / 1000 + skewSeconds;
}

function hasUsableCredentials(store, nowMs = Date.now()) {
  const refreshToken = store.get('refreshToken');
  if (typeof refreshToken === 'string' && refreshToken.trim()) return true;
  const token = store.get('token');
  return typeof token === 'string' && !!token.trim() && !isTokenExpired(token, 30, nowMs);
}

function defaultFetch() {
  return globalThis.fetch;
}

async function refreshAccessToken(refreshToken, fetchImpl = defaultFetch()) {
  const clean = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!clean) {
    const error = new Error('Missing refresh token');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  const response = await fetchImpl(`${API_ORIGIN}/auth/refresh`, {
    method: 'POST',
    headers: { ...fanclubHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: clean }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const error = new Error(`Fanclub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const accessToken = typeof data?.accessToken === 'string' ? data.accessToken.trim() : '';
  if (!accessToken) {
    const error = new Error('Refresh response missing accessToken');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  return accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`;
}

async function ensureFreshToken(store, { forceRefresh = false, fetchImpl = defaultFetch(), nowMs = Date.now() } = {}) {
  const token = store.get('token');
  const refreshToken = store.get('refreshToken');
  if (!forceRefresh && typeof token === 'string' && token.trim() && !isTokenExpired(token, 30, nowMs)) {
    return token;
  }
  if (typeof refreshToken === 'string' && refreshToken.trim()) {
    if (!inflightRefresh) {
      inflightRefresh = refreshAccessToken(refreshToken, fetchImpl)
        .then(fresh => {
          store.set('token', fresh);
          return fresh;
        })
        .catch(error => {
          if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
            if (typeof store.delete === 'function') {
              store.delete('token');
              store.delete('refreshToken');
            }
            return null;
          }
          throw error;
        })
        .finally(() => {
          inflightRefresh = null;
        });
    }
    return inflightRefresh;
  }
  if (typeof token === 'string' && token.trim() && isTokenExpired(token, 30, nowMs)) {
    if (typeof store.delete === 'function') store.delete('token');
  }
  return null;
}

module.exports = {
  fanclubHeaders,
  parseJwtExp,
  isTokenExpired,
  hasUsableCredentials,
  refreshAccessToken,
  ensureFreshToken
};
