// 30 okt 2026: när Lia trycker "Hämtad" på en beställning skrivs en händelse i loggen (datum, tid, kund). Inget sms skickas.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  let dialogSvar = true, dialogText = '';
  p.on('dialog', d => { dialogText = d.message(); dialogSvar ? d.accept() : d.dismiss(); });
  // Fredag 30 oktober 2026 kl 06:25 svensk tid
  await p.clock.install({ time: new Date('2026-10-30T06:25:00+01:00').getTime() });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const ord = (n, name, phone, status) => ({ id: 'o' + n, number: 'LH-' + n, created_at: '2026-10-29T10:00:00.000Z', items: [{ id: 's-cup', name: 'Kopp', qty: 1 }], total: 250, payment: 'swish', customer_name: name, customer_phone: phone, customer_email: 'k@test.se', status });
  await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), { bookings: [], sms: [], courseBookings: [], orders: [ord(1001, 'Tommy Bergqvist', '0736344954', 'klar'), ord(1002, 'Anna Andersson', '0701234567', 'betald')], sold: {}, orderSeq: 1002, payments: [], photos: [], receiptSeq: 1000 });
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const logg = () => p.$$eval('[data-sms]', cs => cs.map(c => ({ kind: c.dataset.sms, ev: c.dataset.event === 'true', head: c.querySelector('[data-sms-head]').innerText.trim(), text: c.innerText.trim() })));
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));

  // 1. Avbryt i frågan -> ingenting händer
  dialogSvar = false;
  await p.click('button:text-is("Hämtad")'); await p.waitForTimeout(500);
  ok(dialogText === 'Markera LH-1001 som hämtad?', 'Lia får en kontrollfråga först', dialogText);
  ok((await logg()).length === 0 && (await db()).orders.find(o => o.number === 'LH-1001').status === 'klar', 'Avbryter hon blir ingenting skrivet och beställningen ligger kvar');

  // 2. Bekräfta -> händelse i loggen
  dialogSvar = true;
  await p.click('button:text-is("Hämtad")'); await p.waitForTimeout(700);
  const l = await logg();
  ok(l.length === 1 && l[0].kind === 'order-hamtad' && l[0].ev, 'En händelse visas i loggen direkt, utan omladdning', JSON.stringify(l.map(x => x.kind)));
  ok(l[0] && l[0].text.endsWith('LH-1001 är utlämnad till Tommy Bergqvist (0736344954). Hämtad fre 30 okt kl 06:25.'), 'Texten har ordernummer, kund, telefon, datum och tid', l[0] && l[0].text.replace(/\n/g, ' | '));
  ok(l[0] && l[0].head === 'Händelse · Beställning hämtad · inget sms skickat', 'Rubrikraden visar att det är en händelse och att inget sms skickats', l[0] && l[0].head);
  const d1 = await db();
  ok(d1.sms.filter(m => !m.event).length === 0, 'Inget sms skickades till kunden');
  ok(d1.orders.find(o => o.number === 'LH-1001').status === 'hamtad', 'Beställningen är markerad hämtad i databasen');
  const kvar = await p.$$eval('button', bs => ({ hamtad: bs.filter(b => b.innerText.trim() === 'Hämtad').length, klar: bs.filter(b => b.innerText.includes('Klar att hämta')).length }));
  ok(kvar.hamtad === 0 && kvar.klar === 1, 'Beställningen försvinner ur listan att hantera (bara LH-1002 kvar)', JSON.stringify(kvar));

  // 3. Andra beställningen: Klar att hämta (sms) och sedan Hämtad -> nyast överst
  await p.click('button:has-text("Klar att hämta")'); await p.waitForTimeout(600);
  await p.clock.runFor(4 * 60 * 1000);   // 4 minuter senare
  await p.click('button:text-is("Hämtad")'); await p.waitForTimeout(700);
  const l2 = await logg();
  ok(l2.length === 3 && l2[0].kind === 'order-hamtad' && l2[1].kind === 'order-hamtklar' && l2[2].kind === 'order-hamtad', 'Nyast överst: hämtad, klar att hämta (sms), hämtad', l2.map(x => x.kind).join(', '));
  ok(l2[0].text.endsWith('LH-1002 är utlämnad till Anna Andersson (0701234567). Hämtad fre 30 okt kl 06:29.'), 'Rätt kund och rätt klockslag för andra beställningen', l2[0].text.split('\n').pop());
  ok(!l2[1].ev && /^Från LiasSalong · Klar att hämta till 0701234567$/.test(l2[1].head), 'Vanliga sms ser ut som förut');

  // 4. Utseende
  const st = await p.$eval('[data-event="true"]', c => { const s = getComputedStyle(c), h = getComputedStyle(c.querySelector('[data-sms-head]')); return { bg: s.backgroundColor, fg: s.color, hfg: h.color, bl: s.borderLeftWidth + ' ' + s.borderLeftColor, bt: s.borderTopWidth + ' ' + s.borderTopColor, svg: !!c.querySelector('svg') }; });
  ok(st.bg === 'rgb(244, 237, 224)' && st.bt === '2px rgb(145, 116, 74)', 'Samma tonade ruta och bruna ram som sms-rutorna', st.bg + ' / ' + st.bt);
  ok(st.bl === '6px rgb(71, 100, 82)' && st.svg, 'Grön kant till vänster och bock-ikon skiljer händelsen från sms', st.bl);
  ok(contrast(st.fg, st.bg) >= 4.5 && contrast(st.hfg, st.bg) >= 4.5, 'Text och rubrikrad kontrast ≥ 4,5', contrast(st.fg, st.bg).toFixed(2) + ' / ' + contrast(st.hfg, st.bg).toFixed(2));
  ok(await p.evaluate(() => [...document.querySelectorAll('p')].some(x => x.innerText.includes('Här syns också när en beställning har hämtats.'))), 'Förklaringen under rubriken nämner hämtade beställningar');
  await p.locator('[data-event="true"]').first().scrollIntoViewIfNeeded();
  await p.locator('section:has([data-sms])').screenshot({ path: '/tmp/t/hamtad-logg.png' });

  // 5. Finns kvar efter omladdning
  await p.reload(); await p.waitForTimeout(1500);
  if (await p.$('input[type=password]')) { await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500); }
  if (!(await p.$('[data-sms]'))) { await p.click('footer >> text=Admin').catch(() => {}); await p.waitForTimeout(1200); }
  ok((await logg()).filter(x => x.ev).length === 2, 'Händelserna finns kvar efter omladdning');

  // 6. Smal skärm
  await p.setViewportSize({ width: 320, height: 640 }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[data-event] *')].every(e => e.scrollWidth <= e.clientWidth + 1)), '320 px: ingen text klipps, ingen sidledsscroll');

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
