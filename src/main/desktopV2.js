const {ipcMain,dialog,app,protocol,shell} = require('electron');
const fs = require('node:fs');
const {Readable} = require('node:stream');
const path = require('node:path');
const {ArchiveReader} = require('../../server/local-reader');
const {downloadJob} = require('./downloadJob');
const {normalizeConcurrency} = require('./utils/concurrency');
const {saveMedia,savePost}=require('./archiveActions');
function setup({store,state,getWindow}) {
  const cache=path.join(app.getPath('userData'),'reader-index');
  const readers = {local:new ArchiveReader(cache),reader:new ArchiveReader(cache)};
  const ready = {};
  const exported=()=>store.get('downloadRoot') || path.join(app.getPath('userData'),'exported');
  let running=false;
  async function getReader(mode) {
    mode=mode==='reader'?'reader':'local';
    if(!ready[mode]) ready[mode]=readers[mode].select(mode==='reader'?(store.get('readerRoot') || exported()):exported());
    await ready[mode]; return readers[mode];
  }
  ipcMain.handle('get-login-status',()=>!!store.get('token'));
  ipcMain.handle('youtube-cookies',(_event,value)=>{
    const cookies=require('./utils/youtubeCookies');
    if(!value) return cookies.status();
    if(value.action==='save') return cookies.save(value.content);
    if(value.action==='remove') return cookies.remove();
    throw new Error('YOUTUBE_COOKIES_INVALID');
  });
  ipcMain.handle('open-youtube-help',(_event,key)=>{
    const links={guide:'https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies',extensions:'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp'};
    if(Object.hasOwn(links,key)) return shell.openExternal(links[key]);
  });
  ipcMain.handle('get-download-errors',()=>store.get('downloadErrors',[]));
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
  ipcMain.handle('reader-scan',async(_e,mode)=>{
    mode=mode==='reader'?'reader':'local';
    const initialized=!!ready[mode], reader=await getReader(mode);
    return initialized?reader.scan():reader.summary();
  });
  ipcMain.handle('get-folder-settings',()=>({downloadRoot:exported(),readerRoot:store.get('readerRoot') || exported()}));
  ipcMain.handle('download-folder-select',async()=>{
    if(running)return {error:'LOCATION_BUSY'};
    const selection=await dialog.showOpenDialog(getWindow(),{defaultPath:exported(),properties:['openDirectory','createDirectory']});
    if(selection.canceled)return {cancelled:true};
    if(running)return {error:'LOCATION_BUSY'};
    const root=await fs.promises.realpath(selection.filePaths[0]);
    await fs.promises.access(root,fs.constants.W_OK);
    store.set('downloadRoot',root);delete ready.local;
    if(!store.get('readerRoot'))delete ready.reader;
    return {saved:true};
  });
  // Only indexed IDs cross the preload boundary; renderer paths are never opened.
  ipcMain.handle('archive-action',async(_e,mode,action,id)=>{
    try {
      const reader=await getReader(mode);
      if(action==='reveal-media' || action==='reveal-post') {
        const source=action==='reveal-media'?await reader.resolve(id):await reader.resolvePost(id);
        shell.showItemInFolder(source.file);return {opened:true};
      }
      if(action==='save-media') {
        const {file}=await reader.resolve(id);
        const selection=await dialog.showSaveDialog(getWindow(),{defaultPath:path.join(exported(),path.basename(file))});
        return selection.canceled?{cancelled:true}:await saveMedia(reader,id,selection.filePath);
      }
      if(action==='save-post') {
        await reader.resolvePost(id);
        const selection=await dialog.showOpenDialog(getWindow(),{defaultPath:exported(),properties:['openDirectory','createDirectory']});
        return selection.canceled?{cancelled:true}:await savePost(reader,id,selection.filePaths[0]);
      }
      return {error:'INVALID_ACTION'};
    } catch(error) {return {error:error.message==='SOURCE_READ_ONLY'?'SOURCE_READ_ONLY':'ARCHIVE_UNAVAILABLE'};}
  });
  ipcMain.handle('reader-query',async(_e,mode,options)=>(await getReader(mode)).query(options));
  ipcMain.handle('reader-detail',async(_e,mode,key)=>(await getReader(mode)).detail(key));
  ipcMain.handle('start-download',async()=>{
    if(running) return {success:false,status:'busy'};
    const token=store.get('token');if(!token) return {success:false,status:'loginRequired'};
    running=true;state.isPaused=false;state.isCancelled=false;let errorsSaved=-1;
    try {
      const directory=exported();
      const result=await downloadJob({token,directory,cacheDirectory:cache,settings:{blogs:true,gallery:true,movies:true,...store.get('v2Settings',{}),concurrency:store.get('downloadConcurrency',5)},state,emit:p=>{
        if(errorsSaved!==(p.errors || []).length){store.set('downloadErrors',p.errors || []);errorsSaved=(p.errors || []).length;}
        if(!getWindow().isDestroyed())getWindow().webContents.send('job-progress',p);
      }});
      ready.local=readers.local.select(directory);if(!store.get('readerRoot'))delete ready.reader;return result;
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
