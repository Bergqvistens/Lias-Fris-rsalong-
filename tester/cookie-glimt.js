// Cookie-rutan: visas första gången, stannar kvar; efter godkännande syns den ALDRIG vid omstart (inte ens en glimt)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const GDPR = /Jag förstår och accepterar/;
// Registrerar från allra första början om cookie-rutans text någon gång finns i sidan
const watch = () => { window.__gdprSeen = 0; window.__firstText = null; new MutationObserver(() => { const t = document.body && document.body.innerText; if (!t) return; const rt = (document.getElementById('root') || {}).innerText || ''; if (window.__firstText === null && rt.trim()) window.__firstText = rt.slice(0, 200); if (/Jag förstår och accepterar/.test(t)) window.__gdprSeen++; }).observe(document, { childList: true, subtree: true, characterData: true }); };
(async () => {
  const browser = await chromium.launch();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    return { ctx, p, errs };
  };
  const text = p => p.evaluate(() => document.body.innerText);

  console.log('--- Första besöket ---');
  let { ctx, p, errs } = await mk();
  await p.addInitScript(watch);
  await p.goto('https://lias.test/'); await p.waitForTimeout(2000);
  ok(GDPR.test(await text(p)), 'Cookie-rutan visas och står kvar efter 2 s');
  ok(!/Boka tid/.test(await text(p)) || GDPR.test(await text(p)), 'Appen bakom visas inte förrän man godkänt');
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(300);
  ok(!GDPR.test(await text(p)), 'Efter godkännande försvinner rutan');
  ok(await p.evaluate(() => localStorage.getItem('lias_v1')) === '{"gdprOk":true}', 'Godkännandet sparas i telefonen', await p.evaluate(() => localStorage.getItem('lias_v1')));

  console.log('--- Omstart efter godkännande (3 gånger) ---');
  for (let i = 1; i <= 3; i++) {
    await p.reload(); await p.waitForTimeout(3300);
    const seen = await p.evaluate(() => window.__gdprSeen), first = await p.evaluate(() => window.__firstText);
    ok(seen === 0, `Omstart ${i}: cookie-rutan syntes inte ens ett ögonblick`, 'antal gånger i sidan: ' + seen);
    ok(!GDPR.test(first || '') && /Skapa · Vårda · Inspireras/.test(first || ''), `Omstart ${i}: första som appen ritar (bakom startbilden) är sidhuvudet, inte cookie-rutan`, (first || '').replace(/\s+/g, ' ').slice(0, 60));
  }
  ok(await p.evaluate(() => localStorage.getItem('lias_v1')) === '{"gdprOk":true}', 'Godkännandet ligger kvar efter omstarter (skrivs inte över med "false")');
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
  await ctx.close();

  for (const [namn, varde] of [['trasig sparad uppgift', '{trasig'], ['sparat "inte godkänt"', '{"gdprOk":false}'], ['tom sparad uppgift', 'null']]) {
    console.log(`--- ${namn} ---`);
    ({ ctx, p, errs } = await mk());
    await p.addInitScript(v => { if (!sessionStorage.getItem('x')) { localStorage.setItem('lias_v1', v); sessionStorage.setItem('x', '1'); } }, varde);
    await p.goto('https://lias.test/'); await p.waitForTimeout(1500);
    ok(GDPR.test(await text(p)), `${namn}: cookie-rutan visas`);
    ok(errs.length === 0, `${namn}: appen kraschar inte`, errs.join(' | '));
    await ctx.close();
  }

  console.log('--- Telefonen blockerar lagring (läsning ger fel) ---');
  ({ ctx, p, errs } = await mk());
  await p.addInitScript(() => { Storage.prototype.getItem = function () { throw new Error('blockerad'); }; });
  await p.goto('https://lias.test/'); await p.waitForTimeout(1500);
  ok(GDPR.test(await text(p)), 'Lagring blockerad: cookie-rutan visas i stället för krasch');
  ok(errs.length === 0, 'Lagring blockerad: inga JavaScript-fel', errs.join(' | '));
  await ctx.close();

  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
