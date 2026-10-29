// Lias riktiga kontaktuppgifter och öppettider (från hennes bokningssida/Google, 28 okt 2026)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const built = fs.readFileSync('/mnt/user-data/outputs/github/index.html', 'utf8');
(async () => {
  ok(!/070-XXX|lias@hantverkeri\.se/.test(built), 'Inga gamla platshållare (070-XXX, lias@hantverkeri.se) kvar i appen');
  const browser = await chromium.launch();
  const errs = [];
  // Fast klocka: måndag 2 november 2026 kl 08:00 → bokningsbara dagar ska vara tis–fre
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url();
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
  const txtGdpr = await p.evaluate(() => document.body.innerText);
  ok(/073-642 30 18/.test(txtGdpr) && /lias\.hantverkeri@gmail\.com/.test(txtGdpr) && /Sandviksvägen 10, 691 52 Karlskoga/.test(txtGdpr), 'Integritetsrutan visar riktig e-post, telefon och adress');
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  ok(/Sandviksvägen 10, Karlskoga/.test(await p.$eval('.lh-footer', e => e.innerText)), 'Sidfoten visar adressen');

  await p.click('nav >> text=Kontakt'); await p.waitForTimeout(400);
  const c = await p.evaluate(() => ({
    tel: document.querySelector('[data-contact="telefon"]').innerText, telHref: (document.querySelector('[data-contact="telefon"] a') || {}).href || '',
    mail: document.querySelector('[data-contact="epost"]').innerText, mailHref: (document.querySelector('[data-contact="epost"] a') || {}).href || '',
    adr: document.querySelector('[data-contact="adress"]').innerText,
    hours: [...document.querySelectorAll('.lh-hours tr')].map(tr => tr.innerText.replace(/\s+/g, ' ').trim()) }));
  ok(/073-642 30 18/.test(c.tel) && c.telHref === 'tel:+46736423018', 'Telefon 073-642 30 18, går att trycka för att ringa', c.telHref);
  ok(/lias\.hantverkeri@gmail\.com/.test(c.mail) && c.mailHref === 'mailto:lias.hantverkeri@gmail.com', 'E-post lias.hantverkeri@gmail.com', c.mailHref);
  ok(/Sandviksvägen 10/.test(c.adr) && /691 52 Karlskoga/.test(c.adr), 'Adress Sandviksvägen 10, 691 52 Karlskoga', c.adr.replace(/\n/g, ' | '));
  const want = ['Måndag (idag) Stängt', 'Tisdag 09–17', 'Onsdag 09–17', 'Torsdag 09–17', 'Fredag 09–17', 'Lördag Öppet vid förfrågan', 'Söndag Stängt'];
  ok(JSON.stringify(c.hours) === JSON.stringify(want), 'Öppettiderna: mån stängt, tis–fre 09–17, lör vid förfrågan, sön stängt', c.hours.join(' / '));

  // Boka: vilka dagar och tider erbjuds?
  await p.click('nav >> text=Boka'); await p.waitForTimeout(400);
  await p.click('[data-cat="Herr"]'); await p.click('[data-service="h-kort"]'); await p.click('text=Fortsätt'); await p.waitForTimeout(600);
  const days = await p.$$eval('.lh-day', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ').trim()));
  const daysOk = days.length > 0 && days.every(d => /^(tis|ons|tors|fre)/i.test(d));
  ok(daysOk, 'Bokningsbara dagar är bara tisdag–fredag (inte mån, lör, sön)', days.slice(0, 8).join(' / ') || '(hittade inga dagknappar)');
  await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(600);
  const times = await p.$$eval('.lh-time', ts => ts.map(t => t.innerText.trim()));
  ok(times.length > 0 && times[0] === '09:00' && times.every(t => t >= '09:00' && t < '17:00'), 'Första tiden 09:00, alla tider före 17:00', times[0] + ' … ' + times[times.length - 1]);
  await p.screenshot({ path: '/tmp/t/kontakt-oppettider.png', fullPage: false });
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 200));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
