const {ipcMain,dialog,app,protocol} = require('electron');
const fs = require('node:fs');
const {Readable} = require('node:stream');
const path = require('node:path');
const {ArchiveReader} = require('../../server/local-reader');
const {downloadJob} = require('./downloadJob');
const {normalizeConcurrency} = require('./utils/concurrency');
function setup({store,state,getWindow}) {
  const cache=path.join(app.getPath('userData'),'reader-index');
  const readers = {local:new ArchiveReader(cache),reader:new ArchiveReader(cache)};
  const ready = {};
  const exported=path.join(app.getPath('userData'),'exported');
  let running=false;
  async function getReader(mode) {
    mode=mode==='reader'?'reader':'local';
    if(!ready[mode]) ready[mode]=readers[mode].select(mode==='reader'?(store.get('readerRoot') || exported):exported);
    await ready[mode]; return readers[mode];
  }
  ipcMain.handle('get-login-status',()=>!!store.get('token'));
  ipcMain.handle('save-v2-settings',(_e,value)=>{
    const settings={concurrency:normalizeConcurrency(value.concurrency),blogs:!!value.blogs,gallery:!!value.gallery,movies:!!value.movies};
    store.set('downloadConcurrency',settings.concurrency);store.set('v2Settings',settings);return settings;
  });
  ipcMain.removeHandler('get-download-settings');
  ipcMain.handle('get-download-settings',()=>({blogs:true,gallery:true,movies:true,...store.get('v2Settings',{}),concurrency:normalizeConcurrency(store.get('downloadConcurrency',5)),needsMigration:!store.has('v2Settings')}));
  ipcMain.handle('reader-select',async()=>{
    const selection=await dialog.showOpenDialog(getWindow(),{properties:['openDirectory']});
    if(selection.canceled) return null;
    store.set('readerRoot',selection.filePaths[0]);
    ready.reader=readers.reader.select(selection.filePaths[0]); return ready.reader;
  });
  ipcMain.handle('reader-scan',async(_e,mode)=>(await getReader(mode)).scan());
  ipcMain.handle('reader-query',async(_e,mode,options)=>(await getReader(mode)).query(options));
  ipcMain.handle('reader-detail',async(_e,mode,key)=>(await getReader(mode)).detail(key));
  ipcMain.handle('start-download',async()=>{
    if(running) return {success:false,status:'busy'};
    const token=store.get('token');if(!token) return {success:false,status:'loginRequired'};
    running=true;state.isPaused=false;state.isCancelled=false;
    try {
      const result=await downloadJob({token,directory:exported,cacheDirectory:cache,settings:{blogs:true,gallery:true,movies:true,...store.get('v2Settings',{}),concurrency:store.get('downloadConcurrency',5)},state,emit:p=>{if(!getWindow().isDestroyed())getWindow().webContents.send('job-progress',p);}});
      ready.local=readers.local.select(exported);return result;
    } catch {return {success:false,status:'failed'};} finally {running=false;}
  });
  protocol.handle('archive',async request=>{
    try {
      const url=new URL(request.url), mid=url.pathname.slice(1);
      if(url.hostname!=='media' || !/^[a-f0-9]{64}$/.test(mid) || !['GET','HEAD'].includes(request.method)) return new Response(null,{status:404});
      const reader=Object.values(readers).find(r=>r.media.has(mid));if(!reader) return new Response(null,{status:404});
      const {file,stat,mime}=await reader.resolve(mid);
      let start=0,end=stat.size-1,status=200;
      const range=request.headers.get('range');
      if(range) {
        const match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!match || (!match[1]&&!match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));
        end=match[1]&&match[2]?Math.min(end,Number(match[2])):end;
        if(start>end || start>=stat.size) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        status=206;
      }
      const headers={'Content-Type':mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
      if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      return new Response(request.method==='HEAD'?null:Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
    } catch{return new Response(null,{status:404});}
  });
}
module.exports={setup};
