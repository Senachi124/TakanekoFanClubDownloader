const fs = require('fs');
const path = require('path');
const app = process.versions.electron ? require('electron').app : { isPackaged: false };

function getWindowsToolsDir() {
  if (process.platform !== 'win32') return null;

  return app.isPackaged
    ? path.join(process.resourcesPath, 'tools', 'windows')
    : path.join(__dirname, '../../../resources/tools/windows');
}

function getYtDlpConfig() {
  const toolsDir = getWindowsToolsDir();
  if (!toolsDir) {
    const serverTool=path.join(__dirname,'../../../server/tools/yt-dlp');
    const server=!process.versions.electron;
    return { command: server && fs.existsSync(serverTool) ? serverTool : 'yt-dlp', ffmpegLocation: null,
      youtubeArgs:['--js-runtimes',server?`node:${process.execPath}`:'node','--remote-components','ejs:github'] };
  }

  const command = path.join(toolsDir, 'yt-dlp.exe');
  const ffmpeg = path.join(toolsDir, 'ffmpeg.exe');
  const ffprobe = path.join(toolsDir, 'ffprobe.exe');
  const deno = path.join(toolsDir, 'deno.exe');

  if (![command, ffmpeg, ffprobe, deno].every(file => fs.existsSync(file))) {
    if (!app.isPackaged) return { command: 'yt-dlp', ffmpegLocation: null, youtubeArgs:['--js-runtimes','node','--remote-components','ejs:github'] };
    throw new Error('Windows media tools are missing from this installation. Please reinstall the latest version.');
  }

  return { command, ffmpegLocation: toolsDir, youtubeArgs:['--js-runtimes',`deno:${deno}`] };
}

module.exports = { getYtDlpConfig };
