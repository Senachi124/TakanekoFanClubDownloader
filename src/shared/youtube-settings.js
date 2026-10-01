(function () {
  const strings = {
    'YouTube 登入資料':'YouTube ログイン情報',
    'YouTube 要求登入時，可在這裡匯入你自己的 cookies。Fanclub Token 仍用於 Fanclub 登入。':'YouTube からログインを求められた場合、自分の cookies を登録できます。Fanclub Token は引き続き Fanclub のログインに使用します。',
    '如何提取 YouTube cookies':'YouTube cookies の取得方法',
    '1. Chrome／Edge 安裝 Get cookies.txt LOCALLY 插件，允許它在無痕模式執行。':'1. Chrome／Edge に Get cookies.txt LOCALLY 拡張機能を入れ、シークレットモードでの実行を許可します。',
    '2. 開啟無痕視窗，登入你自己的 YouTube 帳戶。':'2. シークレットウィンドウを開き、自分の YouTube アカウントにログインします。',
    '3. 同一分頁開啟 https://www.youtube.com/robots.txt，只保留這個無痕分頁；點插件匯出 youtube.com 的 cookies.txt。':'3. 同じタブで https://www.youtube.com/robots.txt を開き、このシークレットタブだけを残します。拡張機能から youtube.com の cookies.txt をエクスポートします。',
    '4. 關閉無痕視窗，回到這裡直接選取 cookies.txt。不用 DevTools、API 或 localStorage，也不用複製內容。':'4. シークレットウィンドウを閉じ、ここで cookies.txt を選択します。DevTools・API・localStorage の操作や内容のコピーは不要です。',
    '5. 按「儲存 YouTube cookies」，再開始影片下載。儲存只確認格式，下載成功才代表可用。':'5.「YouTube cookies を保存」を押して動画をダウンロードします。保存時は形式のみ確認し、利用できるかはダウンロードで確認します。',
    '官方匯出教學':'公式エクスポートガイド',
    '擴充功能與格式說明':'拡張機能と形式の説明',
    '貼上 YouTube cookies.txt':'YouTube cookies.txt を貼り付け',
    '或選取 cookies.txt':'または cookies.txt を選択',
    '只保留 youtube.com 的 cookies；儲存後清空輸入，不顯示原文。這是登入憑證，請勿貼到聊天、GitHub 或公開文件。':'youtube.com の cookies のみ保存します。保存後は入力を消去し、原文を表示しません。ログイン情報なので、チャット、GitHub、公開文書に貼り付けないでください。',
    '儲存 YouTube cookies':'YouTube cookies を保存',
    '移除 YouTube cookies':'YouTube cookies を削除',
    'YouTube cookies 尚未設定':'YouTube cookies は未設定です',
    '已儲存 YouTube cookies；尚未驗證影片存取':'YouTube cookies を保存済みです。動画へのアクセスは未確認です',
    '請貼上有效、未過期的 youtube.com Netscape cookies.txt。':'有効期限内の youtube.com の Netscape cookies.txt を貼り付けてください。',
    '無法讀取或儲存 YouTube cookies，請稍後重試。':'YouTube cookies の読み取りまたは保存に失敗しました。後でもう一度お試しください。',
    '登入資料不會在本機版與伺服器之間自動同步，請在需要下載的版本分別設定。':'ログイン情報はローカル版とサーバー間で自動同期されません。ダウンロードする環境ごとに設定してください。'
  };
  Object.assign(TakanekoUI.translations, strings);
  const links = {
    guide:'https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies',
    extensions:'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp'
  };
  window.mountYouTubeSettings = function (container, request, openHelp) {
    const panel = document.createElement('section'); panel.className = 'youtube-settings';
    panel.innerHTML = `<h2>YouTube 登入資料</h2><p class="help">YouTube 要求登入時，可在這裡匯入你自己的 cookies。Fanclub Token 仍用於 Fanclub 登入。</p>
      <details open><summary>如何提取 YouTube cookies</summary><div class="help youtube-guide"></div></details>
      <form autocomplete="off"><label for="youtubeCookiesPaste">貼上 YouTube cookies.txt</label><textarea id="youtubeCookiesPaste" rows="5" autocomplete="off" spellcheck="false" autocapitalize="off" data-content></textarea>
      <label for="youtubeCookiesFile">或選取 cookies.txt</label><input id="youtubeCookiesFile" type="file" accept=".txt,text/plain">
      <p class="help">只保留 youtube.com 的 cookies；儲存後清空輸入，不顯示原文。這是登入憑證，請勿貼到聊天、GitHub 或公開文件。</p>
      <div class="actions"><button type="submit" class="secondary">儲存 YouTube cookies</button><button type="button" class="quiet" data-remove>移除 YouTube cookies</button></div></form>
      <p class="help" role="status" aria-live="polite" data-status></p><p class="error" role="alert" data-error></p><p class="help">登入資料不會在本機版與伺服器之間自動同步，請在需要下載的版本分別設定。</p>`;
    const guide = panel.querySelector('.youtube-guide');
    for (const text of Object.keys(strings).filter(s => /^[1-5]\. /.test(s))) { const p = document.createElement('p'); p.textContent = text; guide.append(p); }
    for (const [key,label] of [['guide','官方匯出教學'],['extensions','擴充功能與格式說明']]) {
      const a = document.createElement('a'); a.textContent = label; a.href = links[key]; a.target='_blank'; a.rel='noopener noreferrer';
      if(openHelp) a.onclick = event => {event.preventDefault();openHelp(key);}; guide.append(a, document.createTextNode(' · '));
    }
    container.append(panel);
    const paste=panel.querySelector('textarea'), file=panel.querySelector('input'), error=panel.querySelector('[data-error]'), state=panel.querySelector('[data-status]');
    function show(value) {state.textContent=value.configured?'已儲存 YouTube cookies；尚未驗證影片存取':'YouTube cookies 尚未設定';}
    function clear() {paste.value='';file.value='';}
    async function refresh() {try {show(await request());} catch {error.textContent='無法讀取或儲存 YouTube cookies，請稍後重試。';}}
    async function change(action) {
      error.textContent='';panel.querySelectorAll('button').forEach(b=>b.disabled=true);
      try {
        const selected=file.files[0];
        if(action==='save' && selected && selected.size>512*1024) throw new Error('YOUTUBE_COOKIES_INVALID');
        const content=action==='save'?(paste.value || (selected?await selected.text():'')):undefined;
        show(await request({action,content}));clear();
      } catch(e) {error.textContent=String(e.message).includes('YOUTUBE_COOKIES_INVALID')?'請貼上有效、未過期的 youtube.com Netscape cookies.txt。':'無法讀取或儲存 YouTube cookies，請稍後重試。';}
      finally {panel.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    file.onchange=()=>{if(file.files.length)paste.value='';};
    paste.oninput=()=>{if(paste.value)file.value='';};
    panel.querySelector('form').onsubmit=event=>{event.preventDefault();change('save');};
    panel.querySelector('[data-remove]').onclick=()=>change('remove');
    return {refresh,clear};
  };
})();
