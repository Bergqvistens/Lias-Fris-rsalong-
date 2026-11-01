// 1 nov 2026: röd ruta "Ej betald" och grön "Betald" i Lias admin (avgiftslistan och kundens kort).
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
  const bk = (id, name, phone, startIso) => ({ id, created_at: '2026-11-01T10:00:00Z', service_ids: ['klipp-30'], service_names: 'Klippning/Herrklippning 30 min', price: 500, starts_at: startIso, ends_at: new Date(new Date(startIso).getTime() + 30 * 60000).toISOString(), customer_name: name, customer_phone: phone, customer_email: 'x@t.se', status: 'bokad', person_name: null, group_id: null, rules_version: '2026-11-01-v2' });
  const st = (id, name, phone, kind, nummer, belopp, status, extra) => ({ id, created_at: '2026-11-0' + (nummer + 2) + 'T09:00:00+01:00', booking_id: 'g-' + id, group_id: null, customer_name: name, customer_phone: phone, kind, nummer, belopp, status, andrad_at: null, booking_start: '2026-11-03T09:00:00+01:00', ...extra });
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), {
    bookings: [bk('erik', 'Erik Ek', '0705555555', '2026-11-12T10:00:00+01:00'), bk('bo', 'Bo Berg', '0702222222', '2026-11-12T11:00:00+01:00')],
    sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000,
    uteblivna: [
      st('e1', 'Erik Ek', '0705555555', 'uteblev', 1, 0, 'ingen_avgift', { skickat_at: '2026-11-03T10:00:00+01:00', orsak: 'uteblivna bokning' }),
      st('e2', 'Erik Ek', '0705555555', 'sen_avbokning', 2, 500, 'obetald', { skickat_at: '2026-11-04T10:00:00+01:00', orsak: 'sena avbokning', forfaller: '2026-11-11' }),
      st('f1', 'Fia Fors', '0707777777', 'sen_ankomst', 2, 600, 'obetald', { skickat_at: '2026-10-25T10:00:00+01:00', orsak: 'sena ankomst', forfaller: '2026-11-01' }),
      st('g1', 'Gun Grå', '0708888888', 'uteblev', 2, 400, 'obetald', {}),
    ] });
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const box = async sel => p.$eval(sel, e => ({ t: e.innerText.replace(/\n+/g, ' | ').replace(/\s/g, ' '), bg: getComputedStyle(e).backgroundColor, bd: getComputedStyle(e).borderColor })).catch(() => null);
  const red = b => b && b.bg === 'rgb(251, 227, 221)' && b.bd === 'rgb(179, 38, 30)';
  const green = b => b && b.bg === 'rgb(226, 241, 228)' && b.bd === 'rgb(46, 125, 50)';

  const e2 = await box('[data-avgift="e2"] [data-betalstatus]');
  ok(red(e2) && e2.t === '❌ Ej betald · 500,00 kr | Betala senast ons 11 nov.', 'Skickad debitering: röd ruta "Ej betald" med sista betalningsdag', e2 && e2.t);
  const f1 = await box('[data-avgift="f1"] [data-betalstatus]');
  ok(red(f1) && f1.t.includes('Förfallen – sista betalningsdag var sön 1 nov.'), 'Förfallen: röd ruta säger förfallen', f1 && f1.t);
  const g1 = await box('[data-avgift="g1"] [data-betalstatus]');
  ok(red(g1) && g1.t.includes('Debiteringen är inte skickad än.'), 'Inte skickad än: röd ruta säger det', g1 && g1.t);
  ok(!(await p.$('[data-avgift="e1"] [data-betalstatus]')), '1:a gången (ingen avgift) får ingen röd ruta');
  const sk = await box('[data-booking="erik"] [data-skuld]');
  ok(red(sk) && sk.t.startsWith('❌ Ej betald: 500,00 kr') && sk.t.includes('Sen avbokning (registrerad ons 4 nov) · 500,00 kr'), 'Eriks nya bokning: röd ruta "Ej betald" på kortet', sk && sk.t);
  ok(!(await p.$('[data-booking="bo"] [data-skuld]')), 'Kund utan skuld: ingen röd ruta på kortet');
  ok(!(await p.$('[data-rubrik="betalda"]')), 'Inga betalda än: ingen "Betalda"-rubrik');

  // Erik betalar
  await p.click('[data-avgift="e2"] [data-betald]'); await p.waitForTimeout(300);
  const q = await box('[data-confirm]');
  ok(q && q.t.includes('Markera som betald?') && q.t.includes('Tillfället räknas fortfarande i 12 månader'), 'Fråga före betald (räkningen nollställs inte)', q && q.t);
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  ok(!(await p.$('[data-avgift="e2"]')), 'Betald: borta ur listan att hantera');
  const g = await box('[data-avgift-betald="e2"] [data-betalstatus="betald"]');
  ok(green(g) && g.t === '✓ Betald · 500,00 kr | Markerad som betald tisdag 10 nov 2026 kl 08:00'.replace('tisdag', 'tis'), 'Rutan blir grön: "Betald" med tid', g && g.t);
  ok((await box('[data-rubrik="betalda"]')).t === '✅ Betalda avgifter (1)', 'Rubrik "Betalda avgifter (1)"');
  ok(!(await p.$('[data-booking="erik"] [data-skuld]')), 'Eriks kort: röda rutan borta när skulden är betald');
  ok((await db()).uteblivna.find(u => u.id === 'e2').status === 'betald', 'Databasen (demo): status betald');
  ok(errs.length === 0 && native === 0, 'Inga fel och inga webbläsardialoger', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})();
