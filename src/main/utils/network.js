// Keep Chromium networking on desktop; Node 22+ supports the headless worker.
const { EventEmitter } = require('events');
const { Readable } = require('stream');

function request(url) {
  const req = new EventEmitter();
  const headers = {};
  const controller = new AbortController();
  req.setHeader = (key, value) => { headers[key] = value; };
  req.abort = () => controller.abort();
  req.end = async () => {
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:') throw new Error('HTTPS required');
      const response = await fetch(target, { headers, signal: controller.signal });
      const stream = Readable.fromWeb(response.body);
      stream.statusCode = response.status;
      stream.on('error', error => req.emit('error', error));
      stream.on('end', () => clearTimeout(timeout));
      req.emit('response', stream);
      // Error status consumers may not read the body.
      if (response.status !== 200) stream.resume();
    } catch (error) {
      clearTimeout(timeout);
      req.emit('error', error);
    }
  };
  return req;
}

module.exports = process.versions.electron ? require('electron').net : { request };
