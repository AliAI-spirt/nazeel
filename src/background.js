/* خدمة الخلفية: تنفذ طلبات الذكاء (Ollama أو Gemini) لصالح صفحة المنظومة */
importScripts('countries.js', 'ai.js', 'site.js');

/* إعادة مزامنة المواقع المفعّلة عند التثبيت/التحديث/بدء المتصفح */
chrome.runtime.onInstalled.addListener(() => { Site.sync().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { Site.sync().catch(() => {}); });
// يفتح اللوحة الجانبية عند الحاجة من الأيقونة دون إذن إضافي


function friendly(e, provider) {
  const m = String(e && e.message || e);
  if (e && e.name === 'AbortError') return 'أُلغي التحليل.';
  if (/Failed to fetch|NetworkError|fetch/i.test(m)) {
    return provider === 'gemini'
      ? 'تعذر الاتصال بخدمة Gemini السحابية. تحقق من اتصال الإنترنت أو صلاحية المفتاح.'
      : 'تعذر الاتصال بـ Ollama (المحرك الحالي: محلي). شغّل Ollama أو اختر Google Gemini من إعدادات مساعد الإدخال.';
  }
  return m;
}

/* يدمج الإعدادات المحفوظة (assistantCfg) مع ما أرسلته الصفحة ويحدد النموذج حسب المحرك */
async function buildCfg(sent) {
  const stored = (await chrome.storage.local.get('assistantCfg')).assistantCfg || {};
  const provider = stored.provider || (sent && sent.provider) || 'ollama';
  return {
    ...(sent || {}), ...stored, provider,
    model: provider === 'gemini'
      ? (stored.gmodel || (sent && sent.model) || 'gemini-2.5-flash-lite, gemini-2.5-flash')
      : (stored.model || (sent && sent.model) || 'qwen3-vl:4b-instruct')
  };
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ai') return;
  const ctrl = new AbortController();
  // تحميل النموذج لأول مرة قد يستغرق أكثر من 30 ثانية قبل أول بايت، فنُبقي الخدمة حيّة
  const keep = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  const stop = () => clearInterval(keep);
  const send = msg => { try { port.postMessage(msg); } catch (e) { /* port closed */ } };
  port.onDisconnect.addListener(() => { ctrl.abort(); stop(); });

  port.onMessage.addListener(async m => {
    /* 1) كشف اتجاه الصور (سريع وغير حرج: أي فشل = بلا تدوير) */
    if (m.type === 'orient') {
      let rotations = (m.images || []).map(() => 0);
      try { rotations = await AI.orient({ ...(await buildCfg(m.cfg)), images: m.images, signal: ctrl.signal }); } catch (e) { /* تجاهل */ }
      send({ type: 'oriented', rotations });
      return;
    }
    /* 2) قراءة الوثيقة */
    if (m.type !== 'extract') return;
    let provider = (m.cfg && m.cfg.provider) || 'ollama';
    try {
      const runCfg = await buildCfg(m.cfg);
      provider = runCfg.provider;
      const raw = await AI.run({ ...runCfg, images: m.images, signal: ctrl.signal, onProgress: n => send({ type: 'progress', n }) });
      send({ type: 'done', result: AI.normalize(raw) });
    } catch (e) {
      send({ type: 'error', message: friendly(e, provider) });
    } finally { stop(); }
  });
});
