(function(global){
  const translations = {
    '失敗詳情':'エラー詳細','封面':'カバー画像','影片類型不支援':'未対応の動画形式','影片 ID 格式錯誤':'動画 ID の形式が不正です','缺少影片 ID':'動画 ID がありません','需要 HTTPS':'HTTPS が必要です','找不到影片工具':'動画ツールが見つかりません','影片工具執行失敗':'動画ツールの実行に失敗しました','影片存取受限':'動画へのアクセスが制限されています','網絡錯誤':'ネットワークエラー','連線逾時':'接続がタイムアウトしました','檔案讀寫失敗':'ファイルの読み書きに失敗しました','影片檔案為空':'動画ファイルが空です','下載失敗':'ダウンロード失敗','顯示前 50 項':'先頭 50 件を表示',
    '正在掃描資料夾，完成後會自動更新內容。':'フォルダーをスキャンしています。完了すると内容が自動的に更新されます。',
    '日本時間':'日本時間','投稿發布時間':'投稿の公開日時','下載中':'ダウンロード中','關閉投稿':'投稿を閉じる','關閉媒體':'メディアを閉じる',
    '取得清單':'一覧の取得','檢查／取得詳情':'確認・詳細の取得','下載／保存檔案':'ダウンロード・保存','下載工作':'ダウンロード処理','內容瀏覽':'コンテンツ閲覧','本地閱讀器':'ローカルリーダー','設定':'設定','選擇資料夾':'フォルダーを選択','重新整理':'更新','多媒體庫':'メディアライブラリ','投稿':'投稿','全部成員':'すべてのメンバー','全部分類':'すべての種類','全部媒體':'すべてのメディア','圖片':'画像','影片':'動画','上一頁':'前のページ','下一頁':'次のページ','上一個':'前へ','下一個':'次へ','關閉':'閉じる','查看投稿':'投稿を表示','下載並發數':'ダウンロード並列数','下載開始':'ダウンロード開始','暫停':'一時停止','繼續':'再開','停止':'停止','開啟資料夾':'フォルダーを開く','登入':'ログイン','取得 Token':'Token を取得','清除登入 Cookies':'ログイン Cookie を消去','已登入':'ログイン済み','尚未登入':'未ログイン','儲存':'保存','待命':'待機中','處理中':'処理中','已完成':'完了','失敗':'失敗','已停止':'停止済み','已暫停':'一時停止中','等待中':'待機中','跳過':'スキップ','未能讀取':'読み取れません','尚無內容':'コンテンツがありません','下載設定':'ダウンロード設定','登入與下載設定':'ログインとダウンロード設定','登入後按取得 Token，保留原有登入方式。':'ログイン後に Token を取得してください。従来のログイン方法を利用できます。','已清除登入 Cookies 同已儲存嘅登入資料。請再開登入視窗，重新登入。':'ログイン Cookie と保存済みの認証情報を消去しました。ログイン画面をもう一度開いてログインしてください。','未能清除登入 Cookies，請再試一次。':'ログイン Cookie を消去できませんでした。もう一度お試しください。','每 60 秒自動檢查更新；來源檔案只讀。':'60 秒ごとに更新を確認します。元ファイルは読み取り専用です。','影片同時最多 2 個。':'動画は同時に最大 2 件です。','經理人部落格':'マネージャーブログ','儲存設定':'設定を保存','需要重新登入或重試':'再ログインまたは再試行が必要です','設定已儲存':'設定を保存しました','尚未開始':'未開始','無法讀取資料夾':'フォルダーを読み取れません','正在索引':'索引を作成中','未知日期':'日付不明','部分內容無法讀取或格式不支援':'一部の内容を読み取れないか、形式が未対応です','成員':'メンバー','分類':'種類','瀏覽':'閲覧'
  };
  const english = {
    '失敗詳情':'Error details','封面':'Cover image','影片類型不支援':'Unsupported video format','影片 ID 格式錯誤':'Invalid video ID','缺少影片 ID':'Missing video ID','需要 HTTPS':'HTTPS is required','找不到影片工具':'Video tool not found','影片工具執行失敗':'Video tool failed','影片存取受限':'Video access is restricted','網絡錯誤':'Network error','連線逾時':'Connection timed out','檔案讀寫失敗':'Could not read or write file','影片檔案為空':'Video file is empty','下載失敗':'Download failed','顯示前 50 項':'Showing the first 50 items',
    '正在掃描資料夾，完成後會自動更新內容。':'Scanning the folder. Content will refresh when the scan finishes.',
    '日本時間':'Japan Standard Time','投稿發布時間':'Published','下載中':'Downloading','關閉投稿':'Close post','關閉媒體':'Close media',
    '取得清單':'Get content list','檢查／取得詳情':'Check and fetch details','下載／保存檔案':'Download and save files','下載工作':'Download job','內容瀏覽':'Browse content','多媒體瀏覽':'Browse media','本地閱讀器':'Local reader','設定':'Settings','選擇資料夾':'Choose folder','重新整理':'Refresh','多媒體庫':'Media library','投稿':'Posts','全部成員':'All members','全部分類':'All categories','全部媒體':'All media','圖片':'Images','影片':'Videos','上一頁':'Previous page','下一頁':'Next page','上一個':'Previous','下一個':'Next','關閉':'Close','查看投稿':'View post','下載並發數':'Concurrent downloads','下載開始':'Start download','暫停':'Pause','繼續':'Resume','停止':'Stop','開啟資料夾':'Open folder','登入':'Sign in','取得 Token':'Get token','清除登入 Cookies':'Clear sign-in cookies','已登入':'Signed in','尚未登入':'Signed out','儲存':'Save','待命':'Idle','處理中':'Working…','已完成':'Completed','失敗':'Failed','已停止':'Stopped','已暫停':'Paused','等待中':'Waiting','跳過':'Skipped','未能讀取':'Could not load','尚無內容':'No content yet','下載設定':'Download settings','登入與下載設定':'Sign-in and download settings','登入後按取得 Token，保留原有登入方式。':'Sign in, then click Get token.','已清除登入 Cookies 同已儲存嘅登入資料。請再開登入視窗，重新登入。':'Sign-in cookies and saved credentials cleared. Open the sign-in window and sign in again.','未能清除登入 Cookies，請再試一次。':'Could not clear sign-in cookies. Try again.','每 60 秒自動檢查更新；來源檔案只讀。':'Checks for updates every 60 seconds. Source files are read-only.','影片同時最多 2 個。':'Up to two videos can download at a time.','經理人部落格':'Manager’s blog','儲存設定':'Save settings','需要重新登入或重試':'Sign in again or retry','設定已儲存':'Settings saved','尚未開始':'Not started','無法讀取資料夾':'Could not read folder','正在索引':'Indexing','未知日期':'Unknown date','部分內容無法讀取或格式不支援':'Some content could not be loaded or is in an unsupported format','成員':'Member','分類':'Category','瀏覽':'View',
    '資料夾設定':'Folder settings','下載位置':'Download location','選擇下載位置':'Choose download location','瀏覽來源':'Browse location','選擇瀏覽來源':'Choose browse location',
    '新下載存於此處；原有檔案不會搬移。另存檔案時可再選位置。':'New downloads go here. Existing files stay in place. You can choose another location when saving a copy.',
    '內容瀏覽、多媒體瀏覽及本地閱讀器共用此來源。僅讀取本程式下載或另存的投稿資料夾。':'Browsing, media and the local reader share this folder. Only post folders downloaded or saved by this app are read.',
    '僅瀏覽本程式下載或另存的投稿；可另存原檔。':'Browse posts downloaded or saved by this app. You can save copies of the original files.',
    '另存整篇投稿':'Save a copy of the post','開啟投稿資料夾':'Open post folder','下載原檔':'Save original file','開啟原檔資料夾':'Open file location',
    '請選擇來源資料夾以外的位置':'Choose a location outside the source folder','下載中，請完成或停止後更改位置':'Wait for the download to finish or stop it before changing folders',
    '未能讀取或保存檔案，請確認來源與目的地可用':'Could not read or save files. Check that the source and destination are available.','已另存':'Copy saved','已開啟資料夾':'Folder opened',
    'YouTube 登入資料':'YouTube sign-in data',
    'YouTube 要求登入時，可在這裡匯入你自己的 cookies。Fanclub Token 仍用於 Fanclub 登入。':'If YouTube requires sign-in, import your own cookies here. The Fanclub token is still used to sign in to Fanclub.',
    '如何提取 YouTube cookies':'How to export YouTube cookies',
    '1. Chrome／Edge 安裝 Get cookies.txt LOCALLY 插件，允許它在無痕模式執行。':'1. Install the Get cookies.txt LOCALLY extension in Chrome or Edge and allow it to run in private windows.',
    '2. 開啟無痕視窗，登入你自己的 YouTube 帳戶。':'2. Open a private window and sign in to your YouTube account.',
    '3. 同一分頁開啟 https://www.youtube.com/robots.txt，只保留這個無痕分頁；點插件匯出 youtube.com 的 cookies.txt。':'3. In the same tab, open https://www.youtube.com/robots.txt. Keep only that private tab open, then use the extension to export cookies.txt for youtube.com.',
    '4. 關閉無痕視窗，回到這裡直接選取 cookies.txt。不用 DevTools、API 或 localStorage，也不用複製內容。':'4. Close the private window, return here and choose cookies.txt directly.',
    '5. 按「儲存 YouTube cookies」，再開始影片下載。儲存只確認格式，下載成功才代表可用。':'5. Click Save YouTube cookies, then start a video download to verify access. Saving checks the file format.',
    '官方匯出教學':'Official export guide','擴充功能與格式說明':'Extension and format guide',
    '貼上 YouTube cookies.txt':'Paste YouTube cookies.txt','或選取 cookies.txt':'Or choose cookies.txt',
    '只保留 youtube.com 的 cookies；儲存後清空輸入，不顯示原文。這是登入憑證，請勿貼到聊天、GitHub 或公開文件。':'Only youtube.com cookies are kept. The input is cleared after saving. Keep these credentials out of chats, GitHub and public documents.',
    '儲存 YouTube cookies':'Save YouTube cookies','移除 YouTube cookies':'Remove YouTube cookies',
    'YouTube cookies 尚未設定':'YouTube cookies not configured',
    '已儲存 YouTube cookies；尚未驗證影片存取':'YouTube cookies saved. Video access hasn’t been verified.',
    '請貼上有效、未過期的 youtube.com Netscape cookies.txt。':'Use a valid, unexpired Netscape cookies.txt file for youtube.com.',
    '無法讀取或儲存 YouTube cookies，請稍後重試。':'Could not read or save YouTube cookies. Try again later.'
  };
  const supported = new Set(['zh-Hant', 'en', 'ja']);
  const savedLanguage = localStorage.getItem('language');
  let language = supported.has(savedLanguage)
    ? savedLanguage
    : (navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'zh-Hant');
  const original = new WeakMap();
  const attributes = new WeakMap();
  const dictionaries = { en: english, ja: translations };
  function t(text) {
    const dictionary = dictionaries[language];
    if (!dictionary || !text) return text;
    const pattern = new RegExp(
      Object.keys(dictionary).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),
      'g'
    );
    return String(text).replace(pattern, s => dictionary[s]);
  }
  function apply(root=document.body) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()) {
      if(node.parentElement?.closest('script,style,code,pre,[data-content],[data-language],input,textarea,#translationNotice'))continue;
      const previous=original.get(node), current=node.nodeValue;
      const source=previous && current===previous.rendered?previous.source:current;
      const rendered=t(source);original.set(node,{source,rendered});if(current!==rendered)node.nodeValue=rendered;
    }
    document.documentElement.lang=language;
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(element=>{
      if(element.closest('[data-content]'))return;
      const previous=attributes.get(element)||{};
      for(const key of ['placeholder','aria-label','title']){
        if(!element.hasAttribute(key))continue;
        const current=element.getAttribute(key),old=previous[key];
        const source=old&&current===old.rendered?old.source:current,rendered=t(source);
        previous[key]={source,rendered};if(current!==rendered)element.setAttribute(key,rendered);
      }
      attributes.set(element,previous);
    });
    document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.language===language)));
    const note=document.getElementById('translationNotice');if(note)note.hidden=language!=='ja';
  }
  function init(){
    document.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>{language=b.dataset.language;localStorage.setItem('language',language);apply();global.dispatchEvent(new Event('languagechange'));});
    const observer=new MutationObserver(()=>{observer.disconnect();apply();observer.observe(document.body,{childList:true,subtree:true,characterData:true});});
    apply();observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  function progress(container,value) {
    container.replaceChildren();
    for(const [key,label] of [['list','取得清單'],['details','檢查／取得詳情'],['files','下載／保存檔案']]) {
      const stage=value?.[key] || {done:0,total:null,state:'waiting',failed:0,skipped:0};
      const section=document.createElement('section');section.className='stage';
      const title=document.createElement('div');title.className='progress-meta';
      const name=document.createElement('span');name.textContent=label;
      const count=document.createElement('span');count.textContent=stage.total===null?'—':`${stage.done} / ${stage.total}`;title.append(name,count);
      const bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label',t(label));
      if(stage.total!==null)bar.value=stage.total?Math.min(100,stage.done/stage.total*100):stage.state==='completed'?100:0;
      else if(stage.state!=='running')bar.value=0;
      const meta=document.createElement('small');meta.textContent=(({waiting:'等待中',running:'處理中',completed:'已完成',failed:'失敗',cancelled:'已停止'})[stage.state]||stage.state)+` · 跳過 ${stage.skipped||0} · 失敗 ${stage.failed||0}`;
      section.append(title,bar,meta);container.append(section);
    }
  }
  function errors(container,values=[]) {
    container.replaceChildren();container.hidden=!values.length;if(!values.length)return;
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=`失敗詳情 (${values.length})`;details.append(summary);details.open=true;
    const list=document.createElement('ul');
    const stages={list:'取得清單',details:'檢查／取得詳情',cover:'封面',video:'影片',save:'下載／保存檔案',download:'下載工作'};
    const codes={LOGIN_REQUIRED:'需要重新登入或重試',MOVIE_TYPE_UNSUPPORTED:'影片類型不支援',VIDEO_ID_INVALID:'影片 ID 格式錯誤',VIDEO_ID_MISSING:'缺少影片 ID',HTTPS_REQUIRED:'需要 HTTPS',MEDIA_TOOL_NOT_FOUND:'找不到影片工具',MEDIA_TOOL_FAILED:'影片工具執行失敗',MEDIA_ACCESS_DENIED:'影片存取受限',NETWORK_ERROR:'網絡錯誤',TIMEOUT:'連線逾時',FILE_IO_ERROR:'檔案讀寫失敗',EMPTY_MEDIA:'影片檔案為空',DOWNLOAD_FAILED:'下載失敗'};
    for(const value of values.slice(0,50)) {
      const row=document.createElement('li'),identity=document.createElement('code'),label=document.createElement('span'),code=document.createElement('code');
      identity.textContent=value.itemId;label.textContent=` · ${stages[value.stage] || '下載工作'} · ${codes[value.code] || '下載失敗'} · `;code.textContent=value.code;
      row.append(identity,label,code);list.append(row);
    }
    details.append(list);if(values.length>50){const note=document.createElement('p');note.textContent='顯示前 50 項';details.append(note);}container.append(details);
  }
  function date(value) {
    if(value===null || value===undefined || value==='')return t('未知日期');
    const parsed=new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString('sv-SE',{timeZone:'Asia/Tokyo',hourCycle:'h23'})
      : t('未知日期');
  }
  const publicationTime=value=>language==='en'
    ? `${t('投稿發布時間')} (JST / UTC+9): ${date(value)}`
    : `${t('投稿發布時間')}（JST / UTC+9）：${date(value)}`;
  global.TakanekoUI={t,apply,init,progress,errors,date,publicationTime,translations,english};
})(window);
