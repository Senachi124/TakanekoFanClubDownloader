const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const path = require('node:path');

const source = fs.readFileSync(process.env.TAKANEKO_APP || path.join(__dirname, '../../server/public/app.js'), 'utf8');
// Exercise the real asynchronous catalog renderer, including its link rewrite.
const renderer = source.slice(source.indexOf('async function loadPosts()'), source.indexOf('async function openPost('));
for (const basePath of ['', '/takaneko']) {
  for (const multimedia of [false, true]) {
    for (const member of [null, '松本 ももな & /?#']) {
      test(`catalog navigation: mount=${basePath || '/'} library=${multimedia} member=${member}`, async () => {
        const elements = new Map();
        const element = () => ({ value: 'all', setAttribute() {}, replaceChildren() {}, addEventListener() {} });
        const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
        const location = { pathname: basePath + (multimedia ? '/library' : '/browse') };
        let replaced, requested;
        const context = vm.createContext({ $, basePath, multimedia, member, requestSerial: 0, offset: 0,
          URLSearchParams, encodeURIComponent, location, mediaItems: [],
          document: { createElement: element }, action: fn => fn,
          history: { replaceState: (state, title, url) => { replaced = url; } },
          api: async url => { requested = url; return { member, members: ['松本 ももな & /?#'], total: 0, posts: [], media: [], hasMore: false }; },
        });
        await vm.runInContext(renderer + '\nloadPosts()', context);
        const query = member === null ? '' : '?member=' + encodeURIComponent(member);
        assert.equal($('browseLink').href, basePath + '/browse' + query);
        assert.equal($('libraryLink').href, basePath + '/library' + query);
        assert.equal(replaced, location.pathname + query);
        assert.equal(new URL(requested, 'https://example.test').searchParams.get('member'), member);
      });
    }
  }
}
