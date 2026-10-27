// Lias schema: "Klippning: namn tid", läge Pågår nu / Kommande / Klar med färg + text, byter av sig själv
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
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
  // Fast klocka: tisdag 3 november 2026 kl 12:00 svensk tid
  const T0 = new Date('2026-11-03T12:00:00+01:00').getTime();
  await p.clock.install({ time: T0 });
  await p.goto('https://lias.test/'); await p.waitForTimeout(700);
  if (await p.$('text=Jag förstår och accepterar')) {
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
  }
  const at = (hhmm, min, day = '2026-11-03') => ({ s: new Date(`${day}T${hhmm}:00+01:00`).toISOString(), e: new Date(new Date(`${day}T${hhmm}:00+01:00`).getTime() + min * 60000).toISOString() });
  const bk = (id, t, cust, person, svc, price) => ({ id, created_at: new Date(T0 - 86400000).toISOString(), service_ids: ['x'], service_names: svc, price, starts_at: t.s, ends_at: t.e, customer_name: cust, customer_phone: '0701234567', customer_email: 'a@b.se', status: 'bokad', person_name: person, group_id: person ? 'g1' : null });
  const db = { bookings: [
    bk('igar', at('11:00', 30, '2026-11-02'), 'Igår Kund', null, 'Herr kort hår', 395),
    bk('klar', at('10:00', 30), 'Anna Andersson', null, 'Dam kort hår', 495),
    bk('kalle', at('11:45', 20), 'Eva Ek', 'Kalle', 'Herr kort hår', 395),
    bk('anna', at('12:05', 30), 'Eva Ek', 'Anna', 'Dam kort hår', 495),
    bk('lisa', at('12:35', 25), 'Eva Ek', 'Lisa', 'Barnklippning', 295),
    bk('imorgon', at('10:00', 20, '2026-11-04'), 'Morgon Kund', null, 'Herr kort hår', 395),
  ], sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000 };
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), db);
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const read = () => p.$$eval('[data-booking]', cs => cs.map(c => ({ id: c.getAttribute('data-booking'), st: c.getAttribute('data-state'), badge: c.querySelector('[data-badge]').innerText.trim(), title: c.querySelector('[data-cut-title]').innerText.trim(), avboka: !!c.querySelector('button'), bg: getComputedStyle(c).backgroundColor })));

  console.log('--- Kl 12:00 ---');
  let r = await read();
  const by = id => r.find(x => x.id === id) || {};
  ok(!by('igar').id, 'Gårdagens bokning visas inte');
  ok(!!by('klar').id && by('klar').st === 'klar' && by('klar').badge === 'Klar', 'Dagens avklarade bokning ligger kvar som "Klar" (10:00–10:30)');
  ok(by('kalle').st === 'pagar' && by('kalle').badge === 'Pågår nu' && by('anna').st === 'kommande' && by('anna').badge === 'Kommande' && by('lisa').st === 'kommande', 'Kl 12:00: Kalle (11:45–12:05) pågår nu, Anna och Lisa kommande', r.map(x => x.id + ':' + x.st).join(' '));
  ok(by('imorgon').st === 'kommande', 'Morgondagens bokning är "Kommande"');
  ok(by('anna').title === 'Klippning: Anna 12:05–12:35' && by('kalle').title === 'Klippning: Kalle 11:45–12:05' && by('klar').title === 'Klippning: Anna Andersson 10:00–10:30', 'Rubrik "Klippning: namn tid" (förnamn i grupp, annars kundens namn)', by('anna').title + ' | ' + by('klar').title);
  ok(new Set([by('kalle').bg, by('lisa').bg, by('klar').bg]).size === 3, 'Tre olika färger för pågår, kommande och klar', [by('kalle').bg, by('lisa').bg, by('klar').bg].join(' / '));
  ok(!by('klar').avboka && by('lisa').avboka && by('kalle').avboka, 'Avboka finns inte på klara tider');
  const cs = await p.$$eval('[data-booking]', cs => cs.map(c => { const b = c.querySelector('[data-badge]'), t = c.querySelector('[data-cut-title]'); return { st: c.getAttribute('data-state'), b: [getComputedStyle(b).color, getComputedStyle(b).backgroundColor], t: [getComputedStyle(t).color, getComputedStyle(c).backgroundColor] }; }));
  const low = cs.flatMap(x => [['märke ' + x.st, contrast(...x.b)], ['rubrik ' + x.st, contrast(...x.t)]]).filter(x => x[1] < 4.5);
  ok(low.length === 0, 'Text och märken har kontrast ≥ 4,5 i alla lägen', low.map(x => x[0] + ' ' + x[1].toFixed(2)).join(', ') || 'alla');
  await p.screenshot({ path: '/tmp/t/schema-1200.png', fullPage: true });

  console.log('--- Klockan går (utan omladdning) ---');
  await p.clock.fastForward('31:00'); await p.waitForTimeout(300);
  r = await read();
  ok(by('kalle').st === 'klar' && by('anna').st === 'pagar' && by('lisa').st === 'kommande', 'Kl 12:31: Kalle blev "Klar", Anna "Pågår nu" – av sig själv', r.map(x => x.id + ':' + x.st).join(' '));
  await p.clock.fastForward('30:00'); await p.waitForTimeout(300);
  r = await read();
  ok(by('anna').st === 'klar' && by('lisa').st === 'klar' && by('imorgon').st === 'kommande', 'Kl 13:01: Anna och Lisa "Klar", morgondagen kommande');
  await p.screenshot({ path: '/tmp/t/schema-1301.png', fullPage: true });
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
