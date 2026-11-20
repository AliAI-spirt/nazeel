// يفحص: المانيفست، الملفات المشار إليها، صياغة JS، اتساق الإصدار، الأذونات، وتسريب المفاتيح. بلا اعتماديات.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), src = path.join(root, 'src');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const m = JSON.parse(read('src/manifest.json'));
const errs = [], warns = [];
const need = f => { if (!fs.existsSync(path.join(src, f))) errs.push('Missing file: ' + f); };

/* --- المانيفست --- */
if (m.manifest_version !== 3) errs.push('manifest_version must be 3');
if ((m.name || '').length > 75) errs.push('name > 75 chars');
if ((m.description || '').length > 132) errs.push('description > 132 chars (Chrome Web Store limit)');
Object.values(m.icons || {}).forEach(need);
[m.action && m.action.default_popup, m.side_panel && m.side_panel.default_path, m.background && m.background.service_worker].filter(Boolean).forEach(need);
((m.content_scripts || []).flatMap(c => c.js || [])).forEach(need);
((m.declarative_net_request || {}).rule_resources || []).forEach(r => need(r.path));

/* --- الخصوصية: ممنوع الوصول الشامل الدائم --- */
const broad = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/;
(m.host_permissions || []).filter(h => broad.test(h)).forEach(h => errs.push('host_permissions must not be broad: ' + h));
(m.content_scripts || []).forEach(c => (c.matches || []).filter(h => broad.test(h)).forEach(h => errs.push('content_scripts must not match: ' + h)));
if ((m.permissions || []).includes('tabs')) warns.push('"tabs" permission shows a browsing-history warning; prefer activeTab');

/* --- اتساق الإصدار (مصدر الحقيقة: src/manifest.json) --- */
const pkg = JSON.parse(read('package.json'));
if (pkg.version !== m.version) errs.push(`package.json version ${pkg.version} != manifest ${m.version} (run: npm run bump -- ${m.version})`);
if (m.version_name && m.version_name !== m.version) errs.push('version_name != version');
const badge = /badge\/version-([\d.]+)-/.exec(read('README.md'));
if (badge && badge[1] !== m.version) errs.push(`README badge ${badge[1]} != manifest ${m.version}`);
if (!new RegExp('^## \\[' + m.version.replace(/\./g, '\\.') + '\\]', 'm').test(read('CHANGELOG.md'))) errs.push('CHANGELOG.md has no section for ' + m.version);

/* --- صياغة JS --- */
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(src, f)], { stdio: 'pipe' }); }
  catch (e) { errs.push('Syntax error in ' + f); }
}

/* --- تسريب أسرار (مفاتيح Google/GitHub/خاصة) في أي ملف مصدر أو وثيقة --- */
const SECRET = /(AIza[0-9A-Za-z_\-]{35}|ghp_[0-9A-Za-z]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  if (['node_modules', '.git', 'dist'].includes(e.name)) return [];
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
for (const f of walk(root).filter(f => /\.(js|json|md|html|yml|yaml|txt)$/.test(f) && !/package-lock/.test(f))) {
  if (SECRET.test(fs.readFileSync(f, 'utf8'))) errs.push('Possible secret in ' + path.relative(root, f));
}

warns.forEach(w => console.warn('⚠ ' + w));
if (errs.length) { console.error('✖ ' + errs.join('\n✖ ')); process.exit(1); }
console.log('✔ manifest v' + m.version + ' and sources OK');
