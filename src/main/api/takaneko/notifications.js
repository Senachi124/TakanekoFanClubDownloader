const { getJson } = require('./client');

const NOTIFICATION_TYPE = 'message';
const PAGE_SIZE = 50;

const count = token => getJson(`/auth/notifications/count?notificationType=${NOTIFICATION_TYPE}`, token);
const list = (token, limit, offset = 0) => getJson(
  `/auth/notifications?notificationType=${NOTIFICATION_TYPE}&offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}&orderType=2&readType=all`,
  token
);
const detail = (token, id, options) => getJson(`/auth/notifications/${encodeURIComponent(id)}`, token, options);

async function listAll(token) {
  let total = Infinity;
  try {
    const totals = await count(token);
    const reported = Number(totals?.count ?? totals?.total ?? NaN);
    if (Number.isSafeInteger(reported) && reported >= 0) total = reported;
  } catch (error) {
    if (error.status !== 403) throw error;
    // Count endpoint can return 403 on some sessions; fall back to direct pagination.
  }

  const seenPages = new Set();
  const items = [];
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const result = await list(token, PAGE_SIZE, offset);
    const page = Array.isArray(result)
      ? result
      : (Array.isArray(result?.items) ? result.items
        : Array.isArray(result?.data) ? result.data : null);
    if (!page) throw new Error('Invalid notification list');
    if (page.length === PAGE_SIZE) {
      const key = JSON.stringify(page.map(item => item?.notificationReservationId ?? item));
      if (seenPages.has(key)) throw new Error('Repeated notification page');
      seenPages.add(key);
    }
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return items;
}

module.exports = { count, list, listAll, detail };
