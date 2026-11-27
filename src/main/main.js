const { app, BrowserWindow, ipcMain, shell, dialog, session, protocol } = require('electron');
const path = require('path');
const Store = require('electron-store');
const packageInfo = require('../../package.json');
const { API_ORIGIN, SITE_ORIGIN, API_REQUEST_PATTERN } = require('./api/takaneko/config');
const { refreshCredentials } = require('./api/takaneko/auth');
const { replaceCredentials } = require('./utils/fanclubAuth');

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
let capturingWindow;
let clearingLogin = false;
const loginBusy = () => clearingLogin || !!capturingWindow;

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
    backgroundColor: '#1E1E2E'
  });

  mainWindow.setTitle(`${APP_NAME} v${packageInfo.version}`);
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  require('./desktopV2').setup({store,state:exportState,getWindow:()=>mainWindow,loginBusy});
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
  if (exportState.running || loginBusy() || typeof token !== 'string') return false;
  replaceCredentials(store, token.trim() ? { token: token.trim() } : null);
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
  if (clearingLogin || exportState.running) return { success: false };
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { success: true };
  }
  const win = new BrowserWindow({
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

  loginWindow = win;
  win.loadURL(`${SITE_ORIGIN}/login`);

  win.on('closed', () => {
    if (capturingWindow === win) capturingWindow = null;
    if (loginWindow === win) loginWindow = null;
  });

  return { success: true };
});

const LOGIN_ORIGINS = [SITE_ORIGIN, API_ORIGIN];

function cookieMatchesLogin(cookie) {
  const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
  return domain === 'takanekofc.com' || domain.endsWith('.takanekofc.com');
}

function cookieUrl(cookie) {
  const host = String(cookie.domain || '').replace(/^\./, '');
  const protocol = cookie.secure ? 'https:' : 'http:';
  return `${protocol}//${host}${cookie.path || '/'}`;
}

// Drop the embedded Fanclub session and the saved API tokens without touching YouTube cookies.
ipcMain.handle('clear-login-cookies', async () => {
  if (exportState.running || clearingLogin) return { success: false };
  clearingLogin = true;
  try {
    const browserSession = session.defaultSession;
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy();
    capturingWindow = null;
    replaceCredentials(store, null);
    const cookies = (await browserSession.cookies.get({})).filter(cookieMatchesLogin);
    for (const cookie of cookies) {
      await browserSession.cookies.remove(cookieUrl(cookie), cookie.name);
    }
    for (const origin of LOGIN_ORIGINS) {
      await browserSession.clearStorageData({
        origin, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
      });
    }
    return { success: true, removed: cookies.length };
  } finally {
    clearingLogin = false;
  }
});

function captureRequestToken(win) {
  const contents = win.webContents;
  const windowId = contents.id;
  const requests = contents.session.webRequest;
  const filter = { urls: [API_REQUEST_PATTERN] };
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(), 15000);
    const onClosed = () => finish();
    function finish(token) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      win.removeListener('closed', onClosed);
      requests.onBeforeSendHeaders(filter, null);
      if (token) resolve(/^Bearer /i.test(token) ? token : `Bearer ${token}`);
      else reject(new Error('Login capture ended'));
    }
    win.once('closed', onClosed);
    try {
      requests.onBeforeSendHeaders(filter, (details, callback) => {
        const token = details.requestHeaders.Authorization || details.requestHeaders.authorization;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
        if (details.webContentsId === windowId && typeof token === 'string' && token.trim()) finish(token.trim());
      });
      win.reload();
    } catch {
      finish();
    }
  });
}

ipcMain.handle('capture-token', async () => {
  const win = loginWindow;
  if (!win || win.isDestroyed() || loginBusy() || exportState.running) return { success: false };
  capturingWindow = win;
  try {
    // Read before reload because a non-persistent login can lose its stored token on unload.
    const storedRefresh = await win.webContents.executeJavaScript(
      `location.origin === ${JSON.stringify(SITE_ORIGIN)} && (localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken'))`
    ).catch(() => null);
    let credentials;
    if (typeof storedRefresh === 'string' && storedRefresh.trim() && !win.isDestroyed()) {
      credentials = await refreshCredentials(storedRefresh.trim()).catch(() => null);
    }
    if (win.isDestroyed() || win !== loginWindow) return { success: false };
    if (!credentials) credentials = { token: await captureRequestToken(win) };
    if (win.isDestroyed() || win !== loginWindow) return { success: false };
    replaceCredentials(store, credentials);
    win.close();
    return { success: true };
  } catch {
    return { success: false };
  } finally {
    if (capturingWindow === win) capturingWindow = null;
  }
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
