/* محرك تعبئة نموذج «اضافة نزيل» — يُحمَّل داخل صفحة المنظومة (content script) */
globalThis.__hsFill = async function (P, O) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const modal = () => document.querySelector('[aria-labelledby="add-guest-modal"]');
  if (!modal()) return { error: 'نافذة «اضافة نزيل» غير مفتوحة. اضغط «اضافة نزيل» في المنظومة أولاً.' };

  const out = { filled: [], failed: [], missing: [], notes: [], filledSteps: [], at: '' };
  const LBL = {
    first_name: 'الاسم الأول', second_name: 'الاسم الثاني', third_name: 'الاسم الثالث', fourth_name: 'الاسم الرابع', last_name: 'اللقب',
    mother_name: 'اسم الأم الكامل', id_number: 'رقم المستمسك', phone: 'رقم الهاتف', birth_date: 'تاريخ الميلاد', governorate: 'المحافظة',
    city: 'المدينة', area: 'المنطقة', neighborhood: 'المحلة', street: 'الزقاق', house: 'الدار', landmark: 'أقرب نقطة دالة',
    visit_reason: 'سبب الزيارة', visit_duration: 'مدة الزيارة', arrival_date: 'تاريخ الوصول', nationality: 'الجنسية'
  };
  const L = k => (P.labels && P.labels[k]) || LBL[k] || k;
  // النافذة قد تُعاد بناؤها لحظياً عند تبديل نوع الاستمارة: لا نفترض وجودها دائماً
  const root = () => modal() || document;
  const $m = s => root().querySelector(s);
  const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = fn(); } catch (e) { /* ignore */ } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(150); } };
  const COL = { ok: '#1f7a5a', warn: '#d9a63a', miss: '#b4452c' };
  const flagged = k => P.flags && ['warn', 'bad', 'auto'].includes(P.flags[k]);

  function mark(el, level) {
    const w = el.closest('.MuiFormControl-root') || el;
    w.style.outline = '2px solid ' + COL[level]; w.style.outlineOffset = '2px'; w.style.borderRadius = '4px';
    const clear = () => { w.style.outline = ''; };
    el.addEventListener('input', clear, { once: true });
    if (el.getAttribute && el.getAttribute('role') === 'button') el.addEventListener('click', clear, { once: true });
  }
  const nativeSet = (el, v) => {
      const protos = {
        INPUT: HTMLInputElement.prototype,
        TEXTAREA: HTMLTextAreaElement.prototype,
        SELECT: HTMLSelectElement.prototype
      };
      const proto = el && protos[el.tagName];
      if (!proto) return false;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
  // إغلاق القائمة المفتوحة دون الضغط على Escape: Escape يُغلق نافذة «اضافة نزيل» كلها!
  const closeList = async el => {
    if (!document.querySelector('[role="listbox"]')) return;
    if (el && el.blur) el.blur();
    await sleep(200);
    if (!document.querySelector('[role="listbox"]')) return;
    const root = el && el.closest && el.closest('.MuiAutocomplete-root');
    const ind = root && root.querySelector('.MuiAutocomplete-popupIndicator');
    if (ind) { ind.click(); await sleep(200); return; }
    const bd = document.querySelector('.MuiPopover-root .MuiBackdrop-root, .MuiMenu-root .MuiBackdrop-root');
    if (bd) bd.click();
  };
  const options = () => [...document.querySelectorAll('[role="listbox"] [role="option"]')];

  async function text(id, key) {
    const v = (P.data[key] || '').trim(); if (!v) return;
    const el = $m('#' + id);
    if (!el) { out.failed.push(L(key) + ': الحقل غير موجود'); return; }
    el.focus(); nativeSet(el, v); await sleep(50);
    if (el.value === v) { out.filled.push(L(key)); mark(el, flagged(key) ? 'warn' : 'ok'); }
    else out.failed.push(L(key) + ': لم يُقبل، أدخله يدوياً');
  }
  async function date(key) {
    const v = (P.data[key] || '').trim(); if (!v) return;
    const el = $m('input[placeholder="DD/MM/YYYY"]');
    if (!el) { out.failed.push(L(key) + ': حقل التاريخ غير موجود'); return; }
    el.focus(); nativeSet(el, v); await sleep(150);
    if (el.value !== v) {
      nativeSet(el, ''); await sleep(60); let cur = '';
      for (const ch of v) { cur += ch; nativeSet(el, cur); await sleep(30); }
      await sleep(120);
    }
    if (el.value.replace(/\D/g, '') === v.replace(/\D/g, '')) { out.filled.push(L(key)); mark(el, flagged(key) ? 'warn' : 'ok'); }
    else out.failed.push(L(key) + ': اكتبه يدوياً');
  }
  const nrm = x => String(x || '').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLowerCase().replace(/&/g, ' and ').replace(/\bst\./g, 'saint ').replace(/\bthe\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const nrm2 = x => nrm(x).split(' ').map(w => w.replace(/^ال(?=.{2})/, '')).join(' ');  // يتجاهل «ال» التعريف

  async function select(id, words, name) {
    const btn = $m('[role="button"][id="' + id + '"], [role="combobox"][id="' + id + '"]');
    if (!btn) { out.failed.push(name + ': غير موجود'); return; }
    // مطابقة مُطبَّعة (تتجاهل «ال» والهمزات): «الاجانب و الوافدين» تطابق «اجانب»
    const ws = words.map(w => nrm2(w));
    const has = t => { const n = nrm2(t); return ws.some(w => n.includes(w)); };
    if (has(btn.textContent)) return;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await sleep(350);
    const hit = options().find(o => has(o.textContent));
    if (hit) { hit.click(); await sleep(600); out.filled.push(name); mark(btn, 'ok'); }
    else { out.failed.push(name + ': لم أجد الخيار المناسب' + (options().length ? ' (المتاح: ' + options().map(o => o.textContent.trim()).join('، ') + ')' : '')); await closeList(btn); await sleep(300); }
  }
  /* ---------- قوائم البحث (MUI Autocomplete): نفتح القائمة كاملة ونختار الأقرب، ولا نعتمد على ترشيح النص المكتوب ---------- */
  const tset = x => nrm2(x).split(' ').filter(Boolean).sort().join(' ');   // «Korea, North» = «North Korea»
  function bestOption(opts, words, iso2) {
    const ws = words.map(nrm2).filter(Boolean), wsets = words.map(tset).filter(Boolean), code = String(iso2 || '').toLowerCase();
    const score = o => {
      const raw = o.textContent, t = nrm2(raw), dv = String(o.getAttribute('data-value') || o.getAttribute('value') || '').toLowerCase();
      if (!t) return 0;
      if (code && dv === code) return 100;
      // خيارات المنظومة بصيغة «English - العربية»: نقارن كل جزء على حدة
      const parts = raw.split(/\s+-\s+/).map(x => x.trim()).filter(Boolean);
      if (parts.some(p => wsets.includes(tset(p)))) return 95;
      if (ws.includes(t)) return 90;
      if (code && (' ' + t + ' ').includes(' ' + code + ' ')) return 80;
      const pt = ' ' + t + ' ';
      // الدول: لا مطابقة جزئية معاكسة (حتى لا يُختار «Congo» لدولة «Congo - Kinshasa»)؛ المحافظات: مسموحة
      if (ws.some(w => w.length > 2 && (pt.includes(' ' + w + ' ') || (!code && t.length > 2 && (' ' + w + ' ').includes(pt))))) return 50;
      return 0;
    };
    let best = null, bs = 0;
    opts.forEach(o => { const sc = score(o); if (sc > bs) { best = o; bs = sc; } });
    return best;
  }
  // خيارات هذا الحقل فقط: المعرّف الموثوق هو aria-controls الذي يضعه MUI على حقل الإدخال
  // فور فتح القائمة (معيار ARIA ثابت) — لا نخمّن أن القائمة = "<id الحقل>-listbox" لأن
  // MUI لا يضمن هذه الصيغة دائماً، وإن أخطأنا التخمين نحصل على صفر خيارات دائماً دون أي رسالة فشل واضحة.
  const acOptions = el => {
    const want = (el && el.getAttribute && el.getAttribute('aria-controls')) || (el && el.id ? el.id + '-listbox' : '');
    const lb = want && document.getElementById(want);
    if (lb) return [...lb.querySelectorAll('[role="option"]')];
    // لا توجد قائمة بمعرّف يخص هذا الحقل تحديداً: إن لم تكن هناك أي قائمة "-listbox" في الصفحة أصلاً
    // (نظام لا يتبع تسمية MUI المعتادة) جرّب الملتقط العام؛ وإلا لا تلتقط قائمة قد تخص حقلاً آخر.
    return document.querySelector('[id$="-listbox"]') ? [] : options();
  };
  async function openAutocomplete(el) {
    const root = el.closest('.MuiAutocomplete-root') || el.parentElement;
    const ind = root && root.querySelector('.MuiAutocomplete-popupIndicator');
    el.focus();
    for (const how of ['indicator', 'mousedown', 'arrow']) {
      if (acOptions(el).length || el.getAttribute('aria-expanded') === 'true') break;
      if (how === 'indicator' && ind) ind.click();
      else if (how === 'mousedown') el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      else if (how === 'arrow') el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      // ننتظر فتح القائمة فعلياً بدل نوم ثابت قد يكون أقصر من زمن التصيير
      await waitFor(() => acOptions(el).length || el.getAttribute('aria-expanded') === 'true', 1200);
    }
    return acOptions(el);
  }
  async function autocompletePick(el, words, iso2, queries) {
    await waitFor(() => !document.querySelector('.MuiPopover-root [role="listbox"], .MuiMenu-root [role="listbox"]'), 1500);  // نتأكد أن قائمة سابقة أُغلقت
    let opts = await openAutocomplete(el), hit = opts.length ? bestOption(opts, words, iso2) : null;
    const seen = opts.slice(0, 8).map(o => o.textContent.trim()).filter(Boolean), total = opts.length;
    if (!hit) {                       // نجرّب الترشيح بالكتابة (كلمة قصيرة أولاً)
      for (const q of queries) {
        if (!q) continue;
        el.focus(); nativeSet(el, q); await sleep(500);
        opts = acOptions(el); hit = opts.length ? bestOption(opts, words, iso2) : null;
        if (hit) break;
      }
    }
    if (hit) {
      hit.click(); await sleep(350);
      if (el.value) return { ok: true };
    }
    const shown = seen.length ? seen.concat(total > seen.length ? ['… (' + total + ' خياراً)'] : []) : options().slice(0, 6).map(o => o.textContent.trim()).filter(Boolean);
    if (el.value && !hit) nativeSet(el, '');
    await closeList(el); await sleep(250);
    return { ok: false, shown };
  }

  /* مرادفات المحافظات/المدن العراقية ← اسم الخيار في القائمة */
  const GOV = {
    'ذي قار': 'دي قار', 'ذى قار': 'دي قار', 'الناصريه': 'دي قار', 'الناصرية': 'دي قار', 'السليمانيه': 'سليمانية', 'السليمانية': 'سليمانية',
    'الديوانيه': 'القادسية', 'الديوانية': 'القادسية', 'السماوه': 'المثنى', 'السماوة': 'المثنى', 'الموصل': 'نينوى', 'الحله': 'بابل', 'الحلة': 'بابل',
    'العماره': 'ميسان', 'العمارة': 'ميسان', 'الكوت': 'واسط', 'الرمادي': 'الانبار', 'الفلوجه': 'الانبار', 'الفلوجة': 'الانبار', 'تكريت': 'صلاح الدين',
    'سامراء': 'صلاح الدين', 'بعقوبه': 'ديالى', 'بعقوبة': 'ديالى', 'هولير': 'اربيل', 'أربيل': 'اربيل', 'النجف الاشرف': 'النجف', 'النجف الأشرف': 'النجف',
    'كربلاء المقدسه': 'كربلاء', 'كربلاء المقدسة': 'كربلاء', 'البصره': 'البصرة'
  };
  const govWords = v => {
    const base = String(v || '').replace(/^\s*(محافظه|محافظة)\s+/, '').trim();
    const mapped = GOV[base] || GOV[base.replace(/\s+/g, ' ')] || '';
    return [base, mapped].filter(Boolean);
  };

  async function auto(id, key) {
    const v = (P.data[key] || '').trim(); if (!v) return;
    const el = $m('#' + id); if (!el) { out.failed.push(L(key) + ': غير موجود'); return; }
    const words = key === 'governorate' ? govWords(v) : [v];
    const name = L(key);

    // هذا الحقل قد يكون <select> أصلياً من المتصفح وليس MUI Autocomplete (شوهد مع المحافظة):
    // قائمة المتصفح الافتراضية لا تحتوي role="option" فلا يلتقطها autocompletePick إطلاقاً.
    if (el.tagName === 'SELECT') {
      const o = [...el.options].find(x => bestOption([x], words, ''));
      if (o) { nativeSet(el, o.value); out.filled.push(name + ': ' + o.textContent.trim()); mark(el, flagged(key) ? 'warn' : 'ok'); }
      else out.failed.push(name + ': لم أجد «' + v + '» في القائمة (من الخيارات: ' +
        [...el.options].map(x => x.textContent.trim()).filter(Boolean).slice(0, 12).join('، ') + ')، اخترها يدوياً');
      return;
    }
    // أو قائمة بنمط MUI Select/Menu: زر role="button"/"combobox" يفتح قائمة role="option" عند mousedown
    const role = el.getAttribute && el.getAttribute('role');
    if (role === 'button' || (role === 'combobox' && el.tagName !== 'INPUT')) {
      const cur = nrm2(el.textContent);
      if (words.map(nrm2).some(w => w && cur.includes(w))) { out.filled.push(name + ': ' + el.textContent.trim()); return; }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await sleep(350);
      const hit = bestOption(options(), words, '');
      if (hit) { hit.click(); await sleep(400); out.filled.push(name + ': ' + hit.textContent.trim()); mark(el, flagged(key) ? 'warn' : 'ok'); }
      else {
        out.failed.push(name + ': لم أجد «' + v + '» في القائمة' + (options().length ? ' (المتاح: ' + options().map(o => o.textContent.trim()).join('، ') + ')' : '') + '، اخترها يدوياً');
        await closeList(el); await sleep(300);
      }
      return;
    }

    // وإلا: حقل بحث (MUI Autocomplete) كما كان سابقاً
    const r = await autocompletePick(el, words, '', [words[words.length - 1], words[0].split(' ')[0]]);
    if (r.ok) { out.filled.push(name + ': ' + el.value); mark(el, flagged(key) ? 'warn' : 'ok'); }
    else out.failed.push(name + ': لم أجد «' + v + '» في القائمة' + (r.shown && r.shown.length ? ' (من الخيارات: ' + r.shown.join('، ') + ')' : '') + '، اخترها يدوياً');
  }
  function setFiles(files) {
    const inp = $m('input[type="file"]'); if (!inp) return false;
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    inp.files = dt.files;
    globalThis.__hsIgnoreChange = true;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { globalThis.__hsIgnoreChange = false; }, 0);
    return true;
  }
  function attachImages() {
    if (!P.images || !P.images.length) return;
    const files = P.images.map((im, i) => {
      const b = atob(im.dataUrl.split(',')[1]), u = new Uint8Array(b.length);
      for (let j = 0; j < b.length; j++) u[j] = b.charCodeAt(j);
      return new File([u], im.name || ('doc' + (i + 1) + '.jpg'), { type: 'image/jpeg' });
    });
    if (setFiles(files)) out.filled.push('صور الوثائق (' + files.length + ')'); else out.failed.push('إرفاق الصور: الحقل غير موجود');
  }
  function restoreFiles() {
    if (!P.reattach || !P.reattach.files || !P.reattach.files.length) return;
    const inp = $m('input[type="file"]');
    if (inp && inp.files.length === 0) { setFiles(P.reattach.files); out.notes.push('أُعيد إرفاق الصور بعد تغيير نوع الاستمارة.'); }
  }

  /* ---------- الجنسية / الدولة: قائمة منسدلة أو حقل بحث، بمطابقة الاسم العربي والإنجليزي والرمز ---------- */
  function findNationalityControl() {
      const m = root();
      const CTRL = 'input:not([type="file"]):not([type="hidden"]), select, [role="button"], [role="combobox"]';
      const pick = sel => [...m.querySelectorAll(sel)].find(e => e.matches(CTRL) && !e.classList.contains('MuiSelect-nativeInput'));
      let el = pick('#nationality, #country, #citizenship') || pick('[id*="nationality" i], [name*="nationality" i], [id*="country" i]');
      if (!el) {
        const lab = [...m.querySelectorAll('label')].find(l => /الجنسي|الدولة|nationality|country/i.test(l.textContent));
        if (lab) {
          const fid = lab.getAttribute('for');
          const byFor = fid && m.querySelector('#' + CSS.escape(fid));
          const box = lab.closest('.MuiFormControl-root') || lab.parentElement || m;
          el = (byFor && byFor.matches(CTRL) && byFor) || box.querySelector('[role="button"], [role="combobox"], select, input:not([type="file"]):not([type="hidden"])');
        }
      }
      return el || null;
    }
  async function nationality() {
    const c = P.country;
    if (!c || !c.iso2) return;
    let el = findNationalityControl();
    for (let i = 0; !el && i < 8 && P.form === 'foreign'; i++) { await sleep(250); el = findNationalityControl(); }  // يظهر بعد تبديل الاستمارة
    if (!el) return; // الاستمارة لا تحتوي حقل جنسية: لا مشكلة
    const name = L('nationality'), words = [c.ar, c.en, ...(c.words || [])], tag = el.tagName;
    if (tag === 'SELECT') {
      const o = [...el.options].find(x => bestOption([x], words, c.iso2));
      if (o) { nativeSet(el, o.value); out.filled.push(name + ': ' + c.ar); mark(el, flagged('nationality') ? 'warn' : 'ok'); }
      else out.failed.push(name + ': لم أجد «' + c.ar + '» في القائمة، اخترها يدوياً');
      return;
    }
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'combobox' && tag !== 'INPUT') {
      const cur = nrm(el.textContent);
      if (words.map(nrm).includes(cur)) { out.filled.push(name + ': ' + c.ar); return; }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await sleep(400);
      const hit = bestOption(options(), words, c.iso2);
      if (hit) { hit.click(); await sleep(400); out.filled.push(name + ': ' + c.ar); mark(el, flagged('nationality') ? 'warn' : 'ok'); }
      else { out.failed.push(name + ': لم أجد «' + c.ar + '» في القائمة' + (options().length ? ' (متاح ' + options().length + ' خياراً)' : '') + '، اخترها يدوياً'); await closeList(el); await sleep(300); }
      return;
    }
    // حقل بحث (Autocomplete)
    const r = await autocompletePick(el, words, c.iso2, [c.ar, c.en, c.iso2]);
    if (r.ok) { out.filled.push(name + ': ' + el.value); mark(el, flagged('nationality') ? 'warn' : 'ok'); }
    else out.failed.push(name + ': لم أجد «' + c.ar + '» في القائمة' + (r.shown && r.shown.length ? ' (من الخيارات: ' + r.shown.join('، ') + ')' : '') + '، اخترها يدوياً');
  }
  function checkRequired(pairs) {
    pairs.forEach(([sel, key]) => {
      const el = $m(sel);
      if (el && !el.value.trim()) { mark(el, 'miss'); out.missing.push(L(key)); }
    });
  }

  const stepOf = () => $m('#first-name') ? 1 : $m('#governorate') ? 2 : $m('#visit-duration') ? 3 : 0;

  async function fillStep(n) {
    out.filledSteps.push(n);
    if (n === 1) {
      await select('document-type', P.form === 'iraqi' ? ['عراقي'] : ['اجانب', 'اجنبي', 'وافدين'], 'نوع الاستمارة');
      await waitFor(() => $m('#first-name'));
      await sleep(300); restoreFiles();
      if (P.idType) await select('identification-type', P.idType === 'id' ? ['هويه'] : ['جواز'], 'نوع المستمسك');
      restoreFiles();
      await nationality();
      for (const [id, k] of [['first-name', 'first_name'], ['second-name', 'second_name'], ['third-name', 'third_name'], ['fourth-name', 'fourth_name'],
        ['last-name', 'last_name'], ['mother-name', 'mother_name'], ['phone-number', 'phone']]) await text(id, k);
      // رقم المستمسك يُملأ مع الجواز فقط
      if (P.idType === 'passport') await text('identification-number', 'id_number');
      await date('birth_date');
      attachImages();
      restoreFiles();
      checkRequired([['#first-name', 'first_name'], ['#second-name', 'second_name'], ['#third-name', 'third_name'], ['#mother-name', 'mother_name'], ['input[placeholder="DD/MM/YYYY"]', 'birth_date']]);
    } else if (n === 2) {
      await auto('governorate', 'governorate');
      for (const [id, k] of [['city', 'city'], ['area', 'area'], ['neighborhood', 'neighborhood'], ['street-number', 'street'], ['house-number', 'house'], ['nrp', 'landmark']]) await text(id, k);
      checkRequired([['#governorate', 'governorate']]);
    } else if (n === 3) {
      await text('visit-reason', 'visit_reason'); await text('visit-duration', 'visit_duration'); await date('arrival_date');
      checkRequired([['#visit-duration', 'visit_duration'], ['input[placeholder="DD/MM/YYYY"]', 'arrival_date']]);
    }
  }
  async function next(from) {
    const b = [...root().querySelectorAll('button')].find(x => x.textContent.trim().startsWith('التالي'));
    if (!b) return false;
    b.click();
    for (let i = 0; i < 20; i++) { await sleep(200); if (stepOf() !== from) return true; }
    out.notes.push('لم تنتقل المنظومة للخطوة التالية: هناك حقل إلزامي ناقص أو غير صالح.');
    return false;
  }

  let s = stepOf();
  if (!s) return { error: 'الخطوة الحالية (الغرفة أو الاستمارة) غير مبرمجة بعد. ارجع بزر «السابق» إلى خطوة معروفة.' };

  if (O && O.mode === 'all') {
    while (s >= 1 && s <= 3) {
      if (s === 3 && O.skipVisit) break;
      await fillStep(s);
      if (s === 3 || (s === 2 && O.skipVisit)) break;
      if (!(await next(s))) break;
      await sleep(400);
      const t = stepOf(); if (!t || t === s) break; s = t;
    }
  } else {
    await fillStep(s);
    if (O && O.autoNext && s < 3) await next(s);
  }
  const at = stepOf();
  out.at = at ? 'الخطوة ' + at + ' من 5' : 'خطوة غير معروفة (الغرفة/الاستمارة): أكملها يدوياً';
  return out;
};
