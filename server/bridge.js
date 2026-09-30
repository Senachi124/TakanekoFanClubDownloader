// Line-delimited private worker protocol. Tokens arrive over stdin, never argv/logs.
const readline = require('readline');
const fs = require('fs/promises');
const path = require('path');
const output = process.stdout.write.bind(process.stdout);
const write = value => output(JSON.stringify(value) + '\n');
if (require.main === module) {
  process.stdout.write = () => true;
  console.log = console.warn = console.error = () => {};
}
const {run} = require('../src/main/api/archiveEngine');
if (require.main === module) readline.createInterface({ input: process.stdin }).on('line', line => {
  let input;
  try { input = JSON.parse(line); } catch { return; }
  run(input, {}, progress => write({id:input.requestId,progress})).then(result => write({ id: input.requestId, result })).catch(error => {
    const http = String(error.message).match(/HTTP (\d{3})/);
    write({ id: input.requestId, error: http ? `Fanclub HTTP ${http[1]}` : 'Download failed; retry or check Fanclub token.' });
  });
});
module.exports = { run };
