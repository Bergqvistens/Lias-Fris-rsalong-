// Skärmbilder av sidorna (390 px) – används för före/efter ram
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const tagg = process.argv[2] || 'fore';
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('**/*', r => { const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const p = await ctx.newPage(); await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar');
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 });
  for (const tab of ['Start', 'Kurser', 'Shop', 'Kontakt']) {
    await p.click('nav >> text=' + tab); await p.waitForTimeout(900);
    if (tab === 'Start') await p.evaluate(() => window.scrollTo(0, 420));
    if (tab === 'Kontakt') await p.evaluate(() => window.scrollTo(0, 260));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `/tmp/t/ram/${tab}-${tagg}.png` });
  }
  await b.close(); console.log('klart', tagg);
})();
