// Steg 6: admin – ekonomi och bilder (demoläge) + Supabase-läge
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const dk = ms => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const H = 3600000, D = 86400000;

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, timezoneId: 'Europe/Stockholm', acceptDownloads: true });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
    return r.abort();
  });
  await ctx.addInitScript(() => {
    window.__chimes = 0; window.__notifs = [];
    const N = function (t) { window.__notifs.push(t); }; N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
    const AC = window.AudioContext; if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__chimes++; return o.call(this); }; }
  });
  const open = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    return p;
  };

  // ---- Testdata (tider relativt nu) ----
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const bk = (id, startMs, status, name, phone, svc, price) => ({ id, created_at: iso(startMs - 2 * D), service_ids: ['x'], service_names: svc, price, starts_at: iso(startMs), ends_at: iso(startMs + 30 * 60000), customer_name: name, customer_phone: phone, customer_email: 'a@b.se', status });
  const seed = {
    bookings: [
      bk('v1', now - 1 * H, 'bokad', 'Vera Ek', '0701112233', 'Dam kort hår', 495),
      bk('v2', now - 3 * D, 'bokad', 'Ola Lund', '0702223344', 'Herr kort hår, Skäggtrim', 544),
      bk('v3', now - 9 * D, 'bokad', 'Gammal Gäst', '0703334455', 'Fön', 99),
      bk('v4', now - 2 * H, 'avbokad', 'Avbokad Person', '0704445566', 'Fön', 99),
      bk('v5', now + 1 * D, 'bokad', 'Morgon Kund', '0705556677', 'Fön', 99),
    ],
    courseBookings: [{ id: 'c1', created_at: iso(now - 9 * D), course_id: 'c-drop', course_name: 'Keramikverkstad drop-in', occasion_key: 'x', starts_at: iso(now - 2 * D), ends_at: iso(now - 2 * D + 2 * H), last_date: null, seats: 2, price: 300, customer_name: 'Kurs Karin', customer_phone: '0706667788', customer_email: 'k@b.se', status: 'bokad' }],
    orders: [
      { id: 'o1', number: 'LH-1001', created_at: iso(now - 5 * 60000), items: [{ id: 's-cup', name: 'Handgjord kaffekopp', qty: 1, price: 280 }], total: 280, payment: 'swish', customer_name: 'Sara Strand', customer_phone: '0707778899', customer_email: 's@b.se', status: 'betald' },
      { id: 'o2', number: 'LH-1002', created_at: iso(now - 30 * H), items: [{ id: 's-bowl', name: 'Keramikskål', qty: 1, price: 350 }], total: 350, payment: 'kort', customer_name: 'Anna Berg', customer_phone: '0709990011', customer_email: 'an@b.se', status: 'betald' },
    ],
    sms: [], sold: {}, orderSeq: 1002, payments: [], photos: [], receiptSeq: 1000,
  };

  const lia = await open();
  await lia.evaluate(s => localStorage.setItem('lias_demo_db', JSON.stringify(s)), seed);
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(400);
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1200);

  console.log('--- Flikar ---');
  const tabs = await lia.$$eval('[data-admintab]', bs => bs.map(b => b.innerText.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  ok(tabs.join('|') === 'Bokningar*|Ekonomi|Bilder', 'Admin har flikarna Bokningar (vald), Ekonomi, Bilder', tabs.join(' | '));
  ok((await lia.evaluate(() => document.querySelector('main').innerText)).includes('Slå på larm'), 'Bokningsfliken visar samma innehåll som förut');
  await lia.click('text=Slå på larm'); await lia.waitForTimeout(200);

  console.log('--- Ekonomi ---');
  await lia.click('[data-admintab="ekonomi"]'); await lia.waitForTimeout(700);
  ok((await lia.evaluate(() => document.querySelector('[data-section="ekonomi"]').innerText)).includes('inte bokföring och inte ett kassaregister'), 'Tydlig text: översikt, inte bokföring eller kassaregister');
  const visits = await lia.$$eval('[data-visit]', v => v.map(x => x.getAttribute('data-visit')));
  ok(visits.slice().sort().join(',') === 'c1,v1,v2', 'Obetalda besök: senaste 7 dagarna + idag (inte äldre, avbokade eller kommande)', visits.join(','));
  const kpi = async k => lia.$eval(`[data-kpi="${k}"] .lh-kpi__value`, x => Number(x.innerText.replace(/\D/g, '')));
  const todayKey = dk(now);
  const expToday0 = (dk(now - 5 * 60000) === todayKey ? 280 : 0) + (dk(now - 30 * H) === todayKey ? 350 : 0);
  ok(await kpi('idag') === expToday0 && await kpi('dygn') === 280, 'Före registrering: idag och senaste 24 h stämmer', `idag ${await kpi('idag')}, 24 h ${await kpi('dygn')}`);
  const v1 = lia.locator('[data-visit="v1"]');
  await v1.locator('button:has-text("Markera som betald")').click(); await lia.waitForTimeout(150);
  ok((await v1.innerText()).includes('Välj betalsätt.'), 'Utan betalsätt: felmeddelande vid besöket');
  await v1.locator('select').selectOption('kontant');
  await v1.locator('input').fill('abc');
  await v1.locator('button:has-text("Markera som betald")').click(); await lia.waitForTimeout(150);
  ok((await v1.innerText()).includes('Skriv ett belopp i hela kronor'), 'Ogiltigt belopp stoppas');
  await v1.locator('input').fill('500');
  await v1.locator('button:has-text("Markera som betald")').click(); await lia.waitForTimeout(900);
  const okMsg = await lia.$eval('.lh-ok', x => x.innerText).catch(() => '');
  ok(okMsg.includes('kvitto K-1001') && okMsg.includes('500') && okMsg.includes('Kontant'), 'Betalning registrerad med kvittonummer', okMsg);
  ok(!(await lia.$('[data-visit="v1"]')) && (await lia.$$('[data-visit]')).length === 2, 'Besöket försvann från listan över obetalda');
  const list24 = await lia.$$eval('[data-list="dygn"] [data-pay-row]', r => r.map(x => x.getAttribute('data-pay-row')));
  ok(list24.join(',') === 'K-1001,LH-1001', 'Senaste dygnet: K-1001 och LH-1001 (inte LH-1002 från för 30 timmar sedan)', list24.join(','));
  const expToday = expToday0 + 500;
  ok(await kpi('idag') === expToday && await kpi('dygn') === 780, 'Efter registrering: idag och 24 h uppdaterade', `idag ${await kpi('idag')} (förväntat ${expToday}), 24 h ${await kpi('dygn')}`);
  const rows = await lia.$$eval('[data-table="per-dag"] tbody tr', r => r.map(x => ({ d: x.getAttribute('data-day'), t: x.innerText.replace(/\s+/g, ' ').trim() })));
  ok(rows.length === 14 && rows[0].d === todayKey && rows[0].t.startsWith('Idag'), 'Inkomst per dag: 14 dagar, idag först', rows[0].t);
  const sumFor = key => { const r = rows.find(x => x.d === key); return r ? Number(r.t.split(' ').slice(-2).join('').replace(/\D/g, '')) : null; };
  ok(sumFor(todayKey) === expToday && sumFor(dk(now - 30 * H)) >= 350, 'Dagssummorna stämmer (idag och dagen för LH-1002)', `idag ${sumFor(todayKey)}, ${dk(now - 30 * H)}: ${sumFor(dk(now - 30 * H))}`);
  await lia.screenshot({ path: '/tmp/t/s6-ekonomi.png', fullPage: true });

  console.log('--- Sök kvitto ---');
  const search = async q => { await lia.fill('#kvitto-sok', q); await lia.waitForTimeout(150); return lia.$$eval('[data-list="sok"] [data-pay-row]', r => r.map(x => x.getAttribute('data-pay-row'))); };
  ok((await search('LH-1002')).join(',') === 'LH-1002', 'Sök på kvittonummer');
  ok((await search('anna')).join(',') === 'LH-1002', 'Sök på namn (skiftlägesokänsligt)');
  ok((await search('070-999')).join(',') === 'LH-1002', 'Sök på del av telefonnummer');
  ok((await search('k-1001')).join(',') === 'K-1001', 'Sök på kvitto från betalning på plats');
  await search('zzzz');
  ok(!!(await lia.$('[data-search="tom"]')), '"Inga kvitton hittades" vid ingen träff');
  await search('LH-1002');
  await lia.click('[data-list="sok"] [data-pay-row="LH-1002"]'); await lia.waitForTimeout(300);
  const rc = await lia.$eval('[role="dialog"]', d => d.innerText.replace(/\n/g, ' | '));
  ok(rc.includes('Kvitto LH-1002') && rc.includes('1 st Keramikskål') && rc.includes('Anna Berg') && rc.includes('350') && rc.includes('Kort') && rc.includes('inte ett kassakvitto'), 'Kvittovyn visar varor, kund, belopp och betalsätt', rc.slice(0, 160));
  await lia.screenshot({ path: '/tmp/t/s6-kvitto.png' });
  await lia.keyboard.press('Escape'); await lia.waitForTimeout(200);
  ok(!(await lia.$('[role="dialog"]')) && await lia.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-pay-row') === 'LH-1002'), 'Escape stänger, fokus tillbaka');

  console.log('--- Export ---');
  const month = todayKey.slice(0, 7);
  const inMonth = [{ k: dk(now - 5 * 60000), a: 280 }, { k: dk(now - 30 * H), a: 350 }, { k: todayKey, a: 500 }].filter(x => x.k.slice(0, 7) === month);
  const info = await lia.$eval('[data-export-info]', x => x.innerText.replace(/ /g, ' '));
  ok(info.startsWith(inMonth.length + ' betalningar'), 'Exportinfo visar antal för månaden', info);
  const [dl] = await Promise.all([lia.waitForEvent('download'), lia.click('button:has-text("(CSV)")')]);
  const file = await dl.path(); const csv = fs.readFileSync(file, 'utf8');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  ok(csv.charCodeAt(0) === 0xFEFF && dl.suggestedFilename() === `lias-betalningar-${month}.csv`, 'CSV med BOM (å, ä, ö i Excel) och rätt filnamn', dl.suggestedFilename());
  ok(lines[0] === 'Datum;Tid;Kvittonummer;Typ;Beskrivning;Kund;Betalsätt;Belopp (kr)', 'Rubrikrad', lines[0]);
  ok(lines.length === inMonth.length + 2 && lines[lines.length - 1].endsWith('Summa;' + inMonth.reduce((a, x) => a + x.a, 0)), 'En rad per betalning + summarad', lines.slice(1).join(' || '));
  ok(lines.some(l => l.includes(';K-1001;Frisör;Dam kort hår;Vera Ek;Kontant;500')), 'Raden för K-1001 är korrekt');
  fs.copyFileSync(file, '/tmp/t/s6-export.csv');

  console.log('--- Larmet fungerar på ekonomifliken ---');
  const ch0 = await lia.evaluate(() => window.__chimes);
  const k = await open();
  await k.click('nav >> text=Boka'); await k.click('[data-cat="Klippning"]'); await k.click('[data-service="klipp-30"]'); await k.click('text=Fortsätt');
  await (await k.$$('.lh-day'))[1].click(); await k.waitForTimeout(500);
  await k.click('.lh-time >> nth=0'); await k.click('text=Fortsätt');
  await k.fill('input[type=text]', 'Nils Nyman'); await k.fill('input[type=tel]', '0701231231'); await k.fill('input[type=email]', 'n@b.se');
  await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900);
  await lia.waitForTimeout(800);
  ok((await lia.evaluate(() => window.__chimes)) > ch0 && (await lia.evaluate(() => window.__notifs)).some(n => n.includes('Nils Nyman')), 'Ny bokning ger ljud och notis även när Lia är på ekonomifliken');
  await lia.click('[data-admintab="bokningar"]'); await lia.waitForTimeout(300);
  ok((await lia.evaluate(() => document.querySelector('main').innerText)).includes('Nils Nyman'), 'Bokningen syns på bokningsfliken');
  await k.close();

  console.log('--- Bilder ---');
  await lia.click('[data-admintab="bilder"]'); await lia.waitForTimeout(500);
  await lia.click('button:has-text("Spara bild")'); await lia.waitForTimeout(150);
  ok((await lia.$$('[data-section="bilder"] [data-err]')).length === 3, 'Utan bild, bildtext och godkännande: 3 felmeddelanden');
  await lia.setInputFiles('#bild-fil', '/tmp/t/ingenbild.txt'); await lia.waitForTimeout(400);
  ok((await lia.evaluate(() => document.querySelector('[data-section="bilder"]').innerText)).includes('Bilden kunde inte läsas'), 'Fil som inte är en bild stoppas');
  await lia.setInputFiles('#bild-fil', '/tmp/t/storbild.jpg'); await lia.waitForTimeout(1500);
  const prev = await lia.$eval('[data-preview] img', i => ({ w: i.naturalWidth, h: i.naturalHeight, len: i.src.length }));
  ok(prev.w <= 1000 && prev.h <= 1000 && Math.max(prev.w, prev.h) >= 640 && prev.len <= 400000, 'Stor mobilbild (4000×3000, 7 MB) förminskas före sparning', `${prev.w}×${prev.h}, ${Math.round(prev.len / 1024)} KB som text`);
  await lia.fill('#bild-text', 'Balayage i honungsblont');
  await lia.click('button:has-text("Spara bild")'); await lia.waitForTimeout(400);
  ok((await lia.evaluate(() => document.querySelector('[data-section="bilder"]').innerText)).includes('Kryssa i att kunden har godkänt'), 'Sparas inte utan kundens godkännande');
  await lia.check('#bild-ok');
  await lia.click('button:has-text("Spara bild")'); await lia.waitForTimeout(800);
  ok((await lia.$eval('.lh-ok', x => x.innerText).catch(() => '')).includes('Balayage i honungsblont'), 'Bilden sparades');
  ok((await lia.$$('[data-photo]')).length === 1, 'Bilden visas i listan');
  await lia.screenshot({ path: '/tmp/t/s6-bilder.png', fullPage: true });

  console.log('--- Bilden i galleriet ---');
  const g = await open();
  await g.click('nav >> text=Galleri'); await g.waitForTimeout(800);
  const own = await g.$$eval('h2[data-section="egna"] + .lh-ggrid [data-gallery]', t => t.map(x => ({ id: x.getAttribute('data-gallery'), cap: x.innerText.replace(/\n/g, ' / ') })));
  ok(own.length === 3 && own[0].id.startsWith('foto-') && own[0].cap.includes('Balayage i honungsblont') && !own[0].cap.includes('Inspirationsbild'), 'Uppladdad bild visas först under "Från Lias salong", utan inspirationsmärkning', own.map(o => o.cap).join(' | '));
  await g.click('[data-chip="keramik"]'); await g.waitForTimeout(150);
  ok(!(await g.$('h2[data-section="egna"]')), 'Frisörbilden visas inte under Keramik');
  await g.click('[data-chip="alla"]'); await g.waitForTimeout(150);
  await g.click(`[data-gallery="${own[0].id}"]`); await g.waitForTimeout(300);
  ok((await g.$eval('[role="dialog"]', d => d.innerText)).includes('Lias egen bild'), 'Ljuslådan märker bilden som Lias egen');
  await g.keyboard.press('Escape');
  await g.screenshot({ path: '/tmp/t/s6-galleri.png' });

  console.log('--- Ta bort bild ---');
  await lia.click('[data-photo] button:has-text("Ta bort")'); await lia.waitForTimeout(700);
  ok((await lia.$$('[data-photo]')).length === 0, 'Bilden togs bort i admin');
  await g.reload(); await g.waitForTimeout(800); await g.click('nav >> text=Galleri'); await g.waitForTimeout(800);
  ok((await g.$$('h2[data-section="egna"] + .lh-ggrid [data-gallery]')).length === 2, 'Bilden är borta från galleriet');
  await g.close();

  console.log('--- Smal skärm och 130 % text ---');
  for (const [w, z] of [[320, 1], [320, 1.3], [390, 1.3]]) {
    await lia.setViewportSize({ width: w, height: 800 });
    await lia.evaluate(z => { document.documentElement.style.zoom = z; }, z);
    for (const t of ['ekonomi', 'bilder']) {
      await lia.click(`[data-admintab="${t}"]`); await lia.waitForTimeout(500);
      const hs = await lia.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(hs, `${w}px${z !== 1 ? ' + 130 % text' : ''}: ${t} utan sidledsscroll`);
    }
  }
  await lia.evaluate(() => { document.documentElement.style.zoom = 1; });
  await lia.setViewportSize({ width: 390, height: 820 });

  console.log('--- Kontrast i admin ---');
  for (const t of ['bokningar', 'ekonomi']) {
    await lia.click(`[data-admintab="${t}"]`); await lia.waitForTimeout(500);
    const cs = await lia.evaluate(() => { const bg = getComputedStyle(document.querySelector('main')).backgroundColor; return [...document.querySelectorAll('main h1, main h2, main h3, .lh-econ__note')].filter(e => { if (e.offsetParent === null) return false; for (let n = e; n && n.tagName !== 'MAIN'; n = n.parentElement) if (getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') return false; return true; }).map(e => ({ t: e.innerText.slice(0, 22), c: getComputedStyle(e).color, bg })); });
    const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const low = cs.map(x => ({ ...x, r: (Math.max(L(x.c), L(x.bg)) + 0.05) / (Math.min(L(x.c), L(x.bg)) + 0.05) })).filter(x => x.r < 4.5);
    ok(cs.length > 0 && low.length === 0, `Admin ${t}: rubriker och infotext på turkos har kontrast ≥ 4,5`, low.map(x => x.t + ' ' + x.r.toFixed(2)).join(', ') || cs.length + ' texter kontrollerade');
  }

  console.log('--- Utloggad ---');
  await lia.click('[data-admintab="bokningar"]'); await lia.waitForTimeout(200);
  await lia.click('text=Logga ut'); await lia.waitForTimeout(400);
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(400);
  ok(!(await lia.$('[data-admintab]')) && !!(await lia.$('input[type=password]')), 'Utloggad: ekonomi och bilder syns inte, bara inloggningen');
  ok(errs.length === 0, 'Inga JavaScript-fel (demo)', errs.join(' | ').slice(0, 300));
  await ctx.close();

  console.log('--- Supabase-läge ---');
  const { newCtx, admin } = require('/tmp/t/e2e.js');
  admin("delete from bookings; delete from admins; delete from auth.users; insert into auth.users(email) values ('lia@test.se'); insert into admins select id from auth.users where email='lia@test.se';");
  const s = await newCtx(browser);
  await s.click('footer >> text=Admin'); await s.waitForTimeout(300);
  await s.fill('input[type=email]', 'lia@test.se'); await s.fill('input[type=password]', 'hemligt123'); await s.click('button:has-text("Logga in")'); await s.waitForTimeout(1500);
  await s.click('[data-admintab="ekonomi"]'); await s.waitForTimeout(300);
  ok((await s.evaluate(() => document.querySelector('main').innerText)).includes('Kräver att Supabase kopplas in med tabeller för betalningar'), 'Supabase-läge: Ekonomi förklarar att det inte är byggt än');
  await s.click('[data-admintab="bilder"]'); await s.waitForTimeout(300);
  ok((await s.evaluate(() => document.querySelector('main').innerText)).includes('lagring för bilder'), 'Supabase-läge: Bilder förklarar att det inte är byggt än');
  await s.click('[data-admintab="bokningar"]'); await s.waitForTimeout(300);
  ok((await s.evaluate(() => document.querySelector('main').innerText)).includes('Inga kommande bokningar'), 'Supabase-läge: bokningsfliken fungerar');
  ok(s.errs.length === 0, 'Supabase-läge: inga JavaScript-fel', s.errs.join(' | '));

  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
