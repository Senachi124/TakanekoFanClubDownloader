const $ = id => document.getElementById(id);
let csrf = '', offset = 0, job = null, lastCount = -1;
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
function showLogin() { $('login').hidden = false; $('workspace').hidden = true; $('logout').hidden = true; }
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
  if (data.stats.backup_errors) notice('NAS 備份暫時失敗。本機內容已保留，下一個備份時段會重試。');
  if (lastCount !== data.stats.posts) { lastCount = data.stats.posts; await loadPosts(); }
}
async function loadPosts() {
  const member = $('member').value;
  const data = await api(`/api/posts?offset=${offset}&member=${encodeURIComponent(member)}`);
  $('member').replaceChildren(new Option('全部成員', ''), ...data.members.map(name => new Option(name, name)));
  $('member').value = member;
  $('posts').replaceChildren();
  for (const post of data.posts) {
    const card = document.createElement('button'); card.className = 'post';
    if (post.cover) {
      const img = document.createElement('img'); img.src = `/media/${post.cover.media_id}`; img.loading = 'lazy'; img.alt = post.title; card.append(img);
    } else { const mark = document.createElement('div'); mark.className = 'placeholder'; mark.textContent = 'T'; card.append(mark); }
    const info = document.createElement('div'); info.className = 'post-info';
    const memberName = document.createElement('small'); memberName.textContent = post.member;
    const title = document.createElement('h3'); title.textContent = post.title;
    const state = document.createElement('p'); state.textContent = post.nas_available ? 'VM + NAS' : 'VM · 等待備份';
    info.append(memberName, title, state); card.append(info); card.addEventListener('click', () => openPost(post.resource_key).catch(e => notice(e.message))); $('posts').append(card);
  }
  $('empty').hidden = !!data.posts.length;
  $('previous').disabled = offset === 0; $('next').disabled = data.posts.length < 48;
  $('page').textContent = `第 ${offset / 48 + 1} 頁`;
}
async function openPost(key) {
  const post = await api('/api/post?key=' + encodeURIComponent(key));
  $('detailTitle').textContent = post.title; $('detailMember').textContent = post.member;
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
  if (!file || file.size > 512 * 1024) throw new Error('請選擇小於 512 KiB 的登入檔案。');
  $('importButton').disabled = true; $('importButton').textContent = '正在驗證…';
  try {
    await api('/api/import-cookies', { content: await file.text() });
    $('cookiesFile').value = ''; notice('Fanclub 登入驗證成功，現在可以開始下載。'); await refresh();
  } finally { $('importButton').disabled = false; $('importButton').textContent = '匯入並驗證登入'; }
}));
$('start').addEventListener('click', action(async () => { await api('/api/start', {}); await refresh(); }));
$('pause').addEventListener('click', action(async () => { await api('/api/control', { command: job?.command === 'pause' ? 'run' : 'pause' }); await refresh(); }));
$('cancel').addEventListener('click', action(async () => { await api('/api/control', { command: 'cancel' }); notice('停止安排新下載，進行中的項目完成後結束。'); await refresh(); }));
$('member').addEventListener('change', action(async () => { offset = 0; await loadPosts(); }));
$('previous').addEventListener('click', action(async () => { offset = Math.max(0, offset - 48); await loadPosts(); }));
$('next').addEventListener('click', action(async () => { offset += 48; await loadPosts(); }));
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => { $('detailMedia').replaceChildren(); });
refresh().catch(() => {});
setInterval(() => { if (!$('workspace').hidden) refresh().catch(e => notice(e.message)); }, 4000);
