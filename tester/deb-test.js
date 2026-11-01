// 1 nov 2026, del A: sen ankomst (>5 min), varning/debitering skickas av Lia med knapp och vald orsak, 7 dagars betaltid.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page0 = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const NOW = new Date('2026-11-03T10:20:00+01:00').getTime();
const VARN = 'Hej Bo! På grund av din sena ankomst idag så kommer du inte behöva betala för dagens missade tid. Men uppstår detta igen att du inte kommer, avbokar eller ombokar för sent så kommer du att få betala hela kostnaden för din tid.';
(async () => {
  const browser = await chromium.launch();
  const errs = []; let native = 0;
  const run = async (payInfo) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
    const page = payInfo ? page0.replace("window.LH_PAYMENT_INFO = '';", `window.LH_PAYMENT_INFO = '${payInfo}';`) : page0;
    await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    p.on('dialog', d => { native++; d.dismiss(); });
    await p.clock.install({ time: NOW });
    await p.goto('https://lias.test/');
    await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    const bk = (id, name, phone, price, hhmm, arrived) => ({ id, created_at: '2026-10-20T10:00:00Z', service_ids: ['klipp-30'], service_names: 'Klippning', price, starts_at: `2026-11-03T${hhmm}:00+01:00`, ends_at: new Date(new Date(`2026-11-03T${hhmm}:00+01:00`).getTime() + 30 * 60000).toISOString(), customer_name: name, customer_phone: phone, customer_email: 'k@t.se', status: 'bokad', person_name: null, group_id: id, arrived_at: arrived || null });
    const prior = (id, name, phone) => ({ id, created_at: new Date(NOW - 20 * 86400000).toISOString(), booking_id: 'gammal-' + id, group_id: null, customer_name: name, customer_phone: phone, kind: 'uteblev', nummer: 1, belopp: 0, status: 'ingen_avgift', andrad_at: null, skickat_at: new Date(NOW - 20 * 86400000).toISOString() });
    await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), {
      bookings: [bk('bo', 'Bo Berg', '0702222222', 500, '10:00', '2026-11-03T09:12:00Z'), bk('cia', 'Cia Cedar', '0703333333', 700, '09:50', '2026-11-03T09:03:00Z'), bk('dan', 'Dan Dahl', '0704444444', 500, '10:17', '2026-11-03T09:18:00Z'), bk('eva', 'Eva Ek', '0705555555', 500, '09:00', '2026-11-03T08:10:00Z')],
      sms: [], courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000, uteblivna: [prior('c1', 'Cia Cedar', '0703333333')] });
    await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
    await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
    return { p, ctx };
  };
  // ---- Utan betalningsuppgifter ----
  let { p, ctx } = await run('');
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  ok(!(await p.$('[data-booking="dan"] [data-sen]')), 'Kom 1 min efter start: ingen "för sent"-knapp (gräns 5 min)');
  ok(!!(await p.$('[data-booking="bo"] [data-sen]')), 'Kom mer än 5 min efter start: knappen "Kunden kom för sent" finns');
  await p.click('[data-booking="bo"] [data-sen]'); await p.waitForTimeout(400);
  ok((await p.$eval('[data-confirm] h2', e => e.innerText)) === 'Kom kunden för sent?', 'Kontrollfråga för sen ankomst');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  ok((await p.$eval('[data-booking="bo"] [data-sen-ankomst]', e => e.innerText.trim()).catch(() => '')) === 'Sen ankomst – 1:a gången, ingen avgift', 'Kortet visar "Sen ankomst – 1:a gången, ingen avgift"');
  ok((await db()).sms.length === 0, 'Inget sms skickas förrän Lia trycker');
  ok((await p.$eval('[data-att-skicka]', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '')).startsWith('📨 1 att hantera'), 'Ruta överst: "1 att hantera"');
  const opts = await p.$$eval('[data-avgift] [data-orsak-val] option', os => os.map(o => o.innerText));
  ok(opts.join('|') === 'Din sena ankomst|Din uteblivna bokning|Din sena avbokning|Din sena ombokning' && (await p.$eval('[data-avgift] [data-orsak-val]', s => s.value)) === 'sena ankomst', 'Lia väljer orsak (4 val), förvalt efter vad som hände', opts.join(' / '));
  await p.click('[data-avgift] [data-skicka]'); await p.waitForTimeout(300);
  ok((await p.$eval('[data-confirm] h2', e => e.innerText)) === 'Skicka varning?', 'Kontrollfråga innan sms'); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  let s = await db();
  ok(s.sms[0].kind === 'varning' && s.sms[0].text === VARN, 'Varnings-sms med Tommys text', s.sms[0] && s.sms[0].text);
  ok(!(await p.$('[data-avgift]')) && !(await p.$('[data-att-skicka]')), 'Hanterad: borta ur listan och rutan överst');
  // Cia 2:a gången – sen ankomst (kom 13 min sent), debitering utan betalningsuppgifter
  await p.click('[data-booking="cia"] [data-sen]'); await p.waitForTimeout(300); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  ok((await p.$eval('[data-avgift] [data-belopp]', e => e.innerText.replace(/\s/g, ' '))) === '700,00 kr', '2:a gången: hela priset 700 kr');
  ok((await p.$eval('[data-avgift] [data-skicka]', b => b.disabled)) && (await p.$eval('[data-saknar-betal]', e => e.innerText)) === 'Betalningsuppgifter saknas än – debiteringen kan skickas när de är inlagda.', 'Utan betalningsuppgifter: knappen avstängd med förklaring');
  // Eva 1:a gången – Skicka ingen varning
  await p.click('[data-booking="eva"] [data-sen]'); await p.waitForTimeout(300); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  await p.locator('[data-avgift]', { hasText: 'Eva Ek' }).locator('[data-utan-sms]').click(); await p.waitForTimeout(300); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  s = await db();
  const ue = s.uteblivna.find(u => u.booking_id === 'eva');
  ok(ue && ue.status === 'ingen_avgift' && ue.skickat_at && !s.sms.some(m => m.bookingId === 'eva'), '"Skicka ingen varning": hanterad utan sms, räknas ändå');
  await ctx.close();
  // ---- Med betalningsuppgifter ----
  ({ p, ctx } = await run('Swish 123 456 78 90'));
  const db2 = () => p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  await p.click('[data-booking="cia"] [data-sen]'); await p.waitForTimeout(300); await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  await p.click('[data-avgift] [data-skicka]'); await p.waitForTimeout(300);
  ok((await p.$eval('[data-confirm] [data-rader]', e => e.innerText.replace(/\s/g, ' '))).includes('700,00 kr · betala inom 7 dagar'), 'Frågan visar belopp och 7 dagar');
  await p.click('[data-confirm] [data-svar="ja"]'); await p.waitForTimeout(900);
  s = await db2();
  const uc = s.uteblivna.find(u => u.booking_id === 'cia');
  ok(uc.forfaller === '2026-11-10', 'Sista betalningsdag 7 dagar fram: 10 november', uc.forfaller);
  const ref = 'LH-' + uc.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  ok(s.sms[0].kind === 'debitering' && s.sms[0].text === `Hej Cia! På grund av din sena ankomst tis 3 nov debiteras 700 kr enligt avbokningsreglerna. Betala senast 10 november till Swish 123 456 78 90. Märk betalningen med ${ref}. Frågor: 073-642 30 18.`, 'Debiterings-sms: belopp, betalningsuppgifter, sista dag och referens', s.sms[0].text);
  const sk = await p.$eval('[data-avgift] [data-skickat]', e => e.innerText.replace(/\s+/g, ' ')); ok(sk.startsWith('Debitering skickad tis 3 nov 2026 kl 10:20. Betala senast tis 10 nov') && !(await p.$('[data-avgift] [data-skicka]')) && !!(await p.$('[data-avgift] [data-betald]')), 'Efter skickat: datum syns, ingen ny skicka-knapp, "Markera som betald" finns');
  // förfallen
  await p.clock.fastForward(8 * 86400000); await p.clock.runFor(31000); await p.waitForTimeout(1500);
  ok((await p.$eval('[data-avgift] [data-skickat]', e => e.innerText)).includes('Förfallen'), 'Efter 8 dagar utan betalning: "Förfallen"');
  ok(native === 0, 'Ingen vit webbläsarruta', native);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
