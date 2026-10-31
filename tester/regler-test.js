// 1 nov 2026: regel för uteblivet besök/sen avbokning syns för kunden och måste godkännas före bokning.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const TXT = 'Uteblir du, eller avbokar senare än så, är första gången utan kostnad. Från andra gången debiteras hela priset för den bokade behandlingen. Bara de senaste 12 månaderna räknas, och när en avgift är betald börjar räkningen om.';
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
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  // Kontakt
  await p.click('nav >> text=Kontakt'); await p.waitForTimeout(400);
  const k = await p.$eval('[data-rule="uteblivet"]', e => ({ dt: e.querySelector('dt').innerText, dd: e.querySelector('dd').innerText })).catch(() => null);
  ok(k && k.dt === 'Uteblivet besök eller sen avbokning' && k.dd === TXT, 'Kontaktsidan: regeln för uteblivet besök under Avbokningsregler', k && k.dt);
  // Mer info
  await p.click('nav >> text=Boka'); await p.waitForTimeout(300);
  await p.click('[data-cat="Färgbehandling"]'); await p.click('[data-info="farg-150"]'); await p.waitForTimeout(250);
  ok((await p.$eval('[data-noshow-info]', e => e.innerText.trim()).catch(() => '')) === 'Uteblivet besök: första gången utan kostnad, därefter hela priset', 'Mer info: kort rad om uteblivet besök');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // Boka
  await p.click('[data-service="farg-150"]'); await p.click('text=Fortsätt'); await p.waitForTimeout(400);
  await (await p.$$('.lh-day'))[1].click(); await p.waitForTimeout(400);
  await p.click('.lh-time:text-is("09:00")'); await p.click('text=Fortsätt'); await p.waitForTimeout(300);
  const s3 = await p.evaluate(() => ({ box: (document.querySelector('.lh-cancel [data-noshow]') || {}).innerText, cb: document.querySelector('#boka-regler') && document.querySelector('#boka-regler').checked, label: (document.querySelector('[data-regler]') || {}).innerText, h: document.querySelector('[data-regler]').getBoundingClientRect().height, order: !!(document.querySelector('[data-regler]').compareDocumentPosition(document.querySelector('input[type=email]')) & Node.DOCUMENT_POSITION_FOLLOWING) }));
  ok(s3.box === 'Uteblivet besök: ' + TXT, 'Steg 3: regeln står i avbokningsrutan innan kunden bokar');
  ok(s3.cb === false && s3.label === 'Jag har läst och godkänner avbokningsreglerna, även att uteblivna besök kan debiteras.' && s3.h >= 44 && s3.order, 'Kryssruta: inte förifylld, tydlig text, stor tryckyta, före kontaktfälten', s3.h);
  await p.fill('input[type=text]', 'Tommy Bergqvist'); await p.fill('input[type=tel]', '0736344954'); await p.fill('input[type=email]', 't@test.se');
  await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(600);
  const e1 = await p.evaluate(() => ({ err: (document.querySelector('#boka-regler-fel') || {}).innerText, inv: document.querySelector('#boka-regler').getAttribute('aria-invalid'), main: document.querySelector('main').innerText, n: (JSON.parse(localStorage.getItem('lias_demo_db') || '{"bookings":[]}').bookings || []).length }));
  ok(e1.err === 'Du behöver godkänna avbokningsreglerna för att kunna boka.' && e1.inv === 'true' && !e1.main.includes('Din tid är bokad!') && e1.n === 0, 'Utan kryss: tydligt fel och ingen bokning', e1.err);
  await p.check('#boka-regler'); await p.waitForTimeout(100);
  ok(!(await p.$('#boka-regler-fel')), 'Felet försvinner när kunden kryssar');
  await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(900);
  const d = await p.evaluate(() => ({ main: document.querySelector('main').innerText, box: (document.querySelector('.lh-done [data-noshow]') || {}).innerText, db: JSON.parse(localStorage.getItem('lias_demo_db')).bookings }));
  ok(d.main.includes('Din tid är bokad!') && d.db.length === 1 && d.db[0].rules_version === '2026-11-01', 'Med kryss: bokad, regelversionen sparad på bokningen (bevis)', d.db[0] && d.db[0].rules_version);
  ok(d.box === 'Uteblivet besök: ' + TXT, 'Bekräftelsen visar regeln igen');
  await p.locator('.lh-done .lh-cancel').screenshot({ path: '/tmp/t/regler-bekraftelse.png' });
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
