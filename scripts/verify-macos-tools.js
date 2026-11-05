const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {assetsFor,toolNames,minimumMacOS} = require('./macos-tool-assets');

// Inspect binaries on any build host, including Linux test runners.
function inspectMachO(buffer) {
  assert.ok(buffer.length >= 32, 'Truncated Mach-O binary');
  const magic = buffer.readUInt32BE(0);
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = buffer.readUInt32BE(4), stride = magic === 0xcafebabe ? 20 : 32;
    assert.ok(count > 0 && count <= 16 && 8 + count * stride <= buffer.length, 'Invalid universal binary');
    return Array.from({length:count},(_,i)=>{
      const entry = 8 + i * stride;
      const offset = stride === 20 ? buffer.readUInt32BE(entry+8) : Number(buffer.readBigUInt64BE(entry+8));
      const size = stride === 20 ? buffer.readUInt32BE(entry+12) : Number(buffer.readBigUInt64BE(entry+16));
      assert.ok(offset >= 8 + count * stride && size >= 32 && offset + size <= buffer.length, 'Invalid Mach-O slice');
      return inspectMachO(buffer.subarray(offset,offset+size));
    }).flat();
  }
  assert.equal(buffer.readUInt32LE(0),0xfeedfacf,'Expected a 64-bit Mach-O executable');
  const arch = ({[0x01000007]:'x64',[0x0100000c]:'arm64'})[buffer.readUInt32LE(4)];
  assert.ok(arch,'Unsupported Mach-O CPU');
  const count = buffer.readUInt32LE(16), end = 32 + buffer.readUInt32LE(20);
  assert.ok(end <= buffer.length && count <= 4096,'Invalid Mach-O load commands');
  let offset = 32, minimumOS = 0;
  const libraries = [];
  for (let i=0;i<count;i++) {
    assert.ok(offset+8 <= end,'Truncated load command');
    const command = buffer.readUInt32LE(offset) & 0x7fffffff, size = buffer.readUInt32LE(offset+4);
    assert.ok(size >= 8 && offset+size <= end,'Invalid load command size');
    if ([0xc,0x18,0x1f,0x23].includes(command)) {
      assert.ok(size >= 24,'Truncated dylib command');
      const nameOffset = buffer.readUInt32LE(offset+8);
      assert.ok(nameOffset >= 24 && nameOffset < size,'Invalid dylib name');
      const start = offset+nameOffset, stop = buffer.indexOf(0,start);
      assert.ok(stop >= start && stop < offset+size,'Invalid dylib string');
      libraries.push(buffer.toString('utf8',start,stop));
    }
    if (command === 0x24 || command === 0x32) {
      assert.ok(size >= 16,'Truncated version command');
      minimumOS = Math.max(minimumOS,buffer.readUInt32LE(offset+(command === 0x32 ? 12 : 8)));
    }
    offset += size;
  }
  return [{arch,libraries,minimumOS}];
}

function verifyMacTools(directory,arch,{execute=false}={}) {
  const [major,minor,patch=0] = minimumMacOS.split('.').map(Number);
  const supportedOS = (major << 16) | (minor << 8) | patch;
  for (const asset of assetsFor(arch)) {
    const file = path.join(directory,asset.name);
    assert.ok(fs.statSync(file).isFile() && fs.statSync(file).size > 0,`Missing bundled asset: ${asset.name}`);
  }
  assert.ok(fs.statSync(path.join(directory,'NOTICE-SOURCES.txt')).size > 0,'Missing tool source notices');
  for (const name of toolNames) {
    const file = path.join(directory,name), data = fs.readFileSync(file);
    assert.ok(fs.statSync(file).mode & 0o111,`Tool is not executable: ${name}`);
    const slice = inspectMachO(data).find(item=>item.arch === arch);
    assert.ok(slice,`${name} does not support ${arch}`);
    assert.ok(slice.minimumOS <= supportedOS,`${name} requires macOS newer than ${minimumMacOS}`);
    for (const library of slice.libraries) assert.ok(library.startsWith('/usr/lib/') || library.startsWith('/System/Library/'),`${name} depends on an external library: ${library}`);
    if (name === 'ffmpeg' || name === 'ffprobe') assert.ok(!data.includes(Buffer.from('--enable-nonfree')),`${name} is a non-redistributable build`);
  }
  if (execute) {
    assert.equal(process.platform,'darwin','Executable checks require macOS');
    assert.equal(process.arch,arch,'Run executable checks on the matching architecture');
    const env = {...process.env,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',DENO_NO_UPDATE_CHECK:'1'};
    const run = (name,args)=>execFileSync(path.join(directory,name),args,{env,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
    assert.ok(run('yt-dlp',['--ignore-config','--js-runtimes',`deno:${path.join(directory,'deno')}`,'--version']).trim());
    assert.equal(run('deno',['eval','console.log(1 + 1)']).trim(),'2');
    const encoders = run('ffmpeg',['-hide_banner','-encoders']);
    assert.match(encoders,/hevc_videotoolbox/);assert.match(encoders,/\baac\b/);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(),'takaneko-media-check-'));
    try {
      const video = path.join(temp,'fixture.mp4');
      run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.1','-c:v','mpeg4','-y',video]);
      const result = JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_name','-of','json',video]));
      assert.equal(result.streams[0].codec_name,'mpeg4');
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
  }
}
module.exports = {inspectMachO,verifyMacTools};
if (require.main === module) {
  try { verifyMacTools(path.resolve(process.argv[2]),process.argv[3],{execute:process.argv.includes('--execute')});console.log('macOS bundled tools verified.'); }
  catch (error) {console.error(error.message);process.exitCode=1;}
}
