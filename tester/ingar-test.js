// 30 okt 2026: "Detta ingår inte" och "Kan kosta extra" i egen färg (Tommys önskemål). Bottenfärg får kort namn.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const L = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const EXCL_B = 'Detta ingår inte: Klippning eller slingor. Boka till klippning om så önskas.', EXTRA_B = 'Kan kosta extra: Material, beroende på hårets tjocklek.';
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  const open = async (url = 'https://lias.test/') => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    await p.clock.install({ time: new Date('2026-11-02T08:00:00+01:00').getTime() });
    await p.goto(url); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
    }
    await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    return p;
  };
  const p = await open();
  await p.click('nav >> text=Boka'); await p.waitForTimeout(300);

  // --- 1. Tjänstelistan ---
  const all = {};
  for (const cat of ['Klippning', 'Färgbehandling', 'Permanent', 'Styling, tvätt & föning', 'Hårbottenmassage', 'Frans och/eller brynfärg']) {
    await p.click(`[data-cat="${cat}"]`); await p.waitForTimeout(150);
    Object.assign(all, await p.$$eval('[data-svc-row]', rs => Object.fromEntries(rs.map(r => [r.dataset.svcRow, { name: r.querySelector('.lh-opt__name').innerText, excl: (r.querySelector('[data-excl]') || {}).innerText || '', extra: (r.querySelector('[data-extra]') || {}).innerText || '' }]))));
  }
  const withExcl = Object.keys(all).filter(k => all[k].excl), withExtra = Object.keys(all).filter(k => all[k].extra);
  ok(Object.keys(all).length === 17, 'Alla 17 tjänster genomgångna', Object.keys(all).length);
  ok(withExcl.join(',') === 'klipp-30,farg-botten,harbotten', '"Detta ingår inte" på exakt tre tjänster (Tommys godkända lista)', withExcl.join(', '));
  ok(withExtra.join(',') === 'farg-botten,farg-180', '"Kan kosta extra" på Bottenfärg och Färgbehandling 3 tim', withExtra.join(', '));
  ok(all['farg-botten'].name === 'Bottenfärg/utväxt' && all['farg-botten'].excl === EXCL_B && all['farg-botten'].extra === EXTRA_B, 'Bottenfärg: kort namn + båda rutorna', JSON.stringify(all['farg-botten']));
  ok(all['klipp-30'].excl === 'Detta ingår inte: Schamponering eller längre konsultation.' && all['harbotten'].excl === 'Detta ingår inte: Andra behandlingar, t.ex. klippning. De bokas separat.' && all['farg-180'].extra === 'Kan kosta extra: Material.', 'Texterna för Herrklippning 30 min, Hårbottenmassage och Färg 3 tim');
  await p.click('[data-cat="Färgbehandling"]'); await p.waitForTimeout(150);
  const st = await p.evaluate(() => { const g = (sel) => { const e = document.querySelector(sel), s = getComputedStyle(e), b = getComputedStyle(e.querySelector('strong')); return { bg: s.backgroundColor, fg: s.color, bc: s.borderTopColor, fw: parseInt(b.fontWeight), svg: !!e.querySelector('svg') }; }; return { ex: g('[data-excl="farg-botten"]'), xt: g('[data-extra="farg-botten"]') }; });
  ok(contrast(st.ex.fg, st.ex.bg) >= 4.5 && contrast(st.xt.fg, st.xt.bg) >= 4.5, 'Texten i rutorna är lätt att läsa (kontrast ≥ 4,5)', contrast(st.ex.fg, st.ex.bg).toFixed(1) + ' / ' + contrast(st.xt.fg, st.xt.bg).toFixed(1));
  ok(st.ex.bg !== st.xt.bg && st.ex.fg !== st.xt.fg && st.ex.svg && st.xt.svg, '"Ingår inte" (rostbrun) och "Kan kosta extra" (lugnare) har olika färg och ikon', st.ex.bg + ' / ' + st.xt.bg);
  ok(st.ex.fw >= 700 && st.xt.fw >= 700, 'Orden "Detta ingår inte:" och "Kan kosta extra:" är fetmarkerade');
  await p.locator('[data-svc-row="farg-botten"]').screenshot({ path: '/tmp/t/ingar-lista.png' });

  // --- 2. Mer info ---
  await p.click('[data-info="farg-botten"]'); await p.waitForTimeout(250);
  const mi = await p.$eval('[data-dialog="tjanst"]', d => ({ h: d.querySelector('h2').innerText, ex: (d.querySelector('[data-excl]') || {}).innerText, xt: (d.querySelector('[data-extra]') || {}).innerText, desc: d.querySelector('.lh-svcinfo__desc').innerText }));
  ok(mi.h === 'Bottenfärg/utväxt' && mi.ex === EXCL_B && mi.xt === EXTRA_B && mi.desc.startsWith('Passar dig som har en utväxt'), 'Mer info: kort rubrik, båda rutorna, Lias beskrivning kvar', mi.h);
  await p.screenshot({ path: '/tmp/t/ingar-merinfo.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  // --- 3. Välj och boka ---
  await p.click('[data-service="farg-botten"]'); await p.waitForTimeout(150);
  const sum1 = await p.$eval('[data-summary="tjanster"]', e => e.innerText);
  ok(sum1.includes('Bottenfärg/utväxt') && sum1.includes(EXCL_B) && sum1.includes(EXTRA_B), 'Sammanfattningen "Din bokning" visar rutorna');
  await p.click('text=Fortsätt'); await p.waitForTimeout(400);
  await (await p.$$('.lh-day'))[1].click(); await p.waitForTimeout(400);
  await p.click('.lh-time:text-is("10:00")'); await p.click('text=Fortsätt'); await p.waitForTimeout(300);
  const s3 = await p.$eval('[data-summary="bokning"]', e => e.innerText);
  ok(s3.includes(EXCL_B) && s3.includes(EXTRA_B), 'Steg 3 (innan bokning): rutorna syns');
  await p.fill('input[type=text]', 'Tommy Bergqvist'); await p.fill('input[type=tel]', '073-634 49 54'); await p.fill('input[type=email]', 't@test.se');
  await p.click('button:has-text("Boka ·")'); await p.waitForTimeout(900);
  const dn = await p.evaluate(() => ({ t: document.querySelector('.lh-done').innerText, sms: [...document.querySelectorAll('[data-sms]')].map(e => e.innerText).join(' || '), link: (document.querySelector('[data-sms-link]') || {}).href }));
  ok(dn.t.includes(EXCL_B) && dn.t.includes(EXTRA_B), 'Bekräftelsen visar rutorna');
  ok(dn.sms.includes('(Bottenfärg/utväxt)') && !/ingår ej/.test(dn.sms), 'Sms:et använder det korta namnet', dn.sms.slice(0, 140));
  const db = await p.evaluate(() => JSON.parse(localStorage.getItem('lias_demo_db')));
  ok(db.bookings[0].service_names === 'Bottenfärg/utväxt', 'Bokningen sparas med det korta namnet', db.bookings[0].service_names);

  // --- 4. Lias kort i admin ---
  await p.click('.lh-done button:has-text("Klar")'); await p.waitForTimeout(300);
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const ad = await p.$eval('[data-booking]', e => ({ svc: e.querySelector('.lh-cut__svc').innerText.replace(/\s/g, ' '), ex: (e.querySelector('[data-excl]') || {}).innerText, xt: (e.querySelector('[data-extra]') || {}).innerText }));
  ok(ad.svc === 'Bottenfärg/utväxt · 1 000,00 kr' && ad.ex === EXCL_B && ad.xt === EXTRA_B, 'Lias bokningskort: kort namn + rutorna', ad.svc + ' / ' + ad.ex + ' / ' + ad.xt + ' / ' + JSON.stringify(await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lias_demo_db')); return d.bookings.map(b => b.service_ids); })));
  await p.locator('[data-booking]').first().screenshot({ path: '/tmp/t/ingar-admin.png' });

  // --- 5. Kundens bekräftelsesida ---
  const c = await open(dn.link);
  await c.waitForSelector('[data-bekraftelse]', { timeout: 5000 }).catch(() => {});
  const cf = await c.$eval('[data-bekraftelse]', e => e.innerText).catch(() => '');
  ok(cf.includes(EXCL_B) && cf.includes(EXTRA_B), 'Bekräftelsesidan (länken i sms:et) visar rutorna');
  await c.close();

  // --- 6. Två personer: rutorna säger vilken tjänst ---
  const g = await open();
  await g.click('nav >> text=Boka'); await g.waitForTimeout(300);
  await g.click('[data-person="0"] [data-cat="Klippning"]'); await g.click('[data-person="0"] [data-service="klipp-30"]');
  await g.click('[data-add-person]'); await g.waitForTimeout(200);
  await g.click('[data-person="1"] [data-cat="Hårbottenmassage"]'); await g.click('[data-person="1"] [data-service="harbotten"]');
  const sum2 = await g.$$eval('[data-summary="tjanster"] [data-excl]', es => es.map(e => e.innerText));
  ok(sum2.join('|') === 'Detta ingår inte (Klippning/Herrklippning 30 min): Schamponering eller längre konsultation.|Detta ingår inte (Hårbottenmassage): Andra behandlingar, t.ex. klippning. De bokas separat.', 'Flera personer: varje ruta säger vilken tjänst den gäller', sum2.join(' | '));

  // --- 7. Liten skärm + stor text ---
  await g.setViewportSize({ width: 320, height: 640 }); await g.evaluate(() => { document.documentElement.style.zoom = 1.3; }); await g.waitForTimeout(200);
  await g.click('[data-person="0"] [data-cat="Färgbehandling"]'); await g.waitForTimeout(200);
  const ov = await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.lh-note')].every(e => e.scrollWidth <= e.clientWidth + 1));
  ok(ov, '320 px + 130 % text: rutorna ryms, ingen text klipps');

  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
