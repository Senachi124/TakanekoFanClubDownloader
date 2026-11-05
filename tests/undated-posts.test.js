const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {processSinglePost}=require('../src/main/api/exportPosts');
const {handleBackupTopicsBlogs}=require('../src/main/api/exportBlogs');
const {handleBackupGallery}=require('../src/main/api/exportGallery');
const {ArchiveReader,dateFromBody}=require('../src/main/local-reader');
const {savePost}=require('../src/main/archiveActions');

test('blank dates do not consume later body lines or become publication timestamps',()=>{
  for(const body of [
    '# Example\n**Date**: \n2024-01-02 12:00:00',
    '# Example\r\n**Date**:\t\r\n\r\n2024-01-02 12:00:00',
    '# Example\n**Date**:\n\n**Date**: 2024-01-02 12:00:00',
    '# Example\n**Date**: invalid-date\n',
    '# Example without a date'
  ])assert.equal(dateFromBody(body),null);
  assert.equal(dateFromBody('# Example\n**Date**: 2024-01-02 12:00:00\n'),'2024-01-02T03:00:00.000Z');
});

test('undated posts and blogs keep blank dates, distinct media, stable retries and null saved timestamps',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-undated-'));
  const root=path.join(temp,'downloads'),copies=path.join(temp,'saved');
  const previous=global.fetch;
  const cases=[['missing',undefined],['null',null],['invalid','not-a-date']];
  global.fetch=async url=>{
    const value=String(url);
    if(value.includes('getArticleDetail/')) {
      const id=value.split('/').pop();
      const timestamp=cases.find(([name])=>id===`blog-${name}`)[1];
      return Response.json({title:'Same title',body:'<p>Example</p>',displayDate:timestamp,thumbnail:`https://example.test/${id}.jpg`});
    }
    assert.ok(value.startsWith('https://example.test/'));
    return new Response(value);
  };
  try {
    await fs.mkdir(copies);
    const folders=[];
    for(const [name,timestamp] of cases) {
      const data={title:'Same title',message:'<p>Example</p>',notificationReservationId:`post-${name}`,releaseDate:timestamp,image01:`https://example.test/post-${name}.jpg`};
      const folder=await processSinglePost(data,root,true);folders.push(folder);
      assert.equal(await processSinglePost(data,root,true),folder);
      folders.push(await handleBackupTopicsBlogs('fixture',root,{},null,{id:`blog-${name}`}));
    }
    assert.equal(new Set(folders).size,6);
    for(const folder of folders) {
      assert.match(path.basename(folder),/^unknown-date-[a-f0-9]{12}_Same title$/);
      const body=await fs.readFile(path.join(folder,'index.md'),'utf8');
      assert.match(body,/^\*\*Date\*\*: *$/m);assert.equal(dateFromBody(body),null);
      const id=await fs.readFile(path.join(folder,'.post-id'),'utf8');
      const image=(await fs.readdir(folder)).find(name=>name.endsWith('.jpg'));
      assert.equal(await fs.readFile(path.join(folder,image),'utf8'),`https://example.test/${id}.jpg`);
      assert.equal(await fs.readFile(path.join(path.dirname(folder),'pictures',image),'utf8'),`https://example.test/${id}.jpg`);
    }
    await processSinglePost({title:'Dated',notificationReservationId:'dated',publishedAt:'2024-01-02T03:00:00Z'},root,true);
    const reader=new ArchiveReader();await reader.select(root);
    assert.equal(reader.posts.length,7);assert.equal(reader.posts[0].sourceId,'dated');
    for(const post of reader.posts.slice(1)) {
      assert.equal(post.date,null);await savePost(reader,post.key,copies);
    }
    for(const name of await fs.readdir(copies)) {
      const record=JSON.parse(await fs.readFile(path.join(copies,name,'record.json'),'utf8'));
      assert.equal(record.published_at,null);
    }
    const restored=new ArchiveReader();await restored.select(copies);
    assert.equal(restored.posts.length,6);assert.ok(restored.posts.every(post=>post.date===null));
  } finally {global.fetch=previous;await fs.rm(temp,{recursive:true,force:true});}
});

test('gallery exports without source timestamps retain blank dates',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-undated-gallery-'));
  const previous=global.fetch;
  global.fetch=async()=>Response.json({title:'Undated gallery',galleryAlbumItems:[]});
  try {
    const folder=await handleBackupGallery('fixture',root,{},null,{id:'undated-gallery'});
    assert.ok(path.basename(folder).startsWith('unknown-date_'));
    const body=await fs.readFile(path.join(folder,'index.md'),'utf8');
    assert.match(body,/^\*\*Date\*\*: *$/m);assert.equal(dateFromBody(body),null);
    const reader=new ArchiveReader();await reader.select(root);
    assert.equal(reader.posts.length,1);assert.equal(reader.posts[0].date,null);
  } finally {global.fetch=previous;await fs.rm(root,{recursive:true,force:true});}
});
