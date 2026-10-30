// 30 okt 2026: appens egen frågeruta ersätter webbläsarens vita ruta (5 ställen). Vid avbokning kan Lia skicka ett meddelande till kunden.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const R1 = 'Din frisör Lia är tyvärr sjuk och måste avboka din tid.', R2 = 'Ett oförutsett hinder har uppstått och på grund av detta måste din frisör Lia tyvärr avboka din tid.', R3 = 'Din frisör Lia måste tyvärr boka om din tid.';
const K1 = 'Kursledaren Lia är tyvärr sjuk och måste ställa in din kursplats.', K2 = 'Ett oförutsett hinder har uppstått och på grund av detta måste kursledaren Lia tyvärr ställa in din kursplats.', K3 = 'Kursledaren Lia måste tyvärr flytta din kursplats.';
const RING = ' Ring 073-642 30 18 så hittar vi en ny tid.';
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
  await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const bk = (id, name, h) => ({ id, created_at: '2026-11-01T10:00:00.000Z', service_ids: ['klipp-45'], service_names: 'Klippning 45 min.', price: 600, starts_at: `2026-11-03T${h}:00:00+01:00`, ends_at: `2026-11-03T${h}:45:00+01:00`, customer_name: name, customer_phone: '0701234567', customer_email: 'k@test.se', status: 'bokad', person_name: null, group_id: id });
  const seed = { bookings: [bk('b1', 'Anna Andersson', '10'), bk('b2', 'Bo Berg', '11'), bk('b3', 'Cecilia Ceder', '13')], sms: [],
    courseBookings: [{ id: 'c1', created_at: '2026-11-01T10:00:00.000Z', course_id: 'c-begin', course_name: 'Drejning för nybörjare', occasion_key: 'x', starts_at: '2026-11-07T10:00:00+01:00', ends_at: '2026-11-07T13:00:00+01:00', last_date: null, seats: 2, price: 1800, customer_name: 'Eva Ek', customer_phone: '0702222222', customer_email: 'e@test.se', status: 'bokad' }],
    orders: [{ id: 'o1', number: 'LH-1001', created_at: '2026-11-01T10:00:00.000Z', items: [{ id: 's-cup', name: 'Kopp', qty: 1 }], total: 280, payment: 'swish', customer_name: 'Tommy Bergqvist', customer_phone: '0736344954', customer_email: 't@test.se', status: 'klar' }],
    sold: {}, orderSeq: 1001, payments: [], photos: [{ id: 'f1', at: '2026-11-01T10:00:00.000Z', title: 'Balayage', cat: 'frisor', src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', consent: true }], receiptSeq: 1000 };
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), seed);
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const dlg = () => p.$eval('[data-confirm]', d => ({ title: d.querySelector('h2').innerText, lines: [...d.querySelectorAll('[data-rader] p')].map(x => x.innerText), note: (d.querySelector('.lh-ask__note') || {}).innerText, btn: [...d.querySelectorAll('.lh-ask__btns button')].map(b => b.innerText.trim()),
    focus: document.activeElement && document.activeElement.innerText.trim(), opts: [...d.querySelectorAll('[data-orsak]')].map(o => o.innerText.trim()), checked: (d.querySelector('[data-orsak][aria-checked="true"]') || {}).innerText, prev: (d.querySelector('[data-forhandsvisning]') || {}).innerText })).catch(() => null);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const avboka = name => p.locator('div[data-booking]', { hasText: name }).locator('button:has-text("Avboka")').click();

  // --- 1. Frisörtid: rutan ---
  await avboka('Anna Andersson'); await p.waitForTimeout(300);
  let d = await dlg();
  ok(native === 0 && !!d, 'Ingen vit webbläsarruta – appens egen ruta visas');
  ok(d && d.title === 'Avboka tiden?' && d.lines.join(' | ') === 'Anna Andersson | Tisdag 3 november kl 10:00 | Klippning 45 min.', 'Rubrik, kund, dag och tjänst', d && d.lines.join(' | '));
  ok(d && d.note === 'Tiden blir ledig för andra kunder och kunden får ett sms.' && d.btn.join(' / ') === 'Nej, behåll tiden / Ja, avboka' && d.focus === 'Nej, behåll tiden', 'Tydliga svar, "Nej, behåll tiden" förvalt', d && d.btn.join(' / '));
  ok(d && JSON.stringify(d.opts) === JSON.stringify(['Inget meddelande', R1, R2, R3, 'Eget meddelande…']) && d.checked === 'Inget meddelande', 'Meddelande: Inget (förval), tre snabbval med Tommys texter, Eget meddelande', d && d.opts.length);
  ok(d && d.prev === 'Sms till kunden:\nDin tid hos Lias Hantverkeri tis 3 nov kl 10:00 är avbokad.', 'Förhandsvisning utan meddelande', d && d.prev.replace(/\n/g, ' | '));
  const look = await p.$eval('[data-confirm]', e => { const s = getComputedStyle(e), h = getComputedStyle(e.querySelector('h2')), r = e.getBoundingClientRect(); return { bg: s.backgroundColor, hf: h.fontFamily, w: r.width, role: e.getAttribute('role'), btnH: Math.min(...[...e.querySelectorAll('.lh-ask__btns button')].map(b => b.getBoundingClientRect().height)) }; });
  ok(look.bg !== 'rgb(255, 255, 255)' && /Fraunces|serif/i.test(look.hf) && look.role === 'alertdialog' && look.btnH >= 44, 'Appens färger och rubriktypsnitt, knappar minst 44 px', look.bg + ' / ' + look.hf.split(',')[0]);
  await p.screenshot({ path: '/tmp/t/fraga-avboka.png' });
  // snabbval
  await p.click(`[data-orsak="0"]`); await p.waitForTimeout(100);
  d = await dlg();
  ok(d.checked === R1 && d.prev === 'Sms till kunden:\nDin tid hos Lias Hantverkeri tis 3 nov kl 10:00 är avbokad. ' + R1 + RING, 'Snabbval 1: förhandsvisningen visar exakt sms:et', d.prev.split('\n')[1]);
  const vis = await p.$eval('[data-orsak="0"]', b => ({ bg: getComputedStyle(b).backgroundColor, chk: getComputedStyle(b.querySelector('.lh-opt__check')).backgroundColor, other: getComputedStyle(document.querySelector('[data-orsak="inget"]')).backgroundColor }));
  ok(vis.bg === 'rgb(236, 242, 238)' && vis.chk !== 'rgba(0, 0, 0, 0)' && vis.other !== vis.bg, 'Valt snabbval syns tydligt (grön ram och ifylld bock)', JSON.stringify(vis));
  await p.screenshot({ path: '/tmp/t/fraga-snabbval.png' });
  // eget
  await p.click('[data-orsak="egen"]'); await p.waitForTimeout(100);
  await p.click('[data-svar="ja"]'); await p.waitForTimeout(150);
  ok((await p.$eval('[data-confirm] [data-err]', e => e.innerText).catch(() => '')) === 'Skriv ett meddelande, eller välj "Inget meddelande".' && (await db()).bookings[0].status === 'bokad', 'Eget meddelande men tomt fält: tydligt fel, inget avbokas');
  await p.fill('#eget-meddelande', 'x'.repeat(170));
  ok((await p.$eval('#eget-meddelande', t => t.value.length)) === 160 && (await p.$eval('[data-kvar]', e => e.innerText)) === '0 tecken kvar', 'Max 160 tecken, räknaren visar 0 kvar');
  await p.fill('#eget-meddelande', 'Hej Anna! Jag har tyvärr fått förhinder.');
  ok((await p.$eval('[data-kvar]', e => e.innerText)) === '120 tecken kvar' && (await dlg()).prev.endsWith('Hej Anna! Jag har tyvärr fått förhinder.' + RING), 'Eget meddelande: räknare och förhandsvisning');
  // Nej / Escape
  await p.click('[data-svar="nej"]'); await p.waitForTimeout(200);
  ok(!(await p.$('[data-confirm]')) && (await db()).bookings[0].status === 'bokad' && (await db()).sms.length === 0, 'Nej: rutan stängs, ingenting avbokas, inget sms');
  await avboka('Anna Andersson'); await p.waitForTimeout(250);
  ok((await dlg()).checked === 'Inget meddelande', 'Rutan börjar om från "Inget meddelande" nästa gång');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(!(await p.$('[data-confirm]')) && (await db()).bookings[0].status === 'bokad', 'Escape stänger utan att avboka');
  // Ja med snabbval 2
  await avboka('Anna Andersson'); await p.waitForTimeout(250);
  await p.click('[data-orsak="1"]'); const prev2 = (await dlg()).prev.split('\n')[1];
  await p.click('[data-svar="ja"]'); await p.waitForTimeout(600);
  let s1 = await db();
  ok(s1.bookings[0].status === 'avbokad' && s1.bookings[0].cancel_note === R2, 'Ja: avbokad, meddelandet sparat på bokningen');
  ok(s1.sms[0].kind === 'avbokning' && s1.sms[0].text === prev2 && s1.sms[0].text.length === 203, 'Sms:et är exakt det som förhandsvisades (203 tecken = 2 sms-delar)', s1.sms[0].text.length);
  ok(!(await p.$('div[data-booking]:has-text("Anna Andersson")')), 'Bokningen försvann ur listan');
  // Ja utan meddelande
  await avboka('Bo Berg'); await p.waitForTimeout(250); await p.click('[data-svar="ja"]'); await p.waitForTimeout(600);
  s1 = await db();
  ok(s1.sms[0].text === 'Din tid hos Lias Hantverkeri tis 3 nov kl 11:00 är avbokad.' && !s1.bookings[1].cancel_note, 'Inget meddelande: sms som förut, inget sparat');
  // Snabbval 3 längd
  await avboka('Cecilia Ceder'); await p.waitForTimeout(250); await p.click('[data-orsak="2"]'); await p.click('[data-svar="ja"]'); await p.waitForTimeout(600);
  s1 = await db();
  ok(s1.sms[0].text === 'Din tid hos Lias Hantverkeri tis 3 nov kl 13:00 är avbokad. ' + R3 + RING && s1.sms[0].text.length <= 160, 'Snabbval 3: ryms i ett sms (' + s1.sms[0].text.length + ' tecken)');

  // --- 2. Kursplats ---
  await p.locator('[data-coursebooking]', { hasText: 'Eva Ek' }).locator('button:has-text("Avboka")').click(); await p.waitForTimeout(300);
  d = await dlg();
  ok(d && d.title === 'Avboka kursplatsen?' && d.lines.join(' | ') === 'Eva Ek | Drejning för nybörjare | Lördag 7 november kl 10:00 · 2 platser' && d.btn.join(' / ') === 'Nej, behåll platsen / Ja, avboka', 'Kurs: egen rubrik och rader', d && d.lines.join(' | '));
  ok(d && JSON.stringify(d.opts) === JSON.stringify(['Inget meddelande', K1, K2, K3, 'Eget meddelande…']), 'Kurs: snabbvalen säger "kursledaren" och "kursplats"');
  await p.click('[data-orsak="0"]'); await p.click('[data-svar="ja"]'); await p.waitForTimeout(600);
  s1 = await db();
  ok(s1.courseBookings[0].status === 'avbokad' && s1.sms[0].kind === 'kurs-avbokning' && s1.sms[0].text === 'Din plats på Drejning för nybörjare hos Lias Hantverkeri (lör 7 nov kl 10:00) är avbokad. ' + K1 + RING, 'Kurs: sms med meddelandet', s1.sms[0].text);

  // --- 3. Hämtad ---
  await p.click('button:text-is("Hämtad")'); await p.waitForTimeout(300);
  d = await dlg();
  ok(d && d.title === 'Markera som hämtad?' && d.lines.join(' | ') === 'LH-1001 · Tommy Bergqvist | 1 st Kopp' && d.opts.length === 0 && d.btn.join(' / ') === 'Nej, inte än / Ja, den är hämtad', 'Hämtad: egen ruta, inget meddelandefält', d && d.btn.join(' / '));
  await p.click('[data-svar="ja"]'); await p.waitForTimeout(600);
  ok((await db()).orders[0].status === 'hamtad', 'Hämtad: Ja markerar beställningen');

  // --- 4. Ta bort bild ---
  await p.click('button:text-is("Bilder")'); await p.waitForTimeout(500);
  await p.click('[data-photo] button:has-text("Ta bort")'); await p.waitForTimeout(300);
  d = await dlg();
  ok(d && d.title === 'Ta bort bilden?' && d.lines[0] === 'Balayage' && d.btn.join(' / ') === 'Nej, behåll bilden / Ja, ta bort', 'Ta bort bild: egen ruta', d && d.btn.join(' / '));
  await p.click('[data-svar="nej"]'); await p.waitForTimeout(300);
  ok((await db()).photos.length === 1, 'Nej: bilden finns kvar');
  await p.click('[data-photo] button:has-text("Ta bort")'); await p.waitForTimeout(300); await p.click('[data-svar="ja"]'); await p.waitForTimeout(700);
  ok((await db()).photos.length === 0, 'Ja: bilden borttagen');

  // --- 5. Nollställ ---
  await p.click('.lh-demo button'); await p.waitForTimeout(300);
  d = await dlg();
  ok(d && d.title === 'Nollställa demon?' && d.btn.join(' / ') === 'Nej, avbryt / Ja, nollställ', 'Nollställ: egen ruta', d && d.btn.join(' / '));
  const nf = await p.$eval('[data-confirm] h2', h => ({ fs: getComputedStyle(h).fontSize, ta: getComputedStyle(h).textAlign, bg: getComputedStyle(h.closest('[data-confirm]')).backgroundColor }));
  ok(nf.bg === 'rgb(251, 248, 239)' && nf.ta !== 'center' && parseFloat(nf.fs) >= 20, 'Nollställ-rutan ser ut som de andra (ärver inte demoradens stil)', JSON.stringify(nf));
  await p.click('[data-svar="nej"]'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => localStorage.getItem('lias_demo_db'))) !== null, 'Nej: ingenting raderas');

  // --- 6. Liten skärm ---
  await p.setViewportSize({ width: 320, height: 640 }); await p.evaluate(() => { document.documentElement.style.zoom = 1.3; });
  await p.click('nav >> text=Start').catch(() => {}); await p.waitForTimeout(300);
  await p.click('.lh-demo button'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const d = document.querySelector('[data-confirm]'); return document.documentElement.scrollWidth <= innerWidth + 1 && [...d.querySelectorAll('*')].every(e => e.scrollWidth <= e.clientWidth + 1 || e.tagName === 'svg' || e.closest('svg')); }), '320 px + 130 % text: rutan ryms');
  await p.click('[data-svar="nej"]');

  ok(native === 0, 'Ingen vit webbläsarruta någonstans under testet', native);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
