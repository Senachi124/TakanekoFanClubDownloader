const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ArchiveReader,safeFile}=require('../server/local-reader');
test('reader indexes legacy, VM v1 and NAS v2 without modifying archives; retains offline index',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-reader-'));
  const root=path.join(temp,'archive'),cache=path.join(temp,'cache');
  const add=async(relative,record)=>{
    const dir=path.join(root,relative);await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'index.md'),'# 中文と日本語\n**Date**: 2024-01-02 12:00:00\n<script>throw new Error()</script>');
    await fs.writeFile(path.join(dir,'image.jpg'),'fixture');
    await fs.writeFile(path.join(dir,'video.mp4'),'fixture-video');
    if(record)await fs.writeFile(path.join(dir,'record.json'),JSON.stringify(record));else await fs.writeFile(path.join(dir,'.post-id'),'legacy');
    return dir;
  };
  try {
    await add('日本語/文章',null);
    const common={source_id:'vm',resource_key:'vm',kind:'post',member:'成員',title:'VM',published_at:'2024-01-01T12:00:00+09:00'};
    await add('complete/members/成員/posts/vm',{...common,schema_version:1,media:[{local_path:'image.jpg',variant:'original'},{local_path:'missing.mp4',variant:'original'},{local_path:'../../../../../../outside.jpg',variant:'original'}]});
    await add('media/members/成員/gallery/nas',{...common,resource_key:'nas',source_id:'nas',schema_version:2,media:[{path:'image.jpg',variant:'original'},{path:'video.mp4',variant:'original'}]});
    await add('staging/incomplete',null);
    const reader=new ArchiveReader(cache);await reader.select(root);
    assert.equal(reader.posts.length,3);assert.equal(reader.query({multimedia:true,type:'video'}).total,3);
    assert.equal(reader.detail('vm').media.length,2);assert.equal(reader.detail('vm').media[1].available,false);
    assert.equal(reader.query().rows[0].title,'中文と日本語');
    const before=await fs.readFile(path.join(root,'日本語/文章/index.md'));
    const mid=reader.detail('nas').media[0].id;assert.equal((await reader.resolve(mid)).stat.size,7);
    await assert.rejects(safeFile(root,path.join(temp,'outside.jpg')),/outside/);
    await fs.rename(root,root+'-offline');await reader.scan();assert.equal(reader.offline,true);assert.equal(reader.posts.length,3);assert.equal(reader.detail('nas').media[0].available,false);
    await fs.rename(root+'-offline',root);await reader.scan();assert.equal(reader.offline,false);
    assert.deepEqual(await fs.readFile(path.join(root,'日本語/文章/index.md')),before);
    const restored=new ArchiveReader(cache);await restored.select(root);assert.equal(restored.posts.length,3);
  } finally {assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
