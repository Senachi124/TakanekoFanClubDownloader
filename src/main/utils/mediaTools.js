const fs = require('fs');
const path = require('path');
const app = process.versions.electron ? require('electron').app : { isPackaged: false };

function getWindowsToolsDir() {
  if (process.platform !== 'win32') return null;

  return app.isPackaged
    ? path.join(process.resourcesPath, 'tools', 'windows')
    : path.join(__dirname, '../../../resources/tools/windows');
}

function getBundledToolsDir() {
  if (process.platform === 'win32') return getWindowsToolsDir();
  if (process.platform !== 'darwin') return null;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tools', 'macos')
    : path.join(__dirname, '../../../resources/tools/macos', process.arch);
}

function getYtDlpConfig() {
  const toolsDir = getBundledToolsDir();
  if (!toolsDir) {
    return { command: 'yt-dlp', ffmpegLocation: null,
      youtubeArgs:['--js-runtimes','node','--remote-components','ejs:github'] };
  }

  const extension = process.platform === 'win32' ? '.exe' : '';
  const command = path.join(toolsDir, 'yt-dlp' + extension);
  const ffmpeg = path.join(toolsDir, 'ffmpeg' + extension);
  const ffprobe = path.join(toolsDir, 'ffprobe' + extension);
  const deno = path.join(toolsDir, 'deno' + extension);
  const usable = file => {
    try {
      if (!fs.statSync(file).isFile()) return false;
      fs.accessSync(file, process.platform === 'darwin' ? fs.constants.X_OK : fs.constants.R_OK);
      return true;
    } catch { return false; }
  };

  if (![command, ffmpeg, ffprobe, deno].every(usable)) {
    if (!app.isPackaged) return { command: 'yt-dlp', ffmpegLocation: null, youtubeArgs:['--js-runtimes','node','--remote-components','ejs:github'] };
    const error = new Error(`${process.platform === 'darwin' ? 'macOS' : 'Windows'} media tools are missing or not executable. Please reinstall the latest version.`);
    error.code = 'MEDIA_TOOL_NOT_FOUND';
    throw error;
  }

  return { command, ffmpegLocation: toolsDir, youtubeArgs:['--js-runtimes',`deno:${deno}`] };
}

module.exports = { getYtDlpConfig };
