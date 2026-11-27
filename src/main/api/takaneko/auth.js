const { requestJson } = require('./client');

async function refreshCredentials(refreshToken, fetchImpl) {
  const data = await requestJson('/auth/refresh', { body: { refreshToken }, fetchImpl });
  const access = typeof data?.accessToken === 'string' && data.accessToken.trim();
  if (!access) throw new Error('Refresh response missing accessToken');
  const rotated = typeof data.refreshToken === 'string' && data.refreshToken.trim();
  return { token: /^Bearer /i.test(access) ? access : `Bearer ${access}`, refreshToken: rotated || refreshToken };
}

module.exports = { refreshCredentials };
