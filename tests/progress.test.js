const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {downloadJob}=require('../src/main/downloadJob');
test('stages aggregate categories, skip completed posts and report partial failures without false success',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-progress-'));
  try {
    await fs.mkdir(path.join(root,'export','member','old'),{recursive:true});await fs.writeFile(path.join(root,'export','member','old','.post-id'),'1');await fs.writeFile(path.join(root,'export','member','old','index.md'),'# Old');
    const snapshots=[];let active=0,peak=0;
    const engine=async(input,state,event)=>{
      if(input.action==='list')return [{kind:'post',id:'1'},{kind:'gallery',id:'2'},{kind:'movie',id:'3'}];
      active++;peak=Math.max(peak,active);event({stage:'details'});await new Promise(r=>setTimeout(r,2));active--;if(input.item.id==='3')throw new Error('fixture failure');
    };
    const result=await downloadJob({token:'fixture',directory:path.join(root,'export'),cacheDirectory:path.join(root,'cache'),settings:{concurrency:1},state:{},emit:p=>snapshots.push(p),engine});
    assert.equal(peak,1);assert.equal(result.success,false);assert.equal(result.progress.files.failed,1);assert.equal(result.progress.files.skipped,1);assert.equal(result.progress.files.done,3);
    for(let i=1;i<snapshots.length;i++)assert.ok(snapshots[i].files.done>=snapshots[i-1].files.done);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('cancelled jobs stop scheduling and never report completion',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-cancel-'));const state={};let calls=0;
  try {
    const engine=async(input,_state,event)=>{if(input.action==='list')return [1,2,3].map(id=>({kind:'post',id:String(id)}));calls++;event({stage:'details'});state.isCancelled=true;};
    const result=await downloadJob({directory:path.join(root,'export'),cacheDirectory:path.join(root,'cache'),settings:{concurrency:1},state,emit:()=>{},engine});
    assert.equal(calls,1);assert.equal(result.status,'cancelled');assert.equal(result.progress.files.done,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
