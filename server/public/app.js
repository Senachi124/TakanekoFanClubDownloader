const $ = id => document.getElementById(id);
let csrf = '', offset = 0, job = null, lastCount = -1, member = null, requestSerial = 0, mediaItems = [], mediaIndex = 0;
const multimedia = location.pathname === '/library';
const browsing = multimedia || location.pathname === '/browse';
$('downloadsPage').hidden = browsing;
$('browsePage').hidden = !browsing;
$('settingsToggle').hidden = browsing;
$('pageTitle').textContent = multimedia ? '你的多媒體庫。' : browsing ? '你的內容庫。' : '下載與備份。';
$('pageEyebrow').textContent = multimedia ? 'TAKANEKO / MEDIA' : browsing ? 'TAKANEKO / COLLECTION' : 'TAKANEKO / BACKUP';
$(multimedia ? 'libraryLink' : browsing ? 'browseLink' : 'downloadsLink').setAttribute('aria-current', 'page');
$('mediaFilter').hidden = !multimedia;
document.title = multimedia ? '多媒體庫 · Takaneko' : browsing ? '瀏覽內容 · Takaneko' : '下載與備份 · Takaneko';
const initialMember = new URLSearchParams(location.search).get('member');
if (initialMember) member = initialMember;
function displayDate(value) {
  return new Date(value).toLocaleString('zh-HK', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data)
  });
  const result = await response.json();
  if (response.status === 401 && path !== '/api/login') showLogin();
  if (!response.ok) throw new Error(result.error || '操作失敗，請稍後再試。');
  return result;
}
function notice(text) { $('notice').textContent = text; $('notice').hidden = false; }
function showLogin() {
  requestSerial++; lastCount = -1;
  $('detail').close(); $('mediaDetail').close();
  $('posts').replaceChildren(); mediaItems = [];
  $('login').hidden = false; $('workspace').hidden = true; $('logout').hidden = true;
}
async function refresh() {
  const data = await api('/api/status');
  csrf = data.csrf;
  $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  if (!data.hasToken) $('settings').hidden = false;
  $('tokenState').textContent = data.hasToken ? '已匯入登入資料' : '尚未匯入登入資料';
  if (!document.activeElement.closest('#settingsForm')) {
    $('concurrency').value = data.settings.concurrency; $('blogs').checked = data.settings.blogs;
  }
  job = data.job;
  const active = job && ['queued', 'running', 'paused'].includes(job.status);
  $('start').disabled = !!active || !data.hasToken;
  $('pause').disabled = !active; $('cancel').disabled = !active;
  $('pause').textContent = job?.command === 'pause' ? '繼續' : '暫停';
  const labels = { queued:'準備中', running:'下載中', paused:'已暫停', completed:'已完成', failed:'需要處理', cancelled:'已停止' };
  $('jobLabel').textContent = labels[job?.status] || '待命';
  $('jobMessage').textContent = job?.message || (data.hasToken ? '準備好了，隨時可以開始下載。' : '匯入 Fanclub cookies／登入資料，即可開始下載。');
  $('progress').value = job?.total ? job.completed / job.total * 100 : 0;
  $('jobCount').textContent = job ? `${job.completed} / ${job.total} 篇${job.failed ? ` · ${job.failed} 篇需重試` : ''}` : '尚未開始';
  $('postCount').textContent = data.stats.posts;
  $('backedUp').textContent = data.stats.backed_up;
  if (!document.activeElement.closest('#autoForm')) {
    $('autoEnabled').checked = data.settings.auto_enabled;
    $('autoHours').value = data.settings.auto_interval_hours;
  }
  $('autoState').textContent = data.settings.auto_enabled ? '已啟用' : '已停用';
  $('autoMessage').textContent = data.settings.auto_message;
  const next = data.settings.auto_next_at;
  $('autoNext').textContent = data.settings.auto_enabled && next ? `下次檢查：${new Date(next).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })}（香港時間）；排程每 5 分鐘確認一次。` : '手動下載仍可隨時使用。';
  if (data.stats.backup_errors) notice('NAS 備份暫時失敗。本機內容已保留，下一個備份時段會重試。');
  if (browsing && lastCount !== data.stats.posts) { await loadPosts(); lastCount = data.stats.posts; }
}
async function loadPosts() {
  const serial = ++requestSerial;
  $('posts').setAttribute('aria-busy', 'true');
  $('previous').disabled = $('next').disabled = true;
  let data;
  try {
    const params = new URLSearchParams({ offset, type: $('mediaType').value });
    if (member !== null) params.set('member', member);
    data = await api(`${multimedia ? '/api/library' : '/api/posts'}?${params}`);
  } finally { if (serial === requestSerial) $('posts').setAttribute('aria-busy', 'false'); }
  if (serial !== requestSerial) return;
  member = data.member;
  $('memberTabs').replaceChildren(...data.members.map(name => {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'member-tab'; tab.textContent = name;
    tab.setAttribute('aria-pressed', String(name === member));
    tab.addEventListener('click', action(async () => { member = name; offset = 0; await loadPosts(); }));
    return tab;
  }));
  const memberQuery = '?member=' + encodeURIComponent(member);
  $('browseLink').href = '/browse' + memberQuery; $('libraryLink').href = '/library' + memberQuery;
  history.replaceState(null, '', location.pathname + memberQuery);
  $('collectionTitle').textContent = `${member || '成員'} · ${multimedia ? '多媒體庫' : '投稿'}`;
  $('browseCount').textContent = `${data.total.toLocaleString()} ${multimedia ? '個媒體' : '篇投稿'}`;
  $('posts').replaceChildren();
  const items = multimedia ? data.media : data.posts;
  // Preserve an open viewer's page while the background catalog refreshes.
  if (!$('mediaDetail').open) mediaItems = multimedia ? items : [];
  for (const [index, post] of items.entries()) {
    const card = document.createElement('button'); card.className = 'post';
    const video = multimedia && post.mime.startsWith('video/');
    if (post.cover_id) {
      const img = document.createElement('img'); img.src = `/media/${post.cover_id}`; img.loading = 'lazy'; img.alt = post.title; card.append(img);
    } else { const mark = document.createElement('div'); mark.className = 'placeholder'; mark.textContent = video ? '▶' : multimedia ? '▧' : 'T'; card.append(mark); }
    const info = document.createElement('div'); info.className = 'post-info';
    const memberName = document.createElement('small'); memberName.textContent = multimedia ? `${post.member} · ${video ? '影片' : '圖片'}` : post.member;
    const title = document.createElement('h3'); title.textContent = post.title;
    const date = document.createElement('time'); date.dateTime = post.created_at; date.textContent = displayDate(post.created_at);
    info.append(memberName, title, date); card.append(info);
    card.addEventListener('click', action(async () => {
      if (multimedia) { mediaItems = items; openMedia(index); } else await openPost(post.resource_key);
    }));
    $('posts').append(card);
  }
  $('empty').hidden = !!items.length;
  $('previous').disabled = offset === 0; $('next').disabled = !data.hasMore;
  $('page').textContent = `第 ${offset / 48 + 1} / ${Math.max(1, Math.ceil(data.total / 48))} 頁`;
}
async function openPost(key) {
  const post = await api('/api/post?key=' + encodeURIComponent(key));
  $('detailTitle').textContent = post.title; $('detailMember').textContent = `${post.member} · ${displayDate(post.created_at)}`;
  // Render upstream text as text, never executable HTML or untrusted Markdown.
  $('detailBody').textContent = post.body.replace(/!\[image\]\([^\n]*\)/g, '').replace(/<video[^>]*>\s*<\/video>/g, '').trim();
  $('detailMedia').replaceChildren();
  for (const media of post.media.filter(m => m.variant === 'original')) {
    const element = document.createElement(media.mime.startsWith('video/') ? 'video' : 'img');
    element.src = '/media/' + media.media_id;
    if (element.tagName === 'VIDEO') { element.controls = true; element.preload = 'metadata'; }
    else { element.alt = post.title; element.loading = 'lazy'; }
    $('detailMedia').append(element);
  }
  $('detail').showModal();
}
function openMedia(index) {
  mediaIndex = index;
  const media = mediaItems[index];
  $('mediaTitle').textContent = media.title; $('mediaMember').textContent = `${media.member} · ${displayDate(media.created_at)}`;
  const element = document.createElement(media.mime.startsWith('video/') ? 'video' : 'img');
  element.src = '/media/' + media.media_id;
  if (element.tagName === 'VIDEO') { element.controls = true; element.preload = 'metadata'; element.playsInline = true; }
  else element.alt = media.title;
  element.addEventListener('error', () => notice('媒體暫時無法讀取，請稍後重新開啟。'));
  $('mediaViewer').replaceChildren(element);
  $('mediaPrevious').disabled = index === 0; $('mediaNext').disabled = index === mediaItems.length - 1;
  if (!$('mediaDetail').open) $('mediaDetail').showModal();
}
function action(handler) { return async event => { event?.preventDefault(); try { await handler(); } catch (e) { notice(e.message); } }; }
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); $('loginError').textContent = '';
  try { const data = await api('/api/login', { password: $('password').value }); csrf = data.csrf; $('password').value = ''; await refresh(); }
  catch (e) { $('loginError').textContent = e.message; }
});
$('logout').addEventListener('click', action(async () => { await api('/api/logout', {}); showLogin(); }));
$('settingsToggle').addEventListener('click', () => { $('settings').hidden = !$('settings').hidden; });
$('settingsForm').addEventListener('submit', action(async () => {
  await api('/api/settings', { concurrency: Number($('concurrency').value), blogs: $('blogs').checked });
  notice('設定已儲存。'); await refresh();
}));
const exportCode = `(()=>{if(location.hostname!=='takanekofc.com')throw Error('請在 Fanclub 官網執行');const data={cookies:document.cookie.split('; ').filter(Boolean).map(c=>{const i=c.indexOf('=');return {domain:location.hostname,path:'/',name:c.slice(0,i),value:c.slice(i+1)}}),origins:[{origin:location.origin,localStorage:[{name:'refreshToken',value:localStorage.getItem('refreshToken')||sessionStorage.getItem('refreshToken')}].filter(x=>x.value)}]};if(!data.origins[0].localStorage.length)throw Error('請先登入 Fanclub');const u=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='takaneko-login.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)})()`;
$('exportCode').textContent = exportCode;
$('copyExport').addEventListener('click', action(async () => { await navigator.clipboard.writeText(exportCode); notice('匯出指令已複製。請在已登入的 Fanclub 官網 Console 執行。'); }));
$('importForm').addEventListener('submit', action(async () => {
  const file = $('cookiesFile').files[0];
  const pasted = $('cookiesPaste').value.trim();
  if (pasted && file) throw new Error('請選擇貼上內容或上傳檔案其中一種。');
  if ((!pasted && !file) || (file && file.size > 512 * 1024)) throw new Error('請貼上 cookies，或選擇小於 512 KiB 的登入檔案。');
  const content = pasted || await file.text();
  if (new TextEncoder().encode(content).length > 512 * 1024) throw new Error('登入資料不可超過 512 KiB。');
  $('importButton').disabled = true; $('importButton').textContent = '正在驗證…';
  try {
    await api('/api/import-cookies', { content, refreshToken: $('refreshToken').value.trim() });
    $('cookiesFile').value = ''; $('cookiesPaste').value = ''; $('refreshToken').value = '';
    notice('Fanclub 登入驗證成功，現在可以開始下載。自動備份會依排程執行。'); await refresh();
  } finally { $('importButton').disabled = false; $('importButton').textContent = '匯入並驗證登入'; }
}));
$('autoForm').addEventListener('submit', action(async () => {
  await api('/api/automation', { enabled: $('autoEnabled').checked, intervalHours: Number($('autoHours').value) });
  notice('自動備份排程已儲存。'); await refresh();
}));
$('start').addEventListener('click', action(async () => { await api('/api/start', {}); await refresh(); }));
$('pause').addEventListener('click', action(async () => { await api('/api/control', { command: job?.command === 'pause' ? 'run' : 'pause' }); await refresh(); }));
$('cancel').addEventListener('click', action(async () => { await api('/api/control', { command: 'cancel' }); notice('停止安排新下載，進行中的項目完成後結束。'); await refresh(); }));
$('mediaType').addEventListener('change', action(async () => { offset = 0; await loadPosts(); }));
$('previous').addEventListener('click', action(async () => { offset = Math.max(0, offset - 48); await loadPosts(); }));
$('next').addEventListener('click', action(async () => { offset += 48; await loadPosts(); }));
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => { $('detailMedia').replaceChildren(); });
$('closeMedia').addEventListener('click', () => $('mediaDetail').close());
$('mediaDetail').addEventListener('close', () => $('mediaViewer').replaceChildren());
$('mediaPrevious').addEventListener('click', () => openMedia(mediaIndex - 1));
$('mediaNext').addEventListener('click', () => openMedia(mediaIndex + 1));
$('mediaPost').addEventListener('click', action(async () => { const key = mediaItems[mediaIndex].resource_key; $('mediaDetail').close(); await openPost(key); }));
refresh().catch(() => {});
setInterval(() => { if (!$('workspace').hidden) refresh().catch(e => notice(e.message)); }, 4000);
