// Brun ram (1 px #91744A) på innehållsrutor – inte på knappar, fält, menyn eller markerade lägen
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const BROWN = 'rgb(145, 116, 74)';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });   // som en mobilskärm
  await ctx.route('**/*', r => { const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://lias.test/'); await p.waitForSelector('text=Jag förstår och accepterar');
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 });
  const look = sel => p.$$eval(sel, es => es.map(e => { const s = getComputedStyle(e); return [s.borderTopWidth, s.borderTopColor, s.borderLeftColor]; }));
  for (const tab of ['Start', 'Kurser', 'Shop', 'Kontakt', 'Galleri']) {
    await p.click('nav >> text=' + tab); await p.waitForTimeout(600);
    const cards = await look('main .lh-card, main .lh-entry');
    ok(cards.length > 0 && cards.every(c => c[0] === '1px' && c[1] === BROWN && c[2] === BROWN), `${tab}: alla ${cards.length} innehållsrutor har brun ram 1 px (mobilskärm 3×)`, cards.length ? JSON.stringify(cards[0]) : 'inga rutor');
  }
  const btns = await look('main .lh-btn, nav button, nav a');
  ok(btns.every(c => c[1] !== BROWN), 'Knappar och menyn har ingen brun ram', btns.length + ' knappar');
  await p.click('nav >> text=Kontakt'); await p.waitForTimeout(400);
  const inputs = await look('main input, main textarea');
  ok(inputs.length > 0 && inputs.every(c => c[1] !== BROWN), 'Inmatningsfälten har kvar sin egen kant', inputs.length + ' fält');
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await b.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
