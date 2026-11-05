const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {ArchiveReader}=require('../src/main/local-reader');
const {savePost}=require('../src/main/archiveActions');
const {processSinglePost}=require('../src/main/api/exportPosts');

async function loadUI(language) {
  const context={window:{},localStorage:{getItem:()=>language},navigator:{language}};
  vm.runInNewContext(await fs.readFile(path.join(__dirname,'../src/shared/ui.js'),'utf8'),context);
  return context.window.TakanekoUI;
}

test('publication timestamps use labeled JST in both languages regardless of the host timezone',async()=>{
  const previous=process.env.TZ;
  try {
    for(const timezone of ['UTC','America/Los_Angeles','Asia/Hong_Kong']) {
      process.env.TZ=timezone;
      for(const [language,label] of [['zh-Hant','投稿發布時間'],['ja','投稿の公開日時']]) {
        const ui=await loadUI(language);
        assert.equal(ui.publicationTime('2024-01-01T15:00:00.000Z'),`${label}（JST / UTC+9）：2024-01-02 00:00:00`);
        assert.equal(ui.date('2024-07-01T15:30:45.000Z'),'2024-07-02 00:30:45');
        assert.equal(ui.date('2024-01-02T12:00:00+09:00'),'2024-01-02 12:00:00');
        assert.equal(ui.date(0),'1970-01-01 09:00:00');
        for(const missing of [null,undefined,'','invalid-date']) {
          assert.equal(ui.publicationTime(missing),`${label}（JST / UTC+9）：${language==='ja'?'日付不明':'未知日期'}`);
        }
      }
    }
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('downloaded and saved posts display the same publication instant in JST without rewriting source metadata',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-time-'));
  try {
    const root=path.join(temp,'downloads'),copies=path.join(temp,'saved');await fs.mkdir(copies);
    const published='2024-01-01T15:30:45.000Z';
    const folder=await processSinglePost({title:'Publication fixture',message:'<p>Example</p>',notificationReservationId:'time-example',publishedAt:published},root,true);
    const before=await fs.readFile(path.join(folder,'index.md'),'utf8');
    const reader=new ArchiveReader();await reader.select(root);
    assert.equal(reader.posts.length,1);assert.equal(reader.posts[0].date,published);
    await savePost(reader,reader.posts[0].key,copies);
    const savedFolder=(await fs.readdir(copies))[0];
    const record=JSON.parse(await fs.readFile(path.join(copies,savedFolder,'record.json'),'utf8'));
    assert.equal(record.published_at,published);
    const saved=new ArchiveReader();await saved.select(copies);
    const ui=await loadUI('zh-Hant');
    for(const post of [reader.posts[0],saved.posts[0]])assert.equal(ui.publicationTime(post.date),'投稿發布時間（JST / UTC+9）：2024-01-02 00:30:45');
    assert.equal(await fs.readFile(path.join(folder,'index.md'),'utf8'),before);
    assert.equal(await fs.readFile(path.join(copies,savedFolder,'index.md'),'utf8'),before);
    assert.ok(!Object.hasOwn(record,'downloaded_at'));assert.ok(!Object.hasOwn(record,'saved_at'));
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
