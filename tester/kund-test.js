// 1 nov 2026 (del B): kunden bokar om eller avbokar själv via länken i sms:et. Sen ändring registreras för Lia.
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
    await p.check('#boka-regler', { timeout: 1000 }).catch(() => {}); await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(900);
  };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  const txt = (p, sel) => p.$eval(sel, e => e.innerText.replace(/\n+/g, ' | ')).catch(() => null);
  const linkOf = async (p, kind) => (await db(p)).sms.filter(m => m.kind === kind).map(m => (m.text.match(/https:\/\/\S+/) || [])[0])[0];
  const yes = async p => { await p.waitForSelector('[data-confirm]', { timeout: 3000 }).catch(() => {}); const t = await txt(p, '[data-confirm]'); await p.click('[data-confirm] .lh-ask__btns button:has-text("Ja,")'); await p.waitForTimeout(900); return t; };

  // ===== 1. Kunden bokar tis 3 nov 10:00 och öppnar länken mån 08:05 (i god tid) =====
  const k = await newPage();
  await book(k, [['Klippning', 'klipp-45']]);
  const l1 = await linkOf(k, 'bekraftelse');
  ok(/#bekrafta=[0-9a-f-]{36}$/.test(l1 || ''), 'Bokningen fick en länk i sms:et', l1);
  const c1 = await newPage(l1, T0 + 5 * 60000);
  await c1.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const h1 = await txt(c1, '[data-kund-hantera]');
  ok(h1 && h1.includes('Behöver du ändra?') && h1.includes('Avboka eller boka om utan avgift senast mån 2 nov 2026 kl 10:00 (24 timmar före).'), 'I god tid: visar sista tid utan avgift (24 tim före)', h1);
  ok(h1 && h1.includes('Boka om – välj ny tid') && h1.includes('Avboka tiden'), 'Knapparna "Boka om" och "Avboka" finns', h1);
  ok(h1 && h1.includes('Ring eller sms:a 073-642 30 18, eller mejla lias.hantverkeri@gmail.com'), 'Kunden kan fortfarande ringa, sms:a eller mejla Lia');
  ok(!(await c1.$('[data-sen-varning]')), 'Ingen varning om sen ändring i god tid');

  // ===== 2. Boka om till onsdag 13:00 =====
  await c1.click('[data-kund-omboka]'); await c1.waitForTimeout(400);
  ok(!!(await c1.$('[data-kund-omboka]')) && (await txt(c1, '.lh-steph')).includes('Nuvarande tid: tis 3 nov 2026 kl 10:00. Samma behandling, 45 min.'), 'Ombokning: visar nuvarande tid och att bara tiden byts', await txt(c1, '.lh-steph'));
  await (await c1.$$('.lh-day'))[0].click(); await c1.waitForTimeout(600);
  const tisTimes = await c1.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
  ok(!tisTimes.includes('10:00') && tisTimes.includes('09:00') && tisTimes.includes('10:15'), 'Samma dag: nuvarande tid 10:00 visas inte, men tiderna runt den (kundens egen tid räknas som ledig)', tisTimes.slice(0, 8).join(' '));
  await (await c1.$$('.lh-day'))[1].click(); await c1.waitForTimeout(600);
  await c1.click('.lh-time:text-is("13:00")'); await c1.waitForTimeout(200);
  await c1.click('.lh-actionbar button, button:has-text("Boka om till 13:00")'); await c1.waitForTimeout(300);
  ok(!(await c1.$('[data-confirm]')) && !!(await c1.$('#omboka-regler-fel')), 'Utan godkända regler: ingen fråga, felmeddelande vid rutan');
  await c1.check('#omboka-regler'); await c1.click('button:has-text("Boka om till 13:00")');
  const q1 = await yes(c1);
  ok(q1 && q1.includes('Boka om din tid?') && q1.includes('Från: tis 3 nov 2026 kl 10:00') && q1.includes('Till: ons 4 nov 2026 kl 13:00') && q1.includes('Din gamla tid avbokas automatiskt när den nya är sparad.'), 'Frågan visar från → till', q1);
  const r1 = await txt(c1, '[data-kund-resultat]');
  ok(r1 && r1.startsWith('Din tid är ombokad | Din gamla tid tis 3 nov 2026 kl 10:00 är avbokad. Lia har fått besked.') && r1.includes('Onsdag 4 november') && r1.includes('13:00–13:45 Klippning 45 min.'), 'Resultat: "Din tid är ombokad" med ny tid', r1);
  ok(!(await c1.$('[data-sen-registrerad]')), 'Ingen "sen ombokning" i god tid');
  let D = await db(c1);
  const old = D.bookings.filter(b => b.starts_at === new Date('2026-11-03T10:00:00+01:00').toISOString());
  const nyb = D.bookings.filter(b => b.starts_at === new Date('2026-11-04T13:00:00+01:00').toISOString());
  ok(old.length === 1 && old[0].status === 'avbokad' && old[0].cancelled_by === 'kund' && old[0].ombokad_till === new Date('2026-11-04T13:00:00+01:00').toISOString() && !!old[0].cancelled_at, 'Gamla tiden avbokades automatiskt (av kund, ombokad till ons 13:00)');
  ok(nyb.length === 1 && nyb[0].status === 'bokad' && !!nyb[0].confirmed_at && nyb[0].confirm_token !== old[0].confirm_token && nyb[0].customer_phone === '0701234567' && nyb[0].service_ids.join() === 'klipp-45', 'Nya tiden: samma kund och tjänst, bekräftad, ny länk');
  ok(D.uteblivna.length === 0, 'Ingen registrering (i god tid)');
  const smsK = D.sms.find(m => m.kind === 'ombokning'), smsL = D.sms.find(m => m.kind === 'till-lia' && /^Ombokning/.test(m.text));
  ok(smsK && smsK.to === '0701234567' && smsK.text.startsWith('Hej Anna! Din tid hos Lias Hantverkeri är ombokad till ons 4 nov kl 13:00: Klippning 45 min.. Den gamla tiden tis 3 nov kl 10:00 är avbokad. Se eller ändra bokningen: https://lias.test/#bekrafta=' + nyb[0].confirm_token), 'Kunden får sms med nya tiden och ny länk', smsK && smsK.text);
  ok(smsL && smsL.text === 'Ombokning via länken: Anna Andersson flyttade tis 3 nov kl 10:00 till ons 4 nov kl 13:00: Klippning 45 min.. Tel 0701234567', 'Lia får sms om ombokningen', smsL && smsL.text);

  // ===== 3. Gamla länken och "Visa din nya bokning" =====
  const c1b = await newPage(l1, T0 + 10 * 60000);
  await c1b.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  ok((await txt(c1b, '[data-bekraftelse]') || '').startsWith('Tiden finns inte längre | Den här tiden är ombokad. Använd länken i det senaste sms:et för att se din nya tid.'), 'Gamla länken: "Den här tiden är ombokad"', await txt(c1b, '[data-bekraftelse]'));
  await c1.click('[data-visa-ny]'); await c1.waitForTimeout(900);
  const v2 = await txt(c1, '[data-bekraftelse]');
  ok(v2 && v2.startsWith('Din tid är redan bekräftad') && v2.includes('13:00–13:45 Klippning 45 min.') && v2.includes('senast tis 3 nov 2026 kl 13:00'), '"Visa din nya bokning" öppnar nya tiden (redan bekräftad)', v2);

  // ===== 4. Lia i admin =====
  const lia = await newPage('https://lias.test/', T0 + 15 * 60000);
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(400);
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1500);
  const av = await lia.$$eval('[data-avbokad]', es => es.map(e => e.innerText.replace(/\n+/g, ' | ')));
  ok(av.length === 1 && av[0].includes('Ombokad av kunden via länken: mån 2 nov 2026 kl 08:05') && av[0].includes('Ny tid: ons 4 nov 2026 kl 13:00') && !av[0].includes('Inget eget meddelande'), 'Avbokade tider: "Ombokad av kunden via länken" + ny tid', av.join(' || '));

  // ===== 5. Sen avbokning: kunden öppnar nya länken tis 14:00 (gränsen var tis 13:00) =====
  const l2 = 'https://lias.test/#bekrafta=' + nyb[0].confirm_token;
  const c2 = await newPage(l2, T0 + 30 * 3600000);
  await c2.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const w = await txt(c2, '[data-sen-varning]');
  ok(w === 'Sista avbokningstiden har passerat | Den var tis 3 nov 2026 kl 13:00 (24 timmar före). Avbokar eller bokar du om nu räknas det som sen avbokning eller ombokning, och enligt avbokningsreglerna kan du då få betala hela priset för bokningen, 600 kr.', 'Sent: tydlig varning med gräns och pris', w);
  await c2.click('[data-kund-avboka]');
  const q2 = await yes(c2);
  ok(q2 && q2.includes('Avboka din tid?') && q2.includes('Avbokningen räknas som sen avbokning, och enligt avbokningsreglerna kan du få betala hela priset, 600 kr.'), 'Frågan före avbokning upprepar varningen', q2);
  const r2 = await txt(c2, '[data-kund-resultat]');
  ok(r2 && r2.startsWith('Din tid är avbokad') && r2.includes('Avbokningen gjordes efter sista avbokningstiden och räknas därför som en sen avbokning enligt avbokningsreglerna.'), 'Resultat: avbokad, räknas som sen avbokning', r2);
  D = await db(c2);
  const u = D.uteblivna;
  ok(u.length === 1 && u[0].kind === 'sen_avbokning' && u[0].nummer === 1 && u[0].belopp === 0 && u[0].status === 'ingen_avgift', 'Registreras automatiskt: sen avbokning, 1:a gången ingen avgift', JSON.stringify(u.map(x => [x.kind, x.nummer, x.belopp, x.status])));
  ok(D.bookings.find(b => b.id === nyb[0].id).cancelled_by === 'kund', 'Bokningen: avbokad av kund');
  ok(D.sms.some(m => m.kind === 'till-lia' && m.text === 'Avbokning via länken: Anna Andersson avbokade ons 4 nov kl 13:00 (Klippning 45 min.). Tel 0701234567. Sen avbokning, finns under Avgifter och varningar.'), 'Lia får sms om sen avbokning');
  await lia.waitForTimeout(900);
  const avg = await lia.$$eval('[data-avgift]', es => es.map(e => e.innerText.replace(/\n+/g, ' | ')));
  ok(avg.length === 1 && /sen avbokning/i.test(avg[0]), 'Lias admin uppdateras direkt: syns under Avgifter och varningar', avg.join(' || '));
  const av2 = await lia.$$eval('[data-avbokad]', es => es.map(e => e.innerText.replace(/\n+/g, ' | ')));
  ok(av2.length === 2 && av2.some(x => x.includes('Avbokad av kunden via länken: tis 3 nov 2026 kl 14:00')), 'Avbokade tider: "Avbokad av kunden via länken" med exakt tid', av2.join(' || '));
  ok(avg.length === 1 && avg[0].includes('Ingen avgift (1:a gången)') && !(await lia.$('[data-avgift] [data-efterskank]')), '1:a gången: ingen avgift (inget att efterskänka), Lia kan skicka varning', avg.join(' || '));

  // ===== 6. Ombokning krockar: tiden hann bli upptagen – gamla tiden ligger kvar =====
  const k3 = await newPage('https://lias.test/', T0 + 40 * 60000);
  await book(k3, [['Klippning', 'klipp-30']]);   // tis 3 nov 10:00
  const l3 = (await db(k3)).sms.filter(m => m.kind === 'bekraftelse').map(m => m.text.match(/https:\/\/\S+/)[0])[0];
  const c3 = await newPage(l3, T0 + 41 * 60000);
  await c3.waitForSelector('[data-kund-omboka]', { timeout: 5000 }).catch(() => {});
  await c3.click('[data-kund-omboka]'); await c3.waitForTimeout(300);
  await (await c3.$$('.lh-day'))[2].click(); await c3.waitForTimeout(600);   // tor 5 nov
  await c3.click('.lh-time:text-is("11:00")'); await c3.check('#omboka-regler');
  // Någon annan hinner boka tor 11:00 (läggs direkt i demodatabasen)
  await k.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); d.bookings.push({ id: 'krock', service_ids: ['klipp-30'], service_names: 'X', price: 500, starts_at: new Date('2026-11-05T11:00:00+01:00').toISOString(), ends_at: new Date('2026-11-05T11:30:00+01:00').toISOString(), customer_name: 'Krock K', customer_phone: '0700000000', customer_email: 'k@k.se', status: 'bokad' }); localStorage.setItem('lias_demo_db', JSON.stringify(d)); });
  await c3.click('button:has-text("Boka om till 11:00")'); await yes(c3);
  const e3 = await txt(c3, '.lh-flow');
  ok(e3 && e3.includes('Någon hann boka den tiden precis före dig. Välj en annan tid.') && !(await c3.$('[data-kund-resultat]')), 'Krock: tydligt fel, kunden stannar kvar och kan välja annan tid', e3 && e3.slice(-160));
  D = await db(c3);
  const b3 = D.bookings.filter(b => b.confirm_token === l3.split('=')[1]);
  ok(b3.length === 1 && b3[0].status === 'bokad' && !b3[0].cancelled_at && !b3[0].cancelled_by && !b3[0].ombokad_till, 'Allt eller inget: gamla tiden ligger kvar orörd');
  const t3 = await c3.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
  ok(!t3.includes('11:00'), 'Lediga tider hämtas om: 11:00 visas inte längre', t3.join(' '));

  // ===== 7. Tiden har börjat: inga knappar =====
  const c4 = await newPage(l3, new Date('2026-11-03T10:10:00+01:00').getTime());
  await c4.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const v4 = await txt(c4, '[data-bekraftelse]');
  ok(v4 && v4.includes('Din tid har börjat.') && !(await c4.$('[data-kund-avboka]')) && !(await c4.$('[data-kund-omboka]')), 'När tiden har börjat kan kunden inte avboka/boka om via länken', v4);

  // ===== 8. 2:a gången sent (tis 09:00, gränsen var mån 10:00): hela priset, och Lia kan efterskänka =====
  const c5 = await newPage(l3, new Date('2026-11-03T09:00:00+01:00').getTime());
  await c5.waitForSelector('[data-kund-avboka]', { timeout: 5000 }).catch(() => {});
  ok((await txt(c5, '[data-sen-varning]') || '').includes('hela priset för bokningen, 500 kr.'), 'Sent igen: varningen visar 500 kr');
  await c5.click('[data-kund-avboka]'); await yes(c5);
  D = await db(c5);
  const u2 = D.uteblivna.filter(x => x.nummer === 2);
  ok(u2.length === 1 && u2[0].kind === 'sen_avbokning' && u2[0].belopp === 500 && u2[0].status === 'obetald', '2:a gången: sen avbokning registreras med hela priset 500 kr', JSON.stringify(D.uteblivna.map(x => [x.kind, x.nummer, x.belopp, x.status])));
  await lia.waitForTimeout(900);
  const avg2 = await lia.$$eval('[data-avgift]', es => es.map(e => e.innerText.replace(/\n+/g, ' | ')));
  ok(avg2.length === 2 && avg2.some(x => /500,00\skr/.test(x) && x.includes('Efterskänk avgiften')), 'Lias admin: avgiften 500 kr syns direkt', avg2.join(' || '));
  await lia.click('[data-avgift] [data-efterskank]'); await lia.waitForTimeout(300);
  await yes(lia);
  await lia.waitForTimeout(900);
  D = await db(lia);
  ok(D.uteblivna.find(x => x.nummer === 2).status === 'havd', 'Lia häver (efterskänker) avgiften i adminläget', D.uteblivna.find(x => x.nummer === 2).status);

  // ===== 9. Två personer bokar om: samma personer, tjänster och ordning =====
  const k9 = await newPage('https://lias.test/', T0 + 60 * 60000);
  await book(k9, [['Klippning', 'klipp-30', 'Kalle'], ['Frans och/eller brynfärg', 'bryn', 'Lisa']]);
  const t9 = (await db(k9)).bookings.filter(b => b.person_name && b.status === 'bokad');
  const c9 = await newPage('https://lias.test/#bekrafta=' + t9[0].confirm_token, T0 + 61 * 60000);
  await c9.waitForSelector('[data-kund-omboka]', { timeout: 5000 }).catch(() => {});
  await c9.click('[data-kund-omboka]'); await c9.waitForTimeout(300);
  ok((await txt(c9, '.lh-steph')).includes('Samma personer och behandlingar, 60 min i följd.'), 'Två personer: 60 min i följd', await txt(c9, '.lh-steph'));
  await (await c9.$$('.lh-day'))[3].click(); await c9.waitForTimeout(600);   // fre 6 nov
  await c9.click('.lh-time:text-is("14:00")'); await c9.check('#omboka-regler');
  await c9.click('button:has-text("Boka om till 14:00")'); const q9 = await yes(c9);
  ok(q9 && q9.includes('Boka om era tider?') && q9.includes('14:00–14:30 Kalle: Klippning/Herrklippning 30 min') && q9.includes('14:30–15:00 Lisa: Färg och form av bryn.'), 'Frågan visar båda personerna med nya tider', q9);
  const n9 = (await db(c9)).bookings.filter(b => b.status === 'bokad' && b.customer_name === 'Anna Andersson' && b.starts_at >= new Date('2026-11-06T00:00:00+01:00').toISOString()).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
  ok(n9.length === 2 && n9[0].person_name === 'Kalle' && n9[1].person_name === 'Lisa' && n9[0].starts_at === new Date('2026-11-06T14:00:00+01:00').toISOString() && n9[1].starts_at === new Date('2026-11-06T14:30:00+01:00').toISOString() && n9[0].group_id === n9[1].group_id, 'Nya raderna: Kalle 14:00, Lisa 14:30, samma grupp', JSON.stringify(n9.map(b => [b.person_name, b.starts_at])));
  ok((await db(c9)).bookings.filter(b => t9.some(o => o.id === b.id)).every(b => b.status === 'avbokad' && b.cancelled_by === 'kund'), 'Båda gamla raderna avbokades');

  ok(errs.length === 0, 'Inga fel i konsolen', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})();
