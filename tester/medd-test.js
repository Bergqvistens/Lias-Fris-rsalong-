// 1 nov 2026: fliken Meddelanden i admin – kategorier, riktning, sök, per dag, kundens historik, nya (gul flik), kontaktformuläret.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const NOW = new Date('2026-11-10T12:00:00+01:00').getTime();   // tis 10 nov 12:00
(async () => {
  const browser = await chromium.launch();
  const errs = []; let native = 0;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page.replace("window.LH_PAYMENT_INFO = '';", "window.LH_PAYMENT_INFO = 'Swish 123 456 78 90';") });   // 1 nov: betalningsuppgifter för testet
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
  const bk = (id, name, phone, startIso, extra) => ({ id, created_at: '2026-11-01T10:00:00Z', service_ids: ['klipp-30'], service_names: 'Klippning/Herrklippning 30 min', price: 500, starts_at: startIso, ends_at: new Date(new Date(startIso).getTime() + 30 * 60000).toISOString(), customer_name: name, customer_phone: phone, customer_email: 'x@t.se', status: 'bokad', person_name: null, group_id: null, rules_version: '2026-11-01-v2', ...extra });
  const at = s => new Date(s).toISOString();
  const sms = (id, ref, when, to, kind, text, extra) => ({ id, bookingId: ref, at: at(when), from: to === 'Lias mobil' ? 'LiasSalong' : 'LiasSalong', to, kind, text, ...extra });
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), {
    bookings: [bk('anna1', 'Anna Andersson', '0701234567', '2026-11-03T10:00:00+01:00', { status: 'avbokad' }), bk('anna2', 'Anna Andersson', '0701234567', '2026-11-11T13:00:00+01:00'), bk('erik', 'Erik Ek', '0705555555', '2026-11-13T10:00:00+01:00'), bk('bo', 'Bo Berg', '0702222222', '2026-11-09T10:00:00+01:00')],
    courseBookings: [], orders: [{ id: 'ord1', number: 'LH-1002', created_at: at('2026-11-06T08:40:00+01:00'), items: [{ id: 'x', name: 'Kopp', qty: 1, price: 350 }], total: 350, payment: 'swish', customer_name: 'Cia Cedar', customer_phone: '0703333333', customer_email: 'cia@t.se', status: 'betald' }],
    sold: {}, orderSeq: 1002, payments: [], photos: [], receiptSeq: 1000, sparrade: [],
    uteblivna: [{ id: 'u1', created_at: at('2026-10-14T09:00:00+01:00'), booking_id: 'gammal', group_id: null, customer_name: 'Anna Andersson', customer_phone: '0701234567', kind: 'sen_avbokning', nummer: 2, belopp: 500, status: 'obetald', skickat_at: at('2026-10-14T09:30:00+01:00'), forfaller: '2026-10-21', orsak: 'sena avbokning' },
                 { id: 'u0', created_at: at('2026-09-14T09:00:00+01:00'), booking_id: 'gammal0', group_id: null, customer_name: 'Anna Andersson', customer_phone: '0701234567', kind: 'uteblev', nummer: 1, belopp: 0, status: 'ingen_avgift' }],
    sms: [
      sms('m1', 'anna2', '2026-11-10T11:05:00+01:00', 'Lias mobil', 'till-lia', 'Ombokning via länken: Anna Andersson flyttade tis 3 nov kl 10:00 till ons 11 nov kl 13:00: Klippning/Herrklippning 30 min. Tel 0701234567'),
      sms('m2', 'anna2', '2026-11-10T11:05:00+01:00', '0701234567', 'ombokning', 'Hej Anna! Din tid hos Lias Hantverkeri är ombokad till ons 11 nov kl 13:00.'),
      { id: 'm3', bookingId: 'erik', at: at('2026-11-10T09:50:00+01:00'), from: 'Kunden', to: 'Lia', kind: 'kund-bekraftade', event: true, text: 'Erik Ek bekräftade sin tid fre 13 nov kl 10:00.' },
      sms('m4', 'erik', '2026-11-10T09:42:00+01:00', 'Lias mobil', 'till-lia', 'Ny bokning: Erik Ek, fre 13 nov kl 10:00, Klippning/Herrklippning 30 min, från 500 kr. Tel 0705555555'),
      sms('m5', 'erik', '2026-11-10T09:42:00+01:00', '0705555555', 'bekraftelse', 'Hej Erik! Din tid hos Lias Hantverkeri är bokad fre 13 nov kl 10:00.'),
      sms('m6', 'bo', '2026-11-09T10:15:00+01:00', '0702222222', 'saknad', 'Hej Bo! Vi saknade dig på din tid mån 9 nov kl 10:00 hos Lias Hantverkeri.'),
      sms('m7', 'ord1', '2026-11-06T08:40:00+01:00', 'Lias mobil', 'order-till-lia', 'Ny beställning LH-1002: Cia Cedar, 1 st Kopp, 350 kr (Swish). Tel 0703333333'),
      sms('m8', 'gammal', '2026-10-14T09:30:00+01:00', '0701234567', 'debitering', 'Hej Anna! På grund av din sena avbokning debiteras 500 kr.', { customer_name: 'Anna Andersson', customer_phone: '0701234567' }),
      sms('m9', 'gammal9', '2025-09-01T09:30:00+01:00', '0709999999', 'bekraftelse', 'Mycket gammalt sms (14 mån).'),
    ] });
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const txt = async (pg, sel) => pg.$eval(sel, e => e.innerText.replace(/\n+/g, ' | ').replace(/\s/g, ' ')).catch(() => null);
  const tab = () => p.$eval('[data-admintab="meddelanden"]', e => ({ t: e.innerText.trim(), bg: getComputedStyle(e).backgroundColor, n: e.getAttribute('data-nya') }));
  const rows = () => p.$$eval('[data-medd]', es => es.map(e => e.getAttribute('data-medd')));

  // 1. Fliken
  let tb = await tab();
  ok(tb.t === '📨 Meddelanden (4 nya)' && tb.bg === 'rgb(232, 184, 99)' && tb.n === '4', 'Fliken är gul med "(4 nya)" (till Lia: ombokning, bekräftelse, ny bokning, ny beställning)', JSON.stringify(tb));
  ok(!(await p.$('[data-sms]')), 'Bokningar-fliken: den gamla långa sms-loggen är borta');
  await p.click('[data-admintab="meddelanden"]'); await p.waitForTimeout(400);
  // 2. Översikt
  ok(JSON.stringify(await rows()) === '["m1","m2","m3","m4","m5","m6","m7","m8","m9"]', 'Alla meddelanden, senaste först', (await rows()).join(','));
  const days = await p.$$eval('[data-medd-dag]', es => es.map(e => e.innerText));
  ok(JSON.stringify(days) === JSON.stringify(['IDAG · TIS 10 NOV', 'IGÅR · MÅN 9 NOV', 'FRE 6 NOV', 'ONS 14 OKT', 'MÅN 1 SEP 2025']), 'Uppdelat per dag: Idag, Igår, datum (år när det är ett annat år)', days.join(' / '));
  const chips = await p.$$eval('[data-medd-kat]', es => es.map(e => e.firstChild.textContent + ' ' + e.lastChild.textContent));
  ok(JSON.stringify(chips) === JSON.stringify(['Alla 9', 'Bokningar 4', 'Av- och ombokningar 2', 'Uteblivet och sent 1', 'Avgifter 1', 'Kurser 0', 'Shop 1', 'Övrigt 0']), 'Kategorier med antal', chips.join(' | '));
  const r1 = await txt(p, '[data-medd="m1"]');
  ok(r1 && r1.startsWith('🔁 | Anna Andersson') && r1.includes('11:05') && r1.includes('Till Lia') && await p.$eval('[data-medd="m1"]', e => e.dataset.ny) === 'true' && !!(await p.$('[data-medd="m1"] [data-ny-prick]')), 'Rad: ikon, namn, röd prick (nytt), klockslag, "Till Lia"', r1);
  ok(await p.$eval('[data-medd="m2"]', e => e.dataset.ny) === 'false' && (await txt(p, '[data-medd="m2"]')).includes('Till kund'), 'Sms till kund räknas inte som nytt för Lia');
  ok((await txt(p, '[data-nya-rad]')).startsWith('4 nya meddelanden'), 'Gul rad: "4 nya meddelanden – Markera som lästa"');
  // 3. Filter
  await p.click('[data-medd-kat="avb"]'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m1","m2"]', 'Av- och ombokningar: bara ombokningen (till Lia och till kund)', (await rows()).join(','));
  await p.click('[data-medd-riktning="lia"]'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m1"]', '+ Till Lia: bara meddelandet till Lia', (await rows()).join(','));
  await p.click('[data-medd-kat="alla"]'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m1","m4","m7"]', 'Alla + Till Lia: ombokning, ny bokning, ny beställning', (await rows()).join(','));
  await p.click('[data-medd-riktning="kund"]'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m2","m5","m6","m8","m9"]', 'Till kund: alla sms till kunder', (await rows()).join(','));
  await p.click('[data-medd-riktning="alla"]'); await p.fill('[data-medd-sok]', 'anna'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m1","m2","m8"]', 'Sök "anna": Annas meddelanden', (await rows()).join(','));
  await p.fill('[data-medd-sok]', '070-555 55 55'); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["m3","m4","m5"]', 'Sök telefonnummer: Eriks meddelanden', (await rows()).join(','));
  await p.fill('[data-medd-sok]', 'xyz'); await p.waitForTimeout(200);
  ok((await txt(p, '[data-medd-tomt]')) === 'Inga meddelanden matchar.', 'Sök utan träff: tydligt besked');
  await p.fill('[data-medd-sok]', ''); await p.waitForTimeout(200);
  // 4. Fäll upp
  await p.click('[data-medd="m4"] button[aria-expanded]'); await p.waitForTimeout(300);
  const o = await txt(p, '[data-medd="m4"] [data-medd-oppen]');
  ok(o && o.includes('Ny bokning: Erik Ek, fre 13 nov kl 10:00, Klippning/Herrklippning 30 min, från 500 kr. Tel 0705555555') && o.includes('Visa Eriks historik') && o.includes('📞 Ring'), 'Uppfällt: hela texten + "Visa Eriks historik" + "Ring"', o);
  ok(await p.$eval('[data-medd="m4"]', e => e.dataset.ny) === 'false' && (await tab()).t === '📨 Meddelanden (3 nya)', 'Öppnat meddelande räknas som läst: fliken visar 3 nya');
  // 5. Kundens historik
  await p.click('[data-medd="m1"] button[aria-expanded]'); await p.waitForTimeout(200);
  await p.click('[data-medd="m1"] [data-visa-historik]'); await p.waitForTimeout(400);
  const h = await txt(p, '[data-medd-historik]');
  ok(h && h.includes('Anna Andersson') && h.includes('📞 0701234567') && h.includes('❌ Ej betalt: 500,00 kr') && h.includes('2 gånger senaste 12 mån') && h.includes('ALLT MED ANNA · SENASTE FÖRST (3)'), 'Kundens historik: kontakt, obetalt, antal gånger, 3 meddelanden', h && h.slice(0, 260));
  ok(JSON.stringify(await rows()) === '["m1","m2","m8"]', 'Historiken: alla Annas meddelanden (även debiteringen i okt)', (await rows()).join(','));
  await p.click('[data-tillbaka-medd]'); await p.waitForTimeout(300);
  ok((await rows()).length === 9, 'Tillbaka till översikten');
  // 6. Markera som lästa
  await p.click('[data-markera-lasta]'); await p.waitForTimeout(300);
  tb = await tab();
  ok(tb.t === '📨 Meddelanden' && tb.bg !== 'rgb(232, 184, 99)' && !tb.n && !(await p.$('[data-ny-prick]')) && !(await p.$('[data-nya-rad]')), 'Markera som lästa: fliken får vanlig färg, inga röda prickar', JSON.stringify(tb));
  // 7. Kund skickar meddelande via kontaktformuläret
  const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
  await k.clock.install({ time: NOW + 60000 }); await k.goto('https://lias.test/'); await k.waitForTimeout(800);
  await k.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  await k.click('nav >> text=Kontakt'); await k.waitForTimeout(400);
  await k.fill('#kontakt-name', 'Mia Meddelande'); await k.fill('#kontakt-email', 'mia@t.se'); await k.fill('#kontakt-msg', 'Hej Lia! Har du tid för slingor i december?');
  await k.click('button:has-text("Skicka")'); await k.waitForTimeout(1500);
  ok(((await txt(k, 'main')) || '').includes('Tack! Ditt meddelande är skickat.'), 'Kunden: "Tack! Ditt meddelande är skickat."');
  await p.bringToFront(); await p.waitForTimeout(3600);
  tb = await tab();
  ok(tb.t === '📨 Meddelanden (1 nytt)' && tb.bg === 'rgb(232, 184, 99)', 'Fliken blir gul igen: "(1 nytt)" – utan att ladda om', JSON.stringify(tb));
  const first = (await rows())[0];
  const c = await txt(p, `[data-medd="${first}"]`);
  ok(c && c.startsWith('✉️ | Mia Meddelande') && c.includes('Till Lia') && await p.$eval(`[data-medd="${first}"]`, e => e.dataset.kat) === 'ovr', 'Kontaktmeddelandet ligger överst, kategori Övrigt, till Lia', c);
  await p.click(`[data-medd="${first}"] button[aria-expanded]`); await p.waitForTimeout(300);
  const sv = await p.$eval(`[data-medd="${first}"] [data-svara]`, a => a.getAttribute('href')).catch(() => null);
  ok(sv === 'mailto:mia@t.se?subject=' + encodeURIComponent('Svar från Lias Hantverkeri') && (await txt(p, `[data-medd="${first}"] [data-medd-oppen]`)).includes('Hej Lia! Har du tid för slingor i december?'), 'Uppfällt: meddelandet + "Svara via e-post"', sv);
  ok(!(await db()).sms.some(m => m.id === 'm9'), 'Sms äldre än 12 månader rensas bort');
  // 8. Händelser när Lia hanterar avgifter
  await p.click('[data-admintab="bokningar"]'); await p.waitForTimeout(400);
  await p.click('[data-avgift="u1"] [data-betald]'); await p.waitForSelector('[data-confirm]'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(800);
  await p.click('[data-admintab="meddelanden"]'); await p.waitForTimeout(400);
  const ev = (await db()).sms[0];
  ok(ev.kind === 'avgift-betald' && ev.text === 'Anna Andersson har betalat avgiften 500 kr (sena avbokning). Markerad som betald tis 10 nov kl 12:00.'.replace('12:00', ev.text.match(/kl (\d\d:\d\d)\.$/)[1]), 'Händelse i loggen: avgift betald', ev.text);
  ok(await p.$eval(`[data-medd="${ev.id}"]`, e => e.dataset.kat + ' ' + e.dataset.riktning + ' ' + e.dataset.ny) === 'avg event false', 'Händelsen: kategori Avgifter, "Händelse", inte "nytt" (Lia gjorde den själv)');
  ok(errs.length === 0 && native === 0, 'Inga fel och inga webbläsardialoger', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})();
