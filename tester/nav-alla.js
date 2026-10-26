const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const fs = require('fs');
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
let pass = 0, fail = 0;
(async () => { const b = await chromium.launch();
 for (const [w, z] of [[320, 1], [320, 1.3], [375, 1.3], [390, 1.3]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + u.split('/bilder/')[1] }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
  const p = await ctx.newPage(); await p.goto('https://lias.test/'); await p.waitForTimeout(700);
  const acc = await p.$('text=Jag förstår och accepterar'); if (acc) { await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(150); await acc.click(); await p.waitForTimeout(200); }
  if (z !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, z);
  for (const tab of ['Start', 'Boka', 'Kurser', 'Shop', 'Kontakt', 'Galleri']) {
   await p.click('nav >> text=' + tab); await p.waitForTimeout(250);
   const clipped = await p.evaluate(() => [...document.querySelectorAll('nav button span')].filter(s => s.scrollWidth > s.clientWidth).map(s => s.innerText + '(' + s.scrollWidth + '>' + s.clientWidth + ')'));
   const okk = clipped.length === 0; okk ? pass++ : fail++;
   if (!okk) console.log('FEL  ' + w + 'px' + (z !== 1 ? '+130%' : '') + ' aktiv ' + tab + ': avklippt ' + clipped.join(','));
  }
  await ctx.close();
 }
 console.log(`RESULTAT: ${pass} OK, ${fail} FEL`); await b.close(); })();
