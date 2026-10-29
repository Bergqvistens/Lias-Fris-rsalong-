// Alla sidor på vanliga skärmstorlekar (CSS-pixlar): sidledsscroll, avklippt text, menyn täcker innehåll, synlig yta
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const fs = require('fs');
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const SIZES = [
  ['Mycket liten (iPhone SE 1:a gen.)', 320, 568], ['Smal vikbar, hopfälld', 344, 882], ['Vanlig Android', 360, 780], ['iPhone SE / 8', 375, 667],
  ['Android mellan', 384, 832], ['iPhone 15', 393, 852], ['Stor Android', 412, 915], ['iPhone Pro Max', 430, 932],
  ['Liggande mobil (liten)', 667, 375], ['Liggande mobil (stor)', 852, 393], ['Surfplatta stående', 768, 1024], ['Surfplatta liggande', 1024, 768], ['Dator', 1440, 900],
];
const TABS = ['Start', 'Boka', 'Kurser', 'Shop', 'Kontakt', 'Galleri'];
let pass = 0, fail = 0; const rows = [];
(async () => { const b = await chromium.launch(); const errs = [];
 for (const [name, w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://lias.test/'); await p.waitForTimeout(700);
  const acc = await p.$('text=Jag förstår och accepterar'); if (acc) { await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(150); await acc.click(); await p.waitForTimeout(200); }
  const probs = [];
  for (const tab of TABS) {
   await p.click(`nav >> text=${tab}`); await p.waitForTimeout(700);
   if (tab === 'Boka') { await p.click('[data-cat="Klippning"]'); await p.click('[data-service="klipp-30"]'); await p.waitForTimeout(150); }
   const r = await p.evaluate(() => {
     const hs = document.documentElement.scrollWidth > innerWidth + 1;
     const clip = [...document.querySelectorAll('main h1, main h2, main h3, main p, main button, main a, main label, main dd, main td, main th, nav span, header *, .lh-opt__name, .lh-opt__price, .lh-pcard__name, .lh-gtile__title')].filter(e => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto').map(e => (e.innerText || '').trim().slice(0, 18)).filter(Boolean);
     const nav = document.querySelector('nav').getBoundingClientRect(), head = document.querySelector('header').getBoundingClientRect();
     const sticky = [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'sticky');
     const stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
     const free = Math.round(nav.top - head.bottom - stickyH);   // synlig innehållsyta mellan header och knappar
     return { hs, clip: [...new Set(clip)].slice(0, 4), free };
   });
   await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 2)); await p.waitForTimeout(200);
   const cover = await p.evaluate(() => { const a = document.querySelector('footer button').getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect(); return a.bottom <= n.top + 1; });
   if (r.hs) probs.push(`${tab}: sidledsscroll`);
   if (r.clip.length) probs.push(`${tab}: avklippt ${r.clip.join(', ')}`);
   if (!cover) probs.push(`${tab}: menyn täcker sidfoten`);
   if (r.free < 200) probs.push(`${tab}: bara ${r.free} px synlig innehållsyta`);
   await p.evaluate(() => window.scrollTo(0, 0));
  }
  if (['Liggande mobil (liten)', 'Surfplatta stående', 'Dator', 'Mycket liten (iPhone SE 1:a gen.)'].includes(name)) { await p.click('nav >> text=Shop'); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/t/skarm-${w}x${h}.png` }); }
  probs.length ? fail++ : pass++;
  rows.push(`${probs.length ? 'FEL ' : 'OK  '} ${name.padEnd(36)} ${String(w).padStart(4)}×${String(h).padEnd(4)} ${probs.join(' | ')}`);
  await ctx.close();
 }
 console.log(rows.join('\n')); console.log(`JS-fel: ${errs.length}`); console.log(`\nRESULTAT: ${pass} OK, ${fail} med anmärkning (av ${SIZES.length} storlekar × ${TABS.length} sidor)`); await b.close(); })();
