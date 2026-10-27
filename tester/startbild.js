// Startbild: turkos skärm med logga syns direkt (inte vit), även när typsnitt och app laddar långsamt; försvinner när appen är klar
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Skärmbild direkt via Chromes egen funktion (Playwrights väntar på typsnitt, det vill vi inte här)
const shot = async (p, file) => { const c = await p.context().newCDPSession(p); const { data } = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(data, 'base64')); await c.detach(); };
const px = (file, xs) => JSON.parse(execFileSync('python3', ['-c', `import sys,json;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');w,h=im.size;print(json.dumps([list(im.getpixel((int(w*x),int(h*y)))) for x,y in json.loads(sys.argv[2])]))`, file, JSON.stringify(xs)]).toString());
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const mk = async ({ w = 390, h = 844, appDelay = 0, fontDelay = 4000, appFails = false, motion = 'no-preference' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion });
    await ctx.route('**/*', async r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.includes('fonts.googleapis.com')) { await sleep(fontDelay); return r.fulfill({ contentType: 'text/css', body: '' }).catch(() => {}); }
      if (u.endsWith('/react-shim.js')) { await sleep(appDelay); return r.fulfill({ contentType: 'application/javascript', body: shim }).catch(() => {}); }
      if (u.endsWith('/app.js')) { if (appFails) return r.abort(); return r.fulfill({ contentType: 'application/javascript', body: app }).catch(() => {}); }
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort();
    });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    return { ctx, p, errs };
  };
  const notWhite = c => !(c[0] > 240 && c[1] > 240 && c[2] > 240);

  for (const [w, h] of [[390, 844], [320, 568], [844, 390]]) {
    console.log(`--- ${w}×${h}: typsnitt tar 4 s, appen tar 3 s ---`);
    const { ctx, p, errs } = await mk({ w, h, appDelay: 3000 });
    p.goto('https://lias.test/').catch(() => {});
    await sleep(700);
    await shot(p, `/tmp/t/startbild-${w}x${h}.png`);
    const c = px(`/tmp/t/startbild-${w}x${h}.png`, [[0.05, 0.05], [0.5, 0.97], [0.97, 0.5]]);
    ok(c.every(notWhite) && c.every(x => Math.abs(x[0] - 14) < 6 && Math.abs(x[1] - 38) < 6 && Math.abs(x[2] - 25) < 6), 'Efter 0,7 s: skärmen är skogsgrön (#0E2619), inte vit', JSON.stringify(c));
    const s = await p.evaluate(() => { const e = document.querySelector('.lh-splash'); if (!e) return null; const R = el => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
      const im = e.querySelector('.lh-splash__logo'), tag = e.querySelector('.lh-splash__tag'), foot = e.querySelector('.lh-splash__foot');
      return { img: im.complete && im.naturalWidth > 0, tag: tag.innerText.replace(/\s+/g, ' ').trim(), foot: foot.innerText.trim(), parts: [R(im), R(tag), R(foot)], vw: innerWidth, vh: innerHeight, fg: getComputedStyle(tag).color, bg: getComputedStyle(e).backgroundColor, clip: [tag, foot].some(x => x.scrollWidth > x.clientWidth + 1), slow: getComputedStyle(e.querySelector('.lh-splash__slow')).visibility }; });
    ok(s && s.img && /KVALITET I VARJE DETALJ/i.test(s.tag) && /Frisörsalong • Keramikverkstad • Karlskoga/i.test(s.foot), 'Startbilden visar Lias logga, "Kvalitet i varje detalj" och raden längst ner', JSON.stringify(s && { img: s.img, tag: s.tag }));
    ok(s && s.parts.every(r => r.t >= 0 && r.l >= 0 && r.r <= s.vw && r.b <= s.vh) && s.parts[0].b <= s.parts[1].t && s.parts[1].b <= s.parts[2].t && !s.clip, 'Logga och texter får plats, överlappar inte och klipps inte', s && s.parts.map(r => Math.round(r.t) + '–' + Math.round(r.b)).join(', '));
    ok(s && contrast(s.fg.match(/\d+/g).map(Number), s.bg.match(/\d+/g).map(Number)) >= 4.5, 'Champagnefärgad text har kontrast ≥ 4,5', s && contrast(s.fg.match(/\d+/g).map(Number), s.bg.match(/\d+/g).map(Number)).toFixed(2));
    const sharp = await p.$eval('.lh-splash__logo', i => ({ nat: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width) }));
    ok(sharp.nat >= sharp.shown * 3, 'Loggan är skarp även på mobilskärm med 3× pixeltäthet (originalet)', sharp.nat + ' px bild / ' + sharp.shown + ' px visad');
    ok(s && s.slow === 'hidden', '"Det tar längre tid än vanligt" visas inte i onödan');
    await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 }).catch(() => {});
    ok(!(await p.$('.lh-splash')) && !!(await p.$('text=Jag förstår och accepterar')), 'När appen är klar försvinner startbilden och appen visas');
    ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
    await ctx.close();
  }

  console.log('--- Appen kan inte laddas (inget nät) ---');
  {
    const { ctx, p } = await mk({ appFails: true, fontDelay: 0 });
    await p.goto('https://lias.test/'); await sleep(2000);
    ok(await p.$eval('.lh-splash__slow', e => getComputedStyle(e).visibility) === 'hidden', 'Efter 2 s: inget felmeddelande än');
    await sleep(14000);
    ok(await p.$eval('.lh-splash__slow', e => getComputedStyle(e).visibility) === 'visible', 'Efter 16 s: "Det tar längre tid än vanligt … ladda om" visas');
    await ctx.close();
  }
  console.log('--- Minskad rörelse ---');
  {
    const { ctx, p } = await mk({ appDelay: 3000, fontDelay: 0, motion: 'reduce' });
    p.goto('https://lias.test/').catch(() => {}); await sleep(700);
    ok(await p.$eval('.lh-splash__dots span', e => getComputedStyle(e).animationName) === 'none', 'Med "minska rörelse" pulserar inte prickarna');
    await ctx.close();
  }
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
