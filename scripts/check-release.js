const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pkg=require('../package.json'),lock=require('../package-lock.json');
assert.match(pkg.version,/^2\.\d+\.\d+$/);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
assert.equal(pkg.build.appId,'com.takaneko.downloader');assert.equal(pkg.productName,'Takaneko Fanclub Downloader');
assert.deepEqual(pkg.build.files,['src/**/*','server/local-reader/**/*','package.json','README.md','LICENSE','!**/*.test.js']);
for(const entry of ['src/main/preload.js','server/local-reader/index.js','src/shared/ui.js','src/shared/style.css'])assert.ok(fs.existsSync(entry),entry);
// Validate contents of every built ASAR, rather than relying on ignore patterns alone.
if(process.argv.includes('--packages')) {
  const asar=require('@electron/asar');let checked=0;
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='app.asar'){
    const files=asar.listPackage(file).map(name=>name.replace(/\\/g,'/'));for(const name of files)assert.ok(!/\/(?:\.private-v2|deployment|exported|\.backup-state)\/|deployment-access|session\.json|admin-password/.test(name),name);
    for(const name of files)assert.ok(/^\/(?:src|server|node_modules)(?:\/|$)|^\/(?:package.json|README.md|LICENSE)$/.test(name),name);
    for(const name of files.filter(n=>n.startsWith('/server/')))assert.ok(name==='/server/local-reader'||name.startsWith('/server/local-reader/'),name);
    const packed=JSON.parse(asar.extractFile(file,'package.json'));assert.equal(packed.version,pkg.version);checked++;
  }}};
  walk('dist');assert.ok(checked>0,'No packaged app.asar found');
}
console.log('Release identity, version and package boundaries verified.');
