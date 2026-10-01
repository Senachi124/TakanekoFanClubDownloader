const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const toolsDir = path.join(projectRoot, 'resources', 'tools', 'windows');
const ytDlpVersion = '2026.08.19';
const ytdlpBase = `https://github.com/yt-dlp/yt-dlp/releases/download/${ytDlpVersion}/`;
const denoVersion = 'v2.9.7';
const denoBase = `https://github.com/denoland/deno/releases/download/${denoVersion}/`;
const ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';

function download(url, destination, redirects = 0) {
  if (redirects > 5) throw new Error(`Too many redirects while downloading ${url}`);

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'TakanekoFanClubDownloader-build' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const output = fs.createWriteStream(destination);
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', reject);
      response.on('error', reject);
    });

    request.setTimeout(120000, () => request.destroy(new Error(`Download timed out: ${url}`)));
    request.on('error', reject);
  });
}

function findFile(root, filename) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return entryPath;
    if (entry.isDirectory()) {
      const result = findFile(entryPath, filename);
      if (result) return result;
    }
  }
  return null;
}

function assertExecutable(filePath, label) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1024 * 1024) {
    throw new Error(`${label} was not downloaded correctly: ${filePath}`);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Windows media tools must be prepared on Windows. Use the Windows GitHub runner for build:win.');
  }

  fs.mkdirSync(toolsDir, { recursive: true });
  const ytDlpPath = path.join(toolsDir, 'yt-dlp.exe');
  const ffmpegPath = path.join(toolsDir, 'ffmpeg.exe');
  const ffprobePath = path.join(toolsDir, 'ffprobe.exe');
  const denoPath = path.join(toolsDir, 'deno.exe');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'takaneko-tools-'));

  try {
    const sums=path.join(tempDir,'yt-dlp-sums.txt');
    await download(ytdlpBase+'SHA2-256SUMS',sums);
    const expected=fs.readFileSync(sums,'utf8').split(/\r?\n/).map(line=>line.trim().split(/\s+/)).find(parts=>parts[1]==='yt-dlp.exe')?.[0];
    if(!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('yt-dlp checksum missing');
    const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!fs.existsSync(ytDlpPath) || sha(ytDlpPath)!==expected) {
      const downloadedYtDlp = path.join(tempDir, 'yt-dlp.exe');
      console.log('Downloading yt-dlp for the Windows package...');
      await download(ytdlpBase+'yt-dlp.exe', downloadedYtDlp);
      if(sha(downloadedYtDlp)!==expected) throw new Error('yt-dlp checksum mismatch');
      fs.copyFileSync(downloadedYtDlp, ytDlpPath);
    }
    assertExecutable(ytDlpPath, 'yt-dlp');
    const denoName='deno-x86_64-pc-windows-msvc.zip';
    const denoZip=path.join(tempDir,denoName),denoSums=path.join(tempDir,'deno-sums.txt');
    await download(denoBase+denoName+'.sha256sum',denoSums);
    await download(denoBase+denoName,denoZip);
    // Windows release assets use PowerShell Get-FileHash output, unlike Unix sha256sum.
    const denoHashes=fs.readFileSync(denoSums,'utf8').match(/\b[a-f0-9]{64}\b/gi) || [];
    if(denoHashes.length!==1 || sha(denoZip)!==denoHashes[0].toLowerCase()) throw new Error('Deno checksum mismatch');
    const denoExtract=path.join(tempDir,'deno');
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      `Expand-Archive -LiteralPath '${denoZip.replace(/'/g,"''")}' -DestinationPath '${denoExtract.replace(/'/g,"''")}'`],{stdio:'inherit'});
    fs.copyFileSync(findFile(denoExtract,'deno.exe'),denoPath);
    assertExecutable(denoPath,'Deno');
    await download(`https://raw.githubusercontent.com/denoland/deno/${denoVersion}/LICENSE.md`,path.join(toolsDir,'LICENSE-DENO.txt'));
    await download(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${ytDlpVersion}/LICENSE`,path.join(toolsDir,'LICENSE-YT-DLP.txt'));
    // Validate bundled executables without any account, network extraction or media download.
    execFileSync(denoPath,['--version'],{stdio:'inherit'});
    execFileSync(ytDlpPath,['--ignore-config','--js-runtimes',`deno:${denoPath}`,'--version'],{stdio:'inherit'});

    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      const ffmpegZip = path.join(tempDir, 'ffmpeg.zip');
      const extractDir = path.join(tempDir, 'ffmpeg');
      console.log('Downloading ffmpeg for the Windows package...');
      await download(ffmpegUrl, ffmpegZip);
      fs.mkdirSync(extractDir, { recursive: true });
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${ffmpegZip.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
      ], { stdio: 'inherit' });

      const extractedFfmpeg = findFile(extractDir, 'ffmpeg.exe');
      const extractedFfprobe = findFile(extractDir, 'ffprobe.exe');
      if (!extractedFfmpeg || !extractedFfprobe) {
        throw new Error('The downloaded ffmpeg archive does not contain ffmpeg.exe and ffprobe.exe.');
      }
      fs.copyFileSync(extractedFfmpeg, ffmpegPath);
      fs.copyFileSync(extractedFfprobe, ffprobePath);
    }

    assertExecutable(ffmpegPath, 'ffmpeg');
    assertExecutable(ffprobePath, 'ffprobe');
    console.log(`Windows media tools ready in ${toolsDir}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
