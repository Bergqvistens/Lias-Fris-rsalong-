const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, zoom] of [[320, 1], [375, 1], [390, 1], [430, 1], [390, 1.3], [320, 1.3]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2 });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('https://lias.test/'); await p.waitForTimeout(500);
    if (zoom !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(300);
    await p.evaluate(() => document.fonts && document.fonts.ready); const tag = `${w}px${zoom !== 1 ? ' + text 130 %' : ''}`;
    const nav = await p.evaluate(() => [...document.querySelectorAll('nav button')].map(x => { const r = x.getBoundingClientRect(), s = x.querySelector('span'); return { t: s.innerText, w: Math.round(r.width), h: Math.round(r.height), clipped: (() => { const r = document.createRange(); r.selectNodeContents(s); return s.scrollWidth > s.clientWidth || r.getBoundingClientRect().width > s.getBoundingClientRect().width + 0.5; })(), cur: x.getAttribute('aria-current') }; }));
    ok(nav.length === 6 && nav.every(n => n.w >= 44 && n.h >= 44), `${tag}: 6 knappar, alla minst 44×44`, nav.map(n => n.w + '×' + n.h).join(' '));
    ok(nav.every(n => !n.clipped), `${tag}: ingen etikett avklippt`, nav.filter(n => n.clipped).map(n => n.t).join(',') || 'inga');
    ok(nav.filter(n => n.cur === 'page').map(n => n.t).join() === 'Start', `${tag}: aria-current="page" på Start`);
    const hScroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!hScroll, `${tag}: ingen sidledsscroll`);
    const head = await p.evaluate(() => { const h = document.querySelector('header').getBoundingClientRect(), t = document.querySelector('.lh-header__title'); return { h: Math.round(h.height), title: t.innerText, h1: t.tagName }; });
    ok(head.h <= 80 && head.h1 === 'H1', `${tag}: kompakt header (${head.h}px) med rubrik "${head.title}"`);
    await p.click('nav >> text=Kurser'); await p.waitForTimeout(200); await p.waitForFunction(() => !document.body.innerText.includes('Hämtar lediga platser'));
    ok((await p.evaluate(() => document.querySelector('.lh-header__title').innerText)) === 'Keramikkurser' && (await p.evaluate(() => [...document.querySelectorAll('nav button')].find(x => x.getAttribute('aria-current') === 'page').innerText)) === 'Kurser', `${tag}: header och aktiv knapp byts till Kurser`);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 2)); await p.waitForTimeout(200);
    const cover = await p.evaluate(() => { const a = document.querySelector('footer button').getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect(); return a.bottom <= n.top; });
    ok(cover, `${tag}: navigeringen täcker inte innehållet (Admin-länken syns längst ner)`);
    if (w === 390 && zoom === 1) { await p.evaluate(() => window.scrollTo(0, 0)); await p.click('nav >> text=Start'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/t/s1-start-390.png' }); }
    if (w === 320) { await p.evaluate(() => window.scrollTo(0, 0)); await p.click('nav >> text=Shop'); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/t/s1-shop-320.png' }); }
    if (zoom !== 1) { await p.evaluate(() => window.scrollTo(0, 0)); await p.click('nav >> text=Boka'); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/t/s1-boka-zoom-' + w + '.png' }); }
    ok(errs.length === 0, `${tag}: inga JavaScript-fel`, errs.join(' | '));
    await ctx.close();
  }
  // Tangentbord: Tab till navigeringen och synlig fokusmarkering
  const ctx = await b.newContext({ viewport: { width: 390, height: 760 } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
  const p = await ctx.newPage(); await p.goto('https://lias.test/'); await p.waitForTimeout(500);
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(300);
  await p.focus('nav button:nth-child(2)'); await p.keyboard.press('Tab');
  const f = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { text: a.innerText, outline: cs.outlineStyle + ' ' + cs.outlineWidth, inNav: !!a.closest('nav') }; });
  ok(f.inNav && f.text === 'Kurser' && f.outline.startsWith('solid 3px'), 'Tangentbord: Tab flyttar mellan menyknapparna med synlig fokusram', JSON.stringify(f));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok((await p.evaluate(() => document.querySelector('.lh-header__title').innerText)) === 'Keramikkurser', 'Tangentbord: Enter öppnar sidan');
  const label = await p.evaluate(() => document.querySelector('nav').getAttribute('aria-label'));
  ok(label === 'Huvudmeny', 'Navigeringen har etiketten "Huvudmeny" för skärmläsare');
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`); await b.close();
})();
