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
const {diagnostics} = require('../src/main/utils/downloadErrors');
function failureResult(error,input) {
  const details=diagnostics(error,input.item || {id:'list'},input.action==='list'?'list':'download');
  return {id:input.requestId,error:'Download failed',diagnostics:details};
}
if (require.main === module) readline.createInterface({ input: process.stdin }).on('line', line => {
  let input;
  try { input = JSON.parse(line); } catch { return; }
  run(input, {}, progress => write({id:input.requestId,progress})).then(result => write({ id: input.requestId, result })).catch(error => {
    write(failureResult(error,input));
  });
});
module.exports = { run, failureResult };
