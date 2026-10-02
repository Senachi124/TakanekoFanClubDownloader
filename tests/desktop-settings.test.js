const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
test('desktop downloads use the selected directory and lock changes until the job ends',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-settings-'));
  const destination=path.join(temp,'downloads');await fs.mkdir(destination);
  const handlers=new Map(),values=new Map([['token','synthetic-token']]);
  const store={get:(key,fallback)=>values.has(key)?values.get(key):fallback,set:(key,value)=>values.set(key,value),has:key=>values.has(key)};
  let choice={canceled:true},finish,captured;
  const original=Module._load;
  Module._load=function(name,...args){
    if(name==='electron')return {ipcMain:{handle:(key,fn)=>handlers.set(key,fn),removeHandler:key=>handlers.delete(key)},app:{getPath:()=>temp},protocol:{handle:()=>{}},shell:{},dialog:{showOpenDialog:async()=>choice}};
    if(name==='./downloadJob')return {downloadJob:async options=>{captured=options;await new Promise(resolve=>finish=resolve);return {success:true,status:'completed'};}};
    return original.call(this,name,...args);
  };
  try {
    require('../src/main/desktopV2').setup({store,state:{},getWindow:()=>({isDestroyed:()=>true})});
    Module._load=original;
    const invoke=(name,...args)=>handlers.get(name)(null,...args);
    assert.equal(invoke('get-folder-settings').downloadRoot,path.join(temp,'exported'));
    assert.deepEqual(await invoke('download-folder-select'),{cancelled:true});assert.ok(!values.has('downloadRoot'));
    choice={canceled:false,filePaths:[destination]};await invoke('download-folder-select');
    assert.equal(invoke('get-folder-settings').downloadRoot,await fs.realpath(destination));
    const job=invoke('start-download');
    assert.equal(captured.directory,await fs.realpath(destination));assert.equal(captured.token,'synthetic-token');
    assert.deepEqual(await invoke('download-folder-select'),{error:'LOCATION_BUSY'});
    finish();assert.equal((await job).status,'completed');
    await invoke('reader-query','local'); // Wait for the post-download scan before cleanup.
    assert.equal(store.get('token'),'synthetic-token');
  } finally {Module._load=original;assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
