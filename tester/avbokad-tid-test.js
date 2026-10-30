// 30 okt 2026: exakt tid för Lias avbokningar (bevis), tid på varje sms i loggen, avbokningar sparas 12 månader.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const NOW = new Date('2026-11-02T08:00:00+01:00').getTime();
(async () => {
  const browser = await chromium.launch();
  const errs = []; let native = 0;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  p.on('dialog', d => { native++; d.dismiss(); });
  await p.clock.install({ time: NOW });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const iso = ms => new Date(ms).toISOString(), M = 30.44 * 86400000;
  const bk = (id, name, startIso, extra = {}) => ({ id, created_at: '2026-10-01T10:00:00.000Z', service_ids: ['klipp-45'], service_names: 'Klippning 45 min.', price: 600, starts_at: startIso, ends_at: iso(new Date(startIso).getTime() + 45 * 60000), customer_name: name, customer_phone: '0701234567', customer_email: 'k@test.se', status: 'bokad', person_name: null, group_id: id, ...extra });
  const seed = { bookings: [
      bk('b1', 'Anna Andersson', '2026-11-03T10:00:00+01:00'),
      bk('g13', 'Gammal Tretton', iso(NOW - 14 * M), { status: 'avbokad', cancelled_at: iso(NOW - 13 * M), cancel_note: null }),
      bk('g11', 'Gammal Elva', iso(NOW - 11.5 * M), { status: 'avbokad', cancelled_at: iso(NOW - 11 * M), cancel_note: 'Din frisör Lia måste tyvärr boka om din tid.' }),
      bk('g14', 'Utan Tid Gammal', iso(NOW - 14 * M), { status: 'avbokad' }),
      bk('n1', 'Utan Tid Ny', iso(NOW - 2 * M), { status: 'avbokad' }),
    ], sms: [],
    courseBookings: [{ id: 'c1', created_at: '2026-11-01T10:00:00.000Z', course_id: 'c-begin', course_name: 'Drejning för nybörjare', occasion_key: 'x', starts_at: '2026-11-07T10:00:00+01:00', ends_at: '2026-11-07T13:00:00+01:00', last_date: null, seats: 1, price: 900, customer_name: 'Eva Ek', customer_phone: '0702222222', customer_email: 'e@test.se', status: 'bokad' }],
    orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000 };
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), seed);
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const list = () => p.$$eval('[data-avbokad]', cs => cs.map(c => ({ id: c.dataset.avbokad, t: c.innerText.replace(/\s+/g, ' ').trim(), tid: c.querySelector('[data-avbokad-tid]').innerText, medd: c.querySelector('[data-avbokad-medd]').innerText })));

  // --- 1. Rensning efter 12 månader ---
  let d = await db();
  ok(!d.bookings.some(b => b.id === 'g13') && !d.bookings.some(b => b.id === 'g14'), 'Avbokningar äldre än 12 månader raderades när Lia öppnade admin (även gammal utan avbokningstid)');
  ok(d.bookings.some(b => b.id === 'g11') && d.bookings.some(b => b.id === 'n1') && d.bookings.some(b => b.id === 'b1'), 'Avbokningen från för 11 månader sedan och aktuella bokningar finns kvar');
  let L = await list();
  ok(L.length === 1 && L[0].id === 'g11', 'Listan "Avbokade tider" visar avbokningen från för 11 månader sedan', L.map(x => x.id).join(','));
  ok((await p.$eval('[data-rubrik="avbokade"]', h => h.innerText)) === '🗓️ Avbokade tider (1)', 'Rubrik med antal');
  // --- 2. Lia avbokar med snabbval, 3 min senare ---
  await p.clock.runFor(3 * 60000);
  await p.locator('div[data-booking]', { hasText: 'Anna Andersson' }).locator('button:has-text("Avboka")').click(); await p.waitForTimeout(250);
  await p.click('[data-orsak="0"]'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(800);
  d = await db();
  const b1 = d.bookings.find(b => b.id === 'b1'), at = new Date(b1.cancelled_at);
  const hm = at.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
  ok(b1.status === 'avbokad' && Math.abs(at.getTime() - (NOW + 3 * 60000)) < 60000, 'Avbokningstiden sparas på bokningen', b1.cancelled_at);
  L = await list();
  ok(L.length === 2 && L[0].id === 'b1', 'Nyaste avbokningen överst i listan, direkt utan omladdning', L.map(x => x.id).join(','));
  ok(L[0].t.startsWith('Anna Andersson · 0701234567 Bokad tid: tis 3 nov 2026 kl 10:00 · Klippning 45 min.'), 'Kund, telefon, bokad tid (med år) och tjänst', L[0].t.slice(0, 90));
  ok(L[0].tid === 'Avbokad av Lia: mån 2 nov 2026 kl ' + hm, 'Exakt tid för avbokningen: "' + L[0].tid + '"');
  ok(L[0].medd === 'Meddelande: ”Din frisör Lia är tyvärr sjuk och måste avboka din tid.”', 'Meddelandet som skickades visas', L[0].medd);
  ok(L[1].medd === 'Meddelande: ”Din frisör Lia måste tyvärr boka om din tid.”' && L[1].tid.startsWith('Avbokad av Lia: ') && /2025|2026/.test(L[1].tid), 'Äldre avbokning visar år', L[1].tid);
  // --- 3. Sms-loggen har tid ---
  const sms = await p.$$eval('[data-sms]', cs => cs.map(c => ({ kind: c.dataset.sms, at: (c.querySelector('[data-sms-at]') || {}).innerText })));
  ok(sms[0].kind === 'avbokning' && sms[0].at === 'Skickat mån 2 nov 2026 kl ' + hm, 'Sms-loggen: "' + sms[0].at + '" – samma minut som avbokningen');
  // --- 4. Låst i efterhand (demo följer databasens regel) ---
  const locked = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); return d.bookings.find(b => b.id === 'b1').cancel_note; });
  ok(!(await p.$('div[data-booking]:has-text("Anna Andersson")')) && locked === 'Din frisör Lia är tyvärr sjuk och måste avboka din tid.', 'Avbokningen kan inte göras om eller ändras från admin');
  // --- 5. Kursplats ---
  await p.clock.runFor(60000);
  await p.locator('[data-coursebooking]', { hasText: 'Eva Ek' }).locator('button:has-text("Avboka")').click(); await p.waitForTimeout(250);
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(800);
  L = await list();
  ok(L[0].id === 'c1' && L[0].t.includes('Kursplats: lör 7 nov 2026 kl 10:00 · Drejning för nybörjare') && L[0].medd === 'Inget eget meddelande (bara avbokningssms).', 'Kursavbokning i listan, utan eget meddelande', L[0].t.slice(0, 110));
  // --- 6. Händelser har också tid ---
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.sms.unshift({ id: 'e1', bookingId: 'x', at: '2026-11-02T07:30:00.000Z', from: 'Admin', to: '07', kind: 'order-hamtad', event: true, text: 'LH-1 är utlämnad.' }); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await p.click('button:text-is("Ekonomi")'); await p.waitForTimeout(300); await p.click('button:text-is("Bokningar")'); await p.waitForTimeout(800);
  ok((await p.$eval('[data-sms="order-hamtad"] [data-sms-at]', e => e.innerText).catch(() => '')) === 'Registrerat mån 2 nov 2026 kl 08:30', 'Händelser i loggen har också tid');
  // --- 7. Fler än 10 ---
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); for (let i = 0; i < 10; i++) d.bookings.push({ id: 'x' + i, service_ids: ['klipp-30'], service_names: 'Klippning/Herrklippning 30 min', price: 500, starts_at: '2026-10-20T10:00:00+02:00', ends_at: '2026-10-20T10:30:00+02:00', customer_name: 'Kund ' + i, customer_phone: '070', customer_email: 'a@b.se', status: 'avbokad', cancelled_at: '2026-10-1' + i % 10 + 'T10:00:00+02:00' }); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(4500); if (!(await p.$('[data-rubrik="avbokade"]'))) { await p.click('footer >> text=Admin'); await p.waitForTimeout(1500); }
  ok((await list()).length === 10 && (await p.$eval('[data-visa-alla]', b => b.innerText)) === 'Visa alla (13)', 'Visar 10 åt gången, knappen "Visa alla (13)"');
  await p.click('[data-visa-alla]'); await p.waitForTimeout(200);
  ok((await list()).length === 13, 'Visa alla visar alla 13');
  await p.locator('[data-avbokad]').first().screenshot({ path: '/tmp/t/avbokad-lista.png' });
  // --- 8. Smal skärm ---
  await p.setViewportSize({ width: 320, height: 640 }); await p.evaluate(() => { document.documentElement.style.zoom = 1.3; }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-avbokad] *')].every(e => e.getBoundingClientRect().right <= innerWidth + 0.5)), '320 px + 130 % text: listan ryms');
  ok(native === 0, 'Ingen vit webbläsarruta', native);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
