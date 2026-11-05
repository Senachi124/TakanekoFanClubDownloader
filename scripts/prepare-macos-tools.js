const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {assetsFor,toolNames,ytDlpVersion,denoVersion,ffmpegRelease} = require('./macos-tool-assets');
const {verifyMacTools} = require('./verify-macos-tools');

function verifyChecksum(file,expected) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error(`SHA-256 mismatch: ${path.basename(file)}`);
}
async function prepareMacTools(arch) {
  const assets = assetsFor(arch);
  const destination = path.resolve(__dirname,'../resources/tools/macos',arch);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'takaneko-macos-tools-'));
  const stage = path.join(temp,'tools');fs.mkdirSync(stage);
  try {
    const downloaded = new Map();
    for (const asset of assets) {
      const download = downloaded.get(asset.url) || path.join(temp,asset.name+'.download'), target = path.join(stage,asset.name);
      console.log(`Preparing macOS ${arch}: ${asset.name}`);
      // curl ships with macOS. Fail on HTTP errors and disallow insecure redirects.
      if (!downloaded.has(asset.url)) execFileSync('curl',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--retry','3','--connect-timeout','20','--max-time','180','--output',download,asset.url],{stdio:'inherit',timeout:240000});
      verifyChecksum(download,asset.sha256);
      downloaded.set(asset.url,download);
      if (asset.compression === 'zip' || asset.compression === 'tar.gz') {
        const output = fs.openSync(target,'w');
        // Extract only the named member to an open file; archive paths never reach the filesystem.
        try { execFileSync(asset.compression === 'zip' ? 'unzip' : 'tar',asset.compression === 'zip' ? ['-p',download,asset.name] : ['-xzOf',download,asset.member],{stdio:['ignore',output,'pipe'],timeout:60000}); }
        finally { fs.closeSync(output); }
      } else fs.copyFileSync(download,target);
      fs.chmodSync(target,toolNames.includes(asset.name)?0o755:0o644);
    }
    fs.writeFileSync(path.join(stage,'NOTICE-SOURCES.txt'),[
      'Bundled command-line tools are separate executables with their own licenses.',
      `yt-dlp ${ytDlpVersion}: https://github.com/yt-dlp/yt-dlp/releases/tag/${ytDlpVersion}`,
      `Deno ${denoVersion}: https://github.com/denoland/deno/releases/tag/${denoVersion}`,
      `FFmpeg/FFprobe release assets ${ffmpegRelease}: https://github.com/serversideup/ffmpeg-lgpl-builds/releases/tag/${ffmpegRelease}`,
      `FFmpeg build scripts: https://github.com/serversideup/ffmpeg-lgpl-builds/tree/${ffmpegRelease}`,
      'FFmpeg upstream sources: https://ffmpeg.org/download.html',
      'See LICENSE-* and NOTICE-FFMPEG.txt for upstream license and build details.',
      'Bundled executable contents are unmodified before application code signing.',
      '',...assets.map(asset=>`${asset.name}\n${asset.url}\nSHA-256 (download): ${asset.sha256}`),''
    ].join('\n'));
    verifyMacTools(stage,arch,{execute:process.platform==='darwin' && process.arch===arch});
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.rmSync(destination,{recursive:true,force:true});
    fs.cpSync(stage,destination,{recursive:true});
    console.log(`macOS ${arch} tools ready.`);
    return destination;
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}
module.exports = {prepareMacTools,verifyChecksum};
if (require.main === module) {
  const architectures = process.argv.slice(2);
  (async()=>{for(const arch of architectures.length?architectures:['x64','arm64'])await prepareMacTools(arch);})().catch(error=>{console.error(error.message);process.exitCode=1;});
}
