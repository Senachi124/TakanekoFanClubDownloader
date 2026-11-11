const { getJson } = require('./client');

const count = token => getJson('/auth/notifications/count', token);
const list = (token, limit) => getJson(`/auth/notifications?offset=0&limit=${encodeURIComponent(limit)}&orderType=2&readType=all`, token);
const detail = (token, id, options) => getJson(`/auth/notifications/${encodeURIComponent(id)}`, token, options);

async function listAll(token) {
  const totals = await count(token);
  const result = await list(token, totals.count || totals.total || 1000);
  return Array.isArray(result) ? result : (result.items || result.data || []);
}

module.exports = { count, list, listAll, detail };
