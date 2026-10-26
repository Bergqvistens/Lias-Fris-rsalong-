// Tillbaka i produktruta, galleriets bildvisning och kvittoruta – synlig efter scroll, fungerar, telefonens bakåtknapp
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (w, h, zoom = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
      return r.abort();
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    if (zoom !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    p.ctx = ctx; return p;
  };
  const title = p => p.$eval('.lh-header__title', h => h.innerText);
  // Är knappen synlig på skärmen och överst (inte täckt)?
  const visible = (p, sel) => p.evaluate(sel => {
    const b = document.querySelector(sel); if (!b) return 'saknas';
    const r = b.getBoundingClientRect();   // mätt: med CSS-zoom anger både r och innerHeight skärmpixlar
    if (r.width < 1 || r.top < -1 || r.bottom > innerHeight + 1) return `utanför skärmen (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, höjd ${innerHeight})`;
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el && (el === b || b.contains(el)) ? 'ok' : 'täckt av ' + (el ? el.className || el.tagName : 'inget');
  }, sel);
  const scrollBox = (p, sel) => p.evaluate(sel => { const d = document.querySelector(sel); d.scrollTop = d.scrollHeight; return Math.round(d.scrollTop); }, sel);

  for (const [w, h, z] of [[320, 568, 1], [390, 844, 1], [430, 932, 1], [390, 844, 1.3]]) {
    const tag = `${w}×${h}${z !== 1 ? ' + 130 % text' : ''}`;
    console.log(`--- ${tag} ---`);
    const p = await open(w, h, z);

    // Produktruta
    await p.click('nav >> text=Shop'); await p.waitForTimeout(700);
    await p.click('[data-product="s-bowl"] .lh-pcard__open'); await p.waitForTimeout(400);
    const sc = await scrollBox(p, '.lh-dialog');
    ok(await visible(p, '.lh-dialog [data-tillbaka="topp"]') === 'ok', `${tag} Produkt: "Tillbaka" överst syns efter scroll`, `scrollat ${sc} px, ` + await visible(p, '.lh-dialog [data-tillbaka="topp"]'));
    ok(await visible(p, '.lh-dialog [data-tillbaka="botten"]') === 'ok', `${tag} Produkt: "Tillbaka" längst ner syns`);
    if (w === 320 && z === 1) await p.screenshot({ path: '/tmp/t/tb-produkt-320.png' });
    if (w === 390 && z === 1) await p.screenshot({ path: '/tmp/t/tb-produkt-390.png' });
    await p.click('.lh-dialog [data-tillbaka="topp"]'); await p.waitForTimeout(300);
    ok(!(await p.$('[role="dialog"]')) && await title(p) === 'Keramikshop', `${tag} Produkt: Tillbaka (överst) stänger rutan, kvar i shoppen`);
    ok(await p.evaluate(() => !(history.state && history.state.lhRuta)), `${tag} Produkt: ingen extra historikpost kvar efter stängning`);
    await p.click('[data-product="s-bowl"] .lh-pcard__open'); await p.waitForTimeout(300);
    await scrollBox(p, '.lh-dialog');
    await p.click('.lh-dialog [data-tillbaka="botten"]'); await p.waitForTimeout(300);
    ok(!(await p.$('[role="dialog"]')), `${tag} Produkt: Tillbaka (längst ner) stänger rutan`);
    await p.click('[data-product="s-bowl"] .lh-pcard__open'); await p.waitForTimeout(300);
    await p.goBack(); await p.waitForTimeout(400);
    ok(!(await p.$('[role="dialog"]')) && await title(p) === 'Keramikshop' && p.url() === 'https://lias.test/', `${tag} Produkt: telefonens bakåtknapp stänger rutan och stannar i shoppen`, await title(p));

    // Galleriets bildvisning
    await p.click('nav >> text=Galleri'); await p.waitForTimeout(700);
    await p.click('[data-gallery="lia-1"]'); await p.waitForTimeout(400);
    await scrollBox(p, '.lh-lightbox');
    ok(await visible(p, '.lh-lightbox [data-tillbaka="topp"]') === 'ok', `${tag} Galleri: "Tillbaka" syns`, await visible(p, '.lh-lightbox [data-tillbaka="topp"]'));
    if (w === 390 && z === 1) await p.screenshot({ path: '/tmp/t/tb-galleri-390.png' });
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
    await p.goBack(); await p.waitForTimeout(400);
    ok(!(await p.$('[role="dialog"]')) && await title(p) === 'Galleri', `${tag} Galleri: efter bläddring stänger ett tryck på bakåtknappen bildvisningen`);
    await p.click('[data-gallery="herrklipp"]'); await p.waitForTimeout(300);
    await p.click('.lh-lightbox [data-tillbaka="topp"]'); await p.waitForTimeout(300);
    ok(!(await p.$('[role="dialog"]')) && await p.evaluate(() => document.activeElement.getAttribute('data-gallery') === 'herrklipp'), `${tag} Galleri: Tillbaka stänger, fokus på bilden man öppnade`);
    await p.ctx.close();
  }

  // Kvittoruta i admin (demo)
  console.log('--- Kvittoruta ---');
  const a = await open(320, 568);
  await a.evaluate(() => localStorage.setItem('lias_demo_db', JSON.stringify({ bookings: [], sms: [], courseBookings: [], orders: [{ id: 'o1', number: 'LH-1001', created_at: new Date(Date.now() - 600000).toISOString(), items: [{ id: 's-cup', name: 'Handgjord kaffekopp', qty: 2, price: 280 }, { id: 's-bowl', name: 'Keramikskål', qty: 1, price: 350 }], total: 910, payment: 'swish', customer_name: 'Sara Strand', customer_phone: '0707778899', customer_email: 's@b.se', status: 'betald' }], sold: {}, orderSeq: 1001, payments: [], photos: [], receiptSeq: 1000 })));
  await a.click('footer >> text=Admin'); await a.waitForTimeout(400);
  await a.fill('input[type=email]', 'lia@demo.se'); await a.fill('input[type=password]', 'demo1234'); await a.click('button:has-text("Logga in")'); await a.waitForTimeout(1200);
  await a.click('[data-admintab="ekonomi"]'); await a.waitForTimeout(700);
  await a.click('[data-list="dygn"] [data-pay-row="LH-1001"]'); await a.waitForTimeout(300);
  await scrollBox(a, '.lh-dialog');
  ok(await visible(a, '.lh-dialog [data-tillbaka="topp"]') === 'ok' && await visible(a, '.lh-dialog [data-tillbaka="botten"]') === 'ok', 'Kvitto (320×568): Tillbaka överst och längst ner syns efter scroll');
  await a.screenshot({ path: '/tmp/t/tb-kvitto-320.png' });
  await a.click('.lh-dialog [data-tillbaka="botten"]'); await a.waitForTimeout(300);
  ok(!(await a.$('[role="dialog"]')) && await title(a) === 'Admin', 'Kvitto: Tillbaka stänger, kvar i admin');
  await a.click('[data-list="dygn"] [data-pay-row="LH-1001"]'); await a.waitForTimeout(300);
  await a.goBack(); await a.waitForTimeout(400);
  ok(!(await a.$('[role="dialog"]')) && await title(a) === 'Admin' && !!(await a.$('[data-admintab="ekonomi"][aria-pressed="true"]')), 'Kvitto: telefonens bakåtknapp stänger rutan, kvar på ekonomifliken');
  await a.ctx.close();

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
