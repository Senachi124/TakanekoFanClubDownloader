const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

// Global state control for the export process
const exportState = {
  isPaused: false,
  isCancelled: false
};

let mainWindow;
let loginWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
const { handleGetAllPosts } = require('./api/getAllPosts');
const { handleGetPostDetails } = require('./api/getPostDetails');
const { handleExportPosts } = require('./api/exportPosts');

// Get saved token
ipcMain.handle('get-token', () => {
  return store.get('token', null);
});

// Save token
ipcMain.handle('save-token', (event, token) => {
  store.set('token', token);
  return true;
});

// Open login window for token capture
ipcMain.handle('open-login', async () => {
  loginWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    parent: mainWindow,
    modal: false,
    title: 'Login to Takaneko FC'
  });

  loginWindow.loadURL('https://takanekofc.com/#/login');

  loginWindow.on('closed', () => {
    loginWindow = null;
  });

  return { success: true };
});

// Capture token from logged-in session
ipcMain.handle('capture-token', async () => {
  if (!loginWindow || loginWindow.isDestroyed()) {
    return { success: false, error: 'Login window not found.' };
  }

  return new Promise((resolve) => {
    let isResolved = false; // Prevent duplicate resolve
    const filter = { urls: ['https://api.takanekofc.com/*'] };

    // 1. Define success handler
    const handleSuccess = (token) => {
      if (isResolved) return;
      isResolved = true;

      // Clean up interceptor
      loginWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, null);

      // Format token
      const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      store.set('token', bearerToken);

      console.log('✅ Token captured successfully!');

      loginWindow.close();
      resolve({ success: true, token: bearerToken });
    };

    // 2. Define failure/timeout handler
    const handleFailure = (errorMsg) => {
      if (isResolved) return;
      isResolved = true;

      // Clean up interceptor (if window still exists)
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, null);
      }

      console.log('❌ Token capture failed:', errorMsg);
      resolve({ success: false, error: errorMsg });
    };

    // 3. Set up interceptor
    try {
      loginWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        const headers = details.requestHeaders;
        // Check Authorization (case-insensitive)
        const token = headers['Authorization'] || headers['authorization'];

        if (token) {
          handleSuccess(token);
        }

        // Continue request
        callback({ cancel: false, requestHeaders: details.requestHeaders });
      });
    } catch (e) {
      handleFailure(`Interceptor error: ${e.message}`);
      return;
    }

    // 4. Reload the page! This is the key step
    // This forces the website to re-execute initialization code and send authenticated requests
    console.log('🔄 Reloading page to trigger authentication request...');
    loginWindow.reload();

    // 5. Set 15-second timeout protection
    // If user is not logged in or network is slow, don't hang forever
    setTimeout(() => {
      if (!isResolved) {
        handleFailure('Timeout: Token not detected after 15 seconds. Please ensure you are logged in.');
      }
    }, 15000);
  });
});

// Open exported folder
ipcMain.handle('open-exported-folder', () => {
  const exportedPath = path.join(app.getPath('userData'), 'exported');
  const fs = require('fs');

  if (!fs.existsSync(exportedPath)) {
    fs.mkdirSync(exportedPath, { recursive: true });
  }

  shell.openPath(exportedPath);
  return exportedPath;
});

// Get exported folder path
ipcMain.handle('get-exported-path', () => {
  return path.join(app.getPath('userData'), 'exported');
});

// Start export process
ipcMain.handle('start-export', async (event) => {
  const token = store.get('token');
  if (!token) {
    return { success: false, error: 'No token found. Please login first.' };
  }

  try {
    // Step 1: Get all posts
    mainWindow.webContents.send('export-progress', { step: 'getAllPosts', progress: 0, message: 'Fetching post list...' });
    const notifications = await handleGetAllPosts(token);
    mainWindow.webContents.send('export-progress', { step: 'getAllPosts', progress: 100, message: `Found ${notifications.length} posts` });

    // Step 2: Get post details
    mainWindow.webContents.send('export-progress', { step: 'getPostDetails', progress: 0, message: 'Fetching post details...' });
    const postDetails = await handleGetPostDetails(token, notifications, (progress) => {
      mainWindow.webContents.send('export-progress', { step: 'getPostDetails', progress, message: `Fetching details: ${progress}%` });
    });
    mainWindow.webContents.send('export-progress', { step: 'getPostDetails', progress: 100, message: `Fetched ${postDetails.length} posts` });

    // Step 3: Export posts
    mainWindow.webContents.send('export-progress', { step: 'exportPosts', progress: 0, message: 'Exporting posts...' });
    const exportedPath = path.join(app.getPath('userData'), 'exported');
    await handleExportPosts(postDetails, exportedPath, (progress) => {
      mainWindow.webContents.send('export-progress', { step: 'exportPosts', progress, message: `Exporting: ${progress}%` });
    });
    mainWindow.webContents.send('export-progress', { step: 'exportPosts', progress: 100, message: 'Export complete!' });

    return { success: true, path: exportedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get gallery data (Updated for Image Wall + Post List)
ipcMain.handle('get-gallery-data', async () => {
  const fs = require('fs').promises;
  const path = require('path');
  const exportedPath = path.join(app.getPath('userData'), 'exported');

  try {
    try {
      await fs.access(exportedPath);
    } catch {
      return { success: false, error: 'Export directory not found.', data: {} };
    }

    const members = await fs.readdir(exportedPath);
    const galleryData = {};

    for (const member of members) {
      const memberPath = path.join(exportedPath, member);
      const stat = await fs.stat(memberPath);

      if (stat.isDirectory()) {
        const memberData = {
          allImages: [], 
          posts: []      
        };

        
        const picturesPath = path.join(memberPath, 'pictures');
        try {
          const pics = await fs.readdir(picturesPath);
          memberData.allImages = pics
            .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
            .map(f => path.join(picturesPath, f));
        } catch (e) {
          // No pictures folder, skip
        }

        
        const entries = await fs.readdir(memberPath);
        for (const entry of entries) {
          if (entry === 'pictures' || entry === '.DS_Store') continue;

          const postPath = path.join(memberPath, entry);
          const postStat = await fs.stat(postPath);

          if (postStat.isDirectory()) {
            const files = await fs.readdir(postPath);
            const mdFile = files.find(f => f === 'index.md');
            // Find the first image as cover
            const coverImage = files.find(f => /\.(jpg|jpeg|png)$/i.test(f));

            let title = entry;
            let content = '';

            if (mdFile) {
              const mdContent = await fs.readFile(path.join(postPath, mdFile), 'utf-8');
              content = mdContent;
              // Try to extract title from md
              const titleMatch = mdContent.match(/^# (.+)$/m);
              if (titleMatch) title = titleMatch[1];
            }

            memberData.posts.push({
              folder: entry,
              fullPath: postPath,
              title: title,
              cover: coverImage ? path.join(postPath, coverImage) : null,
              content: content, // Contains Markdown content
              date: entry.split('_')[0]
            });
          }
        }

        // Sort posts by date in descending order
        memberData.posts.sort((a, b) => b.folder.localeCompare(a.folder));
        
        galleryData[member] = memberData;
      }
    }

    return { success: true, data: galleryData };
  } catch (error) {
    console.error('Gallery Error:', error);
    return { success: false, error: error.message, data: {} };
  }
});

// --- NEW IPC HANDLERS FOR STEP-BY-STEP CONTROL ---

// Control Handlers
ipcMain.handle('control-pause', () => {
  exportState.isPaused = true;
  console.log('⚠️ Process PAUSED by user');
  return true;
});

ipcMain.handle('control-resume', () => {
  exportState.isPaused = false;
  console.log('▶️ Process RESUMED by user');
  return true;
});

ipcMain.handle('control-cancel', () => {
  exportState.isCancelled = true;
  // Resume if paused so loops can break
  exportState.isPaused = false; 
  console.log('ww Process CANCELED by user');
  return true;
});

// Reset state before starting
ipcMain.handle('reset-state', () => {
  exportState.isPaused = false;
  exportState.isCancelled = false;
  return true;
});

// Step 1: Get Post List
ipcMain.handle('step-1-fetch-list', async (event) => {
  const token = store.get('token');
  if (!token) throw new Error('No token found');

  console.log('--- STEP 1 STARTED: Fetching List ---');
  // Pass state (though Step 1 is fast, we keep consistency)
  const notifications = await handleGetAllPosts(token);
  console.log(`--- STEP 1 COMPLETE: Found ${notifications.length} items ---`);
  return notifications;
});

// Step 2: Get Post Details (With Pause Support)
ipcMain.handle('step-2-fetch-details', async (event, notifications) => {
  const token = store.get('token');
  console.log(`--- STEP 2 STARTED: Fetching Details for ${notifications.length} items ---`);
  
  // Pass the state object to allow pausing inside the loop
  const details = await handleGetPostDetails(token, notifications, exportState, (progress, current, total) => {
    // Send progress to UI
    event.sender.send('export-progress', { 
      step: 'getPostDetails', 
      progress, 
      message: `Fetching: ${current}/${total}` 
    });
  });

  console.log('--- STEP 2 COMPLETE ---');
  return details;
});

// Step 3: Export Files (With Pause Support)
ipcMain.handle('step-3-export-files', async (event, postDetails) => {
  const exportedPath = path.join(app.getPath('userData'), 'exported');
  console.log(`--- STEP 3 STARTED: Exporting to ${exportedPath} ---`);

  await handleExportPosts(postDetails, exportedPath, exportState, (progress, current, total) => {
    event.sender.send('export-progress', { 
      step: 'exportPosts', 
      progress, 
      message: `Saving: ${current}/${total}` 
    });
  });

  console.log('--- STEP 3 COMPLETE ---');
  return exportedPath;
});