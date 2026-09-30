(function(global){
  const translations = {
    '失敗詳情':'エラー詳細','封面':'カバー画像','影片類型不支援':'未対応の動画形式','影片 ID 格式錯誤':'動画 ID の形式が不正です','缺少影片 ID':'動画 ID がありません','需要 HTTPS':'HTTPS が必要です','找不到影片工具':'動画ツールが見つかりません','影片工具執行失敗':'動画ツールの実行に失敗しました','影片存取受限':'動画へのアクセスが制限されています','網絡錯誤':'ネットワークエラー','連線逾時':'接続がタイムアウトしました','檔案讀寫失敗':'ファイルの読み書きに失敗しました','影片檔案為空':'動画ファイルが空です','下載失敗':'ダウンロード失敗','顯示前 50 項':'先頭 50 件を表示',
    '已載入共用索引':'共通インデックスを読み込みました',
    '正在掃描資料夾，完成後會自動更新內容。':'フォルダーをスキャンしています。完了すると内容が自動的に更新されます。',
    '下載與備份':'ダウンロードとバックアップ','取得清單':'一覧の取得','檢查／取得詳情':'確認・詳細の取得','下載／保存檔案':'ダウンロード・保存','下載工作':'ダウンロード処理','內容瀏覽':'コンテンツ閲覧','本地閱讀器':'ローカルリーダー','設定':'設定','選擇資料夾':'フォルダーを選択','重新整理':'更新','多媒體庫':'メディアライブラリ','投稿':'投稿','全部成員':'すべてのメンバー','全部分類':'すべての種類','全部媒體':'すべてのメディア','圖片':'画像','影片':'動画','上一頁':'前のページ','下一頁':'次のページ','上一個':'前へ','下一個':'次へ','關閉':'閉じる','查看投稿':'投稿を表示','下載並發數':'ダウンロード並列数','下載開始':'ダウンロード開始','暫停':'一時停止','繼續':'再開','停止':'停止','開啟資料夾':'フォルダーを開く','登入':'ログイン','取得 Token':'Token を取得','已登入':'ログイン済み','尚未登入':'未ログイン','儲存':'保存','待命':'待機中','處理中':'処理中','已完成':'完了','失敗':'失敗','已停止':'停止済み','已暫停':'一時停止中','等待中':'待機中','跳過':'スキップ','未能讀取':'読み取れません','離線：顯示先前索引':'オフライン：前回の索引を表示','尚無內容':'コンテンツがありません','下載設定':'ダウンロード設定','登入與下載設定':'ログインとダウンロード設定','登入後按取得 Token，保留原有登入方式。':'ログイン後に Token を取得してください。従来のログイン方法を利用できます。','選擇本機或已掛載 NAS 的 archive 資料夾。':'ローカルまたはマウント済み NAS のアーカイブを選択してください。','每 60 秒自動檢查更新；來源檔案只讀。':'60 秒ごとに更新を確認します。元ファイルは読み取り専用です。','影片同時最多 2 個。':'動画は同時に最大 2 件です。','經理人部落格':'マネージャーブログ','儲存設定':'設定を保存','需要重新登入或重試':'再ログインまたは再試行が必要です','設定已儲存':'設定を保存しました','尚未開始':'未開始','無法讀取資料夾':'フォルダーを読み取れません','正在索引':'索引を作成中','未知日期':'日付不明','部分內容無法讀取':'一部の内容を読み取れません','成員':'メンバー','分類':'種類','瀏覽':'閲覧',
    '抓取投稿':'投稿の取得','NAS 與排程':'NAS とスケジュール','瀏覽內容':'コンテンツを閲覧','手動抓取':'手動取得','下載中':'ダウンロード中','準備中':'準備中','需要處理':'確認が必要','已封存投稿':'保存済み投稿','上次抓取結束':'前回の取得終了','尚無紀錄':'記録なし','尚無傳送紀錄':'転送記録なし','尚未匯入登入資料':'ログイン情報未登録','已匯入登入資料':'ログイン情報登録済み','前往匯入登入資料':'ログイン情報を登録','返回首頁':'ホームに戻る','登出':'ログアウト','歡迎回來。':'おかえりなさい。','登入你的 Takaneko 內容庫。':'Takaneko ライブラリにログインしてください。','管理密碼':'管理パスワード','登入工作區':'ワークスペースにログイン','Fanclub 登入與下載設定':'Fanclub ログインとダウンロード設定','貼上 cookies／登入資料':'cookies・ログイン情報を貼り付け','或選擇 cookies／登入檔案':'またはログインファイルを選択','匯入並驗證登入':'インポートしてログインを確認','匯出登入資料':'ログイン情報をエクスポート','複製匯出指令':'エクスポート用コードをコピー','開啟 Fanclub 官網':'Fanclub 公式サイトを開く','同時下載':'同時に取得：','官方 Gallery 相簿':'公式 Gallery アルバム','官方 Movie 影片':'公式 Movie 動画','自動抓取':'自動取得','已啟用':'有効','已停用':'無効','啟用':'有効にする','自動 NAS 備份排程':'NAS 自動バックアップのスケジュール','自動 NAS 備份':'NAS 自動バックアップ','儲存排程':'スケジュールを保存','儲存 NAS 排程':'NAS スケジュールを保存','等待排程檢查':'スケジュール確認待ち','NAS 備份':'NAS バックアップ','上次 NAS 傳送':'前回の NAS 転送','立即備份到 NAS':'今すぐ NAS にバックアップ','重試 NAS 備份':'NAS バックアップを再試行','已備份至 NAS':'NAS にバックアップ済み','執行紀錄':'実行履歴','篩選':'絞り込み','全部紀錄':'すべての履歴','成員投稿':'メンバーの投稿','媒體類型':'メディアの種類','載入中…':'読み込み中…','前往抓取投稿':'投稿を取得','香港時間':'香港時間','發佈日期：由新到舊':'公開日：新しい順','私人內容庫':'プライベートライブラリ','私人內容封存與下載工作區':'プライベートアーカイブとダウンロード','排隊中':'待機中','備份中':'バックアップ中','待重試':'再試行待ち','等待備份窗口':'バックアップ時間帯待ち','等待續傳':'再開待ち','執行中':'実行中','成功':'成功','部分失敗':'一部失敗','手動':'手動','自動':'自動','耗時':'所要時間','未記錄':'未記録','小時':'時間','分鐘':'分','秒':'秒','每隔':'間隔','第 ':'ページ ',' 頁':'',' 篇':' 件','需重試':'再試行が必要','個檔案':'ファイル','目前：':'現在：','已校驗':'検証済み','待備份／整理':'バックアップ・整理待ち','下次檢查':'次の確認','預定續傳':'再開予定','關閉投稿':'投稿を閉じる','關閉媒體':'メディアを閉じる','工作區':'ワークスペース','依成員瀏覽':'メンバー別に閲覧'
  };
  let language=localStorage.getItem('language') || (navigator.language.toLowerCase().startsWith('ja')?'ja':'zh-Hant');
  const original=new WeakMap();
  const attributes=new WeakMap();
  function t(text) { if(language!=='ja')return text; return String(text).replace(new RegExp(Object.keys(translations).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'),s=>translations[s]); }
  function apply(root=document.body) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()) {
      if(node.parentElement?.closest('script,style,code,pre,[data-content],input,textarea,#translationNotice'))continue;
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
    const codes={MOVIE_TYPE_UNSUPPORTED:'影片類型不支援',VIDEO_ID_INVALID:'影片 ID 格式錯誤',VIDEO_ID_MISSING:'缺少影片 ID',HTTPS_REQUIRED:'需要 HTTPS',MEDIA_TOOL_NOT_FOUND:'找不到影片工具',MEDIA_TOOL_FAILED:'影片工具執行失敗',MEDIA_ACCESS_DENIED:'影片存取受限',NETWORK_ERROR:'網絡錯誤',TIMEOUT:'連線逾時',FILE_IO_ERROR:'檔案讀寫失敗',EMPTY_MEDIA:'影片檔案為空',DOWNLOAD_FAILED:'下載失敗'};
    for(const value of values.slice(0,50)) {
      const row=document.createElement('li'),identity=document.createElement('code'),label=document.createElement('span'),code=document.createElement('code');
      identity.textContent=value.itemId;label.textContent=` · ${stages[value.stage] || '下載工作'} · ${codes[value.code] || '下載失敗'} · `;code.textContent=value.code;
      row.append(identity,label,code);list.append(row);
    }
    details.append(list);if(values.length>50){const note=document.createElement('p');note.textContent='顯示前 50 項';details.append(note);}container.append(details);
  }
  const date=value=>value?new Date(value).toLocaleString(language==='ja'?'ja-JP':'zh-HK',{timeZone:'Asia/Hong_Kong',hour12:false}):t('未知日期');
  global.TakanekoUI={t,apply,init,progress,errors,date,translations};
})(window);
