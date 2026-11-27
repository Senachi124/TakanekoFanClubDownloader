const { refreshCredentials } = require('../api/takaneko/auth');

const pendingRefresh = new WeakMap();

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

// Invalidate outstanding refreshes before changing the stored account.
function replaceCredentials(store, credentials) {
  pendingRefresh.delete(store);
  if (credentials) {
    store.set({ token: credentials.token, refreshToken: credentials.refreshToken || null });
  } else {
    const settings = store.store;
    delete settings.refreshToken;
    delete settings.token;
    store.store = settings;
  }
}

async function ensureFreshToken(store, { rejectedToken, fetchImpl, nowMs = Date.now() } = {}) {
  const token = store.get('token');
  if (token && token !== rejectedToken && !isTokenExpired(token, 30, nowMs)) return token;
  const refreshToken = store.get('refreshToken');
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    if (token) replaceCredentials(store, null);
    return null;
  }

  const pending = pendingRefresh.get(store);
  if (pending) return pending;
  const request = refreshCredentials(refreshToken, fetchImpl)
    .then(credentials => {
      if (pendingRefresh.get(store) !== request) return null;
      replaceCredentials(store, credentials);
      return credentials.token;
    }, error => {
      if (pendingRefresh.get(store) !== request) return null;
      if (![400, 401, 403].includes(error.status)) throw error;
      replaceCredentials(store, null);
      return null;
    })
    .finally(() => {
      if (pendingRefresh.get(store) === request) pendingRefresh.delete(store);
    });
  pendingRefresh.set(store, request);
  return request;
}

module.exports = { parseJwtExp, isTokenExpired, hasUsableCredentials, ensureFreshToken, replaceCredentials };
