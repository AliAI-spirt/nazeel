// Produces a minified + obfuscated build in dist/protected/ and zips it.
// This raises the bar against casual copying/reading but — like any
// client-side extension — cannot make the code physically uncopiable:
// Chrome must receive runnable JavaScript to execute it. See README
// "Code protection — honest limits" for what this does and does not do.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const terser = require('terser');
const JSObfuscator = require('javascript-obfuscator');
const CleanCSS = require('clean-css');
const { minify: minifyHtml } = require('html-minifier-terser');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist', 'protected');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const OBF = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.85,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,       // must stay false: chrome.* and window.HS/HSImg/AI are cross-file globals
  selfDefending: true,
  disableConsoleOutput: true,
  numbersToExpressions: true,
  splitStrings: true,
  transformObjectKeys: true
};

async function processJs(file) {
  const code = fs.readFileSync(path.join(src, file), 'utf8');
  const squeezed = (await terser.minify(code, { mangle: false, compress: true })).code || code;
  const obf = JSObfuscator.obfuscate(squeezed, OBF).getObfuscatedCode();
  fs.writeFileSync(path.join(out, file), obf);
}

async function processHtml(file) {
  const html = fs.readFileSync(path.join(src, file), 'utf8');
  const min = await minifyHtml(html, {
    collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: false
  });
  fs.writeFileSync(path.join(out, file), min);
}

async function main() {
  const entries = fs.readdirSync(src);
  for (const f of entries) {
    const full = path.join(src, f);
    if (fs.statSync(full).isDirectory()) { fs.cpSync(full, path.join(out, f), { recursive: true }); continue; }
    if (f === 'manifest.json' || f === 'rules.json') { fs.copyFileSync(full, path.join(out, f)); continue; }
    if (f.endsWith('.js')) { await processJs(f); continue; }
    if (f.endsWith('.html')) { await processHtml(f); continue; }
    fs.copyFileSync(full, path.join(out, f));
  }
  // sanity: every obfuscated file must still be valid JS
  for (const f of entries.filter(f => f.endsWith('.js'))) {
    execSync(`node --check "${path.join(out, f)}"`);
  }
  const v = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).version;
  const zipPath = path.join(root, 'dist', `nazeel-v${v}-protected.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`zip -r -q "${zipPath}" . -x "*.DS_Store"`, { cwd: out });
  console.log('✔ protected build: dist/nazeel-v' + v + '-protected.zip');
}
main().catch(e => { console.error(e); process.exit(1); });
