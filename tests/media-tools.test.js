const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/main/utils/mediaTools.js'),'utf8');

function load({platform='darwin',arch='arm64',packaged=true,missing,denied}={}) {
  const checked=[];
  const context={module:{exports:{}},__dirname:path.resolve('src/main/utils'),
    process:{platform,arch,versions:{electron:'28'},resourcesPath:path.resolve('Example App.app/Contents/Resources')},
    require(name) {
      if(name==='electron')return {app:{isPackaged:packaged}};
      if(name==='fs')return {
        constants:fs.constants,
        statSync(file){if(path.basename(file)===missing)throw new Error('missing');return {isFile:()=>true};},
        accessSync(file,mode){checked.push({file,mode});if(path.basename(file)===denied)throw new Error('permission denied');}
      };
      return require(name);
    }};
  vm.runInNewContext(source,context);
  return {get:context.module.exports.getYtDlpConfig,checked,context};
}

for(const arch of ['x64','arm64'])test(`packaged macOS ${arch} uses bundled tools with paths containing spaces`,()=>{
  const {get,checked,context}=load({arch}),config=get();
  const directory=path.join(context.process.resourcesPath,'tools/macos');
  assert.equal(config.command,path.join(directory,'yt-dlp'));
  assert.equal(config.ffmpegLocation,directory);
  assert.deepEqual(Array.from(config.youtubeArgs),['--js-runtimes',`deno:${path.join(directory,'deno')}`]);
  assert.equal(checked.length,4);
  assert.ok(checked.every(check=>check.mode===fs.constants.X_OK));
});

test('incomplete or non-executable packaged tools fail instead of using PATH',()=>{
  for(const name of ['yt-dlp','ffmpeg','ffprobe','deno']) {
    for(const failure of [{missing:name},{denied:name}])assert.throws(load(failure).get,{code:'MEDIA_TOOL_NOT_FOUND'});
  }
});

test('macOS development selects the host architecture and retains the PATH fallback',()=>{
  for(const arch of ['x64','arm64']) {
    assert.equal(load({arch,packaged:false}).get().ffmpegLocation,path.resolve('resources/tools/macos',arch));
    assert.equal(load({arch,packaged:false,missing:'deno'}).get().command,'yt-dlp');
  }
});

test('Windows retains bundled exe tools and Linux retains PATH tools',()=>{
  const windows=load({platform:'win32'}),config=windows.get();
  assert.equal(config.command,path.join(windows.context.process.resourcesPath,'tools/windows/yt-dlp.exe'));
  assert.ok(windows.checked.every(check=>check.mode===fs.constants.R_OK));
  assert.throws(load({platform:'win32',missing:'ffprobe.exe'}).get,{code:'MEDIA_TOOL_NOT_FOUND'});
  assert.equal(load({platform:'linux'}).get().command,'yt-dlp');
});
