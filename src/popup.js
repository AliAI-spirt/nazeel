'use strict';
const { since, days, esc, flag, countryName, enrich, applyFilters, describeFilters, compute, hotelName, toText, toCSV, key, floorLabel, f1, AGE_BUCKETS, fmtDateTime } = HS;
const $ = s => document.querySelector(s);

const DEFAULT_FILTERS = { rooms: '', status: 'all', nat: 'all', country: '', q: '' };
const S = {
  rows: [],            // سجلات خام (مجمعة أو من الصفحة الحالية)
  meta: {},            // total, ranges, updatedAt, departed
  cumulative: false,
  filters: { ...DEFAULT_FILTERS },
  tab: 'summary'
};

/* ============ التخزين ============ */
const save = () => chrome.storage.local.set({ rows: S.rows, meta: S.meta, cumulative: S.cumulative, filters: S.filters });

async function load() {
  const d = await chrome.storage.local.get(['rows', 'meta', 'cumulative', 'filters']);
  S.rows = d.rows || [];
  S.meta = d.meta || {};
  S.cumulative = !!d.cumulative;
  S.filters = { ...DEFAULT_FILTERS, ...(d.filters || {}) };
}

/* ============ الاستخراج من الصفحة (يعمل داخل تبويب المنظومة) ============ */
async function pageScraper(mode) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nav = document.querySelector('nav.MuiTablePagination-root');
  const btn = label => nav ? nav.querySelector('button[aria-label="' + label + '"]') : null;
  const cell = (row, f) => { const c = row.querySelector('[data-field="' + f + '"] .MuiDataGrid-cellContent'); return c ? c.textContent.trim() : ''; };

  const scrape = () => [...document.querySelectorAll('.MuiDataGrid-row')].map(row => ({
    id: row.getAttribute('data-id') || '',
    name: cell(row, 'full_name'), birth: cell(row, 'birth_date'), phone: cell(row, 'phone_number'),
    nat: cell(row, 'nationality').toUpperCase(), hotel: cell(row, 'hotel_name'),
    arrival: cell(row, 'arrival_date'), room: cell(row, 'room_number'), reason: cell(row, 'visit_reason')
  })).filter(r => r.nat || r.name);

  const info = () => {
    const el = nav && nav.querySelector('.MuiTablePagination-displayedRows');
    const m = el && /(\d+)\D+(\d+)\D+(\d+)/.exec(el.textContent.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const sw = document.querySelector('.MuiSwitch-input');
    return { from: m ? +m[1] : null, to: m ? +m[2] : null, total: m ? +m[3] : null, departed: sw ? sw.checked : false };
  };
  const sig = () => [...document.querySelectorAll('.MuiDataGrid-row')].map(r => r.getAttribute('data-id')).join('|');
  const waitChange = async prev => {
    for (let i = 0; i < 50; i++) { await sleep(150); if (sig() !== prev) { await sleep(250); return true; } }
    return false;
  };
  const progress = (page, count, total) => { try { chrome.runtime.sendMessage({ type: 'progress', page, count, total }); } catch (e) { /* ignore */ } };
  const canClick = b => b && !b.disabled;

  if (!document.querySelector('.MuiDataGrid-root')) return { error: 'لم يتم العثور على جدول النزلاء في هذه الصفحة. افتح صفحة «النزلاء» أولاً.' };

  if (mode !== 'all') return { rows: scrape(), info: info() };

  if (!nav) return { rows: scrape(), info: info() };
  const total = info().total;
  let back = 0;
  while (canClick(btn('Go to previous page')) && back < 500) {
    const s = sig(); btn('Go to previous page').click(); back++;
    if (!(await waitChange(s))) break;
  }
  const all = []; let pages = 0;
  while (pages < 500) {
    all.push(...scrape()); pages++;
    progress(pages, all.length, total);
    const nx = btn('Go to next page');
    if (!canClick(nx)) break;
    const s = sig(); nx.click();
    if (!(await waitChange(s))) break;
  }
  // العودة إلى الصفحة التي كان المستخدم عليها
  let steps = pages - 1;
  while (steps > 0 && canClick(btn('Go to previous page'))) {
    const s = sig(); btn('Go to previous page').click(); steps--;
    if (!(await waitChange(s))) break;
  }
  for (let i = 0; i < back; i++) {
    const nx = btn('Go to next page'); if (!canClick(nx)) break;
    const s = sig(); nx.click(); if (!(await waitChange(s))) break;
  }
  const inf = info(); inf.from = null; inf.to = null; inf.allPages = true;
  return { rows: all, info: inf };
}

/* ============ تشغيل الاستخراج ============ */
function setStatus(msg, cls) { const s = $('#status'); s.textContent = msg; s.className = cls || ''; }
function setBusy(b) { $('#calcBtn').disabled = b; $('#crawlBtn').disabled = b; }

function merge(newRows, inf) {
  const rangeTxt = inf.allPages ? 'كل الصفحات' : (inf.from != null ? inf.from + '–' + inf.to : '');
  if (!S.cumulative) {
    S.rows = newRows;
    S.meta = { total: inf.total, ranges: rangeTxt ? [rangeTxt] : [], departed: inf.departed, updatedAt: Date.now() };
    return { added: newRows.length, dup: 0 };
  }
  const m = new Map(S.rows.map(r => [key(r), r]));
  let added = 0;
  newRows.forEach(r => { const k = key(r); if (!m.has(k)) added++; m.set(k, r); });
  S.rows = [...m.values()];
  const ranges = new Set(S.meta.ranges || []);
  if (rangeTxt) ranges.add(rangeTxt);
  S.meta = { total: inf.total != null ? inf.total : S.meta.total, ranges: [...ranges], departed: inf.departed, updatedAt: Date.now() };
  return { added, dup: newRows.length - added };
}

async function run(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  setBusy(true);
  $('#progWrap').hidden = mode !== 'all';
  $('#prog').style.width = '0';
  setStatus(mode === 'all' ? 'جارٍ التنقل بين الصفحات وجمع النزلاء... لا تغلق النافذة.' : 'جارٍ القراءة...');
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageScraper, args: [mode] });
    const out = res && res[0] && res[0].result;
    if (!out) throw new Error('no result');
    if (out.error) { setStatus(out.error, 'err'); return; }
    if (!out.rows.length) { setStatus('لا توجد صفوف ظاهرة في الجدول.', 'err'); return; }
    const before = S.meta.departed;
    const r = merge(out.rows, out.info);
    save(); refreshFilterOptions(); render();
    let msg = S.cumulative
      ? '✔ أُضيف ' + r.added + ' نزيل جديد' + (r.dup ? ' (تم تجاهل ' + r.dup + ' مكرر)' : '') + ' — المجموع التراكمي ' + S.rows.length + (S.meta.total ? ' من ' + S.meta.total : '')
      : '✔ تم تحليل ' + S.rows.length + ' نزيل من الصفحة الحالية';
    if (S.cumulative && S.meta.total && S.rows.length < S.meta.total) msg += ' — انتقل للصفحة التالية وحلّل مجدداً، أو استخدم الجمع التلقائي.';
    if (out.info.departed) msg += ' ⚠ الصفحة تعرض النزلاء المغادرين.';
    setStatus(msg, 'ok');
  } catch (e) {
    setStatus('تعذر الوصول للصفحة الحالية. حدّث صفحة المنظومة ثم أعد المحاولة.', 'err');
  } finally {
    setBusy(false); $('#progWrap').hidden = true;
  }
}

chrome.runtime.onMessage.addListener(m => {
  if (m && m.type === 'progress') {
    setStatus('الصفحة ' + m.page + ' — تم جمع ' + m.count + (m.total ? ' من ' + m.total : '') + ' نزيل...');
    if (m.total) $('#prog').style.width = Math.min(100, Math.round(m.count / m.total * 100)) + '%';
  }
});

/* ============ العرض ============ */
const getAll = () => enrich(S.rows, new Date());
const getFiltered = all => applyFilters(all, S.filters);

function refreshFilterOptions() {
  const all = getAll(); const sel = $('#fCountry');
  const codes = [...new Set(all.map(r => r.nat).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b), 'ar'));
  sel.innerHTML = '<option value="">كل الدول</option>' + codes.map(c => '<option value="' + esc(c) + '">' + flag(c) + ' ' + esc(countryName(c)) + '</option>').join('');
  if (!codes.includes(S.filters.country)) S.filters.country = '';
  sel.value = S.filters.country;
}

function syncControls() {
  $('#cumToggle').checked = S.cumulative;
  $('#crawlBtn').hidden = !S.cumulative;
  $('#calcBtn').textContent = S.cumulative ? 'إضافة الصفحة الحالية' : 'تحليل الصفحة الحالية';
  $('#cumHint').textContent = S.cumulative
    ? 'مفعّل: كل صفحة تُضاف لما سبق دون تكرار، حتى لو أغلقت النافذة.'
    : 'مغلق: كل تحليل يستبدل النتيجة السابقة.';
  $('#fRooms').value = S.filters.rooms; $('#fStatus').value = S.filters.status; $('#fNat').value = S.filters.nat;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
}

const bar = (label, v, max, cls) => '<div class="bar ' + (cls || '') + '"><span>' + label + '</span><div class="t"><i style="width:' + (max ? Math.round(v / max * 100) : 0) + '%"></i></div><b class="num">' + v + '</b></div>';
const pills = o => '<span class="pill n num" title="وصل اليوم">ج ' + o.n + '</span> <span class="pill o num" title="دخول سابق">ق ' + o.o + '</span>';

function render() {
  syncControls();
  const all = getAll(), rows = getFiltered(all), st = compute(rows);
  const m = S.meta;
  $('#subtitle').textContent = all.length
    ? 'محفوظ: ' + all.length + ' نزيل' + (m.total ? ' من ' + m.total : '') + (m.updatedAt ? ' — ' + fmtDateTime(new Date(m.updatedAt)) : '')
    : 'لم يتم التحليل بعد';
  $('#fHint').textContent = all.length ? 'المعروض ' + rows.length + ' من ' + all.length : '';

  const v = $('#view');
  if (!all.length) { v.innerHTML = '<div class="empty">افتح صفحة النزلاء ثم اضغط «' + $('#calcBtn').textContent + '».</div>'; return; }
  if (!rows.length) { v.innerHTML = '<div class="empty">لا يوجد نزلاء يطابقون الفلاتر الحالية.</div>'; return; }
  v.innerHTML = ({ summary: viewSummary, countries: viewCountries, rooms: viewRooms, guests: viewGuests })[S.tab](st, rows);
}

function viewSummary(st) {
  const pIq = st.total ? Math.round(st.iq.t / st.total * 100) : 0;
  let h = '<div class="kpis">' +
    '<div class="kpi"><div class="v num">' + st.total + '</div><div class="l">الإجمالي</div><div class="s num">ج ' + st.new + ' | ق ' + st.old + '</div></div>' +
    '<div class="kpi iq"><div class="v num">' + st.iq.t + '</div><div class="l">العراقيون</div><div class="s num">ج ' + st.iq.n + ' | ق ' + st.iq.o + '</div></div>' +
    '<div class="kpi fr"><div class="v num">' + st.fr.t + '</div><div class="l">الأجانب</div><div class="s num">ج ' + st.fr.n + ' | ق ' + st.fr.o + '</div></div></div>';
  h += '<div class="split"><i class="a" style="width:' + pIq + '%"></i><i class="b" style="width:' + (100 - pIq) + '%"></i></div>' +
    '<div class="legend"><span>عراقيون ' + pIq + '%</span><span>أجانب ' + (100 - pIq) + '%</span></div>';
  h += '<div class="kpis small">' +
    '<div class="kpi"><div class="v num">' + st.occupiedRooms + '</div><div class="l">غرف مشغولة</div></div>' +
    '<div class="kpi"><div class="v num">' + f1(st.avgPerRoom) + '</div><div class="l">نزيل / غرفة</div></div>' +
    '<div class="kpi"><div class="v num">' + days(st.avgNights) + '</div><div class="l">متوسط مدة الإقامة</div></div></div>';

  const topC = st.countryList.slice(0, 5), mc = topC.length ? topC[0].t : 0;
  h += '<div class="sec"><h3><span>أكثر الجنسيات</span><button class="link" data-go="countries">عرض الكل</button></h3><div class="body">' +
    topC.map(c => bar(c.flag + ' ' + esc(c.name), c.t, mc)).join('') + '</div></div>';

  const fl = st.floorList.filter(f => f.floor !== '—'), mf = Math.max(0, ...fl.map(f => f.t));
  if (fl.length) h += '<div class="sec"><h3><span>التوزيع على الطوابق</span><span>' + fl.length + ' طابق</span></h3><div class="body">' +
    fl.map(f => bar(floorLabel(f.floor) + ' (' + f.roomCount + ' غرفة)', f.t, mf, 'g')).join('') + '</div></div>';

  const ma = Math.max(0, ...st.ages);
  h += '<div class="sec"><h3><span>الفئات العمرية</span><span class="num">المتوسط ' + f1(st.avgAge) + '</span></h3><div class="body">' +
    AGE_BUCKETS.map((b, i) => st.ages[i] ? bar(b, st.ages[i], ma) : '').join('') + '</div></div>';

  if (st.reasonList.length) h += '<div class="sec"><h3>أسباب الزيارة</h3><div class="body">' +
    st.reasonList.map(([k, n]) => bar(esc(k), n, st.reasonList[0][1], 'g')).join('') + '</div></div>';

  if (st.alerts.length) h += st.alerts.map(a => '<div class="alert ' + a.lvl + '">' + (a.lvl === 'warn' ? '⚠ ' : 'ℹ ') + esc(a.text) + '</div>').join('');
  return h;
}

function viewCountries(st) {
  return st.countryList.map(c => '<div class="row-item" data-country="' + esc(c.code) + '" title="اضغط لفلترة هذه الدولة">' +
    '<div class="nm"><span>' + c.flag + '</span>' + esc(c.name) + ' <span class="code">' + esc(c.code) + '</span></div>' +
    '<div>' + pills(c) + ' <span class="pill t num">' + c.t + '</span></div></div>').join('');
}

function viewRooms(st) {
  return st.roomList.map(r => '<div class="room-card"><div class="hd" data-room="' + esc(r.room) + '" title="اضغط لفلترة هذه الغرفة">' +
    '<b>غرفة <span class="num">' + esc(r.room) + '</span></b><div>' + pills(r) + ' <span class="pill t num">' + r.guests.length + '</span></div></div><ul>' +
    r.guests.map(g => '<li><span>' + flag(g.nat) + ' ' + esc(g.name || '—') + '</span><span class="meta num">' + (g.age != null ? g.age + ' سنة' : '') + ' ' + (g.status === 'new' ? '<span class="pill n">جديد</span>' : '<span class="pill o">' + (g.nights != null ? since(g.nights) : 'قديم') + '</span>') + '</span></li>').join('') +
    '</ul></div>').join('');
}

function viewGuests(st, rows) {
  const sorted = [...rows].sort((a, b) => HS.roomSort(a.room, b.room));
  return '<table><thead><tr><th>الاسم</th><th>الدولة</th><th>الغرفة</th><th>العمر</th><th>الحالة</th></tr></thead><tbody>' +
    sorted.map(g => '<tr><td>' + esc(g.name || '—') + '</td><td>' + flag(g.nat) + ' <span class="code">' + esc(g.nat) + '</span></td><td class="num">' + esc(g.room || '—') + '</td><td class="num">' + (g.age != null ? g.age : '—') + '</td><td>' +
      (g.status === 'new' ? '<span class="pill n">جديد</span>' : '<span class="pill o num">' + (g.nights != null ? since(g.nights) : 'قديم') + '</span>') + '</td></tr>').join('') +
    '</tbody></table>';
}

/* ============ الأحداث ============ */
$('#calcBtn').onclick = () => run('current');
$('#crawlBtn').onclick = () => run('all');

$('#cumToggle').onchange = e => {
  S.cumulative = e.target.checked; save(); render();
  setStatus(S.cumulative ? 'تم تفعيل التجميع التراكمي. ستُضاف الصفحات التالية إلى البيانات الحالية.' : 'تم إيقاف التجميع. التحليل القادم سيستبدل البيانات.');
};

$('#resetBtn').onclick = () => {
  if (S.rows.length && !confirm('سيتم حذف كل النزلاء المحفوظين في الإضافة. متابعة؟')) return;
  S.rows = []; S.meta = {}; S.filters = { ...DEFAULT_FILTERS };
  save(); refreshFilterOptions(); render(); setStatus('تم المسح.');
};

const setF = (k, v) => { S.filters[k] = v; save(); render(); };
$('#fRooms').oninput = e => setF('rooms', e.target.value);
$('#fStatus').onchange = e => setF('status', e.target.value);
$('#fNat').onchange = e => setF('nat', e.target.value);
$('#fCountry').onchange = e => setF('country', e.target.value);
$('#fClear').onclick = () => { S.filters = { ...DEFAULT_FILTERS }; $('#fCountry').value = ''; save(); render(); };

$('#tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) { S.tab = b.dataset.tab; render(); } };

$('#view').onclick = e => {
  const go = e.target.closest('[data-go]'); if (go) { S.tab = go.dataset.go; render(); return; }
  const c = e.target.closest('[data-country]'); if (c) { S.filters.country = c.dataset.country; $('#fCountry').value = S.filters.country; save(); render(); return; }
  const r = e.target.closest('[data-room]'); if (r) { S.filters.rooms = r.dataset.room; S.tab = 'guests'; save(); render(); }
};

function currentReport() {
  const all = getAll(), rows = getFiltered(all);
  return { rows, st: compute(rows), ctx: { hotel: hotelName(all), now: new Date(), filters: S.filters } };
}
const flash = (btn, txt) => { const o = btn.textContent; btn.textContent = txt; setTimeout(() => btn.textContent = o, 1400); };

$('#copyBtn').onclick = async e => {
  if (!S.rows.length) return;
  const { st, ctx } = currentReport();
  await navigator.clipboard.writeText(toText(st, ctx));
  flash(e.target, 'تم النسخ ✔');
};

$('#csvBtn').onclick = () => {
  if (!S.rows.length) return;
  const { rows } = currentReport();
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'guests-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

$('#reportBtn').onclick = () => { if (S.rows.length) chrome.tabs.create({ url: chrome.runtime.getURL('report.html') }); };

$('#assistBtn').onclick = async () => {
  const w = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({ windowId: w.id });
  window.close();
};

(async () => { await load(); refreshFilterOptions(); render(); })();
