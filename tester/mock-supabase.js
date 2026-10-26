// Simulerad supabase-js v2 (samma anropsform som appen använder). Allt går till testservern -> riktig PostgreSQL.
(function () {
  const API = 'https://mock.supabase.co/api/';
  const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const getSession = () => { try { return JSON.parse(localStorage.getItem('mock-session')); } catch (e) { return null; } };
  const token = () => { const s = getSession(); return s ? s.user.id : ''; };
  function builder(table) {
    const q = { table, filters: [], order: null, op: 'select', values: null };
    const b = {
      select() { q.op = q.op === 'update' ? 'update' : 'select'; return b; },
      update(v) { q.op = 'update'; q.values = v; return b; },
      eq(c, v) { q.filters.push([c, 'eq', v]); return b; },
      gte(c, v) { q.filters.push([c, 'gte', v]); return b; },
      order(c, o) { q.order = [c, o && o.ascending === false ? 'desc' : 'asc']; return b; },
      then(res, rej) { return post('table', { ...q, token: token() }).then(res, rej); },
    };
    return b;
  }
  window.supabase = {
    createClient(url, key) {
      const channels = [];
      return {
        rpc: (fn, params) => post('rpc/' + fn, { params: params || {}, token: token() }),
        from: builder,
        auth: {
          getSession: async () => ({ data: { session: getSession() }, error: null }),
          signInWithPassword: async ({ email, password }) => {
            const r = await post('login', { email, password });
            if (r.error) return { data: { session: null }, error: r.error };
            localStorage.setItem('mock-session', JSON.stringify(r.session));
            return { data: { session: r.session }, error: null };
          },
          signOut: async () => { localStorage.removeItem('mock-session'); return { error: null }; },
        },
        channel(name) {
          const ch = { cbs: [], timer: null, since: null };
          ch.on = (type, filter, cb) => { ch.cbs.push(cb); return ch; };
          ch.subscribe = statusCb => {
            const tick = async () => {
              const r = await post('realtime', { since: ch.since, token: token() });
              if (ch.since === null) { ch.since = r.now; statusCb && statusCb('SUBSCRIBED'); return; }
              ch.since = r.now;
              (r.rows || []).forEach(row => ch.cbs.forEach(cb => cb({ eventType: 'INSERT', new: row })));
            };
            tick(); ch.timer = setInterval(tick, 700);
            return ch;
          };
          channels.push(ch); return ch;
        },
        removeChannel(ch) { clearInterval(ch.timer); },
      };
    },
  };
})();
