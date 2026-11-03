const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cookies=require('../src/main/utils/youtubeCookies');
const row=(domain='.youtube.com',expiry='0',value='fixture-secret')=>`${domain}\tTRUE\t/\tTRUE\t${expiry}\tSID\t${value}`;
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'takaneko-cookie-test-')),file=path.join(root,'youtube-cookies.txt');
  try {
    const text=cookies.normalize('# Netscape HTTP Cookie File\r\n#HttpOnly_'+row()+'\r\n'+row('.unrelated.example')+'\r\n'+row('.youtube.com','1'));
    assert.equal(text.split('\n').length,3);assert.ok(!text.includes('unrelated'));assert.ok(text.includes('fixture-secret'));
    for(const value of ['', 'SID=fixture-secret',row('youtube.com.evil.example'),row('.youtube.com','1'),row('.youtube.com','0','bad\nInjected'),row().replace('\tSID\t','\tBad Name\t'),'x'.repeat(524289)]) assert.throws(()=>cookies.normalize(value),/YOUTUBE_COOKIES_INVALID/);
    assert.deepEqual(cookies.save(row(),file),{configured:true});
    assert.throws(()=>cookies.save('bad',file));assert.equal(fs.readFileSync(file,'utf8'),text);
    const snapshots=[];
    await Promise.all([1,2].map(()=>cookies.withSnapshot({type:'youtube'},async args=>{
      assert.equal(args[0],'--cookies');snapshots.push(args[1]);assert.notEqual(args[1],file);
      assert.equal(fs.readFileSync(args[1],'utf8'),text);
      if(process.platform!=='win32')assert.equal(fs.statSync(args[1]).mode&0o777,0o600);
      fs.writeFileSync(args[1],'tool refreshed jar');await new Promise(r=>setTimeout(r,10));
    },file)));
    assert.notEqual(snapshots[0],snapshots[1]);for(const p of snapshots)assert.ok(!fs.existsSync(p));
    assert.equal(fs.readFileSync(file,'utf8'),text);
    let failedPath;await assert.rejects(cookies.withSnapshot({type:'youtube'},async args=>{failedPath=args[1];throw Error('failed');},file));assert.ok(!fs.existsSync(failedPath));
    await cookies.withSnapshot({type:'vimeo'},async args=>assert.deepEqual(args,[]),file);
    assert.deepEqual(cookies.remove(file),{configured:false});
    await cookies.withSnapshot({type:'youtube'},async args=>assert.deepEqual(args,[]),file);
    console.log('YouTube cookie validation, scope, atomic storage and concurrent snapshot isolation passed');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
