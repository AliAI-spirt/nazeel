// يرفع الإصدار في كل مكان دفعة واحدة:  npm run bump -- 5.3.0
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage: npm run bump -- X.Y.Z'); process.exit(1); }
const edit = (f, fn) => { const p = path.join(root, f), s = fs.readFileSync(p, 'utf8'), t = fn(s); if (s !== t) fs.writeFileSync(p, t); };
edit('src/manifest.json', s => s.replace(/("version":\s*")[\d.]+/, '$1' + v).replace(/("version_name":\s*")[\d.]+/, '$1' + v));
edit('package.json', s => s.replace(/("version":\s*")[\d.]+/, '$1' + v));
edit('README.md', s => s.replace(/(badge\/version-)[\d.]+/, '$1' + v));
edit('CHANGELOG.md', s => /^## \[/m.test(s) && !new RegExp('^## \\[' + v.replace(/\./g, '\\.') + '\\]', 'm').test(s)
  ? s.replace(/^## \[/m, `## [${v}] - ${new Date().toISOString().slice(0, 10)}\n### Changed\n- \n\n## [`) : s);
// package-lock يحتوي الإصدار أيضاً
edit('package-lock.json', s => s.replace(/("name":\s*"nazeel",\s*"version":\s*")[\d.]+/, '$1' + v).replace(/(""\s*:\s*\{\s*"name":\s*"nazeel",\s*"version":\s*")[\d.]+/, '$1' + v));
console.log('✔ version set to ' + v + ' — اكتب ملاحظات الإصدار في CHANGELOG.md ثم: git commit && git tag v' + v);
