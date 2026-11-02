// 2 nov 2026: admin-flikarna 2 i rad (Bokningar, Meddelanden / Ekonomi, Bilder), utan att hamna utanför skärmen.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const w of [320, 360, 390, 412, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('https://lias.test/'); await p.waitForSelector('text=Jag förstår och accepterar');
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    await p.evaluate(() => localStorage.setItem('lias_demo_db', JSON.stringify({ bookings: [], courseBookings: [], orders: [], sms: [1, 2, 3].map(i => ({ id: 'x' + i, at: new Date().toISOString(), from: 'K', to: 'Lias mobil', kind: 'till-lia', text: 'Ny bokning ' + i })) })));
    await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
    await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
    const t = await p.$$eval('[data-admintab]', bs => bs.map(x => { const r = x.getBoundingClientRect(); return { id: x.dataset.admintab, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), r: Math.round(r.right), txt: x.innerText.replace(/\s+/g, ' ').trim() }; }));
    const rows = [...new Set(t.map(x => x.y))];
    ok(t.map(x => x.id).join(',') === 'bokningar,meddelanden,ekonomi,bilder' && rows.length === 2 && t[0].y === t[1].y && t[2].y === t[3].y && t[2].y > t[0].y, w + ' px: 2 i rad – Bokningar + Meddelanden, sedan Ekonomi + Bilder', t.map(x => x.id + '@' + x.y).join(' '));
    ok(t.every(x => x.r <= w - 8 && x.x >= 8) && Math.max(...t.map(x => x.w)) - Math.min(...t.map(x => x.w)) <= 1, w + ' px: alla lika breda och innanför skärmen', t.map(x => x.x + '–' + x.r).join(' '));
    ok(t[1].txt === '📨 Meddelanden (3 nya)', w + ' px: hela texten "Meddelanden (3 nya)" syns', t[1].txt);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), w + ' px: ingen sidledsrullning');
    if (w === 412) { await p.locator('.lh-admintabs').screenshot({ path: '/tmp/t/flik-test-412.png' }); }
    await ctx.close();
  }
  ok(errs.length === 0, 'Inga fel', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await b.close();
})();
