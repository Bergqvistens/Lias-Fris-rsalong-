const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const open = async (w, zoom = 1) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2 });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('https://lias.test/'); await p.waitForTimeout(500);
    if (zoom !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(500); p.ctx = ctx; return p;
  };
  const imgs = p => p.evaluate(() => [...document.querySelectorAll('main img')].map(i => ({ alt: i.alt, w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 })));
  const p = await open(390);
  const t = await p.evaluate(() => document.querySelector('main').innerText);
  ok(t.includes('Välkommen till Lias Hantverkeri') && t.includes('Frisörsalong och keramikverkstad i Karlskoga') && t.includes('Skapa, vårda och inspireras.'), 'Hero: rubrik, underrubrik och budskap enligt uppdraget');
  ok(t.includes('Hos oss får du en personlig frisörklipp'), 'Tidigare välkomsttext finns kvar');
  const hi = await imgs(p);
  ok(hi.length === 4 && hi.every(i => i.ok), 'Startsidan: 4 bilder laddade (hero + 3 ingångar)', hi.map(i => (i.alt || '(dekor)') + ' ' + i.w + 'px').join(', '));
  const heroH = await p.evaluate(() => Math.round(document.querySelector('.lh-hero').getBoundingClientRect().bottom));
  const firstEntry = await p.evaluate(() => Math.round(document.querySelector('.lh-entry').getBoundingClientRect().top));
  ok(firstEntry < 760 - 52, 'Första ingången syns på första skärmen', `hero slutar ${heroH}px, första ingång börjar ${firstEntry}px`);
  await p.screenshot({ path: '/tmp/t/s2-390.png' });
  await p.screenshot({ path: '/tmp/t/s2-390-full.png', fullPage: true });
  for (const [id, want] of [['boka', 'Boka tid'], ['kurser', 'Keramikkurser'], ['shop', 'Keramikshop']]) {
    await p.click(`nav >> text=Start`); await p.waitForTimeout(200);
    await p.click(`[data-entry="${id}"]`); await p.waitForTimeout(400);
    ok((await p.evaluate(() => document.querySelector('.lh-header__title').innerText)) === want, `Ingången ${id} öppnar "${want}"`);
    if (id === 'kurser') { const k = await imgs(p); ok(k.length >= 1 && k[0].ok && k[0].alt.includes('drejar'), 'Kurssidan: drejningsbild överst', k[0] && k[0].w + 'px'); await p.screenshot({ path: '/tmp/t/s2-kurser.png' }); }
    if (id === 'shop') {
      await p.waitForTimeout(400);
      const prod = await p.evaluate(() => [...document.querySelectorAll('[data-product]')].map(c => { const i = c.querySelector('img'); return c.getAttribute('data-product') + ':' + (i ? (i.naturalWidth > 0 ? 'bild' : 'TRASIG') : (c.innerText.includes('Bild kommer') ? 'reservyta' : '?')); }));
      ok(prod.join(',') === 's-cup:bild,s-bowl:bild,s-vase:bild,s-plate:bild,s-pot:bild,s-set:bild', 'Shop: alla sex produkter har bild', prod.join(', '));
      ok((await p.evaluate(() => document.querySelector('main').innerText)).includes('Produktbilderna är illustrationer'), 'Shop: notis om att bilderna är illustrationer');
      ok(!(await p.evaluate(() => /☕|🥣|🌸|🍽️|🌿|🎁/.test([...document.querySelectorAll('[data-product]')].map(c => c.innerText).join('')))), 'Shop: inga emojis som produktbilder');
      await p.screenshot({ path: '/tmp/t/s2-shop.png' });
    }
  }
  ok(p.errs.length === 0, 'Inga JavaScript-fel', p.errs.join(' | ')); await p.ctx.close();
  for (const [w, z] of [[320, 1], [375, 1], [430, 1], [320, 1.3]]) {
    const q = await open(w, z);
    const hs = await q.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!hs, `${w}px${z !== 1 ? ' + 130 % text' : ''}: ingen sidledsscroll på startsidan`);
    if (w === 320 && z === 1) await q.screenshot({ path: '/tmp/t/s2-320.png' });
    await q.ctx.close();
  }
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`); await b.close();
})();
