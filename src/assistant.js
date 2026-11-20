'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- تعريف الحقول (بحسب خطوات المنظومة) ---------- */
const STEPS = [
  { title: 'الخطوة ١ — بيانات النزيل', fields: [
    { k: 'first_name', l: 'الاسم الأول', req: 1 }, { k: 'second_name', l: 'الاسم الثاني', req: 1 },
    { k: 'third_name', l: 'الاسم الثالث', req: 1 }, { k: 'fourth_name', l: 'الاسم الرابع' },
    { k: 'last_name', l: 'اللقب' }, { k: 'mother_name', l: 'اسم الأم الكامل', req: 1 },
    { k: 'id_number', l: 'رقم الجواز (مع الجواز فقط)', dir: 'ltr' }, { k: 'phone', l: 'رقم الهاتف (اختياري)', dir: 'ltr' },
    { k: 'birth_date', l: 'تاريخ الميلاد DD/MM/YYYY', req: 1, dir: 'ltr' }, { k: 'nationality', l: 'الجنسية (الدولة)', req: 1, select: 'country' }
  ] },
  { title: 'الخطوة ٢ — عنوان النزيل', fields: [
    { k: 'governorate', l: 'المحافظة', req: 1 }, { k: 'city', l: 'المدينة' }, { k: 'area', l: 'المنطقة أو الحي' },
    { k: 'neighborhood', l: 'المحلة' }, { k: 'street', l: 'الزقاق' }, { k: 'house', l: 'الدار' }, { k: 'landmark', l: 'أقرب نقطة دالة', full: 1 }
  ] },
  { title: 'الخطوة ٣ — بيانات الزيارة', fields: [
    { k: 'visit_reason', l: 'سبب الزيارة' }, { k: 'visit_duration', l: 'مدة الزيارة (أيام)', req: 1, dir: 'ltr' },
    { k: 'arrival_date', l: 'تاريخ الوصول DD/MM/YYYY', req: 1, dir: 'ltr' }
  ] }
];
const LABELS = {}; STEPS.forEach(s => s.fields.forEach(f => LABELS[f.k] = f.l.replace(/ DD.*/, '')));

const S = {
  images: [], data: {}, flags: {}, form: 'iraqi', idType: 'id', kind: '', country: null, prepared: null, ctrl: null,
  cfg: {
    url: 'http://localhost:11434', model: 'qwen3-vl:4b-instruct', reason: 'زياره', days: '1',
    autoNext: false, attach: true, autoFill: true, autoVisit: true, cloudAuto: true, autoRotate: true,
    provider: 'ollama', key: '', gmodel: 'gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-2.5-flash-lite, gemini-2.5-flash', geminiAck: true
  }
};

const todayStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); };
const setStatus = (m, c) => { const e = $('#status'); e.textContent = m || ''; e.className = c || ''; };

/* ---------- الإعدادات ---------- */
async function loadCfg() {
  const d = await chrome.storage.local.get('assistantCfg');
  Object.assign(S.cfg, d.assistantCfg || {});
  S.cfg.autoNext = false; // لا يضغط التالي تلقائياً أبداً
  $('#cUrl').value = S.cfg.url; $('#cModel').value = S.cfg.model; $('#cReason').value = S.cfg.reason; $('#cDays').value = S.cfg.days;
  $('#cProv').value = S.cfg.provider; $('#gKey').value = S.cfg.key || ''; $('#gModel').value = S.cfg.gmodel;
  provUI();
  $('#cAuto').checked = S.cfg.autoFill !== false;
  $('#cVisit').checked = S.cfg.autoVisit !== false;
  $('#cCloudAuto').checked = S.cfg.cloudAuto !== false;
  $('#cRotate').checked = S.cfg.autoRotate !== false;
}
function provUI() {
  const g = $('#cProv').value === 'gemini';
  $('#gBox').hidden = !g; $('#oBox').hidden = g;
  $('#privTxt').textContent = g ? '☁ المحرك الحالي Gemini: صور الوثائق تُدمج وتُرسل إلى Google تلقائياً فور رفعها.' : '🔒 كل التحليل يتم على جهازك عبر Ollama. لا تُرسل الصور أو الأسماء إلى أي خدمة خارجية.';
}
$('#cProv').addEventListener('change', () => {
  if ($('#cProv').value === 'gemini') S.cfg.geminiAck = true;
  provUI(); saveCfg();
});
const saveCfg = () => {
  S.cfg.url = $('#cUrl').value.trim() || 'http://localhost:11434'; S.cfg.model = $('#cModel').value.trim();
  S.cfg.reason = $('#cReason').value; S.cfg.days = $('#cDays').value;
  S.cfg.provider = $('#cProv').value; S.cfg.key = $('#gKey').value.trim(); S.cfg.gmodel = $('#gModel').value.trim() || 'gemini-3.1-flash-lite, gemini-2.5-flash-lite';
  S.cfg.autoFill = $('#cAuto').checked; S.cfg.autoVisit = $('#cVisit').checked; S.cfg.cloudAuto = $('#cCloudAuto').checked; S.cfg.autoRotate = $('#cRotate').checked;
  S.cfg.autoNext = false;
  chrome.storage.local.set({ assistantCfg: S.cfg });
};
['#gKey', '#gModel', '#cUrl', '#cModel', '#cReason', '#cDays'].forEach(s => $(s).addEventListener('input', saveCfg));
['#gKey', '#gModel', '#cUrl', '#cModel', '#cReason', '#cDays', '#cAuto', '#cVisit', '#cCloudAuto', '#cRotate'].forEach(s => $(s).addEventListener('change', saveCfg));
$('#cfgToggle').onclick = e => { const c = $('#cfg'); c.hidden = !c.hidden; e.target.textContent = c.hidden ? 'إظهار' : 'إخفاء'; };

$('#testBtn').onclick = async () => {
  saveCfg(); setStatus('جارٍ الاتصال...');
  try {
    if (S.cfg.provider === 'gemini') {
      if (!S.cfg.key) { setStatus('الصق مفتاح Gemini أولاً.', 'err'); return; }
      const m = await AI.listGeminiModels(S.cfg.key);
      $('#gmodels').innerHTML = m.map(x => '<option value="' + esc(x) + '">').join('');
      setStatus('متصل بـ Gemini ✔ المفتاح صالح. النماذج المتاحة لك: ' + m.slice(0, 12).join('، ') + (m.length > 12 ? '...' : ''), 'ok');
    } else {
      const m = await AI.listModels(S.cfg.url);
      $('#models').innerHTML = m.map(x => '<option value="' + esc(x) + '">').join('');
      setStatus(m.length ? 'متصل ✔ النماذج المنزّلة: ' + m.join('، ') : 'متصل، لكن لا توجد نماذج. نفّذ: ollama pull ' + S.cfg.model, m.length ? 'ok' : 'err');
    }
    $('#cfg').hidden = false;
  } catch (e) { setStatus(S.cfg.provider === 'gemini' ? e.message : 'تعذر الاتصال بـ Ollama. تأكد أنه يعمل (ollama serve) وأن العنوان صحيح.', 'err'); }
};

/* ---------- الصور: تصغير، ضبط الاتجاه، دمج (انظر imaging.js) ---------- */
const maxDim = () => S.cfg.provider === 'gemini' ? 1600 : 1280;
const aiCfg = () => ({ provider: S.cfg.provider, key: S.cfg.key, url: S.cfg.url, model: S.cfg.provider === 'gemini' ? S.cfg.gmodel : S.cfg.model });

/* يضبط اتجاه كل صورة (كشف بالذكاء الاصطناعي) ثم يدمجها في صورة مستقيمة واحدة. تُخزَّن النتيجة لعدم تكرار الطلب. */
async function prepareImages(ctrl) {
  const rotOn = S.cfg.autoRotate !== false;
  const sig = rotOn + '|' + S.images.map(i => i.dataUrl.length + ':' + i.dataUrl.slice(-48)).join('|');
  if (S.prepared && S.prepared.sig === sig) return S.prepared;
  let rotations = S.images.map(() => 0);
  if (rotOn) {
    setStatus('جارٍ ضبط اتجاه الصور...');
    const small = await Promise.all(S.images.map(i => HSImg.shrink(i.dataUrl, 640)));
    rotations = await AI.orient({ ...aiCfg(), images: small, signal: ctrl && ctrl.signal });
  }
  const upright = await Promise.all(S.images.map((im, i) => rotations[i] ? HSImg.rotate(im.dataUrl, rotations[i]) : im.dataUrl));
  const merged = await HSImg.merge(upright, maxDim());
  S.images.forEach((im, i) => { im.rot = rotations[i]; });
  renderThumbs();
  S.prepared = { sig, merged, rotations };
  return S.prepared;
}

async function addFiles(files) {
  let added = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    try { S.images.push({ name: f.name || 'image.jpg', dataUrl: await HSImg.fromFile(f, maxDim()), rot: 0 }); added++; }
    catch (e) { setStatus('تعذرت قراءة الصورة: ' + f.name, 'err'); }
  }
  renderThumbs();
  if (added && S.cfg.provider === 'gemini' && S.cfg.cloudAuto !== false) {
    if (!S.cfg.key) { setStatus('أدخل مفتاح Gemini في الإعدادات لتشغيل التحليل السحابي التلقائي.', 'err'); return; }
    if (S.ctrl) S.ctrl.abort();
    runAnalysis({ autoFillIfOpen: S.cfg.autoFill !== false });
  }
}
function renderThumbs() {
  $('#thumbs').innerHTML = S.images.map((im, i) => '<div class="thumb"><img src="' + im.dataUrl + '" alt=""' + (im.rot ? ' style="transform:rotate(' + im.rot + 'deg)' + (im.rot % 180 ? ';object-fit:contain' : '') + '"' : '') + '><button data-i="' + i + '" aria-label="حذف">×</button></div>').join('');
  $('#runBtn').disabled = !S.images.length;
}
$('#thumbs').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { S.images.splice(+b.dataset.i, 1); renderThumbs(); } };
const drop = $('#drop');
drop.onclick = () => $('#file').click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') $('#file').click(); };
$('#file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
document.addEventListener('paste', e => { const fs = [...(e.clipboardData.files || [])]; if (fs.length) addFiles(fs); });

/* ---------- التحليل ---------- */
async function isModalOpenInActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return false;
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.querySelector('[aria-labelledby="add-guest-modal"]')
    });
    return !!(r && r[0] && r[0].result);
  } catch (e) { return false; }
}

async function runAnalysis(opts = {}) {
  saveCfg();
  if (!S.images.length) return;
  if (S.cfg.provider === 'gemini' ? !S.cfg.key : !S.cfg.model) { setStatus(S.cfg.provider === 'gemini' ? 'الصق مفتاح Gemini من الإعدادات.' : 'اكتب اسم النموذج من الإعدادات.', 'err'); return; }
  const myCtrl = new AbortController();
  S.ctrl = myCtrl;
  $('#runBtn').disabled = true; $('#stopBtn').hidden = false; $('#prog').hidden = false;
  setStatus((S.cfg.provider === 'gemini' ? '☁ جارٍ التحليل السحابي عبر Gemini...' : 'جارٍ تحليل الوثائق محلياً...') +
    (S.images.length > 1 ? ' (تم دمج ' + S.images.length + ' صور معاً)' : ''));
  try {
    const prep = await prepareImages(myCtrl);
    if (S.ctrl !== myCtrl) return;
    setStatus((S.cfg.provider === 'gemini' ? '☁ جارٍ التحليل السحابي عبر Gemini...' : 'جارٍ تحليل الوثائق محلياً...') +
      (prep.rotations.some(x => x) ? ' (صُحّح اتجاه ' + prep.rotations.filter(x => x).length + ' صورة)' : ''));
    const raw = await AI.run({
      ...aiCfg(), images: [prep.merged], signal: myCtrl.signal,
      onProgress: n => setStatus('جارٍ التحليل... تم توليد ' + n + ' جزء')
    });
    if (S.ctrl !== myCtrl) return;
    const r = AI.normalize(raw);
    S.kind = r.kind; S.form = r.form; S.idType = r.idType; S.flags = r.flags; S.country = r.country;
    S.data = { ...r.fields, visit_reason: S.cfg.reason, visit_duration: S.cfg.days, arrival_date: todayStr() };
    renderForm(r.notes);
    if (opts.autoFillIfOpen && await isModalOpenInActiveTab()) {
      setStatus('اكتمل التحليل ✔ جارٍ تعبئة الخطوة الحالية للتدقيق...', 'ok');
      await fillCurrentStep();
      setStatus('تمت التعبئة ✔ دقّق البيانات ثم اضغط «التالي» في المنظومة.', 'ok');
    } else {
      setStatus('اكتمل التحليل ✔ راجع الحقول الملوّنة قبل التعبئة.', 'ok');
    }
  } catch (e) {
    if (S.ctrl !== myCtrl) return;
    setStatus(e.name === 'AbortError' ? 'تم الإيقاف.' : /fetch|Failed|NetworkError/i.test(e.message)
      ? 'تعذر الاتصال بـ Ollama. تأكد من تشغيله ثم اضغط «اختبار الاتصال» من الإعدادات.' : 'فشل التحليل: ' + e.message, 'err');
  } finally {
    if (S.ctrl === myCtrl) {
      $('#runBtn').disabled = !S.images.length; $('#stopBtn').hidden = true; $('#prog').hidden = true; S.ctrl = null;
    }
  }
}
$('#runBtn').onclick = () => runAnalysis({ autoFillIfOpen: false });
$('#stopBtn').onclick = () => S.ctrl && S.ctrl.abort();

/* ---------- نموذج المراجعة ---------- */
const KIND_NAMES = { iraqi_id: 'هوية عراقية', iraqi_passport: 'جواز عراقي', foreign_passport: 'جواز أجنبي', e_visa: 'تأشيرة إلكترونية', visa_sticker: 'ملصق تأشيرة', residence_card: 'بطاقة إقامة', travel_document: 'وثيقة سفر', driver_license: 'إجازة سوق', other: 'وثيقة أخرى' };

function fieldClass(k, def) {
  const v = S.data[k];
  if (S.flags[k] === 'bad') return 'bad';
  if (S.flags[k] === 'warn') return 'warn';
  if (S.flags[k] === 'auto') return 'auto';
  if (def.req && !String(v || '').trim()) return 'empty-req';
  return '';
}
function tagOf(k) {
  const f = S.flags[k];
  return f === 'bad' ? '<span class="tag bad">غير صالح</span>' : f === 'warn' ? '<span class="tag warn">راجعه</span>' : f === 'auto' ? '<span class="tag auto">NONE تلقائي</span>' : '';
}
function countrySelect(k, cls) {
  const cur = S.data[k] || '';
  return '<select data-k="' + k + '" class="' + cls + '"><option value="">— اختر الدولة —</option>' +
    Countries.list.map(c => '<option value="' + c.iso2 + '"' + (c.iso2 === cur ? ' selected' : '') + '>' + c.flag + ' ' + esc(c.ar) + ' (' + c.iso2 + ')</option>').join('') + '</select>';
}
function renderForm(notes) {
  $('#reviewSec').hidden = false; $('#foot').hidden = false;
  $('#kindTag').textContent = KIND_NAMES[S.kind] || 'وثيقة';
  $('#notes').innerHTML = (notes || []).map(n => '<div class="' + (/بنجاح/.test(n) ? 'ok' : /⚠|تضارب|يختلف|تعذر/.test(n) ? 'warn' : '') + '">' + esc(n) + '</div>').join('');
  let h = '<div class="grid2"><label class="f"><span>نوع الاستمارة</span><select id="selForm"><option value="iraqi">حاملي الجنسية العراقية</option><option value="foreign">أجنبي</option></select></label>' +
    '<label class="f"><span>نوع المستمسك</span><select id="selId"><option value="id">الهوية الشخصية</option><option value="passport">جواز سفر</option><option value="">— لا تغيّر —</option></select></label></div>';
  STEPS.forEach(st => {
    h += '<div class="stephead">' + st.title + '</div><div class="grid2">';
    st.fields.forEach(f => {
      h += '<label class="f' + (f.full ? ' full' : '') + '"><span>' + esc(f.l) + (f.req ? '<em>*</em>' : '') + tagOf(f.k) + '</span>' +
        (f.select === 'country' ? countrySelect(f.k, fieldClass(f.k, f)) :
          '<input type="text" data-k="' + f.k + '" class="' + fieldClass(f.k, f) + '"' + (f.dir ? ' dir="' + f.dir + '"' : '') + ' value="' + esc(S.data[f.k] || '') + '">') + '</label>';
    });
    h += '</div>';
  });
  h += '<label class="chk"><input type="checkbox" id="chkAttach" ' + (S.cfg.attach ? 'checked' : '') + '> إرفاق الصور الأصلية بالنموذج</label>' +
       '<p class="privacy">لا يتم الضغط على «التالي» أو زر الحفظ النهائي إطلاقاً. أنت من يدقّق وينتقل.</p>';
  $('#form').innerHTML = h;
  $('#selForm').value = S.form; $('#selId').value = S.idType;
}
$('#form').addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.k; if (!k) return;
  S.data[k] = e.target.value; delete S.flags[k];
  const def = STEPS.flatMap(s => s.fields).find(f => f.k === k);
  e.target.className = def && def.req && !e.target.value.trim() ? 'empty-req' : '';
  if (k === 'nationality') {
    // تغيير الدولة يدوياً يحدّث بيانات المطابقة ونوع الاستمارة (عراقي/أجنبي)
    const c = Countries.byIso2(e.target.value);
    S.country = c ? { ...c, words: Countries.words(c.iso2) } : null;
    if (c) { S.form = c.iso2 === 'IQ' ? 'iraqi' : 'foreign'; $('#selForm').value = S.form; }
  }
});
$('#form').addEventListener('change', e => {
  if (e.target.id === 'selForm') S.form = e.target.value;
  if (e.target.id === 'selId') S.idType = e.target.value;
  if (e.target.id === 'chkAttach') S.cfg.attach = e.target.checked;
  chrome.storage.local.set({ assistantCfg: S.cfg });
});

$('#newBtn').onclick = () => {
  if (S.ctrl) S.ctrl.abort();
  S.images = []; S.data = {}; S.flags = {}; S.country = null; S.prepared = null; renderThumbs();
  $('#reviewSec').hidden = true; $('#reportSec').hidden = true; $('#foot').hidden = true; setStatus('');
};

/* ---------- التعبئة داخل صفحة المنظومة (الخطوة الحالية فقط) ---------- */
async function fillCurrentStep() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const btn = $('#fillStep'); btn.disabled = true;
  // تُرفق الصور الأصلية كما رُفعت (كل صورة منفصلة)؛ الصورة المدموجة تذهب للذكاء الاصطناعي فقط
  const attachImages = S.cfg.attach ? S.images.map(i => ({ name: i.name, dataUrl: i.dataUrl })) : [];
  const payload = {
    form: S.form, idType: S.idType, data: S.data, flags: S.flags, labels: LABELS, country: S.country,
    images: attachImages
  };
  let out;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['filler.js'] });
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (P, O) => globalThis.__hsFill(P, O),
      args: [payload, { mode: 'step', autoNext: false }]
    });
    out = r && r[0] && r[0].result;
  } catch (e) { out = { error: 'تعذر الوصول لصفحة المنظومة: ' + e.message }; }
  btn.disabled = false;
  const box = $('#report'); $('#reportSec').hidden = false;
  if (!out || out.error) { box.innerHTML = '<span class="badc">' + esc((out && out.error) || 'لا نتيجة') + '</span>'; return; }
  box.innerHTML =
    (out.filled.length ? '<b class="okc">تمت تعبئة (' + out.filled.length + '):</b>' + esc(out.filled.join('، ')) : '') +
    (out.missing && out.missing.length ? '<b class="badc">حقول مطلوبة فارغة:</b>' + esc(out.missing.join('، ')) : '') +
    (out.failed.length ? '<b class="badc">تحتاج تدخلك:</b>' + out.failed.map(esc).join('<br>') : '') +
    (out.notes.length ? '<b>ملاحظات:</b>' + out.notes.map(esc).join('<br>') : '') +
    '<b>الموقع الآن:</b>' + esc(out.at);
}
$('#fillStep').onclick = () => fillCurrentStep();


/* ---------- تفعيل الإضافة على موقع المنظومة فقط (أقل صلاحيات) ---------- */
async function refreshSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = Site.originOf(tab && tab.url), on = await Site.list();
  const here = !!origin && on.includes(origin);
  $('#siteBox').classList.toggle('on', here);
  $('#siteTxt').textContent = here ? '✅ مفعّلة على: ' + origin : (on.length ? '🔐 مفعّلة على موقع آخر: ' + on.join('، ') : '🔐 الإضافة غير مفعّلة على موقع المنظومة.');
  $('#siteBtn').hidden = here;
  $('#siteOff').hidden = !here;
  return { tab, origin };
}
$('#siteBtn').onclick = async () => {
  const { tab } = await refreshSite();
  try { await Site.enable(tab); setStatus('تم التفعيل. حدّث صفحة المنظومة إن لم تعمل التعبئة فوراً.', 'ok'); }
  catch (e) { setStatus(e.message, 'err'); }
  refreshSite();
};
$('#siteOff').onclick = async () => { const { origin } = await refreshSite(); if (origin) await Site.disable(origin); refreshSite(); };
chrome.tabs.onActivated.addListener(() => refreshSite());
chrome.tabs.onUpdated.addListener((id, ch) => { if (ch.url || ch.status === 'complete') refreshSite(); });
refreshSite();

/* ---------- بدء ---------- */
loadCfg();
