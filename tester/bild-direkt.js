// Bilder på en ny flik: visas alla direkt (från telefonens minne) i stället för en och en.
// Riktig webbserver med cache och 600 ms fördröjning per bild (långsamt mobilnät). Ingen Playwright-route (den stänger av cachen).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const DELAY = 600;
let imgReq = [];
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync('/tmp/t/run.html')); }
  if (u === '/react-shim.js' || u === '/app.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(fs.readFileSync('/tmp/t' + u)); }
  if (u.startsWith('/bilder/')) {
    imgReq.push({ u, t: Date.now() });
    const f = '/mnt/user-data/outputs/github' + u;
    return setTimeout(() => { if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': u.endsWith('.jpg') ? 'image/jpeg' : u.endsWith('.png') ? 'image/png' : 'image/webp', 'Cache-Control': 'max-age=3600' }); res.end(fs.readFileSync(f)); }, DELAY);
  }
  res.writeHead(404); res.end();
});
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(base); await p.waitForTimeout(800);
  if (await p.$('text=Jag förstår och accepterar')) {
    await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  }
  await p.waitForTimeout(3000);   // användaren tittar på startsidan en stund
  for (const tab of ['Shop', 'Galleri', 'Kurser', 'Boka', 'Kontakt']) {
    imgReq = [];
    await p.evaluate(() => { window.__t0 = performance.now(); });
    await p.click(`nav >> text=${tab}`);
    // Mät när varje bild i bildfönstret är färdig
    const res = await p.evaluate(() => new Promise(done => {
      const seen = {}, start = window.__t0;
      const tick = () => {
        const imgs = [...document.querySelectorAll('img')].filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
        const now = performance.now() - start;
        imgs.forEach(i => { if (i.complete && i.naturalWidth > 0 && seen[i.currentSrc] === undefined) seen[i.currentSrc] = now; });
        const allDone = imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
        if (allDone || now > 6000) return done({ n: imgs.length, times: Object.values(seen).map(Math.round), allDone });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    const max = Math.max(...res.times), min = Math.min(...res.times);
    ok(res.allDone && max < 250, `${tab}: alla ${res.n} synliga bilder klara inom 250 ms efter tryck`, `klara efter ${res.times.sort((a, b) => a - b).join(', ')} ms`);
    ok(imgReq.length === 0, `${tab}: inga bilder behövde hämtas när fliken öppnades (fanns redan)`, imgReq.length + ' hämtningar');
    await p.waitForTimeout(1500);
  }
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close(); srv.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
