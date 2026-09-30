const $ = id => document.getElementById(id);
let csrf = '', offset = 0, job = null, lastCount = -1, member = null, requestSerial = 0, mediaItems = [], mediaIndex = 0;
const multimedia = location.pathname === '/library';
const browsing = multimedia || location.pathname === '/browse';
const backingUp = location.pathname === '/backup';
let activityOffset = 0, activitySerial = 0;
$('downloadsPage').hidden = browsing || backingUp;
$('backupPage').hidden = !backingUp;
$('browsePage').hidden = !browsing;
$('settingsToggle').hidden = !backingUp;
$('pageTitle').textContent = multimedia ? '你的多媒體庫。' : browsing ? '你的內容庫。' : backingUp ? 'NAS 與排程。' : '抓取投稿。';
$('pageEyebrow').textContent = multimedia ? 'TAKANEKO / MEDIA' : browsing ? 'TAKANEKO / COLLECTION' : backingUp ? 'TAKANEKO / BACKUP' : 'TAKANEKO / DOWNLOAD';
$(multimedia ? 'libraryLink' : browsing ? 'browseLink' : backingUp ? 'backupLink' : 'downloadsLink').setAttribute('aria-current', 'page');
$('mediaFilter').hidden = !multimedia;
document.title = multimedia ? '多媒體庫 · Takaneko' : browsing ? '瀏覽內容 · Takaneko' : backingUp ? 'NAS 與排程 · Takaneko' : '抓取投稿 · Takaneko';
const initialMember = new URLSearchParams(location.search).get('member');
if (initialMember) member = initialMember;
function displayDate(value) {
  return new Date(value).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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
  requestSerial++; activitySerial++; lastCount = -1;
  $('activityList').replaceChildren();
  $('detail').close(); $('mediaDetail').close();
  $('posts').replaceChildren(); mediaItems = [];
  $('login').hidden = false; $('workspace').hidden = true; $('logout').hidden = true;
}
async function refresh() {
  const data = await api('/api/status');
  csrf = data.csrf;
  $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  if (backingUp && !data.hasToken) $('settings').hidden = false;
  $('loginSettingsLink').hidden = data.hasToken;
  $('tokenState').textContent = data.hasToken ? '已匯入登入資料' : '尚未匯入登入資料';
  if (!document.activeElement.closest('#settingsForm')) {
    $('concurrency').value = data.settings.concurrency; $('blogs').checked = data.settings.blogs;
    $('gallery').checked = data.settings.gallery; $('movies').checked = data.settings.movies;
  }
  job = data.job;
  const active = job && ['queued', 'running', 'paused'].includes(job.status);
  $('start').disabled = !!active || !data.hasToken;
  $('pause').disabled = !active; $('cancel').disabled = !active;
  $('pause').hidden = $('cancel').hidden = !active;
  $('pause').textContent = job?.command === 'pause' ? '繼續' : '暫停';
  const labels = { queued:'準備中', running:'下載中', paused:'已暫停', completed:'已完成', failed:'需要處理', cancelled:'已停止' };
  $('jobLabel').textContent = labels[job?.status] || '待命';
  $('jobMessage').textContent = job?.message || (data.hasToken ? '準備好了，隨時可以開始下載。' : '匯入 Fanclub cookies／登入資料，即可開始下載。');
  $('progress').value = job?.total ? job.completed / job.total * 100 : 0;
  $('fetchPercent').textContent = `${Math.floor($('progress').value)}%`;
  $('jobCount').textContent = job ? `${job.completed} / ${job.total} 篇${job.failed ? ` · ${job.failed} 篇需重試` : ''}` : '尚未開始';
  $('postCount').textContent = data.stats.posts;
  $('lastFetch').textContent = data.lastFetch ? `${displayDate(data.lastFetch.updated_at)} · ${statusLabel(data.lastFetch)}` : '尚無紀錄';
  $('backedUp').textContent = data.stats.backed_up;
  if (!document.activeElement.closest('#autoForm')) {
    $('autoEnabled').checked = data.settings.auto_enabled;
    $('autoHours').value = data.settings.auto_interval_hours;
  }
  $('autoState').textContent = data.settings.auto_enabled ? '已啟用' : '已停用';
  $('autoMessage').textContent = data.settings.auto_message;
  const next = data.settings.auto_next_at;
  $('autoNext').textContent = data.settings.auto_enabled && next ? `下次檢查：${displayDate(next)}（香港時間）；排程每 5 分鐘確認一次。` : '手動下載仍可隨時使用。';
  if (!document.activeElement.closest('#nasForm')) {
    $('nasEnabled').checked = data.settings.nas_enabled;
    $('nasMinutes').value = data.settings.nas_interval_minutes;
  }
  $('nasScheduleState').textContent = data.settings.nas_enabled ? '已啟用' : '已停用';
  $('nasNext').textContent = !data.settings.nas_enabled ? '自動備份已停用，手動備份仍可使用。' : data.settings.nas_next_at ? `下次檢查最早於：${displayDate(data.settings.nas_next_at)}；如已過期則於下一個備份窗口檢查。` : '下一個備份窗口開始檢查。';
  $('lastBackup').textContent = data.lastBackup ? `${displayDate(data.lastBackup.finished_at || data.lastBackup.updated_at)} · ${statusLabel(data.lastBackup)}` : '尚無傳送紀錄';
  $('lastBackupDuration').textContent = `耗時：${data.lastBackup ? duration(data.lastBackup) : '尚無紀錄'}`;
  const backup = data.backup;
  const backupActive = backup && ['queued','running'].includes(backup.status);
  $('backupStart').disabled = data.manualBackupBusy;
  $('backupStart').textContent = data.manualBackupBusy ? '手動備份已排隊／進行中…' : backup?.status === 'failed' ? '重試 NAS 備份 ↑' : '立即備份到 NAS ↑';
  $('backupState').textContent = {queued:'排隊中',running:'備份中',completed:'已完成',failed:'待重試',waiting:'等待備份窗口'}[backup?.status] || '待命';
  $('backupMessage').textContent = backup?.message || '可手動備份，或等待香港時間 03:00–09:00 的排程。';
  $('backupNext').textContent = backup?.status === 'waiting' ? `預定續傳：${displayDate(backup.next_run_at)}（香港時間 UTC+08:00）；手動備份可隨時執行。` : backup ? (backup.trigger === 'manual' ? '手動備份：不限時段' : '自動備份：09:00 截止，未完成工作保留續傳') : '';
  const percent = backup?.total ? Math.min(100,backup.completed / backup.total * 100) : backup?.status === 'completed' ? 100 : 0;
  $('backupProgress').value = percent;
  $('backupPercent').textContent = `${Math.floor(percent)}%`;
  $('backupCount').textContent = `${backup?.completed || 0} / ${backup?.total || 0} 篇${backup?.failed ? ` · ${backup.failed} 篇需重試` : ''}`;
  $('backupFiles').textContent = `已校驗 ${(backup?.files_done || 0).toLocaleString()} 個檔案 · ${((backup?.bytes_done || 0) / 1024 / 1024).toFixed(1)} MiB`;
  $('backupItem').textContent = backupActive && backup.current_item ? `目前：${backup.current_item}` : '';
  $('backupPending').textContent = `${data.backupPending.toLocaleString()} 篇待備份／整理`;
  $('backupWarning').hidden = !data.stats.backup_errors;
  if (browsing && lastCount !== data.stats.posts) { await loadPosts(); lastCount = data.stats.posts; }
  if (backingUp) await loadActivity();
}
function statusLabel(item) {
  if (item.status === 'completed' && item.failed) return '部分失敗';
  return {queued:'排隊中',running:'執行中',paused:'已暫停',completed:'成功',failed:'失敗',cancelled:'已停止',waiting:'等待續傳'}[item.status] || item.status;
}
function duration(item) {
  if (!item.duration_known) return '未記錄';
  const seconds = Math.floor(item.elapsed_seconds || 0);
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)} 小時 ${Math.floor(seconds % 3600 / 60)} 分 ${seconds % 60} 秒` : seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}
async function loadActivity() {
  const serial = ++activitySerial;
  const data = await api(`/api/activity?kind=${$('activityKind').value}&offset=${activityOffset}`);
  if (serial !== activitySerial) return;
  const rows = data.items.map(item => {
    const row = document.createElement('article'); row.className = 'activity-row';
    const title = document.createElement('strong'); title.textContent = `${item.kind === 'nas' ? 'NAS 備份' : '抓取投稿'} · ${statusLabel(item)}`;
    const meta = document.createElement('small'); meta.textContent = `${displayDate(item.created_at)} · ${item.trigger === 'manual' ? '手動' : '自動'} · ${item.completed} / ${item.total} 篇${item.failed ? ` · ${item.failed} 篇失敗` : ''}${item.kind === 'nas' ? ` · 耗時 ${duration(item)}` : ''}`;
    const message = document.createElement('p'); message.textContent = item.message || '—';
    row.append(title, meta, message); return row;
  });
  if (!rows.length) { const empty = document.createElement('p'); empty.className = 'help'; empty.textContent = '尚無執行紀錄'; rows.push(empty); }
  $('activityList').replaceChildren(...rows);
  $('activityPrevious').disabled = activityOffset === 0; $('activityNext').disabled = !data.hasMore;
  $('activityPage').textContent = `第 ${activityOffset / 50 + 1} 頁`;
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
  $('memberTabs').replaceChildren(...[null, ...data.members].map(name => {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'member-tab'; tab.textContent = name ?? '全部';
    tab.setAttribute('aria-pressed', String(name === member));
    tab.addEventListener('click', action(async () => { member = name; offset = 0; await loadPosts(); }));
    return tab;
  }));
  const memberQuery = member === null ? '' : '?member=' + encodeURIComponent(member);
  $('browseLink').href = '/browse' + memberQuery; $('libraryLink').href = '/library' + memberQuery;
  history.replaceState(null, '', location.pathname + memberQuery);
  $('collectionTitle').textContent = `${member || '全部成員'} · ${multimedia ? '多媒體庫' : '投稿'}`;
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
  await api('/api/settings', { concurrency: Number($('concurrency').value), blogs: $('blogs').checked, gallery: $('gallery').checked, movies: $('movies').checked });
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
  notice('自動抓取排程已儲存。'); await refresh();
}));
$('nasForm').addEventListener('submit', action(async () => {
  await api('/api/nas-settings', { enabled: $('nasEnabled').checked, intervalMinutes: Number($('nasMinutes').value) });
  notice('NAS 排程已儲存。'); await refresh();
}));
$('activityKind').addEventListener('change', action(async () => { activityOffset = 0; await loadActivity(); }));
$('activityPrevious').addEventListener('click', action(async () => { activityOffset = Math.max(0,activityOffset - 50); await loadActivity(); }));
$('activityNext').addEventListener('click', action(async () => { activityOffset += 50; await loadActivity(); }));
$('start').addEventListener('click', action(async () => { await api('/api/start', {}); await refresh(); }));
$('backupStart').addEventListener('click', action(async () => { $('backupStart').disabled = true; try { await api('/api/backup', {}); await refresh(); } catch (error) { $('backupStart').disabled = false; throw error; } }));
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
