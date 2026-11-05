// Public upstream release assets. Update URLs and SHA-256 digests together.
const ytDlpVersion = '2026.08.19';
const denoVersion = 'v2.9.7';
const ffmpegRelease = 'v8.1.2-27';
const ffmpegVersion = '8.1.2';
const minimumMacOS = '12.0';
const ytBase = `https://github.com/yt-dlp/yt-dlp/releases/download/${ytDlpVersion}/`;
const denoBase = `https://github.com/denoland/deno/releases/download/${denoVersion}/`;
const ffBase = `https://github.com/serversideup/ffmpeg-lgpl-builds/releases/download/${ffmpegRelease}/`;
const profiles = {
  x64: {
    denoTarget: 'x86_64-apple-darwin', deno: '95daaff11c116a52ad54785e7914c8e9c9cdcaba793c5ed929c74ca2d8e6259a',
    ffmpeg: '51ac761dde58a600bb685a5d2510ae38d6ade1f62ef2ef556263c67cb69f2b00'
  },
  arm64: {
    denoTarget: 'aarch64-apple-darwin', deno: '5cd46d6268f6f78f5d88bdc7159d20bd44cdaa4b3303474839f87ec6fe7ae25c',
    ffmpeg: 'ac0babf65798bf681da1dc81c4fe4ae049d0d26e161410174b0e120e3e783332'
  }
};
const toolNames = ['yt-dlp','ffmpeg','ffprobe','deno'];
function assetsFor(arch) {
  const profile = profiles[arch];
  if (!profile) throw new Error(`Unsupported macOS architecture: ${arch}`);
  return [
    {name:'yt-dlp',url:ytBase+'yt-dlp_macos',sha256:'0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'},
    ...[
      ['ffmpeg','ffmpeg'],['ffprobe','ffprobe'],
      ['LICENSE-FFMPEG.txt','COPYING.LGPLv2.1'],['NOTICE-FFMPEG.txt','SOURCE.txt'],
      ['LICENSE-OPENSSL.txt','OPENSSL-LICENSE'],['NOTICE-FFMPEG-LICENSE.md','FFMPEG-LICENSE.md']
    ].map(([name,member])=>({name,member,url:ffBase+`ffmpeg-${ffmpegVersion}-${profile.denoTarget}.tar.gz`,sha256:profile.ffmpeg,compression:'tar.gz'})),
    {name:'deno',url:denoBase+`deno-${profile.denoTarget}.zip`,sha256:profile.deno,compression:'zip'},
    {name:'LICENSE-YT-DLP.txt',url:`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${ytDlpVersion}/LICENSE`,sha256:'7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c'},
    {name:'LICENSE-YT-DLP-THIRD-PARTY.txt',url:`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${ytDlpVersion}/THIRD_PARTY_LICENSES.txt`,sha256:'472aefe951c7db35e1657c1d13fd337140511ed6f2b329205105ad441c5a02b7'},
    {name:'LICENSE-DENO.txt',url:`https://raw.githubusercontent.com/denoland/deno/${denoVersion}/LICENSE.md`,sha256:'f62497fffecc0852960c8d3e6934b9db86d16396e9b604072e923892cae3a588'}
  ];
}
module.exports = {assetsFor,toolNames,ytDlpVersion,denoVersion,ffmpegRelease,minimumMacOS};
