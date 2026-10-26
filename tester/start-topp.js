const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const fs = require('fs');
let pass = 0, fail = 0; const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => { const b = await chromium.launch(); const errs = [];
 const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
 await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + u.split('/bilder/')[1] }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
 const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
 await p.goto('https://lias.test/'); await p.waitForTimeout(700);
 await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(300);
 const title = q => q.evaluate(() => document.querySelector('.lh-header__title').innerText);
 const y = q => q.evaluate(() => Math.round(window.scrollY));
 const down = async q => { await q.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 2)); await q.waitForTimeout(200); return y(q); };

 console.log('--- Startsidan vid öppning ---');
 await p.click('nav >> text=Shop'); await p.waitForTimeout(400);
 await p.reload(); await p.waitForTimeout(800);
 ok(await title(p) === 'Lias Hantverkeri' && (await p.$('text=Vad vill du göra?')) !== null, 'Omladdning på Shop → startsidan', await title(p));
 ok(!(await p.$('text=Jag förstår och accepterar')), 'Integritetsrutan visas inte igen (godkännandet sparas)');
 await p.click('nav >> text=Kurser'); await p.waitForTimeout(400);
 const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message)); await p2.goto('https://lias.test/'); await p2.waitForTimeout(800);
 ok(await title(p2) === 'Lias Hantverkeri', 'Appen öppnad på nytt (ny flik) → startsidan', await title(p2));
 ok(await p2.evaluate(() => localStorage.getItem('lias_v1')) === '{"gdprOk":true}', 'Bara godkännandet sparas, inte senaste flik', await p2.evaluate(() => localStorage.getItem('lias_v1')));
 await p2.close();

 console.log('--- Varje flik börjar längst upp ---');
 await p.click('nav >> text=Kurser'); await p.waitForTimeout(900);
 for (const [from, to] of [['Kurser', 'Shop'], ['Shop', 'Galleri'], ['Galleri', 'Kontakt'], ['Kontakt', 'Start'], ['Start', 'Boka'], ['Boka', 'Kurser']]) {
  await p.click('nav >> text=' + from); await p.waitForTimeout(700);
  const d = await down(p);
  await p.click('nav >> text=' + to); await p.waitForTimeout(500);
  ok(d > 100 && await y(p) === 0, `${from} (nedscrollad ${d} px) → ${to} börjar längst upp`, await y(p));
 }
 await p.click('nav >> text=Shop'); await p.waitForTimeout(600); const d1 = await down(p);
 await p.click('nav >> text=Shop'); await p.waitForTimeout(400);
 ok(d1 > 100 && await y(p) === 0, 'Tryck på samma flik igen → längst upp', await y(p));
 await p.click('nav >> text=Start'); await p.waitForTimeout(400); await down(p);
 await p.click('[data-entry="kurser"]'); await p.waitForTimeout(500);
 ok(await title(p) === 'Keramikkurser' && await y(p) === 0, 'Knapp på startsidan (Se kurser) → kurser längst upp', await y(p));
 await p.click('nav >> text=Start'); await p.waitForTimeout(400); await down(p);
 await p.click('[data-entry="boka"]'); await p.waitForTimeout(500);
 ok(await title(p) === 'Boka tid' && await y(p) === 0, 'Knapp på startsidan (Boka tid) → bokning längst upp', await y(p));
 await down(p); await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
 ok(await y(p) === 0, 'Admin-länken i sidfoten → längst upp', await y(p));
 await p.click('nav >> text=Galleri'); await p.waitForTimeout(500); const d2 = await down(p);
 await p.reload(); await p.waitForTimeout(800);
 ok(d2 > 100 && await y(p) === 0 && await title(p) === 'Lias Hantverkeri', 'Omladdning när man scrollat ner → startsidan längst upp', await y(p));
 ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
 console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`); await b.close(); })().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
