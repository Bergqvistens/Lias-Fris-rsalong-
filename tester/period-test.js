// 30 okt 2026: Ekonomi – rullista för period: senaste 24 timmarna / denna vecka / denna månad / i år (kalender, svensk tid).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  // Nu: onsdag 4 november 2026 kl 12:00 svensk tid
  await p.clock.install({ time: new Date('2026-11-04T12:00:00+01:00').getTime() });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const pay = (r, at, amount) => ({ id: r, receipt: r, at, amount, method: 'swish', kind: 'frisor', text: 'Klippning', customer_name: 'Kund ' + r, customer_phone: '0700000000' });
  const P = [
    pay('K-A', '2026-11-04T10:00:00+01:00', 100),    // idag
    pay('K-B', '2026-11-03T14:00:00+01:00', 200),    // i går, inom 24 h
    pay('K-C', '2026-11-02T09:00:00+01:00', 400),    // måndag denna vecka, mer än 24 h sedan
    pay('K-H', '2026-10-31T23:30:00Z', 12800),       // = söndag 1 nov 00:30 svensk tid: november men förra veckan
    pay('K-D', '2026-11-01T15:00:00+01:00', 800),    // söndag förra veckan, denna månad
    pay('K-E', '2026-10-31T10:00:00+01:00', 1600),   // förra månaden, i år
    pay('K-G', '2025-12-31T23:30:00Z', 6400),        // = 1 jan 2026 00:30 svensk tid: i år
    pay('K-F', '2025-12-31T22:30:00Z', 3200),        // = 31 dec 2025 23:30 svensk tid: förra året
  ];
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), { bookings: [], sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: P, photos: [], receiptSeq: 1000 });
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1200);
  await p.click('button:text-is("Ekonomi")'); await p.waitForTimeout(700);
  const read = () => p.evaluate(() => { const k = document.querySelector('[data-period-select]').closest('[data-kpi]');
    return { kpi: k.dataset.kpi, value: Number(k.querySelector('.lh-kpi__value').innerText.replace(/\D/g, '')), sub: k.querySelector('.lh-kpi__sub').innerText, title: document.querySelector('[data-period-title]').innerText,
      rows: [...document.querySelectorAll('[data-list] [data-pay-row]')].filter(r => !r.closest('[data-list="sok"]')).map(r => r.dataset.payRow).sort().join(','), idag: Number(document.querySelector('[data-kpi="idag"] .lh-kpi__value').innerText.replace(/\D/g, '')) }; });
  const opts = await p.$$eval('[data-period-select] option', os => os.map(o => o.innerText));
  ok(opts.join('|') === 'Senaste 24 timmarna|Denna vecka (mån–idag)|Denna månad (1 nov–idag)|I år (2026)', 'Rullistan har fyra val', opts.join(' / '));
  ok((await p.$eval('[data-period-select]', s => s.value)) === 'dygn', 'Förvalt: Senaste 24 timmarna (som förut)');
  const cases = [
    ['dygn', 300, '2 betalningar', 'Betalningar senaste dygnet', 'K-A,K-B'],
    ['vecka', 700, '3 betalningar', 'Betalningar denna vecka', 'K-A,K-B,K-C'],
    ['manad', 14300, '5 betalningar', 'Betalningar denna månad', 'K-A,K-B,K-C,K-D,K-H'],
    ['ar', 22300, '7 betalningar', 'Betalningar i år', 'K-A,K-B,K-C,K-D,K-E,K-G,K-H'],
  ];
  for (const [k, sum, sub, title, rows] of cases) {
    await p.selectOption('[data-period-select]', k); await p.waitForTimeout(200);
    const r = await read();
    ok(r.kpi === k && r.value === sum && r.sub === sub, `${k}: summa ${sum} kr, ${sub}`, `${r.value} kr, ${r.sub}`);
    ok(r.title === title && r.rows === rows, `${k}: listan under följer valet (${title})`, r.rows);
    ok(r.idag === 100, `${k}: rutan Idag är oförändrad (100 kr)`);
    if (k === 'dygn') ok(await p.$eval('[data-kpi="idag"] .lh-kpi__sub', e => e.innerText) === '1 betalning', 'Rutan Idag: "1 betalning" (förut felaktigt "1 betalningar")');
  }
  // en enda betalning: "1 betalning"
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.payments = d.payments.filter(x => x.receipt === 'K-A'); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await p.click('button:text-is("Bilder")'); await p.waitForTimeout(200); await p.click('button:text-is("Ekonomi")'); await p.waitForTimeout(700);
  await p.selectOption('[data-period-select]', 'vecka'); await p.waitForTimeout(200);
  ok((await read()).sub === '1 betalning', 'Rätt böjning: "1 betalning"');
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.payments = []; localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await p.click('button:text-is("Bilder")'); await p.waitForTimeout(200); await p.click('button:text-is("Ekonomi")'); await p.waitForTimeout(700);
  await p.selectOption('[data-period-select]', 'manad'); await p.waitForTimeout(200);
  ok((await p.$eval('[data-list-tom]', e => e.innerText)) === 'Inga betalningar denna månad.', 'Tom period: "Inga betalningar denna månad."');
  // utseende
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), { bookings: [], sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: P, photos: [], receiptSeq: 1000 });
  await p.click('button:text-is("Bilder")'); await p.waitForTimeout(200); await p.click('button:text-is("Ekonomi")'); await p.waitForTimeout(700);
  const sel = await p.$eval('[data-period-select]', s => { const r = s.getBoundingClientRect(), c = s.closest('[data-kpi]').getBoundingClientRect(); return { h: r.height, inside: r.left >= c.left && r.right <= c.right + 0.5, label: !!document.querySelector('label[for="ekonomi-period"]') }; });
  ok(sel.h >= 44 && sel.inside && sel.label, 'Rullistan: minst 44 px hög, ryms i rutan, har etikett för skärmläsare', JSON.stringify(sel));
  await p.selectOption('[data-period-select]', 'ar'); await p.waitForTimeout(200);
  await p.locator('.lh-kpis').screenshot({ path: '/tmp/t/period-390.png' });
  await p.setViewportSize({ width: 320, height: 640 }); await p.evaluate(() => { document.documentElement.style.zoom = 1.3; }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const s = document.querySelector('[data-period-select]'), c = s.closest('[data-kpi]'); return s.getBoundingClientRect().right <= c.getBoundingClientRect().right + 0.5; })()), '320 px + 130 % text: inget sticker ut');
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
