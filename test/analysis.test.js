const test = require('node:test');
const assert = require('node:assert/strict');
const { HS } = require('./helpers');

const NOW = new Date(2026, 10, 20);
const row = (o = {}) => ({ id: '1', name: 'Ali', birth: '01/01/1990', phone: '0770', nat: 'IQ', hotel: 'H', arrival: '20/11/2026', room: '305', reason: 'x', ...o });

test('enrich: يحدد الجديد والقديم والطابق والعمر', () => {
  const [a, b] = HS.enrich([row(), row({ id: '2', arrival: '18/11/2026', room: '1204' })], NOW);
  assert.equal(a.status, 'new');
  assert.equal(b.status, 'old');
  assert.equal(b.nights, 2);
  assert.equal(a.floor, '3');
  assert.equal(b.floor, '12');
  assert.equal(a.age, 36);
});

test('enrich: يقبل الأرقام العربية-الهندية في الغرفة والتاريخ', () => {
  const [r] = HS.enrich([row({ room: '٣٠٥', arrival: '٢٠/١١/٢٠٢٦' })], NOW);
  assert.equal(r.room, '305');
  assert.equal(r.status, 'new');
});

test('فلتر الغرف: 305 | 301-308 | 3*', () => {
  const rows = HS.enrich([305, 301, 310, 410].map((n, i) => row({ id: String(i), room: String(n) })), NOW);
  const f = rooms => HS.applyFilters(rows, { rooms }).map(r => r.room);
  assert.deepEqual(f('305'), ['305']);
  assert.deepEqual(f('301-308'), ['305', '301']);
  assert.deepEqual(f('3*'), ['305', '301', '310']);
  assert.deepEqual(f('305, 410'), ['305', '410']);
});

test('فلتر الجنسية: عراقي/أجنبي', () => {
  const rows = HS.enrich([row({ id: '1' }), row({ id: '2', nat: 'DE' })], NOW);
  assert.equal(HS.applyFilters(rows, { nat: 'iq' }).length, 1);
  assert.equal(HS.applyFilters(rows, { nat: 'foreign' })[0].nat, 'DE');
});

test('CSV: يحمي من حقن الصيغ ويحافظ على أرقام الهاتف الدولية', () => {
  const rows = HS.enrich([row({ name: '=HYPERLINK("http://evil")', phone: '+9647701234567', reason: '@SUM(1)' })], NOW);
  const csv = HS.toCSV(rows);
  assert.ok(csv.includes('"\'=HYPERLINK'), 'الصيغة يجب أن تُعطَّل');
  assert.ok(csv.includes('"\'@SUM(1)"'), '@ يجب أن تُعطَّل');
  assert.ok(csv.includes('"+9647701234567"'), 'الهاتف الصرف يبقى كما هو');
  assert.ok(csv.startsWith('\uFEFF'), 'BOM لتوافق Excel مع UTF-8');
});

test('esc: يهرّب HTML', () => {
  assert.equal(HS.esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
