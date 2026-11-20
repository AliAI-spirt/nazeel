/* يعمل داخل صفحة المنظومة: يلتقط رفع الصور في نافذة «اضافة نزيل» ويدمجها ويعبّي الخطوة الحالية للتدقيق */
(function () {
  'use strict';
  if (!/Iraq Hotels System/i.test(document.title)) return;

  const DEF = {
    url: 'http://localhost:11434', model: 'qwen3-vl:4b-instruct',
    provider: 'ollama', key: '', gmodel: 'gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-2.5-flash-lite, gemini-2.5-flash',
    geminiAck: true, cloudAuto: true, reason: 'زياره', days: '1', autoFill: true, autoVisit: true, autoRotate: true
  };
  let cfg = { ...DEF };
  const loadCfg = async () => {
    try {
      const d = await chrome.storage.local.get('assistantCfg');
      cfg = { ...DEF, ...(d.assistantCfg || {}) };
    } catch (e) { /* ignore */ }
    return cfg;
  };
  loadCfg();
  chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.assistantCfg) cfg = { ...DEF, ...(c.assistantCfg.newValue || {}) }; });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const modalEl = () => document.querySelector('[aria-labelledby="add-guest-modal"]');
  const stepOf = () => { const m = modalEl(); return !m ? 0 : m.querySelector('#first-name') ? 1 : m.querySelector('#governorate') ? 2 : m.querySelector('#visit-duration') ? 3 : 0; };
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); };

  /* ---------- إشعار صغير فوق الصفحة ---------- */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;bottom:18px;left:50%;transform:translateX(-50%);pointer-events:none;max-width:min(560px,92vw)';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = '<style>.t{font:13px/1.7 "Segoe UI",Tahoma,sans-serif;direction:rtl;color:#fff;background:#14213d;border:1px solid #b8832a;border-right:5px solid #b8832a;border-radius:8px;padding:9px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none}.t.ok{border-right-color:#1f7a5a}.t.err{border-right-color:#b4452c;background:#4a1d12}.t b{color:#f3d9a0}.t small{display:block;color:#c9d2e6;font-size:11.5px}</style><div class="t" id="t" role="status"></div>';
  document.documentElement.appendChild(host);
  let hideT;
  function toast(html, kind, ms) {
    const t = sh.getElementById('t'); t.innerHTML = html; t.className = 't ' + (kind || ''); t.style.display = 'block';
    clearTimeout(hideT); if (ms) hideT = setTimeout(() => { t.style.display = 'none'; }, ms);
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /* ---------- الحالة ---------- */
  let session = 0, port = null, pending = null, done = new Set(), filling = false;

  function summary(out, first) {
    if (out.error) { toast('⚠ ' + esc(out.error), 'err', 8000); return; }
    let h = '✔ <b>تمت تعبئة ' + out.filled.length + ' حقلاً</b> — دقّق الحقول ثم اضغط «التالي»';
    if (out.missing.length) h += '<small>🔴 أكمل يدوياً: ' + esc(out.missing.join('، ')) + '</small>';
    if (out.failed.length) h += '<small>⚠ ' + esc(out.failed.join(' | ')) + '</small>';
    if (out.notes && out.notes.length) h += '<small>' + esc(out.notes.join(' • ')) + '</small>';
    if (first && pending && pending.notes.length) h += '<small>' + esc(pending.notes.join(' • ')) + '</small>';
    if (first) h += '<small>عند انتقالك إلى الخطوة التالية ستُعبّأ تلقائياً للتدقيق.</small>';
    toast(h, out.failed.length || out.missing.length ? '' : 'ok', 12000);
  }

  async function onFiles(files, input) {
    await loadCfg();
    if (!cfg.autoFill) return;
    if (cfg.provider === 'gemini' && !cfg.key) {
      toast('⚠ أدخل مفتاح Gemini في إعدادات اللوحة الجانبية (أيقونة الإضافة ← مساعد الإدخال).', 'err', 9000);
      return;
    }
    const my = ++session;
    if (port) { try { port.disconnect(); } catch (e) { /* ignore */ } port = null; }
    const maxDim = cfg.provider === 'gemini' ? 1600 : 1280;
    toast((cfg.provider === 'gemini' ? '☁ جارٍ قراءة الوثيقة عبر Gemini...' : '📄 جارٍ قراءة الوثيقة بالذكاء المحلي...') +
      (files.length > 1 ? '<small>يتم دمج ' + files.length + ' صور وإرسالها معاً...</small>' : ''), '', 0);

    const resized = [];
    for (const f of files) { try { resized.push(await HSImg.fromFile(f, maxDim)); } catch (e) { /* صورة تالفة */ } }
    if (!resized.length) { toast('⚠ تعذرت قراءة الصور المرفوعة.', 'err', 6000); return; }

    try { port = chrome.runtime.connect({ name: 'ai' }); } catch (e) { toast('⚠ حُدّثت الإضافة. أعد تحميل صفحة المنظومة (F5).', 'err', 8000); return; }
    const p = port;
    let onOriented = null;
    p.onMessage.addListener(async m => {
      if (my !== session) return;
      if (m.type === 'oriented') { if (onOriented) onOriented(m.rotations); }
      else if (m.type === 'progress') toast('📄 جارٍ التحليل... <small>' + m.n + ' جزء</small>', '', 0);
      else if (m.type === 'error') toast('⚠ ' + esc(m.message), 'err', 10000);
      else if (m.type === 'done') await apply(m.result, attachFiles, my);
    });
    const sendCfg = { provider: cfg.provider, url: cfg.url, model: cfg.provider === 'gemini' ? cfg.gmodel : cfg.model, key: cfg.key };

    /* 1) ضبط اتجاه الصور المقلوبة (اختياري وغير حرج) */
    let rotations = resized.map(() => 0);
    if (cfg.autoRotate !== false) {
      try {
        const small = await Promise.all(resized.map(u => HSImg.shrink(u, 640)));
        rotations = await new Promise(res => {
          const t = setTimeout(() => res(resized.map(() => 0)), 30000);
          onOriented = r => { clearTimeout(t); res(r); };
          p.postMessage({ type: 'orient', images: small, cfg: sendCfg });
        });
      } catch (e) { /* بلا تدوير */ }
      if (my !== session) return;
    }

    /* 2) تدوير ثم دمج للذكاء الاصطناعي فقط؛ الملفات المرفوعة في الحقل تبقى كما هي دون أي تعديل */
    let sendImages = resized;
    const attachFiles = files;
    const rotated = rotations.some(r => r);
    if (rotated || resized.length > 1) {
      try {
        const upright = await Promise.all(resized.map((u, i) => rotations[i] ? HSImg.rotate(u, rotations[i]) : u));
        sendImages = [await HSImg.merge(upright, maxDim)];
        if (rotated) toast('🔄 صُحّح اتجاه ' + rotations.filter(r => r).length + ' صورة مقلوبة. جارٍ القراءة...', '', 0);
      } catch (e) { /* عند تعذر الدمج تُرسل الصور كما هي */ }
    }
    p.postMessage({ type: 'extract', images: sendImages, cfg: sendCfg });
  }

  async function apply(r, files, my) {
    if (my !== session || !modalEl()) return;
    pending = {
      form: r.form, idType: r.idType, flags: r.flags, notes: r.notes, country: r.country,
      data: { ...r.fields, visit_reason: cfg.reason, visit_duration: cfg.days, arrival_date: today() },
      reattach: { files }
    };
    done = new Set([1]);
    filling = true;
    toast('✍ جارٍ تعبئة الخطوة ١ للتدقيق...', '', 0);
    try {
      // لا يضغط التالي تلقائياً — يعبّي الخطوة الحالية فقط لتدقق أنت وتضغط التالي
      summary(await globalThis.__hsFill(pending, { mode: 'step', autoNext: false }), true);
    } catch (e) {
      toast('⚠ تعذرت التعبئة: ' + esc(e.message), 'err', 8000);
    }
    filling = false;
  }

  /* ---------- التقاط رفع الملفات داخل نافذة إضافة نزيل ---------- */
  document.addEventListener('change', e => {
    const t = e.target;
    if (globalThis.__hsIgnoreChange || !(t instanceof HTMLInputElement) || t.type !== 'file') return;
    if (!t.closest('[aria-labelledby="add-guest-modal"]')) return;
    const all = [...(t.files || [])], imgs = all.filter(f => f.type.startsWith('image/'));
    if (!all.length) return;
    if (!imgs.length) { toast('الملفات المرفوعة ليست صوراً، لا يمكن قراءتها تلقائياً. ارفع صورة الهوية أو الجواز.', 'err', 6000); return; }
    onFiles(imgs, t);
  }, true);

  /* ---------- تعبئة الخطوتين 2 و3 عند الوصول إليهما يدوياً ---------- */
  let timer, gone;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      // النافذة قد تختفي لحظة عند تبديل نوع الاستمارة: لا نُلغي الجلسة إلا إذا غابت فعلاً
      if (!modalEl()) {
        clearTimeout(gone);
        gone = setTimeout(() => { if (!modalEl()) { pending = null; done = new Set(); session++; } }, 2000);
        return;
      }
      clearTimeout(gone);
      if (!pending || filling) return;
      const s = stepOf();
      if (s < 2 || done.has(s)) return;
      if (s === 3 && !cfg.autoVisit) return;
      done.add(s); filling = true;
      await sleep(350);
      try { summary(await globalThis.__hsFill(pending, { mode: 'step', autoNext: false }), false); } catch (e) { /* ignore */ }
      filling = false;
    }, 250);
  }).observe(document.body, { childList: true, subtree: true });
})();
