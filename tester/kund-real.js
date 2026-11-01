// 1 nov 2026 (del B): kundens länk i RIKTIGT läge – appen mot den riktiga databasen (PostgreSQL med supabase-setup.sql).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { newCtx, admin } = require('/tmp/t/e2e.js');
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FEL  ') + l + (x !== undefined ? '  ->  ' + x : '')); };
const clean = () => admin(`delete from uteblivna where customer_phone like '070555%'; delete from bookings where customer_phone like '070555%';`);
(async () => {
  clean();
  admin(`delete from bookings where status = 'bokad' and starts_at between now() and now() + interval '30 days';`);   // ren kalender för testet
  const browser = await chromium.launch();
  const p = await newCtx(browser);
  const txt = sel => p.$eval(sel, e => e.innerText.replace(/\n+/g, ' | ')).catch(() => null);
  const yes = async () => { await p.waitForSelector('[data-confirm]', { timeout: 3000 }); const t = await txt('[data-confirm]'); await p.click('[data-confirm] .lh-ask__btns button:has-text("Ja,")'); await p.waitForTimeout(1200); return t; };
  const open = async tok => { await p.evaluate(t => { location.hash = 'bekrafta=' + t; }, tok); await p.waitForSelector('[data-bekraftelse]', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300); };
  // Bokning som kunden gör i appen (via create_booking), om ca 1–2 veckor, tisdag 10:00
  admin(`set role anon; select create_booking('[{"category":"Klippning","service_ids":["klipp-45"]}]'::jsonb, ((date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '15 days 10 hours') at time zone 'Europe/Stockholm'), 'Rea Real', '0705550001', 'rea@t.se', '2026-11-01-v2');`);
  const tok = admin(`select confirm_token from bookings where customer_phone = '0705550001'`);
  ok(/^[0-9a-f-]{36}$/.test(tok), 'create_booking ger bokningen en länk-token', tok);
  await open(tok);
  const v = await txt('[data-bekraftelse]');
  ok(v && v.startsWith('Tack! Din tid är bekräftad') && v.includes('Behöver du ändra?') && v.includes('Avboka eller boka om utan avgift senast'), 'Riktigt läge: länken bekräftar och visar Ändra', v);
  ok(admin(`select (confirmed_at is not null)::text from bookings where confirm_token = '${tok}'`) === 'true', 'Databasen: confirmed_at sparat');
  // Boka om till första lediga tiden
  await p.click('[data-kund-omboka]'); await p.waitForTimeout(300);
  await (await p.$$('.lh-day'))[0].click(); await p.waitForTimeout(1200);
  const times = await p.$$eval('.lh-time', ts => ts.map(x => x.innerText.trim()));
  ok(times.length > 0, 'Lediga tider hämtas från databasen', times.slice(0, 5).join(' '));
  const chosen = times[times.length - 1];
  await p.click(`.lh-time:text-is("${chosen}")`); await p.check('#omboka-regler'); await p.click(`button:has-text("Boka om till ${chosen}")`);
  await yes();
  const r = await txt('[data-kund-resultat]');
  ok(r && r.startsWith('Din tid är ombokad'), 'Ombokad i riktiga läget', r);
  const rows = admin(`select string_agg(status||' '||coalesce(cancelled_by,'-')||' '||(confirmed_at is not null)::text||' '||to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI'), ', ' order by created_at, starts_at) from bookings where customer_phone = '0705550001'`);
  ok(new RegExp('^avbokad kund true 10:00, bokad - true ' + chosen + '$').test(rows), 'Databasen: gamla avbokad av kund, nya bokad och bekräftad', rows);
  ok(admin(`select count(*) from uteblivna where customer_phone = '0705550001'`) === '0', 'Ingen registrering i god tid');
  // Visa nya bokningen och avboka den
  await p.click('[data-visa-ny]'); await p.waitForTimeout(1500);
  ok((await txt('[data-bekraftelse]') || '').startsWith('Din tid är redan bekräftad'), 'Nya länken fungerar (redan bekräftad)');
  await p.click('[data-kund-avboka]'); await yes();
  ok((await txt('[data-kund-resultat]') || '').startsWith('Din tid är avbokad'), 'Avbokad i riktiga läget');
  ok(admin(`select count(*) from bookings where customer_phone = '0705550001' and status = 'avbokad' and cancelled_by = 'kund'`) === '2', 'Databasen: båda avbokade av kund');
  // Sen avbokning: tid om 2 timmar (inlagd direkt)
  admin(`insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, rules_version, confirm_token) values ('{klipp-30}', 'Klippning/Herrklippning 30 min', 500, date_trunc('minute', now() + interval '2 hours'), date_trunc('minute', now() + interval '2 hours 30 minutes'), 'Sen Real', '0705550002', 's@t.se', 'bokad', '2026-11-01-v2', '00000000-0000-4000-8000-00000000aa01')`);
  await open('00000000-0000-4000-8000-00000000aa01');
  const w = await txt('[data-sen-varning]');
  ok(w && w.startsWith('Sista avbokningstiden har passerat') && w.includes('(24 timmar före)') && w.includes('hela priset för bokningen, 500 kr.'), 'Sent: varningen visas med pris från databasen', w);
  await p.click('[data-kund-avboka]'); const q = await yes();
  ok(q && q.includes('Avbokningen räknas som sen avbokning'), 'Frågan nämner sen avbokning');
  ok((await txt('[data-kund-resultat]') || '').includes('räknas därför som en sen avbokning'), 'Resultat: räknas som sen avbokning');
  const u = admin(`select kind||' '||nummer||' '||belopp||' '||status from uteblivna where customer_phone = '0705550002'`);
  ok(u === 'sen_avbokning 1 0 ingen_avgift', 'Databasen: sen avbokning registrerad för Lia (1:a gången)', u);
  // Fel länk
  await open('00000000-0000-4000-8000-00000000ffff');
  ok((await txt('[data-bekraftelse]') || '').includes('Länken fungerar inte'), 'Okänd länk: tydligt fel', await txt('[data-bekraftelse]'));
  ok(p.errs.length === 0, 'Inga fel i konsolen', p.errs.join(' | '));
  clean();
  console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);
  await browser.close();
})();
