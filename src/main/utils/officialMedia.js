// Source publication metadata and browser display use Japan time.
function formatTimestamp(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hourCycle: 'h23' });
}
function formatDateForFilename(value) {
  return formatTimestamp(value).replace(' ', '_').replace(/:/g, '') || 'unknown-date';
}
function undatedFilenamePrefix(sourceId) {
  const crypto = require('node:crypto');
  const suffix = sourceId == null ? crypto.randomBytes(6).toString('hex')
    : crypto.createHash('sha256').update(String(sourceId)).digest('hex').slice(0,12);
  return `unknown-date-${suffix}`;
}
function safeTitle(value) {
  return Array.from(String(value).replace(/[\x00-\x1f/\\:*?"<>|]/g, '_').trim()).slice(0,60).join('').replace(/[. ]+$/,'') || 'untitled';
}
module.exports = { formatTimestamp, formatDateForFilename, undatedFilenamePrefix, safeTitle };
