const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { newCtx, admin } = require('/tmp/t/e2e.js');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { cond ? pass++ : fail++; console.log((cond ? 'OK   ' : 'FEL  ') + label + (extra !== undefined ? '  ->  ' + extra : '')); };
const mainText = p => p.evaluate(() => document.querySelector('main').innerText);
const times = p => p.$$eval('main button', bs => bs.map(b => b.innerText.trim()).filter(t => /^\d\d:\d\d$/.test(t)));

(async () => {
  admin("delete from bookings; delete from admins; delete from auth.users; insert into auth.users(email) values ('lia@test.se'),('annan@test.se'); insert into admins select id from auth.users where email='lia@test.se';");
  const browser = await chromium.launch();

  // ===== LIA loggar in =====
  console.log('--- Lia loggar in på admin ---');
  const lia = await newCtx(browser);
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(300);
  await lia.fill('input[type=email]', 'lia@test.se'); await lia.fill('input[type=password]', 'fel');
  await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(300);
  ok((await mainText(lia)).includes('Fel e-post eller lösenord'), 'Fel lösenord stoppas');
  await lia.fill('input[type=password]', 'hemligt123'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1500);
  ok((await mainText(lia)).includes('Inga kommande bokningar'), 'Rätt lösenord -> tom bokningslista');
  ok((await mainText(lia)).includes('🟢 Live'), 'Live-anslutning aktiv');
  await lia.click('text=Slå på larm'); await lia.waitForTimeout(300);
  ok((await mainText(lia)).includes('Larmet är på'), 'Larm påslaget', await lia.evaluate(() => window.__chimes) + ' tonsignaler i testpip');
  const chimesBefore = await lia.evaluate(() => window.__chimes);

  // ===== KUND 1 bokar =====
  console.log('--- Kund 1 bokar (svensk telefon) ---');
  const k1 = await newCtx(browser);
  await k1.click('nav >> text=Boka'); await k1.waitForTimeout(200);
  ok((await mainText(k1)).includes('STEG 1 AV 3'), 'Steg 1 visas');
  const bar = () => k1.evaluate(() => { const b = [...document.querySelectorAll('main button')].pop(); const r = b.getBoundingClientRect(); const n = document.querySelector('nav').getBoundingClientRect(); return { text: b.innerText, disabled: b.disabled, visible: r.bottom <= n.top + 1 && r.top > 0 }; });
  let a = await bar(); ok(a.disabled && a.visible, 'Knappen längst ner syns ovanför menyn och är avstängd utan tjänst', a.text);
  await k1.click('[data-cat="Herr"]'); await k1.click('text=Herr kort hår'); await k1.click('text=Skäggtrim');
  a = await bar(); ok(!a.disabled && a.text.includes('35 min') && a.text.includes('544'), 'Två tjänster: summa längd och pris', a.text);
  await k1.screenshot({ path: '/tmp/t/s1.png' });
  await k1.click('text=Fortsätt'); await k1.waitForTimeout(200);
  ok((await mainText(k1)).includes('STEG 2 AV 3'), 'Steg 2 visas');
  a = await bar(); ok(a.disabled, 'Kan inte gå vidare utan tid', a.text);
  const dayBtns = await k1.$$('main div[style*="overflow-x"] button');
  ok(dayBtns.length === 14, 'Visar 14 öppna dagar', dayBtns.length + ' dagar, första: ' + (await dayBtns[0].innerText()).replace(/\n/g, ' '));
  await dayBtns[1].click(); await k1.waitForTimeout(500);
  const t1 = await times(k1);
  ok(t1.length > 0, 'Lediga tider visas', t1.length + ' tider: ' + t1.slice(0, 3).join(' ') + ' … ' + t1.slice(-2).join(' '));
  await k1.screenshot({ path: '/tmp/t/s2.png' });
  const chosenTime = t1[2];
  await k1.click(`main button:text-is("${chosenTime}")`);
  a = await bar(); ok(!a.disabled && a.text.includes(chosenTime), 'Tid vald', a.text);
  await k1.click('text=Fortsätt'); await k1.waitForTimeout(200);
  ok((await mainText(k1)).includes('STEG 3 AV 3'), 'Steg 3 visas med sammanfattning', (await mainText(k1)).split('\n').filter(l => /🕐|💰/.test(l)).join(' | '));
  await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(200);
  const errs3 = await k1.$$eval('[data-err]', es => es.map(e => e.innerText));
  ok(errs3.length === 3, 'Tomma fält ger tydliga felmeddelanden', errs3.length + ' st');
  await k1.fill('input[type=text]', 'Anna Andersson'); await k1.fill('input[type=tel]', '070 123 45'); await k1.fill('input[type=email]', 'anna@test.se');
  await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(300);
  ok((await mainText(k1)).includes('Mobilnumret ska vara 10 siffror'), 'För kort telefonnummer stoppas');
  await k1.fill('input[type=tel]', '070-123 45 67');
  await k1.screenshot({ path: '/tmp/t/s3.png' });
  await k1.click('button:has-text("Boka ·")'); await k1.waitForTimeout(800);
  const done = await mainText(k1);
  ok(done.includes('Din tid är bokad!'), 'Kunden får bekräftelse', done.split('\n').filter(l => /🕐|✂️|💰/.test(l)).join(' | '));
  await k1.screenshot({ path: '/tmp/t/s4.png' });

  // ===== Larmet hos Lia =====
  console.log('--- Larm hos Lia ---');
  await lia.waitForTimeout(1600);
  const liaTxt = await mainText(lia);
  ok(liaTxt.includes('Anna Andersson') && liaTxt.includes('NY'), 'Bokningen dök upp hos Lia utan omladdning, märkt NY');
  const notifs = await lia.evaluate(() => window.__notifs);
  ok(notifs.length === 1 && notifs[0].title.includes('Anna Andersson'), 'Skärmnotis visades', notifs.map(n => n.title + ' / ' + n.body.replace(/\n/g, ' ')).join(''));
  ok((await lia.evaluate(() => window.__chimes)) > chimesBefore, 'Pling spelades');
  ok((await lia.title()).includes('Ny bokning'), 'Fliktiteln visar ny bokning', await lia.title());
  await lia.screenshot({ path: '/tmp/t/s5.png', fullPage: true });
  const row = admin("select price || ' kr, ' || customer_phone || ', ' || service_names || ', ' || to_char(starts_at at time zone 'Europe/Stockholm', 'HH24:MI') from bookings");
  ok(row.startsWith('544 kr, 0701234567') && row.endsWith(chosenTime), 'Databasen har rätt pris, telefon och tid', row);

  // ===== KUND 2 med New York-tid ser inte den bokade tiden =====
  console.log('--- Kund 2 (telefon på New York-tid) ---');
  const k2 = await newCtx(browser, 'America/New_York');
  await k2.click('nav >> text=Boka'); await k2.click('[data-cat="Herr"]'); await k2.click('text=Herr kort hår'); await k2.click('text=Fortsätt');
  await (await k2.$$('main div[style*="overflow-x"] button'))[1].click(); await k2.waitForTimeout(500);
  const t2 = await times(k2);
  ok(t2[0] === t1[0], 'Samma svenska tider trots annan tidszon', 'första tid ' + t2[0]);
  ok(!t2.includes(chosenTime), 'Den bokade tiden ' + chosenTime + ' är borta för andra');

  // ===== Krock: två kunder har samma tid uppe =====
  console.log('--- Två kunder tar samma tid samtidigt ---');
  const k3 = await newCtx(browser), k4 = await newCtx(browser);
  const freeT = t2[t2.length - 1];
  for (const k of [k3, k4]) {
    await k.click('nav >> text=Boka'); await k.click('[data-cat="Dam"]'); await k.click('text=Dam kort hår'); await k.click('text=Fortsätt');
    await (await k.$$('main div[style*="overflow-x"] button'))[1].click(); await k.waitForTimeout(500);
    await k.click(`main button:text-is("${freeT}")`); await k.click('text=Fortsätt');
    await k.fill('input[type=text]', 'Kund ' + (k === k3 ? 'Tre' : 'Fyra')); await k.fill('input[type=tel]', '0709999999'); await k.fill('input[type=email]', 'k@test.se');
  }
  await k3.click('button:has-text("Boka ·")'); await k3.waitForTimeout(600);
  await k4.click('button:has-text("Boka ·")'); await k4.waitForTimeout(800);
  ok((await mainText(k3)).includes('Din tid är bokad!'), 'Första kunden får tiden ' + freeT);
  const k4t = await mainText(k4);
  ok(k4t.includes('Någon hann boka den tiden') && k4t.includes('STEG 2 AV 3') && !(await times(k4)).includes(freeT), 'Andra kunden får tydligt besked, skickas till tidsvalet, tiden borttagen');
  await k4.screenshot({ path: '/tmp/t/s6.png' });

  // ===== Lia avbokar =====
  console.log('--- Lia avbokar ---');
  await lia.waitForTimeout(1500);
  const before = (await mainText(lia)).match(/👤/g).length;
  await lia.locator('div[data-booking]', { hasText: 'Anna Andersson' }).locator('button:has-text("Avboka")').click(); await lia.waitForTimeout(500);
  const after = (await mainText(lia)).match(/👤/g).length;
  ok(before === 2 && after === 1, 'Avbokning tar bort kortet', before + ' -> ' + after);
  ok(admin("select status from bookings where customer_name='Anna Andersson'") === 'avbokad', 'Databasen: status avbokad');
  await k2.click('main div[style*="overflow-x"] button >> nth=2'); await k2.waitForTimeout(400);
  await k2.click('main div[style*="overflow-x"] button >> nth=1'); await k2.waitForTimeout(500);
  ok((await times(k2)).includes(chosenTime), 'Den avbokade tiden ' + chosenTime + ' är ledig igen');

  // ===== Annan inloggad användare =====
  console.log('--- Konto utan admin ---');
  const x = await newCtx(browser);
  await x.click('footer >> text=Admin'); await x.waitForTimeout(200);
  await x.fill('input[type=email]', 'annan@test.se'); await x.fill('input[type=password]', 'annan123');
  await x.click('button:has-text("Logga in")'); await x.waitForTimeout(500);
  ok((await mainText(x)).includes('inte admin-behörighet'), 'Inloggad men inte admin nekas');

  await lia.click('text=Logga ut'); await lia.waitForTimeout(300);
  ok((await mainText(lia)).includes('Välkommen'), 'Logga ut -> startsidan');

  const allErrs = [lia, k1, k2, k3, k4, x].flatMap(p => p.errs);
  ok(allErrs.length === 0, 'Inga JavaScript-fel i någon webbläsare', allErrs.join(' || ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
