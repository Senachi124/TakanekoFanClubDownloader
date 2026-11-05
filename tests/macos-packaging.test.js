const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {inspectMachO,verifyMacTools}=require('../scripts/verify-macos-tools');
const {assetsFor,toolNames,minimumMacOS}=require('../scripts/macos-tool-assets');
const {verifyChecksum}=require('../scripts/prepare-macos-tools');
const {buildArguments}=require('../scripts/build-macos');

// Minimal executable headers exercise packaging checks without downloading tools.
function binary(arch='x64',library='/usr/lib/libSystem.B.dylib',minimumOS=0x000c0000) {
  const dylibSize=Math.ceil((24+Buffer.byteLength(library)+1)/8)*8;
  const data=Buffer.alloc(32+dylibSize+16);
  data.writeUInt32LE(0xfeedfacf,0);data.writeUInt32LE(arch==='x64'?0x01000007:0x0100000c,4);
  data.writeUInt32LE(2,16);data.writeUInt32LE(dylibSize+16,20);
  data.writeUInt32LE(0xc,32);data.writeUInt32LE(dylibSize,36);data.writeUInt32LE(24,40);
  data.write(library,56);
  const version=32+dylibSize;
  data.writeUInt32LE(0x24,version);data.writeUInt32LE(16,version+4);data.writeUInt32LE(minimumOS,version+8);
  return data;
}

test('Mach-O inspection reads thin and universal executable architectures',()=>{
  assert.deepEqual(inspectMachO(binary()),[{arch:'x64',libraries:['/usr/lib/libSystem.B.dylib'],minimumOS:0x000c0000}]);
  const x64=binary(),arm64=binary('arm64'),fat=Buffer.alloc(48+x64.length+arm64.length);
  fat.writeUInt32BE(0xcafebabe,0);fat.writeUInt32BE(2,4);
  fat.writeUInt32BE(48,16);fat.writeUInt32BE(x64.length,20);
  fat.writeUInt32BE(48+x64.length,36);fat.writeUInt32BE(arm64.length,40);
  x64.copy(fat,48);arm64.copy(fat,48+x64.length);
  assert.deepEqual(inspectMachO(fat).map(slice=>slice.arch),['x64','arm64']);
  assert.throws(()=>inspectMachO(fat.subarray(0,50)),/Invalid Mach-O slice/);
  assert.throws(()=>inspectMachO(Buffer.alloc(32)),/Mach-O/);
});

test('bundle validation rejects missing tools, wrong architecture and external dependencies',{skip:process.platform==='win32' && 'POSIX executable permissions required'},()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'takaneko-package-test-'));
  try {
    for(const asset of assetsFor('x64'))fs.writeFileSync(path.join(temp,asset.name),'fixture');
    fs.writeFileSync(path.join(temp,'NOTICE-SOURCES.txt'),'Synthetic fixture');
    for(const name of toolNames){fs.writeFileSync(path.join(temp,name),binary());fs.chmodSync(path.join(temp,name),0o755);}
    verifyMacTools(temp,'x64');
    const ffmpeg=path.join(temp,'ffmpeg');
    fs.writeFileSync(ffmpeg,binary('arm64'));
    assert.throws(()=>verifyMacTools(temp,'x64'),/ffmpeg does not support x64/);
    fs.writeFileSync(ffmpeg,binary('x64','/opt/homebrew/lib/libavcodec.dylib'));
    assert.throws(()=>verifyMacTools(temp,'x64'),/external library/);
    fs.writeFileSync(ffmpeg,binary('x64','/usr/lib/libSystem.B.dylib',0x00630000));
    assert.throws(()=>verifyMacTools(temp,'x64'),/requires macOS newer/);
    fs.writeFileSync(ffmpeg,Buffer.concat([binary(),Buffer.from('--enable-nonfree')]));
    assert.throws(()=>verifyMacTools(temp,'x64'),/non-redistributable/);
    fs.writeFileSync(ffmpeg,binary());
    if(process.platform!=='win32') {
      fs.chmodSync(ffmpeg,0o644);assert.throws(()=>verifyMacTools(temp,'x64'),/not executable/);fs.chmodSync(ffmpeg,0o755);
    }
    fs.unlinkSync(path.join(temp,'deno'));
    assert.throws(()=>verifyMacTools(temp,'x64'),/ENOENT/);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('downloads reject changed bytes before extraction',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'takaneko-checksum-test-')),file=path.join(temp,'asset');
  try {
    fs.writeFileSync(file,'expected content');
    const hash=crypto.createHash('sha256').update('expected content').digest('hex');
    verifyChecksum(file,hash);
    fs.appendFileSync(file,'changed');assert.throws(()=>verifyChecksum(file,hash),/SHA-256 mismatch/);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('build selection and packaging keep platform tools isolated',()=>{
  assert.deepEqual(buildArguments([]),{architectures:['x64','arm64'],directoryOnly:false});
  assert.deepEqual(buildArguments(['--arm64','--dir']),{architectures:['arm64'],directoryOnly:true});
  assert.throws(()=>buildArguments(['--universal']),/Use --x64/);
  assert.throws(()=>assetsFor('ia32'),/Unsupported/);
  for(const arch of ['x64','arm64'])for(const asset of assetsFor(arch)) {
    assert.match(asset.url,/^https:\/\//);assert.match(asset.sha256,/^[0-9a-f]{64}$/);
  }
  const {build}=require('../package.json');
  assert.equal(build.extraResources,undefined);
  assert.equal(build.mac.extraResources[0].from,'resources/tools/macos/${arch}');
  assert.equal(build.mac.minimumSystemVersion,minimumMacOS);
  assert.deepEqual(build.mac.binaries,toolNames.map(name=>'Contents/Resources/tools/macos/'+name));
  assert.equal(build.win.extraResources[0].to,'tools/windows');
});
