// 30 okt 2026: länk i bekräftelse-sms:et där kunden själv bekräftar sin tid. Lia ser det direkt i admin och i loggen.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const T0 = new Date('2026-11-02T08:00:00+01:00').getTime();   // måndag 2 nov 08:00
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
  const newPage = async (url = 'https://lias.test/', time = T0) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.clock.install({ time });
    await p.goto(url); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    }
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    return p;
  };
  const book = async (p, people) => {
    await p.click('nav >> text=Boka'); await p.waitForTimeout(300);
    for (let i = 0; i < people.length; i++) {
      if (i > 0) { await p.click('[data-add-person]'); await p.waitForTimeout(200); }
      await p.click(`[data-person="${i}"] [data-cat="${people[i][0]}"]`); await p.click(`[data-person="${i}"] [data-service="${people[i][1]}"]`);
    }
    if (people.length > 1) for (let i = 0; i < people.length; i++) await p.fill(`#boka-p${i}-namn`, people[i][2]);
    await p.click('text=Fortsätt'); await p.waitForTimeout(500);
    await (await p.$$('.lh-day'))[people.length > 1 ? 2 : 0].click(); await p.waitForTimeout(500);
    const t = await p.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
    await p.click(`.lh-time:text-is("${people.length > 1 ? t[0] : '10:00'}")`); await p.click('text=Fortsätt'); await p.waitForTimeout(300);
    await p.fill('input[type=text]', 'Anna Andersson'); await p.fill('input[type=tel]', '070-123 45 67'); await p.fill('input[type=email]', 'anna@test.se');
    await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(900);
  };
  const smsLink = p => p.$eval('[data-sms="bekraftelse"] [data-sms-link]', a => ({ href: a.href, text: a.innerText, bubble: a.closest('[data-sms]').innerText })).catch(() => null);

  // --- 1. Kunden bokar: sms:et har en länk ---
  const k = await newPage();
  await book(k, [['Klippning', 'klipp-45']]);
  const l1 = await smsLink(k);
  ok(l1 && /^https:\/\/lias\.test\/#bekrafta=[0-9a-f-]{36}$/.test(l1.href) && l1.text === l1.href, 'Bekräftelse-sms:et har en länk "Bekräfta din tid"', l1 && l1.href);
  ok(l1 && l1.bubble.includes('(Klippning 45 min.). Bekräfta din tid genom att trycka på länken: ' + l1.href + ' Avboka/ändra senast mån 2 nov kl 10:00 på 073-642 30 18. Välkommen!'), 'Sms-texten i rätt ordning: tid, länk, avbokning', l1 && l1.bubble.split('\n').pop());

  const realLen = l1.bubble.split('\n').pop().replace('https://lias.test/', 'https://bergqvistens.github.io/Lias-Fris-rsalong-/').length;
  ok(realLen <= 306, 'Med den riktiga adressen ryms sms:et i 2 delar (' + realLen + ' tecken, max 306)');

  // --- 2. Lia i admin: inte bekräftad än ---
  const lia = await newPage();
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(400);
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1500);
  const conf = () => lia.$$eval('[data-booking] [data-confirmed]', cs => cs.map(c => c.dataset.confirmed + ': ' + c.innerText.trim()));
  ok(JSON.stringify(await conf()) === JSON.stringify(['false: Inte bekräftad av kunden än']), 'Admin: bokningen visar "Inte bekräftad av kunden än"', (await conf()).join(' | '));

  // --- 3. Kunden öppnar länken (ny flik, som från sms-appen), 5 min senare ---
  const c1 = await newPage(l1.href, T0 + 5 * 60000);
  await c1.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const v1 = await c1.evaluate(() => { const d = document.querySelector('[data-bekraftelse]'); return d ? { k: d.dataset.bekraftelse, t: d.innerText.replace(/\n+/g, ' | ') } : null; });
  ok(v1 && v1.k === 'ok' && v1.t.startsWith('Tack! Din tid är bekräftad | Lia ser nu att du har fått ditt sms. Välkommen, Anna!'), 'Kunden ser "Tack! Din tid är bekräftad"', v1 && v1.t);
  ok(v1 && v1.t.includes('Tisdag 3 november') && v1.t.includes('10:00–10:45 Klippning 45 min.') && v1.t.includes('Sandviksvägen 10, 691 52 Karlskoga') && v1.t.includes('Ring eller sms:a 073-642 30 18'), 'Visar dag, tid, tjänst, adress och telefon');
  await lia.waitForTimeout(800);
  const cf = await conf();
  ok(cf.length === 1 && cf[0] === 'true: Bekräftad av kunden mån 2 nov kl 08:05', 'Admin uppdateras direkt utan omladdning: "Bekräftad av kunden mån 2 nov kl 08:05"', cf.join(' | '));
  const ev = await lia.$$eval('[data-sms="kund-bekraftade"]', es => es.map(e => e.innerText.replace(/\n+/g, ' | ')));
  ok(ev.length === 1 && ev[0] === 'Registrerat mån 2 nov 2026 kl 08:05 | Händelse · Kunden bekräftade sin tid | Anna Andersson bekräftade sin tid tis 3 nov kl 10:00. Bekräftat mån 2 nov kl 08:05.', 'Loggen får en händelse med kund, tid och när den bekräftades', ev.join(' || '));

  // 30 okt (Tommy): i Lias sms-logg är länken bara text – Lia ska inte kunna bekräfta åt kunden
  const adm = await lia.evaluate(() => { const b = document.querySelector('[data-sms="bekraftelse"]'); return b ? { a: b.querySelectorAll('a').length, txt: (b.querySelector('[data-sms-link-text]') || {}).innerText || '', col: b.querySelector('[data-sms-link-text]') ? getComputedStyle(b.querySelector('[data-sms-link-text]')).color : '', body: getComputedStyle(b).color } : null; });
  ok(adm && adm.a === 0 && /^https:\/\/lias\.test\/#bekrafta=/.test(adm.txt) && adm.col === adm.body, 'Lias sms-logg: länken syns som vanlig text men går inte att trycka på', JSON.stringify(adm));
  const before = await lia.evaluate(() => location.href);
  await lia.click('[data-sms="bekraftelse"] [data-sms-link-text]'); await lia.waitForTimeout(500);
  ok((await lia.evaluate(() => location.href)) === before && !(await lia.$('[data-bekraftelse]')), 'Tryck på länktexten i admin gör ingenting');
  // --- 4. Länken igen: redan bekräftad, ingen ny händelse ---
  const c2 = await newPage(l1.href, T0 + 30 * 60000);
  await c2.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const v2 = await c2.evaluate(() => { const d = document.querySelector('[data-bekraftelse]'); return d ? { k: d.dataset.bekraftelse, t: d.innerText.replace(/\n+/g, ' | ') } : null; });
  ok(v2 && v2.k === 'redan' && v2.t.startsWith('Din tid är redan bekräftad | Du bekräftade mån 2 nov kl 08:05.'), 'Andra gången: "Din tid är redan bekräftad" med tidpunkten', v2 && v2.t.slice(0, 80));
  ok((await c2.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')).sms.filter(m => m.kind === 'kund-bekraftade').length)) === 1, 'Ingen dubbel händelse i loggen');
  await c2.click('[data-bekraftelse] button:has-text("Klar")'); await c2.waitForTimeout(500);
  ok((await c2.evaluate(() => location.hash)) === '' && !!(await c2.$('.lh-home')), 'Klar: till startsidan och länken försvinner ur adressfältet');
  await c2.close(); await c1.close();

  // --- 5. Felaktig länk ---
  const c3 = await newPage('https://lias.test/#bekrafta=00000000-0000-4000-8000-000000000000');
  await c3.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const v3 = await c3.evaluate(() => { const d = document.querySelector('[data-bekraftelse]'); return d ? { k: d.dataset.bekraftelse, t: d.innerText.replace(/\n+/g, ' | ') } : null; });
  ok(v3 && v3.k === 'fel' && v3.t.includes('Tiden kunde inte bekräftas') && v3.t.includes('Länken fungerar inte.') && v3.t.includes('073-642 30 18'), 'Felaktig länk: tydligt besked och telefonnummer', v3 && v3.t);
  await c3.close();

  // --- 6. Grupp (2 personer): båda bekräftas, klick på länken i appen fungerar också ---
  await k.click('[data-bekraftelse] button, .lh-done button:has-text("Klar")').catch(() => {}); await k.waitForTimeout(300);
  await book(k, [['Klippning', 'klipp-30', 'Anna'], ['Frans och/eller brynfärg', 'bryn', 'Bo']]);
  const l2 = await smsLink(k);
  ok(l2 && l2.bubble.includes('Bekräfta era tider genom att trycka på länken: ' + l2.href), 'Gruppbokning: "Bekräfta era tider genom att trycka på länken:" + länk', l2 && l2.href);
  await k.click('[data-sms="bekraftelse"] [data-sms-link]'); await k.waitForTimeout(900);
  const v4 = await k.evaluate(() => { const d = document.querySelector('[data-bekraftelse]'); return d ? d.innerText.replace(/\n+/g, ' | ') : null; });
  ok(v4 && v4.startsWith('Tack! Era tider är bekräftade') && /Anna: Klippning\/Herrklippning 30 min/.test(v4) && /Bo: Färg och form av bryn\./.test(v4), 'Tryck på länken direkt i appen fungerar; båda personerna visas', v4 && v4.slice(0, 160));
  const rows = await k.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')).bookings.filter(b => b.person_name).map(b => !!b.confirmed_at));
  ok(rows.length === 2 && rows.every(Boolean), 'Båda personernas bokningar är bekräftade', JSON.stringify(rows));
  await lia.waitForTimeout(800);
  ok((await conf()).filter(x => x.startsWith('true')).length === 3, 'Admin: alla tre kort visar bekräftad', (await conf()).join(' | '));

  // --- 7. Avbokad tid ---
  await lia.locator('div[data-booking]').first().locator('button:has-text("Avboka")').click(); await lia.waitForSelector('[data-confirm]'); await lia.click('[data-confirm] [data-svar="ja"]'); /* 30 okt: appens egen fråga-ruta */ await lia.waitForTimeout(600);
  const c5 = await newPage(l1.href);
  await c5.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const v5 = await c5.evaluate(() => (document.querySelector('[data-bekraftelse]') || {}).innerText || '');
  ok(v5.includes('Den här tiden är avbokad.'), 'Avbokad tid: "Den här tiden är avbokad."', v5.replace(/\n+/g, ' | ').slice(0, 90));
  await c5.close();

  // --- 8. Utseende ---
  await lia.locator('[data-sms="kund-bekraftade"]').first().scrollIntoViewIfNeeded();
  await lia.locator('[data-sms="kund-bekraftade"]').first().screenshot({ path: '/tmp/t/bekrafta-logg.png' });
  await lia.locator('[data-booking]').nth(1).screenshot({ path: '/tmp/t/bekrafta-admin.png' });
  const c6 = await newPage(l2.href, T0 + 60 * 60000);
  await c6.setViewportSize({ width: 320, height: 640 }); await c6.waitForTimeout(800);
  ok(await c6.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: kundens sida ryms utan sidledsscroll');
  await c6.screenshot({ path: '/tmp/t/bekrafta-kund.png' });

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
