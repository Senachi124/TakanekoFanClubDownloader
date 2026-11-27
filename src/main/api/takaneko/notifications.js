const { getJson } = require('./client');

const NOTIFICATION_TYPE = 'message';
const PAGE_SIZE = 50;
const MAX_OFFSET = 50000;

const count = token => getJson(`/auth/notifications/count?notificationType=${NOTIFICATION_TYPE}`, token);
const list = (token, limit, offset = 0) => getJson(
  `/auth/notifications?notificationType=${NOTIFICATION_TYPE}&offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}&orderType=2&readType=all`,
  token
);
const detail = (token, id, options) => getJson(`/auth/notifications/${encodeURIComponent(id)}`, token, options);

async function listAll(token) {
  let total = MAX_OFFSET;
  try {
    const totals = await count(token);
    const reported = Number(totals?.count ?? totals?.total);
    if (Number.isFinite(reported) && reported > 0) total = reported;
  } catch {
    // Count endpoint can return 403 on some sessions; fall back to direct pagination.
  }

  const maxOffset = Math.min(total, MAX_OFFSET);
  const items = [];
  for (let offset = 0; offset < maxOffset; offset += PAGE_SIZE) {
    const result = await list(token, PAGE_SIZE, offset);
    const page = Array.isArray(result)
      ? result
      : (Array.isArray(result?.items) ? result.items
        : Array.isArray(result?.data) ? result.data : []);
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return items;
}

module.exports = { count, list, listAll, detail };
