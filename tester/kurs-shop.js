const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const outside = [];
const mainText = p => p.evaluate(() => document.querySelector('main').innerText);
const occTexts = p => p.$$eval('main button[data-occ]', bs => bs.map(b => ({ t: b.innerText.replace(/\n/g, ' | '), dis: b.disabled })));
const bar = p => p.evaluate(() => { const d = [...document.querySelectorAll('main div')].find(x => getComputedStyle(x).position === 'sticky'); if (!d) return null; const b = d.querySelector('button'); return { text: b.innerText.replace(/\u00a0/g, ' '), disabled: b.disabled }; });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 384, height: 800 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
    outside.push(u); return r.abort();
  });
  await ctx.addInitScript(() => {
    window.__notifs = []; const N = function (t, o) { window.__notifs.push(t + ' / ' + (o && o.body || '').replace(/\n/g, ' ')); }; N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
  });
  const pages = [];
  const open = async () => {
    const p = await ctx.newPage(); p.errs = []; pages.push(p);
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) p.errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.goto('https://lias.test/'); await p.waitForTimeout(600);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    return p;
  };
  const fill = async (p, name) => { await p.fill('input[type=text]', name); await p.fill('input[type=tel]', '0707654321'); await p.fill('input[type=email]', 'kund@exempel.se'); };
  const openCourse = async (p, id) => { await p.click('nav >> text=Kurser'); await p.waitForTimeout(200); await p.click(`[data-course="${id}"] button`); await p.waitForTimeout(500); };

  // Lia loggar in
  const lia = await open();
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(400);
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1200);
  await lia.click('text=Slå på larm'); await lia.waitForTimeout(200);

  console.log('--- KURSER ---');
  const k1 = await open();
  await k1.click('nav >> text=Kurser'); await k1.waitForTimeout(200);
  ok((await k1.$$('[data-course] button')).length === 4, 'Alla 4 kurser har en bokningsknapp');
  await openCourse(k1, 'c-begin');
  let o = await occTexts(k1);
  ok(o.length === 3, '3 kursomgångar för nybörjarkursen', o.map(x => x.t).join('  ||  '));
  ok(o[0].t.startsWith('Start tisdag') && o[0].t.includes('18:00–20:00') && o[0].t.includes('6 gånger'), 'Omgång på tisdagar 18–20, 6 gånger');
  ok(o[0].t.includes('2 platser kvar') && o[1].t.includes('6 platser kvar') && o[2].t.includes('8 platser kvar'), 'Lediga platser visas (exempel: 8−6, 8−2, 8)');
  const keys = await k1.$$eval('main button[data-occ]', bs => bs.map(b => b.getAttribute('data-occ')));
  const dates = keys.map(k => new Date(k.split('@')[1].slice(0, 10) + 'T12:00:00Z'));
  ok(dates.every(d => d.getUTCDay() === 2) && (dates[1] - dates[0]) / 86400000 === 42 && dates[0] > new Date(), 'Startdatum är tisdagar, 6 veckor isär, i framtiden', keys.map(k => k.split('@')[1].slice(0, 10)).join(', '));
  let b = await bar(k1); ok(b && b.disabled, 'Kan inte gå vidare utan omgång', b && b.text);
  await k1.click(`main button[data-occ="${keys[0]}"]`); await k1.waitForTimeout(100);
  await k1.click('button[aria-label="Fler"]'); await k1.waitForTimeout(100);
  const plusDisabled = await k1.$eval('button[aria-label="Fler"]', x => x.disabled);
  ok(plusDisabled && (await k1.$eval('[data-testid=antal]', x => x.innerText)) === '2', 'Antal platser kan inte överstiga lediga platser (2)');
  b = await bar(k1); ok(b.text.includes('2 platser') && b.text.includes('2 400'), 'Pris räknas för 2 platser', b.text);
  await k1.click('text=Fortsätt'); await k1.waitForTimeout(200);
  ok((await mainText(k1)).includes('STEG 2 AV 2'), 'Uppgiftssteget visas');
  await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(200);
  ok((await k1.$$('[data-err]')).length === 3, 'Tomma fält stoppas med 3 felmeddelanden');
  await fill(k1, 'Eva Ek'); await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(700);
  const kd = await mainText(k1);
  ok(kd.includes('Du är anmäld!') && kd.includes('Keramik för nybörjare') && kd.includes('2 platser'), 'Kunden får "Du är anmäld!"');
  const ksms = await k1.$eval('[data-sms="kurs-bekraftelse"]', e => e.innerText).catch(() => '');
  ok(ksms.includes('Hej Eva!') && ksms.includes('2 platser'), 'Kurs-sms visas (demo)', ksms.replace(/\n/g, ' '));
  await k1.screenshot({ path: '/tmp/t/k-done.png' });

  await lia.waitForTimeout(700);
  ok(await lia.$('[data-coursebooking]') !== null && (await mainText(lia)).includes('Eva Ek'), 'Kursbokningen dök upp hos Lia direkt');
  ok((await lia.evaluate(() => window.__notifs)).some(n => n.startsWith('Ny kursbokning: Eva Ek')), 'Lia fick notis om kursbokningen');

  const k2 = await open();
  await openCourse(k2, 'c-begin');
  o = await occTexts(k2);
  ok(o[0].t.includes('Fullbokad') && o[0].dis, 'Omgången är nu fullbokad och går inte att välja');
  await k2.click('nav >> text=Kurser'); await openCourse(k2, 'c-kids');
  o = await occTexts(k2);
  ok(o[0].t.includes('Fullbokad') && o[0].dis, 'Barnkursens första omgång är fullbokad (exempel)');
  await k2.click('nav >> text=Kurser'); await openCourse(k2, 'c-drop');
  o = await occTexts(k2);
  ok(o.length === 8 && o.every(x => /^(Fredag .*16:00–18:00|Lördag .*10:00–12:00)/.test(x.t)), 'Drop-in: 8 tillfällen, fredagar 16–18 och lördagar 10–12', o.slice(0, 2).map(x => x.t).join('  ||  '));

  console.log('--- Två kunder tar sista platserna samtidigt ---');
  const k3 = await open(), k4 = await open();
  for (const [k, n] of [[k3, 'Kim Tre'], [k4, 'Kim Fyra']]) {
    await openCourse(k, 'c-begin');
    await k.click(`main button[data-occ="${keys[1]}"]`);
    for (let i = 0; i < 3; i++) await k.click('button[aria-label="Fler"]');
    await k.click('text=Fortsätt'); await fill(k, n);
  }
  await k3.click('button:has-text("Boka ·")'); await k3.waitForTimeout(700);
  await k4.click('button:has-text("Boka ·")'); await k4.waitForTimeout(900);
  ok((await mainText(k3)).includes('Du är anmäld!'), 'Första kunden får 4 platser');
  const k4t = await mainText(k4);
  ok(k4t.includes('Det finns inte så många platser kvar') && k4t.includes('STEG 1 AV 2'), 'Andra kunden får besked och skickas tillbaka');
  o = await occTexts(k4); ok(o[1].t.includes('2 platser kvar'), 'Rätt antal kvar visas efteråt', o[1].t);

  console.log('--- Lia avbokar kursplats ---');
  await lia.waitForTimeout(500);
  await lia.locator('[data-coursebooking]', { hasText: 'Eva Ek' }).locator('button:has-text("Avboka")').click(); await lia.waitForTimeout(500);
  ok(!(await mainText(lia)).includes('Eva Ek') || (await lia.$$('[data-coursebooking]')).length === 1, 'Avbokningen försvann från listan');
  ok((await lia.$$eval('[data-sms]', es => es.map(e => e.getAttribute('data-sms'))))[0] === 'kurs-avbokning', 'Avboknings-sms till kunden i loggen');
  await k2.click('nav >> text=Kurser'); await openCourse(k2, 'c-begin');
  o = await occTexts(k2); ok(o[0].t.includes('2 platser kvar') && !o[0].dis, 'Platserna är lediga igen');

  console.log('--- SHOP ---');
  const s1 = await open();
  await s1.click('nav >> text=Shop'); await s1.waitForTimeout(500);
  const stockTxt = await s1.$$eval('[data-product]', ps => ps.map(p => p.getAttribute('data-product') + ':' + p.getAttribute('data-stock') + ':' + ((p.querySelector('.lh-badge') || {}).innerText || '')));
  ok(stockTxt.join(',') === 's-cup:5:I lager,s-bowl:3:I lager,s-vase:1:Endast 1 kvar,s-plate:4:I lager,s-pot:6:I lager,s-set:0:Slut i lager', 'Lagerstatus visas: I lager / Endast 1 kvar / Slut i lager (exempelsaldo)', stockTxt.join(', '));
  ok(await s1.$eval('[data-product="s-set"] [data-buy]', x => x.disabled && x.innerText.includes('Slut i lager')), 'Slutsåld vara kan inte läggas i varukorgen');
  ok((await bar(s1)) === null, 'Ingen kassaknapp när varukorgen är tom');
  await s1.click('[data-product="s-cup"] button:has-text("Lägg i varukorg")'); await s1.click('button[aria-label="Fler Handgjord kaffekopp"]');
  await s1.click('[data-product="s-vase"] button:has-text("Lägg i varukorg")');
  ok(await s1.$eval('button[aria-label="Fler Dekorativ vas"]', x => x.disabled), 'Kan inte lägga fler vaser än lagret (1)');
  b = await bar(s1); ok(b && b.text.includes('3 varor') && b.text.includes('1 010'), 'Varukorgen summerar', b && b.text);
  await s1.screenshot({ path: '/tmp/t/s-shop.png' });
  await s1.click('nav >> text=Start'); await s1.click('nav >> text=Shop'); await s1.waitForTimeout(400);
  b = await bar(s1); ok(b && b.text.includes('3 varor'), 'Varukorgen finns kvar efter att ha bytt flik');
  await s1.click('text=Till kassan'); await s1.waitForTimeout(200);
  ok((await mainText(s1)).includes('Kassa') && (await s1.$$('[data-line]')).length === 2, 'Kassan visar 2 rader');
  await s1.click('button:has-text("Betala ·")'); await s1.waitForTimeout(200);
  ok((await s1.$$('[data-err]')).length === 4, 'Tomma fält och inget betalsätt stoppas (4 meddelanden)');
  await fill(s1, 'Olle Olsson'); await s1.click('button:has-text("Swish")');
  await s1.screenshot({ path: '/tmp/t/s-kassa.png', fullPage: true });
  await s1.click('button:has-text("Betala ·")'); await s1.waitForTimeout(400);
  ok((await mainText(s1)).includes('Väntar på godkännande i Swish'), 'Simulerad Swish-betalning visas');
  await s1.waitForTimeout(1600);
  const sd = (await mainText(s1)).replace(/\u00a0/g, ' ');
  ok(sd.includes('Tack för ditt köp!') && sd.includes('LH-1001') && sd.includes('2 st Handgjord kaffekopp') && sd.includes('1 010'), 'Kunden får kvitto med ordernummer', sd.split('\n').filter(l => /LH-|st |betalt/.test(l)).join(' | '));
  const osms = await s1.$eval('[data-sms="order-bekraftelse"]', e => e.innerText).catch(() => '');
  ok(osms.includes('LH-1001') && osms.includes('1010 kr'), 'Order-sms visas (demo)', osms.replace(/\n/g, ' '));
  await s1.screenshot({ path: '/tmp/t/s-done.png' });

  await lia.waitForTimeout(700);
  ok(await lia.$('[data-order]') !== null && (await lia.$eval('[data-order]', e => e.innerText)).includes('BETALD'), 'Beställningen dök upp hos Lia som BETALD');
  ok((await lia.evaluate(() => window.__notifs)).some(n => n.startsWith('Ny beställning LH-1001')), 'Lia fick notis om beställningen');
  await lia.click('button:has-text("Klar att hämta")'); await lia.waitForTimeout(500);
  ok((await lia.$eval('[data-order]', e => e.innerText)).includes('KLAR ATT HÄMTA'), 'Lia markerar klar att hämta');
  ok((await lia.$$eval('[data-sms]', es => es.map(e => e.getAttribute('data-sms'))))[0] === 'order-hamtklar', 'Hämt-sms till kunden i loggen');
  await lia.click('[data-order] button:has-text("Hämtad")'); await lia.waitForTimeout(500);
  ok((await lia.$$('[data-order]')).length === 0, 'Hämtad beställning försvinner från listan');
  await lia.screenshot({ path: '/tmp/t/s-admin.png', fullPage: true });

  const klarCount = await s1.locator('text=Klar').count(); const firstKlar = await s1.locator('text=Klar').first().innerText(); console.log('   [felsökning] text=Klar träffar', klarCount, 'element, första:', JSON.stringify(firstKlar.slice(0,60))); await s1.click('button:text-is("Klar")'); await s1.waitForTimeout(500);
  const after = await s1.$$eval('[data-product]', ps => ps.map(p => p.getAttribute('data-product') + ':' + p.getAttribute('data-stock') + ':' + ((p.querySelector('.lh-badge') || {}).innerText || '')));
  ok(after.includes('s-cup:3:I lager') && after.includes('s-vase:0:Slut i lager'), 'Lagret minskade efter köpet', after.slice(0, 3).join(', '));

  console.log('--- Två kunder köper sista skålarna ---');
  const s2 = await open(), s3 = await open();
  for (const [s, q, n] of [[s2, 3, 'Ada A'], [s3, 2, 'Bea B']]) {
    await s.click('nav >> text=Shop'); await s.waitForTimeout(400);
    await s.click('[data-product="s-bowl"] button:has-text("Lägg i varukorg")');
    for (let i = 1; i < q; i++) await s.click('button[aria-label="Fler Keramikskål"]');
    await s.click('text=Till kassan'); await fill(s, n); await s.click('button:has-text("Kort")');
  }
  await s2.click('button:has-text("Betala ·")'); await s2.waitForTimeout(2000);
  await s3.click('button:has-text("Betala ·")'); await s3.waitForTimeout(2200);
  ok((await mainText(s2)).includes('Tack för ditt köp!'), 'Första kunden får de 3 skålarna (kort)');
  const s3t = await mainText(s3);
  ok(s3t.includes('Tyvärr räcker inte lagret för Keramikskål') && (await s3.$$('[data-line]')).length === 0, 'Andra kunden får besked och varan tas bort ur varukorgen');

  ok(outside.filter(u => !u.includes('supabase-js') && !u.includes('fonts.googleapis.com') && !u.includes('fonts.gstatic.com')).length === 0, 'Inga anrop till någon server', [...new Set(outside.map(u => new URL(u).host))].join(', ') || 'inga');
  const errs = pages.flatMap(p => p.errs);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
