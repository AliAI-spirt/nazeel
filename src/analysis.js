/* مكتبة التحليل المشتركة بين النافذة المنبثقة وصفحة التقرير */
(function (g) {
  'use strict';

  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const nd = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- الدول ---------- */
  const OVERRIDE = { US: 'أمريكا', GB: 'بريطانيا', IQ: 'العراق', AE: 'الإمارات' };
  let dn = null;
  try { dn = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { /* ignore */ }

  function flag(c) {
    if (!/^[A-Z]{2}$/.test(c)) return '🌐';
    return String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0)));
  }
  function countryName(c) {
    if (OVERRIDE[c]) return OVERRIDE[c];
    try { const n = dn && dn.of(c); if (n && n !== c) return n; } catch (e) { /* رمز غير صالح */ }
    return 'دولة (' + c + ')';
  }

  /* ---------- التواريخ ---------- */
  function parseDate(s) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(nd(s));
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  const fmtDateTime = d => fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  /* ---------- تنظيف وإثراء السجلات ---------- */
  const cleanName = n => String(n || '').replace(/\bNONE\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const key = r => r.id || [r.name, r.birth, r.arrival, r.room].join('|');

  function floorOf(room) {
    const d = nd(room).replace(/\D/g, '');
    if (d.length >= 3) return d.slice(0, -2);
    return d.length ? '0' : '—';
  }
  const floorLabel = f => f === '0' ? 'الأرضي' : f === '—' ? 'بدون غرفة' : 'الطابق ' + f;

  function enrich(rows, now) {
    const t0 = startOfDay(now || new Date());
    return rows.map(r => {
      const arr = parseDate(r.arrival), b = parseDate(r.birth);
      const room = nd(r.room).trim();
      return {
        key: key(r),
        name: cleanName(r.name),
        phone: (r.phone || '').trim(),
        nat: (r.nat || '').toUpperCase(),
        isIraqi: (r.nat || '').toUpperCase() === 'IQ',
        hotel: r.hotel || '',
        arrival: r.arrival || '',
        birth: r.birth || '',
        room,
        floor: floorOf(room),
        reason: (r.reason || '').trim(),
        status: arr && arr.getTime() === t0.getTime() ? 'new' : 'old',
        nights: arr ? Math.max(0, Math.round((t0 - arr) / 864e5)) : null,
        age: b ? Math.floor((t0 - b) / (365.2425 * 864e5)) : null
      };
    });
  }

  /* ---------- الفلترة ---------- */
  // يدعم: 305 | 301-308 | 3* (طابق كامل) | عدة قيم مفصولة بفاصلة أو مسافة
  function roomMatcher(str) {
    const tokens = nd(str).split(/[\s,،;]+/).filter(Boolean);
    if (!tokens.length) return () => true;
    return room => {
      const r = String(room || '').trim();
      return tokens.some(t => {
        if (t.endsWith('*')) return r.startsWith(t.slice(0, -1));
        const m = /^(\d+)-(\d+)$/.exec(t);
        if (m) { const n = parseInt(r, 10); return !isNaN(n) && n >= +m[1] && n <= +m[2]; }
        return r === t;
      });
    };
  }

  function applyFilters(rows, f) {
    f = f || {};
    const rm = roomMatcher(f.rooms || '');
    const q = (f.q || '').trim().toLowerCase();
    return rows.filter(r => {
      if (!rm(r.room)) return false;
      if (f.status === 'new' && r.status !== 'new') return false;
      if (f.status === 'old' && r.status !== 'old') return false;
      if (f.nat === 'iq' && !r.isIraqi) return false;
      if (f.nat === 'foreign' && r.isIraqi) return false;
      if (f.country && r.nat !== f.country) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.room.includes(q))) return false;
      return true;
    });
  }

  function describeFilters(f) {
    const p = [];
    if (f.rooms) p.push('الغرف: ' + f.rooms);
    if (f.status === 'new') p.push('الواصلون اليوم فقط');
    if (f.status === 'old') p.push('المقيمون منذ قبل اليوم');
    if (f.nat === 'iq') p.push('عراقيون فقط');
    if (f.nat === 'foreign') p.push('أجانب فقط');
    if (f.country) p.push('الدولة: ' + countryName(f.country));
    if (f.q) p.push('بحث: ' + f.q);
    return p.length ? p.join(' | ') : 'بدون فلاتر (كل النزلاء)';
  }

  /* ---------- الحساب ---------- */
  const roomSort = (a, b) => {
    const x = parseInt(a, 10), y = parseInt(b, 10);
    if (!isNaN(x) && !isNaN(y) && x !== y) return x - y;
    return String(a).localeCompare(String(b), 'ar', { numeric: true });
  };
  const AGE_BUCKETS = ['أقل من 18', '18 – 30', '31 – 45', '46 – 60', 'أكبر من 60', 'غير معروف'];
  function ageBucket(a) {
    if (a == null || a < 0 || a > 120) return 5;
    if (a < 18) return 0;
    if (a <= 30) return 1;
    if (a <= 45) return 2;
    if (a <= 60) return 3;
    return 4;
  }

  function compute(rows) {
    const s = {
      total: rows.length, new: 0, old: 0,
      iq: { t: 0, n: 0, o: 0 }, fr: { t: 0, n: 0, o: 0 },
      countries: {}, rooms: {}, floors: {}, reasons: {},
      ages: AGE_BUCKETS.map(() => 0), minors: 0,
      ageSum: 0, ageN: 0, nightsSum: 0, nightsN: 0, longest: null,
      duplicates: [], noRoom: 0, noBirth: 0, alerts: []
    };
    const dupMap = {};

    rows.forEach(r => {
      const isNew = r.status === 'new';
      s[isNew ? 'new' : 'old']++;
      const grp = r.isIraqi ? s.iq : s.fr;
      grp.t++; grp[isNew ? 'n' : 'o']++;

      const code = r.nat || '??';
      const c = s.countries[code] || (s.countries[code] = { code, name: countryName(code), flag: flag(code), t: 0, n: 0, o: 0 });
      c.t++; c[isNew ? 'n' : 'o']++;

      const rk = r.room || '—';
      const rm = s.rooms[rk] || (s.rooms[rk] = { room: rk, floor: r.floor, guests: [], n: 0, o: 0, codes: {} });
      rm.guests.push(r); rm[isNew ? 'n' : 'o']++; rm.codes[code] = true;
      if (!r.room) s.noRoom++;

      const fl = s.floors[r.floor] || (s.floors[r.floor] = { floor: r.floor, t: 0, rooms: {} });
      fl.t++; fl.rooms[rk] = true;

      const rs = r.reason || 'غير محدد';
      s.reasons[rs] = (s.reasons[rs] || 0) + 1;

      s.ages[ageBucket(r.age)]++;
      if (r.age == null) s.noBirth++;
      else if (r.age >= 0 && r.age <= 120) { s.ageSum += r.age; s.ageN++; if (r.age < 18) s.minors++; }

      if (r.nights != null) {
        s.nightsSum += r.nights; s.nightsN++;
        if (!s.longest || r.nights > s.longest.nights) s.longest = r;
      }

      if (r.name) { const k = r.name.toLowerCase() + '|' + r.birth; (dupMap[k] = dupMap[k] || []).push(r); }
    });

    s.duplicates = Object.values(dupMap).filter(a => a.length > 1);
    s.countryList = Object.values(s.countries).sort((a, b) => b.t - a.t);
    s.roomList = Object.values(s.rooms).sort((a, b) => roomSort(a.room, b.room));
    s.floorList = Object.values(s.floors).map(f => ({ ...f, roomCount: Object.keys(f.rooms).filter(x => x !== '—').length })).sort((a, b) => roomSort(a.floor, b.floor));
    s.occupiedRooms = s.roomList.filter(r => r.room !== '—').length;
    s.avgPerRoom = s.occupiedRooms ? s.total / s.occupiedRooms : 0;
    s.avgAge = s.ageN ? s.ageSum / s.ageN : null;
    s.avgNights = s.nightsN ? s.nightsSum / s.nightsN : null;
    s.reasonList = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]);

    if (s.duplicates.length) s.alerts.push({ lvl: 'warn', text: 'يوجد ' + s.duplicates.length + ' اسم/اسماء مكررة (نفس الاسم وتاريخ الميلاد): ' + s.duplicates.map(d => d[0].name).join('، ') });
    if (s.noRoom) s.alerts.push({ lvl: 'warn', text: s.noRoom + ' نزيل بدون رقم غرفة' });
    if (s.noBirth) s.alerts.push({ lvl: 'info', text: s.noBirth + ' نزيل بدون تاريخ ميلاد صالح' });
    if (s.minors) s.alerts.push({ lvl: 'info', text: s.minors + ' نزيل أقل من 18 سنة' });
    const crowded = s.roomList.filter(r => r.room !== '—' && r.guests.length >= 5);
    if (crowded.length) s.alerts.push({ lvl: 'info', text: 'غرف فيها 5 نزلاء أو أكثر: ' + crowded.map(r => r.room + ' (' + r.guests.length + ')').join('، ') });
    return s;
  }

  // مدة الإقامة بصياغة عربية سليمة: اليوم / منذ يوم / منذ يومين / منذ 5 أيام / منذ 12 يوماً
  function since(n) {
    if (n == null) return '';
    if (n <= 0) return 'اليوم';
    if (n === 1) return 'منذ يوم';
    if (n === 2) return 'منذ يومين';
    return n <= 10 ? 'منذ ' + n + ' أيام' : 'منذ ' + n + ' يوماً';
  }
  const days = n => n == null ? '—' : (Math.round(n * 10) / 10) + ' يوم';

  const hotelName = rows => {
    const m = {}; rows.forEach(r => { if (r.hotel) m[r.hotel] = (m[r.hotel] || 0) + 1; });
    const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    return e ? e[0] : 'الفندق';
  };

  /* ---------- مخرجات نصية ---------- */
  const f1 = n => n == null ? '—' : (Math.round(n * 10) / 10).toString();

  function toText(s, ctx) {
    const L = [];
    L.push('🏨 تقرير نزلاء ' + ctx.hotel);
    L.push('📅 ' + fmtDateTime(ctx.now));
    L.push('🔎 ' + describeFilters(ctx.filters));
    L.push('');
    L.push('👥 الإجمالي: ' + s.total + '   (جديد ' + s.new + ' | قديم ' + s.old + ')');
    L.push('🇮🇶 العراقيون: ' + s.iq.t + '   (ج ' + s.iq.n + ' | ق ' + s.iq.o + ')');
    L.push('🌍 الأجانب: ' + s.fr.t + '   (ج ' + s.fr.n + ' | ق ' + s.fr.o + ')');
    L.push('🚪 الغرف المشغولة: ' + s.occupiedRooms + '   (معدل ' + f1(s.avgPerRoom) + ' نزيل/غرفة)');
    if (s.avgAge != null) L.push('🎂 متوسط العمر: ' + f1(s.avgAge) + ' سنة');
    if (s.avgNights != null) L.push('🛏️ متوسط مدة الإقامة: ' + days(s.avgNights));
    if (s.countryList.length) {
      L.push(''); L.push('— الجنسيات —');
      s.countryList.forEach(c => L.push(c.flag + ' ' + c.name + ': ' + c.t + '  (ج ' + c.n + ' | ق ' + c.o + ')'));
    }
    if (s.roomList.length) {
      L.push(''); L.push('— الغرف —');
      s.roomList.forEach(r => L.push('غرفة ' + r.room + ': ' + r.guests.length + ' نزيل — ' + Object.keys(r.codes).map(c => countryName(c)).join('، ')));
    }
    if (s.alerts.length) { L.push(''); L.push('— تنبيهات —'); s.alerts.forEach(a => L.push('⚠️ ' + a.text)); }
    return L.join('\n');
  }

  function toCSV(rows) {
    const head = ['الاسم', 'تاريخ الميلاد', 'العمر', 'الهاتف', 'الجنسية', 'اسم الدولة', 'الفندق', 'تاريخ الدخول', 'الحالة', 'مدة الإقامة', 'الغرفة', 'الطابق', 'سبب الزيارة'];
    // حماية من حقن الصيغ (CSV/Formula Injection): أي خلية تبدأ بـ = + - @ أو Tab/CR تُسبق بفاصلة عليا
    // يُستثنى رقم الهاتف الصرف (+964...) لأنه آمن ولا نريد تغييره
    const SAFE_NUM = /^[+-]?\d[\d\s().-]*$/;
    const neutralize = t => (/^[=+\-@\t\r]/.test(t) && !SAFE_NUM.test(t)) ? "'" + t : t;
    const q = v => '"' + neutralize(String(v == null ? '' : v)).replace(/"/g, '""') + '"';
    const lines = [head.map(q).join(',')];
    rows.forEach(r => lines.push([r.name, r.birth, r.age, r.phone, r.nat, countryName(r.nat), r.hotel, r.arrival, r.status === 'new' ? 'جديد' : 'قديم', since(r.nights), r.room, r.floor, r.reason].map(q).join(',')));
    return '\uFEFF' + lines.join('\r\n');
  }

  g.HS = { nd, esc, flag, countryName, parseDate, fmtDate, fmtDateTime, key, enrich, applyFilters, describeFilters, compute, hotelName, toText, toCSV, floorLabel, roomSort, since, days, AGE_BUCKETS, f1 };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.HS;
