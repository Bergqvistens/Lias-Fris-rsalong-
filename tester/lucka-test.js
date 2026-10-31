// 31 okt 2026: inga korta luckor i Lias schema (Lia valde B). Lucka före/efter = 0 min eller minst 45 min.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const q = (a, b) => { const out = []; let [h, m] = a.split(':').map(Number); const [eh, em] = b.split(':').map(Number); while (h * 60 + m <= eh * 60 + em) { out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')); m += 15; if (m === 60) { m = 0; h++; } } return out; };
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const open = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto('https://lias.test/'); await p.waitForTimeout(600);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    }
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    return p;
  };
  const p = await open();
  await p.evaluate(() => localStorage.setItem('lias_demo_db', JSON.stringify({ bookings: [{ id: 'b1', created_at: '2026-11-01T10:00:00Z', service_ids: ['klipp-45'], service_names: 'Klippning 45 min.', price: 600, starts_at: '2026-11-03T10:00:00+01:00', ends_at: '2026-11-03T10:45:00+01:00', customer_name: 'Anna', customer_phone: '0701234567', customer_email: 'a@t.se', status: 'bokad', person_name: null, group_id: 'b1' }], sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000 })));
  const times = async (svc, dayIdx, pg = p, people) => {
    await pg.click('nav >> text=Start'); await pg.click('nav >> text=Boka'); await pg.waitForTimeout(300);
    if (people) { for (let i = 0; i < people.length; i++) { if (i) { await pg.click('[data-add-person]'); await pg.waitForTimeout(150); } await pg.click(`[data-person="${i}"] [data-cat="${people[i][0]}"]`); await pg.click(`[data-person="${i}"] [data-service="${people[i][1]}"]`); } for (let i = 0; i < people.length; i++) await pg.fill(`#boka-p${i}-namn`, 'P' + i); }
    else { await pg.click('[data-cat="Klippning"]'); await pg.click(`[data-service="${svc}"]`); }
    await pg.click('text=Fortsätt'); await pg.waitForTimeout(400);
    await (await pg.$$('.lh-day'))[dayIdx].click(); await pg.waitForTimeout(500);
    return pg.$$eval('.lh-time', ts => ts.map(t => t.innerText.trim()));
  };
  // Tisdag 3 nov med bokning 10:00–10:45, kund vill ha 45 min
  let t = await times('klipp-45', 0);
  const want1 = ['10:45', ...q('11:30', '15:30'), '16:15'];
  ok(JSON.stringify(t) === JSON.stringify(want1), 'Dag med bokning 10:00–10:45: bara tider utan korta luckor', t.join(' '));
  ok(!t.includes('09:15') && !t.includes('11:00') && !t.includes('11:15'), 'Dolda: 09:15 (15 min efter öppning), 11:00 (15 min lucka), 11:15 (30 min lucka)');
  ok(t.includes('10:45') && t.includes('11:30'), 'Visas: 10:45 (direkt efter) och 11:30 (45 min lucka)');
  // tom dag
  t = await times('klipp-45', 1);
  const want2 = ['09:00', ...q('09:45', '15:30'), '16:15'];
  ok(JSON.stringify(t) === JSON.stringify(want2), 'Tom dag, 45 min: 09:00, sedan 09:45–15:30 och 16:15 (slutar vid stängning)', t.length + ' tider');
  // 30 min-tjänst tom dag
  t = await times('klipp-30', 1);
  const want3 = ['09:00', ...q('09:45', '15:45'), '16:30'];
  ok(JSON.stringify(t) === JSON.stringify(want3), 'Tom dag, 30 min: 09:00, 09:45–15:45 och 16:30', t.join(' ').slice(0, 60) + ' …');
  // grupp: total längd räknas
  t = await times(null, 0, p, [['Klippning', 'klipp-30'], ['Frans och/eller brynfärg', 'bryn']]);
  ok(t.includes('09:00') && !t.includes('09:15') && t.includes('10:45') && !t.includes('11:00'), 'Grupp (30+30 min): 09:00 slutar 10:00 direkt före bokningen; 11:00 döljs', t.slice(0, 4).join(' '));

  // Kapplöpning: A ser 11:30, B hinner boka 10:45–11:15 → 11:30 skulle lämna 15 min lucka
  const A = p;
  t = await times('klipp-45', 0, A);
  await A.click('.lh-time:text-is("11:30")'); await A.click('text=Fortsätt'); await A.waitForTimeout(300);
  await A.fill('input[type=text]', 'Kund A'); await A.fill('input[type=tel]', '0701111111'); await A.fill('input[type=email]', 'a@t.se');
  const B = await open();
  t = await times('klipp-30', 0, B);
  ok(t.includes('10:45'), 'Kund B ser 10:45');
  await B.click('.lh-time:text-is("10:45")'); await B.click('text=Fortsätt'); await B.waitForTimeout(300);
  await B.fill('input[type=text]', 'Kund B'); await B.fill('input[type=tel]', '0702222222'); await B.fill('input[type=email]', 'b@t.se');
  await B.click('button:has-text("Boka ·")'); await B.waitForTimeout(900);
  ok((await B.evaluate(() => document.querySelector('main').innerText)).includes('Din tid är bokad!'), 'Kund B bokar 10:45–11:15');
  await A.click('button:has-text("Boka ·")'); await A.waitForTimeout(1200);
  const at = await A.evaluate(() => document.querySelector('main').innerText);
  const aTimes = await A.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
  ok(at.includes('Någon hann boka precis bredvid, så den tiden skulle lämna en kort lucka i Lias schema. Välj en annan tid.') && at.includes('STEG 2 AV 3') && !aTimes.includes('11:30') && aTimes.includes('12:00'), 'Kund A: tydligt besked, tillbaka till tidsvalet, 11:30 borta, 12:00 finns', aTimes.slice(0, 3).join(' '));
  const db = await A.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  ok(db.bookings.filter(b => b.status === 'bokad').length === 2, 'Inget sparades för kund A');
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
