const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ArchiveReader,safeFile}=require('../src/main/local-reader');
const {processSinglePost}=require('../src/main/api/exportPosts');

async function addPost(root,relative,sourceId) {
  const dir=path.join(root,relative);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'index.md'),'# 中文と日本語\n**Date**: 2024-01-02 12:00:00\n<script>throw new Error()</script>');
  await fs.writeFile(path.join(dir,'image.jpg'),'fixture');
  await fs.writeFile(path.join(dir,'video.mp4'),'fixture-video');
  if(sourceId!==undefined)await fs.writeFile(path.join(dir,'.post-id'),sourceId);
  return dir;
}

test('reader opens current Downloader output, filters media and categories, and leaves source files unchanged',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-reader-'));
  try {
    const exported=await processSinglePost({title:'Exported text',message:'<p>Saved text</p>',notificationReservationId:'exported',createdAt:1700000000000},root,true);
    for(const [folder,kind] of [['成員','post'],['マネージャーブログ','blog'],['GALLERY','gallery'],['MOVIE','movie']])await addPost(root,`${folder}/投稿`,kind);
    await addPost(root,'成員/incomplete');
    await addPost(root,'成員/empty-marker','');
    await addPost(root,'pictures/duplicate','pictures');
    await addPost(root,'.takaneko-save-incomplete/post','temporary');
    const before=await fs.readFile(path.join(exported,'index.md'));
    const reader=new ArchiveReader();await reader.select(root);
    assert.equal(reader.query().total,5);
    assert.equal(reader.query({kind:'gallery'}).total,1);
    assert.equal(reader.query({kind:'blog'}).total,1);
    assert.equal(reader.query({member:'成員'}).total,1);
    assert.equal(reader.query({multimedia:true,type:'video'}).total,4);
    assert.equal(reader.query({multimedia:true,type:'image'}).total,4);
    // Selecting a category folder or a single download preserves its category.
    const single=new ArchiveReader();
    for(const source of [path.join(root,'GALLERY'),path.join(root,'GALLERY','投稿')]) {
      await single.select(source);
      assert.equal(single.query({kind:'gallery',member:'GALLERY'}).total,1);
    }
    const post=reader.posts.find(p=>p.sourceId==='post');
    assert.equal(post.date,'2024-01-02T03:00:00.000Z');
    const detail=await reader.detail(post.key);
    assert.match(detail.body,/<script>/);assert.ok(detail.media.every(m=>m.available));
    assert.equal((await reader.resolve(detail.media[0].id)).stat.size,7);
    await assert.rejects(safeFile(root,path.join(path.dirname(root),'outside.jpg')),/outside/);
    await fs.unlink((await reader.resolve(detail.media[0].id)).file);
    assert.equal((await reader.detail(post.key)).media[0].available,false);
    assert.deepEqual(await fs.readFile(path.join(exported,'index.md')),before);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('reader ignores catalogs and rejects v1 records, nested legacy records and incomplete exports',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-formats-'));
  try {
    await addPost(root,'成員/current','current');
    const legacy=await addPost(root,'legacy');
    await fs.writeFile(path.join(legacy,'record.json'),JSON.stringify({schema_version:1,source_id:'legacy',text:'files/index.md'}));
    await addPost(legacy,'files','nested-legacy');
    const external=await addPost(root,'catalog-only');
    const record={resource_key:'external',source_id:'external',version:'fixture',kind:'post',member:'Example',title:'External',published_at:null,text:'catalog-only/index.md',media:[]};
    await fs.writeFile(path.join(root,'catalog.json'),JSON.stringify({format:'takaneko-catalog',schema_version:1,total:1,posts:[record]}));
    const reader=new ArchiveReader();await reader.select(root);
    assert.deepEqual(reader.posts.map(p=>p.sourceId),['current']);
    assert.equal(reader.summary().warnings,1);
    // A broken or pointer catalog must not affect current exports either.
    for(const catalog of ['{broken',JSON.stringify({format:'takaneko-catalog-pointer',schema_version:1,catalog:'.catalog/example.json'})]) {
      await fs.writeFile(path.join(root,'catalog.json'),catalog);await reader.scan();
      assert.deepEqual(reader.posts.map(p=>p.sourceId),['current']);
    }
    // v2 is supported only in the self-contained shape produced by Save Post.
    for(const invalid of [
      {...record,schema_version:2,text:'files/index.md'},
      {...record,schema_version:2,text:'index.md',media:[{local_path:'image.jpg',variant:'original'}]},
      {...record,schema_version:2,text:'index.md',media:[{path:'../image.jpg',variant:'original'}]},
      {...record,schema_version:2,text:'index.md',media:[{path:'image.jpg',variant:'thumbnail'}]},
      null
    ]) {
      await fs.writeFile(path.join(external,'record.json'),JSON.stringify(invalid));await reader.scan();
      assert.deepEqual(reader.posts.map(p=>p.sourceId),['current']);
      assert.equal(reader.summary().warnings,2);
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('reader drops stale entries when files become invalid or the source disappears',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-refresh-')),root=path.join(temp,'exports');
  try {
    const dir=await addPost(root,'成員/投稿','current');
    const reader=new ArchiveReader();await reader.select(root);assert.equal(reader.query().total,1);
    await fs.writeFile(path.join(dir,'.post-id'),'');await reader.scan();
    assert.equal(reader.query().total,0);assert.equal(reader.summary().warnings,1);
    await fs.writeFile(path.join(dir,'.post-id'),'current');await reader.scan();assert.equal(reader.query().total,1);
    const mid=reader.posts[0].media[0];
    await fs.rename(root,path.join(temp,'moved'));await reader.scan();
    assert.equal(reader.summary().unavailable,true);assert.equal(reader.query().total,0);
    await assert.rejects(reader.resolve(mid),/Unknown media/);
    await fs.rename(path.join(temp,'moved'),root);await reader.scan();
    assert.equal(reader.summary().unavailable,false);assert.equal(reader.query().total,1);
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
