// Bygger index.html från källfilen (JSX) – översätter appen i förväg så att telefonen slipper Babel.
// Användning: node bygg.js <källfil.html> <index.html>
// Kräver esbuild (NODE_PATH eller /opt/npm-tools/node_modules).
const fs = require('fs');
let esbuild; try { esbuild = require('esbuild'); } catch (e) { esbuild = require('/opt/npm-tools/node_modules/esbuild'); }
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.log('Användning: node bygg.js <källfil.html> <index.html>'); process.exit(1); }
let html = fs.readFileSync(src, 'utf8');
const BABEL = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>\n';
const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!m) { console.log('FEL: hittar inget <script type="text/babel"> i källfilen'); process.exit(1); }
if (html.split(BABEL).length !== 2) { console.log('FEL: hittar inte Babel-raden exakt en gång'); process.exit(1); }
let js;
try {
  js = esbuild.transformSync(m[1], { loader: 'jsx', format: 'iife', minify: true, target: 'es2019', charset: 'utf8', legalComments: 'none' }).code;
} catch (e) { console.log('SYNTAXFEL:\n' + e.errors.map(x => `rad ${x.location && x.location.line}: ${x.text}`).join('\n')); process.exit(1); }
if (/<\/script/i.test(js)) { console.log('FEL: den översatta koden innehåller </script'); process.exit(1); }
html = html.replace(BABEL, '').replace(m[0], () => `<script id="lh-app">\n${js}</script>`);
fs.writeFileSync(out, html);
console.log(`Byggt: ${out} (${Math.round(html.length / 1024)} KB, appkod ${Math.round(js.length / 1024)} KB, källkod ${Math.round(m[1].length / 1024)} KB)`);
