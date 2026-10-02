const fs=require('node:fs/promises'),{constants}=require('node:fs');
const path=require('node:path'),crypto=require('node:crypto');
const {inside}=require('../../server/local-reader');
async function destinationOutsideArchive(reader,destination) {
  const parent=await fs.realpath(path.dirname(destination));
  if(inside(reader.root,parent))throw new Error('SOURCE_READ_ONLY');
  try {if(inside(reader.root,await fs.realpath(destination)))throw new Error('SOURCE_READ_ONLY');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return path.join(parent,path.basename(destination));
}
async function saveMedia(reader,mid,destination) {
  const source=await reader.resolve(mid);
  destination=await destinationOutsideArchive(reader,destination);
  const temporary=path.join(path.dirname(destination),'.takaneko-save-'+crypto.randomBytes(12).toString('hex'));
  try {
    await fs.copyFile(source.file,temporary,constants.COPYFILE_EXCL);
    await fs.rename(temporary,destination);
    return {saved:true};
  } finally {await fs.rm(temporary,{force:true});}
}
async function savePost(reader,key,parent) {
  const {file,post}=await reader.resolvePost(key);
  parent=await fs.realpath(parent);
  if(inside(reader.root,parent))throw new Error('SOURCE_READ_ONLY');
  const files=[file];
  for(const mid of post.media) {
    if(reader.media.get(mid)?.variant==='original')files.push((await reader.resolve(mid)).file);
  }
  // Preserve relative links without recursively copying unknown files or following archive symlinks.
  let common=path.dirname(file);
  while(files.some(f=>!inside(common,f)))common=path.dirname(common);
  const title=String(post.title || 'post').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70) || 'post';
  const suffix=crypto.createHash('sha256').update(key).digest('hex').slice(0,8);
  const destination=path.join(parent,`${title}-${suffix}-${crypto.randomBytes(8).toString('hex')}`);
  // A dedicated incomplete directory is hidden from Reader until every copy succeeds.
  const staging=await fs.mkdtemp(path.join(parent,'.takaneko-save-'));
  try {
    for(const source of new Set(files)) {
      const target=path.join(staging,path.relative(common,source));
      if(target===path.join(staging,'record.json'))throw new Error('INVALID_ARCHIVE');
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target,constants.COPYFILE_EXCL);
    }
    const record={schema_version:2,resource_key:post.key,source_id:post.sourceId,kind:post.kind,title:post.title,member:post.member,published_at:post.date,
      text:path.relative(common,file).split(path.sep).join('/'),media:files.slice(1).map(f=>({path:path.relative(common,f).split(path.sep).join('/'),variant:'original'}))};
    // The export is a new archive; never copy source credentials or unrelated records.
    await fs.writeFile(path.join(staging,'record.json'),JSON.stringify(record,null,2),'utf8');
    await fs.rename(staging,destination);
    return {saved:true};
  } finally {await fs.rm(staging,{recursive:true,force:true});}
}
module.exports={saveMedia,savePost,destinationOutsideArchive};
