// 30 okt 2026: Lia kan byta och ta bort alla bilder på hemsidan själv. Tar hon bort en bild utan att lägga in en ny
// får hon frågan "Är du säker på att du vill spara innan du har lagt in en ny bild?" innan något sparas.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
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
  p.on('dialog', d => d.accept());
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  const tab = async t => { await p.click(`nav >> text=${t}`); await p.waitForTimeout(450); };
  const toAdmin = async () => {
    await p.click('footer >> text=Admin'); await p.waitForTimeout(500);
    if (await p.$('input[type=password]')) { await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1200); }
    await p.click('button:text-is("Bilder")'); await p.waitForTimeout(400);
  };
  const sida = async id => { await p.click(`[data-sida="${id}"]`); await p.waitForTimeout(200); };
  const byt = async id => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`[data-byt="${id}"]`)]); await fc.setFiles('/tmp/t/storbild.jpg'); await p.waitForSelector(`[data-slot="${id}"][data-pending="true"]`, { timeout: 10000 }); };
  const state = id => p.$eval(`[data-slot="${id}"] [data-state]`, e => e.innerText.trim());
  const idb = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('lias_bilder', 1); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('platser')) { db.close(); res({}); return; } const out = {}, tx = db.transaction('platser'), c = tx.objectStore('platser').openCursor(); c.onsuccess = () => { const k = c.result; if (k) { out[k.key] = k.value.removed ? 'tom' : (k.value.src || '').slice(0, 15); k.continue(); } }; tx.oncomplete = () => { db.close(); res(out); }; }; r.onerror = () => res('fel'); }));
  const homeEntry = () => p.$$eval('.lh-entry__img img', is => is.map(i => i.src.slice(0, 15)));

  // --- 1. Översikt ---
  await toAdmin();
  const sec = await p.$('[data-section="hemsidebilder"]');
  ok(!!sec && (await p.$eval('[data-section="hemsidebilder"] h2', h => h.innerText)) === 'Bilder på hemsidan', 'Bilder-fliken har kortet "Bilder på hemsidan" överst');
  const chips = await p.$$eval('[data-sida]', cs => cs.map(c => c.innerText.trim()));
  ok(chips.join(',') === 'Start,Boka,Kurser,Shop,Kontakt,Galleri', 'Sex sidor att välja mellan', chips.join(', '));
  const antal = {};
  for (const s of ['start', 'boka', 'kurser', 'shop', 'kontakt', 'galleri']) { await sida(s); antal[s] = (await p.$$('[data-slot]')).length; }
  ok(JSON.stringify(antal) === '{"start":4,"boka":1,"kurser":1,"shop":6,"kontakt":1,"galleri":10}', 'Alla 23 bilder på hemsidan finns med (logga och startbild undantagna)', JSON.stringify(antal));
  await sida('start');
  ok((await state('start-boka')) === 'Originalbild' && (await p.$eval('[data-spara]', b => b.disabled)) && (await p.$eval('[data-osparade]', e => e.innerText)) === 'Inga osparade ändringar.', 'Från början: originalbilder, Spara avstängd, inga osparade ändringar');

  // --- 2. Byta bild (ingen fråga behövs) ---
  await byt('start-boka');
  ok((await state('start-boka')) === 'Ny bild vald – sparas när du trycker Spara', 'Byt bild: förhandsvisning och tydlig text att den inte är sparad', await state('start-boka'));
  ok((await p.$eval('[data-slot="start-boka"] img', i => i.src.slice(0, 15))) === 'data:image/jpeg', 'Den nya bilden visas direkt i rutan');
  ok((await p.$eval('[data-sida="start"]', c => c.innerText)) === 'Start (1)' && (await p.$eval('[data-osparade]', e => e.innerText)) === '1 ändring är inte sparad än.', 'Räknare på sidknappen och under listan');
  ok(JSON.stringify(await idb()) === '{}', 'Inget sparat innan Spara');
  await p.click('[data-spara]'); await p.waitForTimeout(500);
  ok(!(await p.$('[data-dialog="spara-utan-bild"]')), 'Bara byte: ingen fråga, sparas direkt');
  ok((await p.$eval('[data-section="hemsidebilder"] .lh-ok', e => e.innerText)) === 'Ändringen är sparad och syns nu på hemsidan.', 'Bekräftelse efter sparning');
  ok((await state('start-boka')) === 'Din bild' && (await idb())['start-boka'] === 'data:image/jpeg', 'Sparad i webbläsarens databas, märkt "Din bild"');
  await tab('Start');
  ok((await homeEntry())[0] === 'data:image/jpeg', 'Startsidan visar Lias nya bild i rutan Boka frisör');

  // --- 3. Ta bort -> frågan ---
  await toAdmin(); await sida('kontakt');
  await p.click('[data-tabort="kontakt-banner"]'); await p.waitForTimeout(150);
  ok((await state('kontakt-banner')) === 'Tas bort när du sparar', 'Ta bort: markeras, inget sparat än');
  await p.click('[data-spara]'); await p.waitForTimeout(300);
  const dlg = await p.$eval('[data-dialog="spara-utan-bild"]', d => ({ role: d.getAttribute('role'), h: d.querySelector('h2').innerText, list: [...d.querySelectorAll('[data-borttagna] li')].map(l => l.innerText), q: d.querySelector('#spara-fraga').innerText, btn: [...d.querySelectorAll('button')].map(b => b.innerText.trim()), focus: document.activeElement.innerText.trim() })).catch(() => null);
  ok(!!dlg, 'Spara efter borttagning: en fråga kommer upp först');
  ok(dlg && dlg.q === 'Är du säker på att du vill spara innan du har lagt in en ny bild?', 'Frågan: "Är du säker på att du vill spara innan du har lagt in en ny bild?"', dlg && dlg.q);
  ok(dlg && dlg.h === 'Spara utan ny bild?' && dlg.list.join('|') === 'Kontakt: Bilden överst på Kontakt (platsen blir tom)', 'Rubrik och lista över vilken bild som tas bort', dlg && dlg.list.join(' | '));
  ok(dlg && dlg.btn.join('|') === 'Nej, gå tillbaka och lägg in en bild|Ja, spara ändå' && dlg.focus === 'Nej, gå tillbaka och lägg in en bild' && dlg.role === 'alertdialog', 'Två tydliga svar, "Nej" är förvalt (säkrast)', dlg && dlg.btn.join(' / '));
  await p.click('[data-svar="nej"]'); await p.waitForTimeout(250);
  ok(!(await p.$('[data-dialog="spara-utan-bild"]')) && (await state('kontakt-banner')) === 'Tas bort när du sparar' && !(await idb())['kontakt-banner'], 'Nej: rutan stängs, ingenting sparas, ändringen ligger kvar så hon kan välja bild');
  await p.click('[data-spara]'); await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok(!(await p.$('[data-dialog="spara-utan-bild"]')) && !(await idb())['kontakt-banner'], 'Escape stänger frågan utan att spara');
  await p.click('[data-spara]'); await p.waitForTimeout(250);
  await p.click('[data-svar="ja"]'); await p.waitForTimeout(500);
  ok((await idb())['kontakt-banner'] === 'tom' && (await state('kontakt-banner')) === 'Tom – ingen bild visas', 'Ja, spara ändå: sparas som tom plats');
  await tab('Kontakt');
  ok(!(await p.$('[data-banner="kontakt"]')) && (await p.$eval('.lh-page__intro', e => e.innerText)) === 'Vi svarar gärna på dina frågor!', 'Kontaktsidan: bilden borta, sidan börjar direkt med texten (ingen tom ruta)');

  // --- 4. Blandat: en tas bort, en byts -> bara den borttagna listas ---
  await toAdmin(); await sida('galleri');
  await p.click('[data-tabort="galleri-herrklipp"]'); await byt('galleri-vas');
  await p.click('[data-spara]'); await p.waitForTimeout(300);
  const l2 = await p.$$eval('[data-borttagna] li', ls => ls.map(l => l.innerText));
  ok(l2.join('|') === 'Galleri: Herrklippning (försvinner ur galleriet)', 'Frågan listar bara bilden som tas bort utan ersättning', l2.join(' | '));
  await p.click('[data-svar="ja"]'); await p.waitForTimeout(500);
  ok((await p.$eval('[data-section="hemsidebilder"] .lh-ok', e => e.innerText)) === 'Ändringarna är sparade och syns nu på hemsidan.', 'Två ändringar sparade');
  await tab('Galleri');
  const g = await p.evaluate(() => ({ herr: !!document.querySelector('[data-gallery="herrklipp"]'), vasEgen: (() => { const h = document.querySelector('h2[data-section="egna"]'); const gr = h && h.nextElementSibling; return !!(gr && gr.querySelector('[data-gallery="vas"]')); })(), vasSrc: (document.querySelector('[data-gallery="vas"] img') || {}).src || '', vasCat: (document.querySelector('[data-gallery="vas"] .lh-gtile__cat') || {}).innerText }));
  ok(!g.herr, 'Galleriet: Herrklippning är borttagen');
  ok(g.vasSrc.startsWith('data:image/jpeg') && g.vasCat === 'Keramik' && g.vasEgen, 'Utbytt bild visas under "Från Lias salong" och kallas inte längre Inspirationsbild', g.vasCat);

  // --- 5. Ångra, Ångra alla, Återställ ---
  await toAdmin(); await sida('shop');
  await p.click('[data-tabort="produkt-s-cup"]'); await p.click('[data-angra="produkt-s-cup"]');
  ok((await state('produkt-s-cup')) === 'Originalbild' && (await p.$eval('[data-osparade]', e => e.innerText)) === 'Inga osparade ändringar.', 'Ångra på en bild');
  await p.click('[data-tabort="produkt-s-cup"]'); await byt('produkt-s-bowl');
  await p.click('[data-angra-alla]'); await p.waitForTimeout(150);
  ok((await state('produkt-s-cup')) === 'Originalbild' && (await state('produkt-s-bowl')) === 'Originalbild', 'Ångra alla ändringar');
  await sida('kontakt');
  await p.click('[data-original="kontakt-banner"]'); await p.click('[data-spara]'); await p.waitForTimeout(500);
  ok(!(await p.$('[data-dialog="spara-utan-bild"]')) && !(await idb())['kontakt-banner'] && (await state('kontakt-banner')) === 'Originalbild', 'Återställ originalbilden (ingen fråga, bilden kommer tillbaka)');
  await tab('Kontakt');
  ok(!!(await p.$('[data-banner="kontakt"] img')), 'Kontaktsidan har sin bild igen');

  // --- 6. Produkt utan bild ---
  await toAdmin(); await sida('shop');
  await p.click('[data-tabort="produkt-s-cup"]'); await p.click('[data-spara]'); await p.waitForTimeout(250); await p.click('[data-svar="ja"]'); await p.waitForTimeout(500);
  await tab('Shop');
  ok(await p.$eval('[data-product="s-cup"]', e => !e.querySelector('img') && e.innerText.includes('Bild kommer')), 'Shoppen: produkt utan bild visar "Bild kommer" (layouten håller)');

  // --- 7. Fel fil ---
  await toAdmin(); await sida('start');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-byt="start-hero"]')]); await fc.setFiles('/tmp/t/ingenbild.txt'); await p.waitForTimeout(400);
  ok((await p.$eval('[data-section="hemsidebilder"]', e => e.innerText)).includes('Bilden kunde inte läsas') && (await state('start-hero')) === 'Originalbild', 'Fil som inte är en bild stoppas');

  // --- 8. Kvar efter omladdning ---
  await p.reload(); await p.waitForTimeout(4500);
  await tab('Start');
  ok((await homeEntry())[0] === 'data:image/jpeg', 'Ändringarna finns kvar efter att sidan laddats om');

  // --- 9. Smal skärm ---
  await p.setViewportSize({ width: 320, height: 640 });
  await toAdmin(); await sida('galleri');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[data-section="hemsidebilder"] .lh-slot__name, [data-section="hemsidebilder"] .lh-btn')].every(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= innerWidth + 0.5));
  ok(ov, '320 px: inget sticker ut, ingen text klipps', await p.evaluate(() => document.documentElement.scrollWidth + ' ' + [...document.querySelectorAll('[data-section="hemsidebilder"] .lh-slot__name, [data-section="hemsidebilder"] .lh-btn')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.innerText + ':' + Math.round(e.getBoundingClientRect().left) + '-' + Math.round(e.getBoundingClientRect().right) + ' slot ' + e.closest('[data-slot]').dataset.slot).join(', ')));
  await p.evaluate(() => { document.documentElement.style.zoom = 1.3; }); await p.waitForTimeout(200);
  const ovz = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-section="hemsidebilder"] .lh-slot__name, [data-section="hemsidebilder"] .lh-btn')].every(e => e.scrollWidth <= e.clientWidth + 1 && (e.closest('.lh-slot') || e.closest('[data-section="hemsidebilder"]')).getBoundingClientRect().right >= e.getBoundingClientRect().right - 0.5));
  ok(ovz, '320 px + 130 % text: inget sticker ut, ingen text klipps', await p.evaluate(() => 'grid ' + document.querySelector('.lh-slots').clientWidth + ' / ' + [...document.querySelectorAll('[data-section="hemsidebilder"] .lh-btn')].filter(e => e.scrollWidth > e.clientWidth + 1 || (e.closest('.lh-slot') || e.closest('[data-section="hemsidebilder"]')).getBoundingClientRect().right < e.getBoundingClientRect().right - 0.5).map(e => e.innerText + ' ' + e.scrollWidth + '/' + e.clientWidth).join(', ')));
  await p.evaluate(() => { document.documentElement.style.zoom = ''; }); await p.waitForTimeout(200);
  await p.click('[data-tabort="galleri-styling"]'); await p.click('[data-spara]'); await p.waitForTimeout(300);
  const dfit = await p.$eval('[data-dialog="spara-utan-bild"]', d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && [...d.querySelectorAll('button')].every(b => b.getBoundingClientRect().height >= 44); });
  ok(dfit, '320 px: frågan ryms och knapparna är minst 44 px höga');
  await p.screenshot({ path: '/tmp/t/bilder-fraga.png' });
  await p.click('[data-svar="nej"]'); await p.click('[data-angra-alla]');
  await p.setViewportSize({ width: 390, height: 844 }); await sida('start'); await p.waitForTimeout(200);
  await p.locator('[data-section="hemsidebilder"]').screenshot({ path: '/tmp/t/bilder-admin.png' });

  // --- 10. Nollställ demo tar bort Lias bilder ---
  await p.click('.lh-demo button'); await p.waitForTimeout(4500);
  ok(JSON.stringify(await idb()) === '{}', 'Demo-Nollställ rensar även de sparade bilderna');
  await tab('Start');
  ok(!(await homeEntry())[0].startsWith('data:'), 'Efter Nollställ: originalbilderna igen');

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
