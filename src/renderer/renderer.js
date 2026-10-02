const $=id=>document.getElementById(id), api=window.takaneko.invoke, UI=window.TakanekoUI;
Object.assign(UI.translations,{
  '多媒體瀏覽':'メディア閲覧','資料夾設定':'フォルダー設定','下載位置':'保存先','選擇下載位置':'保存先を選択','瀏覽來源':'閲覧元','選擇瀏覽來源':'閲覧元を選択',
  '新下載存於此處；原有檔案不會搬移。另存檔案時可再選位置。':'新しいダウンロードの保存先です。既存ファイルは移動しません。別名保存時に保存先を変更できます。',
  '內容瀏覽、多媒體瀏覽及本地閱讀器共用此來源。選擇本機或已掛載 NAS 的 archive 資料夾。':'コンテンツ・メディア・ローカルリーダーで共通の閲覧元です。ローカルまたはマウント済み NAS の archive フォルダーを選択します。',
  '瀏覽設定中選定的本機或 NAS archive；可另存原檔。':'設定で選択したローカルまたは NAS の archive を閲覧し、元ファイルを別の場所に保存できます。',
  '另存整篇投稿':'投稿全体を別の場所に保存','開啟投稿資料夾':'投稿フォルダーを開く','下載原檔':'元ファイルを保存','開啟原檔資料夾':'元ファイルのフォルダーを開く',
  '請選擇來源資料夾以外的位置':'閲覧元フォルダーの外を選択してください','下載中，請完成或停止後更改位置':'ダウンロードの完了または停止後に保存先を変更してください',
  '未能讀取或保存檔案，請確認來源與目的地可用':'ファイルを読み取り・保存できません。閲覧元と保存先を確認してください','已另存':'保存しました','已開啟資料夾':'フォルダーを開きました'
});
let view='downloads',offset=0,serial=0,paused=false,running=false,rows=[],mediaIndex=-1,lastProgress=null;
let indexing=0,detailMode='reader',detailKey='',actionRunning=false;
const collectionViews=['browse','media','reader'];
function indexingState(delta){indexing+=delta;const active=indexing>0;$('scanProgress').hidden=!active;$('collection').setAttribute('aria-busy',String(active));$('posts').setAttribute('aria-busy',String(active));$('refresh').disabled=$('choose').disabled=active;}
const readerMode=()=>'reader';
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
function actionMessage(result){return result.error==='SOURCE_READ_ONLY'?'請選擇來源資料夾以外的位置':result.error==='LOCATION_BUSY'?'下載中，請完成或停止後更改位置':result.error?'未能讀取或保存檔案，請確認來源與目的地可用':result.saved?'已另存':result.opened?'已開啟資料夾':'';}
async function archiveAction(action,id,button){
  if(actionRunning)return;
  actionRunning=true;button.disabled=true;$('actionStatus').textContent=UI.t('處理中');
  try{const result=await api('archive-action',detailMode,action,id);$('actionStatus').textContent=UI.t(actionMessage(result));}
  catch{$('actionStatus').textContent=UI.t('未能讀取或保存檔案，請確認來源與目的地可用');}
  finally{actionRunning=false;button.disabled=false;}
}
function mediaCard(item){
  const figure=document.createElement('figure');figure.className='media-item';figure.append(mediaElement(item));
  const actions=document.createElement('div');actions.className='actions';
  for(const [action,label] of [['save-media','下載原檔'],['reveal-media','開啟原檔資料夾']]){
    const button=document.createElement('button');button.className='quiet';button.textContent=UI.t(label);button.disabled=!item.available;button.onclick=()=>archiveAction(action,item.id,button);actions.append(button);
  }
  figure.append(actions);return figure;
}
async function showPost(key){
  const mode=readerMode(),request=serial,post=await api('reader-detail',mode,key);if(!post || request!==serial)return;
  detailMode=mode;detailKey=key;$('actionStatus').textContent='';$('detailTitle').textContent=post.title;
  $('detailBody').textContent=post.bodyAvailable===false?UI.t('未能讀取'):post.body;
  $('detailMedia').replaceChildren(...post.media.map(mediaCard));
  for(const id of ['mediaPrevious','mediaNext','mediaPost'])$(id).hidden=true;
  if(!$('detail').open)$('detail').showModal();
}
function showMedia(index){
  mediaIndex=index;const item=rows[index];detailMode=readerMode();detailKey=item.key;
  $('actionStatus').textContent='';$('detailTitle').textContent=item.title;$('detailBody').textContent='';$('detailMedia').replaceChildren(mediaCard(item));
  for(const id of ['mediaPrevious','mediaNext','mediaPost'])$(id).hidden=false;
  $('mediaPrevious').disabled=index===0;$('mediaNext').disabled=index===rows.length-1;if(!$('detail').open)$('detail').showModal();
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{
  view=button.dataset.view;offset=0;serial++;$('detail').close();notice('');
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));
  $('downloads').hidden=view!=='downloads';$('settings').hidden=view!=='settings';$('collection').hidden=!collectionViews.includes(view);
  $('modeLabel').hidden=view==='browse';$('mode').options[0].hidden=view==='media';$('mode').value=view==='media'?'all':'posts';
  $('collectionHeading').textContent=view==='reader'?'本地閱讀器':view==='media'?'多媒體瀏覽':'內容瀏覽';
  if(collectionViews.includes(view))try{await load(true);}catch{notice('無法讀取資料夾');}
});
async function folderSettings(){const settings=await api('get-folder-settings');$('downloadRoot').textContent=settings.downloadRoot;$('readerRoot').textContent=settings.readerRoot;}
$('chooseDownload').onclick=async()=>{try{const result=await api('download-folder-select');await folderSettings();notice(result.error?actionMessage(result):result.cancelled?'':'設定已儲存');}catch{notice('無法讀取資料夾');}};
$('savePost').onclick=()=>archiveAction('save-post',detailKey,$('savePost'));
$('revealPost').onclick=()=>archiveAction('reveal-post',detailKey,$('revealPost'));
$('login').onclick=()=>api('open-login');$('capture').onclick=async()=>{$('capture').disabled=true;notice('處理中');try{const result=await api('capture-token');notice(result.success?'已登入':'需要重新登入或重試');await loginStatus();}finally{$('capture').disabled=false;}};
$('settingsForm').onsubmit=async event=>{event.preventDefault();await save();notice('設定已儲存');};
$('start').onclick=async()=>{await save();busy(true);paused=false;$('pause').textContent='暫停';notice('處理中');try{const result=await api('start-download');notice(result.status==='completed'?'已完成':result.status==='cancelled'?'已停止':'下載失敗');}finally{busy(false);await loginStatus();}};
$('pause').onclick=async()=>{paused=!paused;await api(paused?'control-pause':'control-resume');$('pause').textContent=paused?'繼續':'暫停';};$('stop').onclick=()=>api('control-cancel');$('folder').onclick=()=>api('open-exported-folder');
$('choose').onclick=async()=>{indexingState(1);try{const result=await api('reader-select');if(result){offset=0;serial++;await folderSettings();notice('設定已儲存');}}catch{notice('無法讀取資料夾');}finally{indexingState(-1);}};$('refresh').onclick=()=>load(true).catch(()=>notice('無法讀取資料夾'));
for(const id of ['member','kind','mode'])$(id).onchange=()=>{offset=0;load();};$('previous').onclick=()=>{offset=Math.max(0,offset-48);load();};$('next').onclick=()=>{offset+=48;load();};
$('close').onclick=()=>$('detail').close();$('detail').onclose=()=>$('detailMedia').replaceChildren();$('mediaPrevious').onclick=()=>showMedia(mediaIndex-1);$('mediaNext').onclick=()=>showMedia(mediaIndex+1);$('mediaPost').onclick=()=>showPost(rows[mediaIndex].key);
window.takaneko.onProgress(p=>{lastProgress=p;UI.progress($('stages'),p);UI.errors($('downloadErrors'),p.errors);});window.addEventListener('languagechange',()=>{UI.progress($('stages'),lastProgress);if(collectionViews.includes(view))load();});
setInterval(()=>{if(collectionViews.includes(view) && !indexing && !$('detail').open)load(true).catch(()=>notice('無法讀取資料夾'));},60000);
(async()=>{UI.init();UI.progress($('stages'));UI.errors($('downloadErrors'),await api('get-download-errors'));document.querySelector('[data-view="downloads"]').setAttribute('aria-selected','true');const info=await api('get-app-info');$('version').textContent=`${info.name} v${info.version}`;$('footerVersion').textContent=`v${info.version}`;const settings=await api('get-download-settings');$('concurrency').value=settings.concurrency;for(const key of ['blogs','gallery','movies']){const legacy=localStorage.getItem('backup'+key[0].toUpperCase()+key.slice(1));$(key).checked=settings.needsMigration && legacy!==null?legacy==='true':settings[key];}if(settings.needsMigration)await save();await folderSettings();await loginStatus();})();

const youtubeSettings=mountYouTubeSettings($('settings'),value=>api('youtube-cookies',value),key=>api('open-youtube-help',key));
youtubeSettings.refresh();
