const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getWindowsToolsDir() {
  if (process.platform !== 'win32') return null;

  return app.isPackaged
    ? path.join(process.resourcesPath, 'tools', 'windows')
    : path.join(__dirname, '../../../resources/tools/windows');
}

function getYtDlpConfig() {
  const toolsDir = getWindowsToolsDir();
  if (!toolsDir) {
    return { command: 'yt-dlp', ffmpegLocation: null };
  }

  const command = path.join(toolsDir, 'yt-dlp.exe');
  const ffmpeg = path.join(toolsDir, 'ffmpeg.exe');
  const ffprobe = path.join(toolsDir, 'ffprobe.exe');

  if (![command, ffmpeg, ffprobe].every(file => fs.existsSync(file))) {
    if (!app.isPackaged) return { command: 'yt-dlp', ffmpegLocation: null };
    throw new Error('Windows media tools are missing from this installation. Please reinstall the latest version.');
  }

  return { command, ffmpegLocation: toolsDir };
}

module.exports = { getYtDlpConfig };
