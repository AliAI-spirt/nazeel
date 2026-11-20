const test = require('node:test');
const assert = require('node:assert/strict');
const { AI } = require('./helpers');

// عينة ICAO 9303 الرسمية (دولة وهمية UTO)
const TD3 = ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'];

test('MRZ TD3: يقرأ جواز ICAO ويتحقق من كل أرقام التحقق', () => {
  const r = AI.parseMRZ(TD3);
  assert.equal(r.format, 'TD3');
  assert.equal(r.valid, true);
  assert.equal(r.doc, 'L898902C3');
  assert.equal(r.birth, '12/08/1974');
  assert.equal(r.surname, 'ERIKSSON');
  assert.deepEqual(r.given, ['ANNA', 'MARIA']);
});

test('MRZ: يتحمل ترتيب الأسطر المعكوس', () => {
  const r = AI.parseMRZ([TD3[1], TD3[0]]);
  assert.ok(r && r.valid);
});

test('MRZ: يصحح التباس OCR (O مكان 0 في حقل التاريخ)', () => {
  const bad = ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO74O8122F1204159ZE184226B<<<<<10'];
  const r = AI.parseMRZ(bad);
  assert.equal(r.birth, '12/08/1974');
});

test('MRZ: رقم تحقق خاطئ يخفض الدرجة ولا يُعتمد كصالح', () => {
  const bad = ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408123F1204159ZE184226B<<<<<10'];
  const r = AI.parseMRZ(bad);
  assert.equal(r.valid, false);
  assert.ok(r.score < 3);
});

test('normalize: يصحح رقم الجواز من MRZ ويحذر من الصلاحية المنتهية', () => {
  const out = AI.normalize({
    doc_kind: 'foreign_passport', first_name: 'Anna', second_name: '', third_name: '', fourth_name: '',
    last_name: 'Eriksson', mother_name: '', id_number: 'L898902C8', birth_date: '12/08/1974',
    nationality_iso3: 'UTO', nationality_text: '', mrz_lines: TD3, uncertain: []
  });
  assert.equal(out.fields.id_number, 'L898902C3');
  assert.ok(out.notes.some(n => /منتهية الصلاحية/.test(n)));
});

test('normalize: الهوية العراقية تبقى بالنموذج العراقي وبدون رقم جواز', () => {
  const out = AI.normalize({
    doc_kind: 'iraqi_id', first_name: 'علي', second_name: 'حسين', third_name: 'محمد', fourth_name: '',
    last_name: 'الكعبي', mother_name: 'زينب', id_number: '123', birth_date: '١٥/٠٣/١٩٩٠',
    nationality_iso3: 'IRQ', nationality_text: 'عراقي', mrz_lines: [], uncertain: []
  });
  assert.equal(out.form, 'iraqi');
  assert.equal(out.fields.nationality, 'IQ');
  assert.equal(out.fields.birth_date, '15/03/1990');
  assert.equal(out.fields.id_number, '');
});

test('normalize: ملصق التأشيرة لا يُستعمل رقمه كرقم جواز', () => {
  const out = AI.normalize({
    doc_kind: 'visa_sticker', first_name: 'A', second_name: '', third_name: '', fourth_name: '', last_name: 'B',
    mother_name: '', id_number: 'V1234567', birth_date: '', nationality_iso3: 'POL', nationality_text: 'Polish',
    mrz_lines: [], uncertain: []
  });
  assert.equal(out.fields.id_number, '');
});

test('normDate: يرفض التواريخ المستقبلية وغير الصالحة', () => {
  assert.equal(AI.normDate('31/02/1990'), '');
  assert.equal(AI.normDate('01/01/2999'), '');
  assert.equal(AI.normDate('1990-03-15'), '15/03/1990');
});
