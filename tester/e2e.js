const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

// ---------- Testserver: simulerad Supabase -> riktig PostgreSQL ----------
const PG = ['-h', '/tmp/pg', '-p', '5433', '-U', 'postgres', '-d', 'lias', '-tA', '-q', '-v', 'ON_ERROR_STOP=1'];
function sql(sub, query, vars = {}) {
  const args = [...PG];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  const role = sub ? 'authenticated' : 'anon';
  if (sub && !/^[0-9a-f-]{36}$/.test(sub)) throw new Error('ogiltig sub');
  const input = `set role ${role};\nset request.jwt.claim.sub = '${sub || ''}';\n${query}\n`;
  try { return { out: execFileSync('psql', args, { input, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim() }; }
  catch (e) { const m = e.stderr.toString().match(/ERROR:\s+(.*)/); return { err: m ? m[1] : e.stderr.toString() }; }
}
const admin = q => execFileSync('psql', PG, { input: q }).toString().trim();
const USERS = { 'lia@test.se': 'hemligt123', 'annan@test.se': 'annan123' };
const pgArr = a => '{' + a.map(x => '"' + String(x).replace(/["\\]/g, '') + '"').join(',') + '}';

function handle(path, body) {
  const t = body.token || '';
  if (path === 'login') {
    if (USERS[body.email] !== body.password) return { error: { message: 'Invalid login credentials' } };
    const id = admin(`select id from auth.users where email = '${body.email.replace(/'/g, '')}'`);
    return { session: { access_token: id, user: { id, email: body.email } } };
  }
  if (path === 'rpc/create_booking') {
    const p = body.params;
    const r = sql(t, `select create_booking(:'ids'::text[], :'st'::timestamptz, :'n', :'ph', :'em')::text;`,
      { ids: pgArr(p.p_service_ids || []), st: p.p_starts_at, n: p.p_name, ph: p.p_phone, em: p.p_email });
    return r.err ? { data: null, error: { message: r.err } } : { data: JSON.parse(r.out), error: null };
  }
  if (path === 'rpc/get_busy') {
    const r = sql(t, `select coalesce(json_agg(x), '[]')::text from get_busy(:'f'::timestamptz, :'to'::timestamptz) x;`, { f: body.params.p_from, to: body.params.p_to });
    return r.err ? { data: null, error: { message: r.err } } : { data: JSON.parse(r.out), error: null };
  }
  if (path === 'rpc/is_admin') {
    const r = sql(t, `select is_admin();`);
    return r.err ? { data: null, error: { message: r.err } } : { data: r.out === 't', error: null };
  }
  if (path === 'table') {
    const cols = { status: 1, ends_at: 1, id: 1, starts_at: 1 };
    const vars = {}; const where = [];
    body.filters.forEach(([c, op, v], i) => { if (!cols[c]) throw new Error('kolumn'); vars['f' + i] = v; where.push(`${c} ${op === 'eq' ? '=' : '>='} :'f${i}'`); });
    if (body.op === 'update') {
      vars.v = body.values.status;
      const r = sql(t, `update bookings set status = :'v' where ${where.join(' and ')};`, vars);
      return { data: null, error: r.err ? { message: r.err } : null };
    }
    const ord = body.order ? `order by ${cols[body.order[0]] ? body.order[0] : 'starts_at'} ${body.order[1] === 'desc' ? 'desc' : 'asc'}` : '';
    const r = sql(t, `select coalesce(json_agg(b ${ord}), '[]')::text from bookings b where ${where.join(' and ') || 'true'};`, vars);
    return r.err ? { data: null, error: { message: r.err } } : { data: JSON.parse(r.out), error: null };
  }
  if (path === 'realtime') {
    const r = sql(t, `select json_build_object('now', now(), 'rows', coalesce((select json_agg(b) from bookings b where :'s' <> '' and b.created_at > nullif(:'s', '')::timestamptz), '[]'))::text;`, { s: body.since || '' });
    return r.err ? { now: null, rows: [], error: r.err } : JSON.parse(r.out);
  }
  return { error: { message: 'okänd väg ' + path } };
}

// ---------- Sidan, serverad över https som på GitHub Pages ----------
const page = fs.readFileSync('/tmp/t/run.html', 'utf8')
  .replace("'KLISTRA_IN_PROJECT_URL'", "'https://mock.supabase.co'")
  .replace("'KLISTRA_IN_ANON_PUBLIC_KEY'", "'" + 'x'.repeat(40) + "'");
const shim = fs.readFileSync('/tmp/t/react-shim.js', 'utf8');
const app = fs.readFileSync('/tmp/t/app.js', 'utf8')
  .replace(/["']KLISTRA_IN_PROJECT_URL["']/, '"https://mock.supabase.co"')
  .replace(/["']KLISTRA_IN_ANON_PUBLIC_KEY["']/, '"' + 'x'.repeat(40) + '"');
if (app.includes('KLISTRA_IN')) throw new Error('testvärden kunde inte sättas');
const mock = fs.readFileSync('/tmp/t/mock-supabase.js', 'utf8');
const requests = [];

async function newCtx(browser, tz) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 800 }, timezoneId: tz || 'Europe/Stockholm' });
  await ctx.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('https://mock.supabase.co/api/')) {
      const path = u.slice('https://mock.supabase.co/api/'.length);
      const body = JSON.parse(r.request().postData() || '{}');
      requests.push(path);
      let res; try { res = handle(path, body); } catch (e) { res = { error: { message: String(e) } }; }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
    }
    if (u === 'https://lias.test/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (u.endsWith('/react-shim.js')) return r.fulfill({ contentType: 'application/javascript', body: shim });
    if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if (u.endsWith('/app.js')) return r.fulfill({ contentType: 'application/javascript', body: app });
    if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    return r.abort();
  });
  await ctx.addInitScript(() => {
    window.__notifs = []; window.__chimes = 0;
    const N = function (title, opts) { window.__notifs.push({ title, body: opts && opts.body }); };
    N.permission = 'granted'; N.requestPermission = async () => 'granted';
    window.Notification = N;
    const AC = window.AudioContext;
    if (AC) { const orig = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__chimes++; return orig.call(this); }; }
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) p.errs.push(x.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('https://lias.test/'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => getComputedStyle(x).overflowY === 'auto'); d.scrollTop = 99999; d.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(150); await p.click('text=Jag förstår och accepterar'); await p.waitForTimeout(200);
  return p;
}
module.exports = { newCtx, admin, requests };
