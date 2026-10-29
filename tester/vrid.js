const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const fs = require('fs');
let pass = 0, fail = 0; const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const run = async (file, label) => {
 const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync(file, 'utf8');
 const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
 await ctx.route('**/*', r => { const u = r.request().url(); if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }); if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim }); if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app }); return r.abort(); });
 const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
 await p.goto('https://lias.test/'); await p.waitForTimeout(700);
 const acc = await p.$('text=Jag förstår och accepterar'); if (acc) { await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(150); await acc.click(); await p.waitForTimeout(200); }
 await p.click('nav >> text=Boka'); await p.click('[data-cat="Klippning"]'); await p.click('[data-service="klipp-30"]');
 const m = () => p.evaluate(() => { const n = document.querySelector('nav').getBoundingClientRect(), h = document.querySelector('header').getBoundingClientRect(); const bar = document.querySelector('.lh-actionbar') || [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'sticky'); const br = bar.getBoundingClientRect(); const items = [...document.querySelectorAll('nav button')].map(x => x.getBoundingClientRect()); return { free: Math.round(n.top - Math.max(0, h.bottom) - br.height), gap: Math.round(n.top - br.bottom), navH: Math.round(n.height), minTap: Math.round(Math.min(...items.map(i => Math.min(i.width, i.height)))) }; });
 await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400);
 await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(200);
 const l = await m();
 console.log(`${label}: liggande 844×390 efter vridning -> synlig yta ${l.free} px, glapp mellan knappfält och meny ${l.gap} px, meny ${l.navH} px hög, minsta tryckyta ${l.minTap} px`);
 if (label === 'NY') { await p.screenshot({ path: '/tmp/t/liggande-ny.png' }); await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/t/dator-ny.png' });
   const nav = await p.evaluate(() => { const it = [...document.querySelectorAll('nav button')].map(x => x.getBoundingClientRect()); return { left: Math.round(it[0].left), right: Math.round(it[it.length - 1].right), w: Math.round(it[0].width) }; });
   ok(nav.right - nav.left <= 820 && nav.left > 300, 'Dator 1440 px: menyn samlad i mitten', JSON.stringify(nav));
   ok(l.free >= 200 && Math.abs(l.gap) <= 1 && l.minTap >= 44, 'Liggande: minst 200 px innehåll, knappfältet ligger direkt ovanför menyn efter vridning, tryckytor ≥ 44 px', JSON.stringify(l));
   ok(errs.length === 0, 'Inga JS-fel', errs.join('|')); }
 await b.close(); return l;
};
(async () => {
 const old = fs.readFileSync('/tmp/t/app.js', 'utf8');
 await run('/tmp/t/app.js', 'NY');
 console.log(`RESULTAT: ${pass} OK, ${fail} FEL`);
})();
