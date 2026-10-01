const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {handleBackupGallery}=require('../src/main/api/exportGallery');
const {run}=require('../server/bridge');

test('VM listing honors official-media toggles and paginates each source',async()=>{
 const previous=global.fetch,seen=[];
 global.fetch=async(url)=>{
  const u=new URL(url);seen.push(u.pathname);
  if(u.pathname.endsWith('/count'))return Response.json({count:1});
  if(u.pathname==='/auth/notifications')return Response.json([{notificationReservationId:'post'}]);
  if(u.pathname.includes('Gallery'))return Response.json({totalPages:2,galleryAlbumList:[{id:'album-'+u.searchParams.get('page')}]});
  if(u.pathname.includes('Movie'))return Response.json({totalPages:1,movieList:[{id:'movie'}]});
  throw new Error('Unexpected URL');
 };
 try {
  const items=await run({action:'list',token:'Bearer fixture',gallery:true,movies:true});
  assert.deepEqual(items.map(i=>i.kind),['post','gallery','gallery','movie']);
  seen.length=0;assert.equal((await run({action:'list',token:'Bearer fixture',gallery:false,movies:false})).length,1);
  assert.equal(seen.length,2);
 } finally {global.fetch=previous;}
});

test('official gallery uses single Bearer, unique files, completion markers and retry after partial failure',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-gallery-'));
 const previous=global.fetch;let unavailable=true,imageRequests=0;
 global.fetch=async(url,options)=>{
  if(String(url).includes('getGalleryAlbumDetail')) {
   assert.equal(options.headers.Authorization,'Bearer fixture');
   return Response.json({title:'Same/title',displayDate:'2026-09-30T01:00:00Z',galleryAlbumItems:[{file:'https://example.test/one.jpg',displayOrder:1},{file:'https://example.test/two.jpg',displayOrder:1}]});
  }
  imageRequests++;return new Response('image',{status:unavailable&&String(url).includes('two')?503:200});
 };
 try {
  const item={id:'album-1'};
  await assert.rejects(handleBackupGallery('Bearer fixture',root,{},null,item),/media downloads failed/);
  const folder=path.join(root,'GALLERY',(await fs.readdir(path.join(root,'GALLERY')))[0]);
  await assert.rejects(fs.access(path.join(folder,'.post-id')),{code:'ENOENT'});
  unavailable=false;await handleBackupGallery('fixture',root,{},null,item);
  assert.equal(await fs.readFile(path.join(folder,'.post-id'),'utf8'),'album-1');
  assert.equal((await fs.readdir(folder)).filter(n=>n.endsWith('.jpg')).length,2);
  assert.match(await fs.readFile(path.join(folder,'index.md'),'utf8'),/\*\*Date\*\*: 2026-09-30 10:00:00/);
  const completedRequests=imageRequests;await handleBackupGallery('fixture',root,{},null,item);assert.equal(imageRequests,completedRequests);
  const result=await run({action:'download',token:'fixture',item:{id:'album-2',kind:'gallery'},directory:root});
  assert.equal(result.member,'GALLERY');assert.notEqual(result.folder,folder);
 } finally {global.fetch=previous;await fs.rm(root,{recursive:true,force:true});}
});

test('movie uses bundled executable without shell, shared slot and only completes after a valid video',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-movie-'));
 const previous=global.fetch;let videoId='12345',calls=[],slots=0;
 global.fetch=async()=>Response.json({title:'movie',createdAt:1700000000000,videoId});
 const filename=path.resolve(__dirname,'../src/main/api/exportMovies.js'),localRequire=createRequire(filename),module={exports:{}};
 const spawn=(command,args,options)=>{
  calls.push({command,args,options});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  fs.writeFile(args[args.indexOf('-o')+1],'video').then(()=>child.emit('close',0));return child;
 };
 vm.runInNewContext(await fs.readFile(filename,'utf8'),{module,console,process,setTimeout,URL,require:name=>name==='child_process'?{spawn}:name==='../utils/mediaTools'?{getYtDlpConfig:()=>({command:'bundled-yt-dlp',ffmpegLocation:'bundled-tools'})}:name==='../utils/videoQueue'?{withVideoSlot:async fn=>{slots++;return fn();}}:localRequire(name)});
 try {
  await module.exports.handleBackupMovies('fixture',root,{},null,{id:'movie-1'});
  assert.equal(calls[0].command,'bundled-yt-dlp');assert.equal(calls[0].options.shell,false);assert.equal(slots,1);
  assert(calls[0].args.includes('--remux-video'));assert(calls[0].args.includes('bundled-tools'));
  const folder=path.join(root,'MOVIE',(await fs.readdir(path.join(root,'MOVIE')))[0]);
  assert.equal(await fs.readFile(path.join(folder,'.post-id'),'utf8'),'movie-1');
  videoId='';await assert.rejects(module.exports.handleBackupMovies('fixture',root,{},null,{id:'movie-2'}),/Missing video ID/);
  assert.equal(calls.length,1);
 } finally {global.fetch=previous;await fs.rm(root,{recursive:true,force:true});}
});

test('movies route YouTube/Vimeo, upgrade only known image hosts and preserve safe stage diagnostics',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'takaneko-movie-routing-'));
 const previous=global.fetch,requests=[],calls=[];
 let detail={movieType:'youtube',videoId:'AbC_dE-1234',thumbnail:'http://img.youtube.com/vi/AbC_dE-1234/maxresdefault.jpg',title:'fixture',createdAt:1700000000000};
 let coverStatus=200,toolExit=0;
 global.fetch=async url=>{
  requests.push(String(url));
  if(String(url).includes('getMovieDetail'))return Response.json(detail);
  assert.ok(String(url).startsWith('https:'));return new Response('image',{status:coverStatus});
 };
 const filename=path.resolve(__dirname,'../src/main/api/exportMovies.js'),localRequire=createRequire(filename),module={exports:{}};
 const spawn=(command,args,options)=>{
  calls.push({command,args,options});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  setTimeout(async()=>{child.stderr.emit('data','private video https://signed.example/?token=SECRET');if(!toolExit)await fs.writeFile(args[args.indexOf('-o')+1],'video');child.emit('close',toolExit);},0);return child;
 };
 vm.runInNewContext(await fs.readFile(filename,'utf8'),{module,console,process,setTimeout,URL,require:name=>name==='child_process'?{spawn}:name==='../utils/mediaTools'?{getYtDlpConfig:()=>({command:'fixture-yt-dlp'})}:localRequire(name)});
 const {handleBackupMovies,movieSource,movieThumbnail}=module.exports;
 const oldCookies=process.env.TAKANEKO_YOUTUBE_COOKIES;
 process.env.TAKANEKO_YOUTUBE_COOKIES=path.join(root,'private-cookies.txt');
 await fs.writeFile(process.env.TAKANEKO_YOUTUBE_COOKIES,'.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsynthetic-secret');
 try {
  const output=await handleBackupMovies('fixture',root,{},null,{id:'youtube-1'});
  assert.equal(calls[0].args.at(-1),'https://www.youtube.com/watch?v=AbC_dE-1234');assert.equal(calls[0].options.shell,false);
  assert.equal(calls[0].args[0],'--cookies');assert.ok(!calls[0].args.includes('synthetic-secret'));
  assert.notEqual(calls[0].args[1],process.env.TAKANEKO_YOUTUBE_COOKIES);
  await assert.rejects(fs.access(calls[0].args[1]),{code:'ENOENT'});
  assert.ok(requests.includes('https://img.youtube.com/vi/AbC_dE-1234/maxresdefault.jpg'));
  assert.match(await fs.readFile(path.join(output,'index.md'),'utf8'),/\*\*YouTube ID\*\*/);
  assert.equal(movieSource({movieType:'vimeo',videoId:'12345/abcdef'}).url,'https://player.vimeo.com/video/12345?h=abcdef');
  assert.equal(movieSource({videoId:'12345'}).url,'https://player.vimeo.com/video/12345');
  assert.equal(movieThumbnail('http://i.ytimg.com/vi/fixture/default.jpg'),'https://i.ytimg.com/vi/fixture/default.jpg');
  for(const url of ['http://other.example/image.jpg','http://img.youtube.com.evil.test/image.jpg','http://user:secret@img.youtube.com/image.jpg','http://img.youtube.com:81/image.jpg'])assert.throws(()=>movieThumbnail(url),{code:'HTTPS_REQUIRED'});
  assert.throws(()=>movieSource({movieType:'unknown',videoId:'12345'}),{code:'MOVIE_TYPE_UNSUPPORTED'});
  assert.throws(()=>movieSource({movieType:'youtube',videoId:'invalid;command'}),{code:'VIDEO_ID_INVALID'});
  coverStatus=503;toolExit=1;
  await assert.rejects(handleBackupMovies('fixture',root,{},null,{id:'youtube-failed'}),error=>{
   assert.equal(error.diagnostics.length,2);
   assert.equal(error.diagnostics[0].stage,'cover');assert.equal(error.diagnostics[0].code,'HTTP_503');
   assert.equal(error.diagnostics[1].stage,'video');assert.equal(error.diagnostics[1].code,'MEDIA_ACCESS_DENIED');
   const result=require('../server/bridge').failureResult(error,{requestId:'r',item:{id:'youtube-failed',kind:'movie'}});
   assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('signed.example'));return true;
  });
  const folders=await fs.readdir(path.join(root,'MOVIE'));const failedFolder=folders.find(f=>path.join(root,'MOVIE',f)!==output);
  await assert.rejects(fs.access(path.join(root,'MOVIE',failedFolder,'.post-id')),{code:'ENOENT'});
 }finally{if(oldCookies===undefined)delete process.env.TAKANEKO_YOUTUBE_COOKIES;else process.env.TAKANEKO_YOUTUBE_COOKIES=oldCookies;global.fetch=previous;await fs.rm(root,{recursive:true,force:true});}
});
