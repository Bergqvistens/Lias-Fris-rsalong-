// Starttid: hur lång tid tar det från att sidan öppnas till att appen är ritad (bakom startbilden)?
// Simulerad mobil: processorn 4× långsammare. React m.m. serveras lokalt utan fördröjning (CDN-tiden ingår alltså INTE).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const browser = await chromium.launch();
  const res = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
      if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      return r.abort(); });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.addInitScript(() => { const t = () => { const r = document.getElementById('root'); if (r && r.children.length) { window.__ready = performance.now(); return; } requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await p.goto('https://lias.test/'); await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    res.push(await p.evaluate(() => ({ ready: Math.round(window.__ready), parse: Math.round(performance.getEntriesByType('resource').filter(e => /app\.js/.test(e.name)).map(e => e.responseEnd)[0] || 0) })));
    await ctx.close();
  }
  console.log('Appen ritad efter (ms):', res.map(r => r.ready).join(', '), '| median', res.map(r => r.ready).sort((a, b) => a - b)[2]);
  await browser.close();
})();
