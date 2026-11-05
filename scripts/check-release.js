const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pkg=require('../package.json'),lock=require('../package-lock.json');
assert.match(pkg.version,/^2\.\d+\.\d+$/);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
assert.equal(pkg.build.appId,'com.takaneko.downloader');assert.equal(pkg.productName,'Takaneko Fanclub Downloader');
assert.deepEqual(pkg.build.files,['src/**/*','package.json','README.md','LICENSE','!**/*.test.js']);
assert.equal(pkg.build.extraResources,undefined,'Platform tools must not leak into other packages');
assert.equal(pkg.build.mac.extraResources[0].from,'resources/tools/macos/${arch}');
assert.equal(pkg.build.mac.extraResources[0].to,'tools/macos');
assert.equal(pkg.build.win.extraResources[0].to,'tools/windows');
assert.equal(pkg.build.mac.minimumSystemVersion,require('./macos-tool-assets').minimumMacOS);
for(const entry of ['src/main/preload.js','src/main/local-reader/index.js','src/shared/ui.js','src/shared/style.css'])assert.ok(fs.existsSync(entry),entry);
// Validate contents of every built ASAR, rather than relying on ignore patterns alone.
if(process.argv.includes('--packages')) {
  const asar=require('@electron/asar');let checked=0;
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='app.asar'){
    const files=asar.listPackage(file).map(name=>name.replace(/\\/g,'/'));for(const name of files)assert.ok(!/\/(?:\.private-v2|deployment|exported|\.backup-state)\/|deployment-access|session\.json|admin-password/.test(name),name);
    for(const name of files)assert.ok(/^\/(?:src|node_modules)(?:\/|$)|^\/(?:package.json|README.md|LICENSE)$/.test(name),name);
    for(const name of ['/src/main/local-reader/index.js'])assert.ok(files.includes(name),`Missing bundled reader: ${name}`);
    const packed=JSON.parse(asar.extractFile(file,'package.json'));assert.equal(packed.version,pkg.version);checked++;
    const resources=path.dirname(file);
    if(path.basename(resources)==='Resources') {
      const {inspectMachO,verifyMacTools}=require('./verify-macos-tools');
      const executable=path.join(path.dirname(resources),'MacOS',pkg.productName);
      const architectures=inspectMachO(fs.readFileSync(executable)).map(item=>item.arch);
      assert.equal(architectures.length,1,'Expected a separate package for each Mac architecture');
      const arch=architectures[0];
      verifyMacTools(path.join(resources,'tools/macos'),arch,{execute:process.platform==='darwin' && process.arch===arch});
      assert.ok(!fs.existsSync(path.join(resources,'tools/windows')),'Windows tools in macOS package');
    } else {
      const tools=path.join(resources,'tools/windows');
      for(const name of ['yt-dlp.exe','ffmpeg.exe','ffprobe.exe','deno.exe','LICENSE-DENO.txt'])assert.ok(fs.existsSync(path.join(tools,name)),`Missing bundled tool: ${name}`);
      assert.ok(!fs.existsSync(path.join(resources,'tools/macos')),'macOS tools in Windows package');
    }
  }}};
  const output=process.argv[process.argv.indexOf('--packages')+1] || pkg.build.directories.output;
  walk(output);assert.ok(checked>0,'No packaged app.asar found');
}
console.log('Release identity, version and package boundaries verified.');
