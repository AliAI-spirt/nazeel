'use strict';
(async () => {
  const { since, days, esc, flag, enrich, applyFilters, describeFilters, compute, hotelName, fmtDateTime, floorLabel, roomSort, AGE_BUCKETS, f1 } = HS;
  const root = document.getElementById('root');
  const d = await chrome.storage.local.get(['rows', 'meta', 'filters', 'cumulative']);
  const now = new Date();
  const all = enrich(d.rows || [], now);
  const filters = d.filters || {};
  const rows = applyFilters(all, filters);
  const st = compute(rows);
  const meta = d.meta || {};

  if (!all.length) { root.innerHTML = '<p style="text-align:center;padding:40px">لا توجد بيانات. حلّل صفحة النزلاء من الإضافة أولاً.</p>'; return; }

  const bar = (l, v, max) => '<div class="bar"><span>' + l + '</span><div class="t"><i style="width:' + (max ? Math.round(v / max * 100) : 0) + '%"></i></div><b class="num">' + v + '</b></div>';
  const stat = g => g.status === 'new' ? '<span class="pill n">جديد</span>' : '<span class="pill o">' + (g.nights != null ? since(g.nights) : 'قديم') + '</span>';

  let h = '<div class="top"><div><h1>تقرير نزلاء ' + esc(hotelName(all)) + '</h1><p>' + fmtDateTime(now) + ' — ' +
    (d.cumulative ? 'تجميع تراكمي' : 'صفحة واحدة') + (meta.total ? ' — ' + all.length + ' من ' + meta.total + ' نزيل مسجل' : '') +
    '</p></div><div class="tools"><button onclick="window.print()">طباعة / حفظ PDF</button></div></div>';

  h += '<div class="filters"><b>الفلاتر:</b> ' + esc(describeFilters(filters)) + ' <span class="num">(' + rows.length + ' من ' + all.length + ')</span></div>';

  h += '<div class="kpis">' +
    '<div class="kpi"><div class="v num">' + st.total + '</div><div class="l">إجمالي النزلاء</div><div class="s num">جديد ' + st.new + ' | قديم ' + st.old + '</div></div>' +
    '<div class="kpi iq"><div class="v num">' + st.iq.t + '</div><div class="l">العراقيون</div><div class="s num">جديد ' + st.iq.n + ' | قديم ' + st.iq.o + '</div></div>' +
    '<div class="kpi fr"><div class="v num">' + st.fr.t + '</div><div class="l">الأجانب</div><div class="s num">جديد ' + st.fr.n + ' | قديم ' + st.fr.o + '</div></div>' +
    '<div class="kpi"><div class="v num">' + st.occupiedRooms + '</div><div class="l">الغرف المشغولة</div><div class="s">معدل ' + f1(st.avgPerRoom) + ' نزيل/غرفة</div></div></div>';

  if (st.alerts.length) h += '<h2>تنبيهات</h2>' + st.alerts.map(a => '<div class="alert ' + a.lvl + '">' + esc(a.text) + '</div>').join('');

  const mc = st.countryList.length ? st.countryList[0].t : 0, ma = Math.max(0, ...st.ages);
  h += '<div class="cols"><div><h2>الجنسيات</h2>' + st.countryList.map(c => bar(c.flag + ' ' + esc(c.name), c.t, mc)).join('') + '</div>' +
    '<div><h2>الفئات العمرية <span class="num" style="font-weight:400;font-size:12px">(المتوسط ' + f1(st.avgAge) + ')</span></h2>' +
    AGE_BUCKETS.map((b, i) => st.ages[i] ? bar(b, st.ages[i], ma) : '').join('') +
    '<h2>الإقامة</h2><p>متوسط مدة الإقامة: <b>' + days(st.avgNights) + '</b>' +
    (st.longest ? ' — الأطول: ' + esc(st.longest.name) + ' (' + since(st.longest.nights) + '، غرفة ' + esc(st.longest.room || '—') + ')' : '') + '</p></div></div>';

  h += '<h2>تفصيل الجنسيات</h2><table><thead><tr><th>الدولة</th><th>الرمز</th><th>جديد</th><th>قديم</th><th>المجموع</th></tr></thead><tbody>' +
    st.countryList.map(c => '<tr><td>' + c.flag + ' ' + esc(c.name) + '</td><td class="num">' + esc(c.code) + '</td><td class="num">' + c.n + '</td><td class="num">' + c.o + '</td><td class="num"><b>' + c.t + '</b></td></tr>').join('') + '</tbody></table>';

  const fl = st.floorList.filter(f => f.floor !== '—');
  if (fl.length) h += '<h2>الطوابق</h2><table><thead><tr><th>الطابق</th><th>عدد الغرف المشغولة</th><th>عدد النزلاء</th></tr></thead><tbody>' +
    fl.map(f => '<tr><td>' + floorLabel(f.floor) + '</td><td class="num">' + f.roomCount + '</td><td class="num">' + f.t + '</td></tr>').join('') + '</tbody></table>';

  h += '<h2>الغرف ونزلاؤها</h2><table><thead><tr><th>الغرفة</th><th>العدد</th><th>النزلاء</th></tr></thead><tbody>' +
    st.roomList.map(r => '<tr><td class="num"><b>' + esc(r.room) + '</b></td><td class="num">' + r.guests.length + '</td><td>' +
      r.guests.map(g => flag(g.nat) + ' ' + esc(g.name || '—') + ' ' + stat(g)).join('<br>') + '</td></tr>').join('') + '</tbody></table>';

  const sorted = [...rows].sort((a, b) => roomSort(a.room, b.room));
  h += '<h2>سجل النزلاء الكامل</h2><table><thead><tr><th>#</th><th>الاسم</th><th>الميلاد</th><th>العمر</th><th>الهاتف</th><th>الجنسية</th><th>الدخول</th><th>الغرفة</th><th>الحالة</th><th>سبب الزيارة</th></tr></thead><tbody>' +
    sorted.map((g, i) => '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(g.name || '—') + '</td><td class="num">' + esc(g.birth) + '</td><td class="num">' + (g.age != null ? g.age : '—') + '</td><td class="num">' + esc(g.phone || '—') + '</td><td>' + flag(g.nat) + ' ' + esc(HS.countryName(g.nat)) + '</td><td class="num">' + esc(g.arrival) + '</td><td class="num">' + esc(g.room || '—') + '</td><td>' + stat(g) + '</td><td>' + esc(g.reason || '—') + '</td></tr>').join('') + '</tbody></table>';

  h += '<div class="foot">جديد = تاريخ الدخول هو اليوم | قديم = دخول سابق. أُنشئ بواسطة إضافة إحصائيات نزلاء الفندق.</div>';
  root.innerHTML = h;
})();
