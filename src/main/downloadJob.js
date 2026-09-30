const {run} = require('./api/archiveEngine');
const {normalizeConcurrency} = require('./utils/concurrency');
const {ArchiveReader} = require('../../server/local-reader');
const {diagnostics} = require('./utils/downloadErrors');
function initialProgress() { return {list:{done:0,total:null,failed:0,skipped:0,state:'running'},details:{done:0,total:null,failed:0,skipped:0,state:'waiting'},files:{done:0,total:null,failed:0,skipped:0,state:'waiting'}}; }
async function downloadJob({token,directory,cacheDirectory,settings,state,emit,engine=run}) {
  const progress = initialProgress();
  progress.errors=[];
  const publish = () => emit(JSON.parse(JSON.stringify(progress)));
  publish();
  try {
    const items = [...new Map((await engine({action:'list',token,...settings},state)).map(i=>[`${i.kind}:${i.id}`,i])).values()];
    progress.list={done:items.length,total:items.length,failed:0,skipped:0,state:'completed'};
    progress.details.total=progress.files.total=items.length;
    progress.details.state=progress.files.state='running'; publish();
    const reader = new ArchiveReader(cacheDirectory); await reader.select(directory);
    const existing = new Set(reader.posts.map(p=>`${p.kind}:${p.sourceId}`));
    let cursor=0;
    const wait = async () => { while (state.isPaused && !state.isCancelled) await new Promise(r=>setTimeout(r,200)); return !state.isCancelled; };
    await Promise.all(Array.from({length:Math.min(items.length,normalizeConcurrency(settings.concurrency))},async()=>{
      while (await wait()) {
        const item=items[cursor++]; if(!item) return;
        if(existing.has(`${item.kind}:${item.id}`)) {
          for(const stage of ['details','files']) {progress[stage].done++;progress[stage].skipped++;} publish(); continue;
        }
        let detailed=false;
        try {
          await engine({action:'download',token,item,directory},state,event=>{
            if(event.stage==='details' && !detailed) {detailed=true;progress.details.done++;publish();}
          });
          if(!detailed) progress.details.done++;
          progress.files.done++;
        } catch (error) {
          progress.errors.push(...diagnostics(error,item));
          if(!detailed) {progress.details.done++;progress.details.failed++;}
          progress.files.done++;progress.files.failed++;
        }
        publish();
      }
    }));
    for(const stage of ['details','files']) progress[stage].state=state.isCancelled?'cancelled':progress[stage].failed?'failed':'completed';
    publish();
    return {success:!state.isCancelled && !progress.files.failed,status:state.isCancelled?'cancelled':progress.files.failed?'failed':'completed',progress};
  } catch(error) {
    for(const stage of Object.values(progress)) if(stage.state==='running') stage.state='failed';
    progress.errors.push(...diagnostics(error,{id:'list'},'list'));
    publish(); throw error;
  }
}
module.exports={downloadJob,initialProgress};
