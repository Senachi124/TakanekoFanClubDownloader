const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ArchiveReader}=require('../server/local-reader');
const {saveMedia,savePost}=require('../src/main/archiveActions');

test('archive copies preserve originals, relative media and all three formats; refuse unsafe and incomplete exports',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-copy-'));
  const root=path.join(temp,'archive'),destination=path.join(temp,'copies'),cache=path.join(temp,'cache');
  try {
    await fs.mkdir(destination);await fs.mkdir(root);
    for(const version of [0,1,2]) {
      const dir=path.join(root,`中文と日本語-${version}`),files=version===1?path.join(dir,'files'):dir;
      await fs.mkdir(files,{recursive:true});
      await fs.writeFile(path.join(files,'index.md'),'# 測試\n![image](image.jpg)\n[video](video.mp4)');
      await fs.writeFile(path.join(files,'image.jpg'),Buffer.from([0,1,2,255]));
      await fs.writeFile(path.join(files,'video.mp4'),'video-fixture');
      await fs.writeFile(path.join(files,'private-token.txt'),'must-not-copy');
      if(!version)await fs.writeFile(path.join(dir,'.post-id'),'legacy');
      else await fs.writeFile(path.join(dir,'record.json'),JSON.stringify({schema_version:version,resource_key:`key-${version}`,source_id:`post-${version}`,title:'中文 / 日本語',member:'成員',kind:'post',text:version===1?'files/index.md':'index.md',media:['image.jpg','video.mp4'].map(name=>({[version===1?'local_path':'path']:(version===1?'files/':'')+name,variant:'original'}))}));
    }
    const snapshot=async(dir)=>{const result={};for(const name of await fs.readdir(dir)){const file=path.join(dir,name);result[name]=(await fs.lstat(file)).isDirectory()?await snapshot(file):(await fs.readFile(file)).toString('base64');}return result;};
    const before=await snapshot(root),reader=new ArchiveReader(cache);await reader.select(root);
    for(const post of reader.posts) {
      assert.deepEqual(await savePost(reader,post.key,destination),{saved:true});
      const image=(await reader.detail(post.key)).media.find(m=>m.mime==='image/jpeg');
      const target=path.join(destination,post.sourceId+'.jpg');
      await saveMedia(reader,image.id,target);assert.deepEqual(await fs.readFile(target),Buffer.from([0,1,2,255]));
      await saveMedia(reader,image.id,target); // Confirmed save-as replacement remains byte-identical.
      await assert.rejects(saveMedia(reader,image.id,path.join(root,'overwrite.jpg')),/SOURCE_READ_ONLY/);
    }
    const restored=new ArchiveReader(path.join(temp,'export-index'));await restored.select(destination);
    assert.equal(restored.posts.length,3);assert.equal(restored.query({multimedia:true}).total,6);
    for(const post of restored.posts){const detail=await restored.detail(post.key);assert.match(detail.body,/image.jpg/);assert.ok(detail.media.every(m=>m.available));}
    assert.ok(!JSON.stringify(await snapshot(destination)).includes('private-token'));
    const first=reader.posts[0],mid=first.media[0];
    await assert.rejects(savePost(reader,first.key,root),/SOURCE_READ_ONLY/);
    await assert.rejects(saveMedia(reader,'../../outside',path.join(destination,'escape.jpg')),/Unknown media/);
    // Directory junctions work on Windows without symlink privileges.
    const alias=path.join(temp,'alias');await fs.symlink(root,alias,process.platform==='win32'?'junction':'dir');
    await assert.rejects(saveMedia(reader,mid,path.join(alias,'image.jpg')),/SOURCE_READ_ONLY/);
    await fs.unlink(alias);
    assert.deepEqual(await snapshot(root),before);
    const count=(await fs.readdir(destination)).length;
    await fs.rename(root,root+'-offline');
    await assert.rejects(savePost(reader,first.key,destination));
    assert.equal((await fs.readdir(destination)).length,count);
    await fs.rename(root+'-offline',root);
    const mediaFile=(await reader.resolve(mid)).file;await fs.rename(mediaFile,mediaFile+'.missing');
    await assert.rejects(savePost(reader,first.key,destination));
    assert.equal((await fs.readdir(destination)).length,count);
    assert.ok(!(await fs.readdir(destination)).some(n=>n.startsWith('.takaneko-save-')));
  } finally {assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
