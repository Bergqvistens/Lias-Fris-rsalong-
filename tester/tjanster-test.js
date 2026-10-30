// Lias 17 tjänster i bokningen: kategori → en tjänst per person, "från"-pris, "Mer info"-ruta med hennes beskrivning
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const { SERVICES, CATS } = require('/tmp/t/tjanster-data.js');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const kr = n => Number(n).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' });   // samma format som appen (formatPrice)
const norm = t => t.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
// 30 okt (Tommy): Bottenfärgs namn delas upp – kort namn + rutan 'Detta ingår inte' (testas i ingar-test.js). Övriga namn ordagrant.
const shownName = x => x.id === 'farg-botten' ? 'Bottenfärg/utväxt' : x.name;
(async () => {
  const browser = await chromium.launch();
  const open = async (w = 390, zoom = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto('https://lias.test/'); await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    if (zoom > 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    await p.click('nav >> text=Boka'); await p.waitForTimeout(300);
    p.ctxRef = ctx; return p;
  };

  console.log('--- Kategorier och tjänster ---');
  let p = await open();
  const cats = await p.$$eval('[data-person="0"] [data-cat]', bs => bs.map(b => b.innerText.replace(/\u00ad/g, '').trim()));
  ok(JSON.stringify(cats) === JSON.stringify(CATS), 'Sex kategorier i rätt ordning', cats.join(' | '));
  ok(!(await p.$('.lh-actionbar button:not([disabled])')), 'Knappen är inte aktiv innan en tjänst är vald');
  for (const cat of CATS) {
    await p.click(`[data-person="0"] [data-cat="${cat}"]`); await p.waitForTimeout(100);
    const shown = await p.$$eval('[data-person="0"] [data-service]', bs => bs.map(b => ({ id: b.getAttribute('data-service'), t: b.innerText })));
    const want = SERVICES.filter(s => s.cat === cat);
    const good = shown.length === want.length && want.every((s, k) => shown[k].id === s.id && norm(shown[k].t).includes(shownName(s)) && norm(shown[k].t).includes(s.dur + ' min') && norm(shown[k].t).includes('från ' + norm(kr(s.price))));
    ok(good, `${cat}: ${want.length} tjänster med namn, tid och "från"-pris`, shown.map(x => x.id).join(', '));
  }
  console.log('--- "Mer info" för alla 17 tjänster ---');
  let infoOk = 0, infoFel = [];
  for (const svc of SERVICES) {
    await p.click(`[data-person="0"] [data-cat="${svc.cat}"]`).catch(() => {}); await p.waitForTimeout(60);
    if (!(await p.$(`[data-info="${svc.id}"]`))) { await p.click(`[data-person="0"] [data-cat="${svc.cat}"]`); await p.waitForTimeout(60); }
    await p.click(`[data-info="${svc.id}"]`); await p.waitForTimeout(150);
    const d = await p.$eval('[data-dialog="tjanst"]', e => ({ svc: e.getAttribute('data-svc'), h: e.querySelector('h2').innerText, desc: e.querySelector('.lh-svcinfo__desc').innerText, meta: e.querySelector('.lh-svcinfo__meta').innerText, cat: e.querySelector('.lh-svcinfo__cat').innerText })).catch(() => null);
    if (d && d.svc === svc.id && d.h === shownName(svc) && norm(d.desc) === norm(svc.desc) && norm(d.meta).includes(svc.dur + ' min') && norm(d.meta).includes('från ' + norm(kr(svc.price))) && d.cat.toLowerCase() === svc.cat.toLowerCase()) infoOk++; else infoFel.push(svc.id);
    await p.click('[data-dialog="tjanst"] [data-tillbaka="topp"]'); await p.waitForTimeout(120);
  }
  ok(infoOk === 17, 'Alla 17 "Mer info"-rutor visar rätt namn, kategori, tid, "från"-pris och Lias beskrivning ordagrant', infoOk + ' rätt' + (infoFel.length ? ', fel: ' + infoFel.join(', ') : ''));
  ok(!(await p.$('[data-dialog="tjanst"]')), '"Tillbaka" överst stänger rutan');

  console.log('--- Rutan: stäng och välj ---');
  await p.click('[data-person="0"] [data-cat="Klippning"]').catch(() => {}); await p.waitForTimeout(80);
  if (!(await p.$('[data-info="klipp-lyx"]'))) await p.click('[data-person="0"] [data-cat="Klippning"]');
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(150);
  ok(!(await p.$('.lh-actionbar')), 'När rutan är öppen döljs knappraden längst ner');
  await p.click('[data-dialog="tjanst"] [data-tillbaka="botten"]'); await p.waitForTimeout(150);
  ok(!(await p.$('[data-dialog="tjanst"]')), '"Tillbaka" längst ner stänger rutan');
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(150);
  await p.goBack(); await p.waitForTimeout(250);
  ok(!(await p.$('[data-dialog="tjanst"]')) && /Välj tjänst/.test(await p.evaluate(() => document.body.innerText)), 'Telefonens bakåtknapp stänger rutan (och lämnar inte bokningen)');
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(!(await p.$('[data-dialog="tjanst"]')), 'Escape stänger rutan');
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(150);
  await p.click('[data-valj="klipp-lyx"]'); await p.waitForTimeout(150);
  const sel = await p.$eval('[data-service="klipp-lyx"]', b => b.getAttribute('aria-checked'));
  ok(!(await p.$('[data-dialog="tjanst"]')) && sel === 'true', '"Välj den här tjänsten" väljer tjänsten och stänger rutan');
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(150);
  ok(!!(await p.$('[data-dialog="tjanst"] [data-chosen]')) && !(await p.$('[data-valj]')), 'Är tjänsten redan vald står det "Vald" i stället för knappen');
  await p.click('[data-dialog="tjanst"] [data-tillbaka="topp"]'); await p.waitForTimeout(150);

  console.log('--- En tjänst per person ---');
  await p.click('[data-service="klipp-30"]'); await p.waitForTimeout(80);
  const checked = await p.$$eval('[data-person="0"] [role="radio"][aria-checked="true"]', bs => bs.map(b => b.getAttribute('data-service')));
  ok(JSON.stringify(checked) === '["klipp-30"]', 'Bara en tjänst kan vara vald (nytt val ersätter det gamla)', checked.join(','));
  const sum = norm(await p.$eval('[data-summary="tjanster"]', e => e.innerText));
  ok(sum.includes('Klippning/Herrklippning 30 min') && sum.includes('Sammanlagt 30 min') && sum.includes('från ' + norm(kr(500))) && /"från"-priser/.test(sum), 'Sammanfattning: tjänst, 30 min, från 500 kr och förklaring om från-priser', sum);
  const bar = norm(await p.$eval('.lh-actionbar button', b => b.innerText));
  ok(bar === 'Fortsätt · 30 min · från ' + norm(kr(500)), 'Knappen: "Fortsätt · 30 min · från 500 kr"', bar);
  await p.click('[data-person="0"] [data-cat="Permanent"]'); await p.waitForTimeout(80);
  ok(!(await p.$('[data-person="0"] [role="radio"][aria-checked="true"]')) && !(await p.$('[data-summary="tjanster"]')), 'Byter man kategori nollställs valet');

  console.log('--- Hela bokningen (demo) ---');
  await p.click('[data-service="perm-kort"]'); await p.click('.lh-actionbar button'); await p.waitForTimeout(300);
  await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(400);
  const times = await p.$$eval('.lh-time', ts => ts.map(t => t.innerText.trim()));
  ok(times.length > 0 && times[times.length - 1] <= '15:00', 'Permanent 120 min: sista starttid senast 15:00 (stänger 17)', times[0] + ' … ' + times[times.length - 1]);
  await p.click('.lh-time >> nth=0'); await p.click('.lh-actionbar button'); await p.waitForTimeout(300);
  await p.fill('input[type=text]', 'Test Testsson'); await p.fill('input[type=tel]', '0701234567'); await p.fill('input[type=email]', 'test@exempel.se');
  const bok = norm(await p.$eval('.lh-actionbar button', b => b.innerText));
  ok(bok === 'Boka · från ' + norm(kr(1650)), 'Steg 3: "Boka · från 1 650 kr"', bok);
  await p.click('.lh-actionbar button'); await p.waitForTimeout(900);
  const done = norm(await p.evaluate(() => document.body.innerText));
  ok(done.includes('Din tid är bokad!') && done.includes('Permanent inkl. klippning kort hår.') && done.includes('från ' + norm(kr(1650)) + ' (betalas på plats)'), 'Bekräftelsen visar tjänsten och "från 1 650 kr (betalas på plats)"');
  const smsLia = await p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')).sms.find(m => m.kind === 'till-lia').text);
  ok(/från 1650 kr/.test(smsLia) && /Permanent inkl\. klippning kort hår\./.test(smsLia), 'Sms till Lia (demo) innehåller tjänsten och "från"-priset', smsLia);
  ok(p.errs.length === 0, 'Inga JavaScript-fel', p.errs.join(' | '));
  await p.ctxRef.close();

  console.log('--- Två personer, olika kategorier ---');
  p = await open();
  await p.click('[data-person="0"] [data-cat="Klippning"]'); await p.click('[data-person="0"] [data-service="klipp-45"]');
  await p.click('text=Lägg till person'); await p.waitForTimeout(200);
  await p.click('[data-person="1"] [data-cat="Frans och/eller brynfärg"]'); await p.click('[data-person="1"] [data-service="bryn"]');
  await p.fill('#boka-p0-namn', 'Kalle'); await p.fill('#boka-p1-namn', 'Lisa');
  const b2 = norm(await p.$eval('.lh-actionbar button', b => b.innerText));
  ok(b2 === 'Fortsätt · 75 min · från ' + norm(kr(800)), 'Två personer: 45 + 30 min, från 600 + 200 kr', b2);
  await p.click('.lh-actionbar button'); await p.waitForTimeout(300);
  await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(400);
  await p.click('.lh-time >> nth=0'); await p.waitForTimeout(150);
  const chain = norm(await p.$eval('[data-chain]', e => e.innerText));
  ok(/09:00–09:45 Kalle: Klippning 45 min\./.test(chain) && /09:45–10:15 Lisa: Färg och form av bryn\./.test(chain), 'Tiderna efter varandra: Kalle 09:00–09:45, Lisa 09:45–10:15', chain);
  ok(p.errs.length === 0, 'Inga JavaScript-fel', p.errs.join(' | '));
  await p.ctxRef.close();

  console.log('--- Smal skärm och 130 % text ---');
  for (const [w, z] of [[320, 1], [320, 1.3]]) {
    p = await open(w, z);
    const tag = `${w}px${z > 1 ? ' + 130 %' : ''}`;
    await p.click('[data-person="0"] [data-cat="Färgbehandling"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ hs: document.documentElement.scrollWidth <= innerWidth + 1, clip: [...document.querySelectorAll('.lh-catbtn__name, .lh-opt__name, .lh-opt__meta, .lh-svc__info')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.innerText.slice(0, 25)) }));
    ok(r.hs && r.clip.length === 0, `${tag}: kategorier och tjänster utan sidledsscroll eller avklippt text`, r.clip.join(' | '));
    const tap = await p.$$eval('.lh-svc__info, [data-person="0"] [data-cat]', bs => Math.min(...bs.map(b => b.getBoundingClientRect().height)));
    ok(tap >= 44, `${tag}: tryckytor minst 44 px ("Mer info" och kategorier)`, Math.round(tap) + ' px');
    await p.click('[data-info="farg-180"]'); await p.waitForTimeout(150);
    const dlg = await p.evaluate(() => { const d = document.querySelector('[data-dialog="tjanst"]'); const r = d.getBoundingClientRect(); return { inside: r.top >= 0 && r.left >= 0 && r.right <= innerWidth, clip: [...d.querySelectorAll('h2, p')].some(e => e.scrollWidth > e.clientWidth + 1) }; });
    ok(dlg.inside && !dlg.clip, `${tag}: "Mer info"-rutan får plats och inget klipps`);
    if (w === 320 && z === 1) { await p.screenshot({ path: '/tmp/t/tjanst-info-320.png' }); }
    await p.ctxRef.close();
  }
  // Skärmbilder till Tommy (390 px)
  p = await open();
  await p.click('[data-person="0"] [data-cat="Klippning"]'); await p.click('[data-service="klipp-45"]'); await p.waitForTimeout(200);
  await p.locator('[data-person="0"] .lh-cats').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -120));
  await p.screenshot({ path: '/mnt/user-data/outputs/tjanster-steg1.png' });
  await p.click('[data-info="klipp-lyx"]'); await p.waitForTimeout(250);
  await p.screenshot({ path: '/mnt/user-data/outputs/tjanster-mer-info.png' });
  await p.ctxRef.close();

  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
