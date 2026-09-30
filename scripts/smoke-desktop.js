const {app,BrowserWindow,net}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const output=process.env.TAKANEKO_SMOKE_OUTPUT || fs.mkdtempSync(path.join(require('os').tmpdir(),'takaneko-ui-'));fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'userdata'));
const root=path.join(output,'archive'),post=path.join(root,'成員','投稿');fs.mkdirSync(post,{recursive:true});
fs.writeFileSync(path.join(post,'.post-id'),'smoke');fs.writeFileSync(path.join(post,'index.md'),'# Reader 測試\n**Date**: 2024-1-2 12:00:00\nSafe <script>bad()</script>');
fs.writeFileSync(path.join(post,'image.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
fs.writeFileSync(path.join(post,'video.mp4'),'fixture-video-range');
const Store=require('electron-store');new Store().set('readerRoot',root);
const errors=[];app.on('web-contents-created',(_e,w)=>w.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);}));
require('../src/main/main');
app.whenReady().then(async()=>{
  try {
    const window=BrowserWindow.getAllWindows()[0];if(window.webContents.isLoading())await new Promise(r=>window.webContents.once('did-finish-load',r));
    await new Promise(r=>setTimeout(r,500));
    const execute=code=>window.webContents.executeJavaScript(code);
    assert.equal(await execute('typeof require'),'undefined');
    assert.equal((await execute("window.takaneko.invoke('get-app-info')")).version,require('../package.json').version);
    assert.equal(await execute('document.querySelectorAll("#stages progress").length'),3);
    await execute('document.querySelector("[data-language=ja]").click()');await new Promise(r=>setTimeout(r,100));
    assert.equal(await execute('document.documentElement.lang'),'ja');
    assert.equal(await execute('document.getElementById("translationNotice").hidden'),false);
    await execute('document.querySelector("[data-language=zh-Hant]").click()');await new Promise(r=>setTimeout(r,100));
    assert.equal(await execute('document.querySelector("#downloads h1").textContent'),'下載工作');
    fs.writeFileSync(path.join(output,'downloads.png'),(await window.webContents.capturePage()).toPNG());
    await execute('document.querySelector("[data-view=reader]").click()');await new Promise(r=>setTimeout(r,500));
    assert.equal(await execute('document.querySelectorAll("#posts .post").length'),1);
    await execute('document.querySelector("#posts .post").click()');await new Promise(r=>setTimeout(r,200));
    assert.equal(await execute('document.getElementById("detail").open'),true);
    const mediaUrl=await execute('document.querySelector("#detailMedia video").src');
    const response=await net.fetch(mediaUrl,{headers:{Range:'bytes=2-6'}});assert.equal(response.status,206);assert.equal(await response.text(),'xture');
    fs.writeFileSync(path.join(output,'reader.png'),(await window.webContents.capturePage()).toPNG());
    assert.equal(errors.filter(e=>!e.includes('video')).length,0,errors.join('\n'));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks:['preload isolation','three progress bars','language switching','reader indexing','post detail','media Range']}));
    app.exit(0);
  }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.stack,errors}));app.exit(1);}
});
