const { app, BrowserWindow, ipcMain, shell, dialog, session, protocol } = require('electron');
const path = require('path');
const Store = require('electron-store');
const packageInfo = require('../../package.json');

protocol.registerSchemesAsPrivileged([{scheme:'archive',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const store = new Store();
const APP_NAME = packageInfo.productName
  || packageInfo.build?.productName
  || app.getName()
  || 'Takaneko Fanclub Downloader';
const { DEFAULT_CONCURRENCY: DEFAULT_DOWNLOAD_CONCURRENCY, normalizeConcurrency: normalizeDownloadConcurrency } = require('./utils/concurrency');

// Global state control for the export process
const exportState = {
  isPaused: false,
  isCancelled: false
};

let mainWindow;
let loginWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.setTitle(`${APP_NAME} v${packageInfo.version}`);
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  require('./desktopV2').setup({store,state:exportState,getWindow:()=>mainWindow});
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

// Expose the packaged app name and runtime version to the renderer UI.
ipcMain.handle('get-app-info', () => ({
  name: APP_NAME,
  version: packageInfo.version
}));

// Save token
ipcMain.handle('save-token', (event, token) => {
  store.set('token', token);
  return true;
});

// Download concurrency is user-configurable and persisted per installation.
ipcMain.handle('get-download-settings', () => {
  return {
    concurrency: normalizeDownloadConcurrency(
      store.get('downloadConcurrency', DEFAULT_DOWNLOAD_CONCURRENCY)
    )
  };
});

ipcMain.handle('save-download-settings', (event, value) => {
  const concurrency = normalizeDownloadConcurrency(value);
  store.set('downloadConcurrency', concurrency);
  return concurrency;
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
    title: `Login to ${APP_NAME}`
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
      resolve({ success: true });
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
  const exportedPath = store.get('downloadRoot') || path.join(app.getPath('userData'), 'exported');
  const fs = require('fs');

  if (!fs.existsSync(exportedPath)) {
    fs.mkdirSync(exportedPath, { recursive: true });
  }

  shell.openPath(exportedPath);
  return exportedPath;
});

// Get exported folder path
ipcMain.handle('get-exported-path', () => {
  return store.get('downloadRoot') || path.join(app.getPath('userData'), 'exported');
});


ipcMain.handle('control-pause',()=>{exportState.isPaused=true;return true;});
ipcMain.handle('control-resume',()=>{exportState.isPaused=false;return true;});
ipcMain.handle('control-cancel',()=>{exportState.isCancelled=true;exportState.isPaused=false;return true;});
