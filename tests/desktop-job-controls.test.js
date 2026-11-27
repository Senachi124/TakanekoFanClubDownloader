const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('starting, pausing, cancelling and retrying through the desktop download handler', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'takaneko-job-'));
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  const handlers = new Map();
  const values = new Map([['refreshToken','fixture-refresh'], ['readerRoot',root],
    ['v2Settings',{ blogs:false, gallery:false, movies:false }]]);
  const store = {
    get:(key, fallback)=>values.has(key)?values.get(key):fallback,
    set(key,value) {
      if (typeof key === 'string') values.set(key,value);
      else for (const [k,v] of Object.entries(key)) values.set(k,v);
    },
    get store() { return Object.fromEntries(values); },
    set store(fields) { values.clear(); this.set(fields); }
  };
  const state = {};
  const load = Module._load;
  const stub = t.mock.method(Module,'_load',function(name,...args) {
    if (name === 'electron') return {
      ipcMain:{handle:(key,fn)=>handlers.set(key,fn),removeHandler:key=>handlers.delete(key)},
      app:{getPath:()=>root},protocol:{handle(){}}
    };
    return load.call(this,name,...args);
  });
  require('../src/main/desktopV2').setup({store,state,getWindow:()=>({isDestroyed:()=>true})});
  stub.mock.restore();
  const start = handlers.get('start-download');
  const entered = Promise.withResolvers(), reply = Promise.withResolvers();
  const fetch = t.mock.method(global,'fetch',() => { entered.resolve(); return reply.promise; });
  const first = start();
  await entered.promise;
  assert.equal((await start()).status,'busy');
  state.isCancelled = true;
  reply.resolve(Response.json({accessToken:'fixture-access'}));
  assert.equal((await first).status,'cancelled');
  assert.equal(fetch.mock.callCount(),1);

  values.delete('token');
  fetch.mock.mockImplementation(async () => new Response(null,{status:503}));
  assert.equal((await start()).status,'failed');
  assert.equal(values.get('downloadErrors')[0].code,'HTTP_503');

  values.set('token','fixture-access');
  const firstPage = Promise.withResolvers();
  const offsets = [];
  fetch.mock.mockImplementation(async raw => {
    const url = new URL(raw);
    if (url.pathname.endsWith('/count')) return Response.json({count:101});
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    if (offset === 0) { state.isPaused=true; firstPage.resolve(); }
    if (offset === 50) state.isCancelled=true;
    return Response.json(Array.from({length:50},(_,i)=>({notificationReservationId:String(offset+i)})));
  });
  const paged = start();
  await firstPage.promise;
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.deepEqual(offsets,[0]);
  state.isPaused=false;
  const stopped = await paged;
  assert.deepEqual(offsets,[0,50]);
  assert.equal(stopped.status,'cancelled');
  assert.equal(stopped.progress.list.state,'cancelled');
  assert.deepEqual(stopped.progress.errors,[]);
  await handlers.get('reader-query')(null,'local',{});
});
