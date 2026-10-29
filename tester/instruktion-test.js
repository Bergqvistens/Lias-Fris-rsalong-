// Bokning steg 2: instruktion ovanför datumrutorna (testpersoner visste inte vad de skulle göra)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, zoom] of [[390, 1], [320, 1], [320, 1.3]]) {
    const tag = `${w}px${zoom > 1 ? ' + 130 % text' : ''}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto('https://lias.test/'); await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    if (zoom > 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    await p.click('nav >> text=Boka'); await p.click('[data-cat="Klippning"]'); await p.click('[data-service="klipp-30"]'); await p.click('text=Fortsätt'); await p.waitForTimeout(500);
    const h = await p.evaluate(() => { const e = document.querySelector('[data-howto]'); if (!e) return null; const days = document.querySelector('.lh-days');
      return { title: e.querySelector('h3').innerText, steps: [...e.querySelectorAll('li')].map(li => li.innerText), swipe: e.querySelector('.lh-howto__swipe').innerText.trim(),
        above: e.getBoundingClientRect().bottom <= days.getBoundingClientRect().top, fg: getComputedStyle(e.querySelector('li')).color, tfg: getComputedStyle(e.querySelector('h3')).color, boxbg: getComputedStyle(e).backgroundColor, bw: getComputedStyle(e).borderTopWidth, bc: getComputedStyle(e).borderTopColor, fs: parseFloat(getComputedStyle(e.querySelector('li')).fontSize),
        bg: getComputedStyle(document.querySelector('.lh-flow').closest('main') || document.body).backgroundColor,
        clip: [...e.querySelectorAll('*')].some(x => x.scrollWidth > x.clientWidth + 1), hs: document.documentElement.scrollWidth <= innerWidth + 1,
        placeholder: [...document.querySelectorAll('.lh-flow p')].map(x => x.innerText).find(t => /Tryck på en dag ovan/.test(t)) || '' }; });
    ok(h && h.title === 'Så här bokar du', `${tag}: rubriken "Så här bokar du"`, h && h.title);
    ok(h && h.steps.length === 2 && h.steps[0] === 'Tryck på den dag som passar dig.' && h.steps[1] === 'Välj sedan en ledig tid. Tiderna visas under dagarna.', `${tag}: två numrerade steg med rätt text`, h && h.steps.join(' / '));
    ok(h && h.swipe === 'Svep åt sidan på datumrutorna för fler förslag på datum.', `${tag}: svep-texten (Tommys formulering)`, h && h.swipe);
    ok(h && h.above, `${tag}: instruktionen står ovanför datumrutorna`);
    ok(h && h.placeholder === 'Tryck på en dag ovan, så visas de lediga tiderna här.', `${tag}: rutan under dagarna förklarar vad som händer`, h && h.placeholder);
    if (zoom === 1) ok(h && h.boxbg !== 'rgba(0, 0, 0, 0)' && h.bc === 'rgb(145, 116, 74)' && h.bw === '1px', `${tag}: instruktionen ligger i en ljus ruta med brun ram (ändrat 29 okt)`, h && (h.boxbg + ' / ' + h.bw + ' ' + h.bc));
    if (zoom === 1) ok(h && h.fs >= 16 && contrast(h.fg, h.boxbg) >= 7 && contrast(h.tfg, h.boxbg) >= 7, `${tag}: 16 px, text och rubrik har kontrast ≥ 7 mot rutan`, h && (h.fs + ' px, text ' + contrast(h.fg, h.boxbg).toFixed(2) + ', rubrik ' + contrast(h.tfg, h.boxbg).toFixed(2)));
    ok(h && !h.clip && h.hs, `${tag}: ingen avklippt text, ingen sidledsscroll`);
    await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(500);
    const tt = await p.$eval('[data-times-title]', e => e.innerText).catch(() => '');
    ok(/^Välj en tid · /.test(tt), `${tag}: efter vald dag har tiderna rubriken "Välj en tid"`, tt);
    if (w === 390) await p.screenshot({ path: '/mnt/user-data/outputs/boka-instruktion-ruta.png' });
    ok(errs.length === 0, `${tag}: inga JavaScript-fel`, errs.join(' | '));
    await ctx.close();
  }
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
