const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const outside = [];
const mainText = p => p.evaluate(() => document.querySelector('main').innerText);
const times = p => p.$$eval('main button', bs => bs.map(b => b.innerText.trim()).filter(t => /^\d\d:\d\d$/.test(t)));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 384, height: 800 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
    outside.push(u); return r.abort();   // allt annat räknas som "lämnar telefonen"
  });
  await ctx.addInitScript(() => {
    window.__notifs = []; window.__chimes = 0;
    const N = function (t, o) { window.__notifs.push(t); }; N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
    const AC = window.AudioContext; if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__chimes++; return o.call(this); }; }
  });
  const open = async () => {
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) p.errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.goto('https://lias.test/'); await p.waitForTimeout(600);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    return p;
  };
  const { SERVICES } = require('/tmp/t/tjanster-data.js');   // Lias tjänster sedan 29 okt
  const book = async (p, id, pickTime, name) => {
    await p.click('nav >> text=Boka'); await p.waitForTimeout(200);
    const cat = SERVICES.find(x => x.id === id).cat;
    await p.click(`[data-person="0"] [data-cat="${cat}"]`);
    await p.click(`[data-service="${id}"]`);
    await p.click('text=Fortsätt'); await (await p.$$('main div[style*="overflow-x"] button'))[1].click(); await p.waitForTimeout(500);
    const t = await times(p); const chosen = pickTime(t);
    await p.click(`main button:text-is("${chosen}")`); await p.click('text=Fortsätt');
    await p.fill('input[type=text]', name); await p.fill('input[type=tel]', '0701234567'); await p.fill('input[type=email]', 'test@exempel.se');
    return chosen;
  };

  console.log('--- Demoskylt ---');
  const lia = await open();
  ok((await lia.evaluate(() => document.body.innerText)).includes('Inga riktiga bokningar, köp eller meddelanden genomförs'), 'Demoskylten syns');
  await lia.screenshot({ path: '/tmp/t/d0.png' });

  console.log('--- Lia öppnar admin i flik 1 ---');
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(500);
  ok((await mainText(lia)).includes('lia@demo.se') && (await mainText(lia)).includes('demo1234'), 'Inloggningsuppgifter för demo visas');
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'fel'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(400);
  ok((await mainText(lia)).includes('Fel e-post eller lösenord'), 'Fel lösenord stoppas');
  await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1200);
  const lt = await mainText(lia);
  ok(lt.includes('Inga kommande bokningar') && lt.includes('Inga kommande kursbokningar') && lt.includes('Inga beställningar') && lt.includes('🟢 Live') && lt.includes('Inga sms än'), 'Inloggad: tom lista, live, tom sms-logg');
  await lia.click('text=Slå på larm'); await lia.waitForTimeout(200);
  const ch0 = await lia.evaluate(() => window.__chimes);

  console.log('--- Kund bokar i flik 2 ---');
  const k1 = await open();
  const t1 = await book(k1, 'klipp-45', t => t[2], 'Anna Andersson');
  await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(800);
  const d1 = await mainText(k1);
  ok(d1.includes('Din tid är bokad!'), 'Kunden får "Din tid är bokad!"', 'tid ' + t1);
  const bubble = await k1.$eval('[data-sms="bekraftelse"]', e => e.innerText).catch(() => '');
  ok(bubble.includes('Hej Anna!') && bubble.includes('kl ' + t1) && /från LiasSalong/i.test(bubble), 'Kunden ser sms:et som skulle ha skickats', bubble.replace(/\n/g, ' '));
  await k1.screenshot({ path: '/tmp/t/d1.png', fullPage: false });

  console.log('--- Larm hos Lia i flik 1 ---');
  await lia.waitForTimeout(800);
  const lt2 = await mainText(lia);
  ok(lt2.includes('Anna Andersson') && lt2.includes('NY'), 'Bokningen dök upp hos Lia direkt, märkt NY');
  ok((await lia.evaluate(() => window.__chimes)) > ch0, 'Pling spelades');
  ok((await lia.evaluate(() => window.__notifs)).some(n => n.includes('Anna Andersson')), 'Skärmnotis visades');
  const smsKinds = await lia.$$eval('[data-sms]', es => es.map(e => e.getAttribute('data-sms')));
  ok(smsKinds.join(',') === 'till-lia,bekraftelse', 'Sms-loggen visar sms till Lia och bekräftelse till kunden', smsKinds.join(', '));
  await lia.screenshot({ path: '/tmp/t/d2.png', fullPage: true });

  console.log('--- Krockspärr och felkontroller ---');
  const k2 = await open(), k3 = await open();
  const tFree = await book(k2, 'bryn', t => t[t.length - 1], 'Bo Berg');
  await book(k3, 'bryn', t => t[t.length - 1], 'Cia Carlsson');
  ok(!(await times(k2)).includes(t1), 'Den bokade tiden ' + t1 + ' saknas för nästa kund');
  await k2.click('button:has-text("Boka ·")'); await k2.waitForTimeout(700);
  await k3.click('button:has-text("Boka ·")'); await k3.waitForTimeout(700);
  ok((await mainText(k2)).includes('Din tid är bokad!'), 'Första kunden får ' + tFree);
  ok((await mainText(k3)).includes('Någon hann boka den tiden') && (await mainText(k3)).includes('STEG 2 AV 3'), 'Andra kunden får besked och skickas till tidsvalet');
  const k4 = await open();
  await book(k4, 'bryn', t => t[0], 'D');
  await k4.click('button:has-text("Boka ·")'); await k4.waitForTimeout(400);
  ok((await mainText(k4)).includes('Skriv ditt namn'), 'För kort namn stoppas');

  console.log('--- Lia avbokar ---');
  await lia.waitForTimeout(500);
  await lia.locator('div[data-booking]', { hasText: 'Anna Andersson' }).locator('button:has-text("Avboka")').click(); await lia.waitForSelector('[data-confirm]'); await lia.click('[data-confirm] [data-svar="ja"]'); /* 30 okt: appens egen fråga-ruta */ await lia.waitForTimeout(600);
  const lt3 = await mainText(lia);
  ok(!lt3.includes('👤 Anna Andersson') && lt3.includes('Bo Berg'), 'Avbokad bokning försvann, övriga kvar');
  ok((await lia.$$eval('[data-sms]', es => es.map(e => e.getAttribute('data-sms'))))[0] === 'avbokning', 'Avboknings-sms till kunden syns i loggen');
  const k5 = await open();
  await k5.click('nav >> text=Boka'); await k5.click('[data-cat="Klippning"]'); await k5.click('[data-service="klipp-45"]'); await k5.click('text=Fortsätt');
  await (await k5.$$('main div[style*="overflow-x"] button'))[1].click(); await k5.waitForTimeout(500);
  ok((await times(k5)).includes(t1), 'Den avbokade tiden ' + t1 + ' är ledig igen');

  console.log('--- Nollställ ---');
  await lia.click('text=Nollställ'); await lia.waitForSelector('[data-confirm]'); await lia.click('[data-confirm] [data-svar="ja"]'); /* 30 okt: appens egen fråga-ruta */ await lia.waitForTimeout(800);
  ok((await lia.evaluate(() => localStorage.getItem('lias_demo_db'))) === null, 'Nollställ raderar all demodata');

  console.log('--- Inget lämnar webbläsaren ---');
  ok(outside.filter(u => !u.includes('supabase-js') && !u.includes('fonts.googleapis.com') && !u.includes('fonts.gstatic.com')).length === 0, 'Inga anrop till någon server (utöver försök att hämta Supabase-biblioteket)', outside.length ? [...new Set(outside.map(u => new URL(u).host))].join(', ') : 'inga alls');
  const errs = [lia, k1, k2, k3, k4, k5].flatMap(p => p.errs);
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
