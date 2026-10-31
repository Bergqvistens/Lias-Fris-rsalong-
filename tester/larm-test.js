// 31 okt 2026: larmet (ljud + notis) sparas i telefonen. Ljudet startar vid första tryck var som helst (webbläsarens regel).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
(async () => {
  // Som i mobilen: ljud kräver tryck på sidan
  const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.addInitScript(() => {
    window.__notifs = [];
    const N = function (title, opts) { window.__notifs.push(title); };
    N.permission = 'granted'; N.requestPermission = () => Promise.resolve('granted');
    window.Notification = N;
    // Testwebbläsaren (headless Chromium) spelar ljud utan tryck, till skillnad från mobilen. Här efterliknas mobilens regel:
    // AudioContext är avstängd tills användaren tryckt/klickat på sidan. Ljud som faktiskt spelas räknas i window.__ljud.
    window.__gesture = false; window.__ljud = 0;
    ['pointerdown', 'keydown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, e => { if (e.isTrusted) window.__gesture = true; }, true));
    const Real = window.AudioContext;
    class Mobil extends Real {
      get state() { return window.__gesture ? super.state : 'suspended'; }
      resume() { return window.__gesture ? super.resume() : Promise.resolve(); }
      createOscillator() { if (this.state === 'running') window.__ljud++; return super.createOscillator(); }
    }
    window.AudioContext = Mobil;
  });
  await ctx.route('**/*', r => { const u = r.request().url().split('#')[0];
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ body: shim, contentType: 'application/javascript' });
    if (u.endsWith('/app.js')) return r.fulfill({ body: app, contentType: 'application/javascript' });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    return r.abort(); });
  let p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
  await p.goto('https://lias.test/');
  await p.waitForSelector('text=Jag förstår och accepterar', { timeout: 15000 });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar');
  await p.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.click('footer >> text=Admin'); await p.waitForTimeout(400);
  await p.fill('input[type=email]', 'lia@demo.se'); await p.fill('input[type=password]', 'demo1234'); await p.click('button:has-text("Logga in")'); await p.waitForTimeout(1500);
  const state = () => p.evaluate(() => ({ larm: (document.querySelector('[data-larm]') || {}).dataset ? document.querySelector('[data-larm]') && document.querySelector('[data-larm]').dataset.larm : null, knapp: !!document.querySelector('[data-larm-pa]'), text: (document.querySelector('[data-larm]') || document.querySelector('[data-larm-pa]').parentElement).innerText.replace(/\s+/g, ' ').trim(), saved: localStorage.getItem('lias_larm') }));
  const book = async () => {
    const k = await ctx.newPage(); await k.goto('https://lias.test/'); await k.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    await k.click('nav >> text=Boka'); await k.click('[data-cat="Klippning"]'); await k.click('[data-service="klipp-30"]'); await k.click('text=Fortsätt'); await k.waitForTimeout(400);
    await (await k.$$('.lh-day'))[2].click(); await k.waitForTimeout(400);
    const t = await k.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
    await k.click(`.lh-time:text-is("${t[Math.floor(Math.random() * t.length)]}")`); await k.click('text=Fortsätt');
    await k.fill('input[type=text]', 'Kund Test'); await k.fill('input[type=tel]', '0701234567'); await k.fill('input[type=email]', 'k@t.se');
    await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900); await k.close();
  };
  const reopen = async () => { await p.close(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); q.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); }); await q.goto('https://lias.test/'); await q.waitForSelector('.lh-splash', { state: 'detached', timeout: 10000 }).catch(() => {}); await q.evaluate(() => { const b = [...document.querySelectorAll('footer button')].find(x => x.innerText.trim() === 'Admin'); b && b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await q.waitForTimeout(1500); return q; };
  const audio = () => p.evaluate(() => { try { return AUDIO_CTX ? AUDIO_CTX.state : 'ingen'; } catch (e) { return 'okänd'; } });

  // --- 1. Första gången ---
  let s = await state();
  ok(s.knapp && s.saved === null && s.text.includes('Valet sparas i den här telefonen'), 'Första gången: knappen "Slå på larm" och texten att valet sparas', s.text);
  await p.click('[data-larm-pa]'); await p.waitForTimeout(400);
  s = await state();
  ok(s.saved === 'pa' && s.larm === 'pa' && s.text.startsWith('🔔 Larmet är på (ljud + notis).'), 'Efter tryck: larmet på, valet sparat', s.text);

  // --- 2. Ny gång i admin (omladdning) ---
  p = await reopen();
  s = await state();
  ok(!s.knapp && s.larm === 'vantar' && s.text.startsWith('🔔 Larmet är på. Ljudet startar när du trycker någonstans på sidan. Skärmnotiser fungerar redan.'), 'Nästa gång: larmet redan på, ingen knapp att leta efter', s.text);
  // ny bokning innan tryck: notis kommer ändå
  await book(); await p.waitForTimeout(2000);
  ok((await p.evaluate(() => window.__notifs.length)) === 1 && (await p.evaluate(() => window.__ljud)) === 0, 'Ny bokning innan tryck: skärmnotisen kommer ändå (ljudet kan inte spelas än)');
  // tryck var som helst
  await p.click('h1'); await p.waitForTimeout(500);
  s = await state();
  ok(s.larm === 'pa' && s.text.startsWith('🔔 Larmet är på (ljud + notis).'), 'Första trycket var som helst (rubriken): ljudet är igång', s.text.slice(0, 50));
  await book(); await p.waitForTimeout(2000);
  ok((await p.evaluate(() => window.__notifs.length)) === 2 && (await p.evaluate(() => window.__ljud)) === 3, 'Ny bokning efter tryck: notis + ljud (3 toner)', await p.evaluate(() => window.__ljud));

  // --- 3. Stäng av sparas ---
  await p.click('[data-larm-av]'); await p.waitForTimeout(300);
  s = await state();
  ok(s.knapp && s.saved === 'av', 'Stäng av larmet: knappen kommer tillbaka, valet "av" sparat');
  p = await reopen();
  s = await state();
  ok(s.knapp && !s.larm, 'Efter omladdning: larmet fortfarande av');
  const n0 = await p.evaluate(() => window.__notifs.length);
  await book(); await p.waitForTimeout(2000);
  ok((await p.evaluate(() => window.__notifs.length)) === n0, 'Larmet av: ingen notis vid ny bokning');
  // knappar
  await p.click('[data-larm-pa]'); await p.waitForTimeout(300);
  const bh = await p.$$eval('[data-testa-ljud], [data-larm-av]', bs => bs.map(b => b.getBoundingClientRect().height));
  ok(bh.length === 2 && bh.every(h => h >= 44), 'Knapparna Testa ljudet och Stäng av larmet är minst 44 px höga', bh.join(', '));
  await p.locator('[data-larm]').screenshot({ path: '/tmp/t/larm.png' });
  ok(errs.length === 0, 'Inga JavaScript-fel', errs.join(' | ').slice(0, 300));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
