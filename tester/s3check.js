// Steg 3: Shop och Keramikkurser – ny design
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
// Variant där alla omgångar av "Avancerad keramik" är fulla (för att testa Fullbokad)
const appFull = app.replace(/(['"])c-adv\1:\s*\[3\]/, "'c-adv': [6, 6, 6]");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (w, { zoom = 1, full = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, timezoneId: 'Europe/Stockholm' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
      if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
      if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: full ? appFull : app });
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
  const go = async (p, tab) => { await p.click(`nav >> text=${tab}`); await p.waitForTimeout(700); };
  const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const cols = p => p.evaluate(sel => { const g = document.querySelector(sel); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0; }, '.lh-pgrid');

  // ===================== KURSER =====================
  console.log('--- Kurser ---');
  const k = await open(390);
  await go(k, 'Kurser');
  ok((await k.$eval('header', h => h.innerText)).includes('Keramikkurser'), 'Headern visar Keramikkurser');
  ok(await k.$eval('main', m => getComputedStyle(m).backgroundColor) === 'rgb(95, 168, 168)', 'Kurssidan har turkos bakgrund');
  const chips = await k.$$eval('.lh-chips button', bs => bs.map(b => b.innerText.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  ok(chips.join('|') === 'Alla kurser*|Nybörjare|Fortsättning|Barn|Drop-in', 'Filterchips: Alla kurser (vald), Nybörjare, Fortsättning, Barn, Drop-in', chips.join(' | '));
  const cards = async () => k.$$eval('[data-course]', cs => cs.map(c => c.getAttribute('data-course')));
  ok((await cards()).length === 4, 'Alla 4 kurser visas från början');
  for (const [chip, want] of [['begin', 'c-begin'], ['adv', 'c-adv'], ['kids', 'c-kids'], ['drop', 'c-drop']]) {
    await k.click(`[data-chip="${chip}"]`); await k.waitForTimeout(100);
    const c = await cards(); ok(c.length === 1 && c[0] === want, `Filter ${chip} visar bara ${want}`, c.join(','));
  }
  ok(await k.$eval('[data-chip="drop"]', b => b.getAttribute('aria-pressed')) === 'true', 'Vald chip markeras med aria-pressed (inte bara färg)');
  await k.click('[data-chip="alla"]'); await k.waitForTimeout(100);
  const info = await k.$$eval('[data-course]', cs => cs.map(c => ({ id: c.getAttribute('data-course'), st: c.getAttribute('data-status'), icons: c.querySelectorAll('.lh-fact svg').length, dts: [...c.querySelectorAll('dt')].map(d => d.innerText).join(','), next: (c.querySelector('[data-next]') || {}).innerText || '', badge: (c.querySelector('.lh-badge') || {}).innerText || '', btn: c.querySelector('button').innerText, text: c.innerText })));
  ok(info.every(i => i.icons === 4 && i.dts === 'Längd,Schema,Platser,Pris'), 'Varje kurskort har Längd, Schema, Platser, Pris med linjeikoner', info.map(i => i.icons).join(','));
  ok(info.every(i => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(i.text)), 'Inga emojis i kurskorten');
  const byId = Object.fromEntries(info.map(i => [i.id, i]));
  ok(byId['c-begin'].st === 'low' && byId['c-begin'].badge.includes('Få platser kvar') && byId['c-begin'].next.includes('2 platser lediga'), 'Nybörjarkursen: "Få platser kvar" (2 lediga i första omgången, exempel)', byId['c-begin'].next.replace(/\n/g, ' '));
  ok(byId['c-adv'].st === 'ok' && byId['c-adv'].badge.includes('Platser kvar') && /Nästa start: \S+dag/.test(byId['c-adv'].next), 'Avancerad: "Platser kvar" och nästa start med datum', byId['c-adv'].next.replace(/\n/g, ' '));
  ok(byId['c-kids'].st === 'ok' && byId['c-kids'].next.includes('8 platser lediga'), 'Barnkursen: första omgången full → nästa möjliga start (8 lediga) visas', byId['c-kids'].next.replace(/\n/g, ' '));
  ok(byId['c-drop'].next.startsWith('Nästa tillfälle:') && byId['c-drop'].btn === 'Välj tillfälle', 'Drop-in: "Nästa tillfälle" och knappen "Välj tillfälle"');
  ok(byId['c-begin'].btn === 'Välj kursomgång', 'Kurs: knappen "Välj kursomgång"');
  const btnH = await k.$$eval('[data-course] button', bs => Math.min(...bs.map(b => b.getBoundingClientRect().height)));
  ok(btnH >= 48, 'Primära knappar minst 48 px höga', btnH + ' px');
  const chipH = await k.$$eval('.lh-chips button', bs => Math.min(...bs.map(b => b.getBoundingClientRect().height)));
  ok(chipH >= 44, 'Filterchips minst 44 px höga', chipH + ' px');
  const introC = await k.$eval('.lh-page__intro', e => [getComputedStyle(e).color, getComputedStyle(document.querySelector('main')).backgroundColor]);
  ok(contrast(...introC) >= 4.5, 'Introtexten på turkos har kontrast ≥ 4,5', contrast(...introC).toFixed(2));
  await k.screenshot({ path: '/tmp/t/s3-kurser-390.png' });
  await k.screenshot({ path: '/tmp/t/s3-kurser-390-full.png', fullPage: true });
  // Flödet: välj omgång – texterna ovanför ska synas på turkos
  await k.click('[data-course="c-adv"] button'); await k.waitForTimeout(500);
  const stepC = await k.evaluate(() => { const h = document.querySelector('main h2'); return [getComputedStyle(h).color, getComputedStyle(document.querySelector('main')).backgroundColor]; });
  ok(contrast(...stepC) >= 4.5, 'Steg "Välj kursomgång": rubrik på turkos har kontrast ≥ 4,5', contrast(...stepC).toFixed(2));
  await k.ctx.close();

  console.log('--- Kurser: fullbokad ---');
  const kf = await open(390, { full: true });
  await go(kf, 'Kurser');
  const adv = await kf.$eval('[data-course="c-adv"]', c => ({ st: c.getAttribute('data-status'), badge: c.querySelector('.lh-badge').innerText, btn: c.querySelector('button').innerText, dis: c.querySelector('button').disabled, text: c.innerText }));
  ok(adv.st === 'full' && adv.badge.includes('Fullbokad') && adv.btn === 'Fullbokad' && adv.dis && !adv.text.includes('Välj kursomgång'), 'Fullbokad kurs: märke "Fullbokad", knappen säger "Fullbokad" och är avstängd', adv.btn);
  ok(adv.text.includes('Alla kommande omgångar är fullbokade'), 'Fullbokad förklaras i text (inte bara färg)');
  await kf.screenshot({ path: '/tmp/t/s3-kurs-full.png' });
  await kf.ctx.close();

  // ===================== SHOP =====================
  console.log('--- Shop ---');
  const s = await open(390);
  await go(s, 'Shop');
  ok((await s.$eval('header', h => h.innerText)).includes('Keramikshop'), 'Headern visar Keramikshop');
  ok(await s.$eval('main', m => getComputedStyle(m).backgroundColor) === 'rgb(95, 168, 168)', 'Shoppen har turkos bakgrund');
  const schips = await s.$$eval('.lh-chips button', bs => bs.map(b => b.innerText.trim()));
  ok(schips.join('|') === 'Alla|Koppar|Skålar|Krukor|Present|Dekoration', 'Filter: Alla, Koppar, Skålar, Krukor, Present, Dekoration', schips.join(' | '));
  const prods = () => s.$$eval('[data-product]', ps => ps.map(p => p.getAttribute('data-product')));
  for (const [chip, want] of [['koppar', 's-cup'], ['skalar', 's-bowl'], ['krukor', 's-pot'], ['present', 's-set'], ['dekoration', 's-vase,s-plate'], ['alla', 's-cup,s-bowl,s-vase,s-plate,s-pot,s-set']]) {
    await s.click(`[data-chip="${chip}"]`); await s.waitForTimeout(100);
    const got = (await prods()).join(','); ok(got === want, `Filter ${chip}`, got);
  }
  const pc = await s.$$eval('[data-product]', ps => ps.map(p => ({ id: p.getAttribute('data-product'), name: p.querySelector('h2').innerText, price: p.querySelector('.lh-pcard__price').innerText, badge: (p.querySelector('.lh-badge') || {}).innerText || '', img: !!p.querySelector('img'), desc: p.innerText.includes('Perfekt för frukt'), h: Math.round(p.getBoundingClientRect().height) })));
  ok(pc.every(p => p.name && p.price.includes('kr') && p.badge && p.img), 'Varje produktkort har bild, namn, pris och lagerstatus');
  ok(!pc.some(p => p.desc), 'Längre beskrivning visas inte i kortet');
  ok(pc.find(p => p.id === 's-set').name === 'Presentlådan', 'Servis set heter nu Presentlådan');
  ok(!EMOJI.test(await s.$eval('main', m => m.innerText)), 'Inga emojis på shopsidan');
  ok(await cols(s) === 2, '390 px: två kolumner', await cols(s));
  ok(Math.max(...pc.map(p => p.h)) <= 420, 'Produktkorten är inte onödigt höga (≤ 420 px vid 390 px)', Math.max(...pc.map(p => p.h)) + ' px');
  const lowC = await s.$eval('[data-product="s-vase"] .lh-badge', b => [getComputedStyle(b).color, getComputedStyle(b.closest('.lh-card')).backgroundColor]);
  ok(contrast(...lowC) >= 4.5, '"Endast 1 kvar" i terrakotta med kontrast ≥ 4,5', contrast(...lowC).toFixed(2));
  const okC = await s.$eval('[data-product="s-cup"] .lh-badge', b => getComputedStyle(b).color);
  ok(okC === 'rgb(31, 61, 50)', '"I lager" i skogsgrönt', okC);
  const tgt = await s.$$eval('[data-buy], .lh-qtybtn, .lh-pcard__open', bs => Math.min(...bs.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width))));
  ok(tgt >= 44, 'Tryckytor i produktkorten minst 44 px', tgt + ' px');
  await s.screenshot({ path: '/tmp/t/s3-shop-390.png' });
  await s.screenshot({ path: '/tmp/t/s3-shop-390-full.png', fullPage: true });

  console.log('--- Produktdialog ---');
  const opener = s.locator('[data-product="s-plate"] .lh-pcard__open');
  await opener.click(); await s.waitForTimeout(300);
  const dlg = await s.$('[role="dialog"]');
  ok(!!dlg && (await dlg.getAttribute('aria-modal')) === 'true', 'Tryck på bilden öppnar en dialog (role=dialog, aria-modal)');
  const dt = await s.$eval('[role="dialog"]', d => d.innerText);
  ok(dt.includes('Handmålad tallrik') && dt.includes('Mat- och diskmaskinssäker') && dt.includes('320'), 'Dialogen visar namn, längre beskrivning och pris');
  ok(await s.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Stäng'), 'Fokus flyttas till Stäng-knappen');
  ok(!(await s.$('main div[style*="sticky"]')), 'Ingen kassaknapp ovanpå dialogen');
  await s.screenshot({ path: '/tmp/t/s3-dialog-390.png' });
  await s.click('[role="dialog"] [data-buy]'); await s.waitForTimeout(150);
  ok(await s.$('[role="dialog"] .lh-qty') !== null, 'Lägg i varukorg fungerar i dialogen (antalsväljare visas)');
  await s.keyboard.press('Tab'); await s.keyboard.press('Tab'); await s.keyboard.press('Tab'); await s.keyboard.press('Tab');
  ok(await s.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), 'Tab stannar inne i dialogen');
  await s.keyboard.press('Escape'); await s.waitForTimeout(200);
  ok(!(await s.$('[role="dialog"]')), 'Escape stänger dialogen');
  ok(await s.evaluate(() => document.activeElement && document.activeElement.classList.contains('lh-pcard__open') && document.activeElement.closest('[data-product="s-plate"]') !== null), 'Fokus går tillbaka till produkten');
  const bar = await s.$eval('main div[style*="sticky"] button', b => b.innerText).catch(() => '');
  ok(bar.includes('1 vara') && bar.includes('320'), 'Kassaknappen visar varan från dialogen', bar.replace(/ /g, ' '));
  const barBg = await s.$eval('main div[style*="sticky"]', d => getComputedStyle(d).backgroundColor);
  ok(barBg === 'rgb(47, 111, 112)', 'Kassafältet har mörk turkos (samma som headern)', barBg);

  console.log('--- Kassa ---');
  await s.click('text=Till kassan'); await s.waitForTimeout(300);
  const line = await s.$eval('[data-line="s-plate"]', l => ({ img: !!l.querySelector('img'), text: l.innerText }));
  ok(line.img && !EMOJI.test(line.text), 'Kassaraden visar produktbild i stället för emoji');
  const lab = await s.$eval('main label', l => [getComputedStyle(l).color, getComputedStyle(l.closest('.lh-card') || document.querySelector('main')).backgroundColor]);
  ok(contrast(...lab) >= 4.5, 'Formuläretiketter har kontrast ≥ 4,5 mot sin bakgrund', contrast(...lab).toFixed(2));
  await s.click('button:has-text("Betala ·")'); await s.waitForTimeout(200);
  const errC = await s.evaluate(() => { const e = document.querySelector('[data-err]'); if (!e) return null; const bgEl = e.closest('.lh-card') || document.querySelector('main'); return [getComputedStyle(e).color, getComputedStyle(bgEl).backgroundColor]; });
  ok(errC && contrast(...errC) >= 4.5, 'Felmeddelanden på turkos har kontrast ≥ 4,5', errC && contrast(...errC).toFixed(2));
  await s.screenshot({ path: '/tmp/t/s3-kassa-390.png', fullPage: true });
  await s.ctx.close();

  // ===================== BREDDER OCH TEXTSTORLEK =====================
  console.log('--- Bredder och 130 % text ---');
  for (const [w, z] of [[320, 1], [375, 1], [390, 1], [430, 1], [320, 1.3], [390, 1.3]]) {
    const p = await open(w, { zoom: z });
    const tag = `${w}px${z !== 1 ? ' + 130 % text' : ''}`;
    await go(p, 'Shop');
    const c = await cols(p);
    if (z === 1) ok(w === 320 ? c === 1 : c === 2, `${tag}: shoppen har ${w === 320 ? 'en kolumn' : 'två kolumner'}`, c);
    ok(await noHScroll(p), `${tag}: shop utan sidledsscroll`);
    const clip = await p.$$eval('[data-product] h2, [data-product] .lh-pcard__price, [data-buy]', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).length);
    ok(clip === 0, `${tag}: inga avklippta namn, priser eller knappar i shoppen`, clip);
    if (w === 320 && z !== 1) await p.screenshot({ path: '/tmp/t/s3-shop-320-zoom.png' });
    await go(p, 'Kurser');
    ok(await noHScroll(p), `${tag}: kurser utan sidledsscroll`);
    const cclip = await p.$$eval('[data-course] h2, [data-course] dd, [data-course] button', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).length);
    ok(cclip === 0, `${tag}: inga avklippta texter i kurskorten`, cclip);
    if (w === 320 && z !== 1) await p.screenshot({ path: '/tmp/t/s3-kurser-320-zoom.png' });
    // Menyn täcker inte sista innehållet
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(150);
    const cover = await p.evaluate(() => { const last = [...document.querySelectorAll('[data-course]')].pop().getBoundingClientRect(); const nav = document.querySelector('nav').getBoundingClientRect(); return last.bottom <= nav.top + 1; });
    ok(cover, `${tag}: menyn täcker inte sista kurskortet`);
    await p.ctx.close();
  }
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
