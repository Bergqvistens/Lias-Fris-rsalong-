// Bokning steg 2: knappen "Välj en tid" visas först när en dag är vald
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const browser = await chromium.launch();
  for (const flera of [false, true]) {
    const tag = flera ? '2 personer' : '1 person';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto('https://lias.test/'); await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    await p.click('nav >> text=Boka'); await p.click('[data-cat="Herr"]'); await p.click('[data-service="h-kort"]');
    if (flera) { await p.click('text=Lägg till person'); await p.waitForTimeout(200); await (await p.$$('[data-person]'))[1].$('[data-cat="Herr"]').then(b => b.click()); await (await p.$$('[data-person]'))[1].$('[data-service="h-kort"]').then(b => b.click()); await p.fill('#boka-p0-namn', 'Kalle'); await p.fill('#boka-p1-namn', 'Olle'); }
    await p.click('text=Fortsätt'); await p.waitForTimeout(500);
    const step = await p.evaluate(() => document.body.innerText.includes('STEG 2 AV 3') || /Steg 2 av 3/i.test(document.body.innerText));
    ok(step, `${tag}: är i steg 2 (dag och tid)`);
    ok(!(await p.$('.lh-actionbar')), `${tag}: ingen knapp längst ner innan en dag är vald`);
    await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(500);
    const b1 = await p.$eval('.lh-actionbar button', b => ({ t: b.innerText.trim(), dis: b.disabled })).catch(() => null);
    ok(b1 && b1.t === 'Välj en tid' && b1.dis, `${tag}: efter vald dag syns "Välj en tid" (gråad)`, JSON.stringify(b1));
    await (await p.$$('.lh-time'))[0].click(); await p.waitForTimeout(200);
    const b2 = await p.$eval('.lh-actionbar button', b => ({ t: b.innerText.trim(), dis: b.disabled })).catch(() => null);
    ok(b2 && /^Fortsätt · \d\d:\d\d$/.test(b2.t) && !b2.dis, `${tag}: efter vald tid blir knappen "Fortsätt · tid"`, JSON.stringify(b2));
    await p.click('.lh-actionbar button'); await p.waitForTimeout(400);
    ok(/Steg 3 av 3/i.test(await p.evaluate(() => document.body.innerText)), `${tag}: knappen leder till steg 3`);
    if (!flera) await p.screenshot({ path: '/tmp/t/knapp-steg3.png' });
    ok(errs.length === 0, `${tag}: inga JavaScript-fel`, errs.join(' | '));
    await ctx.close();
  }
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
