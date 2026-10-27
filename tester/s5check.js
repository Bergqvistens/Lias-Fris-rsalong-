// Steg 5: slutprov – felstatus, laddning, tillgänglighet, Supabase-läge, prestanda
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
// Variant där demons dataanrop kan fås att misslyckas med window.__fail = { get_busy: true, ... }
const appFail = app.replace(/if \(fn === "get_busy"\) \{/, 'if (window.__fail && window.__fail[fn]) return wait(fail("NATVERK")); if (fn === "get_busy") {');
const TABS = ['Start', 'Boka', 'Kurser', 'Shop', 'Kontakt', 'Galleri'];

(async () => {
  ok(appFail !== app, 'Testvarianten med fel kunde skapas');
  const browser = await chromium.launch();
  const errs = [];
  const open = async (w = 390, failing = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: failing ? appFail : app });
      return r.abort();
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource|NATVERK/.test(x.text())) errs.push(x.text()); });
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    p.ctx = ctx; return p;
  };
  const go = async (p, tab) => { await p.click(`nav >> text=${tab}`); await p.waitForTimeout(700); };
  const mainText = p => p.evaluate(() => document.querySelector('main').innerText);

  // ============ FELSTATUS OCH LADDNING ============
  console.log('--- Fel- och laddningsstatus ---');
  const f = await open(390, true);
  await f.evaluate(() => { window.__fail = { get_busy: true }; });
  await go(f, 'Boka'); await f.click('[data-cat="Herr"]'); await f.click('[data-service="h-kort"]'); await f.click('text=Fortsätt'); await f.waitForTimeout(300);
  await f.click('.lh-day >> nth=1');
  const loadingSeen = await f.evaluate(() => !!document.querySelector('main [role="status"]') && document.querySelector('main').innerText.includes('Hämtar lediga tider'));
  ok(loadingSeen, 'Boka: laddningsstatus "Hämtar lediga tider…" (role=status) visas');
  await f.waitForTimeout(600);
  ok((await mainText(f)).includes('Lediga tider kunde inte hämtas') && !!(await f.$('main [role="alert"]')), 'Boka: begripligt fel (role=alert) när tiderna inte kan hämtas');
  await f.evaluate(() => { window.__fail = {}; });
  await f.click('button:has-text("Försök igen")'); await f.waitForTimeout(700);
  ok((await f.$$('.lh-time')).length > 0, 'Boka: "Försök igen" hämtar tiderna');
  await f.evaluate(() => { window.__fail = { get_course_seats: true }; });
  await go(f, 'Kurser'); await f.waitForTimeout(400);
  const kt = await mainText(f);
  ok(!kt.includes('Hämtar lediga platser') && kt.includes('kunde inte hämtas'), 'Kurser: fel visas i stället för evig laddning när platserna inte kan hämtas', kt.split('\n').filter(l => /Hämtar|kunde inte/.test(l)).slice(0, 2).join(' | '));
  await f.screenshot({ path: '/tmp/t/s5-kurser-fel.png' });
  await f.evaluate(() => { window.__fail = {}; });
  const retryK = await f.$('main button:has-text("Försök igen")');
  if (retryK) { await retryK.click(); await f.waitForTimeout(700); }
  ok(!!retryK && (await f.$$('[data-course][data-status="ok"], [data-course][data-status="low"]')).length === 4, 'Kurser: "Försök igen" laddar platserna');
  await f.evaluate(() => { window.__fail = { get_stock: true }; });
  await go(f, 'Shop'); await f.waitForTimeout(400);
  const st = await mainText(f);
  ok(st.includes('kunde inte hämtas'), 'Shop: fel visas när lagret inte kan hämtas', st.split('\n').filter(l => /kunde inte/.test(l)).join(' | ') || 'inget felmeddelande');
  await f.screenshot({ path: '/tmp/t/s5-shop-fel.png' });
  await f.evaluate(() => { window.__fail = {}; });
  const retryS = await f.$('main button:has-text("Försök igen")');
  if (retryS) { await retryS.click(); await f.waitForTimeout(700); }
  ok(!!retryS && (await f.$$('[data-buy]:not([disabled])')).length === 5, 'Shop: "Försök igen" laddar lagret (5 köpbara varor)');
  await f.ctx.close();

  // ============ TILLGÄNGLIGHET PÅ ALLA SIDOR ============
  console.log('--- Tillgänglighet per sida ---');
  const a = await open(390);
  for (const tab of TABS) {
    await go(a, tab);
    const r = await a.evaluate(() => {
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.offsetParent !== null).map(h => +h.tagName[1]);
      let jump = null; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) { jump = hs[i - 1] + '→' + hs[i]; break; }
      const imgs = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
      const unnamed = [...document.querySelectorAll('button, a[href]')].filter(b => b.offsetParent !== null && !(b.innerText.trim() || b.getAttribute('aria-label') || b.getAttribute('title'))).length;
      const small = [...document.querySelectorAll('main button, main a[href], nav button, header button, main input, main textarea')].filter(b => b.offsetParent !== null && !b.closest('p, dd, td') && !b.closest('[role="dialog"]')).map(b => ({ t: (b.innerText || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 20), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })).filter(x => x.w < 44 || x.h < 44);
      return { h1: hs.filter(x => x === 1).length, jump, order: hs.join(''), imgs, unnamed, small };
    });
    ok(r.h1 === 1 && !r.jump, `${tab}: en h1 och inga hopp i rubriknivåer`, r.order + (r.jump ? ' hopp ' + r.jump : ''));
    ok(r.imgs === 0, `${tab}: alla bilder har alt-attribut`);
    ok(r.unnamed === 0, `${tab}: alla knappar och länkar har namn`);
    ok(r.small.length === 0, `${tab}: tryckytor minst 44 × 44 px`, r.small.map(s => `${s.t} ${Math.round(s.w)}×${Math.round(s.h)}`).join(', ') || 'alla');
  }
  const foot = await a.$eval('footer button', b => ({ w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
  console.log('INFO Sidfotens Admin-länk (för Lia, inte kunder):', foot.w + '×' + foot.h, 'px');

  console.log('--- Tangentbord ---');
  await a.reload(); await a.waitForTimeout(800);   // börja tabba från sidans början
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await a.keyboard.press('Tab');
    const fz = await a.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 24), nav: !!e.closest('nav'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
    seen.push(fz); if (fz.nav && fz.t === 'Galleri') break;
  }
  ok(seen.some(s => s.t.includes('Boka frisör') || s.t.includes('Boka tid')) && seen.some(s => s.nav), 'Tab når både innehåll och menyn', seen.length + ' tabbsteg');
  ok(seen.every(s => s.outline), 'Synlig fokusmarkering (kontur ≥ 2 px) på allt som får fokus', seen.filter(s => !s.outline).map(s => s.t).join(', ') || 'alla');
  await a.keyboard.press('Enter'); await a.waitForTimeout(500);
  ok((await a.$eval('.lh-header__title', h => h.innerText)) === 'Galleri', 'Enter på menyknapp byter sida');
  ok(await a.$eval('nav [aria-current="page"]', b => b.innerText.trim()) === 'Galleri', 'Aktiv sida anges med aria-current');
  await a.ctx.close();

  // ============ PRESTANDA ============
  console.log('--- Prestanda ---');
  const html = fs.statSync('/mnt/user-data/outputs/github/index.html').size;
  ok(html < 250000, 'index.html är liten', Math.round(html / 1024) + ' KB');
  const pp = await open(390);
  const loaded = [];
  pp.on('request', r => { if (r.url().includes('/bilder/')) loaded.push(decodeURIComponent(r.url().split('/bilder/')[1])); });
  await pp.reload(); await pp.waitForTimeout(1500);
  // Ändrat 27 okt på Tommys begäran: alla bilder hämtas i bakgrunden efter startsidan, så att flikarna visar bilderna direkt
  const own = [...new Set(await pp.$$eval('main img', is => is.map(i => decodeURIComponent(i.getAttribute('src').split('bilder/')[1]))))];
  const firstOwn = own.map(n => loaded.indexOf(n));
  ok(own.length > 0 && firstOwn.every(i => i >= 0 && i < own.length), 'Startsidans egna bilder hämtas först, före bakgrundshämtningen', 'startsidan: ' + own.join(', ') + ' | ordning: ' + loaded.slice(0, own.length).join(', '));
  const allImgs = fs.readdirSync('/mnt/user-data/outputs/github/bilder').filter(f => f !== 'ikon-192.png');
  ok(allImgs.every(f => loaded.includes(f)) && loaded.filter(f => f !== 'ikon-192.png').length === new Set(loaded.filter(f => f !== 'ikon-192.png')).size, 'Alla övriga bilder hämtas i bakgrunden, var och en bara en gång', loaded.length + ' hämtningar av ' + allImgs.length + ' bilder');
  const shift = await pp.$$eval('.lh-img', es => es.every(e => getComputedStyle(e).aspectRatio !== 'auto'));
  ok(shift, 'Alla bildytor har bestämd aspect-ratio (ingen layoutförskjutning)');
  const allImg = fs.readdirSync('/mnt/user-data/outputs/github/bilder').map(n => fs.statSync('/mnt/user-data/outputs/github/bilder/' + n).size);
  console.log('INFO Bildmappen:', allImg.length, 'filer,', Math.round(allImg.reduce((a, b) => a + b, 0) / 1024), 'KB totalt, största', Math.round(Math.max(...allImg) / 1024), 'KB');
  await pp.ctx.close();

  // ============ SUPABASE-LÄGE ============
  console.log('--- Supabase-läge (utan demo) ---');
  const { newCtx } = require('/tmp/t/e2e.js');
  const s = await newCtx(browser);
  for (const tab of TABS) { await s.click(`nav >> text=${tab}`); await s.waitForTimeout(500); }
  await s.click('nav >> text=Kurser'); await s.waitForTimeout(400);
  const sk = await s.evaluate(() => document.querySelector('main').innerText);
  ok(sk.includes('öppnar snart') && !(await s.$('[data-course] button')) && !sk.includes('Hämtar lediga platser'), 'Supabase-läge: Kurser visar "öppnar snart", inga bokningsknappar, ingen evig laddning');
  await s.click('nav >> text=Shop'); await s.waitForTimeout(400);
  ok((await s.evaluate(() => document.querySelector('main').innerText)).includes('öppnar snart') && !(await s.$('[data-buy]')), 'Supabase-läge: Shop visar "öppnar snart", inga köpknappar');
  ok(!(await s.evaluate(() => document.body.innerText.includes('Demoläge'))), 'Supabase-läge: ingen demoskylt');
  ok(s.errs.length === 0, 'Supabase-läge: inga JavaScript-fel', s.errs.join(' | '));

  ok(errs.length === 0, 'Inga JavaScript-fel (demoläge)', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
