const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

test('login capture replaces the entire credential pair and clearing ends an outstanding capture', async t => {
  const handlers = new Map(), saved = new Map();
  let window, listener, storedRefresh;
  const browserSession = {
    webRequest:{onBeforeSendHeaders:(_filter, callback)=>{ listener=callback; }},
    cookies:{get:async()=>[]}, clearStorageData:async()=>{}
  };
  class Window extends EventEmitter {
    constructor() {
      super();
      window=this;
      this.webContents={id:1,session:browserSession,executeJavaScript:async()=>storedRefresh};
    }
    loadURL() {}
    reload() { this.emit('reloaded'); }
    isDestroyed() { return !!this.closed; }
    destroy() { this.closed=true; this.emit('closed'); }
    close() { this.destroy(); }
  }
  class Store {
    get(key) { return saved.get(key); }
    set(fields) { for (const [key,value] of Object.entries(fields)) saved.set(key,value); }
    get store() { return Object.fromEntries(saved); }
    set store(fields) { saved.clear(); this.set(fields); }
  }
  const load = Module._load;
  const stub = t.mock.method(Module,'_load',function(name,...args) {
    if (name==='electron-store') return Store;
    if (name==='electron') return {
      app:{whenReady:()=>new Promise(()=>{}),on(){}},protocol:{registerSchemesAsPrivileged(){}},
      BrowserWindow:Window,session:{defaultSession:browserSession},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)}
    };
    return load.call(this,name,...args);
  });
  require('../src/main/main');
  stub.mock.restore();
  const invoke = key => handlers.get(key)();
  storedRefresh='fixture-first-refresh';
  const fetch = t.mock.method(global,'fetch',async()=>Response.json({accessToken:'fixture-first-access'}));
  await invoke('open-login');
  assert.equal((await invoke('capture-token')).success,true);
  assert.equal(saved.get('refreshToken'),storedRefresh);

  storedRefresh=null;
  await invoke('open-login');
  const reloaded = new Promise(resolve=>window.once('reloaded',resolve));
  const captured = invoke('capture-token');
  await reloaded;
  listener({webContentsId:1,requestHeaders:{Authorization:'Bearer fixture-second'}},()=>{});
  assert.equal((await captured).success,true);
  assert.equal(saved.get('token'),'Bearer fixture-second');
  assert.equal(saved.get('refreshToken'),null);
  assert.equal(listener,null);

  storedRefresh='fixture-pending';
  const entered=Promise.withResolvers(), reply=Promise.withResolvers();
  fetch.mock.mockImplementation(()=>{ entered.resolve(); return reply.promise; });
  await invoke('open-login');
  const pending = invoke('capture-token');
  await entered.promise;
  assert.equal((await invoke('clear-login-cookies')).success,true);
  reply.resolve(Response.json({accessToken:'fixture-late'}));
  assert.equal((await pending).success,false);
  assert.equal(saved.has('token'),false);
  assert.equal(saved.has('refreshToken'),false);
});
