// Steg 4: Boka, Kontakt, Galleri, kassa/kurs i ny stil
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch();
  const errs = [], outside = [];
  const open = async (w, zoom = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
      if (!/fonts\.(googleapis|gstatic)\.com|supabase-js/.test(u)) outside.push(u);
      return r.abort();
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    if (zoom !== 1) await p.evaluate(z => { document.documentElement.style.zoom = z; }, zoom);
    p.ctx = ctx; return p;
  };
  const go = async (p, tab) => { await p.click(`nav >> text=${tab}`); await p.waitForTimeout(600); };
  const mainText = p => p.evaluate(() => document.querySelector('main').innerText);
  const pageBg = p => p.evaluate(() => getComputedStyle(document.querySelector('main')).backgroundColor);

  // ===================== BOKA =====================
  console.log('--- Boka: steg 1 ---');
  const b = await open(390);
  await go(b, 'Boka');
  ok(await pageBg(b) === 'rgb(95, 168, 168)', 'Bokningen har turkos bakgrund');
  const t1 = await mainText(b);
  ok(t1.includes('STEG 1 AV 3') && t1.includes('Välj tjänst'), 'Stegräknare "Steg 1 av 3" och rubrik "Välj tjänst"');
  ok(await b.$$eval('.lh-steph__bar span', s => s.map(x => x.getAttribute('data-on')).join(',')) === 'true,false,false', 'Stegstapel visar steg 1 av 3');
  const cats = await b.$$eval('section[data-cat]', ss => ss.map(s => ({ c: s.getAttribute('data-cat'), h: s.querySelector('h3').innerText, img: !!s.querySelector('.lh-cat__img img'), note: s.querySelector('.lh-cat__note').innerText, n: s.querySelectorAll('[data-service]').length })));
  ok(cats.map(c => c.h).join(',') === 'Herr,Dam,Barn' && cats.every(c => c.img && c.note === 'Inspirationsbild'), 'Kategorierna Herr, Dam, Barn har rubrik i text, bild och märkningen "Inspirationsbild"', cats.map(c => c.h + ':' + c.n).join(' '));
  ok(cats.reduce((a, c) => a + c.n, 0) === 14, 'Alla 14 tjänster finns kvar');
  ok(!EMOJI.test(t1), 'Inga emojis i steg 1');
  const prices = await b.$$eval('[data-service]', bs => bs.map(x => x.getAttribute('data-service') + '=' + x.querySelector('.lh-opt__price').innerText.replace(/\s/g, '')));
  ok(prices.includes('d-färg=449,00kr') && prices.includes('h-kort=395,00kr') && prices.includes('b-klipp=295,00kr'), 'Priserna är oförändrade (bl.a. Färgning dam 449 kr)');
  const svc = b.locator('[data-service="h-kort"]');
  const before = await svc.evaluate(x => ({ p: x.getAttribute('aria-pressed'), bw: getComputedStyle(x).borderTopWidth, t: x.innerText }));
  await svc.click(); await b.click('[data-service="h-skägg"]');
  const after = await svc.evaluate(x => ({ p: x.getAttribute('aria-pressed'), bw: getComputedStyle(x).borderTopWidth, t: x.innerText, chk: !!x.querySelector('.lh-opt__check svg') }));
  ok(before.p === 'false' && after.p === 'true', 'Vald tjänst anges med aria-pressed');
  ok(after.chk && after.t.includes('Vald') && parseFloat(after.bw) > parseFloat(before.bw), 'Vald tjänst visas med bock, texten "Vald" och tjockare ram (inte bara färg)', before.bw + ' → ' + after.bw);
  const sum = await b.$eval('[data-summary="tjanster"]', x => x.innerText.replace(/\u00a0/g, ' '));
  ok(sum.includes('Herr kort hår, Skäggtrim') && sum.includes('35 min') && sum.includes('544'), 'Sammanfattning: tjänster, sammanlagd tid och pris', sum.replace(/\n/g, ' | '));
  await b.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 2)); await b.waitForTimeout(200);
  const cover = await b.evaluate(() => { const last = document.querySelector('[data-summary="tjanster"]').getBoundingClientRect(); const bar = [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'sticky').getBoundingClientRect(); return { last: Math.round(last.bottom), bar: Math.round(bar.top) }; });
  ok(cover.last <= cover.bar, 'Fortsätt-knappen täcker inte sista innehållet', JSON.stringify(cover));
  const barBtn = await b.evaluate(() => { const bt = [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'sticky').querySelector('button'); return [getComputedStyle(bt).color, getComputedStyle(bt).backgroundColor, Math.round(bt.getBoundingClientRect().height)]; });
  ok(contrast(barBtn[0], barBtn[1]) >= 4.5 && barBtn[2] >= 48, 'Fortsätt-knappen: champagne med mörk text, kontrast ≥ 4,5 och minst 48 px', contrast(barBtn[0], barBtn[1]).toFixed(2) + ', ' + barBtn[2] + ' px');
  const head = await b.$eval('.lh-steph__title', h => [getComputedStyle(h).color, getComputedStyle(document.querySelector('main')).backgroundColor]);
  ok(contrast(...head) >= 4.5, 'Stegrubriken på turkos har kontrast ≥ 4,5', contrast(...head).toFixed(2));
  await b.evaluate(() => window.scrollTo(0, 0)); await b.waitForTimeout(100);
  await b.screenshot({ path: '/tmp/t/s4-boka1.png' });
  await b.evaluate(() => window.scrollTo(0, 900)); await b.waitForTimeout(100);
  await b.screenshot({ path: '/tmp/t/s4-boka1b.png' });

  console.log('--- Boka: steg 2 och 3 ---');
  await b.click('text=Fortsätt'); await b.waitForTimeout(300);
  ok((await mainText(b)).includes('STEG 2 AV 3'), 'Steg 2 av 3');
  const days = await b.$$('.lh-day');
  await days[1].click(); await b.waitForTimeout(500);
  ok(await days[1].getAttribute('aria-pressed') === 'true', 'Vald dag anges med aria-pressed');
  const times = await b.$$('.lh-time');
  ok(times.length > 0, 'Lediga tider visas', times.length + ' tider');
  await times[2].click(); await b.waitForTimeout(150);
  const tsel = await times[2].evaluate(x => ({ p: x.getAttribute('aria-pressed'), chk: !!x.querySelector('svg'), t: x.innerText.trim() }));
  ok(tsel.p === 'true' && tsel.chk && /^\d\d:\d\d$/.test(tsel.t), 'Vald tid: aria-pressed och bock', tsel.t);
  const th = await b.$$eval('.lh-time, .lh-day', bs => Math.min(...bs.map(x => x.getBoundingClientRect().height)));
  ok(th >= 44, 'Dag- och tidsknappar minst 44 px', th + ' px');
  await b.screenshot({ path: '/tmp/t/s4-boka2.png' });
  await b.click('text=Fortsätt'); await b.waitForTimeout(300);
  ok((await mainText(b)).includes('STEG 3 AV 3'), 'Steg 3 av 3');
  ok(await b.$$eval('[data-summary="bokning"] .lh-row svg', x => x.length) === 4, 'Sammanfattningen har fyra rader med linjeikoner');
  await b.click('button:has-text("Boka ·")'); await b.waitForTimeout(200);
  const fe = await b.$$eval('[data-err]', es => es.map(e => { const f = e.closest('.lh-field'); const inp = f.querySelector('input'); return { t: e.innerText, inv: inp.getAttribute('aria-invalid'), desc: (inp.getAttribute('aria-describedby') || '').includes(e.id), below: e.getBoundingClientRect().top >= inp.getBoundingClientRect().bottom }; }));
  ok(fe.length === 3 && fe.every(x => x.inv === 'true' && x.desc && x.below), 'Feltexter under rätt fält, kopplade med aria-describedby', fe.map(x => x.t).join(' | '));
  const lab = await b.$$eval('.lh-field', fs => fs.every(f => { const l = f.querySelector('label'), i = f.querySelector('input'); return l && l.htmlFor === i.id && l.getBoundingClientRect().bottom <= i.getBoundingClientRect().top + 1; }));
  ok(lab, 'Etiketter ligger ovanför fälten och är kopplade (for/id)');
  await b.fill('input[type=text]', 'Stina Svensson'); await b.fill('input[type=tel]', '0701112233'); await b.fill('input[type=email]', 'stina@exempel.se');
  await b.screenshot({ path: '/tmp/t/s4-boka3.png' });
  await b.click('button:has-text("Boka ·")'); await b.waitForTimeout(900);
  const done = await mainText(b);
  ok(done.includes('Din tid är bokad!') && done.includes('Välkommen, Stina!') && !EMOJI.test(done.split('Demo: sms')[0]), 'Bekräftelse utan emojis', done.split('\n').slice(0, 3).join(' | '));
  ok(!!(await b.$('[data-sms="bekraftelse"]')), 'Demo-sms visas i bekräftelsen');
  await b.screenshot({ path: '/tmp/t/s4-boka-klar.png' });
  await b.click('button:text-is("Klar")'); await b.waitForTimeout(400);
  ok((await b.$eval('.lh-header__title', h => h.innerText)) === 'Lias Hantverkeri', 'Klar → startsidan');
  await b.ctx.close();

  // ===================== KURS + KASSA (stil) =====================
  console.log('--- Kursbokning och kassa ---');
  const k = await open(390);
  await go(k, 'Kurser'); await k.click('[data-course="c-adv"] button'); await k.waitForTimeout(600);
  ok((await mainText(k)).includes('STEG 1 AV 2') && !EMOJI.test(await mainText(k)), 'Kursomgångar: steg 1 av 2, inga emojis');
  await k.click('[data-occ] >> nth=0'); await k.waitForTimeout(150);
  ok(await k.$eval('[data-occ]', x => x.getAttribute('aria-pressed') === 'true' && x.innerText.includes('Vald')), 'Vald omgång: aria-pressed och "Vald"');
  await k.screenshot({ path: '/tmp/t/s4-kurs2.png' });
  await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  ok(!EMOJI.test(await mainText(k)) && await k.$$eval('.lh-sum .lh-row', r => r.length) === 5, 'Kursens uppgiftssteg: sammanfattning med 5 ikonrader, inga emojis');
  await go(k, 'Shop'); await k.click('[data-product="s-cup"] [data-buy]'); await k.click('text=Till kassan'); await k.waitForTimeout(300);
  const kt = await mainText(k);
  ok(kt.includes('Kassa') && !EMOJI.test(kt), 'Kassan: inga emojis');
  ok(await k.$$eval('[data-pay]', bs => bs.map(x => x.innerText.trim()).join(',')) === 'Swish,Kort', 'Betalsätt Swish och Kort med ikoner');
  await k.click('[data-pay="swish"]');
  ok(await k.$eval('[data-pay="swish"]', x => x.getAttribute('aria-pressed') === 'true' && !!x.querySelector('.lh-opt__check svg') && getComputedStyle(x).backgroundColor === 'rgb(255, 255, 255)'), 'Valt betalsätt: vit med grön ram och bock (som tidigare valt)');
  const payBtn = await k.evaluate(() => getComputedStyle([...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'sticky').querySelector('button')).backgroundColor);
  ok(payBtn === 'rgb(71, 100, 82)', 'Betala-knappen är fortfarande rosmaringrön', payBtn);
  await k.screenshot({ path: '/tmp/t/s4-kassa.png', fullPage: true });
  await k.ctx.close();

  // ===================== KONTAKT =====================
  console.log('--- Kontakt ---');
  const c = await open(390);
  await go(c, 'Kontakt');
  ok(await pageBg(c) === 'rgb(95, 168, 168)', 'Kontakt har turkos bakgrund');
  const ci = await c.$$eval('[data-contact]', rs => rs.map(r => ({ k: r.getAttribute('data-contact'), t: r.innerText.replace(/\n/g, ' '), href: (r.querySelector('a') || {}).href || '', svg: !!r.querySelector('svg') })));
  ok(ci.length === 3 && ci.every(r => r.svg), 'Telefon, e-post och adress i kontaktkort med linjeikoner', ci.map(r => r.t).join(' | '));
  ok(ci[1].href === 'mailto:lias@hantverkeri.se', 'E-posten är en mailto-länk');
  ok(ci[0].t.includes('070-XXX XX XX') && ci[0].href === '', 'Telefon: platshållaren visas som text (ingen ring-länk förrän riktigt nummer finns)');
  const hours = await c.$$eval('.lh-hours tr', rs => rs.map(r => r.innerText.replace(/\t|\n/g, ' ').replace(/\s+/g, ' ').trim()));
  ok(hours.length === 7 && hours[0].startsWith('Måndag') && hours[0].endsWith('10–18') && hours[3].endsWith('10–20') && hours[5].endsWith('09–15') && hours[6].endsWith('Stängt'), 'Öppettider i tabell: Mån–Ons/Fre 10–18, Tor 10–20, Lör 09–15, Sön stängt', hours.join(' | '));
  ok(await c.$$eval('.lh-hours tr[data-today="true"]', r => r.length === 1 && r[0].innerText.includes('(idag)')), 'Dagens rad markeras med text "(idag)"');
  await c.click('button:has-text("Skicka meddelande")'); await c.waitForTimeout(200);
  const cerr = await c.$$eval('[data-err]', es => es.length);
  ok(cerr === 3, 'Tomt formulär: 3 felmeddelanden vid rätt fält', cerr);
  ok(await c.$$eval('.lh-field label', ls => ls.every(l => l.innerText.includes('*'))), 'Obligatoriska fält markerade med *');
  await c.fill('#kontakt-name', 'Per Persson'); await c.fill('#kontakt-email', 'per@exempel.se'); await c.fill('#kontakt-msg', 'Hej! Har ni tid i helgen?');
  await c.click('button:has-text("Skicka meddelande")'); await c.waitForTimeout(150);
  const sending = await c.$eval('form button[type=submit]', x => ({ t: x.innerText, d: x.disabled, busy: x.getAttribute('aria-busy') }));
  ok(sending.t === 'Skickar…' && sending.d && sending.busy === 'true', 'Skicka-knappen visar laddningsstatus', sending.t);
  await c.waitForTimeout(1100);
  const sent = await c.$eval('[data-sent]', x => x.innerText).catch(() => '');
  ok(sent.includes('Tack! Ditt meddelande är skickat.') && sent.includes('Demo'), 'Tydlig bekräftelse efter skickat (demo)', sent.replace(/\n/g, ' | '));
  ok(!EMOJI.test(await mainText(c)), 'Inga emojis på kontaktsidan');
  await c.screenshot({ path: '/tmp/t/s4-kontakt.png', fullPage: true });
  await c.click('text=Skriv ett nytt meddelande'); await c.waitForTimeout(150);
  ok(await c.$eval('#kontakt-name', x => x.value) === '', 'Nytt meddelande tömmer formuläret');
  await c.ctx.close();

  // ===================== GALLERI =====================
  console.log('--- Galleri ---');
  const g = await open(390);
  await go(g, 'Galleri');
  ok(await pageBg(g) === 'rgb(95, 168, 168)', 'Galleriet har turkos bakgrund');
  ok(await g.$$eval('.lh-chips button', bs => bs.map(x => x.innerText.trim()).join('|')) === 'Alla|Frisör|Keramik|Workshop', 'Filter: Alla, Frisör, Keramik, Workshop');
  const secs = async () => g.evaluate(() => ({ own: [...document.querySelectorAll('h2[data-section="egna"] + .lh-ggrid [data-gallery]')].map(x => x.getAttribute('data-gallery')), insp: [...document.querySelectorAll('h2[data-section="inspiration"] ~ .lh-ggrid [data-gallery]')].map(x => x.getAttribute('data-gallery')) }));
  let sx = await secs();
  ok(sx.own.join(',') === 'lia-1,lia-2' && sx.insp.length === 7, 'Alla: Lias egna bilder (2) separerade från inspirationsbilder (7)', JSON.stringify(sx));
  ok((await mainText(g)).includes('AI-genererade bilder som visar stämningen – inte riktiga kundresultat.'), 'Inspirationsbilderna förklaras i text');
  for (const [chip, own, insp] of [['frisor', 2, 3], ['keramik', 0, 3], ['workshop', 0, 1], ['alla', 2, 7]]) {
    await g.click(`[data-chip="${chip}"]`); await g.waitForTimeout(150); sx = await secs();
    ok(sx.own.length === own && sx.insp.length === insp, `Filter ${chip}: ${own} egna, ${insp} inspiration`, JSON.stringify(sx));
  }
  const tiles = await g.$$eval('[data-gallery]', ts => ts.map(t => { const r = t.querySelector('.lh-img').getBoundingClientRect(); return { id: t.getAttribute('data-gallery'), ratio: +(r.width / r.height).toFixed(2), cap: t.querySelector('.lh-gtile__cap').innerText.replace(/\n/g, ' / ') }; }));
  ok(new Set(tiles.map(t => t.ratio)).size === 1, 'Alla galleribilder har samma proportion', tiles[0].ratio);
  ok(tiles.filter(t => !t.id.startsWith('lia')).every(t => t.cap.includes('Inspirationsbild')) && tiles.filter(t => t.id.startsWith('lia')).every(t => !t.cap.includes('Inspirationsbild')), 'Bildtext med kategori, inspirationsbilder märkta', tiles.slice(0, 3).map(t => t.cap).join(' | '));
  await g.screenshot({ path: '/tmp/t/s4-galleri.png' });
  const nat = await g.$$eval('[data-gallery] img', is => is.filter(i => i.complete && i.naturalWidth > 0).length);
  ok(nat >= 2, 'Bilderna laddas', nat + ' laddade (resten laddas när man scrollar)');
  await g.click('[data-gallery="herrklipp"]'); await g.waitForTimeout(300);
  const lb = await g.$eval('[role="dialog"]', d => ({ t: d.innerText.replace(/\n/g, ' | '), modal: d.getAttribute('aria-modal') }));
  ok(lb.modal === 'true' && lb.t.includes('3 av 9') && lb.t.includes('Herrklippning') && lb.t.includes('Frisör') && lb.t.includes('Inspirationsbild (AI-genererad)'), 'Ljuslåda: bild, bildtext, kategori och märkning', lb.t.slice(0, 120));
  ok(await g.evaluate(() => document.activeElement.getAttribute('aria-label') === 'Stäng'), 'Fokus på Stäng');
  await g.screenshot({ path: '/tmp/t/s4-ljuslada.png' });
  await g.keyboard.press('ArrowRight'); await g.waitForTimeout(150);
  ok((await g.$eval('[role="dialog"]', d => d.innerText)).includes('4 av 9'), 'Pil höger → nästa bild');
  await g.click('[role="dialog"] button:has-text("Föregående")'); await g.waitForTimeout(150);
  ok((await g.$eval('[role="dialog"]', d => d.innerText)).includes('3 av 9'), 'Knappen Föregående fungerar');
  await g.keyboard.press('Escape'); await g.waitForTimeout(200);
  ok(!(await g.$('[role="dialog"]')) && await g.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-gallery') === 'herrklipp'), 'Escape stänger, fokus tillbaka på bilden');
  await g.click('button:has-text("Boka tid")'); await g.waitForTimeout(400);
  ok((await g.$eval('.lh-header__title', h => h.innerText)) === 'Boka tid', 'Galleriets "Boka tid" leder till bokningen');
  await g.ctx.close();

  // ===================== BREDDER OCH 130 % TEXT =====================
  console.log('--- Bredder och 130 % text ---');
  for (const [w, z] of [[320, 1], [375, 1], [390, 1], [430, 1], [320, 1.3], [390, 1.3]]) {
    const p = await open(w, z); const tag = `${w}px${z !== 1 ? ' + 130 % text' : ''}`;
    for (const tab of ['Boka', 'Kontakt', 'Galleri']) {
      await go(p, tab);
      const hs = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const clip = await p.$$eval('.lh-opt__name, .lh-opt__price, .lh-gtile__title, .lh-contact dd, .lh-hours td, .lh-hours th, .lh-steph__title', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.innerText.slice(0, 20)));
      ok(hs && clip.length === 0, `${tag} ${tab}: ingen sidledsscroll eller avklippt text`, clip.join(', '));
      if (w === 320 && z !== 1) await p.screenshot({ path: `/tmp/t/s4-${tab}-320-zoom.png` });
    }
    await p.ctx.close();
  }
  ok(outside.length === 0, 'Inga anrop till andra servrar', [...new Set(outside.map(u => new URL(u).host))].join(', '));
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
