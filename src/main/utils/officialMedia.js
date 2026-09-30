// Source publication metadata remains in Japan time; browser display uses Hong Kong time.
function formatTimestamp(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hourCycle: 'h23' });
}
function formatDateForFilename(value) {
  return formatTimestamp(value).replace(' ', '_').replace(/:/g, '') || 'unknown-date';
}
function safeTitle(value) {
  return Array.from(String(value).replace(/[\x00-\x1f/\\:*?"<>|]/g, '_').trim()).slice(0,60).join('').replace(/[. ]+$/,'') || 'untitled';
}
module.exports = { formatTimestamp, formatDateForFilename, safeTitle };
