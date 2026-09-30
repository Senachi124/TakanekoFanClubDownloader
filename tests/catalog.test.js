const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {ArchiveReader}=require('../server/local-reader');

test('catalog loads without walking archives, opens body on demand and recovers after missing files/offline mounts',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-catalog-'));
  const root=path.join(temp,'mounted'),base=path.join(root,'takaneko/media/members'),folder=path.join(base,'日本語/中文');
  const payload={format:'takaneko-catalog',schema_version:1,total:1,posts:[{resource_key:'post:1',source_id:'1',version:'v1',member:'成員',kind:'post',title:'タイトル',published_at:'2026-09-30T12:00:00+09:00',text:'日本語/中文/index.md',media:[{path:'日本語/中文/image.png',variant:'original'},{path:'日本語/中文/video.mp4',variant:'original'}]}]};
  const write=async()=>{
    const raw=Buffer.from(JSON.stringify(payload));const sha=crypto.createHash('sha256').update(raw).digest('hex');
    await fs.mkdir(path.join(base,'.catalog'),{recursive:true});await fs.writeFile(path.join(base,'.catalog',sha+'.json'),raw);
    await fs.writeFile(path.join(base,'catalog.json'),JSON.stringify({format:'takaneko-catalog-pointer',schema_version:1,catalog:'.catalog/'+sha+'.json',sha256:sha,size:raw.length}));
  };
  const readdir=fs.readdir;
  try {
    await write();
    fs.readdir=async()=>{throw new Error('Archive traversal is forbidden when a catalog exists');};
    const reader=new ArchiveReader(path.join(temp,'cache'));await reader.select(root);
    assert.equal(reader.query().total,1);assert.equal(reader.source,'catalog');
    assert.equal(reader.posts[0].body,undefined);assert.equal(reader.query().rows[0].textFilename,undefined);
    assert.equal((await reader.detail('post:1')).bodyAvailable,false);
    await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'index.md'),'# lazy body');await fs.writeFile(path.join(folder,'video.mp4'),'video');
    const detail=await reader.detail('post:1');assert.equal(detail.body,'# lazy body');assert.equal(detail.media[0].available,false);assert.equal(detail.media[1].available,true);
    assert.equal((await reader.resolve(detail.media[1].id)).stat.size,5);
    const before=await fs.readFile(path.join(base,'catalog.json'));
    await fs.writeFile(path.join(base,'catalog.json'),'{broken');await reader.scan();assert.equal(reader.warnings,1);assert.equal(reader.posts.length,1);
    await fs.writeFile(path.join(base,'catalog.json'),before);
    await fs.rename(root,root+'-offline');await reader.scan();assert.equal(reader.offline,true);assert.equal(reader.posts.length,1);
    await fs.rename(root+'-offline',root);await reader.scan();assert.equal(reader.offline,false);
    payload.posts[0].text='../escape.md';await write();await reader.scan();assert.equal(reader.warnings,1);assert.equal(reader.posts[0].title,'タイトル');
    payload.posts[0].text='C:/private.txt';await write();await reader.scan();assert.equal(reader.warnings,1);
    payload.posts[0].text='日本語/中文/index.md';payload.posts.push({...payload.posts[0]});payload.total=2;await write();await reader.scan();assert.equal(reader.warnings,1);
    payload.posts.pop();payload.total=1;payload.posts[0].title='更新';await write();await reader.scan();assert.equal(reader.query().rows[0].title,'更新');
    const restarted=new ArchiveReader(path.join(temp,'cache'));await restarted.select(base);assert.equal(restarted.query().total,1);
    assert.equal(await fs.readFile(path.join(folder,'index.md'),'utf8'),'# lazy body');
  }finally{fs.readdir=readdir;await fs.rm(temp,{recursive:true,force:true});}
});
