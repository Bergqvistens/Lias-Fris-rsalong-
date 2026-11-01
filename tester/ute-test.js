// 1 nov 2026, del 2: Lia registrerar "kom"/"uteblev", räkning per telefon (12 mån), avgift = bokat pris från 2:a gången,
// "Vem avbokade?" vid sen avbokning, obetalda avgifter, betald nollställer, efterskänk, kunden kom ändå.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const NOW = new Date('2026-11-03T10:20:00+01:00').getTime();
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
  const bk = (id, name, phone, svc, price, startIso, min) => ({ id, created_at: '2026-10-20T10:00:00Z', service_ids: [svc], service_names: svc, price, starts_at: startIso, ends_at: new Date(new Date(startIso).getTime() + min * 60000).toISOString(), customer_name: name, customer_phone: phone, customer_email: 'k@t.se', status: 'bokad', person_name: null, group_id: id, confirm_token: 't' + id, confirmed_at: null });   // utan rules_version: automatiken (del 3) rör dem inte, Lia registrerar själv
  const prior = (id, name, phone, status, daysAgo, extra = {}) => ({ id, created_at: new Date(NOW - daysAgo * 86400000).toISOString(), booking_id: 'gammal-' + id, group_id: null, customer_name: name, customer_phone: phone, kind: 'uteblev', nummer: 1, belopp: 0, status, andrad_at: null, ...extra });
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), {
    bookings: [
      bk('anna', 'Anna Andersson', '0701234567', 'klipp-45', 600, '2026-11-03T10:00:00+01:00', 45),
      bk('bo', 'Bo Berg', '0702222222', 'klipp-30', 500, '2026-11-03T09:00:00+01:00', 30),
      bk('erik', 'Erik Ek', '0705555555', 'klipp-30', 500, '2026-11-03T09:30:00+01:00', 30),
      bk('erik2', 'Erik Ek', '0705555555', 'tvatt-fon', 400, '2026-11-03T08:00:00+01:00', 30),
      bk('gus', 'Gustav Gran', '0706666666', 'klipp-30', 500, '2026-11-03T08:30:00+01:00', 30),
      bk('cia', 'Cia Cedar', '0703333333', 'klipp-30', 500, '2026-11-04T09:00:00+01:00', 30),
      bk('dan', 'Dan Dahl', '0704444444', 'klipp-30', 500, '2026-11-06T10:00:00+01:00', 30),
    ], sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000,
    uteblivna: [prior('a1', 'Anna Andersson', '0701234567', 'ingen_avgift', 60), prior('e1', 'Erik Ek', '0705555555', 'ingen_avgift', 30), prior('g1', 'Gustav Gran', '0706666666', 'ingen_avgift', 20),
      prior('a0', 'Anna Andersson', '0701234567', 'ingen_avgift', 400)] });   // a0: mer än 12 månader gammal, räknas inte
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const card = id => p.locator(`[data-booking="${id}"]`);
  const narv = id => p.$eval(`[data-booking="${id}"] [data-narvaro]`, e => ({ k: e.dataset.narvaro, t: e.innerText.replace(/\s+/g, ' ').trim() })).catch(() => null);
  const dlg = () => p.$eval('[data-confirm]', d => ({ title: d.querySelector('h2').innerText, note: (d.querySelector('.lh-ask__note') || {}).innerText, vem: !!d.querySelector('[data-vem]') })).catch(() => null);
  const debts = () => p.$$eval('[data-avgift]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim()));

  // 1. Knappar bara när tiden har börjat
  ok((await narv('anna')).k === 'okand' && (await narv('bo')).k === 'okand' && !(await narv('dan')), 'Knapparna "Kunden har kommit / uteblev" finns när tiden har börjat, inte för kommande tider');
  // 2. Anna uteblev – 2:a gången (en gammal från >12 mån räknas inte)
  await card('anna').locator('[data-uteblev]').click(); await p.waitForTimeout(400);
  let d = await dlg();
  ok(d && d.title === 'Kunden uteblev?' && d.note.replace(/\s/g, ' ') === 'Det här blir 2:a gången för det här telefonnumret de senaste 12 månaderna. Enligt reglerna: hela priset, 600,00 kr. Kunden får ett sms.', 'Frågan visar vilken gång det blir och beloppet (gammal registrering >12 mån räknas inte)', d && d.note);
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  let n = await narv('anna');
  ok(n && n.k === 'uteblev' && /^Uteblev – 2:a gången, 600,00\s?kr att betala Kunden kom ändå$/.test(n.t.replace(/ /g, ' ')), 'Kortet: "Uteblev – 2:a gången, 600 kr att betala"', n && n.t);
  let s = await db();
  const ua = s.uteblivna.find(u => u.booking_id === 'anna');
  ok(ua && ua.nummer === 2 && ua.belopp === 600 && ua.status === 'obetald', 'Sparat: 2:a gången, 600 kr, obetald');
  ok(s.sms[0].kind === 'uteblev-avgift' && s.sms[0].text === 'Hej Anna! Du kom inte till din tid tis 3 nov kl 10:00 hos Lias Hantverkeri. Enligt avbokningsreglerna debiteras 600 kr. Lia skickar betalningsuppgifter. Frågor: 073-642 30 18.', 'Sms till kunden om avgiften', s.sms[0].text);
  let dl = await debts();
  ok(dl.length === 1 && dl[0].startsWith('Anna Andersson · 0701234567 Uteblivet besök · 2:a gången'), 'Obetalda avgifter: Anna syns', dl[0] && dl[0].slice(0, 70));
  // 3. Bo kom
  await card('bo').locator('[data-kom]').click(); await p.waitForTimeout(600);
  n = await narv('bo');
  ok(n && n.k === 'kom' && n.t === 'Kunden kom (registrerat kl 10:20)' && !(await db()).uteblivna.some(u => u.booking_id === 'bo'), 'Bo: "Kunden kom (registrerat kl 10:20)", ingen registrering', n && n.t);
  // 4. Anna kom ändå
  await card('anna').locator('[data-kom-anda]').click(); await p.waitForTimeout(300);
  ok((await dlg()).title === 'Kunden kom ändå?', 'Kom ändå: kontrollfråga');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(1600);
  s = await db();
  ok(s.uteblivna.find(u => u.booking_id === 'anna').status === 'havd' && (await narv('anna')).k === 'kom' && (await debts()).length === 0, 'Kom ändå: avgiften hävd, borta ur obetalda, kortet visar "Kunden kom"');
  ok(s.sms[0].kind === 'kom-anda' && s.sms[0].text === 'Hej Anna! Ursäkta, vi har nu registrerat att du kom. Ingen avgift. Välkommen åter!', 'Sms till kunden: ursäkta, ingen avgift');
  // 5. Erik: 2:a gången → betald → nästa blir 1:a igen
  await card('erik').locator('[data-uteblev]').click(); await p.waitForTimeout(400); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  dl = await debts();
  ok(dl.length === 1 && dl[0].includes('Erik Ek') && /500,00\s?kr/.test(dl[0].replace(/ /g, ' ')), 'Erik: 2:a gången, 500 kr i obetalda');
  await p.click('[data-avgift] [data-betald]'); await p.waitForTimeout(300);
  ok((await dlg()).title === 'Markera som betald?', 'Betald: kontrollfråga'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  ok((await debts()).length === 0 && (await db()).uteblivna.find(u => u.booking_id === 'erik').status === 'betald', 'Markerad som betald, borta ur listan');
  await p.clock.runFor(60000);
  await card('erik2').locator('[data-uteblev]').click(); await p.waitForTimeout(400);
  d = await dlg();
  ok(d && d.note.startsWith('Det här blir 1:a gången') && d.note.includes('ingen avgift'), 'Efter betald skuld börjar räkningen om: nästa blir 1:a gången, ingen avgift', d && d.note.slice(0, 40));
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  ok((await db()).sms[0].kind === 'uteblev-varning' && (await db()).sms[0].text.startsWith('Hej Erik! Vi saknade dig på din tid tis 3 nov kl 08:00 hos Lias Hantverkeri. Den här gången kostar det inget'), '1:a gången: sms utan avgift, med varning');
  // 6. Gustav: efterskänk
  await card('gus').locator('[data-uteblev]').click(); await p.waitForTimeout(400); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  await p.click('[data-avgift] [data-efterskank]'); await p.waitForTimeout(300);
  ok((await dlg()).title === 'Efterskänka avgiften?', 'Efterskänk: kontrollfråga'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  ok((await debts()).length === 0 && (await db()).uteblivna.find(u => u.booking_id === 'gus').status === 'havd', 'Efterskänkt: borta ur listan, räknas inte');
  // 7. Sen avbokning: Cia (imorgon 09:00, mindre än 24 h)
  await card('cia').locator('button:has-text("Avboka")').click(); await p.waitForTimeout(300);
  d = await dlg();
  ok(d && d.vem, 'Sen avbokning: frågan "Vem avbokade?" visas');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(200);
  ok((await p.$eval('[data-vem] [data-err]', e => e.innerText).catch(() => '')) === 'Välj vem som avbokade.' && (await db()).bookings.find(b => b.id === 'cia').status === 'bokad', 'Utan val: fel, inget avbokas');
  await p.click('[data-vem-val="kund"]'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  s = await db();
  const uc = s.uteblivna.find(u => u.booking_id === 'cia');
  ok(s.bookings.find(b => b.id === 'cia').status === 'avbokad' && uc && uc.kind === 'sen_avbokning' && uc.nummer === 1 && uc.belopp === 0, 'Kunden avbokade sent: registrerat som sen avbokning, 1:a gången, ingen avgift');
  ok(s.sms.some(m => m.kind === 'sen-varning' && m.text.startsWith('Hej Cia! Din avbokning av tiden ons 4 nov kl 09:00 kom för sent enligt avbokningsreglerna. Den här gången kostar det inget')), 'Sms om sen avbokning');
  // 8. Avbokning i god tid: ingen fråga om vem
  await card('dan').locator('button:has-text("Avboka")').click(); await p.waitForTimeout(300);
  ok((await dlg()) && !(await dlg()).vem, 'Avbokning i god tid: ingen fråga om vem');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(700);
  ok(!(await db()).uteblivna.some(u => u.booking_id === 'dan'), 'Ingen registrering för avbokning i god tid');
  // 9. Lia avbokar sent pga egen sjukdom: räknas inte
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.bookings.push({ id: 'hans', created_at: '2026-10-20T10:00:00Z', service_ids: ['klipp-30'], service_names: 'klipp-30', price: 500, starts_at: '2026-11-04T10:00:00+01:00', ends_at: '2026-11-04T10:30:00+01:00', customer_name: 'Hans Hed', customer_phone: '0707777777', customer_email: 'h@t.se', status: 'bokad', person_name: null, group_id: 'hans' }); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(4500); if (!(await p.$('[data-booking]'))) { await p.click('footer >> text=Admin'); await p.waitForTimeout(1500); }
  await card('hans').locator('button:has-text("Avboka")').click(); await p.waitForTimeout(300);
  await p.click('[data-vem-val="lia"]'); await p.click('[data-orsak="0"]'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(800);
  s = await db();
  ok(s.bookings.find(b => b.id === 'hans').status === 'avbokad' && !s.uteblivna.some(u => u.booking_id === 'hans'), 'Lia avbokade (sjuk): räknas inte mot kunden');
  await p.locator('[data-booking="anna"]').screenshot({ path: '/tmp/t/ute-kort.png' }).catch(() => {});
  ok(!(await card('anna').locator('button:has-text("Avboka")').count()) && !(await card('erik2').locator('button:has-text("Avboka")').count()), 'Avboka-knappen döljs när kunden kommit eller registrerats som utebliven');
  ok(native === 0, 'Ingen vit webbläsarruta', native);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
