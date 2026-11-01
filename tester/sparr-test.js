// 1 nov 2026: spärr från onlinebokning (3+ gånger på 12 mån). Frisörtider och kurser, kommande tider avbokas, länken kan bara avboka.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const NOW = new Date('2026-11-10T08:00:00+01:00').getTime();   // tis 10 nov 08:00
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
  const st = (id, name, phone, kind, nummer, belopp, status, daysAgo) => ({ id, created_at: new Date(NOW - daysAgo * 86400000).toISOString(), booking_id: 'g-' + id, group_id: null, customer_name: name, customer_phone: phone, kind, nummer, belopp, status, andrad_at: null, skickat_at: new Date(NOW - daysAgo * 86400000).toISOString(), orsak: 'x' });
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), {
    bookings: [bk('sid1', 'Sid Spärr', '0704440001', '2026-11-12T10:00:00+01:00', { confirm_token: 'tok-sid-1', confirmed_at: null }), bk('bo', 'Bo Berg', '0702222222', '2026-11-12T11:00:00+01:00')],
    courseBookings: [{ id: 'kurs1', created_at: '2026-11-01T10:00:00Z', course_id: 'c-drop', course_name: 'Keramikverkstad drop-in', occasion_key: 'x', starts_at: '2026-11-13T16:00:00+01:00', ends_at: '2026-11-13T18:00:00+01:00', seats: 1, price: 150, customer_name: 'Sid Spärr', customer_phone: '0704440001', customer_email: 'x@t.se', status: 'bokad' }],
    sms: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000, sparrade: [],
    uteblivna: [
      st('s1', 'Sid Spärr', '0704440001', 'uteblev', 1, 0, 'ingen_avgift', 90),
      st('s2', 'Sid Spärr', '0704440001', 'sen_avbokning', 2, 500, 'efterskankt', 60),
      st('s3', 'Sid Spärr', '0704440001', 'sen_ankomst', 3, 500, 'obetald', 20),
      st('s0', 'Sid Spärr', '0704440001', 'uteblev', 1, 0, 'havd', 10),        // kunden kom ändå – räknas inte
      st('b1', 'Bo Berg', '0702222222', 'uteblev', 1, 0, 'ingen_avgift', 40),
      st('b2', 'Bo Berg', '0702222222', 'uteblev', 2, 500, 'betald', 30),
      st('b0', 'Bo Berg', '0702222222', 'uteblev', 1, 0, 'ingen_avgift', 400),  // äldre än 12 mån – räknas inte
    ] });
  // ---- Kunden öppnar sin länk innan spärren: kan boka om ----
  const lnk = await ctx.newPage(); lnk.on('pageerror', e => errs.push(e.message));
  await lnk.clock.install({ time: NOW }); await lnk.goto('https://lias.test/#bekrafta=tok-sid-1'); await lnk.waitForSelector('[data-bekraftelse]', { timeout: 15000 }).catch(() => {});
  ok(!!(await lnk.$('[data-kund-omboka]')) && !(await lnk.$('[data-kund-sparrad]')), 'Före spärren: länken har "Boka om"');
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const txt = async (pg, sel) => pg.$eval(sel, e => e.innerText.replace(/\n+/g, ' | ').replace(/\s/g, ' ')).catch(() => null);
  const rows = await p.$$eval('[data-sparr-rad]', es => es.map(e => e.getAttribute('data-sparr-rad')));
  ok(JSON.stringify(rows) === '["0704440001"]', 'Bara Sid (3 gånger) i spärrlistan; Bo har 2 (en äldre än 12 mån räknas inte)', rows.join(','));
  const r1 = await txt(p, '[data-sparr-rad="0704440001"]');
  ok(r1 && r1.includes('Sid Spärr · 0704440001') && r1.includes('3 gånger de senaste 12 månaderna: uteblivet besök, sen avbokning, sen ankomst') && r1.includes('❌ Ej betalt: 500,00 kr') && r1.includes('🚫 Spärra från onlinebokning'), 'Sid: 3 gånger (efterskänkt räknas, "kom ändå" räknas inte), obetalt och knapp', r1);
  ok((await txt(p, '[data-rubrik="sparr"]')) === '🚫 Spärr från onlinebokning (1)', 'Rubrik med antal');
  // ---- Lia spärrar ----
  await p.click('[data-sparra]'); await p.waitForSelector('[data-confirm]');
  const q = await txt(p, '[data-confirm]');
  ok(q && q.includes('Spärra Sid Spärr från onlinebokning?') && q.includes('3 gånger de senaste 12 månaderna') && q.includes('2 kommande tider avbokas automatiskt') && q.includes('frisörtider eller kurser'), 'Fråga före spärr: antal gånger och att 2 tider avbokas', q);
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(1500);
  const r2 = await txt(p, '[data-sparr-rad="0704440001"]');
  ok(r2 && r2.includes('🚫 Spärrad från onlinebokning sedan tis 10 nov 2026 kl 08:00') && r2.includes('Häv spärren') && !r2.includes('🚫 Spärra från onlinebokning |'), 'Raden visar "Spärrad sedan …" och "Häv spärren"', r2);
  let D = await db();
  const b = D.bookings.find(x => x.id === 'sid1'), c = D.courseBookings.find(x => x.id === 'kurs1');
  const TXT = 'Du kan inte boka tid på nätet just nu. Kontakta Lia på 073-642 30 18 eller kom in till salongen så löser ni det tillsammans.';
  ok(b.status === 'avbokad' && b.cancelled_by === 'lia' && b.cancel_note === TXT && c.status === 'avbokad' && c.cancel_note === TXT, 'Kommande frisörtid och kursplats avbokades automatiskt med spärrtexten');
  ok(D.bookings.find(x => x.id === 'bo').status === 'bokad', 'Andra kunders tider rörs inte');
  ok(D.sms.some(m => m.to === '0704440001' && m.kind === 'avbokning' && m.text === 'Din tid hos Lias Hantverkeri tors 12 nov kl 10:00 är avbokad. ' + TXT) && D.sms.some(m => m.kind === 'kurs-avbokning' && m.text === 'Din plats på Keramikverkstad drop-in hos Lias Hantverkeri (fre 13 nov kl 16:00) är avbokad. ' + TXT), 'Sms till kunden för båda avbokningarna');
  ok(!(await p.$('[data-booking="sid1"]')) && !!(await p.$('[data-booking="bo"]')), 'Sids kort är borta ur Lias lista');
  ok((await p.$$eval('[data-avbokad]', es => es.map(e => e.innerText))).some(t => t.includes('Sid Spärr') && t.includes('Meddelande: ”' + TXT + '”')), 'Avbokade tider visar avbokningen med meddelandet');
  // ---- Sid försöker boka frisörtid ----
  const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
  await k.clock.install({ time: NOW }); await k.goto('https://lias.test/'); await k.waitForTimeout(800);
  await k.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  await k.click('nav >> text=Boka'); await k.waitForTimeout(300);
  await k.click('[data-person="0"] [data-cat="Klippning"]'); await k.click('[data-person="0"] [data-service="klipp-30"]');
  await k.click('text=Fortsätt'); await k.waitForTimeout(500);
  await (await k.$$('.lh-day'))[0].click(); await k.waitForTimeout(500);
  await k.click('.lh-time:text-is("13:00")'); await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  await k.fill('input[type=text]', 'Sid Spärr'); await k.fill('input[type=tel]', '070-444 00 01'); await k.fill('input[type=email]', 'sid@t.se');
  await k.check('#boka-regler'); await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900);
  const e1 = await txt(k, 'main');
  ok(e1 && e1.includes(TXT) && !e1.includes('Tack'), 'Spärrad kund som bokar frisörtid får spärrtexten', e1 && e1.slice(0, 200));
  ok(!(await db()).bookings.some(x => x.customer_phone === '0704440001' && x.status === 'bokad'), 'Ingen bokning sparades');
  // ---- Sid försöker boka kurs ----
  await k.click('nav >> text=Kurser'); await k.waitForTimeout(300); await k.click('[data-course="c-begin"] button'); await k.waitForTimeout(500);
  const keys = await k.$$eval('main button[data-occ]', bs => bs.map(x => x.getAttribute('data-occ')));
  await k.click(`main button[data-occ="${keys[2]}"]`); await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  await k.fill('input[type=text]', 'Sid Spärr'); await k.fill('input[type=tel]', '0704440001'); await k.fill('input[type=email]', 'sid@t.se');
  await k.check('#boka-regler', { timeout: 1000 }).catch(() => {}); await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900);
  const e2 = await txt(k, 'main');
  ok(e2 && e2.includes(TXT) && !e2.includes('Du är anmäld'), 'Spärrad kund som bokar kurs får spärrtexten', e2 && e2.slice(0, 200));
  // ---- Länken efter spärr: bokningen avbokades (spärren) ----
  await lnk.reload(); await lnk.waitForSelector('[data-bekraftelse]', { timeout: 10000 }).catch(() => {});
  ok((await txt(lnk, '[data-bekraftelse]') || '').includes('Den här tiden är avbokad.'), 'Länken: tiden är avbokad efter spärren');
  // Spärrad kund med en tid som finns kvar (t.ex. inlagd av Lia): länken kan avboka men inte boka om
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.bookings.push({ id: 'sid2', created_at: '2026-11-10T07:00:00Z', service_ids: ['klipp-30'], service_names: 'Klippning/Herrklippning 30 min', price: 500, starts_at: '2026-11-19T10:00:00+01:00', ends_at: '2026-11-19T10:30:00+01:00', customer_name: 'Sid Spärr', customer_phone: '0704440001', customer_email: 'x@t.se', status: 'bokad', person_name: null, group_id: null, confirm_token: 'tok-sid-2', confirmed_at: null, rules_version: '2026-11-01-v2' }); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await lnk.evaluate(() => { location.hash = 'bekrafta=tok-sid-2'; }); await lnk.waitForTimeout(1200);
  const v = await txt(lnk, '[data-kund-hantera]');
  ok(v && !(await lnk.$('[data-kund-omboka]')) && v.includes('Du kan inte boka om på nätet just nu.') && !!(await lnk.$('[data-kund-avboka]')), 'Spärrad: "Boka om" borta, avboka finns kvar', v);
  await lnk.click('[data-kund-avboka]'); await lnk.waitForSelector('[data-confirm]'); await lnk.click('[data-confirm] .lh-ask__btns button:has-text("Ja,")'); await lnk.waitForTimeout(900);
  ok((await txt(lnk, '[data-kund-resultat]') || '').startsWith('Din tid är avbokad'), 'Spärrad kund kan avboka via länken');
  // ---- Lia häver spärren ----
  await p.click('footer >> text=Admin').catch(() => {}); await p.waitForTimeout(1500);
  await p.click('[data-hav-sparr]'); await p.waitForSelector('[data-confirm]');
  ok((await txt(p, '[data-confirm]')).includes('Häva spärren för Sid Spärr?'), 'Fråga före häv');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  ok((await db()).sparrade.length === 0 && !!(await p.$('[data-sparr-rad="0704440001"] [data-sparra]')), 'Spärren hävd: Sid kan spärras igen vid behov (3 gånger kvar i listan)');
  await k.click('nav >> text=Kurser'); await k.waitForTimeout(300); await k.click('[data-course="c-begin"] button'); await k.waitForTimeout(500);
  await k.click(`main button[data-occ="${keys[2]}"]`); await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  await k.fill('input[type=text]', 'Sid Spärr'); await k.fill('input[type=tel]', '0704440001'); await k.fill('input[type=email]', 'sid@t.se');
  await k.check('#boka-regler', { timeout: 1000 }).catch(() => {}); await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900);
  ok(((await txt(k, 'main')) || '').includes('Du är anmäld'), 'Efter hävd spärr kan kunden boka igen');
  ok(errs.length === 0 && native === 0, 'Inga fel och inga webbläsardialoger', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})();
