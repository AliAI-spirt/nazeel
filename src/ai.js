/*
 * محرك الذكاء الاصطناعي: Ollama (محلي) + Google Gemini (سحابي) + كشف اتجاه الصور
 * + محلل MRZ (TD1/TD2/TD3 وملصقات التأشيرة MRV) + توحيد الدولة والأسماء لحقول المنظومة.
 * يعمل في: لوحة الإضافة، خدمة الخلفية (importScripts)، واختبارات Node.
 */
(function (g) {
  'use strict';

  const C = () => g.Countries;
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const nd = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d));
  const clean = s => nd(s).replace(/\s+/g, ' ').trim();

  /* تحويل الأسماء اللاتينية إلى ASCII كبيرة (مثل MRZ): Ł→L، Ü→U، ß→SS ... ويترك العربية كما هي */
  const FOLD = { 'ß': 'SS', 'Æ': 'AE', 'æ': 'AE', 'Œ': 'OE', 'œ': 'OE', 'Ø': 'O', 'ø': 'O', 'Ł': 'L', 'ł': 'L', 'Đ': 'D', 'đ': 'D', 'Ð': 'D', 'ð': 'D', 'Þ': 'TH', 'þ': 'TH', 'İ': 'I', 'ı': 'I' };
  function foldLatin(s) {
    s = clean(s);
    if (!/[A-Za-z\u00C0-\u024F]/.test(s)) return s;
    return s.replace(/[ßÆæŒœØøŁłĐđÐðÞþİı]/g, c => FOLD[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }
  // مفتاح مقارنة تقريبي بين الاسم المطبوع والاسم في MRZ (يتجاهل ä=ae، ö=oe، ü=ue والفواصل)
  const nameKey = s => foldLatin(s).replace(/AE/g, 'A').replace(/OE/g, 'O').replace(/UE/g, 'U').replace(/[^A-Z]/g, '');

  /* ---------- المخطط والتعليمات ---------- */
  const STR = { type: 'string' };
  const KINDS = ['iraqi_id', 'iraqi_passport', 'foreign_passport', 'e_visa', 'visa_sticker', 'residence_card', 'travel_document', 'driver_license', 'other'];
  const SCHEMA = {
    type: 'object',
    properties: {
      doc_kind: { type: 'string', enum: KINDS },
      first_name: STR, second_name: STR, third_name: STR, fourth_name: STR, last_name: STR, mother_name: STR,
      id_number: STR, birth_date: STR, nationality_iso3: STR, nationality_text: STR, gender: STR, visa_phone: STR,
      governorate: STR, city: STR, area: STR, neighborhood: STR,
      mrz_lines: { type: 'array', items: STR },
      uncertain: { type: 'array', items: STR }
    },
    required: ['doc_kind', 'first_name', 'second_name', 'third_name', 'fourth_name', 'last_name', 'mother_name', 'id_number', 'birth_date', 'nationality_iso3', 'nationality_text', 'mrz_lines', 'uncertain']
  };

  const PROMPT = `أنت مساعد إدخال بيانات لفندق في العراق. حلّل صور الوثائق (قد تكون عدة صور ملصوقة معاً): هوية وطنية عراقية (وجه وخلف)، جواز سفر من أي دولة في العالم، ورقة تأشيرة الدخول الإلكترونية العراقية (e-Visa)، ملصق تأشيرة داخل الجواز، بطاقة إقامة... واستخرج البيانات كما هي مكتوبة بالضبط.

قواعد عامة:
- انسخ ما يظهر فقط. لا تخمّن ولا تكمّل ولا تصحّح. أي حقل غير ظاهر بوضوح اتركه "" وأضف اسمه إلى uncertain إذا قرأته بصعوبة.
- قد يكون جزء من الصورة مقلوباً أو مائلاً: اقرأه كما لو دوّرته ليصبح مستقيماً.
- حوّل الأرقام العربية-الهندية (٠١٢٣) إلى 0123. birth_date بصيغة DD/MM/YYYY.

doc_kind (إن ظهرت عدة وثائق اختر الأعلى أولوية: جواز ← هوية ← e_visa ← visa_sticker):
- foreign_passport: صفحة بيانات جواز صادر عن أي دولة غير العراق (صورة + سطرا MRZ يبدآن بـ P<). iraqi_passport: جواز عراقي.
- iraqi_id: بطاقة وطنية موحدة أو هوية أحوال مدنية عراقية (واجهة أو خلف).
- e_visa: ورقة «Visa Information» لتأشيرة الدخول الإلكترونية العراقية (فيها Full Name وNationality وPassport No.).
- visa_sticker: ملصق تأشيرة مطبوع داخل جواز (سطرا MRZ يبدآن بـ V<) بدون صفحة بيانات الجواز.
- residence_card أو travel_document أو driver_license أو other للباقي.

الأسماء:
- الوثائق العراقية بالعربية: first_name = الاسم، second_name = الأب، third_name = الجد، fourth_name = جد الأب إن وُجد، last_name = اللقب. mother_name = اسم الأم الكامل: إذا ظهر بعد «الأم» حقل «الجد» ثانٍ فهو أبو الأم، فاجمعهما بالترتيب (مثال: «عرفات حسين»).
- الوثائق الأجنبية: انسخ الأسماء بالأحرف اللاتينية. first_name وsecond_name وthird_name وfourth_name = الأسماء الممنوحة (Given names) بالترتيب (إن زادت عن أربعة فضع الباقي في fourth_name)، وlast_name = اللقب (Surname). إن وُجد حقل اسم كامل واحد فقط (مثل e-Visa) فالأسماء الأولى أولاً واللقب الأخير في last_name. mother_name يُترك فارغاً ما لم يُكتب.
- إن كانت الوثيقة بأبجدية غير لاتينية (صينية، روسية، عربية، فارسية...) فخذ النسخة اللاتينية المطبوعة بجانبها.

الأرقام والدولة:
- id_number: رقم الجواز فقط (Passport No.) من صفحة بيانات الجواز أو من e-Visa. ليس رقم التأشيرة (Visa No. / Entry Visa No. / Application No.) ولا رقم الطلب ولا رقم البطاقة الوطنية. للهوية العراقية اتركه "".
- nationality_iso3: رمز ISO ثلاثي لجنسية حامل الوثيقة (HUN للمجري، POL للبولندي، IRQ للعراقي)، وليس مكان الولادة وليس الدولة المانحة للتأشيرة (العراق). nationality_text: نص الجنسية كما هو مطبوع (مثل «Polish» أو «MAGYAR/HUNGARIAN»).
- mrz_lines: كل أسطر MRZ حرفياً (أحرف كبيرة A-Z وأرقام وعلامات <)، سطر لكل عنصر: سطرا الجواز (44 حرفاً) وسطرا ملصق التأشيرة إن وُجدا، وأسطر الهوية الثلاثة (30 حرفاً). ممنوع إضافة نص آخر. اقرأ كل حرف بعناية.
- visa_phone: رقم هاتف مقدم الطلب في e-Visa إن وُجد، وإلا "".
أعد كائن JSON فقط بدون أي شرح.`;

  /* ---------- كشف اتجاه الصور ---------- */
  const ORIENT_SCHEMA = { type: 'object', properties: { rotations: { type: 'array', items: { type: 'integer' } } }, required: ['rotations'] };
  const ORIENT_PROMPT = `لديك عدة صور لوثائق (جواز، هوية، تأشيرة...) بالترتيب: «الصورة 1» ثم «الصورة 2» وهكذا.
لكل صورة، كم درجة يجب تدويرها باتجاه عقارب الساعة حتى تصبح الوثيقة مستقيمة والنص مقروءاً بشكل طبيعي؟
القيم المسموحة فقط: 0 (مستقيمة) أو 90 أو 180 (مقلوبة رأساً على عقب) أو 270.
أعد JSON بالشكل {"rotations":[...]} بعدد عناصر يساوي عدد الصور، بدون شرح.`;

  /* ---------- الاتصال بالمحركات ---------- */
  const b64 = d => String(d).split(',')[1];

  async function listModels(url) {
    const r = await fetch(url.replace(/\/+$/, '') + '/api/tags');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.models || []).map(m => m.name);
  }

  async function ollamaCall({ url, model, images, signal, onProgress }, { prompt, schema, numPredict = 700, labeled }) {
    const base = url.replace(/\/+$/, '');
    if (/^qwen3-vl:[^-]*$/i.test(model) && !/instruct|thinking/i.test(model)) throw new Error('الاسم «' + model + '» هو إصدار «التفكير» البطيء. نفّذ: ollama pull ' + model + '-instruct ثم اكتب الاسم الجديد في الإعدادات.');
    const text = labeled ? prompt + '\n(عدد الصور: ' + images.length + ')' : prompt;
    const body = format => JSON.stringify({
      model, stream: true, format, keep_alive: '15m',
      options: { temperature: 0, num_ctx: 4096, num_predict: numPredict },
      messages: [{ role: 'user', content: text, images: images.map(b64) }]
    });
    const post = format => fetch(base + '/api/chat', { method: 'POST', body: body(format), signal, headers: { 'Content-Type': 'application/json' } });
    let res = await post(schema);
    if (res.status === 400) res = await post('json');
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(res.status === 404 ? 'النموذج «' + model + '» غير منزّل. نفّذ: ollama pull ' + model : 'خطأ من Ollama (' + res.status + ') ' + t.slice(0, 160));
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', out = '', n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.error) throw new Error(j.error);
          if (j.message && j.message.content) { out += j.message.content; n++; onProgress && onProgress(n); }
        } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
      }
    }
    return parseJSON(out);
  }

  const upType = s => Array.isArray(s) ? s.map(upType) : (s && typeof s === 'object')
    ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toUpperCase() : upType(v)])) : s;
  const GBASE = 'https://generativelanguage.googleapis.com/v1beta/';

  async function gError(res) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && j.error.message) || ''; } catch (e) { /* ignore */ }
    if (res.status === 429) return 'تجاوزت الحد المجاني لـ Gemini (طلبات في الدقيقة أو اليوم). انتظر دقيقة أو بدّل النموذج إلى gemini-2.5-flash-lite.';
    if (res.status === 400 && /API key/i.test(msg)) return 'مفتاح Gemini غير صالح. انسخه من aistudio.google.com/apikey وألصقه في الإعدادات.';
    if (res.status === 403) return 'المفتاح غير مصرّح له أو المنطقة غير مدعومة: ' + msg.slice(0, 140);
    if (res.status === 404) return 'النموذج غير موجود في حسابك. اضغط «اختبار الاتصال» لترى النماذج المتاحة.';
    return 'خطأ من Gemini (' + res.status + '): ' + msg.slice(0, 160);
  }

  async function listGeminiModels(key) {
    const r = await fetch(GBASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!r.ok) throw new Error(await gError(r));
    const j = await r.json();
    return (j.models || []).filter(m => /generateContent/.test((m.supportedGenerationMethods || []).join()) && /gemini/.test(m.name))
      .map(m => m.name.replace(/^models\//, ''));
  }

  async function geminiCall({ key, model, images, signal }, { prompt, schema, maxTokens = 1500, labeled }) {
    if (!key) throw new Error('أدخل مفتاح Gemini API في إعدادات اللوحة الجانبية.');
    const mdl = String(model || 'gemini-2.5-flash').replace(/^models\//, '');
    const url = GBASE + 'models/' + encodeURIComponent(mdl) + ':generateContent';
    const gschema = upType(schema);
    const imgParts = labeled
      ? images.flatMap((d, i) => [{ text: 'الصورة ' + (i + 1) + ':' }, { inline_data: { mime_type: 'image/jpeg', data: b64(d) } }])
      : images.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: b64(d) } }));
    const body = extra => JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imgParts] }],
      generationConfig: { temperature: 0, maxOutputTokens: maxTokens, responseMimeType: 'application/json', ...extra }
    });
    const call = extra => fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body(extra) });
    let res = await call({ responseSchema: gschema, thinkingConfig: { thinkingBudget: 0 } });
    if (res.status === 400) res = await call({ responseSchema: gschema });
    if (res.status === 400) res = await call({});
    if (!res.ok) { const e = new Error(await gError(res)); e.status = res.status; throw e; }
    const j = await res.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const t = parts.filter(p => !p.thought).map(p => p.text || '').join('');
    if (!t) throw new Error('لم يُرجع Gemini نتيجة' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (حُجب الطلب: ' + j.promptFeedback.blockReason + ')' : '') + '. جرّب صورة أوضح.');
    return parseJSON(t);
  }

  async function callProvider(o, spec) {
    if (o.provider !== 'gemini') return ollamaCall(o, spec);
    const models = String(o.model || '').split(/[,،\s]+/).filter(Boolean);
    if (!models.length) models.push('gemini-2.5-flash-lite', 'gemini-2.5-flash');
    let last;
    for (const m of models) {
      try { return await geminiCall({ ...o, model: m }, spec); }
      catch (e) { last = e; if (e.status !== 429 && e.status !== 404) throw e; }
    }
    throw last;
  }

  const run = o => callProvider(o, { prompt: PROMPT, schema: SCHEMA });

  /* يعيد قائمة بزوايا التدوير (0/90/180/270 باتجاه عقارب الساعة) لكل صورة. أي فشل يعني «لا تدوير». */
  async function orient(o) {
    const n = (o.images || []).length;
    const none = Array(n).fill(0);
    if (!n) return none;
    try {
      const j = await callProvider(o, { prompt: ORIENT_PROMPT, schema: ORIENT_SCHEMA, maxTokens: 120, numPredict: 80, labeled: true });
      const r = Array.isArray(j.rotations) ? j.rotations : [];
      return none.map((_, i) => { const a = (((Math.round(Number(r[i])) || 0) % 360) + 360) % 360; return [0, 90, 180, 270].includes(a) ? a : 0; });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      return none;
    }
  }

  function parseJSON(t) {
    t = t.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('الرد ليس JSON صالحاً. جرّب نموذجاً آخر أو صورة أوضح.');
    return JSON.parse(t.slice(a, b + 1));
  }

  /* ================= MRZ (ICAO 9303) ================= */
  const W = [7, 3, 1];
  const cv = c => c === '<' ? 0 : (c >= '0' && c <= '9') ? +c : (c >= 'A' && c <= 'Z') ? c.charCodeAt(0) - 55 : NaN;
  function chk(s) {
    let a = 0;
    for (let i = 0; i < s.length; i++) { const v = cv(s[i]); if (isNaN(v)) return -1; a += v * W[i % 3]; }
    return a % 10;
  }
  // تصحيح التباس OCR: في الحقول الرقمية الحروف المشابهة للأرقام، وفي الحقول الحرفية العكس
  const toDigits = s => s.replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/G/g, '6').replace(/B/g, '8');
  const toAlpha = s => s.replace(/0/g, 'O').replace(/1/g, 'I').replace(/2/g, 'Z').replace(/5/g, 'S').replace(/8/g, 'B');
  const isDate6 = s => /^\d{6}$/.test(s) && +s.slice(2, 4) >= 1 && +s.slice(2, 4) <= 12 && +s.slice(4, 6) >= 1 && +s.slice(4, 6) <= 31;

  function mrzDate(yymmdd, expiry) {
    if (!isDate6(yymmdd)) return '';
    const yy = +yymmdd.slice(0, 2), cur = new Date().getFullYear() % 100;
    const year = expiry ? 2000 + yy : (yy > cur ? 1900 : 2000) + yy;
    return yymmdd.slice(4, 6) + '/' + yymmdd.slice(2, 4) + '/' + year;
  }
  const parseDMY = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

  function splitNames(part) {
    const p = part.split('<<');
    const surname = (p[0] || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    const given = (p.slice(1).join(' ') || '').replace(/</g, ' ').trim().split(/\s+/).filter(Boolean);
    return { surname, given };
  }

  const cleanLine = s => String(s || '').toUpperCase()
    .replace(/[«‹〈＜]/g, '<').replace(/[^A-Z0-9<]/g, '')
    .replace(/K{4,}/g, m => '<'.repeat(m.length)); // OCR يقرأ حشو <<<< أحياناً KKKK
  const rev = s => [...s].reverse().join('');
  // يضبط طول السطر: يكمل بـ < أو يقص الزائد من الحشو. يعيد null إن بدا بعيداً عن الطول المطلوب
  function fit(s, n) {
    if (s.length === n) return s;
    if (s.length < n && s.length >= n - 4) return s + '<'.repeat(n - s.length);
    if (s.length > n && s.length <= n + 4) { let t = s; while (t.length > n && t.endsWith('<')) t = t.slice(0, -1); return t.length === n ? t : null; }
    return null;
  }

  // يقرأ سطرين بصيغة TD2/TD3 (مواضع متطابقة حتى الخانة 28)
  function parseTD23(l1, l2, n) {
    const t0 = l1[0];
    if (!(t0 === 'P' || t0 === 'V' || t0 === 'I' || t0 === 'A' || t0 === 'C')) return null;
    if (n === 44 && !(t0 === 'P' || t0 === 'V')) return null;
    const doc = l2.slice(0, 9), cd = toDigits(l2[9]);
    const birth = toDigits(l2.slice(13, 19)), bcd = toDigits(l2[19]);
    const exp = toDigits(l2.slice(21, 27)), ecd = toDigits(l2[27]);
    const nat = toAlpha(l2.slice(10, 13));
    const checks = { doc: chk(doc) === +cd, birth: isDate6(birth) && chk(birth) === +bcd, exp: isDate6(exp) && chk(exp) === +ecd };
    return build(n === 44 ? 'TD3' : 'TD2', t0 === 'P' ? 'P' : t0 === 'V' ? 'V' : 'I', checks, {
      doc: doc.replace(/</g, ''), nat: nat.replace(/</g, ''), issuer: l1.slice(2, 5), birth, exp, sex: l2[20], ...splitNames(l1.slice(5))
    });
  }
  function parseTD1(l1, l2, l3) {
    if (!/^[IAC]/.test(l1)) return null;
    const doc = l1.slice(5, 14), cd = toDigits(l1[14]);
    const birth = toDigits(l2.slice(0, 6)), bcd = toDigits(l2[6]);
    const exp = toDigits(l2.slice(8, 14)), ecd = toDigits(l2[14]);
    const nat = toAlpha(l2.slice(15, 18));
    const checks = { doc: chk(doc) === +cd, birth: isDate6(birth) && chk(birth) === +bcd, exp: isDate6(exp) && chk(exp) === +ecd };
    return build('TD1', 'I', checks, { doc: doc.replace(/</g, ''), nat: nat.replace(/</g, ''), issuer: l1.slice(2, 5), birth, exp, sex: l2[7], ...splitNames(l3) });
  }
  function build(format, kind, checks, f) {
    const score = (checks.doc ? 1 : 0) + (checks.birth ? 1 : 0) + (checks.exp ? 1 : 0);
    return {
      format, kind, checks, score, valid: score === 3, doc: f.doc, nat: f.nat, issuer: f.issuer,
      birth: mrzDate(f.birth), expiry: mrzDate(f.exp, true), sex: f.sex, surname: f.surname, given: f.given
    };
  }

  /* يحلل كل أسطر MRZ الممكنة ويعيد قائمة النتائج مرتبة من الأفضل (يجرّب ترتيب الأسطر والقراءة المعكوسة) */
  function parseAllMRZ(lines) {
    let raw = [];
    (lines || []).forEach(x => String(x == null ? '' : x).split(/[\r\n]+/).forEach(p => { const c = cleanLine(p); if (c.length >= 20) raw.push(c); }));
    // سطر واحد ملصوق من سطرين/ثلاثة
    raw = raw.flatMap(s => s.length === 88 ? [s.slice(0, 44), s.slice(44)] : s.length === 72 ? [s.slice(0, 36), s.slice(36)] : s.length === 90 ? [s.slice(0, 30), s.slice(30, 60), s.slice(60)] : [s]);
    const cands = [];
    raw.forEach((s, i) => { cands.push({ s, i }); cands.push({ s: rev(s), i }); });
    const res = [];
    for (const n of [44, 36]) {
      const set = cands.map(c => ({ ...c, f: fit(c.s, n) })).filter(c => c.f);
      for (const a of set) for (const b of set) {
        if (a.i === b.i) continue;
        const p = parseTD23(a.f, b.f, n);
        if (p && p.score >= 1) { p.src = [a.i, b.i]; p.seq = b.i === a.i + 1 ? 1 : 0; res.push(p); }
      }
    }
    const set30 = cands.map(c => ({ ...c, f: fit(c.s, 30) })).filter(c => c.f);
    for (const a of set30) for (const b of set30) for (const c of set30) {
      if (a.i === b.i || a.i === c.i || b.i === c.i) continue;
      const p = parseTD1(a.f, b.f, c.f);
      if (p && p.score >= 1) { p.src = [a.i, b.i, c.i]; p.seq = b.i === a.i + 1 && c.i === b.i + 1 ? 1 : 0; res.push(p); }
    }
    // أفضل نتيجة لكل وثيقة، مرتبة بالدرجة ثم بأفضلية الجواز
    const rank = r => r.score * 10 + (r.kind === 'P' ? 2 : r.kind === 'I' ? 1 : 0) + (r.surname ? 0.5 : 0) + r.seq * 0.6;
    res.sort((x, y) => rank(y) - rank(x));
    // كل سطر يُستعمل في وثيقة واحدة فقط (يمنع خلط سطر جواز مع سطر تأشيرة)
    const used = new Set(), out = [];
    res.forEach(r => { if (!r.src.some(i => used.has(i))) { r.src.forEach(i => used.add(i)); out.push(r); } });
    return out;
  }
  const parseMRZ = lines => { const a = parseAllMRZ(lines); return a.find(r => r.kind !== 'V') || a[0] || null; };

  /* ================= التنظيف والتحويل لحقول النموذج ================= */
  function normDate(s) {
    const m = /(\d{1,4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,4})/.exec(nd(s));
    if (!m) return '';
    let d, mo, y;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; } else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || y < 1900 || dt > new Date()) return '';
    return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0') + '/' + y;
  }

  const IRAQI_KINDS = new Set(['iraqi_id', 'iraqi_passport']);
  const PASSPORT_KINDS = new Set(['iraqi_passport', 'foreign_passport', 'e_visa', 'travel_document']);
  const iso3to2 = c => { const r = C() && C().byIso3(c); return r ? r.iso2 : ''; };

  function normalize(raw, now) {
    raw = raw || {};
    const Co = C();
    const notes = [], flags = {};
    const today = new Date(now || Date.now());
    let kind = KINDS.includes(raw.doc_kind) ? raw.doc_kind : 'other';

    const all = parseAllMRZ(raw.mrz_lines);
    const ident = all.find(r => r.kind !== 'V' && r.score >= 2) || null;       // جواز أو هوية موثوقة
    const visaM = all.find(r => r.kind === 'V' && r.score >= 2) || null;       // ملصق تأشيرة
    const weak = all.find(r => r.score === 1) || null;
    const M = ident || visaM;

    if (ident && ident.kind === 'P' && ['visa_sticker', 'e_visa', 'other', 'foreign_passport', 'iraqi_passport'].includes(kind)) kind = ident.nat === 'IRQ' ? 'iraqi_passport' : 'foreign_passport';

    /* --- الدولة: MRZ الموثوق ← رمز الذكاء ← نص الجنسية ← نوع الوثيقة --- */
    const byCode = Co.byIso3(raw.nationality_iso3), byText = Co.fromText(raw.nationality_text);
    let nat = M ? Co.byIso3(M.nat) : null;
    const mrzUnknown = M && !nat && M.nat;
    if (nat) {
      const other = byCode || byText;
      if (other && other.iso2 !== nat.iso2) notes.push('الجنسية صُحّحت من MRZ: ' + other.ar + ' ← ' + nat.ar);
    } else {
      nat = byCode || byText;
      if (byCode && byText && byCode.iso2 !== byText.iso2) { flags.nationality = 'warn'; notes.push('تضارب في الجنسية: الرمز (' + byCode.ar + ') لا يطابق النص المطبوع «' + clean(raw.nationality_text) + '» (' + byText.ar + '). تأكد منها.'); }
      else if (nat && (!M || mrzUnknown)) flags.nationality = 'warn';
      if (mrzUnknown) notes.push('رمز الدولة في MRZ (' + M.nat + ') غير معروف' + (nat ? '؛ اعتُمدت قراءة الذكاء الاصطناعي (' + nat.ar + '). تأكد منها.' : '. اختر الجنسية يدوياً.'));
    }
    if (!nat && IRAQI_KINDS.has(kind)) nat = Co.byIso2('IQ');
    if (!nat) { flags.nationality = 'bad'; notes.push('تعذر تحديد الجنسية تلقائياً. اخترها يدوياً من القائمة.'); }

    const iraqiForm = nat ? nat.iso2 === 'IQ' : IRAQI_KINDS.has(kind);
    if (IRAQI_KINDS.has(kind) && nat && nat.iso2 !== 'IQ') { flags.nationality = 'warn'; notes.push('الوثيقة عراقية لكن الجنسية المقروءة ' + nat.ar + '. تأكد قبل الاختيار.'); }

    /* --- الأسماء --- */
    const clr = iraqiForm ? clean : foldLatin;
    const f = {
      first_name: clr(raw.first_name), second_name: clr(raw.second_name), third_name: clr(raw.third_name),
      fourth_name: clr(raw.fourth_name), last_name: clr(raw.last_name), mother_name: clr(raw.mother_name)
    };
    const NAME_KEYS = ['first_name', 'second_name', 'third_name', 'fourth_name', 'last_name'];
    const mrzNames = ident && ident.surname ? ident : (visaM && visaM.surname ? visaM : null);
    if (!iraqiForm && mrzNames) {
      const printedKey = nameKey(NAME_KEYS.map(k => f[k]).join(''));
      const mrzKey = nameKey(mrzNames.given.join('') + mrzNames.surname);
      const same = printedKey && mrzKey && (printedKey === mrzKey || (Math.min(printedKey.length, mrzKey.length) >= 20 && (printedKey.startsWith(mrzKey) || mrzKey.startsWith(printedKey))));
      if (!printedKey) {
        const g2 = mrzNames.given;
        f.first_name = g2[0] || ''; f.second_name = g2[1] || ''; f.third_name = g2[2] || ''; f.fourth_name = g2.slice(3).join(' '); f.last_name = mrzNames.surname;
        notes.push('الأسماء أُخذت من MRZ.');
      } else if (!same) {
        NAME_KEYS.forEach(k => { if (f[k]) flags[k] = 'warn'; });
        notes.push('الاسم المقروء من الوثيقة يختلف عن MRZ (' + [...mrzNames.given, mrzNames.surname].join(' ') + '). راجع الأسماء مع الصورة.');
      }
    } else if (!iraqiForm && kind === 'e_visa') {
      NAME_KEYS.forEach(k => { if (f[k]) flags[k] = 'warn'; });
      notes.push('الاسم من تأشيرة إلكترونية: لا تفصل بين الأسماء واللقب. راجع الترتيب (اللقب في الخانة الأخيرة).');
    }

    /* --- رقم الجواز وتاريخ الميلاد --- */
    const passLike = PASSPORT_KINDS.has(kind) || !!(ident && ident.kind === 'P');
    let id = passLike ? String(nd(raw.id_number)).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    if (ident && ident.kind === 'P' && ident.checks.doc && ident.doc) {
      if (id && id !== ident.doc) notes.push('رقم الجواز صُحّح من MRZ: ' + id + ' ← ' + ident.doc);
      id = ident.doc;
    } else if (id) flags.id_number = 'warn';
    if (kind === 'visa_sticker') {
      id = '';
      notes.push('هذه صفحة التأشيرة فقط: رقمها ليس رقم الجواز. أضف صورة صفحة بيانات الجواز لقراءة رقمه واسمه.');
    }

    let birth = normDate(raw.birth_date);
    const mb = (ident && ident.checks.birth && ident.birth) || (visaM && visaM.checks.birth && visaM.birth) || '';
    if (mb && mb !== birth) { if (birth) notes.push('تاريخ الميلاد صُحّح من MRZ: ' + birth + ' ← ' + mb); birth = mb; }
    else if (raw.birth_date && !birth) { flags.birth_date = 'bad'; notes.push('تاريخ الميلاد المقروء غير صالح: «' + raw.birth_date + '»'); }

    if (M) {
      notes.push(M.valid ? 'تم التحقق من MRZ بنجاح (أرقام التحقق صحيحة).' : 'MRZ مقروء جزئياً (' + M.score + ' من 3 أرقام تحقق صحيحة): راجع رقم الوثيقة وتاريخ الميلاد.');
      if (!M.valid) { if (!M.checks.birth) flags.birth_date = flags.birth_date || 'warn'; if (!M.checks.doc && id) flags.id_number = 'warn'; }
      const exp = parseDMY(M.expiry);
      if (exp && exp < new Date(today.getFullYear(), today.getMonth(), today.getDate())) notes.push('⚠ ' + (M.kind === 'V' ? 'التأشيرة' : 'الوثيقة') + ' منتهية الصلاحية بتاريخ ' + M.expiry + '.');
    } else if (weak) notes.push('MRZ موجود لكن أرقام التحقق لا تطابق (قراءة غير دقيقة). لم يُعتمد.');
    if (ident && visaM && ident.nat !== visaM.nat) notes.push('⚠ جنسية الجواز لا تطابق جنسية التأشيرة في MRZ. تأكد أن الصور لشخص واحد.');
    if (ident && visaM && ident.birth && visaM.birth && ident.birth !== visaM.birth) notes.push('⚠ تاريخ الميلاد في الجواز يختلف عنه في التأشيرة. تأكد أن الصور لشخص واحد.');
    if (clean(raw.visa_phone)) notes.push('هاتف مقدم الطلب في التأشيرة: ' + clean(raw.visa_phone) + ' (لم يُدخل تلقائياً، تأكد منه قبل استخدامه).');

    if (!iraqiForm) ['second_name', 'third_name', 'mother_name'].forEach(k => { if (!f[k]) { f[k] = 'NONE'; flags[k] = 'auto'; } });

    (raw.uncertain || []).forEach(u => {
      const k = String(u).trim().toLowerCase();
      if (k === 'id_number' && !passLike) return;
      if (Object.prototype.hasOwnProperty.call(f, k) || k === 'birth_date' || k === 'id_number') flags[k] = flags[k] || 'warn';
    });

    let idType = '';
    if (kind === 'iraqi_id' && iraqiForm) idType = 'id';
    else if (passLike && id) idType = 'passport';

    const fields = {
      ...f, id_number: id, birth_date: birth, nationality: nat ? nat.iso2 : '', phone: '',
      governorate: clean(raw.governorate), city: clean(raw.city), area: clean(raw.area), neighborhood: clean(raw.neighborhood),
      street: '', house: '', landmark: ''
    };
    if (M) flags._mrz = M.valid ? 'ok' : 'bad';

    return {
      kind, form: iraqiForm ? 'iraqi' : 'foreign', idType, fields, flags, notes, mrz: M || null,
      country: nat ? { ...nat, words: Co.words(nat.iso2) } : null
    };
  }

  g.AI = { SCHEMA, PROMPT, listModels, listGeminiModels, run, orient, normalize, parseMRZ, parseAllMRZ, normDate, iso3to2, foldLatin, KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.AI;
})(typeof globalThis !== 'undefined' ? globalThis : self);
