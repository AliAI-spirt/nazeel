// يطبع قسم الإصدار من CHANGELOG.md (يستعمله workflow الإصدار):  node scripts/release-notes.js 5.2.0
const fs = require('fs'), path = require('path');
const v = process.argv[2], lines = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').split('\n');
const start = lines.findIndex(l => l.startsWith('## [' + v + ']'));
if (start < 0) { console.error('No CHANGELOG section for ' + v); process.exit(1); }
let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
if (end < 0) end = lines.length;
process.stdout.write(lines.slice(start + 1, end).join('\n').trim() + '\n');
