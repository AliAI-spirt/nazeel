/*
 * إدارة نطاق عمل الإضافة (Least Privilege):
 * لا تعمل سكربتات الصفحة إلا على موقع المنظومة الذي يفعّله المستخدم صراحةً (إذن اختياري لهذا الأصل فقط).
 * يُحمَّل في اللوحة الجانبية وفي خدمة الخلفية.
 */
(function (g) {
  'use strict';
  const KEY = 'siteOrigins', SCRIPT_ID = 'nazeel-site', JS = ['imaging.js', 'filler.js', 'content.js'];

  /* يستخرج الأصل (origin) من رابط تبويب؛ يرفض غير http(s) مثل chrome:// */
  function originOf(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch (e) { return ''; }
  }
  const pattern = o => o + '/*';

  async function list() { return ((await chrome.storage.local.get(KEY))[KEY]) || []; }

  /* يسجل سكربت المحتوى للأصول المفعّلة فقط (يستبدل أي تسجيل سابق) */
  async function register(origins) {
    try { await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }); } catch (e) { /* غير مسجل أصلاً */ }
    if (!origins.length) return;
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID, matches: origins.map(pattern), js: JS, runAt: 'document_idle', persistAcrossSessions: true
    }]);
  }

  /* يُستدعى من نقرة المستخدم (مطلوب من Chrome لطلب الإذن) */
  async function enable(tab) {
    const o = originOf(tab && tab.url);
    if (!o) throw new Error('تعذر تحديد الموقع. وأنت على صفحة المنظومة اضغط أيقونة الإضافة ثم زر التفعيل.');
    const ok = await chrome.permissions.request({ origins: [pattern(o)] });
    if (!ok) throw new Error('لم تمنح الإذن، لذلك لن تعمل الإضافة على هذا الموقع.');
    const set = new Set(await list()); set.add(o);
    const origins = [...set];
    await chrome.storage.local.set({ [KEY]: origins });
    await register(origins);
    // حقن فوري في التبويب الحالي كي لا يحتاج المستخدم إلى تحديث الصفحة
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: JS }); } catch (e) { /* يعمل بعد التحديث */ }
    return o;
  }

  async function disable(o) {
    const origins = (await list()).filter(x => x !== o);
    await chrome.storage.local.set({ [KEY]: origins });
    try { await chrome.permissions.remove({ origins: [pattern(o)] }); } catch (e) { /* ignore */ }
    await register(origins);
  }

  /* يزامن التسجيل مع الأذونات الممنوحة فعلاً (يعمل عند التثبيت/التحديث/بدء المتصفح) */
  async function sync() {
    const kept = [];
    for (const o of await list()) { if (await chrome.permissions.contains({ origins: [pattern(o)] })) kept.push(o); }
    await chrome.storage.local.set({ [KEY]: kept });
    await register(kept);
    return kept;
  }

  async function isEnabledFor(tab) { const o = originOf(tab && tab.url); return !!o && (await list()).includes(o); }

  g.Site = { originOf, list, enable, disable, sync, isEnabledFor };
})(globalThis);
