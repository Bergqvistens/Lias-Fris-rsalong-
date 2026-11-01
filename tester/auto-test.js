// 1 nov 2026, del 3: 10 min efter start frågar appen "Har X kommit?", 15 min efter start registreras uteblivet besök + sms.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const T0 = new Date('2026-11-03T10:05:00+01:00').getTime();
(async () => {
  const browser = await chromium.launch();
  const errs = []; let native = 0;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.addInitScript(() => { window.__notifs = []; const N = function (t) { window.__notifs.push(t); }; N.permission = 'granted'; N.requestPermission = () => Promise.resolve('granted'); window.Notification = N; });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  p.on('dialog', d => { native++; d.dismiss(); });
  await p.clock.install({ time: T0 });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const bk = (id, name, phone, price, hhmm, rules = '2026-11-01') => ({ id, created_at: '2026-10-20T10:00:00Z', service_ids: ['klipp-30'], service_names: 'Klippning', price, starts_at: `2026-11-03T${hhmm}:00+01:00`, ends_at: new Date(new Date(`2026-11-03T${hhmm}:00+01:00`).getTime() + 30 * 60000).toISOString(), customer_name: name, customer_phone: phone, customer_email: 'k@t.se', status: 'bokad', person_name: null, group_id: id, rules_version: rules });
  await p.evaluate(d => { localStorage.setItem('lias_demo_db', JSON.stringify(d)); localStorage.setItem('lias_larm', 'pa'); }, {
    bookings: [bk('anna', 'Anna Andersson', '0701234567', 600, '10:00'), bk('bo', 'Bo Berg', '0702222222', 500, '09:56'), bk('cia', 'Cia Cedar', '0703333333', 500, '09:57'),
      bk('erik', 'Erik Ek', '0705555555', 500, '10:01'), bk('dan', 'Dan Dahl', '0704444444', 500, '09:00', null)],
    sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000,
    uteblivna: [{ id: 'a1', created_at: new Date(T0 - 30 * 86400000).toISOString(), booking_id: 'gammal', group_id: null, customer_name: 'Anna Andersson', customer_phone: '0701234567', kind: 'uteblev', nummer: 1, belopp: 0, status: 'ingen_avgift', andrad_at: null, skickat_at: new Date(T0 - 30 * 86400000).toISOString() }] });
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const prompts = () => p.$$eval('[data-har-kommit]', es => es.map(e => e.dataset.harKommit));
  const to = async hhmmss => { const t = new Date(`2026-11-03T${hhmmss}+01:00`).getTime(); const now = await p.evaluate(() => Date.now()); await p.clock.runFor(t - now); await p.waitForTimeout(1500); };

  ok((await prompts()).length === 0 && (await db()).uteblivna.length === 1, '10:05: inga frågor än, inget registrerat');
  // Erik kommer i tid
  await p.locator('[data-booking="erik"] [data-kom]').click(); await p.waitForTimeout(800);
  // 10:06:30 – Bo (09:56 + 10 min)
  await to('10:06:30');
  ok(JSON.stringify(await prompts()) === '["bo"]', '10:06: "Har Bo Berg kommit?" visas', JSON.stringify(await prompts()));
  ok((await p.$eval('[data-har-kommit="bo"]', e => e.innerText.replace(/\s+/g, ' '))).startsWith('⏰ Har Bo Berg kommit? Tiden började kl 09:56. Svarar du inte registreras ett uteblivet besök kl 10:11 och kunden får ett sms.'), 'Frågan förklarar vad som händer och när');
  ok((await p.evaluate(() => window.__notifs)).includes('Har Bo Berg kommit?'), 'Lia får en notis (larmet är på)');
  await p.click('[data-har-kommit="bo"] [data-svar-kom="ja"]'); await p.waitForTimeout(1200);
  ok(!(await prompts()).includes('bo') && !!(await db()).bookings.find(b => b.id === 'bo').arrived_at, 'Ja: Bo registrerad som kommen, frågan borta');
  // 10:07:30 – Cia, svarar Nej
  await to('10:07:30');
  ok((await prompts()).includes('cia'), '10:07: fråga för Cia');
  await p.click('[data-har-kommit="cia"] [data-svar-kom="nej"]'); await p.waitForTimeout(400);
  const cia = await p.$eval('[data-booking="cia"] [data-narvaro]', e => e.innerText.replace(/\s+/g, ' ').trim());
  ok(cia.startsWith('Markerad som utebliven – registreras och sms skickas kl 10:12') && !(await db()).uteblivna.some(u => u.booking_id === 'cia'), 'Nej: kortet visar att sms går kl 10:12, inget skickat än', cia);
  // 10:12:30 – Cia registreras automatiskt
  await to('10:12:30');
  let s = await db();
  const uc = s.uteblivna.find(u => u.booking_id === 'cia');
  ok(uc && uc.nummer === 1 && uc.belopp === 0 && s.sms.some(m => m.kind === 'saknad' && m.text === 'Hej Cia! Vi saknade dig på din tid tis 3 nov kl 09:57 hos Lias Hantverkeri. Hör gärna av dig på 073-642 30 18.'), '10:12: Cia registrerad automatiskt (1:a gången, ingen avgift) och sms skickat');
  ok((await prompts()).includes('anna'), '10:12: fråga för Anna (började 10:00) visas');
  ok(!(await prompts()).includes('erik'), 'Erik, som redan kom, får ingen fråga');
  // 10:15:30 – Anna har inte svarats på: automatiskt, 2:a gången
  await to('10:15:30');
  s = await db();
  const ua = s.uteblivna.find(u => u.booking_id === 'anna');
  ok(ua && ua.nummer === 2 && ua.belopp === 600 && ua.status === 'obetald', '10:15: Anna (inget svar) registrerad automatiskt – 2:a gången, 600 kr');
  ok(s.sms.some(m => m.kind === 'saknad' && m.text.startsWith('Hej Anna! Vi saknade dig')) && !s.sms.some(m => m.kind === 'debitering'), 'Sms till Anna: vi saknade dig (ingen avgift i det automatiska sms:et – Lia skickar debiteringen själv)');
  ok((await p.$$('[data-avgift]')).length === 2 && (await p.$$('[data-att-skicka]')).length === 1 && (await prompts()).length === 0, 'Anna och Cia i "Avgifter och varningar" (att skicka), inga frågor kvar');
  // Dan (bokad före reglerna) rörs aldrig
  await to('10:40:00');
  ok(!(await db()).uteblivna.some(u => u.booking_id === 'dan'), 'Bokning utan godkända regler registreras aldrig automatiskt');
  ok((await db()).uteblivna.length === 3 && !(await db()).uteblivna.some(u => ['bo', 'erik'].includes(u.booking_id)), 'Totalt: Cia och Anna nya, inte Bo eller Erik');
  // Kom ändå efteråt
  await p.locator('[data-booking="anna"] [data-kom-anda]').click(); await p.waitForTimeout(300); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(1600);
  ok((await db()).uteblivna.find(u => u.booking_id === 'anna').status === 'havd' && !(await p.$$eval('[data-avgift]', es => es.map(e => e.innerText).join(' '))).includes('Anna'), 'Kunden kom ändå (sent): avgiften hävs');
  ok(native === 0, 'Ingen vit webbläsarruta', native);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
