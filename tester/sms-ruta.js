// Sms-rutorna i admin: tonad bakgrund (inte vit), brun ram, kontrast ≥ 4,5, större text, luft mellan rutor
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, zoom] of [[390, 844, 1], [320, 568, 1], [390, 844, 1.3]]) {
    console.log(`--- ${w}×${h}${zoom > 1 ? ' 130 % text' : ''} ---`);
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
      return r.abort();
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    const now = Date.now();
    const sms = [
      ['till-lia', 'Ny bokning: Tommy Bergqvist, tis 27 okt kl 16:00, Dam medel hår, Färgning dam, Styling dam, 1193 kr. Tel 0736344954'],
      ['bekraftelse', 'Hej Tommy! Din tid hos Lias Hantverkeri är bokad tis 27 okt kl 16:00. Välkommen!'],
      ['order-hamtklar', 'Hej! Din beställning LH-1001 är klar att hämta hos Lias Hantverkeri. Välkommen!'],
    ].map(([kind, text], i) => ({ id: 's' + i, bookingId: 'b' + i, at: new Date(now - i * 60000).toISOString(), from: 'LiasSalong', to: kind === 'till-lia' ? 'Lia' : '0736344954', kind, text }));
    await p.evaluate(d => localStorage.setItem('lias_demo_db', JSON.stringify(d)), { bookings: [], sms, courseBookings: [], orders: [], sold: {}, orderSeq: 1000, payments: [], photos: [], receiptSeq: 1000 });
    if (zoom > 1) await p.addStyleTag({ content: 'html{font-size:130%!important} body{zoom:1.3}' });
    await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
    await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
    const b = await p.$$eval('[data-sms]', cs => cs.map(c => { const s = getComputedStyle(c), hd = c.querySelector('[data-sms-head]'), hs = getComputedStyle(hd), r = c.getBoundingClientRect();
      return { bg: s.backgroundColor, bw: s.borderTopWidth, bc: s.borderTopColor, fg: s.color, fs: parseFloat(s.fontSize), hfg: hs.color, hfs: parseFloat(hs.fontSize), top: r.top, bottom: r.bottom, right: r.right, sw: c.scrollWidth, cw: c.clientWidth }; }));
    ok(b.length === 3, 'Tre sms-rutor visas', b.length);
    ok(b.every(x => x.bg !== 'rgb(255, 255, 255)' && x.bg === 'rgb(244, 237, 224)'), 'Bakgrunden är tonad sand (#F4EDE0), inte vit', b[0].bg);
    ok(b.every(x => Math.abs(parseFloat(x.bw) * zoom - 2) < 0.05 && x.bc === 'rgb(145, 116, 74)'), 'Brun ram 2 px på skärmen (#91744A)', b[0].bw + ' × ' + zoom + ' ' + b[0].bc);
    ok(b.every(x => contrast(x.bc, x.bg) >= 3), 'Ramen syns mot rutan (kontrast ≥ 3)', contrast(b[0].bc, b[0].bg).toFixed(2));
    const pageBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(contrast(b[0].bc, 'rgb(95, 168, 168)') >= 1.5, 'Ramen skiljer sig från turkos bakgrund', contrast(b[0].bc, 'rgb(95, 168, 168)').toFixed(2));
    ok(b.every(x => contrast(x.fg, x.bg) >= 4.5), 'Brödtext kontrast ≥ 4,5', contrast(b[0].fg, b[0].bg).toFixed(2));
    ok(b.every(x => contrast(x.hfg, x.bg) >= 4.5), 'Rubrikrad kontrast ≥ 4,5 (förut ca 4,4)', contrast(b[0].hfg, b[0].bg).toFixed(2));
    ok(b.every(x => x.fs >= 15 && x.hfs >= 13), 'Textstorlek: brödtext ≥ 15 px, rubrikrad ≥ 13 px', b[0].fs + ' / ' + b[0].hfs);
    ok(b[1].top - b[0].bottom >= 11.5 && b[2].top - b[1].bottom >= 11.5, 'Minst 12 px luft mellan rutorna', (b[1].top - b[0].bottom).toFixed(1));
    ok(b.every(x => x.sw <= x.cw + 1) && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Ingen text klipps, ingen sidledsscroll');
    await p.locator('[data-sms]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    await p.locator("section:has([data-sms])").screenshot({ path: `/tmp/t/sms-ruta-${w}${zoom > 1 ? '-zoom' : ''}.png` });
    ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
