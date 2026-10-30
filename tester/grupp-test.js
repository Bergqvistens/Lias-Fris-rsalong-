// Flerpersonsbokning: en tjänst per person (Lias tjänster sedan 29 okt), förnamn, max 4, tider efter varandra (en frisör)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const page = fs.readFileSync('/tmp/t/run.html', 'utf8'), shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8'), app = fs.readFileSync('/tmp/t/app.js', 'utf8');
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) });
    if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
    return r.abort();
  });
  const open = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errs.push(x.text()); });
    p.on('dialog', d => d.accept());
    await p.goto('https://lias.test/'); await p.waitForTimeout(700);
    if (await p.$('text=Jag förstår och accepterar')) {
      await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
    }
    return p;
  };
  const main = p => p.evaluate(() => document.querySelector('main').innerText.replace(/ /g, ' '));
  const bar = p => p.evaluate(() => { const d = [...document.querySelectorAll('main div')].find(x => getComputedStyle(x).position === 'sticky'); const b = d.querySelector('button'); return { t: b.innerText.replace(/ /g, ' '), dis: b.disabled }; });
  const pressed = (p, i) => p.$$eval(`[data-person="${i}"] [data-service][aria-pressed="true"]`, bs => bs.map(b => b.getAttribute('data-service')));
  const times = p => p.$$eval('.lh-time', bs => bs.map(b => b.innerText.trim()));

  console.log('--- En person: en tjänst ---');
  const k = await open();
  await k.click('nav >> text=Boka'); await k.waitForTimeout(300);
  let b = await bar(k); ok(b.dis && b.t === 'Välj en tjänst', 'Utan tjänst: Fortsätt avstängd ("Välj en tjänst")', b.t);
  ok((await k.$$('[data-service]')).length === 0 && (await k.$$('[data-person="0"] .lh-catbtn')).length === 6, 'Först väljs en av Lias sex kategorier');
  await k.click('[data-person="0"] [data-cat="Klippning"]');
  ok((await k.$$eval('[data-person="0"] [role="radio"]', r => r.map(x => x.getAttribute('data-service')))).join(',') === 'klipp-45,klipp-lyx,klipp-30,putsning', 'Klippning: fyra tjänster att välja mellan (radioknappar)');
  ok((await k.$$('[data-person="0"] [data-service]:not([role="radio"])')).length === 0, 'Inga tillägg: en tjänst per person, som i Valei');
  await k.click('[data-service="klipp-45"]'); await k.click('[data-service="klipp-lyx"]'); await k.click('[data-service="putsning"]');
  ok((await pressed(k, 0)).join(',') === 'putsning', 'Bara en tjänst kan vara vald (sista valet gäller)', (await pressed(k, 0)).join(','));
  await k.click('[data-service="klipp-30"]');
  b = await bar(k); ok(!b.dis && b.t.includes('30 min') && b.t.includes('från') && b.t.includes('500'), 'Knappen: Klippning 30 min, från 500 kr', b.t);
  await k.click('[data-person="0"] [data-cat="Permanent"]');
  ok((await pressed(k, 0)).length === 0 && !(await k.$('[data-service="klipp-30"]')) && !!(await k.$('[data-service="perm-kort"]')), 'Byte till Permanent nollställer valet; klippningarna försvinner');
  await k.click('[data-person="0"] [data-cat="Hårbottenmassage"]');
  ok((await k.$$eval('[data-person="0"] [data-service]', r => r.map(x => x.getAttribute('data-service')))).join(',') === 'harbotten', 'Hårbottenmassage: en tjänst');
  ok(!(await k.$('#boka-p0-namn')), 'En person: inget förnamnsfält (kontaktnamnet räcker)');

  console.log('--- Flera personer ---');
  await k.click('[data-person="0"] [data-cat="Klippning"]'); await k.click('[data-service="klipp-30"]');
  await k.click('[data-add-person]'); await k.waitForTimeout(150);
  ok((await k.$$('[data-person]')).length === 2 && !!(await k.$('#boka-p0-namn')) && !!(await k.$('#boka-p1-namn')), 'Lägg till person: två personkort, förnamn för båda');
  b = await bar(k); ok(b.dis && b.t === 'Välj tjänst för alla', 'Person 2 utan tjänst: Fortsätt avstängd', b.t);
  await k.click('[data-person="1"] [data-cat="Frans och/eller brynfärg"]'); await k.click('[data-person="1"] [data-service="bryn"]');
  await k.click('[data-add-person]'); await k.waitForTimeout(150);
  await k.click('[data-person="2"] [data-cat="Styling, tvätt & föning"]'); await k.click('[data-person="2"] [data-service="tvatt-fon"]');
  ok((await pressed(k, 0)).join(',') === 'klipp-30' && (await pressed(k, 1)).join(',') === 'bryn' && (await pressed(k, 2)).join(',') === 'tvatt-fon', 'Varje person har sina egna val');
  await k.click('[data-add-person]'); await k.waitForTimeout(150);
  ok(!(await k.$('[data-add-person]')) && (await main(k)).includes('Högst 4 personer per bokning.'), 'Max 4 personer: knappen försvinner och det förklaras');
  await k.click('[data-remove="3"]'); await k.waitForTimeout(150);
  ok((await k.$$('[data-person]')).length === 3 && !!(await k.$('[data-add-person]')), 'Ta bort person fungerar');
  b = await bar(k); ok(!b.dis && b.t.includes('90 min') && b.t.includes('från 1 100'), 'Summa 3 personer: 30+30+30 = 90 min, från 500+200+400 = 1 100 kr', b.t);
  await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  const nameErr = await k.$$eval('[data-person] [data-err]', e => e.map(x => x.innerText));
  ok((await main(k)).includes('STEG 1 AV 3') && nameErr.length === 3 && nameErr.every(t => t.includes('Skriv förnamnet')), 'Utan förnamn: stannar i steg 1, fel vid varje namnfält', nameErr.length + ' fel');
  await k.fill('#boka-p0-namn', 'Kalle'); await k.fill('#boka-p1-namn', 'Anna'); await k.fill('#boka-p2-namn', 'Lisa');
  const sum = await k.$eval('[data-summary="tjanster"]', x => x.innerText.replace(/\n/g, ' | '));
  ok(sum.includes('Kalle:') && sum.includes('Anna:') && sum.includes('Lisa:') && sum.includes('efter varandra'), 'Sammanfattning per person', sum);
  await k.screenshot({ path: '/tmp/t/g-steg1.png', fullPage: true });
  await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  ok((await main(k)).includes('STEG 2 AV 3') && (await main(k)).includes('3 personer efter varandra · 90 min'), 'Steg 2: "3 personer efter varandra · 90 min"');

  console.log('--- En frisör: kedjan måste vara ledig ---');
  // Först bokar en annan kund 13:00 (Klippning 30 min) samma dag
  const o = await open();
  await o.click('nav >> text=Boka'); await o.click('[data-cat="Klippning"]'); await o.click('[data-service="klipp-30"]'); await o.click('text=Fortsätt');
  await (await o.$$('.lh-day'))[2].click(); await o.waitForTimeout(600);
  const dayLabel = await o.$eval('.lh-day[aria-pressed="true"]', x => x.innerText.replace(/\n/g, ' '));
  const oT = await times(o);
  ok(oT.includes('13:00'), 'Testdagen har 13:00 ledigt', dayLabel);
  await o.click('.lh-time:text-is("13:00")'); await o.click('text=Fortsätt');
  await o.fill('input[type=text]', 'Annan Kund'); await o.fill('input[type=tel]', '0709998877'); await o.fill('input[type=email]', 'a@k.se');
  await o.click('button:has-text("Boka ·")'); await o.waitForTimeout(900);
  ok((await main(o)).includes('Din tid är bokad!'), 'Annan kund bokade 13:00–13:30');
  await o.close();
  await (await k.$$('.lh-day'))[2].click(); await k.waitForTimeout(600);
  const g = await times(k);
  const blocked = g.filter(t => hm(t) < hm('13:30') && hm(t) + 90 > hm('13:00'));
  ok(blocked.length === 0 && g.includes('11:30') && !g.includes('11:45') && g.includes('13:30'), 'Starttider där kedjan (90 min) krockar med 13:00–13:30 visas inte; 11:30 och 13:30 går, 11:45 inte', `11:30 ${g.includes('11:30')}, 11:45 ${g.includes('11:45')}, 13:15 ${g.includes('13:15')}, 13:30 ${g.includes('13:30')}`);
  const last = g[g.length - 1];
  const close = 17 * 60;   // tis–fre 09–17
  ok(hm(last) + 90 <= close && hm(last) + 105 > close, 'Sista starttiden låter hela kedjan sluta senast 17:00', `sista ${last}, slut ${fmt(hm(last) + 90)}, stänger ${fmt(close)}`);
  await k.click('.lh-time:text-is("11:30")'); await k.waitForTimeout(150);
  const ch = await k.$eval('[data-chain]', x => x.innerText.replace(/\n/g, ' | '));
  ok(ch.includes('11:30–12:00 Kalle: Klippning/Herrklippning 30 min') && ch.includes('12:00–12:30 Anna: Färg och form av bryn.') && ch.includes('12:30–13:00 Lisa: Tvätt & fön'), 'Tiderna läggs efter varandra: 11:30–12:00, 12:00–12:30, 12:30–13:00', ch);
  await k.screenshot({ path: '/tmp/t/g-steg2.png', fullPage: true });
  await k.click('text=Fortsätt'); await k.waitForTimeout(300);
  ok((await k.$eval('[data-summary="bokning"]', x => x.innerText)).includes('12:30–13:00'), 'Steg 3 visar varje persons tid');
  await k.fill('input[type=text]', 'Eva Ek'); await k.fill('input[type=tel]', '0701112233'); await k.fill('input[type=email]', 'eva@ek.se');
  await k.click('button:has-text("Boka ·")'); await k.waitForTimeout(900);
  const d = await main(k);
  ok(d.includes('3 tider är bokade!') && d.includes('11:30–12:00 Kalle: Klippning/Herrklippning 30 min') && d.includes('12:30–13:00 Lisa: Tvätt & fön') && d.includes('från 1 100'), 'Bekräftelse: 3 tider med namn och "från"-totalpris');
  const sms = await k.$eval('[data-sms="bekraftelse"]', x => x.innerText).catch(() => '');
  ok(sms.includes('kl 11:30 Kalle') && sms.includes('kl 12:00 Anna') && sms.includes('kl 12:30 Lisa'), 'Sms (demo) listar alla med tid', sms.replace(/\n/g, ' '));
  await k.screenshot({ path: '/tmp/t/g-klar.png', fullPage: true });

  console.log('--- Lia i admin ---');
  const lia = await open();
  await lia.click('footer >> text=Admin'); await lia.waitForTimeout(300);
  await lia.fill('input[type=email]', 'lia@demo.se'); await lia.fill('input[type=password]', 'demo1234'); await lia.click('button:has-text("Logga in")'); await lia.waitForTimeout(1200);
  const cards = await lia.$$eval('[data-booking]', cs => cs.map(c => c.innerText.replace(/\n/g, ' | ')));
  const group = cards.filter(c => c.includes('Eva Ek'));
  ok(group.length === 3 && group[0].includes('Klippning: Kalle 11:30–12:00') && group[1].includes('Klippning: Anna 12:00–12:30') && group[2].includes('Klippning: Lisa 12:30–13:00'), 'Lia ser tre kort i tidsordning med vem som ska klippas', group.map(c => c.split(' | ').slice(0, 2).join(' ')).join(' || '));
  await lia.locator('[data-booking]', { hasText: /Klippning: Anna \d/ }).locator('button:has-text("Avboka")').click(); await lia.waitForSelector('[data-confirm]'); await lia.click('[data-confirm] [data-svar="ja"]'); /* 30 okt: appens egen fråga-ruta */ await lia.waitForTimeout(600);
  ok((await lia.$$eval('[data-booking]', cs => cs.filter(c => c.innerText.includes('Eva Ek')).length)) === 2, 'Lia kan avboka en person (Anna); övriga ligger kvar');
  await lia.screenshot({ path: '/tmp/t/g-admin.png', fullPage: true });

  console.log('--- Smal skärm, 130 % text ---');
  const z = await open();
  await z.setViewportSize({ width: 320, height: 700 }); await z.evaluate(() => { document.documentElement.style.zoom = 1.3; });
  await z.click('nav >> text=Boka'); await z.waitForTimeout(300);
  await z.click('[data-cat="Färgbehandling"]'); await z.click('[data-service="farg-150"]'); await z.click('[data-add-person]'); await z.waitForTimeout(150);
  await z.click('[data-person="1"] [data-cat="Permanent"]');
  const hs = await z.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const clip = await z.$$eval('.lh-catbtn__name, .lh-opt__name, .lh-opt__price, .lh-person__head h3', es => es.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.innerText));
  ok(hs && clip.length === 0, '320 px + 130 % text: ingen sidledsscroll eller avklippt text med två personer', clip.join(', '));
  await z.screenshot({ path: '/tmp/t/g-320-zoom.png', fullPage: true });
  ok(errs.length === 0, 'Inga JavaScript-fel (demo)', errs.join(' | ').slice(0, 300));
  await ctx.close();

  console.log('--- Supabase-läge mot riktig PostgreSQL ---');
  const { newCtx, admin } = require('/tmp/t/e2e.js');
  admin("delete from bookings;");
  const s = await newCtx(browser);
  await s.click('nav >> text=Boka');
  await s.click('[data-cat="Färgbehandling"]'); await s.click('[data-service="nyansering"]');
  await s.click('[data-add-person]'); await s.click('[data-person="1"] [data-cat="Klippning"]'); await s.click('[data-person="1"] [data-service="putsning"]');
  await s.fill('#boka-p0-namn', 'Maja'); await s.fill('#boka-p1-namn', 'Leo');
  await s.click('text=Fortsätt'); await (await s.$$('.lh-day'))[1].click(); await s.waitForTimeout(700);
  const st = await s.$$eval('.lh-time', bs => bs.map(b => b.innerText.trim()));
  await s.click(`.lh-time:text-is("${st[0]}")`); await s.click('text=Fortsätt');
  await s.fill('input[type=text]', 'Pia Persson'); await s.fill('input[type=tel]', '0702223344'); await s.fill('input[type=email]', 'pia@p.se');
  await s.click('button:has-text("Boka ·")'); await s.waitForTimeout(1500);
  ok((await s.evaluate(() => document.querySelector('main').innerText)).includes('2 tider är bokade!'), 'Supabase-läge: kunden får "2 tider är bokade!"');
  const rows = admin("select string_agg(person_name||' '||to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI')||'-'||to_char(ends_at at time zone 'Europe/Stockholm','HH24:MI')||' '||service_names||' '||price, ' | ' order by starts_at) || ' / grupper ' || count(distinct group_id) from bookings where customer_name='Pia Persson'");
  const t0 = hm(st[0]);
  ok(rows === `Maja ${fmt(t0)}-${fmt(t0 + 60)} Nyansering 1100 | Leo ${fmt(t0 + 60)}-${fmt(t0 + 75)} Putsning, kort hår med maskinklippn. sidor & nacke. 250 / grupper 1`, 'Databasen: två rader efter varandra, rätt namn, tjänster och priser, samma grupp', rows);
  ok(s.errs.length === 0, 'Supabase-läge: inga JavaScript-fel', s.errs.join(' | '));
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})().catch(e => { console.log('TESTET AVBRÖTS:', e.message.split('\n')[0]); process.exit(1); });
