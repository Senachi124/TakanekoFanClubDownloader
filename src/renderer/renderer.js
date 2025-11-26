const { ipcRenderer } = require('electron');

// --- DOM Elements ---
const tokenStatus = document.getElementById('tokenStatus');
const getTokenBtn = document.getElementById('getTokenBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const progressSection = document.getElementById('progressSection');
const progressMessage = document.getElementById('progressMessage');

// Export Control Buttons
const startExportBtn = document.getElementById('startExportBtn');
// Note: Ensure you have added these buttons to your HTML as per previous instructions
// If not, add <button id="pauseBtn"> and <button id="cancelBtn"> in index.html
const pauseBtn = document.getElementById('pauseBtn'); 
const cancelBtn = document.getElementById('cancelBtn');

// Modals
const loginModal = document.getElementById('loginModal');
const captureModal = document.getElementById('captureModal');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');

// Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

// Gallery
const memberTabs = document.getElementById('memberTabs');
const galleryGrid = document.getElementById('galleryGrid');

// --- Global State ---
let currentGalleryData = {};
let isPaused = false;
let cachedNotifications = [];
let cachedDetails = [];

// --- Initialization ---
async function init() {
  await checkToken();
  setupEventListeners();
  
  // Initial UI state for controls
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// Check if token exists on startup
async function checkToken() {
  const token = await ipcRenderer.invoke('get-token');
  updateTokenStatus(!!token);
}

// Update header status
function updateTokenStatus(hasToken) {
  const statusDot = tokenStatus.querySelector('.status-dot');
  const statusText = tokenStatus.querySelector('span:last-child');

  if (hasToken) {
    statusDot.classList.remove('offline');
    statusDot.classList.add('online');
    statusText.textContent = 'Logged in';
    getTokenBtn.textContent = 'Refresh Token';
  } else {
    statusDot.classList.remove('online');
    statusDot.classList.add('offline');
    statusText.textContent = 'Not logged in';
    getTokenBtn.textContent = 'Login';
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  
  // 1. Navigation Switching
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      switchView(viewName);
    });
  });

  // 2. Token Acquisition Flow
  getTokenBtn.addEventListener('click', () => {
    loginModal.classList.add('active');
  });

  document.getElementById('cancelLoginBtn').addEventListener('click', () => {
    loginModal.classList.remove('active');
  });

  document.getElementById('proceedLoginBtn').addEventListener('click', async () => {
    loginModal.classList.remove('active');
    await ipcRenderer.invoke('open-login');
    captureModal.classList.add('active');
  });

  document.getElementById('cancelCaptureBtn').addEventListener('click', () => {
    captureModal.classList.remove('active');
  });

  document.getElementById('captureTokenBtn').addEventListener('click', async () => {
    const captureStatus = document.getElementById('captureStatus');
    captureStatus.textContent = 'Capturing token...';
    captureStatus.className = 'capture-status';

    const result = await ipcRenderer.invoke('capture-token');

    if (result.success) {
      captureStatus.textContent = 'Token captured successfully!';
      captureStatus.className = 'capture-status success';
      updateTokenStatus(true);
      setTimeout(() => {
        captureModal.classList.remove('active');
        captureStatus.textContent = '';
      }, 1500);
    } else {
      captureStatus.textContent = result.error || 'Failed to capture token';
      captureStatus.className = 'capture-status error';
    }
  });

  // 3. Export Flow (The new 3-Step Process)
  startExportBtn.addEventListener('click', async () => {
    const token = await ipcRenderer.invoke('get-token');
    if (!token) {
      alert('Please login first.');
      return;
    }

    // Reset UI for new export
    resetProgressBars();
    startExportBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    progressSection.style.display = 'block';

    try {
      // 0. Reset Backend State
      await ipcRenderer.invoke('reset-state');
      isPaused = false;
      if (pauseBtn) {
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('warning');
      }

      // --- STEP 1: Fetch List ---
      updateStatus('Step 1/3: Fetching Post List...', 0);
      cachedNotifications = await ipcRenderer.invoke('step-1-fetch-list');
      updateProgressVisuals('getAllPosts', 100);
      console.log('Renderer: List fetched', cachedNotifications.length);

      // --- STEP 2: Fetch Details ---
      updateStatus(`Step 2/3: Downloading Details for ${cachedNotifications.length} items...`, 0);
      // Triggers 'export-progress' events
      cachedDetails = await ipcRenderer.invoke('step-2-fetch-details', cachedNotifications);
      updateProgressVisuals('getPostDetails', 100);
      console.log('Renderer: Details fetched', cachedDetails.length);

      // --- STEP 3: Export Files ---
      updateStatus('Step 3/3: Saving Files & Images...', 0);
      // Triggers 'export-progress' events
      const path = await ipcRenderer.invoke('step-3-export-files', cachedDetails);
      updateProgressVisuals('exportPosts', 100);

      // Success
      updateStatus(`Export Complete! Saved to: ${path}`);
      alert('Export complete!');
      resetExportUI();

    } catch (error) {
      if (error.message.includes('cancelled')) {
        updateStatus('❌ Export Cancelled by user.');
      } else {
        updateStatus(`❌ Error: ${error.message}。よくある原因はトークンの有効期限切れです。もう一度トークンの更新をお試しください。`);
        alert('Export failed: ' + error.message);
      }
      resetExportUI();
    }
  });

  // 4. Pause / Resume Logic
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      if (!isPaused) {
        await ipcRenderer.invoke('control-pause');
        isPaused = true;
        pauseBtn.textContent = 'Resume';
        pauseBtn.classList.add('warning'); // Assuming you have a .warning CSS class
        updateStatus('⚠️ Process Paused');
      } else {
        await ipcRenderer.invoke('control-resume');
        isPaused = false;
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('warning');
        updateStatus('▶️ Resuming...');
      }
    });
  }

  // 5. Cancel Logic
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop? Progress will be lost.')) {
        await ipcRenderer.invoke('control-cancel');
        // The catch block in startExportBtn will handle the UI reset
      }
    });
  }

  // 6. Open Folder
  openFolderBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('open-exported-folder');
  });

  // 7. Image Modal
  document.getElementById('closeImageBtn').addEventListener('click', () => {
    imageModal.classList.remove('active');
  });

  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) {
      imageModal.classList.remove('active');
    }
  });
}

// --- UI Helper Functions ---

function resetExportUI() {
  startExportBtn.style.display = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
  isPaused = false;
}

function updateStatus(msg) {
  if (progressMessage) progressMessage.textContent = msg;
}

function resetProgressBars() {
  ['progress1', 'progress2', 'progress3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = '0%';
      el.classList.remove('active', 'completed');
    }
  });
}

// Handle manual updates (mostly for Step 1 completion)
function updateProgressVisuals(step, progress) {
  const steps = {
    'getAllPosts': 'progress1',
    'getPostDetails': 'progress2',
    'exportPosts': 'progress3'
  };
  
  const id = steps[step];
  if (!id) return;
  
  const bar = document.getElementById(id);
  if (bar) {
    bar.style.width = progress + '%';
    if (progress >= 100) {
      bar.classList.remove('active');
      bar.classList.add('completed');
    }
  }
}

// --- IPC Progress Listener ---
ipcRenderer.on('export-progress', (event, data) => {
  const { step, progress, message } = data;
  
  // Update Message
  if (message) updateStatus(message);

  // Update Bar
  const steps = {
    'getAllPosts': 'progress1',
    'getPostDetails': 'progress2',
    'exportPosts': 'progress3'
  };

  const id = steps[step];
  if (id) {
    const bar = document.getElementById(id);
    if (bar) {
      bar.style.width = progress + '%';
      
      if (progress < 100) {
        bar.classList.add('active');
        bar.classList.remove('completed');
      } else {
        bar.classList.remove('active');
        bar.classList.add('completed');
      }
    }
  }

  // Chain Visuals: If in step 2, step 1 must be done
  if (step === 'getPostDetails') {
    updateProgressVisuals('getAllPosts', 100);
  } else if (step === 'exportPosts') {
    updateProgressVisuals('getAllPosts', 100);
    updateProgressVisuals('getPostDetails', 100);
  }
});

// --- Gallery Logic ---

// State
let activeMember = null;
let viewMode = 'photos'; // 'photos' or 'posts'

// Elements
const subNav = document.getElementById('subNav');
const btnShowPhotos = document.getElementById('btnShowPhotos');
const btnShowPosts = document.getElementById('btnShowPosts');
const imageWall = document.getElementById('imageWall');
const postList = document.getElementById('postList');
const galleryEmptyText = document.getElementById('galleryEmptyText');
const postViewer = document.getElementById('postViewer');
const viewerContent = document.getElementById('viewerContent');
const viewerTitle = document.getElementById('viewerTitle');

// Setup Gallery Listeners (Call this in setupEventListeners)
function setupGalleryListeners() {
  btnShowPhotos.addEventListener('click', () => switchGalleryMode('photos'));
  btnShowPosts.addEventListener('click', () => switchGalleryMode('posts'));
  
  document.getElementById('closeViewerBtn').addEventListener('click', () => {
    postViewer.classList.remove('active');
  });
}

// Add this line to your main setupEventListeners function!
btnShowPhotos.addEventListener('click', () => switchGalleryMode('photos'));
btnShowPosts.addEventListener('click', () => switchGalleryMode('posts'));
document.getElementById('closeViewerBtn').addEventListener('click', () => {
    postViewer.classList.remove('active');
});


function switchView(viewName) {
  navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  views.forEach(view => {
    view.classList.toggle('active', view.id === viewName + 'View');
  });

  if (viewName === 'gallery') {
    loadGallery();
  }
}

async function loadGallery() {
  memberTabs.innerHTML = '<p class="loading-text">Loading gallery...</p>';
  imageWall.innerHTML = '';
  postList.innerHTML = '';
  subNav.style.display = 'none';

  const result = await ipcRenderer.invoke('get-gallery-data');

  if (result.success && Object.keys(result.data).length > 0) {
    currentGalleryData = result.data;
    renderMemberTabs();
  } else {
    memberTabs.innerHTML = '<p class="empty-text">No exported content found. Run an export first.</p>';
  }
}

function renderMemberTabs() {
  const members = Object.keys(currentGalleryData);
  memberTabs.innerHTML = '';

  members.forEach((member, index) => {
    const tab = document.createElement('button');
    tab.className = 'member-tab' + (index === 0 ? ' active' : '');
    tab.textContent = member;
    tab.addEventListener('click', () => selectMember(member, tab));
    memberTabs.appendChild(tab);
  });

  if (members.length > 0) {
    selectMember(members[0], memberTabs.firstChild);
  }
}

function selectMember(member, tab) {
  // Update Tabs UI
  document.querySelectorAll('.member-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  
  activeMember = member;
  subNav.style.display = 'flex';
  
  // Refresh Content
  switchGalleryMode(viewMode);
}

function switchGalleryMode(mode) {
  viewMode = mode;
  
  // Update Buttons
  btnShowPhotos.classList.toggle('active', mode === 'photos');
  btnShowPosts.classList.toggle('active', mode === 'posts');
  
  // Toggle Containers
  imageWall.style.display = mode === 'photos' ? 'grid' : 'none';
  postList.style.display = mode === 'posts' ? 'flex' : 'none';
  
  renderContent();
}

function renderContent() {
  if (!activeMember || !currentGalleryData[activeMember]) return;

  const data = currentGalleryData[activeMember];
  galleryEmptyText.style.display = 'none';

  if (viewMode === 'photos') {
    renderImageWall(data.allImages);
  } else {
    renderPostList(data.posts);
  }
}

// 1. Render Image Wall (Pictures Folder)
function renderImageWall(images) {
  imageWall.innerHTML = '';
  
  if (!images || images.length === 0) {
    imageWall.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#aaa;">No images found in pictures folder.</p>';
    return;
  }

  // Lazy loading using Fragment for performance
  const fragment = document.createDocumentFragment();

  images.forEach(imgPath => {
    const div = document.createElement('div');
    div.className = 'wall-item';
    
    const img = document.createElement('img');
    img.src = `file://${imgPath}`;
    img.loading = 'lazy'; // Important for performance
    
    div.appendChild(img);
    
    // Click to open Modal
    div.addEventListener('click', () => {
      modalImage.src = `file://${imgPath}`;
      imageModal.classList.add('active');
    });

    fragment.appendChild(div);
  });

  imageWall.appendChild(fragment);
}

// 2. Render Post List
function renderPostList(posts) {
  postList.innerHTML = '';

  if (!posts || posts.length === 0) {
    postList.innerHTML = '<p style="text-align:center; color:#aaa;">No posts found.</p>';
    return;
  }

  posts.forEach(post => {
    const row = document.createElement('div');
    row.className = 'post-row';
    
    const coverUrl = post.cover ? `file://${post.cover}` : '';
    const coverHtml = coverUrl 
      ? `<img class="post-row-cover" src="${coverUrl}">`
      : `<div class="post-row-cover" style="background:#333; display:flex; align-items:center; justify-content:center; color:#555;">No Img</div>`;

    row.innerHTML = `
      ${coverHtml}
      <div class="post-row-info">
        <h4>${post.title}</h4>
        <div class="post-row-date">${post.date}</div>
      </div>
    `;

    // Click to Open Post Viewer
    row.addEventListener('click', () => openPostViewer(post));

    postList.appendChild(row);
  });
}

// 3. Open Post Viewer (Simple MD Parser)
function openPostViewer(post) {
  viewerTitle.textContent = post.title;
  
  let rawContent = post.content;
  
  // Replace Markdown Image Syntax with HTML <img> tag using Absolute Path
  // Pattern: ![alt](filename)
  const htmlContent = rawContent.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, filename) => {
    // Construct full path: post.fullPath + filename
    // Ensure filename doesn't have path traversal characters
    const cleanFilename = filename.split('/').pop(); 
    const fullImgPath = `${post.fullPath}/${cleanFilename}`;
    return `<img src="file://${fullImgPath}" alt="${alt}">`;
  })
  .replace(/^# (.*$)/gim, '<h1>$1</h1>')
  .replace(/\n/gim, '<br>');

  viewerContent.innerHTML = htmlContent;
  postViewer.classList.add('active');
}

// Initialize App
init();