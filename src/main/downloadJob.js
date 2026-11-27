const {run} = require('./api/archiveEngine');
const {normalizeConcurrency,waitForDownload} = require('./utils/concurrency');
const {ArchiveReader} = require('./local-reader');
const {diagnostics} = require('./utils/downloadErrors');
function initialProgress() { return {list:{done:0,total:null,failed:0,skipped:0,state:'running'},details:{done:0,total:null,failed:0,skipped:0,state:'waiting'},files:{done:0,total:null,failed:0,skipped:0,state:'waiting'}}; }
async function downloadJob({token,getToken,directory,settings,state,emit,engine=run}) {
  const progress = initialProgress();
  progress.errors=[];
  const publish = () => emit(JSON.parse(JSON.stringify(progress)));
  let loginRequired = false;
  publish();
  try {
    const listed = await engine({action:'list',...settings,token,getToken},state);
    if (state.isCancelled) throw new Error('Cancelled by user');
    const items = [...new Map(listed.map(i=>[`${i.kind}:${i.id}`,i])).values()];
    progress.list={done:items.length,total:items.length,failed:0,skipped:0,state:'completed'};
    progress.details.total=progress.files.total=items.length;
    progress.details.state=progress.files.state='running'; publish();
    const reader = new ArchiveReader(); await reader.select(directory);
    const existing = new Set(reader.posts.map(p=>`${p.kind}:${p.sourceId}`));
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(items.length,normalizeConcurrency(settings.concurrency))},async()=>{
      while (await waitForDownload(state) && !loginRequired) {
        const item=items[cursor++]; if(!item) return;
        if(existing.has(`${item.kind}:${item.id}`)) {
          for(const stage of ['details','files']) {progress[stage].done++;progress[stage].skipped++;} publish(); continue;
        }
        let detailed=false;
        try {
          await engine({action:'download',token,getToken,item,directory},state,event=>{
            if(event.stage==='details' && !detailed) {detailed=true;progress.details.done++;publish();}
          });
          if(!detailed) progress.details.done++;
          progress.files.done++;
        } catch (error) {
          if (state.isCancelled) return;
          if (error.code === 'LOGIN_REQUIRED') loginRequired = true;
          progress.errors.push(...diagnostics(error,item));
          if(!detailed) {progress.details.done++;progress.details.failed++;}
          progress.files.done++;progress.files.failed++;
        }
        publish();
      }
    }));
    for(const stage of ['details','files']) progress[stage].state=state.isCancelled?'cancelled':progress[stage].failed?'failed':'completed';
    publish();
    return {success:!state.isCancelled && !progress.files.failed,status:state.isCancelled?'cancelled':loginRequired?'loginRequired':progress.files.failed?'failed':'completed',progress};
  } catch(error) {
    if (state.isCancelled) {
      for (const stage of ['list','details','files']) progress[stage].state = 'cancelled';
      publish();
      return {success:false,status:'cancelled',progress};
    }
    for(const stage of Object.values(progress)) if(stage.state==='running') stage.state='failed';
    progress.errors.push(...diagnostics(error,{id:'list'},'list'));
    publish();
    if (error.code === 'LOGIN_REQUIRED') return {success:false,status:'loginRequired',progress};
    throw error;
  }
}
module.exports={downloadJob,initialProgress};
