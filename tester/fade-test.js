// Sidfoten: mjuk övergång turkos → brun, text på helt brun yta med kontrast ≥ 4,5, inga glapp
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const fs = require('fs');
let pass = 0, fail = 0; const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = c => { const v = c.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => { const b = await chromium.launch(); const errs = [];
 for (const [w, z] of [[320, 1], [390, 1], [430, 1], [390, 1.3]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://lias.test/'); await p.waitForTimeout(700);
  const acc = await p.$('text=Jag förstår och accepterar'); if (acc) { await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(150); await acc.click(); await p.waitForTimeout(200); }
  if (z !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, z);
  const tag = `${w}px${z !== 1 ? ' + 130 % text' : ''}`;
  for (const tab of ['Start', 'Boka', 'Kurser', 'Shop', 'Kontakt', 'Galleri', 'Admin']) {
   if (tab === 'Admin') { await p.click('footer >> text=Admin'); } else { await p.click(`nav >> text=${tab}`); }
   await p.waitForTimeout(600);
   const r = await p.evaluate(() => {
     const f = document.querySelector('footer'), m = document.querySelector('main');
     const fr = f.getBoundingClientRect(), mr = m.getBoundingClientRect();
     const rgb = c => c.match(/\d+/g).slice(0, 3).map(Number);
     const texts = [...f.querySelectorAll('p, button')].map(e => ({ t: e.innerText, off: e.getBoundingClientRect().top - fr.top, c: rgb(getComputedStyle(e).color), op: parseFloat(getComputedStyle(e).opacity) }));
     return { gap: Math.round(fr.top - mr.bottom), bgImg: getComputedStyle(f).backgroundImage, mainBg: rgb(getComputedStyle(m).backgroundColor), texts };
   });
   const first = r.bgImg.match(/rgb\(([^)]+)\)/); const startCol = first ? first[1].split(',').map(Number) : null;
   const seamless = r.gap === 0 && startCol && startCol.join() === r.mainBg.join();
   const brown = [107, 81, 56];
   const minOff = Math.min(...r.texts.map(t => t.off));
   const low = r.texts.filter(t => t.op < 1 || cr(t.c, brown) < 4.5).map(t => `${t.t} ${cr(t.c, brown).toFixed(2)}`);
   ok(seamless && minOff >= 96 && low.length === 0, `${tag} ${tab}: övergång utan kant/glapp, text på brun yta, kontrast ≥ 4,5`, `glapp ${r.gap}, start ${startCol}, sida ${r.mainBg}, första text ${Math.round(minOff)} px ned${low.length ? ', låg kontrast: ' + low.join('; ') : ''}`);
  }
  if (w === 390 && z === 1) { await p.click('nav >> text=Start'); await p.waitForTimeout(500); await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 2)); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/t/fade-390.png' }); }
  await ctx.close();
 }
 ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
 console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`); await b.close(); })();
