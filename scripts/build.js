// يضغط ./src إلى dist/nazeel-v<version>.zip ويكتب SHA256SUMS للتحقق من سلامة الملف.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const v = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8')).version;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `nazeel-v${v}.zip`);
if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-r', '-q', '-X', out, '.', '-x', '*.DS_Store'], { cwd: path.join(root, 'src') });
const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
fs.writeFileSync(path.join(root, 'dist', 'SHA256SUMS.txt'), `${sha}  nazeel-v${v}.zip\n`);
console.log('✔ built ' + path.relative(root, out) + '\n  sha256 ' + sha);
