// VM video transcodes share two slots; image/detail concurrency remains configurable.
let active = 0;
const pending = [];
async function withVideoSlot(run) {
  if (process.versions.electron) return run();
  if (active >= 2) await new Promise(resolve => pending.push(resolve));
  else active++;
  try { return await run(); }
  finally { const next = pending.shift(); if (next) next(); else active--; }
}
module.exports = { withVideoSlot };
