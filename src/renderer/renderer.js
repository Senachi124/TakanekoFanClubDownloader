const $=id=>document.getElementById(id), api=window.takaneko.invoke, UI=window.TakanekoUI;
let view='downloads',offset=0,serial=0,paused=false,running=false,rows=[],mediaIndex=-1,lastProgress=null;
let indexing=0;
function indexingState(delta){indexing+=delta;const active=indexing>0;$('scanProgress').hidden=!active;$('collection').setAttribute('aria-busy',String(active));$('refresh').disabled=$('choose').disabled=active;}
const readerMode=()=>view==='reader'?'reader':'local';
function notice(text){$('notice').hidden=!text;$('notice').textContent=text;}
async function loginStatus(){const yes=await api('get-login-status');$('loginStatus').textContent=yes?'已登入':'尚未登入';$('start').disabled=running||!yes;}
function busy(active){running=active;$('start').disabled=active;$('pause').disabled=$('stop').disabled=!active;}
async function save(){const value={concurrency:Number($('concurrency').value),blogs:$('blogs').checked,gallery:$('gallery').checked,movies:$('movies').checked};const saved=await api('save-v2-settings',value);$('concurrency').value=saved.concurrency;}
async function load(scan=false){
  const request=++serial,mode=readerMode();indexingState(1);
  try {
  if(scan)await api('reader-scan',mode);
  const result=await api('reader-query',mode,{member:$('member').value,kind:$('kind').value,type:$('mode').value,multimedia:$('mode').value!=='posts',offset});
  if(request!==serial)return;
  rows=result.rows;$('root').textContent=result.root;$('scanStatus').textContent=result.offline?'離線：顯示先前索引':result.warnings?'部分內容無法讀取':result.source==='catalog'?'已載入共用索引':'';
  const selected=$('member').value;$('member').replaceChildren(new Option('全部成員',''),...result.members.map(m=>new Option(m,m)));$('member').value=selected;
  $('posts').replaceChildren();$('empty').hidden=rows.length>0;
  rows.forEach((row,index)=>{
    const card=document.createElement('button');card.className='post';card.setAttribute('data-content','');
    const url=row.cover || (row.mime?.startsWith('image/') && row.available?row.url:null);
    if(url){const img=document.createElement('img');img.src=url;img.loading='lazy';img.alt='';card.append(img);}else{const placeholder=document.createElement('div');placeholder.className='placeholder';placeholder.textContent=row.mime?.startsWith('video/')?'▶':'T';card.append(placeholder);}
    const info=document.createElement('div');info.className='post-info';const title=document.createElement('h3');title.textContent=row.title;const meta=document.createElement('small');meta.textContent=`${row.member} · ${UI.date(row.date)}`;info.append(title,meta);card.append(info);
    card.onclick=()=>row.mime?showMedia(index):showPost(row.key);$('posts').append(card);
  });
  $('previous').disabled=offset===0;$('next').disabled=!result.hasMore;$('count').textContent=`${rows.length?offset+1:0}–${offset+rows.length} / ${result.total}`;
  } catch(error){if(request===serial)$('scanStatus').textContent='無法讀取資料夾';throw error;} finally {indexingState(-1);}
}
function mediaElement(item){if(!item.available){const p=document.createElement('p');p.textContent='未能讀取';return p;}const element=document.createElement(item.mime.startsWith('video/')?'video':'img');element.src=item.url;element.onerror=()=>{const message=document.createElement('p');message.textContent=UI.t('未能讀取');element.onerror=null;if(element.tagName==='VIDEO')element.after(message);else element.replaceWith(message);};if(element.tagName==='VIDEO'){element.controls=true;element.preload='metadata';}else element.alt='';return element;}
async function showPost(key){const post=await api('reader-detail',readerMode(),key);if(!post)return;$('detailTitle').textContent=post.title;$('detailBody').textContent=post.bodyAvailable===false?UI.t('未能讀取'):post.body;$('detailMedia').replaceChildren(...post.media.map(mediaElement));for(const id of ['mediaPrevious','mediaNext','mediaPost'])$(id).hidden=true;if(!$('detail').open)$('detail').showModal();}
function showMedia(index){mediaIndex=index;const item=rows[index];$('detailTitle').textContent=item.title;$('detailBody').textContent='';$('detailMedia').replaceChildren(mediaElement(item));for(const id of ['mediaPrevious','mediaNext','mediaPost'])$(id).hidden=false;$('mediaPrevious').disabled=index===0;$('mediaNext').disabled=index===rows.length-1;if(!$('detail').open)$('detail').showModal();}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{view=button.dataset.view;offset=0;serial++;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));$('downloads').hidden=view!=='downloads';$('settings').hidden=view!=='settings';$('collection').hidden=!['browse','reader'].includes(view);$('choose').hidden=$('readerHelp').hidden=view!=='reader';$('collectionHeading').textContent=view==='reader'?'本地閱讀器':'內容瀏覽';if(['browse','reader'].includes(view))try{await load(true);}catch{notice('無法讀取資料夾');}});
$('login').onclick=()=>api('open-login');$('capture').onclick=async()=>{$('capture').disabled=true;notice('處理中');try{const result=await api('capture-token');notice(result.success?'已登入':'需要重新登入或重試');await loginStatus();}finally{$('capture').disabled=false;}};
$('settingsForm').onsubmit=async event=>{event.preventDefault();await save();notice('設定已儲存');};
$('start').onclick=async()=>{await save();busy(true);paused=false;$('pause').textContent='暫停';notice('處理中');try{const result=await api('start-download');notice(result.status==='completed'?'已完成':result.status==='cancelled'?'已停止':'下載失敗');}finally{busy(false);await loginStatus();}};
$('pause').onclick=async()=>{paused=!paused;await api(paused?'control-pause':'control-resume');$('pause').textContent=paused?'繼續':'暫停';};$('stop').onclick=()=>api('control-cancel');$('folder').onclick=()=>api('open-exported-folder');
$('choose').onclick=async()=>{indexingState(1);try{const result=await api('reader-select');if(result){offset=0;await load();}}catch{notice('無法讀取資料夾');}finally{indexingState(-1);}};$('refresh').onclick=()=>load(true).catch(()=>notice('無法讀取資料夾'));
for(const id of ['member','kind','mode'])$(id).onchange=()=>{offset=0;load();};$('previous').onclick=()=>{offset=Math.max(0,offset-48);load();};$('next').onclick=()=>{offset+=48;load();};
$('close').onclick=()=>$('detail').close();$('detail').onclose=()=>$('detailMedia').replaceChildren();$('mediaPrevious').onclick=()=>showMedia(mediaIndex-1);$('mediaNext').onclick=()=>showMedia(mediaIndex+1);$('mediaPost').onclick=()=>showPost(rows[mediaIndex].key);
window.takaneko.onProgress(p=>{lastProgress=p;UI.progress($('stages'),p);UI.errors($('downloadErrors'),p.errors);});window.addEventListener('languagechange',()=>{UI.progress($('stages'),lastProgress);if(['browse','reader'].includes(view))load();});
setInterval(()=>{if(view==='reader' && !indexing)load(true).catch(()=>notice('無法讀取資料夾'));},60000);
(async()=>{UI.init();UI.progress($('stages'));UI.errors($('downloadErrors'),await api('get-download-errors'));document.querySelector('[data-view="downloads"]').setAttribute('aria-selected','true');const info=await api('get-app-info');$('version').textContent=`${info.name} v${info.version}`;$('footerVersion').textContent=`v${info.version}`;const settings=await api('get-download-settings');$('concurrency').value=settings.concurrency;for(const key of ['blogs','gallery','movies']){const legacy=localStorage.getItem('backup'+key[0].toUpperCase()+key.slice(1));$(key).checked=settings.needsMigration && legacy!==null?legacy==='true':settings[key];}if(settings.needsMigration)await save();await loginStatus();})();

const youtubeSettings=mountYouTubeSettings($('settings'),value=>api('youtube-cookies',value),key=>api('open-youtube-help',key));
youtubeSettings.refresh();
