const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(process.argv[2], 'utf8');
  // Förhandsöversatt index.html (script id=lh-app): testerna kör EXAKT den kod som ligger på GitHub
  const pre = src.match(/<script id="lh-app">\n?([\s\S]*?)<\/script>/);
  const m = pre || src.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
  let js;
  if (pre) {
    js = pre[1];
    if (/babel/i.test(src.replace(/<!--[\s\S]*?-->/g, ''))) { console.log('FEL: Babel finns kvar i den byggda sidan'); process.exit(1); }
    fs.writeFileSync('/tmp/t/strict.js', '"use strict";' + js);
    try { require('child_process').execSync('node --check /tmp/t/strict.js', { stdio: 'pipe' }); console.log('Strikt syntax: OK (förhandsöversatt, ' + Math.round(js.length / 1024) + ' KB)'); }
    catch (e) { console.log('STRIKT SYNTAXFEL: ' + e.stderr.toString().split('\n').filter(l => /Error/.test(l)).join(' ')); process.exit(1); }
  } else {
  try {
    js = esbuild.transformSync(m[1], { loader: 'jsx', format: "iife" }).code;
  } catch (e) { console.log('SYNTAXFEL:\n' + e.errors.map(x => `rad ${x.location && x.location.line}: ${x.text}`).join('\n')); process.exit(1); }
  const esm = esbuild.transformSync(m[1], { loader: 'jsx', format: 'esm' }).code;
  fs.writeFileSync('/tmp/t/strict.mjs', esm.replace(/ReactDOM\.createRoot[\s\S]*$/, ''));
  try { require('child_process').execSync('node --check /tmp/t/strict.mjs', { stdio: 'pipe' }); console.log('Strikt syntax: OK'); }
  catch (e) { console.log('STRIKT SYNTAXFEL: ' + e.stderr.toString().split('\n').filter(l => /Error/.test(l)).join(' ')); process.exit(1); }
  }
  const shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8');
  const html = src.replace(/<script[^>]*cdnjs[^>]*><\/script>/g, '')
    .replace(m[0], () => `<script src="react-shim.js"></script><script src="app.js"></script>`);
  fs.writeFileSync("/tmp/t/app.js", js);
  fs.writeFileSync('/tmp/t/run.html', html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 850 } });
  const errs = [];
  p.on('console', x => { if (x.type() === 'error') errs.push(x.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('file:///tmp/t/run.html');
  await p.waitForTimeout(1500);
  console.log('Körfel:', errs.length ? errs.join('\n') : 'inga');
  console.log('Synlig text:', (await p.innerText('body')).slice(0, 120).replace(/\n/g, ' | '));
  await b.close();
})();

// Kontroll av det vanliga bildskriptet (window.LH_IMG), som inte går genom Babel
{ const fs2 = require('fs'); const s2 = fs2.readFileSync(process.argv[2], 'utf8');
  const a = s2.lastIndexOf('<script>', s2.indexOf('window.LH_IMG')), e = s2.indexOf('</script>', a);
  try { const w = {}; new Function('window', s2.slice(a + 8, e))(w); console.log('Bildskript: OK (' + Object.keys(w.LH_IMG).length + ' bilder)'); }
  catch (err) { console.log('Bildskript: FEL – ' + err.message); process.exitCode = 1; } }

// Kontroll: varje bildsökväg bilder/... i index.html finns som fil i mappen bilder/
{ const fs3 = require('fs'), path3 = require('path'); const s3 = fs3.readFileSync(process.argv[2], 'utf8');
  const dir3 = path3.join(path3.dirname(process.argv[2]), 'bilder');
  const refs = [...new Set([...s3.matchAll(/bilder\/([A-Za-z0-9._-]+\.(?:webp|jpg|png))/g)].map(m => m[1]))];
  const saknas = refs.filter(r => !fs3.existsSync(path3.join(dir3, r)));
  const oanvanda = fs3.existsSync(dir3) ? fs3.readdirSync(dir3).filter(f => !refs.includes(f)) : [];
  console.log('Bildfiler: ' + refs.length + ' sökvägar, ' + (saknas.length ? 'SAKNAS: ' + saknas.join(', ') : 'alla finns') + (oanvanda.length ? ' | oanvända filer: ' + oanvanda.join(', ') : ''));
  if (saknas.length) process.exitCode = 1; }
