const { net } = require('electron');
const { createWriteStream } = require('fs');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

// Images only: video downloads are handled separately by yt-dlp.
async function downloadToFile(url, targetPath, headers = {}, {
  timeoutMs = 30_000,
  maxBytes = 100 * 1024 * 1024
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Invalid download timeout or size limit');
  }

  // Same directory for atomic rename; unique names isolate concurrent attempts.
  const tempPath = `${targetPath}.${randomUUID()}.part`;
  const controller = new AbortController();
  const timeoutError = new Error(`Download timeout after ${timeoutMs}ms`);
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  let response;
  let tempCreated = false;
  let outputClosed;
  try {
    response = await net.fetch(url, { headers, signal: controller.signal });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Empty download response');
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`File exceeds ${maxBytes} byte limit`);
    }

    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          callback(new Error(`File exceeds ${maxBytes} byte limit`));
        } else {
          callback(null, chunk);
        }
      }
    });
    const output = createWriteStream(tempPath, { flags: 'wx' });
    output.once('open', () => { tempCreated = true; });
    outputClosed = new Promise(resolve => output.once('close', resolve));
    // Pipeline propagates backpressure and destroys streams on failure.
    await pipeline(Readable.fromWeb(response.body), limiter, output, {
      signal: controller.signal
    });
    await outputClosed;
    if (controller.signal.aborted) throw timeoutError;
    clearTimeout(timer);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    const failure = controller.signal.aborted ? timeoutError : error;
    controller.abort();
    // An early source failure may precede the asynchronous file open/close.
    // Wait before unlinking so no late-created .part file can be left behind.
    if (outputClosed) await outputClosed;
    if (response && response.body && !response.body.locked) {
      await response.body.cancel().catch(() => {});
    }
    if (tempCreated) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          throw new Error(`${failure.message}; could not remove temporary file: ${cleanupError.message}`);
        }
      }
    }
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { downloadToFile };
