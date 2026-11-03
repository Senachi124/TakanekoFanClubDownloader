const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 100;

function normalizeConcurrency(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENCY;
  return Math.min(Math.max(parsed, 1), MAX_CONCURRENCY);
}

module.exports = { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, normalizeConcurrency };
