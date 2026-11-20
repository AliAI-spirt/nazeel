const test = require('node:test');
const assert = require('node:assert/strict');

// محاكاة مبسطة لواجهة chrome.* لاختبار منطق التفعيل/المزامنة
function mockChrome({ grant = true } = {}) {
  const store = {}, registered = {}, perms = new Set(), injected = [];
  globalThis.chrome = {
    storage: { local: {
      get: async k => (k in store ? { [k]: store[k] } : {}),
      set: async o => Object.assign(store, o)
    } },
    permissions: {
      request: async ({ origins }) => { if (grant) origins.forEach(o => perms.add(o)); return grant; },
      contains: async ({ origins }) => origins.every(o => perms.has(o)),
      remove: async ({ origins }) => origins.forEach(o => perms.delete(o))
    },
    scripting: {
      unregisterContentScripts: async ({ ids }) => { ids.forEach(i => { if (!registered[i]) throw new Error('nope'); delete registered[i]; }); },
      registerContentScripts: async arr => arr.forEach(s => { registered[s.id] = s; }),
      executeScript: async o => injected.push(o)
    }
  };
  return { store, registered, perms, injected };
}
delete require.cache[require.resolve('../src/site.js')];
require('../src/site.js');
const { Site } = globalThis;

test('originOf: يقبل http/https فقط', () => {
  assert.equal(Site.originOf('https://hotel.example.com/guests?x=1'), 'https://hotel.example.com');
  assert.equal(Site.originOf('chrome://extensions'), '');
  assert.equal(Site.originOf('file:///a.html'), '');
  assert.equal(Site.originOf(undefined), '');
});

test('enable: يطلب إذن أصل واحد فقط ويسجل السكربت له وحده', async () => {
  const m = mockChrome();
  const o = await Site.enable({ id: 7, url: 'https://hotel.example.com/guests' });
  assert.equal(o, 'https://hotel.example.com');
  assert.deepEqual([...m.perms], ['https://hotel.example.com/*']);
  assert.deepEqual(m.registered['nazeel-site'].matches, ['https://hotel.example.com/*']);
  assert.deepEqual(m.registered['nazeel-site'].js, ['imaging.js', 'filler.js', 'content.js']);
  assert.equal(m.injected.length, 1, 'حقن فوري في التبويب الحالي');
});

test('enable: رفض المستخدم للإذن لا يسجل شيئاً', async () => {
  const m = mockChrome({ grant: false });
  await assert.rejects(() => Site.enable({ id: 1, url: 'https://x.example/' }), /الإذن/);
  assert.deepEqual(m.registered, {});
  assert.deepEqual(await Site.list(), []);
});

test('enable: يرفض صفحات المتصفح الداخلية', async () => {
  mockChrome();
  await assert.rejects(() => Site.enable({ id: 1, url: 'chrome://settings' }));
});

test('sync: يزيل الأصول التي سُحب إذنها ويعيد تسجيل الباقي', async () => {
  const m = mockChrome();
  await Site.enable({ id: 1, url: 'https://a.example/' });
  await Site.enable({ id: 2, url: 'https://b.example/' });
  m.perms.delete('https://a.example/*'); // المستخدم سحب الإذن من إعدادات Chrome
  const kept = await Site.sync();
  assert.deepEqual(kept, ['https://b.example']);
  assert.deepEqual(m.registered['nazeel-site'].matches, ['https://b.example/*']);
});

test('disable: يسحب الإذن ويلغي التسجيل عند عدم بقاء مواقع', async () => {
  const m = mockChrome();
  await Site.enable({ id: 1, url: 'https://a.example/' });
  await Site.disable('https://a.example');
  assert.equal(m.perms.size, 0);
  assert.equal(m.registered['nazeel-site'], undefined);
});
