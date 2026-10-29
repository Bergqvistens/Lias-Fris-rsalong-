// Avbokningsregler (29 okt 2026): 24 h före, 48 h för färgbehandling och permanent. Ingen avgift.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (w = 390) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    // Måndag 2 november 2026 kl 08:00 svensk tid
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto('https://lias.test/');
    await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    return p;
  };
  const p = await open();

  // --- Kontaktsidan ---
  await p.click('nav >> text=Kontakt'); await p.waitForTimeout(400);
  const k = await p.evaluate(() => { const s = document.querySelector('[data-section="avbokning"]'); return s ? { h: s.querySelector('h2').innerText, rows: [...s.querySelectorAll('[data-rule]')].map(t => t.innerText.replace(/\s+/g, ' ').trim()), txt: s.innerText, tel: (s.querySelector('a[href^="tel:"]') || {}).href, mail: (s.querySelector('a[href^="mailto:"]') || {}).href, border: getComputedStyle(s).borderTopWidth + ' ' + getComputedStyle(s).borderTopColor } : null; });
  ok(k && k.h === 'Avbokningsregler', 'Kontaktsidan har rubriken Avbokningsregler', k && k.h);
  ok(k && k.rows[0] === 'Senast 24 timmar före Klippning, bryn och fransar, tvätt & fön samt hårbottenmassage' && k.rows[1] === 'Senast 48 timmar före Färgbehandling och permanent', 'Två regler: 24 h och 48 h', k && k.rows.join(' / '));
  ok(k && k.tel === 'tel:+46736423018' && k.mail === 'mailto:lias.hantverkeri@gmail.com', 'Telefon och e-post går att trycka på');
  ok(k && !/avgift|debiter/i.test(k.txt), 'Ingen avgift nämns (beslut: ingen avgift än)');
  ok(k && k.border === '1px rgb(145, 116, 74)', 'Brun ram som övriga kort', k && k.border);
  const ordning = await p.evaluate(() => [...document.querySelectorAll('.lh-page h2')].map(h => h.innerText));
  ok(ordning.indexOf('Avbokningsregler') === ordning.indexOf('Öppettider') + 1, 'Ligger direkt under Öppettider', ordning.join(' > '));
  await p.locator('[data-section="avbokning"]').screenshot({ path: '/tmp/t/avbok-kontakt.png' });

  // --- Mer info ---
  await p.click('nav >> text=Boka'); await p.waitForTimeout(400);
  const info = async (cat, id) => { await p.click(`[data-cat="${cat}"]`); await p.click(`[data-info="${id}"]`); await p.waitForTimeout(250);
    const t = await p.$eval('[data-dialog="tjanst"] [data-cancel-info]', e => e.innerText.trim()).catch(() => null);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250); return t; };
  const regler = { 'Klippning': 'klipp-45', 'Frans och/eller brynfärg': 'bryn', 'Styling, tvätt & föning': 'tvatt-fon', 'Hårbottenmassage': 'harbotten', 'Färgbehandling': 'farg-150', 'Permanent': 'perm-kort' };
  const got = {};
  for (const [cat, id] of Object.entries(regler)) got[id] = await info(cat, id);
  ok(['klipp-45', 'bryn', 'tvatt-fon', 'harbotten'].every(i => got[i] === 'Avbokning senast 24 timmar före'), 'Mer info: korta tjänster visar 24 timmar', JSON.stringify(got));
  ok(['farg-150', 'perm-kort'].every(i => got[i] === 'Avbokning senast 48 timmar före'), 'Mer info: färg och permanent visar 48 timmar');

  // --- Steg 3: klippning, tisdag 3 nov 10:00 -> senast måndag 2 nov 10:00 ---
  await p.click('[data-cat="Klippning"]'); await p.click('[data-service="klipp-45"]'); await p.click('text=Fortsätt'); await p.waitForTimeout(500);
  const dayTxt = (await p.$$eval('.lh-day', d => d.map(x => x.innerText.replace(/\s+/g, ' '))));
  await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(500);
  await p.click('.lh-time:text-is("10:00")'); await p.click('text=Fortsätt'); await p.waitForTimeout(400);
  const s3 = await p.evaluate(() => { const c = document.querySelector('.lh-cancel'); const f = document.querySelector('input[type=email]'); const r = c.getBoundingClientRect();
    return { h: c.dataset.cancel, txt: c.innerText.replace(/\n+/g, ' | '), fore: !!(c.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING), bg: getComputedStyle(c).backgroundColor, border: getComputedStyle(c).borderTopWidth + ' ' + getComputedStyle(c).borderTopColor, w: r.width, vw: innerWidth }; });
  ok(/^tis/i.test(dayTxt[0]), 'Första dagen är tisdag 3 nov', dayTxt[0]);
  ok(s3.h === '24' && s3.txt.includes('Avboka eller ändra senast måndag 2 november kl 10:00.'), 'Steg 3 (innan bokning): senast måndag 2 november kl 10:00', s3.txt);
  ok(s3.fore, 'Avbokningsrutan står före kontaktfälten, alltså innan kunden trycker Boka');
  ok(s3.border === '1px rgb(145, 116, 74)' && s3.w <= s3.vw, 'Ljus ruta med brun ram, ryms på skärmen', s3.bg + ' / ' + s3.border);
  await p.locator('.lh-cancel').screenshot({ path: '/tmp/t/avbok-steg3.png' });
  await p.fill('input[type=text]', 'Anna Andersson'); await p.fill('input[type=tel]', '070-123 45 67'); await p.fill('input[type=email]', 'anna@test.se');
  await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(900);
  const d = await p.evaluate(() => ({ cancel: (document.querySelector('.lh-done .lh-cancel, .lh-cancel') || {}).innerText, sms: [...document.querySelectorAll('[data-sms="bekraftelse"]')].map(e => e.innerText).join(' '), body: document.querySelector('main').innerText }));
  ok(d.body.includes('Din tid är bokad!') && d.cancel && d.cancel.includes('senast måndag 2 november kl 10:00'), 'Bekräftelsen visar samma sista avbokningstid', (d.cancel || '').replace(/\n+/g, ' | '));
  ok(d.sms.includes('Avboka/ändra senast mån 2 nov kl 10:00: ring eller sms:a 073-642 30 18.'), 'Bekräftelse-sms innehåller sista avbokningstid', d.sms.replace(/\n/g, ' '));
  await p.screenshot({ path: '/tmp/t/avbok-bekraftelse.png', fullPage: true });

  // --- Färgbehandling onsdag 4 nov 09:00 -> 48 h -> senast måndag 2 nov 09:00 ---
  const p2 = await open();
  await p2.click('nav >> text=Boka'); await p2.waitForTimeout(300);
  await p2.click('[data-cat="Färgbehandling"]'); await p2.click('[data-service="farg-150"]'); await p2.click('text=Fortsätt'); await p2.waitForTimeout(500);
  await (await p2.$$('.lh-day'))[1].click(); await p2.waitForTimeout(500);
  await p2.click('.lh-time:text-is("09:00")'); await p2.click('text=Fortsätt'); await p2.waitForTimeout(400);
  const f = await p2.$eval('.lh-cancel', e => ({ h: e.dataset.cancel, t: e.innerText.replace(/\n+/g, ' | ') }));
  ok(f.h === '48' && f.t.includes('senast måndag 2 november kl 09:00'), 'Färgbehandling: 48 timmar före', f.t);

  // --- Färgbehandling tisdag 3 nov 09:00 -> gränsen redan passerad ---
  await p2.click('[aria-label="Tillbaka"], button:has-text("Tillbaka")').catch(() => {}); await p2.waitForTimeout(400);
  await (await p2.$$('.lh-day'))[0].click(); await p2.waitForTimeout(500);
  await p2.click('.lh-time:text-is("09:00")'); await p2.click('text=Fortsätt'); await p2.waitForTimeout(400);
  const g = await p2.$eval('.lh-cancel', e => ({ dl: e.querySelector('[data-cancel-deadline]').dataset.cancelDeadline, t: e.innerText.replace(/\n+/g, ' | ') }));
  ok(g.dl === 'passerad' && g.t.includes('Din tid är mindre än 48 timmar bort. Kan du inte komma, hör av dig till Lia så snart som möjligt.'), 'Tid närmare än gränsen: tydligt besked i stället för ett datum som redan passerat', g.t);

  // --- Grupp: klippning + färg -> strängaste regeln (48 h) gäller hela bokningen ---
  const p3 = await open();
  await p3.click('nav >> text=Boka'); await p3.waitForTimeout(300);
  await p3.click('[data-cat="Klippning"]'); await p3.click('[data-service="klipp-30"]');
  await p3.click('[data-add-person]'); await p3.waitForTimeout(300);
  await p3.click('[data-person="1"] [data-cat="Färgbehandling"]');
  await p3.click('[data-person="1"] [data-service="nyansering"]');
  await p3.fill('#boka-p0-namn', 'Anna'); await p3.fill('#boka-p1-namn', 'Bo');
  await p3.click('text=Fortsätt'); await p3.waitForTimeout(500);
  await (await p3.$$('.lh-day'))[2].click(); await p3.waitForTimeout(500);
  const t3 = await p3.$$eval('.lh-time', ts => ts.map(t => t.innerText.trim()));
  await p3.click(`.lh-time:text-is("${t3[0]}")`); await p3.click('text=Fortsätt'); await p3.waitForTimeout(400);
  const gr = await p3.$eval('.lh-cancel', e => e.dataset.cancel).catch(() => 'saknas');
  ok(gr === '48', 'Gruppbokning med färg: 48 timmar gäller hela bokningen', gr);

  // --- Smal skärm 320 px: inget sticker ut ---
  const p4 = await open(320); await p4.evaluate(() => { document.documentElement.style.zoom = 1.3; });
  await p4.click('nav >> text=Kontakt'); await p4.waitForTimeout(400);
  const ov = await p4.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[data-section="avbokning"] *')].every(e => e.getBoundingClientRect().right <= innerWidth + 0.5));
  ok(ov, 'Kontaktsidan på 320 px med 130 % text: inget sticker ut åt sidan');

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
